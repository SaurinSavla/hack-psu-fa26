// Host (TV / laptop) screen: title menu → lobby with QR → game → podium + GIF gallery.

import { Sculpture } from './scene.js';
import { $, esc, avatar, renderMask, pips, PhaseClock, setTimer, demoStrokes } from './common.js';
import { sfx, unlockAudio, setMuted } from './sfx.js';
import { sculptureGif } from './gif.js';
import { confetti } from './confetti.js';
import { Announcer } from './announcer.js';

const socket = io({ transports: ['websocket', 'polling'] });
const scene = new Sculpture($('#scene'), { mode: 'spin' });
const clock = new PhaseClock();
scene.setProgressSource(() => clock.progress());

let state = null; // null while on the title menu
let room = null; // { code, hostToken, joinUrl, galleryUrl, ... }
let prevPhase = null;
let prevPlayerIds = new Set();
let gallery = [];
let galleryTimer = null;
let galleryIdx = 0;
let lastTick = -1;
let packs = [];
let powers = {};
const gifUrls = new Map();
const gifJobs = new Set();

// ---------- settings (remembered on this laptop) ----------

const DEFAULTS = { rounds: 2, drawTime: 60, packs: ['classic'], custom: '', powerups: true, sound: true, ai: true, announcer: true };
const TIMES = [30, 60, 90, 180];
let settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('sns-settings') || '{}') };
if (!TIMES.includes(settings.drawTime)) settings.drawTime = 60; // older saved values
const saveSettings = () => localStorage.setItem('sns-settings', JSON.stringify(settings));
const serverSettings = () => ({ rounds: settings.rounds, drawTime: settings.drawTime, packs: settings.packs, custom: settings.custom, powerups: settings.powerups, ai: settings.ai });
setMuted(!settings.sound);

// ---------- AI: Gemini rival + ElevenLabs announcer ----------
let aiMeta = { gemini: false, tts: false };
const announcer = new Announcer(() => (room ? { room: room.code, token: room.hostToken } : null));
announcer.enabled = settings.announcer;
const LINES = {
  welcome: 'Welcome to Sculpt and Spin! Phones up, sculptors!',
  countdown: 'Three! Two! One! Sculpt!',
  orb: 'Power orb! Grab it!',
  paused: 'Game paused.',
  resumed: "And we're back!",
};
const say = (text, opts) => announcer.say(text, opts);

fetch('/api/packs').then((r) => r.json()).then((d) => {
  packs = d.packs;
  powers = d.powers;
  aiMeta = d.ai || aiMeta;
  announcer.useEleven = !!aiMeta.tts;
  renderSettings();
});

// ---------- screens ----------

function showScreen(name) {
  $('#menu').classList.toggle('hidden', name !== 'menu');
  $('#lobby').classList.toggle('hidden', name !== 'lobby');
  $('#game').classList.toggle('hidden', name !== 'game');
}

function goMenu() {
  $('#pGameMenu').classList.add('hidden');
  state = null;
  room = null;
  prevPhase = null;
  clearInterval(galleryTimer);
  galleryTimer = null;
  showScreen('menu');
  scene.setMode('spin');
  scene.setFraming(0.72, 0.5, 1.1);
  scene.playback(demoStrokes(), 5000);
}

function openPanel(id) {
  if (id === 'pSettings') renderSettings();
  $(`#${id}`).classList.remove('hidden');
}
function closePanels() {
  ['pHowto', 'pSettings'].forEach((id) => $(`#${id}`).classList.add('hidden'));
}
document.querySelectorAll('#pHowto, #pSettings').forEach((p) => {
  p.addEventListener('click', (e) => {
    if (e.target === p || e.target.closest('[data-close]')) closePanels();
  });
});

// ---------- connection ----------

function useRoom(res) {
  if (!res || !res.ok) return false;
  room = res;
  sessionStorage.setItem('sns-host', JSON.stringify({ code: res.code, hostToken: res.hostToken }));
  $('#code').textContent = res.code;
  $('#joinUrl').textContent = res.joinUrl;
  $('#qr').src = res.qr;
  $('#galleryQr').src = res.galleryQr;
  if (!res.httpsReady) banner('HTTPS is not running — phones may not be able to use motion sensors.');
  announcer.preload(Object.values(LINES));
  return true;
}

