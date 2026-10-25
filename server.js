// Sculpt & Spin — game server.
// Serves the host (TV) screen and the phone controller, and runs the real-time game over Socket.IO.
//
//   HTTP  :3000  → open http://localhost:3000/host on the laptop driving the big screen
//   HTTPS :3443  → phones join here (motion sensors require a secure origin on phones)

require('./lib/env').loadEnv(); // read API keys from .env before anything else

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const selfsigned = require('selfsigned');
const { Room, POWERS } = require('./lib/game');
const { packList } = require('./lib/words');
const ai = require('./lib/ai');

const HTTP_PORT = Number(process.env.PORT) || 3000;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
const PUBLIC_URL = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/$/, '') : null;

function lanAddresses() {
  // Virtual adapters (VMware, VirtualBox, WSL/Hyper-V, Docker, VPNs) aren't reachable from phones.
  const VIRTUAL = /vmware|vmnet|virtualbox|vbox|vethernet|wsl|hyper-v|docker|br-|veth|loopback|tailscale|zerotier|utun|tun|tap/i;
  const REAL = /wi-?fi|wlan|wireless|^en\d|^eth\d|ethernet/i;
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      const virtual = VIRTUAL.test(name);
      out.push({ ip: a.address, rank: virtual ? 2 : REAL.test(name) ? 0 : 1 });
    }
  }
  return out.sort((a, b) => a.rank - b.rank).map((x) => x.ip);
}

async function loadCert(ips) {
  const dir = path.join(__dirname, '.certs');
  const meta = path.join(dir, 'meta.json');
  const want = JSON.stringify(['localhost', '127.0.0.1', ...ips].sort());
  try {
    if (fs.readFileSync(meta, 'utf8') === want) {
      return { key: fs.readFileSync(path.join(dir, 'key.pem')), cert: fs.readFileSync(path.join(dir, 'cert.pem')) };
    }
  } catch {}
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    ...ips.map((ip) => ({ type: 7, ip })),
  ];
  const notAfterDate = new Date();
  notAfterDate.setFullYear(notAfterDate.getFullYear() + 1);
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'sculpt-and-spin.local' }], {
    keySize: 2048,
    notAfterDate,
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames },
    ],
  });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'key.pem'), pems.private);
  fs.writeFileSync(path.join(dir, 'cert.pem'), pems.cert);
  fs.writeFileSync(meta, want);
  return { key: pems.private, cert: pems.cert };
}

