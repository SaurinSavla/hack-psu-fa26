// Phone controller: join, sculpt in the air (drawer), shake-to-guess (everyone else).

import * as THREE from 'three';
import { Sculpture } from './scene.js';
import { SHAPES, shapeGeometry } from './shapes.js';
import { MotionInput, requestMotionPermission } from './motion.js';
import { $, esc, avatar, renderMask, pips, PhaseClock, setTimer } from './common.js';
import { sfx, unlockAudio } from './sfx.js';

const socket = io({ transports: ['websocket', 'polling'] });
const motion = new MotionInput();
const clock = new PhaseClock();
const scene = new Sculpture($('#scene'), { mode: 'reveal' });
scene.setProgressSource(() => clock.progress());

// Ink colours, as a spectrum. Besides the bright glow colours there are greens, browns, skin tones and
// greys, so trees, animals and people look right. Every player colour is included, so your default ink matches you.
const COLOR_NAMES = {
  '#ff2e3a': 'Red', '#ff5d73': 'Coral', '#ffb3d1': 'Blush', '#ff7ad9': 'Pink', '#ff8a3d': 'Orange', '#ffb53d': 'Amber',
  '#ffe53d': 'Yellow', '#c6ff3d': 'Lime', '#3dffa8': 'Mint', '#2ecc40': 'Green', '#1e7a3c': 'Forest green', '#7affef': 'Aqua',
  '#3de0ff': 'Cyan', '#5d8bff': 'Blue', '#2343d6': 'Navy', '#d4a5ff': 'Lavender', '#a77bff': 'Violet', '#7b2ff7': 'Purple',
  '#f1c27d': 'Sand', '#c68642': 'Tan', '#8b5a2b': 'Brown', '#ffffff': 'White', '#9aa3b5': 'Grey', '#5c6278': 'Charcoal',
};
const SWATCHES = Object.keys(COLOR_NAMES);
const SIZES = [{ w: 0.012, label: '•' }, { w: 0.022, label: '●' }, { w: 0.04, label: '⬤' }];

let me = null; // { playerId, name, color, code }
let state = null;
let priv = {};
let screen = null;
let practicing = false;
let wakeLock = null;

let PACKS = [];
fetch('/api/packs').then((r) => r.json()).then((d) => {
  PACKS = d.packs;
  renderScreen();
}).catch(() => {});

const params = new URLSearchParams(location.search);
$('#room').value = (params.get('room') || '').toUpperCase();
$('#name').value = localStorage.getItem('sns-name') || '';
if ($('#room').value && !$('#name').value) $('#name').focus();

const vibrate = (p) => navigator.vibrate && navigator.vibrate(p);

// =====================================================================
// Joining
// =====================================================================

$('#joinBtn').addEventListener('click', async () => {
  unlockAudio();
  const perm = await requestMotionPermission();
  motion.start();
  requestWakeLock();
  const name = $('#name').value.trim();
  const code = $('#room').value.trim().toUpperCase();
  if (!name) return ($('#joinErr').textContent = 'Pick a name first.');
  if (code.length !== 4) return ($('#joinErr').textContent = 'Room code is 4 letters (on the TV).');
  if (perm === 'denied') $('#joinErr').textContent = 'Motion access was denied — you can still play with the fallback controls.';
  localStorage.setItem('sns-name', name);
  await join(code, name);
});
$('#room').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '')));

async function join(code, name) {
  const saved = JSON.parse(localStorage.getItem('sns-player') || 'null');
  const mine = saved && saved.code === code;
  const res = await socket.emitWithAck('player:join', { code, name, playerId: mine ? saved.playerId : undefined, token: mine ? saved.token : undefined });
  if (!res.ok) {
    $('#joinErr').textContent = res.error;
    return false;
  }
  me = { playerId: res.playerId, name: res.name, color: res.color, code: res.code };
  myId = res.playerId;
  localStorage.setItem('sns-player', JSON.stringify({ code: res.code, playerId: res.playerId, token: res.token }));
  history.replaceState(null, '', `/?room=${res.code}`);
  return true;
}

socket.on('connect', async () => {
  if (!me) return;
  // If the server restarted, the room is gone: go back to the join screen instead of sitting on a dead game.
  if (!(await join(me.code, me.name))) {
    me = null;
    state = null;
    clearEffects();
    $('#pausedOverlay').classList.add('hidden');
    show('sJoin');
  }
});
socket.on('disconnect', (reason) => console.warn('[sns] disconnected:', reason));

async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && me) requestWakeLock();
});

// =====================================================================
// State & routing
// =====================================================================

socket.on('state', (s) => {
  const prev = state;
  state = s;
  clock.sync(s);
  $('#pausedOverlay').classList.toggle('hidden', !s.paused);
  if (s.paused) endStroke();
  if (prev && prev.phase !== s.phase) onPhaseChange(prev.phase, s.phase);
  route();
});
socket.on('private', (p) => {
  const hadWord = priv.word;
  priv = p;
  if (p.frozenMs > 0) startFreeze(p.frozenMs);
  if (!hadWord && p.word && screen === 'sGuess') renderGuess();
  route();
});

function onPhaseChange(from, to) {
  if (to !== 'lobby' && practicing) stopPractice();
  if (from === 'lobby' && to === 'choose') currentGameId++;
  if (from === 'podium' && to === 'choose') currentGameId++;
  if (to === 'draw' && isDrawer()) sculptCountdown();
  if (to !== 'draw') clearEffects();
  if (to !== 'draw' && to !== 'reveal') scene.setDrawerEye(null);
  if (to === 'choose') {
    scene.clear();
    if (state.drawerId === me?.playerId) { vibrate([60, 40, 60]); sfx.start(); }
  }
  if (to === 'choose' || to === 'draw') resetView();
  if (to === 'draw') {
    resetGuessUi();
    const hint = $('#orbitHint');
    hint.style.opacity = '1';
    clearTimeout(hint._t);
    hint._t = setTimeout(() => (hint.style.opacity = '0'), 5000);
  }
  if (to === 'reveal') {
    endStroke();
    const mine = state.players.find((p) => p.id === me?.playerId);
    if (mine && mine.delta) sfx.correct();
  }
}

function isDrawer() {
  return state && me && state.drawerId === me.playerId;
}

function route() {
  if (!me || !state) return show('sJoin');
  switch (state.phase) {
    case 'lobby': return show(practicing ? 'sDraw' : 'sLobby');
    case 'choose': return show(isDrawer() ? 'sChoose' : 'sWait');
    case 'draw': return show(isDrawer() ? 'sDraw' : 'sGuess');
    case 'reveal': return show('sReveal');
    case 'podium': return show('sPodium');
  }
}

function show(id) {
  const changed = id !== screen;
  if (changed) {
    document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('hidden', el.id !== id));
    $('#stage').classList.toggle('hidden', !(id === 'sDraw' || id === 'sGuess'));
    screen = id;
    if (id === 'sDraw') enterDraw();
    if (id === 'sGuess') scene.setMode('reveal');
    if (id !== 'sDraw') endStroke();
  }
  renderScreen();
}