async function createRoom() {
  unlockAudio();
  closePanels();
  gifUrls.clear();
  gifJobs.clear();
  useRoom(await socket.emitWithAck('host:create', { settings: serverSettings() }));
}

socket.on('connect', async () => {
  hideBanner();
  // After a page reload, jump back into the room we were hosting.
  const saved = JSON.parse(sessionStorage.getItem('sns-host') || 'null');
  if (saved && (await socket.emitWithAck('host:resume', saved).then(useRoom))) return;
  sessionStorage.removeItem('sns-host');
  if (!room) goMenu();
});
socket.on('disconnect', () => banner('Lost connection to the server — reconnecting…'));

function leaveRoom() {
  const playing = state && state.players.some((p) => p.connected);
  if (playing && !confirm('Close this room? Everyone will be disconnected.')) return;
  socket.emit('host:close');
  sessionStorage.removeItem('sns-host');
  goMenu();
}

// ---------- state ----------

socket.on('state', (s) => {
  if (!room) return;
  state = s;
  clock.sync(s);
  if (s.phase !== prevPhase) onPhaseChange(prevPhase, s.phase);
  prevPhase = s.phase;
  render();
});

function onPhaseChange(from, to) {
  clearInterval(galleryTimer);
  galleryTimer = null;
  $('#orbFlag').classList.add('hidden');
  if (to === 'lobby') {
    scene.setMode('spin');
    scene.clear(); // the lobby is busy enough; keep just the starfield
  } else if (to === 'choose') {
    const d = state.players.find((p) => p.id === state.drawerId);
    if (from === 'lobby') say(LINES.welcome);
    if (d) say(`${d.name}, you're up!`, { maxAgeMs: 5000 });
    scene.setFraming(0.5, 0.5, 1);
    scene.clear();
    scene.hideCursor();
    scene.setMode('reveal');
    if (from === 'lobby') {
      sfx.start();
      gifUrls.clear();
      gifJobs.clear();
    }
  } else if (to === 'draw') {
    scene.setMode('reveal');
    scene.setFraming(0.5, 0.5, 1);
    countdown();
    say(LINES.countdown, { interrupt: true, maxAgeMs: 1500 });
    planAiShots();
  } else if (to === 'reveal') {
    scene.setMode('showcase');
    scene.setFraming(0.5, 0.6, 1.1);
    scene.hideCursor();
    sfx.reveal();
    aiShots = [];
    $('#criticLine').classList.add('hidden');
    if (state.endReason !== 'guessed' && state.word) say(`Time's up! It was ${state.word}.`, { maxAgeMs: 5000 });
    // Let the showcase camera settle, then ask Gemini for a review.
    if (state.settings.ai) setTimeout(() => {
      if (state?.phase === 'reveal') socket.emit('ai:critic', { image: scene.snapshot(640) });
    }, 1300);
  } else if (to === 'podium') {
    scene.hideCursor();
    sfx.fanfare();
    closeGameMenu(false);
    const champ = [...state.players].sort((a, b) => b.score - a.score)[0];
    if (champ) say(`And the winner is... ${champ.name}! ${champ.isAI ? 'The robots win this time!' : 'Congratulations!'}`, { interrupt: true });
    confetti({ x: 0.27, y: 0.35, count: 220, spread: 1.3 });
    setTimeout(() => confetti({ x: 0.15, y: 0.5, count: 120 }), 400);
    setTimeout(() => confetti({ x: 0.4, y: 0.5, count: 120 }), 700);
  }
}

function render() {
  const s = state;
  showScreen(s.phase === 'lobby' ? 'lobby' : 'game');
  if (s.phase === 'lobby') renderLobby(s);
  else renderGame(s);
}

function packName(id) {
  const p = packs.find((x) => x.id === id);
  return p ? `${p.emoji} ${p.name}` : id;
}

