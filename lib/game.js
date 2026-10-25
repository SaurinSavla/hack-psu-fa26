// Core game state machine for Sculpt & Spin.
// A Room owns its players, phases, timers, strokes and scoring.
// It talks to the outside world only through the `io` (Socket.IO server) it is given.

const crypto = require('crypto');
const { pickChoices, aliasesFor, buildPool, cleanCustom, PACKS } = require('./words');
const ai = require('./ai');

const AI_ID = 'gemini-ai';
const AI_MAX_GUESSES = 6; // per turn (the TV spaces them out by turn length)

const CHOOSE_MS = Number(process.env.CHOOSE_MS) || 15000;
const REVEAL_MS = Number(process.env.REVEAL_MS) || 8000;
const FREEZE_MS = 4000;
const DRAWER_GRACE_MS = Number(process.env.DRAWER_GRACE_MS) || 8000;
const MAX_PLAYERS = 12;
const MAX_STROKES = 400;
const MAX_FLOATS_PER_STROKE = 3 * 1500;
const MAX_TOTAL_FLOATS = 3 * 20000;

const PLAYER_COLORS = [
  '#ff5d73', '#3de0ff', '#c6ff3d', '#ffb53d', '#a77bff', '#ff7ad9',
  '#3dffa8', '#ffe53d', '#5d8bff', '#ff8a3d', '#7affef', '#d4a5ff',
];
const DIFF_MULT = { 1: 1, 2: 1.25, 3: 1.5 };

// ---------- power-ups ----------
// rival: thrown at another guesser. self: used on yourself.
const POWERS = {
  fog: { emoji: '🌫️', name: 'Fog', target: 'rival', ms: 7000, verb: 'fogged' },
  flip: { emoji: '🙃', name: 'Flip', target: 'rival', ms: 8000, verb: 'flipped' },
  spin: { emoji: '🌀', name: 'Dizzy', target: 'rival', ms: 6000, verb: 'made dizzy' },
  freeze: { emoji: '🧊', name: 'Freeze', target: 'rival', ms: 6000, verb: 'froze' },
  hint: { emoji: '💡', name: 'Secret hint', target: 'self' },
  shield: { emoji: '🛡️', name: 'Shield', target: 'self' },
};
const POWER_TYPES = Object.keys(POWERS);
const MAX_POWERS = 3;
const ORB_MS = 4500;
// FORCE_POWER=fog (dev only) makes every power-up the same type, handy for testing one effect.
const randomPower = () => (POWERS[process.env.FORCE_POWER] ? process.env.FORCE_POWER : POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)]);

const id = (n = 8) => crypto.randomBytes(n).toString('hex');

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function judgeOne(g, w) {
  if (g === w) return 'correct';
  // Accept simple plurals ("trees" for "tree").
  if (g === w + 's' || g + 's' === w) return 'correct';
  const d = levenshtein(g, w);
  if ((w.length >= 4 && d <= 1) || (w.length >= 8 && d <= 2)) return 'close';
  return 'wrong';
}

function judgeGuess(guess, word) {
  const g = normalize(guess);
  if (!g) return 'empty';
  const verdicts = [word, ...aliasesFor(word)].map((w) => judgeOne(g, normalize(w)));
  if (verdicts.includes('correct')) return 'correct';
  if (verdicts.includes('close')) return 'close';
  return 'wrong';
}

class Room {
  constructor(io, code, joinUrl) {
    this.io = io;
    this.code = code;
    this.joinUrl = joinUrl;
    this.hostToken = id(12);
    this.hostSocketId = null;
    this.players = new Map(); // playerId -> player
    this.order = []; // join order of player ids
    this.settings = { rounds: 2, drawTime: 60, packs: ['classic'], custom: [], powerups: true, ai: ai.geminiAvailable() };
    this.usedWords = new Set();
    this.offeredWords = new Set();
    this.gallery = [];
    this.gifs = new Map(); // gallery index -> GIF buffer
    this.lastActive = Date.now();
    this.resetGame();
    this.syncAiPlayer();
  }

  // ---------- Gemini AI rival ----------

