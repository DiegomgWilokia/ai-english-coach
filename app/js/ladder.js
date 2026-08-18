/* Model ladder — same rules as the desktop app (app/services/model_ladder.py).
 *
 * Quota is per Google account, so the phone has to survive a "no" the same way:
 * daily quota -> that model rests 24 h and we step down; per-minute limit -> it
 * rests the delay Google asks for; when the whole ladder is resting the user is
 * told plainly instead of quietly getting worse answers.
 */
export const LADDERS = {
  text: [
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ],
  tts: [
    'gemini-3.1-flash-tts-preview',
    'gemini-2.5-flash-preview-tts',
    'gemini-2.5-pro-preview-tts',
  ],
  image: [
    'gemini-3.1-flash-image',
    'gemini-3.1-flash-lite-image',
    'gemini-2.5-flash-image',
  ],
  live: [
    'gemini-3.1-flash-live-preview',
    'gemini-2.5-flash-native-audio-latest',
    'gemini-2.5-flash-native-audio-preview-09-2025',
  ],
};

const DAY = 24 * 60 * 60 * 1000;
const SHORT_REST = 60 * 1000;
const KEY = 'aec.cooldown';

export class QuotaExhausted extends Error {
  constructor(kind, retryAt) {
    const mins = Math.max(1, Math.round((retryAt - Date.now()) / 60000));
    const when = mins >= 60 ? `${Math.round(mins / 60)} h` : `${mins} min`;
    super(
      'Te has quedado sin tokens de Gemini: todos los modelos disponibles han agotado ' +
      `su cuota. Vuelve a intentarlo dentro de ~${when}.`
    );
    this.name = 'QuotaExhausted';
    this.kind = kind;
    this.retryAt = retryAt;
  }
}

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

function rest(model, ms, reason) {
  const state = load();
  state[model] = Date.now() + ms;
  localStorage.setItem(KEY, JSON.stringify(state));
  console.warn(`[ladder] ${model} descansa ${Math.round(ms / 1000)}s — ${reason}`);
}

/* How long this model should rest, or null when the error is not its fault. */
export function restMs(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body || '');
  if (status === 429 || /RESOURCE_EXHAUSTED/.test(text)) {
    if (/per\s*day|PerDay/i.test(text)) return DAY;
    const m = text.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
    if (m) return parseFloat(m[1]) * 1000;
    return /per\s*minute|PerMinute/i.test(text) ? SHORT_REST : DAY;
  }
  if (status === 404 || /NOT_FOUND/.test(text)) return DAY;
  if (status === 500 || status === 503 || /UNAVAILABLE|overloaded/i.test(text)) return SHORT_REST;
  return null;
}

export function readyModels(kind) {
  const state = load(), now = Date.now();
  return LADDERS[kind].filter(m => (state[m] || 0) <= now);
}

export function currentModel(kind) {
  return readyModels(kind)[0] || null;
}

function exhausted(kind) {
  const state = load(), now = Date.now();
  const waits = LADDERS[kind].map(m => state[m] || now);
  return new QuotaExhausted(kind, Math.min(...waits));
}

/* Run fn(model) on the best model still in quota, stepping down when one is out.
 * fn must throw an Error carrying .status and .body for the ladder to classify it. */
export async function call(kind, fn) {
  const ready = readyModels(kind);
  if (!ready.length) throw exhausted(kind);
  for (const model of ready) {
    try {
      return await fn(model);
    } catch (err) {
      if (err instanceof QuotaExhausted) throw err;
      const ms = restMs(err.status, err.body);
      if (ms === null) throw err;           // bad key or bad request: surface it
      rest(model, ms, String(err.message).slice(0, 160));
    }
  }
  throw exhausted(kind);
}