function renderLobby(s) {
  const players = s.players.filter((p) => p.connected);
  const humans = players.filter((p) => !p.isAI);
  const ids = new Set(players.map((p) => p.id));
  for (const p of players) if (!prevPlayerIds.has(p.id) && prevPlayerIds.size) sfx.join();
  prevPlayerIds = ids;
  const slots = Math.max(6, Math.ceil((players.length + 1) / 3) * 3);
  $('#lobbyPlayers').innerHTML =
    players.map((p) => p.isAI
      ? `<div class="pcard ai">${avatar(p)}<span>${esc(p.name)}</span><span class="ai-tag">AI rival</span><button class="kick" data-kick="${p.id}" title="Turn off the AI rival">✕</button></div>`
      : `<div class="pcard">${avatar(p)}<span>${esc(p.name)}</span><button class="kick" data-kick="${p.id}" title="Remove ${esc(p.name)}">✕</button></div>`).join('') +
    Array.from({ length: Math.max(0, slots - players.length) }, (_, i) =>
      `<div class="pcard empty">${i === 0 ? 'Scan to join' : ''}</div>`).join('');
  $('#pcount').textContent = humans.length;

  const st = s.settings;
  // The party leader can change settings from their phone; mirror them here so the TV stays in sync.
  const synced = { rounds: st.rounds, drawTime: st.drawTime, packs: st.packs, powerups: st.powerups, ai: s.aiAvailable ? st.ai : settings.ai };
  if (JSON.stringify(synced) !== JSON.stringify({ rounds: settings.rounds, drawTime: settings.drawTime, packs: settings.packs, powerups: settings.powerups, ai: settings.ai })) {
    Object.assign(settings, synced);
    saveSettings();
    if (!$('#pSettings').classList.contains('hidden')) renderSettings();
  }
  $('#summary').innerHTML = [
    `<span class="chip">🔁 ${st.rounds} round${st.rounds > 1 ? 's' : ''}</span>`,
    `<span class="chip">⏱️ ${st.drawTime}s</span>`,
    ...st.packs.map((id) => `<span class="chip">${esc(packName(id))}</span>`),
    st.customCount ? `<span class="chip">✍️ ${st.customCount} custom</span>` : '',
    `<span class="chip">${st.powerups ? '⚡ Power-ups on' : '🚫 No power-ups'}</span>`,
    st.ai ? '<span class="chip">🤖 Gemini rival</span>' : '',
    settings.announcer ? `<span class="chip">🎙️ ${aiMeta.tts ? 'ElevenLabs announcer' : 'Announcer'}</span>` : '',
    '<button class="btn ghost" id="lSettings" style="padding:.35em .9em;font-size:.85em">⚙️ Change</button>',
  ].join('');
  $('#lSettings').onclick = () => openPanel('pSettings');

  const n = humans.length;
  $('#startBtn').disabled = n < 2;
  $('#startHint').textContent =
    n === 0 ? 'Waiting for players to join…' :
    n < 2 ? 'Need at least 2 players.' :
    n < 4 ? `${n} players — 4+ makes it chaotic in the best way.` :
    `${n} players ready. Let's sculpt!`;
}

