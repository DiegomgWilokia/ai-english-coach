/* Everything that makes or takes sound: English voice for exercises, microphone
 * recording for speaking, and the little sound effects that reward an answer.
 *
 * Voice order: native TTS inside the Android app (Capacitor plugin) -> an English
 * system voice in the browser/Windows -> Gemini TTS (slower, uses quota, cached).
 */
import * as store from './store.js';
import * as G from './gemini.js';

const variant = () => (store.load().user?.preferred_english === 'american' ? 'en-US' : 'en-GB');

// ---------------------------------------------------------------------------
// Text to speech
// ---------------------------------------------------------------------------
const nativeTTS = () => window.Capacitor?.Plugins?.TextToSpeech || null;
let desktopVoice = null;       // Windows app: null = not checked yet, then true/false
let current = null;            // HTMLAudioElement playing Gemini audio
const geminiCache = new Map(); // text -> object URL (memory only)

function englishVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang));
  if (!voices.length) return null;
  const want = variant().toLowerCase();
  const score = v => (v.lang.toLowerCase().replace('_', '-') === want ? 4 : 0) +
    (/natural|neural|online/i.test(v.name) ? 3 : 0) + (/google|microsoft/i.test(v.name) ? 1 : 0);
  return voices.sort((a, b) => score(b) - score(a))[0];
}
// Chrome fills the voice list asynchronously
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};

export function stopSpeaking() {
  try { speechSynthesis?.cancel(); } catch { /* not supported */ }
  nativeTTS()?.stop().catch(() => {});
  window.aecDesktop?.stop().catch(() => {});
  if (current) { current.pause(); current = null; }
}

/* Resolves when the sentence has been spoken (or failed). slow=true for the turtle button. */
export async function speak(text, { slow = false } = {}) {
  if (!text) return;
  stopSpeaking();
  const tts = nativeTTS();
  if (tts) {
    try {
      await tts.speak({ text, lang: variant(), rate: slow ? 0.65 : 0.95, pitch: 1, volume: 1, queueStrategy: 0 });
      return;
    } catch (err) { console.warn('native tts', err); }
  }
  // Windows app: SAPI English voice (Chromium there lists no English voice)
  if (window.aecDesktop && desktopVoice !== false) {
    try {
      if (desktopVoice === null) desktopVoice = (await window.aecDesktop.voices()).length > 0;
      if (desktopVoice) { await window.aecDesktop.speak({ text, rate: slow ? 0.7 : 1 }); return; }
    } catch (err) { console.warn('desktop tts', err); }
  }
  const voice = englishVoice();
  if (voice) {
    await new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice; u.lang = voice.lang; u.rate = slow ? 0.7 : 0.95;
      u.onend = u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
    return;
  }
  let url = geminiCache.get(text);
  if (!url) {
    url = await G.synthesizeSpeech(text, store.load().user?.preferred_english);
    geminiCache.set(text, url);
  }
  await new Promise(resolve => {
    current = new Audio(url);
    current.playbackRate = slow ? 0.75 : 1;
    current.onended = current.onerror = () => resolve();
    current.play().catch(() => resolve());
  });
}

// ---------------------------------------------------------------------------
// Microphone -> 16 kHz mono WAV (Gemini reads WAV; MediaRecorder gives WebM)
// ---------------------------------------------------------------------------
const WORKLET = `
class Rec extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('rec-worklet', Rec);`;

export function micSupported() {
  return !!(navigator.mediaDevices?.getUserMedia && window.AudioWorkletNode);
}

/* start() -> {stop(): Promise<{wav: Blob, seconds}>, cancel()}; onLevel(0..1) for the meter. */
export async function startRecording({ onLevel, maxSeconds = 30 } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  if (ctx.state === 'suspended') await ctx.resume();
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const node = new AudioWorkletNode(ctx, 'rec-worklet');
  const chunks = [];
  node.port.onmessage = e => {
    const f = e.data;
    chunks.push(f);
    if (onLevel) {
      let sum = 0;
      for (let i = 0; i < f.length; i++) sum += f[i] * f[i];
      onLevel(Math.min(1, Math.sqrt(sum / f.length) * 6));
    }
  };
  ctx.createMediaStreamSource(stream).connect(node);
  node.connect(ctx.destination);

  let done = false, resolveStop;
  const finished = new Promise(r => { resolveStop = r; });
  const close = () => {
    stream.getTracks().forEach(t => t.stop());
    node.port.onmessage = null;
    ctx.close().catch(() => {});
  };
  const finish = () => {
    if (done) return finished;
    done = true;
    close();
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const pcm = new Int16Array(total);
    let o = 0;
    for (const c of chunks) for (let i = 0; i < c.length; i++) {
      const s = Math.max(-1, Math.min(1, c[i]));
      pcm[o++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    resolveStop({ wav: G.pcmToWavBlob(new Uint8Array(pcm.buffer), ctx.sampleRate), seconds: total / ctx.sampleRate });
    return finished;
  };
  const timer = setTimeout(finish, maxSeconds * 1000);
  return {
    stop: () => { clearTimeout(timer); return finish(); },
    cancel: () => { clearTimeout(timer); done = true; close(); },
    finished,
  };
}

export async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------------------------------------------------------------------------
// Sound effects — synthesised, no files
// ---------------------------------------------------------------------------
let fx = null;
const tone = (freq, start, dur, type = 'sine', gain = 0.16) => {
  const o = fx.createOscillator(), g = fx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, fx.currentTime + start);
  g.gain.setValueAtTime(0.0001, fx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, fx.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, fx.currentTime + start + dur);
  o.connect(g).connect(fx.destination);
  o.start(fx.currentTime + start);
  o.stop(fx.currentTime + start + dur + 0.05);
};

const SFX = {
  tap: () => tone(660, 0, 0.06, 'triangle', 0.05),
  good: () => { tone(880, 0, 0.12); tone(1318.5, 0.09, 0.22); },
  bad: () => { tone(220, 0, 0.16, 'square', 0.06); tone(174.6, 0.13, 0.24, 'square', 0.05); },
  combo: () => [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, i * 0.06, 0.12, 'triangle', 0.09)),
  done: () => [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, i * 0.1, 0.28, 'triangle', 0.12)),
  level: () => [392, 523.25, 659.25, 783.99, 1046.5, 1568].forEach((f, i) => tone(f, i * 0.12, 0.4, 'sawtooth', 0.05)),
};

export function sfx(name) {
  if (store.load().settings.sound === false) return;
  try {
    fx = fx || new (window.AudioContext || window.webkitAudioContext)();
    if (fx.state === 'suspended') fx.resume();
    SFX[name]?.();
  } catch { /* audio blocked: silent is fine */ }
  if (name === 'bad') navigator.vibrate?.(60);
}