function renderScreen() {
  const s = state;
  if (!s || !me) return;
  const mine = s.players.find((p) => p.id === me.playerId) || me;
  switch (screen) {
    case 'sLobby': {
      $('#meCard').innerHTML = `${avatar(mine)}<div class="nm">${esc(mine.name)}</div>`;
      const vip = s.vipId === me.playerId;
      const n = s.players.filter((p) => p.connected && !p.isAI).length;
      $('#vipStart').classList.toggle('hidden', !vip);
      $('#vipStart').disabled = n < 2;
      $('#vipStart').textContent = n < 2 ? 'Waiting for more players…' : `Start game (${n} players)`;
      $('#lobbyMsg').textContent = vip ? "👑 You're the party leader: change settings, remove players, and start when everyone's in." : "You're in! Waiting for the host to start…";
      renderLobbyExtras(s, vip);
      break;
    }
    case 'sChoose': {
      const list = priv.choices || [];
      const mult = { 1: '×1', 2: '×1.25', 3: '×1.5' };
      const html = list.map((c, i) => `
        <button class="choice" data-i="${i}" style="animation-delay:${i * 70}ms">
          <span>${esc(c.word)}</span>
          <span class="meta">${pips(c.difficulty)}<span>${mult[c.difficulty]} pts</span></span>
        </button>`).join('');
      if ($('#choices').dataset.key !== list.map((c) => c.word).join('|')) {
        $('#choices').innerHTML = html;
        $('#choices').dataset.key = list.map((c) => c.word).join('|');
      }
      break;
    }
    case 'sWait': {
      const d = s.players.find((p) => p.id === s.drawerId);
      $('#waitCard').innerHTML = d ? `${avatar(d)}<div class="nm">${esc(d.name)}</div>` : '';
      $('#waitMsg').textContent = 'is choosing what to sculpt… get ready to shake!';
      break;
    }
    case 'sDraw':
      if (!practicing) {
        $('#drawLabel').textContent = 'Sculpt this';
        $('#secretWord').textContent = priv.word || '…';
      }
      break;
    case 'sGuess':
      renderGuess();
      break;
    case 'sReveal': {
      $('#revealWord').textContent = s.word || '';
      const won = s.winnerId === me.playerId;
      const drew = s.drawerId === me.playerId;
      $('#revealLabel').textContent = won ? '🏆 You got it first! It was' : s.winnerName ? `${s.winnerName} got it! It was` : 'Nobody got it! It was';
      $('#revealDelta').textContent = mine.delta ? `+${mine.delta}${drew ? ' 🎨' : ''}` : drew ? 'Too abstract? 🤔' : s.winnerName ? 'Beaten to it 😤' : '+0';
      $('#revealDelta').style.color = mine.delta ? 'var(--lime)' : 'var(--muted)';
      const rank = [...s.players].sort((a, b) => b.score - a.score).findIndex((p) => p.id === me.playerId) + 1;
      $('#revealRank').textContent = `You're #${rank} with ${mine.score} points`;
      break;
    }
    case 'sPodium': {
      const ranked = [...s.players].sort((a, b) => b.score - a.score);
      const rank = ranked.findIndex((p) => p.id === me.playerId) + 1;
      $('#finalRank').textContent = rank === 1 ? '🏆 1st' : rank === 2 ? '🥈 2nd' : rank === 3 ? '🥉 3rd' : `#${rank}`;
      $('#finalScore').textContent = `${mine.score} pts`;
      $('#finalMsg').textContent = rank === 1 ? 'Bragging rights secured. Go gloat.' : `${ranked[0].name} wins this time. Demand a rematch.`;
      $('#vipAgain').classList.toggle('hidden', s.vipId !== me.playerId);
      renderGifs();
      break;
    }
  }
}

// ---------- Lobby: players + leader settings ----------

function renderLobbyExtras(s, vip) {
  const players = s.players.filter((p) => p.connected);
  $('#lobbyCount').textContent = players.filter((p) => !p.isAI).length;
  $('#kickHint').textContent = vip && players.length > 1 ? 'tap ✕ to remove' : '';
  $('#plist').innerHTML = players.map((p) => `
    <div class="prow">${avatar(p)}<span class="nm">${esc(p.name)}</span>
      <span class="tag ${p.isAI ? 'ai' : ''}">${p.isAI ? 'AI rival' : ''}${p.id === s.vipId ? '👑 leader' : ''}${p.id === me.playerId ? ' · you' : ''}</span>
      ${vip && p.id !== me.playerId ? `<button class="kick" data-kick="${p.id}" aria-label="Remove ${esc(p.name)}">✕</button>` : ''}
    </div>`).join('');

  const st = s.settings;
  const packName = (id) => { const p = PACKS.find((x) => x.id === id); return p ? `${p.emoji} ${p.name}` : id; };
  $('#settingsWho').textContent = vip ? 'you can change these' : 'set by the leader';
  $('#settingsEdit').classList.toggle('hidden', !vip);
  $('#settingsView').classList.toggle('hidden', vip);
  $('#settingsView').innerHTML = [
    `<span class="chip">🔁 ${st.rounds} round${st.rounds > 1 ? 's' : ''}</span>`,
    `<span class="chip">⏱️ ${st.drawTime}s</span>`,
    ...st.packs.map((id) => `<span class="chip">${esc(packName(id))}</span>`),
    st.customCount ? `<span class="chip">✍️ ${st.customCount} custom</span>` : '',
    `<span class="chip">${st.powerups ? '⚡ Power-ups' : '🚫 No power-ups'}</span>`,
    st.ai ? '<span class="chip">🤖 Gemini rival</span>' : '',
  ].join('');
  if (vip) {
    for (const b of $('#pRounds').children) b.classList.toggle('on', Number(b.dataset.v) === st.rounds);
    for (const b of $('#pTime').children) b.classList.toggle('on', Number(b.dataset.v) === st.drawTime);
    $('#pPacks').innerHTML = PACKS.map((p) => `<button data-id="${p.id}" class="${st.packs.includes(p.id) ? 'on' : ''}">${p.emoji} ${esc(p.name)}</button>`).join('');
    $('#pPowers').classList.toggle('on', st.powerups);
    $('#pAiRow').classList.toggle('hidden', !s.aiAvailable);
    $('#pAi').classList.toggle('on', !!st.ai);
  }
}

function sendSettings(patch) {
  socket.emit('game:settings', patch);
  vibrate(10);
}
$('#pRounds').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.v;
  if (v) sendSettings({ rounds: Number(v) });
});
$('#pTime').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.v;
  if (v) sendSettings({ drawTime: Number(v) });
});
$('#pPacks').addEventListener('click', (e) => {
  const id = e.target.closest('button')?.dataset.id;
  if (!id || !state) return;
  const cur = state.settings.packs;
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  if (!next.length && !state.settings.customCount) return; // keep at least one pack
  sendSettings({ packs: next });
});
$('#pPowers').addEventListener('click', () => state && sendSettings({ powerups: !state.settings.powerups }));
$('#pAi').addEventListener('click', () => state && sendSettings({ ai: !state.settings.ai }));
$('#plist').addEventListener('click', (e) => {
  const id = e.target.closest('[data-kick]')?.dataset.kick;
  if (!id) return;
  const p = state?.players.find((x) => x.id === id);
  if (p && confirm(p.isAI ? 'Turn off the Gemini AI rival?' : `Remove ${p.name} from the game?`)) socket.emit('player:kick', { playerId: id });
});

// ---------- 3-2-1 countdown on the sculptor's phone ----------

let countdownUntil = 0;
function sculptCountdown() {
  const el = $('#phoneCountdown');
  const steps = ['3', '2', '1', 'SCULPT!'];
  countdownUntil = performance.now() + 3 * 550;
  el.classList.remove('hidden');
  steps.forEach((t, i) => setTimeout(() => {
    el.innerHTML = `<span class="${i === 3 ? 'go' : ''}">${t}</span>`;
    vibrate(i === 3 ? [60, 40, 120] : 30);
    i === 3 ? sfx.start() : sfx.tick();
  }, i * 550));
  setTimeout(() => el.classList.add('hidden'), steps.length * 550 + 250);
}

$('#choices').addEventListener('click', (e) => {
  const b = e.target.closest('.choice');
  if (!b) return;
  vibrate(30);
  socket.emit('draw:pick', { index: Number(b.dataset.i) });
});
$('#vipStart').addEventListener('click', async () => {
  const res = await socket.emitWithAck('game:start', {});
  if (!res.ok) $('#lobbyErr').textContent = res.error;
});
$('#vipAgain').addEventListener('click', () => socket.emit('game:lobby'));

// =====================================================================
// Strokes from the server
// =====================================================================

socket.on('stroke:sync', (list) => {
  if (!practicing && state && (state.phase === 'draw' || state.phase === 'reveal')) scene.load(list);
});
socket.on('stroke:start', (s) => !practicing && scene.addStroke(s));
socket.on('stroke:points', ({ id, pts }) => !practicing && scene.appendPoints(id, pts));
socket.on('stroke:undo', ({ id }) => !practicing && scene.removeStroke(id));
socket.on('stroke:clear', () => !practicing && scene.clear());
socket.on('cursor', ({ p, drawing, color }) => scene.setCursor(p, color, drawing));
socket.on('drawer:view', ({ e }) => !practicing && !isDrawer() && scene.setDrawerEye(e));

// =====================================================================
// Drawer: sculpting in the air
// =====================================================================

const draw = {
  active: false,
  strokeId: null,
  last: null,
  pending: [],
  color: null,
  sizeIdx: 1,
  depth: 1,
  counter: 0,
  lastSend: 0,
  lastCursor: 0,
  // Fallback (no gyro): look around by dragging.
  yaw: 0,
  pitch: 0,
  // Tool: 'brush' or a shape id. Snapping paints onto stamped shapes' surfaces.
  tool: 'brush',
  snap: true,
  surf: null, // surface the current stroke is following { point, normal } (world space)
  hover: null, // surface under the brush while not painting
  grow: null, // shape being grown { t, start, anchor, normal, k }
  spin: null, // finger dragging to spin / tilt the sculpture
  rot: new THREE.Quaternion(), // extra rotation for the next shape (X / Y / Z buttons, or flick while growing)
  lastEnd: 0, // when the last stroke / shape finished (so a shake right after painting isn't an undo)
  // Peeking at the sculpture from the audience's side, and where we last told viewers we stand.
  peek: false,
  lastEye: null,
  lastEyeSent: 0,
};

