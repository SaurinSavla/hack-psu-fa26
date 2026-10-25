// Phone controller: join, sculpt in the air (drawer), shake-to-guess (everyone else).

import * as THREE from 'three';
import { Sculpture } from './scene.js';
import { MotionInput, requestMotionPermission, twistOf } from './motion.js';
import { $, esc, avatar, renderMask, pips, PhaseClock, setTimer } from './common.js';
import { sfx, unlockAudio } from './sfx.js';

const socket = io({ transports: ['websocket', 'polling'] });
const motion = new MotionInput();
const clock = new PhaseClock();
const scene = new Sculpture($('#scene'), { mode: 'reveal' });
scene.setProgressSource(() => clock.progress());

const SWATCHES = ['#ff5d73', '#ffb53d', '#ffe53d', '#c6ff3d', '#3de0ff', '#a77bff', '#ff7ad9', '#ffffff'];
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
  const playerId = saved && saved.code === code ? saved.playerId : undefined;
  const res = await socket.emitWithAck('player:join', { code, name, playerId });
  if (!res.ok) {
    $('#joinErr').textContent = res.error;
    return false;
  }
  me = { playerId: res.playerId, name: res.name, color: res.color, code: res.code };
  myId = res.playerId;
  localStorage.setItem('sns-player', JSON.stringify({ code: res.code, playerId: res.playerId }));
  history.replaceState(null, '', `/?room=${res.code}`);
  return true;
}

socket.on('connect', () => {
  if (me) join(me.code, me.name);
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
  locked: false,
  counter: 0,
  lastSend: 0,
  lastCursor: 0,
  // Fallback (no gyro): look around by dragging.
  yaw: 0,
  pitch: 0,
};

function buildSwatches() {
  $('#swatches').innerHTML = SWATCHES.map((c) => `<button style="--c:${c}" data-c="${c}"></button>`).join('');
}
buildSwatches();
function setColor(c) {
  draw.color = c;
  for (const b of $('#swatches').children) b.classList.toggle('on', b.dataset.c === c);
  $('#holdBtn').style.setProperty('--hc', c);
}
$('#swatches').addEventListener('click', (e) => {
  const c = e.target.closest('button')?.dataset.c;
  if (c) { setColor(c); vibrate(10); }
});

function enterDraw() {
  scene.setMode('drawer');
  if (!draw.color) setColor(me?.color && SWATCHES.includes(me.color) ? me.color : SWATCHES[0]);
  $('#practiceDone').classList.toggle('hidden', !practicing);
  $('#drawTimer').classList.toggle('hidden', practicing);
  if (motion.hasOrientation) motion.recenter();
  const coach = $('#coach');
  coach.innerHTML = motion.hasOrientation
    ? `Hold your phone up like a camera and <b>point at the TV</b>, then tap <b>⟲</b>.<br/><br/><b>Hold the button</b> &amp; sweep to paint. <b>Twist</b> your wrist to push ink farther away.`
    : `<b>No motion sensors detected.</b><br/>Drag the screen to look around. Hold the button (or <b>Space</b>) to sculpt. Scroll to change depth.`;
  coach.style.opacity = '1';
  coach.classList.remove('hidden');
  clearTimeout(enterDraw.t);
  enterDraw.t = setTimeout(() => (coach.style.opacity = '0'), 6500);
}

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
  if (screen !== 'sDraw' || draw.active) return;
  if (!practicing && performance.now() < countdownUntil) return; // wait for "SCULPT!"
  if (!practicing && !(state && state.phase === 'draw' && isDrawer())) return;
  draw.active = true;
  draw.strokeId = `${(me?.playerId || 'x').slice(0, 4)}${Date.now().toString(36)}${draw.counter++}`;
  const p = currentPoint();
  const width = SIZES[draw.sizeIdx].w;
  const pts = [round(p.x), round(p.y), round(p.z)];
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

function currentPoint() {
  const q = scene.camera.quaternion;
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return dir.multiplyScalar(draw.depth);
}

const holdBtn = $('#holdBtn');
holdBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  holdBtn.setPointerCapture(e.pointerId);
  startStroke();
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => holdBtn.addEventListener(ev, endStroke));
holdBtn.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && screen === 'sDraw' && !e.repeat) { e.preventDefault(); startStroke(); }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') endStroke();
});

