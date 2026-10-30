/* Direct browser -> Google client. No server of ours in the middle:
 * the key lives on the device and every call goes straight to Google.
 * Port of app/services/gemini_service.py + tts_service.py.
 */
import * as L from './ladder.js';
import * as P from './prompts.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const KEY_STORE = 'aec.apikey';
export const API_KEY_URL = 'https://aistudio.google.com/apikey';

export function apiKey() {
  return localStorage.getItem(KEY_STORE) || '';
}

export function saveApiKey(key) {
  localStorage.setItem(KEY_STORE, (key || '').trim());
}

export function hasKey() {
  return !!apiKey();
}

/* Ask Google whether the key works, so a typo is caught here and not mid-exercise. */
export async function verifyKey(key) {
  key = (key || '').trim();
  if (!key) return { ok: false, message: 'Pega tu API key antes de continuar.' };
  // Sin listas de prefijos: Google los cambia (antes «AIza…», ahora «AQ.…») y cualquier
  // suposición nuestra acaba rechazando claves buenas. Aquí solo se detecta un pegado
  // a medias; quien decide si la clave vale es Google, en la petición de abajo.
  if (/\s/.test(key) || key.length < 20) {
    return { ok: false, message: 'Eso no parece una API key completa: cópiala entera, sin espacios ni saltos de línea.' };
  }
  try {
    const res = await fetch(`${BASE}/models?pageSize=1&key=${encodeURIComponent(key)}`);
    if (res.ok) return { ok: true, message: 'Clave verificada correctamente.' };
    if ([400, 401, 403].includes(res.status)) {
      return { ok: false, message: 'Google rechaza esa clave. Revisa que la copiaste entera y que el proyecto tiene la API activada.' };
    }
    return { ok: false, message: `Google respondió con un error ${res.status}. Inténtalo de nuevo en un minuto.` };
  } catch {
    return { ok: false, message: 'No hay conexión con Google. Comprueba tu internet e inténtalo otra vez.' };
  }
}

class ApiError extends Error {
  constructor(status, body) {
    super(`${status} ${typeof body === 'string' ? body : JSON.stringify(body)}`.slice(0, 300));
    this.status = status;
    this.body = body;
  }
}

async function generateContent(model, body, timeoutMs = 90000) {
  const key = apiKey();
  if (!key) throw new Error('Falta la API key de Gemini.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, text);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function partsText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text || '').join('').trim();
}

/* Generic call: contents/system/json/temperature, on the best model in quota. */
async function callRaw({ contents, system = P.SYSTEM_PERSONALITY, json = true, temperature, timeoutMs }) {
  return L.call('text', async model => {
    const data = await generateContent(model, {
      contents,
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: {
        temperature: temperature ?? (json ? 0.6 : 0.8),
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    }, timeoutMs);
    return partsText(data);
  });
}

/* Call Gemini on the best model still in quota. Throws QuotaExhausted when none is. */
export async function callModel(prompt, jsonMode = true) {
  return L.call('text', async model => {
    const data = await generateContent(model, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: P.SYSTEM_PERSONALITY }] },
      generationConfig: {
        temperature: jsonMode ? 0.6 : 0.8,
        ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    });
    return partsText(data);
  });
}

/* Best-effort JSON parsing — tolerates code fences and stray prose. */
export function safeJson(raw, fallback = null) {
  if (!raw) return fallback;
  let text = String(raw).trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
  }
  try { return JSON.parse(text); } catch { /* keep digging */ }
  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    const i = text.indexOf(open), j = text.lastIndexOf(close);
    if (i !== -1 && j > i) {
      try { return JSON.parse(text.slice(i, j + 1)); } catch { /* next shape */ }
    }
  }
  return fallback;
}

function normaliseExercisePayload(data, exerciseType, level, topic, n) {
  if (Array.isArray(data)) {
    if (data.length && data[0] && typeof data[0] === 'object' && 'items' in data[0]) {
      const merged = [];
      let mergedTopic = topic;
      for (const sub of data) {
        merged.push(...(sub.items || []));
        mergedTopic = mergedTopic || sub.topic;
        level = level || sub.level;
      }
      data = { exercise_type: exerciseType, items: merged, topic: mergedTopic, level };
    } else {
      data = { exercise_type: exerciseType, items: data, topic, level };
    }
  }
  if (!data || typeof data !== 'object') return null;

  data.exercise_type ??= exerciseType;
  data.level ??= level || 'B1';
  data.topic ??= topic || 'auto';
  if (exerciseType === 'writing') return data;
  if (exerciseType === 'listening') {
    data.dialogue ??= data.transcript || '';
    data.scenario ??= '';
  }

  const clean = [];
  for (const it of data.items || []) {
    if (!it || typeof it !== 'object') continue;
    if (!('answer' in it) && 'correct_answer' in it) it.answer = it.correct_answer;
    it.id = clean.length + 1;
    clean.push(it);
  }
  data.items = n && clean.length > n ? clean.slice(0, n).map((it, i) => ({ ...it, id: i + 1 })) : clean;
  return data;
}