// The last colour picked with the "any colour" picker is remembered on this phone.
const isHex = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
let customColor = isHex(localStorage.getItem('sns-ink')) ? localStorage.getItem('sns-ink') : '#ff9f1c';

function buildSwatches() {
  $('#swatches').innerHTML =
    `<label class="custom" style="--c:${customColor}" title="Any colour" aria-label="Pick any colour"><input type="color" id="customColor" value="${customColor}" /></label>` +
    SWATCHES.map((c) => `<button style="--c:${c}" data-c="${c}" title="${COLOR_NAMES[c]}" aria-label="${COLOR_NAMES[c]} ink"></button>`).join('');
}
buildSwatches();
function setColor(c) {
  draw.color = c;
  let preset = null;
  for (const b of $('#swatches').querySelectorAll('button')) {
    b.classList.toggle('on', b.dataset.c === c);
    if (b.dataset.c === c) preset = b;
  }
  $('#swatches .custom').classList.toggle('on', !preset);
  // Keep the chosen colour in view in the scrolling row.
  const row = $('#swatches');
  const sel = preset || $('#swatches .custom');
  if (row.clientWidth) row.scrollLeft = sel.offsetLeft - (row.clientWidth - sel.offsetWidth) / 2;
  $('#holdBtn').style.setProperty('--hc', c);
}
$('#swatches').addEventListener('click', (e) => {
  const c = e.target.closest('button')?.dataset.c;
  if (c) { setColor(c); vibrate(10); }
});
$('#customColor').addEventListener('input', (e) => {
  if (!isHex(e.target.value)) return;
  customColor = e.target.value.toLowerCase();
  localStorage.setItem('sns-ink', customColor);
  $('#swatches .custom').style.setProperty('--c', customColor);
  setColor(customColor);
});
// Tapping the picker when another colour is selected switches back to the remembered custom colour too.
$('#customColor').addEventListener('click', () => {
  if (draw.color !== customColor) setColor(customColor);
});

function enterDraw() {
  setPeek(false, true); // also switches the scene to the drawer's view
  scene.resetTurn();
  renderTurnBar();
  if (!draw.color) setColor(me?.color && SWATCHES.includes(me.color) ? me.color : SWATCHES[0]);
  $('#practiceDone').classList.toggle('hidden', !practicing);
  $('#drawTimer').classList.toggle('hidden', practicing);
  if (motion.hasOrientation) motion.recenter();
  setDepthSlider(draw.depth);
  showCoach(motion.hasOrientation
    ? `Point your phone at the TV and tap <b>⟲</b>.<br/><b>Hold the button</b> &amp; sweep to paint, or pick a <b>🧊 shape</b> below.<br/>Drag the <b>slider →</b> for depth. <b>Swipe the scene</b> to see any side. <b>Shake</b> to undo.<br/><span class="small">Tap <b>?</b> anytime for help</span>`
    : `Drag the screen to look around.<br/><b>Hold the button</b> (or <b>Space</b>) to paint, or pick a <b>🧊 shape</b> below.<br/>Drag the <b>slider →</b> to paint nearer or farther.<br/><span class="small">Tap <b>?</b> anytime for help</span>`, 7000);
}

// ---------- Coach tip (auto-hides as soon as you start sculpting) ----------

function showCoach(html, ms = 6000) {
  const el = $('#coach');
  el.innerHTML = html;
  el.classList.remove('hidden', 'gone');
  el.style.opacity = '1';
  clearTimeout(showCoach.t);
  showCoach.t = setTimeout(hideCoach, ms);
}
function hideCoach() {
  clearTimeout(showCoach.t);
  $('#coach').classList.add('gone');
}

// ---------- "?" help card ----------

function helpSteps() {
  const tilt = motion.hasOrientation;
  const steps = [
    ['📱', tilt
      ? '<b>Aim:</b> hold your phone up like a camera, point it at the TV and tap <b>⟲</b> to centre.'
      : '<b>Aim:</b> drag the screen to look around (no motion sensors on this device).'],
    ['🖌️', tilt
      ? '<b>Paint:</b> hold the big button and sweep your phone through the air. Let go to stop.'
      : '<b>Paint:</b> hold the big button or the <b>Space</b> bar while you drag.'],
    ['↕️', '<b>Depth:</b> drag the <b>slider</b> on the right. Up = farther away, down = nearer. Your brush dot grows and shrinks to show it. You can move it while you paint.'],
    ['🧊', '<b>Shapes:</b> pick a shape in the row (cube, cone, ring, star…). A faint preview shows where it will go. <b>Hold</b> the big button to grow it and <b>let go</b> to place it. Point at another shape first to stack it right on its surface.'],
    ['🔁', `<b>Turn a shape:</b> tap <b style="color:#ff6b6b">X</b> (tip), <b style="color:#6bff8f">Y</b> (spin) or <b style="color:#6bb8ff">Z</b> (roll) on the left to turn it 45°, and <b>⟲</b> to reset.${tilt ? ' Or <b>flick your wrist</b> while it grows to turn it 90° that way!' : ''}`],
    ['🧲', '<b>Paint on shapes:</b> point the brush at a shape. A <b>green ring</b> means you\'re on its surface, and the depth is automatic. Paint, and the ink follows the shape. On a flat face it stays in that plane. Tap <b>🧲 Snap</b> to switch this off.'],
    ['🔄', tilt
      ? '<b>See every side:</b> <b>swipe</b> on the scene. Sideways spins your sculpture, up and down shows its top or bottom. <b>Double-tap</b> for the front view. ◀ ▶ also spin it 45°.'
      : '<b>See every side:</b> <b>Shift</b>- or right-drag on the scene (or <b>Q</b>/<b>E</b> to spin, <b>R</b>/<b>F</b> to tip, <b>0</b> to reset), then paint its sides, top and back.'],
    ['📳', '<b>Shake to undo:</b> give your phone a good shake to take back the last stroke or shape.'],
    ['👁', '<b>Check it:</b> tap <b>👁</b> to see your sculpture from the audience\'s side. Tap the big button to get back to sculpting.'],
    ['🎨', '<b>Tools:</b> pick a colour (it colours shapes too), <b>●</b> changes brush size, <b>↶</b> undoes the last stroke or shape, <b>🗑</b> clears.'],
  ];
  return steps.map(([ico, html]) => `<li><span class="ico">${ico}</span><span>${html}</span></li>`).join('');
}
function openHelp() {
  endStroke();
  hideCoach();
  $('#helpSteps').innerHTML = helpSteps();
  $('#helpCard').classList.remove('hidden');
}
function closeHelp() {
  $('#helpCard').classList.add('hidden');
}
$('#helpBtn').addEventListener('click', () => ($('#helpCard').classList.contains('hidden') ? openHelp() : closeHelp()));
$('#helpClose').addEventListener('click', closeHelp);
$('#helpGotIt').addEventListener('click', closeHelp);

// ---------- Depth slider: drag up for farther, down for nearer ----------

const DEPTH_RANGE = 0.9; // depth = 2^(v * range), v in [-1, 1] → about 0.54 … 1.87
const depthFromV = (v) => Math.pow(2, Math.max(-1, Math.min(1, v)) * DEPTH_RANGE);
const vFromDepth = (d) => Math.max(-1, Math.min(1, Math.log2(d) / DEPTH_RANGE));

function setDepthSlider(depth) {
  draw.depth = depth;
  const v = vFromDepth(depth);
  const frac = (v + 1) / 2; // 0 = near (bottom), 1 = far (top)
  const meter = $('#depthMeter');
  const h = meter.clientHeight || 300;
  const pad = 24;
  const y = pad + (1 - frac) * (h - pad * 2);
  $('#depthKnob').style.top = `${y - 18}px`;
  $('#depthFill').style.height = `${frac * 100}%`;
  const pct = Math.round(frac * 100);
  $('#depthVal').textContent = pct;
  meter.setAttribute('aria-valuenow', pct);
}

function depthFromPointer(e) {
  const r = $('#depthMeter').getBoundingClientRect();
  const pad = 24;
  const frac = 1 - (e.clientY - r.top - pad) / Math.max(1, r.height - pad * 2);
  return depthFromV(frac * 2 - 1);
}