  /** Add or remove the virtual "Gemini" player to match settings. */
  syncAiPlayer() {
    const want = this.settings.ai && ai.geminiAvailable();
    const has = this.players.has(AI_ID);
    if (want && !has) {
      this.players.set(AI_ID, { id: AI_ID, name: 'Gemini 🤖', color: '#8ab4f8', score: 0, connected: true, socketId: null, powers: [], isAI: true });
      this.order.push(AI_ID);
    } else if (!want && has) {
      this.players.delete(AI_ID);
      this.order = this.order.filter((x) => x !== AI_ID);
    }
  }

  maskPattern() {
    return [...this.wordMask()].map((c) => (c === ' ' ? '/' : c)).join(' ');
  }

  /** The TV sends what it currently shows; Gemini takes a guess (max 3 per turn). */
  async aiSnapshot(dataUrl) {
    const me = this.players.get(AI_ID);
    if (!me || this.phase !== 'draw' || this.paused || this.winnerId || this.aiBusy) return;
    if (this.aiGuesses.length >= AI_MAX_GUESSES || !this.strokes.length) return;
    if (Date.now() < this.aiFrozenUntil) {
      this.feed({ type: 'ai', playerId: AI_ID, text: '🤖 Gemini is still sabotaged… no guess this time!' });
      this.aiGuesses.push('(sabotaged)');
      return;
    }
    const turn = this.turnNumber;
    const word = this.word;
    this.aiBusy = true;
    this.io.to(this.channel).emit('ai:thinking', { on: true });
    try {
      const { guess, quip } = await ai.aiGuess(dataUrl, {
        pattern: this.maskPattern(),
        letters: normalize(word).length,
        alreadyGuessed: this.aiGuesses.filter((g) => !g.startsWith('(')),
      }, word);
      if (turn !== this.turnNumber || this.phase !== 'draw' || this.winnerId || !guess) return;
      this.aiGuesses.push(guess);
      const verdict = judgeGuess(guess, word);
      this.io.to(this.channel).emit('ai:guess', { guess, quip, verdict });
      if (verdict === 'correct') {
        this.scoreCorrect(me, { quip });
      } else if (verdict === 'close') {
        this.feed({ type: 'ai', playerId: AI_ID, text: `🤖 Gemini: “${guess}?” — so close!` });
      } else {
        this.feed({ type: 'ai', playerId: AI_ID, text: `🤖 Gemini: “${guess}?” ${quip ? `— ${quip}` : ''}` });
      }
    } catch (err) {
      console.warn('[ai] guess failed:', err.message);
    } finally {
      this.aiBusy = false;
      this.io.to(this.channel).emit('ai:thinking', { on: false });
    }
  }

  /** At the reveal, Gemini reviews the sculpture like an art critic. */
  async aiCritic(dataUrl) {
    if (!this.settings.ai || !ai.geminiAvailable() || this.phase !== 'reveal') return;
    if (this.criticTurn === this.turnNumber) return;
    const entry = this.gallery[this.gallery.length - 1];
    if (!entry || entry.turnNumber !== this.turnNumber) return;
    this.criticTurn = this.turnNumber;
    try {
      const { score, line } = await ai.aiCritic(dataUrl, entry.word, entry.drawerName);
      entry.critic = { score, line };
      this.io.to(this.channel).emit('ai:critic', { score, line, word: entry.word, drawerName: entry.drawerName, turnNumber: entry.turnNumber });
    } catch (err) {
      console.warn('[ai] critic failed:', err.message);
    }
  }

  get channel() {
    return `room:${this.code}`;
  }

  resetGame() {
    clearTimeout(this.timer);
    this.timer = null;
    this.phase = 'lobby';
    this.paused = false;
    this.pausedRemaining = 0;
    this.round = 0;
    this.turnQueue = [];
    this.turnNumber = 0;
    this.drawerId = null;
    this.choices = [];
    this.word = null;
    this.difficulty = 1;
    this.strokes = [];
    this.totalFloats = 0;
    this.guessed = new Map(); // playerId -> { points, order }
    this.frozenUntil = new Map();
    this.revealed = new Set(); // indices of revealed letters
    this.hintSteps = 0;
    this.phaseEndsAt = 0;
    this.phaseDuration = 0;
    this.deltas = {};
    this.endReason = null;
    this.winnerId = null;
    this.shields = new Set();
    this.secretReveals = new Map();
    this.orb = null;
    this.aiGuesses = [];
    this.aiFrozenUntil = 0;
    this.aiBusy = false;
    for (const p of this.players.values()) {
      p.score = 0;
      p.powers = [];
    }
  }