async function main() {
  const ips = lanAddresses();
  const lanIp = ips[0] || 'localhost';
  const phoneBase = PUBLIC_URL || `https://${lanIp}:${HTTPS_PORT}`;

  const app = express();
  const pub = path.join(__dirname, 'public');
  // Always serve the latest files (so updating the code never leaves a browser running stale JavaScript).
  const noCache = (res) => res.set('Cache-Control', 'no-cache, must-revalidate');
  app.use((req, res, next) => {
    if (!req.path.startsWith('/vendor/')) noCache(res);
    next();
  });
  app.get('/', (_req, res) => res.sendFile(path.join(pub, 'play.html')));
  app.get('/host', (_req, res) => res.sendFile(path.join(pub, 'host.html')));
  app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build')));
  app.use('/vendor/gifenc', express.static(path.join(__dirname, 'node_modules/gifenc/dist')));
  app.get('/api/packs', (_req, res) => res.json({
    packs: packList(),
    powers: POWERS,
    ai: { gemini: ai.geminiAvailable(), tts: ai.ttsAvailable(), mock: ai.MOCK, status: ai.geminiStatus() },
  }));
  app.use(express.static(pub, { etag: true, lastModified: true }));

  const httpServer = http.createServer(app);
  const io = new Server({ cors: { origin: true }, maxHttpBufferSize: 1e6, pingInterval: 10000, pingTimeout: 30000 });
  io.attach(httpServer);

  let httpsServer = null;
  try {
    httpsServer = https.createServer(await loadCert(ips), app);
    io.attach(httpsServer);
  } catch (err) {
    console.warn('⚠️  Could not start HTTPS (phones need it for motion sensors):', err.message);
  }

  // ---------- rooms ----------
  const rooms = new Map();
  const newCode = () => {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O
    let c;
    do c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
    while (rooms.has(c));
    return c;
  };
  setInterval(() => {
    const cutoff = Date.now() - 45 * 60 * 1000;
    for (const [code, room] of rooms) {
      if (!room.hostSocketId && room.connectedPlayers().length === 0 && room.lastActive < cutoff) {
        clearTimeout(room.timer);
        rooms.delete(code);
      }
    }
  }, 60 * 1000).unref();

  const ack = (cb) => (typeof cb === 'function' ? cb : () => {});
  const qrFor = (url) => QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0b0d1a', light: '#ffffff' } });
  const galleryUrlFor = (code) => `${phoneBase}/gallery/${code}`;

  // When Gemini runs out of quota (or comes back), say so on the TV instead of the AI rival silently going quiet.
  ai.onGeminiStatus((st) => {
    console.warn(`[ai] Gemini ${st.state}${st.reason ? `: ${st.reason}` : ''}`);
    for (const r of rooms.values()) {
      if (!r.settings.ai) continue;
      const text = st.state === 'ok' ? '🤖 Gemini is back in the game!'
        : st.state === 'resting' ? `😴 ${st.reason} The AI rival sits out until then.`
        : `🤖 Gemini is off: ${st.reason}`;
      r.feed({ type: 'info', text });
      r.broadcast();
    }
  });

  // ---------- ElevenLabs announcer ----------
  // The TV asks for a line of speech; only the host of a live room may use it (protects your API credits).
  app.get('/api/tts', async (req, res) => {
    const room = rooms.get(String(req.query.room || '').toUpperCase());
    if (!room || req.query.token !== room.hostToken) return res.status(403).end();
    if (!ai.ttsAvailable()) return res.status(503).end();
    try {
      const buf = await ai.tts(String(req.query.text || '').slice(0, 300));
      res.set('Content-Type', 'audio/mpeg');
      res.set('Cache-Control', 'private, max-age=3600');
      res.send(buf);
    } catch (err) {
      console.warn('[tts]', err.message);
      res.status(502).end();
    }
  });

  // ---------- GIF gallery ----------
  // The host browser renders each sculpture to a GIF and uploads it here, so phones can take them home.
  app.post('/api/gif/:code/:index', express.raw({ type: 'image/gif', limit: '12mb' }), (req, res) => {
    const room = rooms.get(String(req.params.code).toUpperCase());
    const index = Number(req.params.index);
    if (!room || req.get('x-host-token') !== room.hostToken) return res.status(403).end();
    if (!Number.isInteger(index) || !room.gallery[index] || !Buffer.isBuffer(req.body) || req.body.length < 10) return res.status(400).end();
    if (req.body.subarray(0, 3).toString() !== 'GIF') return res.status(400).end();
    room.gifs.set(index, req.body);
    const url = `/gif/${room.code}/${index}.gif`;
    io.to(room.channel).emit('gif:ready', { index, url });
    res.json({ ok: true, url });
  });
  app.get('/gif/:code/:file', (req, res) => {
    const room = rooms.get(String(req.params.code).toUpperCase());
    const index = Number(String(req.params.file).replace(/\.gif$/, ''));
    const buf = room && room.gifs.get(index);
    if (!buf) return res.status(404).send('Not ready yet');
    const entry = room.gallery[index];
    const name = `sculpt-and-spin-${String(entry?.word || 'sculpture').replace(/[^a-z0-9]+/gi, '-')}.gif`;
    res.set('Content-Type', 'image/gif');
    if ('download' in req.query) res.set('Content-Disposition', `attachment; filename="${name}"`);
    res.send(buf);
  });
  app.get('/gallery/:code', (req, res) => {
    const room = rooms.get(String(req.params.code).toUpperCase());
    if (!room) return res.status(404).send('This game has ended.');
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const cards = room.gallery.map((g, i) => {
      const ready = room.gifs.has(i);
      return `<figure>${ready ? `<img src="/gif/${room.code}/${i}.gif" alt="${esc(g.word)}">` : '<div class="wait">Rendering…</div>'}
        <figcaption><b>${esc(g.word)}</b><span>by ${esc(g.drawerName)}${g.winnerName ? ` · guessed by ${esc(g.winnerName)}` : ''}</span>
        ${ready ? `<a href="/gif/${room.code}/${i}.gif?download">Download GIF</a>` : ''}</figcaption></figure>`;
    }).join('');
    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Sculpt & Spin gallery · ${room.code}</title>
      <style>body{margin:0;background:#0b0d1a;color:#eef0ff;font-family:system-ui,sans-serif;padding:20px}
      h1{font-size:1.6rem;margin:0 0 4px}p{color:#9aa0c8;margin:0 0 18px}
      .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
      figure{margin:0;background:#13162b;border:1px solid rgba(160,172,255,.16);border-radius:16px;overflow:hidden}
      img,.wait{width:100%;aspect-ratio:1;display:block;object-fit:cover}.wait{display:grid;place-items:center;color:#9aa0c8}
      figcaption{padding:10px 12px;display:flex;flex-direction:column;gap:4px}b{text-transform:capitalize;font-size:1.1rem}
      span{color:#9aa0c8;font-size:.9rem}a{color:#c6ff3d;font-weight:700;text-decoration:none;margin-top:4px}</style>
      ${room.gallery.length > room.gifs.size ? '<meta http-equiv="refresh" content="4">' : ''}</head>
      <body><h1>🎨 Sculpt &amp; Spin gallery</h1><p>Room ${room.code} · ${room.gallery.length} sculptures · long-press a GIF to save or share it</p>
      <div class="grid">${cards || '<p>No sculptures yet.</p>'}</div></body></html>`);
  });

  io.on('connection', (socket) => {
    let room = null;
    let playerId = null;
    let isHost = false;

    const attachHost = (r) => {
      room = r;
      isHost = true;
      r.hostSocketId = socket.id;
      socket.join(r.channel);
      socket.emit('state', r.snapshot());
      socket.emit('stroke:sync', r.strokes);
      if (r.phase === 'podium') socket.emit('gallery', r.galleryPayload());
    };

    socket.on('host:create', async (data = {}, cb) => {
      const code = newCode();
      const joinUrl = `${phoneBase}/?room=${code}`;
      const r = new Room(io, code, joinUrl);
      r.applySettings(data.settings || {});
      rooms.set(code, r);
      attachHost(r);
      const [qr, galleryQr] = await Promise.all([qrFor(joinUrl), qrFor(galleryUrlFor(code))]);
      ack(cb)({ ok: true, code, hostToken: r.hostToken, joinUrl, qr, galleryUrl: galleryUrlFor(code), galleryQr, httpsReady: !!httpsServer });
      r.broadcast();
    });

    socket.on('host:close', () => {
      if (!room || !isHost) return;
      clearTimeout(room.timer);
      (room.hintTimers || []).forEach(clearTimeout);
      io.to(room.channel).emit('room:closed');
      io.in(room.channel).socketsLeave(room.channel);
      rooms.delete(room.code);
      room = null;
      isHost = false;
    });

    socket.on('host:resume', async ({ code, hostToken } = {}, cb) => {
      const r = rooms.get(String(code || '').toUpperCase());
      if (!r || r.hostToken !== hostToken) return ack(cb)({ ok: false });
      attachHost(r);
      const [qr, galleryQr] = await Promise.all([qrFor(r.joinUrl), qrFor(galleryUrlFor(r.code))]);
      ack(cb)({ ok: true, code: r.code, hostToken: r.hostToken, joinUrl: r.joinUrl, qr, galleryUrl: galleryUrlFor(r.code), galleryQr, httpsReady: !!httpsServer });
      r.broadcast();
    });

    socket.on('player:join', ({ code, name, playerId: pid } = {}, cb) => {
      const r = rooms.get(String(code || '').trim().toUpperCase());
      if (!r) return ack(cb)({ ok: false, error: 'No game with that code. Check the TV screen.' });
      const res = r.addPlayer(socket, { name, playerId: pid });
      if (res.error) return ack(cb)({ ok: false, error: res.error });
      room = r;
      playerId = res.player.id;
      socket.join(r.channel);
      ack(cb)({ ok: true, playerId, name: res.player.name, color: res.player.color, code: r.code });
      socket.emit('stroke:sync', r.strokes);
      if (r.phase === 'podium') socket.emit('gallery', r.galleryPayload());
      if (!res.rejoined) r.feed({ type: 'join', playerId, text: `${res.player.name} joined` });
      r.broadcast();
    });

    const canControl = () => room && (isHost || (playerId && room.isVip(playerId)));

    socket.on('game:start', (settings = {}, cb) => {
      if (!canControl()) return ack(cb)({ ok: false, error: 'Only the host or first player can start.' });
      ack(cb)(room.start(settings));
    });
    socket.on('game:settings', (settings = {}) => {
      if (!canControl() || room.phase !== 'lobby') return;
      room.applySettings(settings);
      room.broadcast();
    });
    socket.on('game:skip', () => canControl() && !room.paused && room.skipTurn());
    socket.on('game:pause', () => isHost && room && room.pause());
    socket.on('game:resume', () => isHost && room && room.resume());
    socket.on('game:restart', (_d, cb) => {
      if (!isHost || !room) return ack(cb)({ ok: false });
      ack(cb)(room.restart());
    });
    socket.on('player:kick', ({ playerId: pid } = {}) => {
      // The TV host, or the party leader (first player) from their phone, can remove others in the lobby.
      if (!room || !(isHost || (playerId && room.isVip(playerId) && pid !== playerId))) return;
      const p = room.kick(pid);
      if (p && p.socketId) {
        const s = io.sockets.sockets.get(p.socketId);
        if (s) {
          s.emit('kicked');
          s.leave(room.channel);
        }
      }
    });
    socket.on('game:lobby', () => canControl() && room.backToLobby());

    socket.on('draw:pick', ({ index } = {}) => room && playerId && room.pickWord(playerId, Number(index) || 0));

    socket.on('draw:start', (data = {}) => {
      if (!room || !playerId) return;
      const s = room.strokeStart(playerId, data);
      if (s) socket.to(room.channel).emit('stroke:start', s);
    });
    socket.on('draw:points', (data = {}) => {
      if (!room || !playerId) return;
      const pts = room.strokePoints(playerId, data);
      if (pts) socket.to(room.channel).emit('stroke:points', { id: data.id, pts });
    });
    socket.on('draw:undo', () => {
      if (!room || !playerId) return;
      const sid = room.undo(playerId);
      if (sid) io.to(room.channel).emit('stroke:undo', { id: sid });
    });
    socket.on('draw:clear', () => {
      if (room && playerId && room.clear(playerId)) io.to(room.channel).emit('stroke:clear');
    });
    socket.on('draw:cursor', (data = {}) => {
      if (!room || !playerId || !room.canDraw(playerId)) return;
      const p = Array.isArray(data.p) && data.p.length === 3 && data.p.every(Number.isFinite) ? data.p : null;
      if (p) socket.to(room.channel).emit('cursor', { p, drawing: !!data.drawing, color: String(data.color || '').slice(0, 7) });
    });

    socket.on('guess', ({ text } = {}, cb) => {
      if (!room || !playerId) return ack(cb)({ result: 'error' });
      ack(cb)(room.submitGuess(playerId, String(text || '').slice(0, 60)));
    });
    socket.on('power:use', (data = {}, cb) => {
      if (!room || !playerId) return ack(cb)({ ok: false });
      ack(cb)(room.usePower(playerId, data));
    });
    socket.on('orb:grab', ({ id: orbId } = {}, cb) => {
      if (!room || !playerId) return ack(cb)({ ok: false });
      ack(cb)(room.grabOrb(playerId, orbId));
    });

    // The TV sends snapshots of the sculpture for the Gemini rival and the critic.
    socket.on('ai:snapshot', ({ image } = {}) => {
      if (isHost && room && typeof image === 'string' && image.length < 900000) room.aiSnapshot(image);
    });
    socket.on('ai:critic', ({ image } = {}) => {
      if (isHost && room && typeof image === 'string' && image.length < 900000) room.aiCritic(image);
    });

    socket.on('buzz', () => {
      // A shake: purely cosmetic, lets the TV show who is about to guess.
      if (room && playerId && room.phase === 'draw' && playerId !== room.drawerId) {
        io.to(room.channel).emit('buzz', { playerId });
      }
    });

    socket.on('disconnect', (reason) => {
      if (process.env.DEBUG) console.log('disconnect', socket.id, reason);
      if (room) room.dropSocket(socket.id);
    });
  });

  httpServer.listen(HTTP_PORT, () => {
    const line = '─'.repeat(58);
    console.log(`\n${line}\n  🎨  SCULPT & SPIN is running\n${line}`);
    console.log(`  Big screen (this laptop):  http://localhost:${HTTP_PORT}/host`);
    if (httpsServer) {
      httpsServer.listen(HTTPS_PORT, () => {
        console.log(`  Phones (same Wi-Fi):       ${phoneBase}`);
        if (!PUBLIC_URL) {
          console.log(`\n  Phones will warn about the self-signed certificate the`);
          console.log(`  first time — tap "Advanced" → "Proceed" / "Visit website".`);
        }
        if (ips.length > 1 && !PUBLIC_URL) console.log(`  Other LAN addresses: ${ips.slice(1).join(', ')}`);
        const aiUse = `${ai.GUESSES_PER_TURN} guesses${ai.CRITIC ? ' + 1 review' : ''} per turn`;
        console.log(`\n  🤖 Gemini AI rival:   ${ai.geminiAvailable() ? (ai.MOCK ? `MOCK mode (${aiUse})` : `on (${ai.GEMINI_MODEL}, ${aiUse})`) : 'off — add GEMINI_API_KEY to .env'}`);
        console.log(`  🎙️  ElevenLabs voice:  ${ai.ttsAvailable() ? (ai.MOCK ? 'MOCK mode' : `on (${ai.ELEVEN_MODEL})`) : 'off — add ELEVENLABS_API_KEY to .env'}`);
        console.log(`${line}\n`);
      });
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