function renderGame(s) {
  const drawer = s.players.find((p) => p.id === s.drawerId);
  $('#roundInfo').innerHTML = s.phase === 'podium' ? '<b>Final results</b>' : `Round <b>${s.round}</b> / ${s.rounds} &nbsp;·&nbsp; Turn <b>${s.turnNumber}</b>`;

  const who = $('#whoDraws');
  if (s.phase === 'draw' && drawer) {
    who.style.setProperty('--c', drawer.color);
    who.innerHTML = `<b>${esc(drawer.name)}</b> is sculpting &nbsp;${pips(s.difficulty)}`;
    renderMask($('#mask'), s.wordMask);
  } else {
    who.innerHTML = '';
    renderMask($('#mask'), null);
  }
  $('#timer').classList.toggle('hidden', !(s.phase === 'draw' || s.phase === 'choose'));

  const ranked = [...s.players].sort((a, b) => b.score - a.score);
  $('#board').classList.toggle('hidden', s.phase === 'podium');
  $('#board').innerHTML = ranked.map((p) => {
    const cls = ['row', p.guessed && 'guessed', p.id === s.drawerId && 'drawer', !p.connected && 'off', p.isAI && 'ai-row'].filter(Boolean).join(' ');
    const tag = p.id === s.drawerId ? '<span class="tag">✏️</span>' : p.guessed ? '<span class="tag">✅</span>' : p.isAI && aiThinking ? '<span class="tag think">🤔</span>' : '';
    const pw = s.settings.powerups && (p.powers || p.shielded) ? `<span class="pw">${p.shielded ? '🛡️' : ''}${p.powers ? `⚡${p.powers}` : ''}</span>` : '';
    const delta = s.phase === 'reveal' && p.delta ? `<span class="delta">+${p.delta}</span>` : '';
    return `<div class="${cls}" data-id="${p.id}" style="--c:${esc(p.color)}">${avatar(p)}<span class="nm">${esc(p.name)}</span>${tag}${pw}${delta}<span class="sc">${p.score}</span></div>`;
  }).join('');

  $('#ovChoose').classList.toggle('hidden', s.phase !== 'choose');
  if (s.phase === 'choose' && drawer) {
    $('#chooseAvatar').outerHTML = avatar(drawer).replace('class="avatar ', 'id="chooseAvatar" class="avatar ');
    $('#chooseName').textContent = drawer.name;
    $('#chooseName').style.color = drawer.color;
  }
  $('#ovReveal').classList.toggle('hidden', s.phase !== 'reveal');
  if (s.phase === 'reveal') {
    const reasons = {
      guessed: `🏆 ${s.winnerName || 'Someone'} got it! It was`,
      time: "Time's up — nobody got it! It was",
      'no-guessers': 'Everyone left! It was',
      'drawer-left': 'The sculptor left. It was',
      skipped: 'Skipped. It was',
    };
    $('#revealReason').textContent = reasons[s.endReason] || 'It was';
    $('#revealWord').textContent = s.word || '—';
    const drawerDelta = drawer?.delta || s.players.find((p) => p.name === s.drawerName)?.delta;
    $('#revealBy').textContent = s.drawerName ? `sculpted by ${s.drawerName}${drawerDelta ? ` · +${drawerDelta} sculptor points` : ''}` : '';
  }
  $('#ovPodium').classList.toggle('hidden', s.phase !== 'podium');
  if (s.phase === 'podium') renderPodium(ranked);
  $('#skipBtn').classList.toggle('hidden', s.phase === 'podium');
  $('#gameMenuBtn').classList.toggle('hidden', s.phase === 'podium');
  const menuOpen = !$('#pGameMenu').classList.contains('hidden');
  $('#pausedFlag').classList.toggle('hidden', !s.paused || menuOpen);
}

function renderPodium(ranked) {
  const order = [ranked[1], ranked[0], ranked[2]];
  const cls = ['p2', 'p1', 'p3'];
  $('#podium').innerHTML = order.map((p, i) => p ? `
    <div class="col ${cls[i]}">${avatar(p)}<div class="nm">${esc(p.name)}</div><div class="bar">${p.score}</div></div>` : '').join('');
  $('#podiumRest').innerHTML = ranked.slice(3).map((p, i) => `<span class="chip">#${i + 4} ${esc(p.name)} · ${p.score}</span>`).join('');
  if (!galleryTimer) startGallery();
}

// ---------- gallery + GIFs ----------

function startGallery() {
  if (!gallery.length) {
    $('#galleryCap').innerHTML = '<small>No sculptures this time.</small>';
    return;
  }
  galleryIdx = 0;
  const show = () => {
    const i = galleryIdx % gallery.length;
    const g = gallery[i];
    scene.setMode('spin');
    scene.setFraming(0.74, 0.38, 1.15);
    scene.playback(g.strokes, 3500);
    $('#galleryCap').innerHTML = `“${esc(g.word)}”<small>by ${esc(g.drawerName)} · ${g.winnerName ? `guessed by ${esc(g.winnerName)}` : 'nobody guessed it'}</small>`;
    $('#galleryCap').dataset.index = i;
    const cr = $('#galleryCritic');
    cr.classList.toggle('hidden', !g.critic);
    if (g.critic) cr.innerHTML = `<b>🤖 Gemini:</b> <span class="score">${g.critic.score}/10</span> “${esc(g.critic.line)}”`;
    updateGifUi();
    galleryIdx++;
  };
  show();
  galleryTimer = setInterval(show, 7500);
}

