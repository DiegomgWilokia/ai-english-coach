/* Voice conversation straight from the phone to the Gemini Live API.
 *
 * The desktop app proxies this through its own WebSocket; here the browser
 * talks to Google directly, so there is no server in between. Mic audio goes up
 * as 16 kHz PCM, the coach's voice comes back as 24 kHz PCM, and Google's own
 * voice-activity detection decides when a turn ends.
 */
import * as L from './ladder.js';
import * as G from './gemini.js';
import { buildLiveSystemPrompt } from './prompts.js';

const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const PCM16_WORKLET = `
class PCM16Worklet extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0][0];
    if (!ch) return true;
    const out = new Int16Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    this.port.postMessage(out.buffer, [out.buffer]);
    return true;
  }
}
registerProcessor('pcm16-worklet', PCM16Worklet);`;

const b64 = buf => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = s => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

export class LiveSession {
  constructor(handlers = {}) {
    this.on = handlers;                 // {status, inputText, outputText, turnEnd, speaking}
    this.messages = [];                 // [{role, content}] for the final evaluation
    this.ws = null;
    this.mic = null;
    this.inCtx = null;
    this.outCtx = null;
    this.queue = [];
    this.playing = false;
    this.source = null;
    this.inParts = [];
    this.outParts = [];
  }

  async start(user, role, scenario) {
    const system = buildLiveSystemPrompt(user, role, scenario);
    const voice = user.preferred_english === 'british' ? 'Aoede' : 'Puck';
    await L.call('live', model => this._connect(model, system, voice));
    await this._startMic();
    this._send({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text: '(Begin the roleplay by greeting the student and setting the scene in 1-2 sentences.)' }] }],
        turnComplete: true,
      },
    });
  }

  _connect(model, system, voice) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}?key=${encodeURIComponent(G.apiKey())}`);
      this.ws = ws;
      let ready = false;

      const fail = reason => {
        const err = new Error(reason || 'La conexión de voz se cerró');
        err.body = reason || '';
        reject(err);
      };

      ws.onopen = () => ws.send(JSON.stringify({
        setup: {
          model: `models/${model}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
          },
          systemInstruction: { parts: [{ text: system }] },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      }));

      ws.onmessage = async ev => {
        const text = ev.data instanceof Blob ? await ev.data.text() : ev.data;
        let msg;
        try { msg = JSON.parse(text); } catch { return; }
        if (msg.setupComplete && !ready) {
          ready = true;
          this.on.status?.('Preparado');
          return resolve();
        }
        this._handleServer(msg);
      };

      ws.onerror = () => { if (!ready) fail('No se pudo abrir la conexión de voz.'); };
      ws.onclose = ev => {
        this._stopAudio();
        if (!ready) return fail(ev.reason);
        this.on.status?.('Conexión cerrada');
      };
    });
  }

  _handleServer(msg) {
    const sc = msg.serverContent;
    if (!sc) return;

    if (sc.interrupted) this._clearQueue();

    for (const part of sc.modelTurn?.parts || []) {
      if (part.inlineData?.data) this._play(unb64(part.inlineData.data));
    }
    if (sc.inputTranscription?.text) {
      this.inParts.push(sc.inputTranscription.text);
      this.on.inputText?.(sc.inputTranscription.text);
    }
    if (sc.outputTranscription?.text) {
      this.outParts.push(sc.outputTranscription.text);
      this.on.outputText?.(sc.outputTranscription.text);
    }
    if (sc.turnComplete) {
      const said = this.inParts.join('').trim();
      const heard = this.outParts.join('').trim();
      if (said) this.messages.push({ role: 'user', content: said });
      if (heard) this.messages.push({ role: 'assistant', content: heard });
      this.inParts = [];
      this.outParts = [];
      this.on.turnEnd?.();
    }
  }

  _send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  sendText(text) {
    this._send({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } });
    this.messages.push({ role: 'user', content: text });
  }

  async _startMic() {
    this.mic = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.inCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    if (this.inCtx.state === 'suspended') await this.inCtx.resume();

    const url = URL.createObjectURL(new Blob([PCM16_WORKLET], { type: 'application/javascript' }));
    await this.inCtx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    const node = new AudioWorkletNode(this.inCtx, 'pcm16-worklet');
    node.port.onmessage = e => {
      // While the coach is speaking, don't feed its own voice back in.
      if (this.playing) return;
      this._send({ realtimeInput: { audio: { data: b64(e.data), mimeType: 'audio/pcm;rate=16000' } } });
    };
    this.inCtx.createMediaStreamSource(this.mic).connect(node);
    node.connect(this.inCtx.destination);   // keeps the graph alive; the worklet emits no sound
    this.on.status?.('Te escucho');
  }

  _play(pcm) {
    if (!this.outCtx) this.outCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    if (this.outCtx.state === 'suspended') this.outCtx.resume().catch(() => {});
    const int16 = new Int16Array(pcm);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;
    const buffer = this.outCtx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);
    this.queue.push(buffer);
    if (!this.playing) this._playNext();
  }

  _playNext() {
    const buffer = this.queue.shift();
    if (!buffer) {
      this.playing = false;
      this.on.speaking?.(false);
      this.on.status?.('Te escucho');
      return;
    }
    this.playing = true;
    this.on.speaking?.(true);
    this.on.status?.('Hablando');
    const src = this.outCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.outCtx.destination);
    src.onended = () => this._playNext();
    src.start();
    this.source = src;
  }

  _clearQueue() {
    this.queue = [];
    try { this.source?.stop(); } catch { /* already stopped */ }
    this.source = null;
    this.playing = false;
    this.on.speaking?.(false);
  }

  _stopAudio() {
    this._clearQueue();
    this.mic?.getTracks().forEach(t => t.stop());
    this.inCtx?.close().catch(() => {});
    this.outCtx?.close().catch(() => {});
    this.mic = this.inCtx = this.outCtx = null;
  }

  stop() {
    this._stopAudio();
    try { this.ws?.close(); } catch { /* already closed */ }
    this.ws = null;
    return this.messages;
  }
}