let depthFlashEl = null;
function flashDepth() {
  const meter = $('#depthMeter');
  if (!depthFlashEl) {
    depthFlashEl = document.createElement('div');
    depthFlashEl.className = 'depth-flash';
    meter.parentElement.appendChild(depthFlashEl);
  }
  const v = vFromDepth(draw.depth);
  depthFlashEl.textContent = v > 0.33 ? '↑ Far' : v < -0.33 ? '↓ Near' : '• Middle';
  const kr = $('#depthKnob').getBoundingClientRect();
  const pr = meter.parentElement.getBoundingClientRect();
  depthFlashEl.style.top = `${kr.top + kr.height / 2 - pr.top}px`;
  depthFlashEl.style.display = 'block';
  clearTimeout(flashDepth.t);
  flashDepth.t = setTimeout(() => (depthFlashEl.style.display = 'none'), 900);
}

const depthMeter = $('#depthMeter');
depthMeter.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  depthMeter.setPointerCapture(e.pointerId);
  depthMeter.classList.add('dragging');
  hideCoach();
  setDepthSlider(depthFromPointer(e));
  flashDepth();
  vibrate(8);
});
depthMeter.addEventListener('pointermove', (e) => {
  if (!depthMeter.hasPointerCapture(e.pointerId)) return;
  setDepthSlider(depthFromPointer(e));
  flashDepth();
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) =>
  depthMeter.addEventListener(ev, () => depthMeter.classList.remove('dragging')));
depthMeter.addEventListener('keydown', (e) => {
  const v = vFromDepth(draw.depth);
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') setDepthSlider(depthFromV(v + 0.1));
  else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') setDepthSlider(depthFromV(v - 0.1));
  else return;
  e.preventDefault();
  flashDepth();
});
addEventListener('resize', () => setDepthSlider(draw.depth));

function startPractice() {
  practicing = true;
  scene.clear();
  $('#drawLabel').textContent = 'Practice';
  $('#secretWord').textContent = 'Anything!';
  route();
}
function stopPractice() {
  endStroke();
  practicing = false;
  scene.clear();
  route();
}
$('#practiceBtn').addEventListener('click', () => { unlockAudio(); startPractice(); });
$('#practiceDone').addEventListener('click', stopPractice);

function startStroke() {
  if (screen !== 'sDraw' || draw.active || draw.peek) return;
  if (!practicing && performance.now() < countdownUntil) return; // wait for "SCULPT!"
  if (!practicing && !(state && state.phase === 'draw' && isDrawer())) return;
  if (!practicing && sculptureFull()) return;
  hideCoach(); // get the tip out of the way as soon as you start painting
  closeHelp();
  draw.surf = surfaceAt(); // pointing at a shape? the stroke follows its surface
  draw.active = true;
  draw.strokeId = `${(me?.playerId || 'x').slice(0, 4)}${Date.now().toString(36)}${draw.counter++}`;
  const p = currentPoint();
  const width = SIZES[draw.sizeIdx].w;
  const s = scene.toSculpture(p); // undo the turntable spin, so everyone sees the ink where it belongs
  const pts = [round(s.x), round(s.y), round(s.z)];
  scene.addStroke({ id: draw.strokeId, color: draw.color, width, pts });
  draw.last = p.clone();
  draw.pending = [];
  if (!practicing) socket.emit('draw:start', { id: draw.strokeId, color: draw.color, width, p: pts });
  $('#holdBtn').classList.add('active');
  vibrate(15);
}

function endStroke() {
  if (!draw.active) return;
  flushPoints(true);
  draw.active = false;
  draw.strokeId = null;
  draw.surf = null;
  draw.lastEnd = performance.now();
  $('#holdBtn').classList.remove('active');
}

function flushPoints(force) {
  if (!draw.pending.length || practicing) {
    draw.pending = [];
    return;
  }
  const now = performance.now();
  if (!force && now - draw.lastSend < 50) return;
  socket.emit('draw:points', { id: draw.strokeId, pts: draw.pending });
  draw.pending = [];
  draw.lastSend = now;
  if (force) return;
  if (sculptureFull()) return endStroke();
  const s = scene.strokes.get(draw.strokeId);
  if (s && s.points.length >= STROKE_SPLIT) continueStroke(s);
}

// Mirror the server's caps (lib/game.js) so long sweeps and big sculptures never silently stop syncing.
const STROKE_SPLIT = 1400; // points per stroke (server max 1500)
const MAX_INK = 19800; // points per sculpture (server max 20000)
const MAX_STROKES = 400;

/** Carry a long sweep on in a fresh stroke, starting where the old one ended. */
function continueStroke(s) {
  const last = s.points[s.points.length - 1];
  const pts = [round(last.x), round(last.y), round(last.z)];
  draw.strokeId = `${(me?.playerId || 'x').slice(0, 4)}${Date.now().toString(36)}${draw.counter++}`;
  scene.addStroke({ id: draw.strokeId, color: s.color, width: s.width, pts });
  socket.emit('draw:start', { id: draw.strokeId, color: s.color, width: s.width, p: pts });
}

function sculptureFull() {
  const full = scene.strokes.size >= MAX_STROKES || scene.inkCount() >= MAX_INK;
  if (full) {
    showCoach('<b>Your sculpture is full!</b><br/>Undo or clear some strokes to keep sculpting.', 3500);
  }
  return full;
}

const round = (v) => Math.round(v * 1000) / 1000;
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
let pointerNdc = null;

function currentQuaternion(dt) {
  if (motion.hasOrientation) return motion.quaternion(dt);
  tmpE.set(draw.pitch, draw.yaw, 0, 'YXZ');
  return tmpQ.setFromEuler(tmpE);
}

const UP = new THREE.Vector3(0, 1, 0);
const aimDir = () => new THREE.Vector3(0, 0, -1).applyQuaternion(scene.camera.quaternion);
const freePoint = () => aimDir().multiplyScalar(draw.depth);
const brushOffset = () => SIZES[draw.sizeIdx].w * 0.9; // sit the ink on the surface, not inside it
const SAME_SURFACE = 0.64; // cos(50°): follow curves smoothly, but don't jump around sharp edges

/** The stamped shape surface the brush points at (world space), or null. */
function surfaceAt() {
  if (!draw.snap) return null;
  return scene.pickSurface(scene.camera.position, aimDir());
}

/**
 * Where the brush is (world space).
 *  • Painting on a shape: follow its surface; past a flat face's edge, keep going in that face's plane.
 *  • Pointing at a shape: sit on its surface (depth is automatic).
 *  • Otherwise: along the aim at the depth-slider distance.
 */
function currentPoint() {
  const o = scene.camera.position;
  const dir = aimDir();
  if (draw.active && draw.surf) {
    const hit = draw.snap ? scene.pickSurface(o, dir) : null;
    if (hit && hit.normal.dot(draw.surf.normal) > SAME_SURFACE) {
      draw.surf = hit;
      return hit.point.clone().addScaledVector(hit.normal, brushOffset());
    }
    const n = draw.surf.normal;
    const denom = n.dot(dir);
    if (Math.abs(denom) > 0.05) {
      const t = n.dot(draw.surf.point.clone().sub(o)) / denom;
      if (t > 0.05 && t < 6) return o.clone().addScaledVector(dir, t).addScaledVector(n, brushOffset());
    }
    return draw.last ? draw.last.clone() : freePoint();
  }
  if (draw.active) return freePoint();
  draw.hover = surfaceAt();
  if (draw.hover) return draw.hover.point.clone().addScaledVector(draw.hover.normal, brushOffset());
  return freePoint();
}

// ---------- 3D shapes: pick one, hold to grow, release to place ----------

function buildTools() {
  $('#tools').innerHTML =
    `<button data-t="brush" class="on" aria-label="Brush">🖌️<span>Brush</span></button>` +
    `<button class="snap on" id="snapBtn" aria-label="Snap to surfaces">🧲<span>Snap</span></button><i class="sep"></i>` +
    SHAPES.map(([id, label, icon]) => `<button data-t="${id}" aria-label="${label}">${icon}<span>${label}</span></button>`).join('');
}
buildTools();

function holdLabel() {
  if (draw.tool === 'brush') return 'Hold to<br />sculpt';
  const def = SHAPES.find((x) => x[0] === draw.tool);
  return `Hold to grow<br />${def ? def[1] : 'shape'}`;
}