function updateGifUi() {
  const ready = gifUrls.size;
  const total = gallery.length;
  $('#gifStatus').textContent = !total ? '' : ready < total ? `🎞️ Rendering spinning GIFs… ${ready}/${total}` : '✅ GIFs ready — players can grab them on their phones too';
  $('#takeHome').classList.toggle('hidden', ready === 0);
  const cur = Number($('#galleryCap').dataset.index);
  const url = gifUrls.get(cur);
  $('#gifLink').classList.toggle('hidden', !url);
  if (url) $('#gifLink').href = `${url}?download`;
}

async function renderGifs() {
  for (const g of gallery) {
    if (gifUrls.has(g.index) || gifJobs.has(g.index) || !room) continue;
    gifJobs.add(g.index);
    try {
      const blob = await sculptureGif(g);
      const res = await fetch(`/api/gif/${room.code}/${g.index}`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/gif', 'X-Host-Token': room.hostToken },
        body: blob,
      });
      if (res.ok) gifUrls.set(g.index, (await res.json()).url);
    } catch (err) {
      console.warn('GIF export failed', err);
    }
    updateGifUi();
  }
}

socket.on('gallery', (g) => {
  gallery = g || [];
  for (const x of gallery) if (x.gifUrl) gifUrls.set(x.index, x.gifUrl);
  if (state && state.phase === 'podium') {
    clearInterval(galleryTimer);
    galleryTimer = null;
    startGallery();
  }
  renderGifs();
});
socket.on('gif:ready', ({ index, url }) => {
  gifUrls.set(index, url);
  updateGifUi();
});

// ---------- strokes ----------

socket.on('stroke:sync', (list) => {
  if (state && (state.phase === 'draw' || state.phase === 'reveal')) scene.load(list);
});
socket.on('stroke:start', (s) => scene.addStroke(s));
socket.on('stroke:points', ({ id, pts }) => scene.appendPoints(id, pts));
socket.on('stroke:undo', ({ id }) => scene.removeStroke(id));
socket.on('stroke:clear', () => {
  if (state && state.phase !== 'lobby' && state.phase !== 'podium') scene.clear();
});
socket.on('cursor', ({ p, drawing, color }) => scene.setCursor(p, color, drawing));

// ---------- feed, buzz, power-ups ----------

socket.on('feed', (item) => {
  if (item.type === 'join') return;
  const el = document.createElement('div');
  el.className = `item ${item.type}`;
  el.innerHTML = `${esc(item.text)}${item.points ? `<span class="pts">+${item.points}</span>` : ''}`;
  const feed = $('#feed');
  feed.prepend(el);
  while (feed.children.length > 6) feed.lastChild.remove();
  setTimeout(() => (el.style.opacity = '0'), 7000);
  setTimeout(() => el.remove(), 7700);
  if (item.type === 'correct') {
    sfx.correct();
    if (/nailed it/.test(item.text)) {
      confetti({ x: 0.5, y: 0.3, count: 160 });
      const who = state?.players.find((p) => p.id === item.playerId);
      if (who) say(who.isAI ? `Gemini nailed it in ${item.secs} seconds! The robots are coming!` : `${who.name} nailed it in ${item.secs} seconds!`, { interrupt: true });
    }
  }
  else if (item.type === 'close') sfx.close();
  else if (item.type === 'wrong') sfx.wrong();
});

socket.on('buzz', ({ playerId }) => {
  const row = document.querySelector(`.board .row[data-id="${playerId}"]`);
  if (row) {
    row.classList.remove('buzzing');
    void row.offsetWidth;
    row.classList.add('buzzing');
  }
  sfx.buzz();
});