// Canvas gestures:
//   drawer without gyro → drag to look around, scroll for depth
//   guessers            → drag to orbit the sculpture, pinch/scroll to zoom, double-tap to go back to auto-spin
const canvas = $('#scene');
const pointers = new Map();
let pinchDist = null;
let lastTap = 0;

canvas.addEventListener('pointerdown', (e) => {
  if (screen === 'sGuess') {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    const now = performance.now();
    if (now - lastTap < 300 && pointers.size === 1) resetView();
    lastTap = now;
    return;
  }
  if (screen !== 'sDraw' || motion.hasOrientation) return;
  pointerNdc = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (screen === 'sGuess' && pointers.has(e.pointerId)) {
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
  if (!pointerNdc) return;
  draw.yaw -= (e.clientX - pointerNdc.x) * 0.006;
  draw.pitch = Math.max(-1.4, Math.min(1.4, draw.pitch - (e.clientY - pointerNdc.y) * 0.006));
  pointerNdc = { x: e.clientX, y: e.clientY };
});
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = null;
  pointerNdc = null;
};
['pointerup', 'pointercancel'].forEach((ev) => canvas.addEventListener(ev, endPointer));
canvas.addEventListener('wheel', (e) => {
  if (screen === 'sGuess') {
    scene.zoomBy(e.deltaY > 0 ? 1.08 : 0.93);
    updateViewUi();
    return;
  }
  if (screen !== 'sDraw' || draw.locked) return;
  draw.depth = Math.min(1.8, Math.max(0.5, draw.depth * (e.deltaY > 0 ? 1.06 : 0.94)));
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
$('#lockBtn').addEventListener('click', () => {
  draw.locked = !draw.locked;
  if (draw.locked) draw.depth = 1;
  $('#lockBtn').textContent = draw.locked ? '🔒' : '🔓';
  $('#depthMeter').classList.toggle('locked', draw.locked);
});

// Main per-frame loop for the drawer.
let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  if (screen === 'sLobby') updateSensorTest();
  if (screen !== 'sDraw') return;

  const q = currentQuaternion(dt);
  scene.setDrawerQuaternion(q);

  // Wrist twist → depth (with a dead zone so normal holding doesn't wobble).
  if (motion.hasOrientation && !draw.locked) {
    const tw = twistOf(q);
    if (tw !== null) {
      const deg = (tw * 180) / Math.PI;
      const dead = 12;
      const v = Math.sign(deg) * Math.min(1, Math.max(0, Math.abs(deg) - dead) / 45);
      const target = Math.pow(2, v * 0.9); // ≈0.54 … 1.87
      draw.depth += (target - draw.depth) * (1 - Math.exp(-dt * 10));
    }
  }
  const knobPct = 1 - (Math.log2(draw.depth) / 0.9 + 1) / 2;
  $('#depthKnob').style.top = `calc(${Math.max(0.06, Math.min(0.94, knobPct)) * 100}% - 11px)`;

  const p = currentPoint();
  scene.setReticle(p, draw.color, draw.active);

  if (draw.active && draw.strokeId) {
    if (p.distanceTo(draw.last) > 0.008) {
      const pts = [round(p.x), round(p.y), round(p.z)];
      scene.appendPoints(draw.strokeId, pts);
      draw.pending.push(...pts);
      draw.last.copy(p);
    }
    flushPoints(false);
  }
  if (!practicing && now - draw.lastCursor > 70 && state?.phase === 'draw') {
    draw.lastCursor = now;
    socket.emit('draw:cursor', { p: [round(p.x), round(p.y), round(p.z)], drawing: draw.active, color: draw.color });
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
  }
});
motion.onFlick(() => {
  if (throwing) throwPower();
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
window.__sns = { motion, get state() { return state; }, get priv() { return priv; }, get screen() { return screen; } };