function setTool(t) {
  cancelShape();
  endStroke();
  draw.tool = t;
  for (const b of $('#tools').querySelectorAll('button[data-t]')) b.classList.toggle('on', b.dataset.t === t);
  $('#rotBar').classList.toggle('hidden', t === 'brush');
  if (t === 'brush') scene.setGhost(null);
  if (!draw.peek) $('#holdBtn').innerHTML = holdLabel();
  hideCoach();
  if (t !== 'brush' && !setTool.tipped) {
    setTool.tipped = true;
    showCoach('<b>Hold</b> the button to grow your shape, <b>let go</b> to place it.<br/>Turn it with <b>X Y Z</b> on the left, or <b>flick your wrist</b> while it grows.', 5000);
  }
}
$('#tools').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  vibrate(8);
  if (b.id === 'snapBtn') {
    draw.snap = !draw.snap;
    b.classList.toggle('on', draw.snap);
    showCoach(draw.snap ? '🧲 <b>Snap on:</b> point at a shape to paint on its surface.' : '🧲 <b>Snap off:</b> the depth slider controls where you paint.', 2200);
    return;
  }
  setTool(b.dataset.t);
});

function canSculpt() {
  if (screen !== 'sDraw' || draw.active || draw.grow || draw.peek) return false;
  if (!practicing && performance.now() < countdownUntil) return false;
  if (!practicing && !(state && state.phase === 'draw' && isDrawer())) return false;
  if (!practicing && sculptureFull()) return false;
  return true;
}

function startShape() {
  if (!canSculpt()) return;
  hideCoach();
  closeHelp();
  const hit = surfaceAt();
  draw.grow = {
    t: draw.tool,
    start: performance.now(),
    anchor: hit ? hit.point.clone() : freePoint(),
    normal: hit ? hit.normal.clone() : null,
    k: 0.06,
  };
  $('#holdBtn').classList.add('active', 'growing');
  vibrate(15);
}

/** Shape placement in sculpture space: centre, rotation and size. */
function shapeSpec(g) {
  const anchor = scene.toSculpture(g.anchor);
  const q = new THREE.Quaternion();
  let center;
  const ext = shapeExtent(g.t);
  if (g.normal) {
    // Stand it on the surface we pointed at, its base touching the surface.
    const n = g.normal.clone().transformDirection(scene.turnInverse);
    q.setFromUnitVectors(UP, n);
    center = anchor.clone().addScaledVector(n, ext.down * g.k);
  } else {
    // Floating: upright, front turned towards you, and growing AWAY from you (its front stays where you aimed).
    const eye = scene.eye();
    q.setFromAxisAngle(UP, Math.atan2(eye.x - anchor.x, eye.z - anchor.z));
    const away = anchor.clone().sub(eye).setY(0);
    if (away.lengthSq() < 1e-6) away.set(0, 0, -1);
    away.normalize();
    center = anchor.clone().addScaledVector(away, ext.front * g.k);
  }
  q.multiply(draw.rot); // your X / Y / Z rotation, relative to that upright / on-surface pose
  return { t: g.t, color: draw.color, center, q, k: g.k, preview: !!g.preview };
}

/** How far a shape (with the current rotation) reaches below its centre and towards you, at size 1. */
function shapeExtent(t) {
  const box = shapeGeometry(t).geo.boundingBox;
  let minY = Infinity, maxZ = -Infinity;
  const v = new THREE.Vector3();
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    v.set(x, y, z).applyQuaternion(draw.rot);
    minY = Math.min(minY, v.y);
    maxZ = Math.max(maxZ, v.z);
  }
  return { down: -minY, front: maxZ };
}

// ---------- Rotating the next shape: X / Y / Z buttons, or flick your wrist while growing ----------

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const AXIS_NAMES = { x: 'X (tip)', y: 'Y (spin)', z: 'Z (roll)' };

function rotateShape(axis, sign = 1, step = Math.PI / 4) {
  draw.rot.premultiply(new THREE.Quaternion().setFromAxisAngle(AXES[axis], sign * step)).normalize();
}

$('#rotBar').addEventListener('click', (e) => {
  const ax = e.target.closest('button')?.dataset.ax;
  if (!ax) return;
  vibrate(8);
  hideCoach();
  if (ax === 'reset') {
    draw.rot.identity();
    toast('⟲ Rotation reset');
  } else {
    rotateShape(ax);
    toast(`↻ 45° around ${AXIS_NAMES[ax]}`);
  }
});

function toast(text, ms = 1100) {
  const el = $('#drawToast');
  el.textContent = text;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.add('hidden'), ms);
}

function growTick(now) {
  const g = draw.grow;
  const secs = (now - g.start) / 1000;
  // Grows quickly at first, then slows so it's easy to stop at the size you want.
  // Never bigger than the distance you aimed at, so a shape can't swallow your view.
  const maxK = Math.min(1.2, Math.max(0.15, g.anchor.length() * 0.9));
  g.k = Math.min(maxK, 0.06 + (maxK - 0.06) * (1 - Math.exp(-secs * 0.7)));
  g.maxK = maxK;
  scene.setGhost(shapeSpec(g));
  $('#holdBtn').innerHTML = `Let go to<br />place · ${Math.round((g.k / maxK) * 100)}%`;
  if (g.k > maxK * 0.985 && !g.maxed) {
    g.maxed = true;
    vibrate(30);
  }
}

function endShape() {
  const g = draw.grow;
  if (!g) return;
  draw.grow = null;
  draw.lastEnd = performance.now();
  scene.setGhost(null);
  $('#holdBtn').classList.remove('active', 'growing');
  $('#holdBtn').innerHTML = holdLabel();
  const spec = shapeSpec(g);
  const id = `${(me?.playerId || 'x').slice(0, 4)}${Date.now().toString(36)}${draw.counter++}`;
  const pts = [round(spec.center.x), round(spec.center.y), round(spec.center.z)];
  const shape = { t: spec.t, q: spec.q.toArray().map((v) => Math.round(v * 10000) / 10000), k: Math.round(spec.k * 1000) / 1000 };
  scene.addStroke({ id, color: draw.color, width: 0.02, pts, shape });
  if (!practicing) socket.emit('draw:start', { id, color: draw.color, width: 0.02, p: pts, shape });
  vibrate([20, 30, 40]);
  sfx.join();
}

function cancelShape() {
  if (!draw.grow) return;
  draw.grow = null;
  scene.setGhost(null);
  $('#holdBtn').classList.remove('active', 'growing');
}

const holdStart = () => (draw.tool === 'brush' ? startStroke() : startShape());
const holdEnd = () => {
  endStroke();
  endShape();
};

const holdBtn = $('#holdBtn');
holdBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (draw.peek) return setPeek(false); // while peeking, the big button means "back to sculpting"
  holdBtn.setPointerCapture(e.pointerId);
  holdStart();
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => holdBtn.addEventListener(ev, holdEnd));
holdBtn.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && screen === 'sDraw' && !e.repeat) { e.preventDefault(); holdStart(); }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') holdEnd();
});
window.addEventListener('keydown', (e) => {
  if (screen !== 'sDraw' || e.repeat || e.target.matches?.('input, textarea')) return;
  if (e.code === 'KeyQ') turnSculpture(-1);
  else if (e.code === 'KeyE') turnSculpture(1);
  else if (e.code === 'KeyR') { scene.tiltBy(Math.PI / 8); renderTurnBar(); }
  else if (e.code === 'KeyF') { scene.tiltBy(-Math.PI / 8); renderTurnBar(); }
  else if (e.code === 'Digit0') { scene.resetView(); renderTurnBar(); }
  else if (e.code === 'KeyV') setPeek(!draw.peek);
});

// ---------- Turntable & peek: paint every side of a 3D object ----------

const TURN_NAMES = ['front', 'front-left', 'left side', 'back-left', 'back', 'back-right', 'right side', 'front-right'];

/** Spin the sculpture an eighth of a turn (dir = -1 or 1) so a different side faces you. */
function turnSculpture(dir) {
  hideCoach();
  setPeek(false);
  scene.turnBy((dir * Math.PI) / 4);
  renderTurnBar();
  vibrate(10);
}

function setPeek(on, force = false) {
  if (on === draw.peek && !force) return;
  endStroke();
  draw.peek = on;
  scene.setMode(on ? 'peek' : 'drawer');
  if (on) {
    scene.resetOrbit();
    scene.setDrawerEye(scene.eye().toArray()); // show yourself where you're standing
  }
  $('#sDraw').classList.toggle('peeking', on);
  cancelShape();
  $('#holdBtn').innerHTML = on ? 'Back to<br />sculpting' : holdLabel();
  renderTurnBar();
  if (!force) vibrate(10);
}