socket.on('power', ({ type, fromId, targetId, blocked }) => {
  const name = (id) => esc(state?.players.find((p) => p.id === id)?.name || '?');
  const def = powers[type] || { emoji: '⚡', name: type, verb: 'hit' };
  let text;
  if (blocked) text = `🛡️ ${name(targetId)} blocked ${name(fromId)}'s ${def.emoji}!`;
  else if (def.target === 'self') text = `${def.emoji} ${name(fromId)} used ${def.name}`;
  else text = `${def.emoji} ${name(fromId)} ${def.verb} ${name(targetId)}!`;
  const el = document.createElement('div');
  el.className = `power-toast${blocked ? ' blocked' : ''}`;
  el.innerHTML = text;
  $('#game').appendChild(el);
  if (performance.now() - lastPowerLine > 5000) {
    lastPowerLine = performance.now();
    say(el.textContent.replace(/[^\p{L}\p{N}\s'!.,]/gu, '').trim(), { maxAgeMs: 4000 });
  }
  setTimeout(() => (el.style.opacity = '0'), 2200);
  setTimeout(() => el.remove(), 2800);
  sfx.power();
});
socket.on('orb', () => {
  $('#orbFlag').classList.remove('hidden');
  sfx.orb();
  say(LINES.orb, { maxAgeMs: 3000 });
});

// Gemini rival events
let aiThinking = false;
let aiShots = []; // ms since the turn started at which Gemini takes a look
let lastAiInk = 0;
/** First look ~12s in, then evenly spaced through the turn (up to 6 looks), so 30s and 180s turns both work. */
function planAiShots() {
  const dur = clock.duration || (state?.drawTime || 60) * 1000;
  const gap = Math.max(12000, dur / 7);
  aiShots = [];
  for (let t = 12000; t < dur - 4000 && aiShots.length < 6; t += gap) aiShots.push(t);
  lastAiInk = 0;
}
let lastPowerLine = 0;
socket.on('ai:thinking', ({ on }) => {
  aiThinking = on;
  if (state) render();
});
socket.on('ai:guess', ({ guess, verdict }) => {
  if (verdict !== 'correct') say(verdict === 'close' ? `Gemini guesses ${guess}... so close!` : `Gemini guesses... ${guess}?`, { maxAgeMs: 5000 });
});
socket.on('ai:critic', ({ score, line, turnNumber }) => {
  if (!state || state.turnNumber !== turnNumber) return;
  const g = gallery.find((x) => x.turnNumber === turnNumber);
  if (g) g.critic = { score, line };
  if (state.phase === 'reveal') {
    const el = $('#criticLine');
    el.innerHTML = `<b>🤖 Gemini rates it</b> <span class="score">${score}/10</span>: “${esc(line)}”`;
    el.classList.remove('hidden');
  }
  say(`Gemini's review: ${line} ${score} out of ten!`, { maxAgeMs: 8000 });
});
socket.on('orb:gone', () => $('#orbFlag').classList.add('hidden'));
socket.on('room:closed', () => goMenu());

// ---------- timer loop ----------

setInterval(() => {
  if (!state || !(state.phase === 'draw' || state.phase === 'choose')) return;
  if (state.paused) clock.sync(state); // keep the ring frozen while paused
  // Gemini looks at the sculpture on a clock (not a % of the turn), seeing exactly what the TV shows.
  if (state.phase === 'draw' && !state.paused && state.settings.ai && aiShots.length) {
    const elapsed = clock.duration - clock.remaining();
    if (elapsed >= aiShots[0]) {
      const ink = scene.inkCount();
      if (ink > 8 && ink !== lastAiInk) {
        // Only spend a guess when the sculpture has changed since Gemini last looked.
        aiShots.shift();
        lastAiInk = ink;
        socket.emit('ai:snapshot', { image: scene.snapshot(512) });
      } else {
        aiShots[0] = elapsed + 3000; // nothing new yet — check again in 3s
      }
    }
  }
  const secs = setTimer($('#timer'), $('#timerText'), clock);
  if (state.phase === 'draw' && !state.paused && secs <= 5 && secs > 0 && secs !== lastTick) {
    lastTick = secs;
    sfx.tick();
  }
}, 150);

// ---------- settings panel ----------

function renderSettings() {
  for (const b of $('#segRounds').children) b.classList.toggle('on', Number(b.dataset.v) === settings.rounds);
  for (const b of $('#segTime').children) b.classList.toggle('on', Number(b.dataset.v) === settings.drawTime);
  $('#packs').innerHTML = packs.map((p) => `
    <button class="pack ${settings.packs.includes(p.id) ? 'on' : ''}" data-id="${p.id}">
      <span class="em">${p.emoji}</span><b>${esc(p.name)}</b><small>${p.count} words · ${esc(p.sample.join(', '))}…</small>
    </button>`).join('');
  if (document.activeElement !== $('#customWords')) $('#customWords').value = settings.custom;
  const n = settings.custom.split(/[\n,]/).map((w) => w.trim()).filter((w) => w.length >= 2).length;
  $('#customCount').textContent = n ? `${n} custom word${n > 1 ? 's' : ''} will be mixed in (difficulty is guessed from length).` : '';
  $('#swPowers').classList.toggle('on', settings.powerups);
  $('#swAi').classList.toggle('on', settings.ai && aiMeta.gemini);
  $('#swAi').disabled = !aiMeta.gemini;
  $('#swAi').style.opacity = aiMeta.gemini ? 1 : 0.4;
  $('#aiNote').innerHTML = aiMeta.gemini
    ? 'An AI player that guesses your sculptures from the TV view, and reviews each one'
    : 'Off: add <b>GEMINI_API_KEY</b> to the .env file and restart the server';
  $('#swVoice').classList.toggle('on', settings.announcer);
  $('#voiceNote').innerHTML = aiMeta.tts
    ? 'Game-show voice powered by ElevenLabs'
    : 'Using the browser voice: add <b>ELEVENLABS_API_KEY</b> to .env for the ElevenLabs voice';
  $('#swSound').classList.toggle('on', settings.sound);
}

function changed() {
  saveSettings();
  renderSettings();
  if (room && state?.phase === 'lobby') socket.emit('game:settings', serverSettings());
}

$('#segRounds').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.v;
  if (v) { settings.rounds = Number(v); changed(); }
});
$('#segTime').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.v;
  if (v) { settings.drawTime = Number(v); changed(); }
});
$('#packs').addEventListener('click', (e) => {
  const id = e.target.closest('.pack')?.dataset.id;
  if (!id) return;
  const on = settings.packs.includes(id);
  settings.packs = on ? settings.packs.filter((x) => x !== id) : [...settings.packs, id];
  changed();
});
let customTimer;
$('#customWords').addEventListener('input', (e) => {
  settings.custom = e.target.value.slice(0, 4000);
  clearTimeout(customTimer);
  customTimer = setTimeout(changed, 400);
});
$('#swPowers').addEventListener('click', () => { settings.powerups = !settings.powerups; changed(); });
$('#swAi').addEventListener('click', () => {
  if (!aiMeta.gemini) return;
  settings.ai = !settings.ai;
  changed();
});
$('#swVoice').addEventListener('click', () => {
  settings.announcer = !settings.announcer;
  announcer.enabled = settings.announcer;
  if (!settings.announcer) announcer.stop();
  else say('Announcer on!');
  saveSettings();
  renderSettings();
});
$('#swSound').addEventListener('click', () => {
  settings.sound = !settings.sound;
  setMuted(!settings.sound);
  $('#muteBtn').textContent = settings.sound ? '🔊' : '🔇';
  changed();
});

