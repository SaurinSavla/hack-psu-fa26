// AI integrations:
//   • Google Gemini  – an AI rival that guesses sculptures from snapshots, and an art critic at each reveal
//   • ElevenLabs     – a game-show announcer voice for the TV
//
// Keys come from environment variables (or a .env file next to server.js). The key only ever lives on the
// server: the TV and phones never see it.
//   GEMINI_API_KEY, GEMINI_MODEL (default gemini-3.5-flash-lite)
//   GEMINI_GUESSES_PER_TURN (default 3), GEMINI_CRITIC (default 1; 0 turns the reviews off)
//   ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID (default "George"), ELEVENLABS_MODEL (default eleven_flash_v2_5)
// Set AI_MOCK=1 (or start with --mock-ai) to fake both services, so testing doesn't spend your quota.

const crypto = require('crypto');

const MOCK = process.env.AI_MOCK === '1' || process.argv.includes('--mock-ai');
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
// Flash-Lite is the cheapest model with a free tier, and good enough at "what is this sculpture?".
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
// Each guess and each review is one request, so these two settings decide how fast the quota goes.
const guessesEnv = Number(process.env.GEMINI_GUESSES_PER_TURN || 3);
const GUESSES_PER_TURN = Number.isFinite(guessesEnv) ? Math.min(6, Math.max(0, Math.round(guessesEnv))) : 3;
const CRITIC = process.env.GEMINI_CRITIC !== '0';
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'; // "George", a premade voice
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';

const geminiAvailable = () => MOCK || !!GEMINI_KEY;
const ttsAvailable = () => MOCK || !!ELEVEN_KEY;

// ---------------------------------------------------------------------------
// Quota protection: when Google says we're out of quota (429) or rejects the key or model, stop calling
// Gemini until it can work again, instead of failing on every turn and burning the per-minute limit too.
// ---------------------------------------------------------------------------

const status = { state: 'ok', reason: '', until: 0 }; // state: 'ok' | 'resting' (comes back by itself) | 'off'
const statusListeners = [];

function geminiStatus() {
  if (status.state === 'resting' && Date.now() >= status.until) setStatus('ok', '', 0);
  return { ...status };
}
const geminiReady = () => geminiAvailable() && geminiStatus().state === 'ok';
const onGeminiStatus = (fn) => statusListeners.push(fn);

function setStatus(state, reason, until) {
  const changed = state !== status.state || reason !== status.reason;
  Object.assign(status, { state, reason, until });
  if (changed) statusListeners.forEach((fn) => fn({ ...status }));
}

/** Free-tier daily quotas reset at midnight Pacific time. */
function msUntilPacificMidnight(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return (24 * 3600 - (get('hour') * 3600 + get('minute') * 60 + get('second'))) * 1000;
}

