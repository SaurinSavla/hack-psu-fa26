// Add bot players to a room so you can test solo.
//   npm run bots -- ABCD 3      (room code, number of bots)
// Bots pick words, sculpt random shapes in 3D, and spam (wrong) guesses.

const { io } = require('socket.io-client');

const [, , codeArg, countArg] = process.argv;
const code = String(codeArg || '').toUpperCase();
const count = Math.min(10, Math.max(1, Number(countArg) || 3));
const URL = process.env.URL || `http://localhost:${process.env.PORT || 3000}`;
if (!/^[A-Z]{4}$/.test(code)) {
  console.log('Usage: npm run bots -- <ROOM CODE> [count]');
  process.exit(1);
}

const NAMES = ['Botticelli', 'Rodin', 'Banksy', 'Frida', 'Monet', 'Kusama', 'Dali', 'Basquiat', 'Hokusai', 'Warhol'];
const WRONG = ['pizza', 'a spoon?', 'snake', 'tornado', 'banana', 'ghost', 'is it a horse', 'spaghetti', 'noodle', 'bird'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);

// Shapes are lists of strokes; each stroke is a list of [x,y,z] points around z = -1.
function shape() {
  const kind = Math.floor(Math.random() * 4);
  const strokes = [];
  if (kind === 0) {
    const s = [];
    for (let i = 0; i <= 120; i++) { const t = i / 120, a = t * Math.PI * 8; s.push([Math.cos(a) * 0.4, -0.6 + t * 1.2, -1 + Math.sin(a) * 0.4]); }
    strokes.push(s);
  } else if (kind === 1) {
    const s = [];
    for (let i = 0; i <= 10; i++) { const a = Math.PI / 2 + (i * Math.PI * 4) / 5; s.push([Math.cos(a) * 0.5, Math.sin(a) * 0.5, -1 + (i % 2) * 0.2]); }
    strokes.push(s);
  } else if (kind === 2) {
    const s = [];
    for (let i = 0; i <= 80; i++) {
      const t = (i / 80) * Math.PI * 2;
      s.push([0.03 * 16 * Math.sin(t) ** 3, 0.03 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)), -1]);
    }
    strokes.push(s);
  } else {
    // A little house in 3D: box edges + roof.
    const P = (x, y, z) => [x * 0.4, y * 0.4 - 0.2, -1 + z * 0.4];
    strokes.push([P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1), P(-1, -1, -1)]);
    strokes.push([P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), P(-1, -1, 1)]);
    strokes.push([P(-1, 1, -1), P(0, 1.8, 0), P(1, 1, -1)]);
    strokes.push([P(-1, 1, 1), P(0, 1.8, 0), P(1, 1, 1)]);
  }
  // Densify straight segments so tubes look smooth.
  return strokes.map((s) => {
    const out = [];
    for (let i = 0; i < s.length - 1; i++) {
      for (let k = 0; k < 8; k++) {
        const t = k / 8;
        out.push(s[i].map((v, j) => v + (s[i + 1][j] - v) * t));
      }
    }
    out.push(s[s.length - 1]);
    return out;
  });
}

async function sculpt(sock, turnKey, bot) {
  const colors = ['#ff5d73', '#3de0ff', '#c6ff3d', '#ffb53d', '#a77bff'];
  for (const [i, s] of shape().entries()) {
    if (bot.turnKey !== turnKey) return;
    const id = `${bot.name.slice(0, 3)}${Date.now().toString(36)}${i}`;
    const r = (v) => Math.round(v * 1000) / 1000;
    sock.emit('draw:start', { id, color: colors[i % colors.length], width: 0.022, p: s[0].map(r) });
    for (let k = 1; k < s.length; k += 4) {
      if (bot.turnKey !== turnKey) return;
      const chunk = s.slice(k, k + 4).flat().map(r);
      sock.emit('draw:points', { id, pts: chunk });
      sock.emit('draw:cursor', { p: s[Math.min(k + 3, s.length - 1)].map(r), drawing: true, color: colors[i % colors.length] });
      await wait(60);
    }
    await wait(300);
  }
}

for (let n = 0; n < count; n++) {
  const bot = { name: NAMES[n % NAMES.length], id: null, token: null, turnKey: null, powers: [], state: null };
  const sock = io(URL, { transports: ['websocket'] });
  sock.on('connect', async () => {
    const res = await sock.emitWithAck('player:join', { code, name: bot.name, playerId: bot.id, token: bot.token });
    if (!res.ok) return console.log(`${bot.name}: ${res.error}`);
    bot.id = res.playerId;
    bot.token = res.token;
    console.log(`🤖 ${res.name} joined ${code}`);
  });
  sock.on('private', (p) => (bot.powers = p.powers || []));
  sock.on('orb', async ({ id }) => {
    if (!bot.state || bot.state.drawerId === bot.id || Math.random() < 0.4) return;
    await wait(rnd(400, 2500));
    sock.emit('orb:grab', { id }, () => {});
  });
  sock.on('state', async (s) => {
    bot.state = s;
    const key = `${s.phase}:${s.turnNumber}:${s.round}`;
    if (key === bot.turnKey) return;
    bot.turnKey = key;
    if (s.drawerId === bot.id && s.phase === 'choose') {
      await wait(rnd(1500, 3500));
      sock.emit('draw:pick', { index: Math.floor(Math.random() * 3) });
    } else if (s.drawerId === bot.id && s.phase === 'draw') {
      await wait(800);
      sculpt(sock, key, bot);
    } else if (s.phase === 'draw') {
      for (let g = 0; g < 3; g++) {
        await wait(rnd(6000, 15000));
        if (bot.turnKey !== key) return;
        sock.emit('buzz');
        await wait(700);
        sock.emit('guess', { text: WRONG[Math.floor(Math.random() * WRONG.length)] }, () => {});
        // Sometimes sabotage a random rival.
        if (bot.powers.length && Math.random() < 0.6) {
          const type = bot.powers[0];
          const rivals = bot.state.players.filter((p) => p.connected && p.id !== bot.id && p.id !== bot.state.drawerId);
          const target = rivals[Math.floor(Math.random() * rivals.length)];
          if (target || type === 'hint' || type === 'shield') sock.emit('power:use', { type, targetId: target?.id }, () => {});
        }
      }
    }
  });
}