// ---------- controls ----------

$('#mStart').addEventListener('click', createRoom);
$('#mHowto').addEventListener('click', () => openPanel('pHowto'));
$('#mSettings').addEventListener('click', () => openPanel('pSettings'));
$('#lBack').addEventListener('click', leaveRoom);
$('#menuBtn').addEventListener('click', leaveRoom);

$('#startBtn').addEventListener('click', async () => {
  unlockAudio();
  const res = await socket.emitWithAck('game:start', {}); // the room already has the latest settings
  if (!res.ok) $('#startHint').textContent = res.error;
});
$('#skipBtn').addEventListener('click', () => socket.emit('game:skip'));

// ---------- in-game menu ----------

function openGameMenu() {
  if (!state || state.phase === 'lobby' || state.phase === 'podium') return;
  $('#pGameMenu').classList.remove('hidden');
  socket.emit('game:pause');
  say(LINES.paused, { interrupt: true, maxAgeMs: 2000 });
  render();
}
function closeGameMenu(resume = true) {
  $('#pGameMenu').classList.add('hidden');
  if (resume && state?.paused) {
    socket.emit('game:resume');
    say(LINES.resumed, { maxAgeMs: 2000 });
  }
  if (state) render();
}
$('#gameMenuBtn').addEventListener('click', openGameMenu);
$('#gmResume').addEventListener('click', () => closeGameMenu(true));
$('#gmRestart').addEventListener('click', async () => {
  if (!confirm('Restart the game? Scores reset, same players.')) return;
  closeGameMenu(false);
  const res = await socket.emitWithAck('game:restart', {});
  if (!res.ok) banner(res.error || 'Could not restart');
  else setTimeout(hideBanner, 0);
});
$('#gmLobby').addEventListener('click', () => {
  closeGameMenu(false);
  socket.emit('game:lobby');
});
$('#gmHowto').addEventListener('click', () => openPanel('pHowto'));
$('#gmQuit').addEventListener('click', () => {
  $('#pGameMenu').classList.add('hidden');
  socket.emit('host:close');
  sessionStorage.removeItem('sns-host');
  goMenu();
});
$('#pGameMenu').addEventListener('click', (e) => {
  if (e.target === $('#pGameMenu')) closeGameMenu(true);
});

