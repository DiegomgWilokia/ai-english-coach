// End-to-end: real Chrome (headless) drives the real app through the DevTools
// protocol. Gemini is faked at the network layer, so no key or quota is used.
// Flow: welcome -> key -> onboarding -> path -> full lesson (every exercise type,
// one deliberate miss) -> end screen -> practice, coach chat, progress, profile.
// Screenshots go to tests/out/. Exit 1 on any page error or failed expectation.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error('No Chrome/Edge found (set CHROME=path).'); process.exit(1); }

// ---------------------------------------------------------------------------
// The fake teacher: one lesson that uses every exercise type
// ---------------------------------------------------------------------------
const LESSON = {
  title: 'Experiencias de vida',
  items: [
    { type: 'teach', title: 'Present perfect vs past simple', body: 'Usa **present perfect** para experiencias sin fecha.\n- I have been to Rome.\n- Con fecha: past simple.', examples: [{ en: 'I have visited Paris twice.', es: 'He visitado París dos veces.' }] },
    { type: 'choice', prompt: 'I ___ to London three times.', options: ['have been', 'was', 'have went'], answer: 'have been', explain: 'Experiencia sin fecha: present perfect.', topic: 'present perfect' },
    { type: 'cloze', prompt: 'She ___ (finish) her project yesterday.', hint: 'finish', answer: 'finished', accept: ['finished'], explain: 'Yesterday pide past simple.', topic: 'past simple' },
    { type: 'order', es: 'Nunca he comido sushi', answer: 'I have never eaten sushi', accept: ["I've never eaten sushi"], distractors: ['ate', 'did'], explain: 'never va entre have y el participio.', topic: 'present perfect' },
    { type: 'translate', es: 'Hemos trabajado aquí desde 2020', answer: 'We have worked here since 2020', accept: ["We've worked here since 2020"], explain: 'since + punto en el tiempo.', topic: 'for/since' },
    { type: 'match', pairs: [{ en: 'already', es: 'ya' }, { en: 'yet', es: 'todavía' }, { en: 'just', es: 'acabar de' }, { en: 'ever', es: 'alguna vez' }], topic: 'adverbs' },
    { type: 'listen', audio: 'I have just finished my homework.', prompt: 'What did you hear?', options: ['I have just finished my homework.', 'I just finish my homework.', 'I had finished my homework.'], answer: 'I have just finished my homework.', explain: 'just + present perfect.', topic: 'just' },
    { type: 'dictation', audio: 'Have you ever been to Japan?', explain: 'Pregunta de experiencia.', topic: 'ever' },
    { type: 'transform', prompt: 'I started learning English five years ago.', keyword: 'FOR', start: 'I ___ five years.', answer: 'have been learning English for', accept: ['have learnt English for', 'have learned English for'], explain: 'ago → for + present perfect.', topic: 'for/since' },
    { type: 'wordform', prompt: 'Her ___ in the job was impressive.', base: 'PERFORM', answer: 'performance', explain: 'Hace falta un sustantivo.', topic: 'word formation' },
    { type: 'speak', say: 'I have never been to Australia.', es: 'Nunca he estado en Australia.', explain: 'Pronuncia bien "been".' },
  ],
};
const answerOf = it => it.type === 'dictation' ? it.audio : it.answer;
const gradable = LESSON.items.filter(i => i.type !== 'teach');

const geminiText = text => ({ candidates: [{ content: { parts: [{ text }] } }] });
const silence = Buffer.alloc(24000 * 2 * 0.3).toString('base64');     // 0.3 s of 24 kHz PCM