function renderTurnBar() {
  const step = ((Math.round(scene.turn.target / (Math.PI / 4)) % 8) + 8) % 8;
  const tilt = scene.turn.tiltTarget;
  const side = tilt > 1.05 ? 'top' : tilt < -1.05 ? 'bottom' : TURN_NAMES[step];
  const from = Math.abs(tilt) > 1.05 ? '' : tilt > 0.3 ? ' · from above' : tilt < -0.3 ? ' · from below' : '';
  $('#turnLabel').innerHTML = draw.peek
    ? '<small>peeking · drag to look around</small><b>Audience view</b>'
    : `<small>you're painting the</small><b>${side}${from}</b>`;
  $('#turnBar').classList.toggle('turned', (step !== 0 || Math.abs(tilt) > 0.3) && !draw.peek);
  $('#peekBtn').classList.toggle('on', draw.peek);
}

$('#turnLeft').addEventListener('click', () => turnSculpture(-1));
$('#turnRight').addEventListener('click', () => turnSculpture(1));
$('#peekBtn').addEventListener('click', () => setPeek(!draw.peek));

/** Tell viewers where we stand relative to the sculpture, so their view of us matches after a spin. */
function sendEye(now) {
  const e = scene.eye();
  const moved = !draw.lastEye || e.distanceTo(draw.lastEye) > 0.01;
  if (!moved && now - draw.lastEyeSent < 2000) return;
  draw.lastEye = e;
  draw.lastEyeSent = now;
  socket.emit('draw:view', { e: [round(e.x), round(e.y), round(e.z)] });
}

// Canvas gestures:
//   drawer without gyro → drag to look around, scroll for depth
//   guessers            → drag to orbit the sculpture, pinch/scroll to zoom, double-tap to go back to auto-spin
const canvas = $('#scene');
const pointers = new Map();
let pinchDist = null;
let lastTap = 0;
const orbiting = () => screen === 'sGuess' || (screen === 'sDraw' && draw.peek);

canvas.addEventListener('contextmenu', (e) => screen === 'sDraw' && e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (orbiting()) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    const now = performance.now();
    if (now - lastTap < 300 && pointers.size === 1) resetView();
    lastTap = now;
    return;
  }
  if (screen !== 'sDraw') return;
  if (motion.hasOrientation || e.shiftKey || e.button === 2) {
    // Swipe on the scene to see your sculpture from any angle:
    // sideways spins it, up/down tips it so you see its top or bottom. Double-tap for the front view again.
    const now = performance.now();
    if (now - lastTap < 300) {
      scene.resetView();
      renderTurnBar();
      toast('⟲ Front view');
    }
    lastTap = now;
    draw.spin = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  pointerNdc = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (orbiting() && pointers.has(e.pointerId)) {
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      scene.orbitBy(-(e.clientX - prev.x) * 0.009, (e.clientY - prev.y) * 0.007);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist) scene.zoomBy(pinchDist / d);
      pinchDist = d;
    }
    updateViewUi();
    return;
  }
  if (draw.spin && screen === 'sDraw') {
    const dx = e.clientX - draw.spin.x;
    const dy = e.clientY - draw.spin.y;
    draw.spin.x = e.clientX;
    draw.spin.y = e.clientY;
    if (dx || dy) {
      hideCoach();
      scene.turnBy(dx * 0.008);
      scene.tiltBy(dy * 0.008); // drag down = tip the top towards you
      renderTurnBar();
    }
    return;
  }
  if (!pointerNdc) return;
  draw.yaw -= (e.clientX - pointerNdc.x) * 0.006;
  draw.pitch = Math.max(-1.4, Math.min(1.4, draw.pitch - (e.clientY - pointerNdc.y) * 0.006));
  pointerNdc = { x: e.clientX, y: e.clientY };
});
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = null;
  pointerNdc = null;
  draw.spin = null;
};
['pointerup', 'pointercancel'].forEach((ev) => canvas.addEventListener(ev, endPointer));
canvas.addEventListener('wheel', (e) => {
  if (orbiting()) {
    scene.zoomBy(e.deltaY > 0 ? 1.08 : 0.93);
    updateViewUi();
    return;
  }
  if (screen !== 'sDraw') return;
  setDepthSlider(depthFromV(vFromDepth(draw.depth) + (e.deltaY > 0 ? -0.08 : 0.08)));
  flashDepth();
}, { passive: true });

function resetView() {
  scene.resetOrbit();
  updateViewUi();
}
function updateViewUi() {
  $('#autoView').classList.toggle('hidden', !scene.isManual);
  if (scene.isManual) $('#orbitHint').style.opacity = '0';
}
$('#autoView').addEventListener('click', resetView);

$('#recenterBtn').addEventListener('click', () => {
  if (motion.hasOrientation) motion.recenter();
  else { draw.yaw = 0; draw.pitch = 0; }
  vibrate(20);
});
$('#undoBtn').addEventListener('click', () => {
  endStroke();
  if (practicing) scene.undoLast();
  else socket.emit('draw:undo');
});
$('#clearBtn').addEventListener('click', () => {
  endStroke();
  if (practicing) scene.clear();
  else if (confirm('Clear your whole sculpture?')) socket.emit('draw:clear');
});
$('#sizeBtn').addEventListener('click', () => {
  draw.sizeIdx = (draw.sizeIdx + 1) % SIZES.length;
  $('#sizeBtn').textContent = SIZES[draw.sizeIdx].label;
});

// Main per-frame loop for the drawer.
let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  if (screen === 'sLobby') updateSensorTest();
  if (screen !== 'sDraw' || draw.peek) return; // while peeking, the scene orbits on its own

  const q = currentQuaternion(dt);
  scene.setDrawerQuaternion(q);

  const p = currentPoint();
  scene.setReticle(p, draw.color, draw.active);
  const surf = draw.active ? draw.surf : draw.grow ? null : draw.hover;
  scene.setSurfaceMarker(surf ? p : null, surf?.normal, draw.color);
  $('#depthMeter').classList.toggle('snapped', !!surf);
  if (draw.grow) growTick(now);
  else if (draw.tool !== 'brush') {
    // Show a faint, small preview of the next shape (with its rotation) where it would go.
    const anchor = draw.hover ? draw.hover.point.clone() : freePoint();
    scene.setGhost(shapeSpec({ t: draw.tool, anchor, normal: draw.hover?.normal || null, k: Math.min(0.3, anchor.length() * 0.6), preview: true }));
  }

  if (draw.active && draw.strokeId) {
    if (p.distanceTo(draw.last) > 0.008) {
      const s = scene.toSculpture(p);
      const pts = [round(s.x), round(s.y), round(s.z)];
      scene.appendPoints(draw.strokeId, pts);
      draw.pending.push(...pts);
      draw.last.copy(p);
    }
    flushPoints(false);
  }
  if (!practicing && now - draw.lastCursor > 70 && state?.phase === 'draw') {
    draw.lastCursor = now;
    const c = scene.toSculpture(p);
    socket.emit('draw:cursor', { p: [round(c.x), round(c.y), round(c.z)], drawing: draw.active, color: draw.color });
    sendEye(now);
  }
}
requestAnimationFrame(frame);

// =====================================================================
// Lobby sensor check
// =====================================================================

let sensorChecked = performance.now();
function updateSensorTest() {
  const dot = $('#tiltDot');
  const st = $('#sensorStatus');
  if (motion.hasOrientation) {
    const x = Math.max(-39, Math.min(39, (motion.raw.gamma / 40) * 39));
    const y = Math.max(-39, Math.min(39, ((motion.raw.beta - 60) / 40) * 39));
    dot.style.transform = `translate(${x}px, ${y}px)`;
    st.innerHTML = '<span class="ok">✅ Motion sensors working</span><br/>Tilt to move the dot';
  } else if (performance.now() - sensorChecked > 2000) {
    st.innerHTML = '<span class="bad">⚠️ No motion data.</span> On iPhone, reload and tap Join to allow Motion access. Fallback controls will be used.';
  }
}

motion.onShake(() => {
  if (screen === 'sLobby') {
    $('#shakeStatus').innerHTML = '<span class="ok">Shake detected! 💥</span>';
    vibrate(80);
    sfx.buzz();
    clearTimeout(motion._t);
    motion._t = setTimeout(() => ($('#shakeStatus').textContent = 'Shake your phone to test 🫨'), 1800);
  } else if (screen === 'sGuess' && !throwing && performance.now() > ignoreShakeUntil) {
    openGuess();
  } else if (screen === 'sDraw' && !draw.peek && !draw.active && !draw.grow && performance.now() - draw.lastEnd > 700) {
    // Sculptor: shake to undo (like a real-life "shake to undo"), but never mid-stroke.
    if (!scene.strokes.size) return;
    if (practicing) scene.undoLast();
    else socket.emit('draw:undo');
    toast('↶ Shaken off! (undo)');
    vibrate([40, 30, 40]);
    sfx.wrong();
  }
});
motion.onFlick((rate) => {
  if (throwing) return throwPower();
  // Sculptor: flick your wrist while growing a shape to turn it 90° around the axis you flicked.
  if (screen === 'sDraw' && draw.grow && rate) {
    const a = Math.abs(rate.alpha), b = Math.abs(rate.beta), g = Math.abs(rate.gamma);
    const [axis, v] = b >= g && b >= a ? ['x', rate.beta] : g >= a ? ['y', rate.gamma] : ['z', rate.alpha];
    rotateShape(axis, Math.sign(v) || 1, Math.PI / 2);
    toast(`🌀 Flick! 90° around ${AXIS_NAMES[axis]}`);
    vibrate([15, 20, 15]);
  }
});