// Kick players from the lobby.
$('#lobbyPlayers').addEventListener('click', (e) => {
  const id = e.target.closest('[data-kick]')?.dataset.kick;
  if (!id) return;
  const p = state?.players.find((x) => x.id === id);
  if (p && confirm(p.isAI ? 'Turn off the Gemini AI rival?' : `Remove ${p.name} from the game?`)) socket.emit('player:kick', { playerId: id });
});

// 3-2-1 countdown on the TV when sculpting starts.
function countdown() {
  const el = $('#countdown');
  const steps = ['3', '2', '1', 'SCULPT!'];
  el.classList.remove('hidden');
  steps.forEach((t, i) => setTimeout(() => {
    el.innerHTML = `<span class="${i === 3 ? 'go' : ''}">${t}</span>`;
    i === 3 ? sfx.start() : sfx.tick();
  }, i * 550));
  setTimeout(() => el.classList.add('hidden'), steps.length * 550 + 300);
}
$('#againBtn').addEventListener('click', () => socket.emit('game:lobby'));
$('#muteBtn').textContent = settings.sound ? '🔊' : '🔇';
$('#muteBtn').addEventListener('click', () => {
  settings.sound = !settings.sound;
  setMuted(!settings.sound);
  saveSettings();
  $('#muteBtn').textContent = settings.sound ? '🔊' : '🔇';
});
$('#fsBtn').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});
document.addEventListener('pointerdown', () => {
  unlockAudio();
  $('#soundHint').classList.add('hidden');
}, { once: true });

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  const key = e.key.toLowerCase();
  const panels = ['pHowto', 'pSettings'];
  const panelOpen = panels.some((id) => !$(`#${id}`).classList.contains('hidden'));
  const inGame = state && state.phase !== 'lobby' && state.phase !== 'podium';
  if (e.key === 'Escape') {
    if (panelOpen) return closePanels();
    if (inGame) return $('#pGameMenu').classList.contains('hidden') ? openGameMenu() : closeGameMenu(true);
    return;
  }
  if (key === 'f') return $('#fsBtn').click();
  if (key === 'm') return $('#muteBtn').click();
  if (inGame) {
    if (key === 'p') socket.emit(state.paused ? 'game:resume' : 'game:pause');
    if (key === 'n') socket.emit('game:skip');
    return;
  }
  if (room || panelOpen) return;
  if (e.key === 'Enter') createRoom();
  else if (key === 'h') openPanel('pHowto');
  else if (key === 's') openPanel('pSettings');
});

function banner(text) {
  const b = $('#banner');
  b.textContent = text;
  b.classList.remove('hidden');
}
function hideBanner() {
  $('#banner').classList.add('hidden');
}

goMenu();