function noteFailure(code, body) {
  let err = {};
  try {
    err = JSON.parse(body).error || {};
  } catch {}
  const message = String(err.message || body || '');
  const details = Array.isArray(err.details) ? err.details : [];
  if (code === 429) {
    const quotaIds = details.flatMap((d) => (d.violations || []).map((v) => v.quotaId || '')).join(' ');
    if (/limit: 0\b/.test(message)) {
      return setStatus('off', `${GEMINI_MODEL} has no free quota on this key's project. Pick another GEMINI_MODEL or turn on billing.`, 0);
    }
    if (/PerDay/i.test(quotaIds) || /per day/i.test(message)) {
      return setStatus('resting', "Gemini used up today's free requests (they reset at midnight Pacific time).", Date.now() + msUntilPacificMidnight());
    }
    const retrySecs = parseFloat(details.map((d) => d.retryDelay).find(Boolean)) || 60;
    return setStatus('resting', 'Gemini hit its per-minute limit and is taking a short break.', Date.now() + Math.min(600, Math.max(5, retrySecs)) * 1000);
  }
  if (code === 404) return setStatus('off', `Google doesn't know the model "${GEMINI_MODEL}". Set GEMINI_MODEL in .env.`, 0);
  if (code === 400 || code === 401 || code === 403) {
    if (/api.?key|permission|unauthenticated|billing|not enabled|expired|denied/i.test(message)) {
      return setStatus('off', `Google rejected the Gemini key: ${message.slice(0, 140)}`, 0);
    }
  }
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

async function gemini(parts, { timeoutMs = 15000, json = true } = {}) {
  if (!geminiReady()) throw new Error(`Gemini is not available right now: ${status.reason || 'no API key'}`);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.7,
        // Newer Gemini models "think" before answering, and that thinking counts toward this limit.
        // Keep it generous so the JSON answer is never cut off halfway.
        maxOutputTokens: 2048,
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text();
    noteFailure(res.status, body);
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
  if (!json) return text;
  const parsed = parseLooseJson(text);
  if (parsed) return parsed;
  throw new Error(`Gemini returned unreadable JSON (finishReason: ${cand?.finishReason || 'unknown'}): ${text.slice(0, 120)}`);
}

/** Parse JSON even if the model wraps it in code fences, adds text around it, or gets cut off. */
function parseLooseJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const obj = cleaned.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      return JSON.parse(obj[0]);
    } catch {}
  }
  // Salvage simple "key": value pairs from a truncated answer.
  const out = {};
  for (const m of cleaned.matchAll(/"(\w+)"\s*:\s*("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|true|false)/g)) {
    try {
      out[m[1]] = JSON.parse(m[2]);
    } catch {}
  }
  return Object.keys(out).length ? out : null;
}

function imagePart(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('Bad snapshot');
  return { inline_data: { mime_type: m[1], data: m[2] } };
}

/**
 * Ask Gemini what the sculpture is.
 * @param {string} dataUrl  JPEG snapshot of the sculpture as shown on the TV
 * @param {object} info     { pattern: "_ _ _ _ _" (with revealed letters), letters: 5, alreadyGuessed: [...] }
 * @returns {Promise<{guess: string, quip: string}>}
 */
async function aiGuess(dataUrl, info, mockWord) {
  if (MOCK) return mockGuess(info, mockWord);
  const prompt = [
    'You are "Gemini", a cheeky contestant on a party game show called Sculpt & Spin.',
    'A player is sculpting an object in the air with their phone. The image shows their 3D sculpture made of glowing tubes,',
    'seen from the camera angle the audience currently sees (it may be sideways, from above, or unfinished).',
    info.easy
      ? `The answer is a common object. It has ${info.letters} letters. Go with your FIRST instinct from the overall silhouette only; don't overthink it.`
      : `The answer is a common, easy-to-draw object or animal. Word pattern: "${info.pattern}" (${info.letters} letters, spaces separate words; letters shown are hints).`,
    info.alreadyGuessed?.length ? `You already guessed (wrong): ${info.alreadyGuessed.join(', ')}. Guess something different.` : '',
    'Reply ONLY with JSON: {"guess": "<one or two words, lowercase>", "quip": "<a short, playful one-liner under 12 words about your guess>"}',
  ].filter(Boolean).join(' ');
  const out = await gemini([{ text: prompt }, imagePart(dataUrl)]);
  return { guess: String(out.guess || '').toLowerCase().slice(0, 40), quip: String(out.quip || '').slice(0, 120) };
}

/**
 * Ask Gemini to review the finished sculpture.
 * @returns {Promise<{score: number, line: string}>}
 */
async function aiCritic(dataUrl, word, drawerName) {
  if (MOCK) return mockCritic(word, drawerName);
  const prompt = [
    'You are a witty, warm, over-the-top art critic on a party game show.',
    `${drawerName} just sculpted "${word}" in the air with their phone; the image shows the 3D result made of glowing tubes.`,
    'Give a score from 1 to 10 and one funny, kind review sentence (max 18 words) that mentions the subject. No insults about the person.',
    'Reply ONLY with JSON: {"score": <integer 1-10>, "line": "<review>"}',
  ].join(' ');
  const out = await gemini([{ text: prompt }, imagePart(dataUrl)]);
  const score = Math.max(1, Math.min(10, Math.round(Number(out.score) || 5)));
  return { score, line: String(out.line || '').slice(0, 160) };
}

// Mocks: wrong, wrong-ish, then right — so the flow can be tested without a key.
const mockCalls = new Map();
function mockGuess(info, word) {
  const key = word || info.pattern;
  const n = (mockCalls.get(key) || 0) + 1;
  mockCalls.set(key, n);
  const wrong = ['a pretzel', 'spaghetti', 'a cloud', 'modern art', 'a noodle'];
  if (n >= 3 && word) return { guess: word, quip: 'Elementary, my dear sculptor.' };
  return { guess: wrong[(n + info.letters) % wrong.length], quip: 'Is it… art? It is definitely art.' };
}
function mockCritic(word, drawerName) {
  return { score: 7, line: `${drawerName}'s ${word} has the confidence of a masterpiece and the wobble of a jelly.` };
}

// ---------------------------------------------------------------------------
// ElevenLabs text-to-speech (cached)
// ---------------------------------------------------------------------------

const ttsCache = new Map(); // hash -> Buffer
const ttsInflight = new Map();
const MAX_CACHE = 300;

async function tts(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!clean) throw new Error('empty');
  const key = crypto.createHash('sha1').update(`${ELEVEN_VOICE}|${ELEVEN_MODEL}|${clean}`).digest('hex');
  if (ttsCache.has(key)) return ttsCache.get(key);
  if (ttsInflight.has(key)) return ttsInflight.get(key);
  const job = (async () => {
    let buf;
    if (MOCK) {
      buf = MOCK_MP3;
    } else {
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVEN_VOICE)}?output_format=mp3_44100_128`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVEN_KEY, Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text: clean,
          model_id: ELEVEN_MODEL,
          voice_settings: { stability: 0.35, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true },
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
      buf = Buffer.from(await res.arrayBuffer());
    }
    ttsCache.set(key, buf);
    if (ttsCache.size > MAX_CACHE) ttsCache.delete(ttsCache.keys().next().value);
    return buf;
  })();
  ttsInflight.set(key, job);
  try {
    return await job;
  } finally {
    ttsInflight.delete(key);
  }
}

// A tiny valid silent MP3 frame used by the mock.
const MOCK_MP3 = Buffer.from(
  '//uQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjU0AAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'base64'
);

module.exports = {
  aiGuess, aiCritic, tts, geminiAvailable, geminiReady, geminiStatus, onGeminiStatus, ttsAvailable,
  MOCK, GEMINI_MODEL, GUESSES_PER_TURN, CRITIC, ELEVEN_MODEL, gemini, imagePart, parseLooseJson, noteFailure, msUntilPacificMidnight,
};