export async function generateExercises(user, exerciseType, topic, n = 5) {
  const prompt = exerciseType === 'listening'
    ? P.buildListeningDialoguePrompt(user, topic, n)
    : P.buildExercisePrompt(user, exerciseType, topic, n);
  const data = safeJson(await callModel(prompt), null);
  const out = normaliseExercisePayload(data, exerciseType, user.current_level, topic, n);
  if (!out) throw new Error('Gemini devolvió un ejercicio que no se pudo leer. Vuelve a intentarlo.');
  return out;
}

export async function gradeExercises(user, exercise, answers) {
  const raw = await callModel(P.buildGradePrompt(user, exercise, answers));
  const data = safeJson(raw, null);
  if (!data) throw new Error('No se pudo leer la corrección. Vuelve a intentarlo.');
  return data;
}

export async function gradeWriting(user, prompt, text) {
  const raw = await callModel(P.buildWritingGradePrompt(user, prompt, text));
  const data = safeJson(raw, null);
  if (!data) throw new Error('No se pudo leer la corrección. Vuelve a intentarlo.');
  return data;
}

export async function chatTurn(user, role, scenario, history, userMessage) {
  const system = P.buildChatSystemPrompt(user, role, scenario);
  const text = await callModel(P.buildChatTurnPrompt(system, history, userMessage), false);
  return text.trim() || 'Sorry, could you say that again?';
}

const EVAL_FALLBACK = {
  fluency: 60, grammar: 60, vocabulary: 60, naturalness: 60, comprehension: 60,
  pronunciation: null, score: 60, estimated_level: 'B1', mistakes: [], better_phrases: [],
  tips: [], feedback: '', next_exercise_suggestion: '',
};

export async function evaluateConversation(user, messages, role) {
  const data = safeJson(await callModel(P.buildConversationEvalPrompt(user, messages, role)), null);
  if (!data || typeof data !== 'object') return { ...EVAL_FALLBACK };
  const out = { ...EVAL_FALLBACK, ...data };
  const criteria = ['fluency', 'grammar', 'vocabulary', 'naturalness', 'comprehension'];
  for (const k of criteria) {
    const v = Number(out[k]);
    out[k] = Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : EVAL_FALLBACK[k];
  }
  const score = Number(data.score);
  out.score = Number.isFinite(score)
    ? Math.max(0, Math.min(100, score))
    : Math.round(criteria.reduce((s, k) => s + out[k], 0) / criteria.length);
  for (const k of ['mistakes', 'better_phrases', 'tips']) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  return out;
}

export async function analyzeMemoryUpdate(user, summary) {
  try {
    const data = safeJson(await callModel(P.buildMemoryUpdatePrompt(user, summary)), null);
    return data && typeof data === 'object' ? data : {};
  } catch (err) {
    if (err instanceof L.QuotaExhausted) throw err;
    console.warn('memory update failed', err);
    return {};   // the session still counts even if the coach note is missing
  }
}

export async function generateLesson(user, topic, recentMistakes) {
  const data = safeJson(await callModel(P.buildLessonPrompt(user, topic, recentMistakes)), null);
  if (!data || !data.title) throw new Error('No se pudo generar la lección. Vuelve a intentarlo.');
  return data;
}

export async function generatePlacement(user) {
  const data = safeJson(await callModel(P.buildPlacementTestPrompt(user)), null);
  if (!data || !Array.isArray(data.items) || !data.reading || !data.writing_prompt) {
    throw new Error('Could not build the test. Try again.');
  }
  data.items.forEach((it, i) => { it.id = i + 1; });
  (data.reading.items || []).forEach((it, i) => { it.id = i + 1; });
  return data;
}

export async function evaluatePlacement(user, test, answers, writingText) {
  const data = safeJson(await callModel(P.buildPlacementEvalPrompt(user, test, answers, writingText)), null);
  if (!data || !data.level) throw new Error('Could not evaluate the test. Try again.');
  return data;
}

export async function generateCertExam(user, level) {
  const data = safeJson(await callModel(P.buildCertExamPrompt(user, level)), null);
  if (!data || !Array.isArray(data.items) || !data.reading || !data.writing_prompt) {
    throw new Error('Could not build the exam. Try again.');
  }
  data.items.forEach((it, i) => { it.id = i + 1; });
  (data.reading.items || []).forEach((it, i) => { it.id = i + 1; });
  return data;
}

export async function evaluateCertExam(user, level, test, answers, writingText) {
  const data = safeJson(await callModel(P.buildCertEvalPrompt(user, level, test, answers, writingText)), null);
  if (!data || typeof data.score !== 'number') throw new Error('Could not grade the exam. Try again.');
  data.score = Math.max(0, Math.min(100, data.score));
  return data;
}