let lessonsServed = 0, coachCalls = 0, judgeCalls = 0;
function fakeGemini(url, method, postData) {
  if (method === 'OPTIONS') return { status: 204, body: '' };
  if (url.includes('/models?')) return { status: 200, body: JSON.stringify({ models: [{ name: 'models/fake' }] }) };
  const body = postData ? JSON.parse(postData) : {};
  if (body.generationConfig?.responseModalities?.includes('AUDIO')) {
    return { status: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/pcm', data: silence } }] } }] }) };
  }
  const text = JSON.stringify(body.contents || '');
  const system = JSON.stringify(body.systemInstruction || '');
  if (text.includes('writing ONE micro-lesson')) { lessonsServed++; return { status: 200, body: JSON.stringify(geminiText(JSON.stringify(LESSON))) }; }
  if (text.includes('Judge one answer')) { judgeCalls++; return { status: 200, body: JSON.stringify(geminiText('{"correct":false,"feedback":"Falta el present perfect.","better":"We have worked here since 2020"}')) }; }
  if (system.includes('Coach')) { coachCalls++; return { status: 200, body: JSON.stringify(geminiText('**Present perfect** = experiencias sin fecha.\n- I have been to Rome.\n- I have never seen snow.')) }; }
  return { status: 200, body: JSON.stringify(geminiText('{}')) };
}

// ---------------------------------------------------------------------------
// Minimal DevTools protocol client
// ---------------------------------------------------------------------------
async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aec-e2e-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--window-size=412,915', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]); });
    setTimeout(() => reject(new Error('Chrome did not start')), 20000);
  });
  const port = new URL(wsUrl).port;
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const waiting = new Map(), handlers = {};
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) (handlers[msg.method] || []).forEach(fn => fn(msg.params));
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    waiting.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const on = (method, fn) => { (handlers[method] ||= []).push(fn); };
  const close = () => { try { ws.close(); } catch {} proc.kill(); setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 800); };
  return { send, on, close };
}

// ---------------------------------------------------------------------------
const server = await serve();
const BASE = `http://127.0.0.1:${server.address().port}/app/index.html`;
const cdp = await launch();
const errors = [], failures = [];
const expect = (cond, msg) => { if (!cond) { failures.push(msg); console.log('  ✖', msg); } else console.log('  ✔', msg); };

cdp.on('Runtime.exceptionThrown', p => errors.push(`exception: ${p.exceptionDetails?.exception?.description || p.exceptionDetails?.text}`));
cdp.on('Runtime.consoleAPICalled', p => {
  if (p.type === 'error') errors.push(`console.error: ${p.args.map(a => a.value ?? a.description).join(' ')}`);
});
cdp.on('Fetch.requestPaused', async p => {
  const r = fakeGemini(p.request.url, p.request.method, p.request.postData);
  await cdp.send('Fetch.fulfillRequest', {
    requestId: p.requestId, responseCode: r.status,
    responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' },
      { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' }],
    body: Buffer.from(r.body).toString('base64'),
  }).catch(() => {});
});
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');
await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*generativelanguage.googleapis.com*', requestStage: 'Request' }] });

const evaluate = async expr => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${expr.slice(0, 80)} -> ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(expr, label, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await evaluate(expr).catch(() => false)) return true; await sleep(100); }
  failures.push(`timeout: ${label}`); console.log('  ✖ timeout:', label);
  return false;
}
const click = sel => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no ${sel.replace(/'/g, '')}'); el.click(); return true; })()`);
const type = (sel, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
let shot = 0;
async function screenshot(name) {
  await sleep(450);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(OUT, `${String(++shot).padStart(2, '0')}-${name}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
}
const viewport = (width, height, mobile) => cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });

try {
  await viewport(412, 915, true);
  console.log('Welcome + key');
  await cdp.send('Page.navigate', { url: BASE });
  await waitFor(`document.querySelector('[data-act="welcome-go"]')`, 'welcome screen');
  await screenshot('welcome');
  await click('[data-act="welcome-go"]');
  await waitFor(`!!document.querySelector('#key')`, 'setup screen');
  await type('#key', 'TEST-KEY-not-real-0123456789');
  await click('[data-act="save-key"]');

  console.log('Onboarding');
  await waitFor(`!!document.querySelector('#ob-name')`, 'onboarding profile step');
  await type('#ob-name', 'Diego');
  await click('[data-act="ob-next"]');
  await waitFor(`!!document.querySelector('[data-act="ob-goal"]')`, 'goal step');
  await click('[data-act="ob-goal"][data-v="Inglés para programación o tecnología"]');
  await waitFor(`!!document.querySelector('[data-act="ob-variant"]')`, 'variant step');
  await click('[data-act="ob-variant"][data-v="british"]');
  await waitFor(`!!document.querySelector('[data-act="ob-level"]')`, 'level step');
  await screenshot('onboarding-level');
  await click('[data-act="ob-level"][data-v="A2"]');
  await waitFor(`!!document.querySelector('[data-act="ob-tlevel"]')`, 'target step');
  await click('[data-act="ob-tlevel"][data-v="B2"]');
  await click('[data-act="ob-next"]');
  await waitFor(`!!document.querySelector('[data-act="ob-hours"]')`, 'hours step');
  await click('[data-act="ob-hours"][data-v="1"]');
  await waitFor(`!!document.querySelector('[data-act="ob-finish"]')`, 'done step');
  const doneText = await evaluate(`document.querySelector('#view').innerText`);
  expect(/A2 → B2/.test(doneText) && /(meses|months)/.test(doneText), 'onboarding shows an honest A2 → B2 forecast in months');
  await screenshot('onboarding-done');
  await click('[data-act="ob-finish"]');

  console.log('Path');
  await waitFor(`location.hash === '#/path' && !!document.querySelector('.hero-next')`, 'path with next lesson');
  expect(await evaluate(`document.querySelectorAll('.unit').length`) >= 12, 'B1 road shows its 12 units');
  expect(await evaluate(`!!document.querySelector('.node.next')`), 'the next stop is highlighted');
  await screenshot('path-mobile');

  console.log('Lesson');
  await click('.hero-next');
  await waitFor(`!document.getElementById('modal').hidden`, 'node popup');
  await screenshot('node-popup');
  await click('[data-act="node-go"]');
  await waitFor(`!!document.querySelector('.teach')`, 'teach card');
  await screenshot('lesson-teach');
  await click('[data-act="q-next"]');

  let missed = false, steps = 0, sawBad = false, sawGood = false;
  while (steps++ < 30) {
    await sleep(120);
    if (await evaluate(`!!document.querySelector('.end')`)) break;
    const kicker = await evaluate(`document.querySelector('.q-kicker')?.innerText || ''`);
    const bodyText = await evaluate(`document.querySelector('#lbody')?.innerText || ''`);
    const kind = await evaluate(`(() => {
      if (document.querySelector('.match')) return 'match';
      if (document.querySelector('.mic')) return 'speak';
      if (document.querySelector('#tiles')) return 'order';
      if (document.querySelector('.choice')) return 'choice';
      if (document.querySelector('.keyword')) return 'transform';
      if (document.querySelector('.base-word')) return 'wordform';
      if (document.querySelector('.es-bubble')) return 'translate';
      if (document.querySelector('.speaker.big')) return 'dictation';
      if (document.querySelector('#q-input')) return 'cloze';
      return 'unknown'; })()`);
    const candidates = gradable.filter(i => i.type === kind || (kind === 'choice' && i.type === 'listen'));
    const it = candidates.length === 1 ? candidates[0] : candidates.find(i => (i.options || []).every(o => bodyText.includes(o)));
    if (!it && kind !== 'match' && kind !== 'speak') { failures.push(`could not identify exercise (${kind}): ${kicker}`); break; }
    if (kind === 'speak') { await click('[data-act="q-skip-speak"]'); continue; }
    if (kind === 'match') {
      const pairs = LESSON.items.find(i => i.type === 'match').pairs;
      for (const p of pairs) {
        await evaluate(`(() => { const b = [...document.querySelectorAll('.mtile')]; b.find(x => x.dataset.side === 'en' && x.innerText === ${JSON.stringify(p.en)}).click(); b.find(x => x.dataset.side === 'es' && x.innerText === ${JSON.stringify(p.es)}).click(); })()`);
      }
    } else {
      const wrongNow = !missed && it.type === 'translate';
      const answer = wrongNow ? 'We work here since 2020' : answerOf(it);
      if (kind === 'choice') await evaluate(`[...document.querySelectorAll('.choice')].find(b => b.dataset.v === ${JSON.stringify(answer)}).click()`);
      else if (kind === 'order') {
        for (const w of answer.split(' ')) await evaluate(`[...document.querySelectorAll('#tiles .tile-w:not(.used)')].find(b => b.innerText === ${JSON.stringify(w)}).click()`);
      } else await type('#q-input', answer);
      if (wrongNow) missed = true;
      await click('#check-btn');
    }
    await waitFor(`!document.getElementById('sheet')?.hidden`, `feedback sheet for ${kind}`, 6000);
    const good = await evaluate(`document.getElementById('sheet').classList.contains('good')`);
    if (good && !sawGood) { sawGood = true; await screenshot('lesson-correct'); }
    if (!good && !sawBad) { sawBad = true; await screenshot('lesson-wrong'); }
    await click('#next-btn');
  }
  expect(sawGood && sawBad, 'feedback sheets for right and wrong answers');
  expect(judgeCalls === 1, `a rejected open answer is double-checked by the AI once (got ${judgeCalls})`);
  await waitFor(`!!document.querySelector('.end')`, 'end screen');
  await sleep(1300);
  const endText = await evaluate(`document.querySelector('.end').innerText`);
  expect(/\d+/.test(await evaluate(`document.getElementById('end-xp').innerText`)) && Number(await evaluate(`document.getElementById('end-xp').innerText`)) > 0, 'end screen awards XP');
  expect(/89%/.test(endText), `accuracy = first try, skipped speaking excluded (8/9 = 89%): ${endText.match(/\d+%/)?.[0]}`);
  expect(/LP/.test(endText), 'end screen shows the LP change');
  await screenshot('lesson-end');
  await click('[data-act="lesson-continue"]');
  await waitFor(`location.hash === '#/path'`, 'back on the path');
  await sleep(600);
  expect(await evaluate(`document.querySelector('.node.k-learn').classList.contains('done')`), 'first stop marked done');
  expect(await evaluate(`document.querySelector('.node.next')?.dataset.kind`) === 'words', 'next stop is vocabulary');
  const st = await evaluate(`JSON.parse(localStorage.getItem('aec.state'))`);
  expect(st.review.length === 1, 'the missed exercise entered the review deck');
  expect(st.user.streak_days === 1, 'streak started');
  await screenshot('path-after-lesson');

  console.log('Other screens');
  await cdp.send('Page.navigate', { url: BASE + '#/practice' });
  await waitFor(`!!document.querySelector('.review-hero')`, 'practice hub');
  await screenshot('practice');
  await cdp.send('Page.navigate', { url: BASE + '#/coach' });
  await waitFor(`!!document.querySelector('#coach-input')`, 'coach chat');
  await click('[data-act="coach-suggest"]');
  await waitFor(`document.querySelectorAll('.coach-stream .bubble-ai').length >= 2 && !document.getElementById('typing')`, 'coach reply');
  expect(await evaluate(`!!document.querySelector('.coach-stream .bubble-ai b')`), 'coach reply renders markdown');
  await screenshot('coach');
  await cdp.send('Page.navigate', { url: BASE + '#/progress' });
  await waitFor(`!!document.querySelector('.rank-big')`, 'progress');
  await screenshot('progress');
  await cdp.send('Page.navigate', { url: BASE + '#/profile' });
  await waitFor(`!!document.querySelector('[data-act="save-profile"]')`, 'profile');
  await screenshot('profile');

  console.log('Review session');
  await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('aec.state')); s.review.forEach(c => c.due = '2000-01-01'); localStorage.setItem('aec.state', JSON.stringify(s)); })()`);
  await cdp.send('Page.navigate', { url: BASE + '#/practice' });
  await sleep(500);
  await cdp.send('Page.reload');
  await waitFor(`!!document.querySelector('.review-hero.hot')`, 'review due');
  await click('.review-hero');
  await waitFor(`!!document.querySelector('#lbody')`, 'review lesson');
  await screenshot('review');

  console.log('Desktop layout');
  await viewport(1366, 900, false);
  await cdp.send('Page.navigate', { url: BASE + '#/path' });
  await waitFor(`!!document.querySelector('.path-rail .quests')`, 'desktop path with quests rail');
  await screenshot('path-desktop');
  await cdp.send('Page.navigate', { url: BASE + '#/progress' });
  await waitFor(`!!document.querySelector('.rank-big')`, 'desktop progress');
  await screenshot('progress-desktop');
  expect(lessonsServed >= 1, `lessons generated: ${lessonsServed} (1 + prefetch of the next)`);
} catch (err) {
  failures.push(err.message);
  console.error(err);
} finally {
  cdp.close();
  server.close();
}

const relevant = errors.filter(e => !/favicon|ERR_INTERNET_DISCONNECTED|fonts\.g/.test(e));
if (relevant.length) { console.log('\nPage errors:'); relevant.forEach(e => console.log('  ', e)); }
console.log(`\nScreenshots: ${OUT}`);
if (failures.length || relevant.length) {
  console.log(`FAILED: ${failures.length} expectation(s), ${relevant.length} page error(s)`);
  process.exit(1);
}
console.log('E2E OK');