// =====================================================================
// Guessers
// =====================================================================

let frozenUntil = 0;
let freezeRaf = null;

function canGuess() {
  return state?.phase === 'draw' && !isDrawer() && !myGuessed() && performance.now() > frozenUntil;
}
function myGuessed() {
  return !!state?.players.find((p) => p.id === me?.playerId)?.guessed;
}

function resetGuessUi() {
  frozenUntil = 0;
  $('#guessForm').classList.add('hidden');
  $('#guessInput').value = '';
  $('#guessStatus').textContent = '';
  $('#guessStatus').className = 'status';
  $('#frozenBar').classList.add('hidden');
  $('#gotIt').classList.add('hidden');
}

function renderGuess() {
  const s = state;
  const d = s.players.find((p) => p.id === s.drawerId);
  $('#guessWho').innerHTML = d ? `<b style="color:${esc(d.color)}">${esc(d.name)}</b> is sculpting ${pips(s.difficulty)}` : '';
  const guessed = myGuessed();
  renderMask($('#guessMask'), guessed && priv.word ? priv.word : priv.secretMask || s.wordMask);
  renderPowerbar();
  $('#shieldBadge').classList.toggle('hidden', !priv.shielded);
  const frozen = performance.now() < frozenUntil;
  const formOpen = !$('#guessForm').classList.contains('hidden');
  $('#shakePrompt').classList.toggle('hidden', guessed || frozen || formOpen);
  $('#tapGuess').classList.toggle('hidden', guessed || frozen || formOpen || !!(motion.hasMotion && motion.hasOrientation));
  if (guessed) {
    $('#guessForm').classList.add('hidden');
    $('#frozenBar').classList.add('hidden');
    const mine = s.players.find((p) => p.id === me.playerId);
    $('#gotIt').innerHTML = `<b>You got it! ✅</b><span class="small">+${mine.delta} · watch the others sweat</span>`;
    $('#gotIt').classList.remove('hidden');
    $('#guessStatus').textContent = '';
  }
}

function openGuess() {
  if (!canGuess()) return;
  socket.emit('buzz');
  vibrate([40, 30, 40]);
  sfx.buzz();
  $('#guessForm').classList.remove('hidden');
  $('#guessStatus').textContent = '';
  renderGuess();
  setTimeout(() => $('#guessInput').focus(), 30);
}
$('#tapGuess').addEventListener('click', openGuess);

$('#guessForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#guessInput').value.trim();
  if (!text) return;
  $('#guessInput').value = '';
  const res = await socket.emitWithAck('guess', { text });
  const st = $('#guessStatus');
  if (res.result === 'correct') {
    st.textContent = '';
    $('#guessForm').classList.add('hidden');
    $('#guessInput').blur();
    vibrate([80, 40, 160]);
    sfx.correct();
  } else if (res.result === 'close' || res.result === 'wrong' || res.result === 'frozen') {
    st.textContent = res.result === 'close' ? '🔥 SO close! Frozen…' : res.result === 'wrong' ? `❌ Nope! Frozen…` : 'Still frozen…';
    st.className = `status ${res.result === 'close' ? 'warn' : 'bad'}`;
    $('#guessForm').classList.add('hidden');
    $('#guessInput').blur();
    vibrate(250);
    res.result === 'close' ? sfx.close() : sfx.wrong();
    startFreeze(res.frozenMs || 4000);
  }
  renderGuess();
});

function startFreeze(ms) {
  frozenUntil = performance.now() + ms;
  const total = ms;
  $('#frozenBar').classList.remove('hidden');
  cancelAnimationFrame(freezeRaf);
  const step = () => {
    const rem = frozenUntil - performance.now();
    $('#frozenFill').style.width = `${Math.max(0, rem / total) * 100}%`;
    if (rem > 0) freezeRaf = requestAnimationFrame(step);
    else {
      $('#frozenBar').classList.add('hidden');
      if (screen === 'sGuess' && !myGuessed()) {
        $('#guessStatus').textContent = 'Unfrozen — shake again!';
        $('#guessStatus').className = 'status';
      }
      renderGuess();
    }
  };
  step();
  renderGuess();
}

// =====================================================================
// Timers
// =====================================================================

setInterval(() => {
  if (!state) return;
  if (state.paused) clock.sync(state); // freeze the countdown while paused
  if (screen === 'sDraw' && !practicing) setTimer($('#drawTimer'), $('#drawTimerText'), clock);
  if (screen === 'sGuess') setTimer($('#guessTimer'), $('#guessTimerText'), clock);
  if (screen === 'sChoose') $('#chooseTimer').textContent = `Auto-pick in ${Math.ceil(clock.remaining() / 1000)}s`;
}, 200);

// =====================================================================
// Power-ups
// =====================================================================

const POWER_INFO = {
  fog: { emoji: '🌫️', name: 'Fog', desc: 'Blur their view', rival: true },
  flip: { emoji: '🙃', name: 'Flip', desc: 'Turn their view upside down', rival: true },
  spin: { emoji: '🌀', name: 'Dizzy', desc: 'Spin their camera wildly', rival: true },
  freeze: { emoji: '🧊', name: 'Freeze', desc: "They can't guess for 6s", rival: true },
  hint: { emoji: '💡', name: 'Secret hint', desc: 'A letter only you can see', rival: false },
  shield: { emoji: '🛡️', name: 'Shield', desc: 'Block the next attack on you', rival: false },
};
let throwing = null; // { type, targetId }
let ignoreShakeUntil = 0;
let currentOrb = null;
const fxTimers = {};

function renderPowerbar() {
  const on = state?.settings?.powerups && state.phase === 'draw' && !isDrawer() && !myGuessed();
  $('#powerbar').classList.toggle('hidden', !on);
  if (!on) return;
  const list = priv.powers || [];
  const key = list.join(',');
  if ($('#powerbar').dataset.key === key) return;
  $('#powerbar').dataset.key = key;
  $('#powerbar').innerHTML = [0, 1, 2].map((i) => list[i]
    ? `<button data-i="${i}" data-type="${list[i]}" title="${POWER_INFO[list[i]].name}">${POWER_INFO[list[i]].emoji}</button>`
    : '<span class="slot"></span>').join('');
}

$('#powerbar').addEventListener('click', (e) => {
  const type = e.target.closest('button')?.dataset.type;
  if (!type) return;
  vibrate(15);
  const info = POWER_INFO[type];
  if (!info.rival) return usePower(type, null);
  const rivals = state.players.filter((p) => p.connected && p.id !== me.playerId && p.id !== state.drawerId);
  if (!rivals.length) return flash('No one to target!', 'warn');
  $('#tpTitle').textContent = `${info.emoji} ${info.name}: ${info.desc}. Who gets it?`;
  $('#tpList').innerHTML = rivals.map((p) => `<button data-id="${p.id}">${avatar(p)}<span>${esc(p.name)}</span></button>`).join('');
  $('#tpList').dataset.type = type;
  $('#targetPick').classList.remove('hidden');
});
$('#tpList').addEventListener('click', (e) => {
  const id = e.target.closest('button')?.dataset.id;
  if (!id) return;
  const type = $('#tpList').dataset.type;
  $('#targetPick').classList.add('hidden');
  // Arm the throw: the player flicks their phone to launch it.
  throwing = { type, targetId: id };
  const target = state.players.find((p) => p.id === id);
  $('#throwIco').textContent = POWER_INFO[type].emoji;
  $('#throwTitle').textContent = `Aim at ${target?.name || 'them'}…`;
  $('#throwTap').classList.toggle('hidden', false);
  $('#throwPrompt').classList.remove('hidden');
  vibrate(30);
});
$('#tpCancel').addEventListener('click', () => $('#targetPick').classList.add('hidden'));
$('#throwTap').addEventListener('click', () => throwPower());