/* One generated photo as a data: URL. Images stay in memory only - never in localStorage. */
export async function generateImage(scene) {
  return L.call('image', async model => {
    const data = await generateContent(model, {
      contents: [{ role: 'user', parts: [{ text:
        `A realistic photograph for an English exam exercise: ${scene}. Natural lighting, everyday scene, no text or watermarks.` }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }, 120000);
    const part = data?.candidates?.[0]?.content?.parts?.find(x => x.inlineData);
    if (!part) throw new Error('No image returned.');
    return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
  });
}

// ---------------------------------------------------------------------------
// Text to speech (listening exercises)
// ---------------------------------------------------------------------------
const BRITISH_PAIR = ['Aoede', 'Charon'];
const AMERICAN_PAIR = ['Puck', 'Kore'];

export function pcmToWavBlob(pcm, sampleRate = 24000) {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const write = (off, s) => [...s].forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)));
  write(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  write(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);            // PCM
  v.setUint16(22, 1, true);            // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  write(36, 'data');
  v.setUint32(40, pcm.length, true);
  return new Blob([header, pcm], { type: 'audio/wav' });
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* Multi-speaker WAV for a "Alex: ... / Sam: ..." transcript. */
export async function synthesizeDialogue(dialogue, preferredEnglish = 'british') {
  const [v1, v2] = preferredEnglish === 'british' ? BRITISH_PAIR : AMERICAN_PAIR;
  const speaker = (name, voice) => ({ speaker: name, voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } });
  return L.call('tts', async model => {
    const data = await generateContent(model, {
      contents: [{
        role: 'user',
        parts: [{
          text: 'TTS the following dialogue between two speakers (Alex and Sam). ' +
                'Read it naturally, with appropriate intonation and pauses:\n\n' + dialogue,
        }],
      }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [speaker('Alex', v1), speaker('Sam', v2)],
          },
        },
      },
    }, 180000);
    const b64 = data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (!b64) throw new Error('La voz no devolvió audio.');
    return URL.createObjectURL(pcmToWavBlob(b64ToBytes(b64)));
  });
}

/* One English sentence as speech (fallback when the device has no English voice). */
export async function synthesizeSpeech(text, preferredEnglish = 'british') {
  const voice = preferredEnglish === 'american' ? 'Kore' : 'Aoede';
  return L.call('tts', async model => {
    const data = await generateContent(model, {
      contents: [{ role: 'user', parts: [{ text: `Say clearly, at a natural teaching pace: ${text}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }, 60000);
    const b64 = data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (!b64) throw new Error('La voz no devolvió audio.');
    return URL.createObjectURL(pcmToWavBlob(b64ToBytes(b64)));
  });
}

// ---------------------------------------------------------------------------
// Course path: micro-lessons, open-answer checks, speech checks, coach chat
// ---------------------------------------------------------------------------
export async function generateMicroLesson(user, unit, kind, round, level, recentTopics) {
  const raw = await callRaw({
    contents: [{ role: 'user', parts: [{ text: P.buildMicroLessonPrompt(user, unit, kind, round, level, recentTopics) }] }],
    temperature: 0.85,
    timeoutMs: 120000,
  });
  const data = safeJson(raw, null);
  const items = Array.isArray(data) ? data : data?.items;
  if (!Array.isArray(items)) throw new Error('Gemini devolvió una lección que no se pudo leer. Vuelve a intentarlo.');
  return { title: typeof data?.title === 'string' ? data.title.slice(0, 80) : '', items };
}

export async function checkOpenAnswer(user, item, answer) {
  const raw = await callRaw({
    contents: [{ role: 'user', parts: [{ text: P.buildOpenCheckPrompt(user, item, answer) }] }],
    temperature: 0.1,
    timeoutMs: 30000,
  });
  const data = safeJson(raw, null);
  if (!data || typeof data.correct !== 'boolean') throw new Error('No se pudo comprobar la respuesta.');
  return { correct: data.correct, feedback: String(data.feedback || ''), better: String(data.better || '') };
}

export async function checkSpeech(user, item, wavBase64) {
  const raw = await callRaw({
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: 'audio/wav', data: wavBase64 } },
      { text: P.buildSpeechPrompt(user, item) },
    ] }],
    temperature: 0.2,
    timeoutMs: 60000,
  });
  const data = safeJson(raw, null);
  if (!data || typeof data.transcript !== 'string') throw new Error('No se pudo analizar el audio. Vuelve a intentarlo.');
  const score = Math.max(0, Math.min(100, Number(data.score) || 0));
  return {
    transcript: data.transcript, score,
    correct: item.type === 'speak_free' ? score >= 60 : score >= 70,
    feedback: String(data.feedback || ''), better: String(data.better || ''),
    words: Array.isArray(data.words) ? data.words.filter(w => w && typeof w.w === 'string') : [],
  };
}

/* history: [{role:'user'|'model', text}] — the coach keeps the thread. */
export async function coachReply(user, history, ctx) {
  const contents = history.slice(-20).map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] }));
  const text = await callRaw({ contents, system: P.buildCoachSystem(user, ctx), json: false, temperature: 0.7, timeoutMs: 60000 });
  return text.trim() || 'Perdona, no te he entendido. ¿Me lo repites?';
}

export { L as ladder };