  // ---------- players ----------

  /** Connected human players (the Gemini rival is not included). */
  connectedPlayers() {
    return this.order.map((pid) => this.players.get(pid)).filter((p) => p && p.connected && !p.isAI);
  }

  addPlayer(socket, { name, playerId }) {
    this.lastActive = Date.now();
    let p = playerId && this.players.get(playerId);
    if (p) {
      p.connected = true;
      p.socketId = socket.id;
      if (p.id === this.drawerId) clearTimeout(this.drawerGrace);
      return { player: p, rejoined: true };
    }
    if (this.players.size >= MAX_PLAYERS) return { error: 'Room is full (12 players max).' };
    let clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 14) || 'Player';
    const taken = new Set([...this.players.values()].map((x) => x.name.toLowerCase()));
    let n = 2;
    const base = clean;
    while (taken.has(clean.toLowerCase())) clean = `${base}${n++}`;
    const usedColors = new Set([...this.players.values()].map((x) => x.color));
    const color = PLAYER_COLORS.find((c) => !usedColors.has(c)) || PLAYER_COLORS[this.players.size % PLAYER_COLORS.length];
    p = { id: id(8), name: clean, color, score: 0, connected: true, socketId: socket.id, powers: [] };
    this.players.set(p.id, p);
    this.order.push(p.id);
    return { player: p, rejoined: false };
  }

  dropSocket(socketId) {
    if (socketId === this.hostSocketId) {
      this.hostSocketId = null;
      return;
    }
    const p = [...this.players.values()].find((x) => x.socketId === socketId);
    if (!p) return;
    p.connected = false;
    p.socketId = null;
    if (this.phase === 'lobby') {
      // In the lobby, leaving just removes you.
      this.players.delete(p.id);
      this.order = this.order.filter((x) => x !== p.id);
    } else if (p.id === this.drawerId && (this.phase === 'choose' || this.phase === 'draw')) {
      // Phones drop briefly (screen lock, Wi-Fi blips). Give the sculptor a moment to come back.
      this.feed({ type: 'info', text: `${p.name} lost connection — waiting a few seconds…` });
      clearTimeout(this.drawerGrace);
      this.drawerGrace = setTimeout(() => {
        if (!p.connected && p.id === this.drawerId && (this.phase === 'choose' || this.phase === 'draw')) {
          this.feed({ type: 'info', text: `${p.name} didn't come back — skipping their turn.` });
          this.endTurn('drawer-left');
        }
      }, DRAWER_GRACE_MS);
    } else if (this.phase === 'draw') {
      this.checkAllGuessed();
    }
    this.broadcast();
  }

  isVip(playerId) {
    const first = this.connectedPlayers()[0];
    return first && first.id === playerId;
  }

  // ---------- game flow ----------

  applySettings(input = {}) {
    const st = this.settings;
    if (input.rounds != null) st.rounds = Math.min(5, Math.max(1, Math.round(Number(input.rounds)) || st.rounds));
    if (input.drawTime != null) st.drawTime = Math.min(180, Math.max(20, Math.round(Number(input.drawTime)) || st.drawTime));
    if (Array.isArray(input.packs)) st.packs = input.packs.filter((p) => PACKS[p]).slice(0, 10);
    if (input.custom != null) st.custom = cleanCustom(input.custom);
    if (input.powerups != null) st.powerups = !!input.powerups;
    if (input.ai != null) st.ai = !!input.ai && ai.geminiAvailable();
    if (!st.packs.length && !st.custom.length) st.packs = ['classic'];
    if (this.phase === 'lobby') this.syncAiPlayer();
  }

  start(settings = {}) {
    if (this.phase !== 'lobby') return { error: 'Game already running.' };
    if (this.connectedPlayers().length < 2) return { error: 'Need at least 2 players (4+ is best).' };
    this.applySettings(settings);
    this.pool = buildPool(this.settings.packs, this.settings.custom);
    this.resetGame();
    this.gallery = [];
    this.gifs = new Map();
    // Words used in earlier games in this room are remembered, so "Play again" doesn't repeat them.
    this.round = 0;
    for (const p of this.players.values()) p.powers = this.settings.powerups && !p.isAI ? [randomPower()] : [];
    this.nextRound();
    return { ok: true };
  }

  nextRound() {
    this.round += 1;
    if (this.round > this.settings.rounds) return this.toPodium();
    this.turnQueue = this.connectedPlayers().map((p) => p.id);
    this.nextTurn();
  }

  nextTurn() {
    clearTimeout(this.timer);
    let next;
    while (this.turnQueue.length) {
      const pid = this.turnQueue.shift();
      const p = this.players.get(pid);
      if (p && p.connected) {
        next = p;
        break;
      }
    }
    if (!next) return this.nextRound();
    if (this.connectedPlayers().length < 2) {
      this.feed({ type: 'info', text: 'Not enough players left — ending the game.' });
      return this.toPodium();
    }
    this.turnNumber += 1;
    this.drawerId = next.id;
    this.word = null;
    this.strokes = [];
    this.totalFloats = 0;
    this.guessed = new Map();
    this.frozenUntil = new Map();
    this.revealed = new Set();
    this.hintSteps = 0;
    this.deltas = {};
    this.endReason = null;
    this.winnerId = null;
    this.shields = new Set();
    this.secretReveals = new Map();
    this.orb = null;
    this.aiGuesses = [];
    this.aiFrozenUntil = 0;
    this.choices = pickChoices(this.usedWords, this.pool || buildPool(this.settings.packs, this.settings.custom), this.offeredWords);
    this.choices.forEach((c) => this.offeredWords.add(c.word));
    this.io.to(this.channel).emit('stroke:clear');
    this.setPhase('choose', CHOOSE_MS, () => this.pickWord(next.id, 1));
  }

  pickWord(playerId, index) {
    if (this.phase !== 'choose' || this.paused || playerId !== this.drawerId) return;
    const choice = this.choices[index] || this.choices[0];
    this.word = choice.word;
    this.difficulty = choice.difficulty;
    this.usedWords.add(choice.word);
    const dur = this.settings.drawTime * 1000;
    this.setPhase('draw', dur, () => this.endTurn('time'));
    this.scheduleHints(dur);
    if (this.settings.powerups) this.scheduleOrbs(dur);
  }

  scheduleHints(dur, elapsed = 0) {
    // Reveal letters at 50% and 75% of the drawing time. `elapsed` is used when resuming from a pause.
    const at = [0.5, 0.75];
    at.forEach((frac, i) => {
      if (i < this.hintSteps || dur * frac < elapsed) return;
      const t = setTimeout(() => {
        if (this.phase !== 'draw' || this.paused) return;
        this.revealHint();
        this.hintSteps = i + 1;
        this.broadcast();
      }, dur * frac - elapsed);
      this.hintTimers = (this.hintTimers || []).concat(t);
    });
  }

  // ---------- host controls ----------

  pause() {
    if (this.paused || !['choose', 'draw', 'reveal'].includes(this.phase)) return false;
    this.pausedRemaining = Math.max(0, this.phaseEndsAt - Date.now());
    clearTimeout(this.timer);
    (this.hintTimers || []).forEach(clearTimeout);
    this.hintTimers = [];
    if (this.orb) {
      this.io.to(this.channel).emit('orb:gone', { id: this.orb.id });
      this.orb = null;
    }
    this.paused = true;
    this.feed({ type: 'info', text: '⏸ The host paused the game' });
    this.broadcast();
    return true;
  }

  resume() {
    if (!this.paused) return false;
    this.paused = false;
    const remaining = this.pausedRemaining;
    this.phaseEndsAt = Date.now() + remaining;
    if (this.onEnd) this.timer = setTimeout(this.onEnd, remaining);
    if (this.phase === 'draw') this.scheduleHints(this.phaseDuration, this.phaseDuration - remaining);
    this.feed({ type: 'info', text: '▶ Game resumed' });
    this.broadcast();
    return true;
  }

  restart() {
    // New game, same players and settings.
    if (this.phase === 'lobby') return { error: 'Not in a game.' };
    clearTimeout(this.timer);
    (this.hintTimers || []).forEach(clearTimeout);
    this.resetGame();
    this.io.to(this.channel).emit('stroke:clear');
    const res = this.start(this.settings);
    if (res.error) this.backToLobby();
    return res;
  }

  kick(playerId) {
    if (this.phase !== 'lobby') return null;
    const p = this.players.get(playerId);
    if (!p) return null;
    if (p.isAI) {
      this.settings.ai = false;
      this.syncAiPlayer();
      this.broadcast();
      return null;
    }
    this.players.delete(playerId);
    this.order = this.order.filter((x) => x !== playerId);
    this.feed({ type: 'info', text: `${p.name} was removed by the host` });
    this.broadcast();
    return p;
  }

  scheduleOrbs(dur) {
    // Two power orbs drop during each turn; the first guesser to grab one keeps it.
    for (const [a, b] of [[0.2, 0.4], [0.55, 0.75]]) {
      const t = setTimeout(() => this.dropOrb(), dur * (a + Math.random() * (b - a)));
      this.hintTimers.push(t);
    }
  }

  dropOrb() {
    if (this.phase !== 'draw' || this.paused) return;
    const orbId = id(4);
    this.orb = { id: orbId, power: randomPower(), until: Date.now() + ORB_MS };
    this.io.to(this.channel).emit('orb', { id: orbId, ms: ORB_MS });
    const t = setTimeout(() => {
      if (this.orb && this.orb.id === orbId) {
        this.orb = null;
        this.io.to(this.channel).emit('orb:gone', { id: orbId });
      }
    }, ORB_MS);
    this.hintTimers.push(t);
  }

  grabOrb(playerId, orbId) {
    const p = this.players.get(playerId);
    if (!p || this.phase !== 'draw' || playerId === this.drawerId) return { ok: false };
    if (!this.orb || this.orb.id !== orbId) return { ok: false, reason: 'gone' };
    if (p.powers.length >= MAX_POWERS) return { ok: false, reason: 'full' };
    const power = this.orb.power;
    this.orb = null;
    p.powers.push(power);
    this.io.to(this.channel).emit('orb:gone', { id: orbId, by: playerId });
    this.feed({ type: 'power', playerId, text: `${p.name} grabbed ${POWERS[power].emoji} ${POWERS[power].name}!` });
    this.sendPrivate(p);
    return { ok: true, power };
  }

  usePower(playerId, { type, targetId } = {}) {
    const p = this.players.get(playerId);
    const def = POWERS[type];
    if (!p || !def || !this.settings.powerups) return { ok: false, reason: 'invalid' };
    if (this.phase !== 'draw' || this.paused || playerId === this.drawerId) return { ok: false, reason: 'not-now' };
    const idx = p.powers.indexOf(type);
    if (idx < 0) return { ok: false, reason: 'none' };
    let target = null;
    if (def.target === 'rival') {
      target = this.players.get(targetId);
      if (!target || !target.connected || target.id === playerId || target.id === this.drawerId) return { ok: false, reason: 'bad-target' };
    }
    p.powers.splice(idx, 1);
    let blocked = false;
    if (type === 'shield') {
      this.shields.add(playerId);
      this.feed({ type: 'power', playerId, text: `${p.name} raised a 🛡️ shield` });
    } else if (type === 'hint') {
      this.revealSecretLetter(playerId);
      this.feed({ type: 'power', playerId, text: `${p.name} peeked at a 💡 secret letter` });
    } else if (target.isAI) {
      // Sabotaging the AI blinds it: it skips its next guesses until the effect wears off.
      this.aiFrozenUntil = Math.max(this.aiFrozenUntil, Date.now() + (def.ms || 6000) + 6000);
      this.feed({ type: 'power', playerId, text: `${p.name} ${def.verb} Gemini! ${def.emoji} The AI can't see a thing.` });
    } else if (this.shields.has(target.id)) {
      blocked = true;
      this.shields.delete(target.id);
      this.feed({ type: 'power', playerId, text: `${target.name}'s 🛡️ blocked ${p.name}'s ${def.emoji} ${def.name}!` });
    } else {
      if (type === 'freeze') {
        this.frozenUntil.set(target.id, Math.max(this.frozenUntil.get(target.id) || 0, Date.now() + def.ms));
      }
      if (target.socketId) this.io.to(target.socketId).emit('effect', { type, ms: def.ms, fromName: p.name, fromColor: p.color });
      this.feed({ type: 'power', playerId, text: `${p.name} ${def.verb} ${target.name}! ${def.emoji}` });
    }
    this.io.to(this.channel).emit('power', { type, fromId: playerId, targetId: target?.id || null, blocked });
    this.sendPrivate(p);
    if (target) this.sendPrivate(target);
    return { ok: true, blocked };
  }

  revealSecretLetter(playerId) {
    const mine = this.secretReveals.get(playerId) || new Set();
    const hidden = [...this.word].map((c, i) => (/[a-z0-9]/i.test(c) && !this.revealed.has(i) && !mine.has(i) ? i : -1)).filter((i) => i >= 0);
    if (hidden.length > 1) mine.add(hidden[Math.floor(Math.random() * hidden.length)]);
    this.secretReveals.set(playerId, mine);
  }

  revealHint() {
    const letters = [...this.word].map((c, i) => (/[a-z0-9]/i.test(c) ? i : -1)).filter((i) => i >= 0 && !this.revealed.has(i));
    const count = Math.max(1, Math.floor(normalize(this.word).length / 5));
    // Never reveal more than half the letters.
    const maxReveal = Math.floor(normalize(this.word).length / 2);
    for (let k = 0; k < count && letters.length && this.revealed.size < maxReveal; k++) {
      const j = Math.floor(Math.random() * letters.length);
      this.revealed.add(letters.splice(j, 1)[0]);
    }
  }

  wordMask() {
    if (!this.word) return null;
    return [...this.word].map((c, i) => (c === ' ' ? ' ' : this.revealed.has(i) ? c : '_')).join('');
  }

  setPhase(phase, durationMs, onEnd) {
    clearTimeout(this.timer);
    (this.hintTimers || []).forEach(clearTimeout);
    this.hintTimers = [];
    this.phase = phase;
    this.paused = false;
    this.onEnd = onEnd;
    this.phaseDuration = durationMs;
    this.phaseEndsAt = Date.now() + durationMs;
    if (onEnd) this.timer = setTimeout(onEnd, durationMs);
    this.broadcast();
  }

  submitGuess(playerId, text) {
    const p = this.players.get(playerId);
    if (!p) return { result: 'error' };
    if (this.phase !== 'draw') return { result: 'not-now' };
    if (this.paused) return { result: 'paused' };
    if (playerId === this.drawerId) return { result: 'drawer' };
    if (this.guessed.has(playerId)) return { result: 'already' };
    const until = this.frozenUntil.get(playerId) || 0;
    if (Date.now() < until) return { result: 'frozen', frozenMs: until - Date.now() };

    const verdict = judgeGuess(text, this.word);
    if (verdict === 'empty') return { result: 'empty' };
    if (verdict === 'correct') {
      const { points, drawerPoints } = this.scoreCorrect(p);
      return { result: 'correct', points, drawerPoints, word: this.word };
    }
    this.frozenUntil.set(playerId, Date.now() + FREEZE_MS);
    if (verdict === 'close') {
      this.feed({ type: 'close', playerId, text: `${p.name} is SO close…` });
      return { result: 'close', frozenMs: FREEZE_MS };
    }
    this.feed({ type: 'wrong', playerId, text: `${p.name}: “${String(text).trim().slice(0, 30)}”` });
    return { result: 'wrong', frozenMs: FREEZE_MS };
  }

  /** First correct guess ends the turn. The guesser scores, and the sculptor gets half as much. */
  scoreCorrect(p, { quip } = {}) {
    const frac = Math.max(0, (this.phaseEndsAt - Date.now()) / this.phaseDuration);
    const mult = DIFF_MULT[this.difficulty] || 1;
    const points = Math.round((100 + 400 * frac) * mult);
    this.guessed.set(p.id, { points, order: 1 });
    this.winnerId = p.id;
    p.score += points;
    this.deltas[p.id] = points;
    const drawer = this.players.get(this.drawerId);
    const drawerPoints = Math.round(points / 2);
    if (drawer) {
      drawer.score += drawerPoints;
      this.deltas[drawer.id] = drawerPoints;
    }
    if (!p.isAI && this.settings.powerups && p.powers.length < MAX_POWERS) p.powers.push(randomPower());
    const secs = Math.round((this.phaseDuration - (this.phaseEndsAt - Date.now())) / 1000);
    this.feed({ type: 'correct', playerId: p.id, text: p.isAI ? `🤖 Gemini nailed it in ${secs}s!${quip ? ` “${quip}”` : ''}` : `${p.name} nailed it in ${secs}s!`, points, secs });
    if (drawer) this.feed({ type: 'correct', playerId: drawer.id, text: `${drawer.name} earns sculptor points`, points: drawerPoints });
    this.endTurn('guessed');
    return { points, drawerPoints };
  }

  checkAllGuessed() {
    // With winner-takes-all guessing, a turn only ends early if every guesser has left.
    if (this.phase !== 'draw') return false;
    const guessers = this.connectedPlayers().filter((p) => p.id !== this.drawerId);
    if (guessers.length === 0) {
      this.endTurn('no-guessers');
      return true;
    }
    return false;
  }

  endTurn(reason) {
    if (this.phase !== 'draw' && this.phase !== 'choose') return;
    this.endReason = reason;
    const drawer = this.players.get(this.drawerId);
    if (this.word && this.strokes.length) {
      this.gallery.push({
        word: this.word,
        drawerId: this.drawerId,
        winnerId: this.winnerId,
        turnNumber: this.turnNumber,
        drawerName: drawer ? drawer.name : '?',
        drawerColor: drawer ? drawer.color : '#fff',
        winnerName: this.winnerId ? this.players.get(this.winnerId)?.name || null : null,
        strokes: this.strokes.map((s) => ({ color: s.color, width: s.width, pts: s.pts.slice() })),
      });
    }
    if (this.orb) {
      this.io.to(this.channel).emit('orb:gone', { id: this.orb.id });
      this.orb = null;
    }
    if (reason === 'time' && this.guessed.size === 0 && this.word) {
      this.feed({ type: 'info', text: `Nobody got it! It was “${this.word}”.` });
    }
    this.setPhase('reveal', REVEAL_MS, () => this.nextTurn());
  }

  toPodium() {
    clearTimeout(this.timer);
    this.drawerId = null;
    this.setPhase('podium', 0, null);
    this.io.to(this.channel).emit('gallery', this.galleryPayload());
  }

  galleryPayload() {
    return this.gallery.map((g, i) => ({ ...g, index: i, gifUrl: this.gifs.has(i) ? `/gif/${this.code}/${i}.gif` : null }));
  }

  backToLobby() {
    this.resetGame();
    // Drop players who left during the game.
    for (const [pid, p] of this.players) {
      if (!p.connected) {
        this.players.delete(pid);
        this.order = this.order.filter((x) => x !== pid);
      }
    }
    this.io.to(this.channel).emit('stroke:clear');
    this.broadcast();
  }

  skipTurn() {
    if (this.phase === 'choose' || this.phase === 'draw') {
      this.feed({ type: 'info', text: 'The host skipped this turn.' });
      this.endTurn('skipped');
    } else if (this.phase === 'reveal') {
      this.nextTurn();
    }
  }

  // ---------- strokes ----------

  canDraw(playerId) {
    return this.phase === 'draw' && !this.paused && playerId === this.drawerId;
  }

  strokeStart(playerId, { id: sid, color, width, p }) {
    if (!this.canDraw(playerId) || this.strokes.length >= MAX_STROKES) return null;
    const pts = sanitizePts(p, 3);
    if (!pts || typeof sid !== 'string') return null;
    const stroke = {
      id: sid.slice(0, 24),
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff',
      width: Math.min(0.08, Math.max(0.006, Number(width) || 0.02)),
      pts,
    };
    this.strokes.push(stroke);
    this.totalFloats += 3;
    return stroke;
  }

  strokePoints(playerId, { id: sid, pts }) {
    if (!this.canDraw(playerId)) return null;
    const stroke = this.strokes.find((s) => s.id === sid);
    const clean = sanitizePts(pts, MAX_FLOATS_PER_STROKE);
    if (!stroke || !clean) return null;
    if (stroke.pts.length + clean.length > MAX_FLOATS_PER_STROKE) return null;
    if (this.totalFloats + clean.length > MAX_TOTAL_FLOATS) return null;
    stroke.pts.push(...clean);
    this.totalFloats += clean.length;
    return clean;
  }

  undo(playerId) {
    if (!this.canDraw(playerId) || !this.strokes.length) return false;
    const s = this.strokes.pop();
    this.totalFloats -= s.pts.length;
    return s.id;
  }

  clear(playerId) {
    if (!this.canDraw(playerId)) return false;
    this.strokes = [];
    this.totalFloats = 0;
    return true;
  }

  // ---------- messaging ----------

  feed(item) {
    this.io.to(this.channel).emit('feed', { ...item, at: Date.now() });
  }

  snapshot() {
    const now = Date.now();
    const showWord = this.phase === 'reveal' || this.phase === 'podium';
    const players = this.order
      .map((pid) => this.players.get(pid))
      .filter(Boolean)
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        connected: p.connected,
        guessed: this.guessed.has(p.id),
        guessOrder: this.guessed.get(p.id)?.order || 0,
        delta: this.deltas[p.id] || 0,
        powers: (p.powers || []).length,
        isAI: !!p.isAI,
        shielded: this.shields ? this.shields.has(p.id) : false,
      }));
    const drawer = this.players.get(this.drawerId);
    return {
      code: this.code,
      joinUrl: this.joinUrl,
      phase: this.phase,
      round: this.round,
      rounds: this.settings.rounds,
      drawTime: this.settings.drawTime,
      settings: {
        rounds: this.settings.rounds,
        drawTime: this.settings.drawTime,
        packs: this.settings.packs,
        customCount: this.settings.custom.length,
        powerups: this.settings.powerups,
        ai: this.settings.ai && ai.geminiAvailable(),
      },
      aiAvailable: ai.geminiAvailable(),
      ttsAvailable: ai.ttsAvailable(),
      turnNumber: this.turnNumber,
      players,
      drawerId: this.drawerId,
      drawerName: drawer ? drawer.name : null,
      drawerColor: drawer ? drawer.color : null,
      wordMask: this.phase === 'draw' ? this.wordMask() : null,
      difficulty: this.word ? this.difficulty : null,
      word: showWord ? this.word : null,
      endReason: this.endReason,
      winnerId: this.winnerId,
      winnerName: this.winnerId ? this.players.get(this.winnerId)?.name || null : null,
      paused: this.paused,
      remainingMs: this.paused ? this.pausedRemaining : this.phaseDuration ? Math.max(0, this.phaseEndsAt - now) : 0,
      durationMs: this.phaseDuration,
      hostConnected: !!this.hostSocketId,
      vipId: this.connectedPlayers()[0]?.id || null,
      galleryCount: this.gallery.length,
    };
  }

  privateFor(p) {
    const isDrawer = p.id === this.drawerId;
    return {
      playerId: p.id,
      isDrawer,
      choices: isDrawer && this.phase === 'choose' ? this.choices : null,
      word: (isDrawer && this.word) || (this.guessed.has(p.id) ? this.word : null),
      frozenMs: Math.max(0, (this.frozenUntil.get(p.id) || 0) - Date.now()),
      powers: p.powers || [],
      shielded: this.shields ? this.shields.has(p.id) : false,
      secretMask: this.phase === 'draw' && this.secretReveals?.has(p.id) ? this.personalMask(p.id) : null,
    };
  }

  personalMask(playerId) {
    const mine = this.secretReveals.get(playerId) || new Set();
    // Secret letters are marked with a leading '*' so the phone can colour them differently.
    return [...this.word].map((c, i) => (c === ' ' ? ' ' : this.revealed.has(i) ? c : mine.has(i) ? `*${c}` : '_'));
  }

  sendPrivate(p) {
    if (p.socketId) this.io.to(p.socketId).emit('private', this.privateFor(p));
  }

  broadcast() {
    this.lastActive = Date.now();
    this.io.to(this.channel).emit('state', this.snapshot());
    for (const p of this.players.values()) this.sendPrivate(p);
  }
}

function sanitizePts(arr, maxLen) {
  if (!Array.isArray(arr) || arr.length === 0 || arr.length % 3 !== 0 || arr.length > maxLen) return null;
  const out = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 10) return null;
    out[i] = Math.round(v * 1000) / 1000;
  }
  return out;
}

module.exports = { Room, judgeGuess, normalize, POWERS };