function throwPower() {
  if (!throwing) return;
  const { type, targetId } = throwing;
  throwing = null;
  ignoreShakeUntil = performance.now() + 1500;
  $('#throwPrompt').classList.add('hidden');
  usePower(type, targetId);
}

async function usePower(type, targetId) {
  const res = await socket.emitWithAck('power:use', { type, targetId });
  if (!res.ok) return flash("Couldn't use that right now", 'warn');
  vibrate([20, 30, 60]);
  sfx.power();
  if (res.blocked) flash('🛡️ Blocked by their shield!', 'warn');
  else if (type === 'hint') flash('💡 Secret letter revealed (in blue)', 'good');
  else if (type === 'shield') flash('🛡️ Shield up — the next attack bounces off', 'good');
  else flash(`${POWER_INFO[type].emoji} Direct hit!`, 'good');
}

function flash(text, cls = '') {
  const st = $('#guessStatus');
  st.textContent = text;
  st.className = `status ${cls}`;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => {
    if (st.textContent === text) st.textContent = '';
  }, 2500);
}

// Being hit by someone else's power-up.
socket.on('effect', ({ type, ms, fromName }) => {
  if (screen !== 'sGuess') return;
  const info = POWER_INFO[type];
  vibrate([100, 50, 100]);
  sfx.wrong();
  const label = $('#fxLabel');
  label.textContent = `${info.emoji} ${fromName} hit you with ${info.name}!`;
  label.classList.remove('hidden');
  clearTimeout(fxTimers.label);
  fxTimers.label = setTimeout(() => label.classList.add('hidden'), 2200);
  if (type === 'fog') {
    $('#fxFog').classList.remove('hidden');
    clearTimeout(fxTimers.fog);
    fxTimers.fog = setTimeout(() => $('#fxFog').classList.add('hidden'), ms);
  } else if (type === 'flip') {
    $('#stage').classList.add('flipped');
    clearTimeout(fxTimers.flip);
    fxTimers.flip = setTimeout(() => $('#stage').classList.remove('flipped'), ms);
  } else if (type === 'spin') {
    scene.dizzy(ms);
  }
  // Freeze arrives through the private state (frozenMs).
});

function clearEffects() {
  Object.values(fxTimers).forEach(clearTimeout);
  $('#fxFog').classList.add('hidden');
  $('#fxLabel').classList.add('hidden');
  $('#stage').classList.remove('flipped');
  $('#targetPick').classList.add('hidden');
  $('#throwPrompt').classList.add('hidden');
  $('#orbGrab').classList.add('hidden');
  throwing = null;
  scene.dizzy(0);
}

socket.on('orb', ({ id, ms }) => {
  if (screen !== 'sGuess' || myGuessed()) return;
  currentOrb = id;
  $('#orbGrab').classList.remove('hidden');
  vibrate([30, 30, 30, 30, 30]);
  sfx.orb();
  clearTimeout(fxTimers.orb);
  fxTimers.orb = setTimeout(() => $('#orbGrab').classList.add('hidden'), ms);
});
socket.on('orb:gone', ({ id, by }) => {
  if (id !== currentOrb) return;
  $('#orbGrab').classList.add('hidden');
  if (by && by !== me?.playerId && screen === 'sGuess') flash('Someone else grabbed the orb 😤', 'warn');
});
$('#orbBtn').addEventListener('click', async () => {
  const id = currentOrb;
  $('#orbGrab').classList.add('hidden');
  const res = await socket.emitWithAck('orb:grab', { id });
  if (res.ok) {
    vibrate([50, 30, 90]);
    flash(`Got it: ${POWER_INFO[res.power].emoji} ${POWER_INFO[res.power].name}!`, 'good');
  } else if (res.reason === 'full') flash('Your power slots are full — use one!', 'warn');
  else flash('Too slow!', 'bad');
});

// =====================================================================
// Take-home GIFs (podium)
// =====================================================================

// Every GIF is downloaded onto the phone as soon as it's ready, so it survives "play again",
// the room closing, or the laptop shutting down — no QR code needed.
const gifStore = []; // { key, word, drawerName, winnerName, mine, drew, url (blob), blob, pending }
let myId = null;

socket.on('gallery', (g) => {
  for (const e of g || []) addGalleryEntry(e);
  renderGifs();
});
socket.on('gif:ready', ({ index, url }) => {
  const e = gifStore.find((x) => x.roomIndex === index && x.code === me?.code && x.gameId === currentGameId);
  if (e && !e.url) fetchGif(e, url);
});

let currentGameId = 0;
function addGalleryEntry(e) {
  const code = me?.code;
  if (gifStore.some((x) => x.code === code && x.gameId === currentGameId && x.roomIndex === e.index)) return;
  const entry = {
    code,
    gameId: currentGameId,
    roomIndex: e.index,
    word: e.word,
    drawerName: e.drawerName,
    winnerName: e.winnerName,
    drew: e.drawerId === myId,
    won: e.winnerId === myId,
    url: null,
    blob: null,
  };
  entry.mine = entry.drew || entry.won;
  gifStore.push(entry);
  if (e.gifUrl) fetchGif(entry, e.gifUrl);
}

async function fetchGif(entry, url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    entry.blob = await res.blob();
    entry.url = URL.createObjectURL(entry.blob);
    renderGifs();
  } catch {}
}

function gifCards(list) {
  return list.map((g) => {
    const i = gifStore.indexOf(g);
    const tag = g.drew ? '✏️ you sculpted' : g.won ? '✅ you guessed' : `by ${esc(g.drawerName)}`;
    return `<figure class="${g.mine ? 'mine' : ''}">${g.url ? `<img src="${g.url}" alt="${esc(g.word)}">` : '<div class="wait">Rendering GIF…</div>'}
      <figcaption><span><b>${esc(g.word)}</b><br/><span class="small">${tag}</span></span>
      </figcaption>
      ${g.url ? `<div class="gif-actions">
        <a class="dl-btn" href="${g.url}" download="sculpt-and-spin-${esc(g.word.replace(/\s+/g, '-'))}.gif">⬇ Download</a>
        ${navigator.canShare ? `<button class="share-btn share" data-i="${i}">↗ Share</button>` : ''}
      </div>` : ''}
    </figure>`;
  }).join('');
}

function latestGame() {
  const last = gifStore[gifStore.length - 1];
  return last ? gifStore.filter((g) => g.code === last.code && g.gameId === last.gameId) : [];
}

function renderGifs() {
  const game = latestGame();
  // Podium: everything from this game, your own first.
  const sorted = [...game].sort((a, b) => Number(b.mine) - Number(a.mine));
  $('#myGifs').innerHTML = gifCards(sorted);
  $('#gifHead').classList.toggle('hidden', !game.length);
  if (!$('#gallerySheet').classList.contains('hidden')) $('#allGifs').innerHTML = gifCards(sorted);
  const ready = game.filter((g) => g.url).length;
  $('#lobbyGalleryBtn').classList.toggle('hidden', !ready);
  $('#lobbyGalleryBtn').textContent = `🎞️ Last game's GIFs (${ready})`;
  $('#joinGalleryBtn').classList.toggle('hidden', !ready);
}

function openGallery() {
  $('#gallerySheet').classList.remove('hidden');
  renderGifs();
}
$('#lobbyGalleryBtn').addEventListener('click', openGallery);
$('#joinGalleryBtn').addEventListener('click', openGallery);
$('#gsClose').addEventListener('click', () => $('#gallerySheet').classList.add('hidden'));
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button.share');
  if (!btn) return;
  const g = gifStore[Number(btn.dataset.i)];
  if (!g?.blob) return;
  const file = new File([g.blob], `sculpt-and-spin-${g.word.replace(/\s+/g, '-')}.gif`, { type: 'image/gif' });
  try {
    if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: `My Sculpt & Spin "${g.word}"` });
  } catch {}
});

socket.on('kicked', () => {
  me = null;
  state = null;
  localStorage.removeItem('sns-player');
  clearEffects();
  $('#pausedOverlay').classList.add('hidden');
  show('sJoin');
  $('#joinErr').textContent = 'The host removed you from the game.';
  vibrate(200);
});

socket.on('room:closed', () => {
  me = null;
  state = null;
  $('#pausedOverlay').classList.add('hidden');
  localStorage.removeItem('sns-player');
  clearEffects();
  show('sJoin');
  $('#joinErr').textContent = 'The host closed the room. Enter the new code to join again.';
  $('#room').value = '';
});

// Debug handle for the browser console.
window.__sns = { motion, get state() { return state; }, get priv() { return priv; }, get screen() { return screen; }, scene, get depth() { return draw.depth; } };
