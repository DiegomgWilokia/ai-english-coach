/* Screens and routing. Logic lives in coach.js/gemini.js; this file only renders. */
import * as store from './store.js';
import * as C from './coach.js';
import * as G from './gemini.js';
import { QuotaExhausted } from './ladder.js';
import { initReminders, toggleReminders, setReminderHour } from './notify.js';
import { LiveSession } from './live.js';
import { t, lang, setLang, goalLabel, goalIcon, GOAL_LABELS } from './i18n.js';

const $ = sel => document.querySelector(sel);
const view = () => $('#view');

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------------------
// Rank shields (SVG, no assets)
// ---------------------------------------------------------------------------
const RANK_STYLE = {
  bronze:   { g: ['#7c4a1d', '#d99a55', '#8a5626'], stroke: '#3c2410', text: '#fff7ed' },
  silver:   { g: ['#8d97a7', '#eef2f7', '#aab4c2'], stroke: '#4b5563', text: '#1f2937' },
  gold:     { g: ['#a86f0e', '#ffe08a', '#e0ac25'], stroke: '#5c3d05', text: '#452c00' },
  platinum: { g: ['#2e8f96', '#c5fbf6', '#62d2d9'], stroke: '#155e63', text: '#083c40' },
  obsidian: { g: ['#181228', '#6d5bd8', '#241b3e'], stroke: '#0c0817', text: '#e9e3ff' },
  diamond:  { g: ['#2b7fb8', '#e3f6ff', '#72ccf9'], stroke: '#155a88', text: '#0b3954' },
};
let svgN = 0;

export function rankSVG(level, size = 56) {
  const st = RANK_STYLE[C.rankOf(level)];
  const id = `rg${++svgN}`;
  return `<svg class="shield" viewBox="0 0 100 116" width="${size}" height="${Math.round(size * 1.16)}" aria-label="${level}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${st.g[0]}"/><stop offset=".5" stop-color="${st.g[1]}"/><stop offset="1" stop-color="${st.g[2]}"/>
    </linearGradient></defs>
    <path d="M50 4 L88 18 V56 C88 86 70 104 50 112 C30 104 12 86 12 56 V18 Z"
          fill="url(#${id})" stroke="${st.stroke}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M50 10 L82 22 V55 C82 66 78 76 72 84 L50 12 Z" fill="#fff" opacity=".16"/>
    <text x="50" y="68" text-anchor="middle" font-family="'Space Grotesk',sans-serif"
          font-size="30" font-weight="800" fill="${st.text}">${level}</text>
  </svg>`;
}

const rankName = level => t('rank_' + C.rankOf(level));

// ---------------------------------------------------------------------------
// Chrome: toast, loader, modal, confetti
// ---------------------------------------------------------------------------
let toastTimer;
export function toast(message, kind = '') {
  const el = $('#toast');
  el.className = `toast ${kind}`;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, kind === 'bad' ? 8000 : 4000);
}

async function withLoader(text, fn) {
  $('#loader-text').textContent = text;
  $('#loader').hidden = false;
  try {
    return await fn();
  } catch (err) {
    toast(err instanceof QuotaExhausted ? err.message : (err.message || t('error_generic')), 'bad');
    console.error(err);
    return null;
  } finally {
    $('#loader').hidden = true;
  }
}

function openModal(html) {
  $('#modal-card').innerHTML = html + `<button class="btn btn-ghost btn-block" style="margin-top:16px" data-act="modal-close">${t('close')}</button>`;
  $('#modal').hidden = false;
}
const closeModal = () => { $('#modal').hidden = true; };

function confetti() {
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#7c5cff', '#22d3ee', '#f0abfc', '#ffd977', '#34d399'];
  box.innerHTML = Array.from({ length: 34 }, (_, i) =>
    `<i style="left:${Math.random() * 100}%;background:${colors[i % 5]};animation-delay:${Math.random() * .9}s"></i>`).join('');
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4200);
}

const sevPill = s => {
  const n = Math.max(1, Math.min(5, parseInt(s, 10) || 1));
  return `<span class="pill sev-${n}">${t('sev_' + n)}</span>`;
};

function sevLegend() {
  openModal(`<h3>${t('sev_title')}</h3><p class="dim" style="margin:10px 0 14px">${t('sev_body')}</p>
    <div class="stack" style="gap:9px">${[1, 2, 3, 4, 5].map(n =>
      `<div class="icon-row"><span class="pill sev-${n}">${t('sev_' + n)}</span><small>${n}/5</small></div>`).join('')}</div>`);
}

function ranksLegend() {
  openModal(`<h3>${t('pf_ranks')}</h3>
    <div class="rank-grid" style="margin-top:14px">${C.LEVELS.map(l =>
      `<div class="rank-card">${rankSVG(l, 42)}<b>${rankName(l)}</b><span>${l}</span></div>`).join('')}</div>`);
}

// ---------------------------------------------------------------------------
// Router + navigation chrome
// ---------------------------------------------------------------------------
const routes = {};
const go = path => { window.location.hash = `#${path}`; };
const BARE = ['/welcome', '/setup', '/onboarding', '/placement'];
const NAV = [
  ['/dashboard', '🏠', 'nav_home'],
  ['/exercises', '📝', 'nav_practice'],
  ['/vocab', '📖', 'nav_vocab'],
  ['/lessons', '📚', 'nav_lessons'],
  ['/profile', '👤', 'nav_profile'],
];

function renderChrome(base) {
  const bare = BARE.includes(base);
  document.body.classList.toggle('bare', bare);
  $('#sidebar').hidden = bare;
  $('#topbar').hidden = bare;
  $('#tabbar').hidden = bare;
  if (bare) return;

  const links = mob => NAV.map(([r, ico, key]) =>
    `<a href="#${r}" class="${r === base ? 'active' : ''}"><span class="${mob ? '' : 'ico'}">${ico}</span>${mob ? t(key) : `<span>${t(key)}</span>`}</a>`).join('');
  $('#side-nav').innerHTML = links(false);
  $('#tabbar').innerHTML = links(true);

  const u = store.load().user;
  if (u) {
    $('#level-chip').hidden = false;
    $('#level-chip').textContent = `${u.current_level} · ${u.level_score}`;
    $('#side-rank').innerHTML = `<div class="side-rank-card">${rankSVG(u.current_level, 34)}
      <div style="flex:1"><div class="side-rank-name">${rankName(u.current_level)}</div>
      <div class="bar" style="margin-top:5px"><span style="width:${u.level_score}%"></span></div>
      <div class="side-rank-sub">${u.level_score}/100</div></div></div>`;
    $('#top-avatar').innerHTML = u.photo ? `<img src="${u.photo}" alt=""/>` : (u.name ? esc(u.name[0].toUpperCase()) : '👤');
  }
  $('#lang-side').innerHTML = langToggle();
}

const langToggle = () => `
  <button data-act="lang" data-lang="en" class="${lang() === 'en' ? 'on' : ''}">EN</button>
  <button data-act="lang" data-lang="es" class="${lang() === 'es' ? 'on' : ''}">ES</button>`;

function currentPath() { return window.location.hash.replace(/^#/, '') || '/dashboard'; }

async function route() {
  const path = currentPath();
  const [base] = path.split('?');

  if (!G.hasKey() && !['/welcome', '/setup'].includes(base)) return go('/welcome');
  if (G.hasKey() && !store.load().user && !['/setup', '/onboarding', '/welcome'].includes(base)) return go('/onboarding');

  renderChrome(base);
  window.scrollTo(0, 0);
  await (routes[base] || routes['/dashboard'])(new URLSearchParams(path.split('?')[1] || ''));
}

// ---------------------------------------------------------------------------
// Welcome
// ---------------------------------------------------------------------------
routes['/welcome'] = () => {
  view().innerHTML = `
    <div class="hero-wrap">
      <img class="hero-logo" src="icon-192.png" alt=""/>
      <h1>${t('wel_tag')}</h1>
      <p class="hero-sub">${t('wel_sub')}</p>
      <div class="hero-feats">
        <div>🎯 ${t('wel_f1')}</div>
        <div>🎙️ ${t('wel_f2')}</div>
        <div>${rankSVG('C2', 22)} ${t('wel_f3')}</div>
      </div>
      <div><button class="btn btn-primary btn-lg" style="min-width:240px" data-act="welcome-go">🚀 ${t('wel_cta')}</button></div>
      <p class="muted" style="margin-top:22px;font-size:13px">🔒 ${t('wel_priv')}</p>
      <div class="lang-toggle" style="margin:18px auto 0">${langToggle()}</div>
    </div>`;
};

// ---------------------------------------------------------------------------
// Setup (API key)
// ---------------------------------------------------------------------------
routes['/setup'] = () => {
  view().innerHTML = `
    <div class="wizard" style="justify-content:center">
      <div class="card">
        <h1>${t('setup_title')} 🔑</h1>
        <p class="dim" style="margin:10px 0 16px">${t('setup_body')}</p>
        <ol style="line-height:1.9;padding-left:20px;color:var(--text-dim)">
          <li>${t('setup_s1', { url: G.API_KEY_URL })}</li>
          <li>${t('setup_s2')}</li>
          <li>${t('setup_s3')}</li>
        </ol>
        <div class="stack" style="margin-top:16px">
          <input id="key" class="input" type="text" placeholder="${t('setup_ph')}" autocomplete="off" spellcheck="false"
                 value="${esc(G.apiKey())}" style="font-family:monospace"/>
          <button class="btn btn-primary btn-lg btn-block" data-act="save-key">✅ ${t('setup_btn')}</button>
        </div>
        <p class="muted" style="margin-top:16px;font-size:13px">🔒 ${t('setup_priv')}</p>
      </div>
    </div>`;
};

async function saveKey() {
  const key = $('#key').value.trim();
  const res = await withLoader(t('setup_check'), () => G.verifyKey(key));
  if (!res) return;
  if (!res.ok) return toast(res.message, 'bad');
  G.saveApiKey(key);
  toast(res.message, 'good');
  go(store.load().user ? '/dashboard' : '/onboarding');
}

// ---------------------------------------------------------------------------
// Onboarding wizard
// ---------------------------------------------------------------------------
const ob = { step: 0, name: '', last_name: '', age: '', photo: null, goal: null, variant: null, level: null, hours: 1, target_level: null, target_months: 3, study_days: ['mon', 'wed', 'fri'] };
const OB_STEPS = 7;
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MONTHS = [[1, 'm_1'], [3, 'm_3'], [6, 'm_6'], [12, 'm_12']];

const VARIANTS = [
  { id: 'british', flag: '🇬🇧', name: 'British English', vs: [['film', 'colour'], ['flat', 'lift'], ['holiday', 'autumn']] },
  { id: 'american', flag: '🇺🇸', name: 'American English', vs: [['movie', 'color'], ['apartment', 'elevator'], ['vacation', 'fall']] },
];
const LEVEL_HINTS = {
  A1: { en: '“My name is Ana. I like coffee.”', es: '«My name is Ana. I like coffee.»' },
  A2: { en: '“Yesterday I went to the beach with my friends.”', es: '«Yesterday I went to the beach with my friends.»' },
  B1: { en: '“I’ve been working here since 2022 and I enjoy it.”', es: '«I’ve been working here since 2022 and I enjoy it.»' },
  B2: { en: '“If I’d known earlier, I would have applied.”', es: '«If I’d known earlier, I would have applied.»' },
  C1: { en: '“The proposal, compelling as it was, raised concerns.”', es: '«The proposal, compelling as it was, raised concerns.»' },
  C2: { en: 'Near-native: nuance, idioms and register.', es: 'Casi nativo: matices, idioms y registro.' },
};
const HOURS = [[0.5, '30 min'], [1, '1 h'], [1.5, '1 h 30'], [2, '2 h'], [3, '3 h+']];

routes['/onboarding'] = () => renderOb();

function renderOb() {
  const steps = [obProfile, obGoal, obVariant, obLevel, obTarget, obHours, obDone];
  view().innerHTML = `
    <div class="wizard">
      <div class="wizard-top">
        ${ob.step > 0 && ob.step < OB_STEPS - 1 ? `<button class="btn btn-ghost btn-sm" data-act="ob-back">← ${t('ob_back')}</button>` : ''}
        <div class="bar"><span style="width:${((ob.step + 1) / OB_STEPS) * 100}%"></span></div>
        <small>${t('ob_step', { a: ob.step + 1, b: OB_STEPS })}</small>
      </div>
      <div class="wizard-step" id="ob-step">${steps[ob.step]()}</div>
    </div>`;
  if (ob.step === OB_STEPS - 1) confetti();
}

const obNext = label => `<div class="wizard-nav"><button class="btn btn-primary btn-lg" data-act="ob-next">${label || t('ob_next')} →</button></div>`;

function obProfile() {
  return `
    <h1>${t('ob_profile')} 👋</h1><p class="sub">${t('ob_profile_sub')}</p>
    <div class="stack">
      <div class="photo-pick">
        <div class="ph ${ob.photo ? 'has' : ''}" id="ob-ph">${ob.photo ? `<img src="${ob.photo}"/>` : '📷'}</div>
        <button class="btn btn-ghost" data-act="ob-photo">${ob.photo ? t('ob_photo_change') : t('ob_photo')}</button>
        <input id="ob-file" type="file" accept="image/*" hidden/>
      </div>
      <div class="row">
        <label class="f">${t('ob_name')}<input id="ob-name" class="input" value="${esc(ob.name)}" placeholder="Diego"/></label>
        <label class="f">${t('ob_lastname')}<input id="ob-last" class="input" value="${esc(ob.last_name)}"/></label>
      </div>
      <label class="f" style="max-width:140px">${t('ob_age')}<input id="ob-age" class="input" type="number" min="5" max="99" value="${esc(ob.age)}"/></label>
    </div>
    ${obNext()}`;
}

function obGoal() {
  return `
    <h1>${t('ob_goal')} 🎯</h1><p class="sub">${t('ob_goal_sub')}</p>
    <div class="opt-grid">${Object.keys(GOAL_LABELS).map(g =>
      `<button class="opt-card ${ob.goal === g ? 'on' : ''}" data-act="ob-goal" data-v="${esc(g)}">
        <span class="ico">${goalIcon(g)}</span>${esc(goalLabel(g))}</button>`).join('')}
    </div>`;
}

function obVariant() {
  return `
    <h1>${t('ob_variant')}</h1><p class="sub">${t('ob_variant_sub')}</p>
    <div class="variant-grid">${VARIANTS.map(v => `
      <button class="variant-card ${ob.variant === v.id ? 'on' : ''}" data-act="ob-variant" data-v="${v.id}">
        <span class="flag">${v.flag}</span><h3>${v.name}</h3>
        <div class="vs">${v.vs.map(p => `<span><b>${p[0]}</b> · <b>${p[1]}</b></span>`).join('')}</div>
      </button>`).join('')}
    </div>`;
}

function obLevel() {
  return `
    <h1>${t('ob_level')}</h1><p class="sub">${t('ob_level_sub')}</p>
    <div class="rank-grid">${C.LEVELS.map(l => `
      <button class="rank-card ${ob.level === l ? 'on' : ''}" data-act="ob-level" data-v="${l}">
        ${rankSVG(l, 46)}<b>${rankName(l)}</b><span>${l}</span>
        <small style="min-height:30px">${LEVEL_HINTS[l][lang()]}</small>
      </button>`).join('')}
    </div>
    <button class="btn btn-ghost btn-block" style="margin-top:14px" data-act="ob-test">
      🧭 ${t('ob_test_btn')} <small class="muted">· ${t('ob_test_time')}</small>
    </button>`;
}

function obTarget() {
  const cur = ob.level === 'TEST' ? 'A1' : (ob.level || 'B1');
  const pool = C.LEVELS.filter(l => C.levelIndex(l) > C.levelIndex(cur));
  const opts = pool.length ? pool : ['C2'];
  if (!ob.target_level || !opts.includes(ob.target_level)) ob.target_level = opts[0];
  return `
    <h1>${t('ob_target')} 🎯</h1><p class="sub">${t('ob_target_sub')}</p>
    <div class="stack">
      <div><label class="f">${t('ob_target_level')}</label>
        <div class="chips" style="margin-top:8px">${opts.map(l =>
          `<button class="chip ${ob.target_level === l ? 'on' : ''}" data-act="ob-tlevel" data-v="${l}">${l} · ${rankName(l)}</button>`).join('')}</div></div>
      <div><label class="f">${t('ob_target_months')}</label>
        <div class="chips" style="margin-top:8px">${MONTHS.map(([v, k]) =>
          `<button class="chip ${ob.target_months === v ? 'on' : ''}" data-act="ob-tmonths" data-v="${v}">${t(k)}</button>`).join('')}</div></div>
      <div><label class="f">${t('ob_target_days')}</label>
        <div class="chips" style="margin-top:8px">${DAYS.map(d =>
          `<button class="chip ${ob.study_days.includes(d) ? 'on' : ''}" data-act="ob-tday" data-v="${d}">${t('d_' + d)}</button>`).join('')}</div></div>
    </div>
    ${obNext()}`;
}

function obHours() {
  return `
    <h1>${t('ob_hours')} ⏱️</h1><p class="sub">${t('ob_hours_sub')}</p>
    <div class="chips">${HOURS.map(([v, l]) =>
      `<button class="chip ${ob.hours === v ? 'on' : ''}" data-act="ob-hours" data-v="${v}">${l}</button>`).join('')}
    </div>`;
}

function obDone() {
  const level = ob.level === 'TEST' ? 'B1' : (ob.level || 'B1');
  return `
    <div class="center" style="padding-top:5vh">
      <h1>${t('ob_done', { name: esc(ob.name) })} 🎉</h1>
      <p class="sub">${t('ob_done_sub')}:</p>
      <div class="rank-hero">${rankSVG(level, 110)}<h2>${rankName(level)} · ${level}</h2></div>
      <div class="wizard-nav" style="max-width:340px;margin:26px auto 0">
        <button class="btn btn-primary btn-lg btn-block" data-act="ob-finish">🚀 ${t('ob_go')}</button>
      </div>
    </div>`;
}

function obAdvance() {
  if (ob.step === 0) {
    ob.name = $('#ob-name').value.trim();
    ob.last_name = $('#ob-last').value.trim();
    ob.age = $('#ob-age').value;
    if (!ob.name) return toast(t('ob_name_req'), 'bad');
  }
  if (ob.step === 3 && !ob.level) ob.level = 'B1';
  ob.step = Math.min(OB_STEPS - 1, ob.step + 1);
  renderOb();
}

function obFinish() {
  store.createUser({
    name: ob.name, last_name: ob.last_name, age: parseInt(ob.age, 10) || null, photo: ob.photo,
    goal: ob.goal || 'Conversación diaria', preferred_english: ob.variant || 'british',
    current_level: ob.level === 'TEST' ? 'B1' : (ob.level || 'B1'), daily_hours_goal: ob.hours,
    target_level: ob.target_level, target_months: ob.target_months, study_days: ob.study_days,
  });
  C.touchLogin();
  go(ob.level === 'TEST' ? '/placement' : '/dashboard');
}

function pickPhoto() {
  const input = $('#ob-file') || $('#pf-file');
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const url = await resizePhoto(file);
    if (currentPath().startsWith('/onboarding')) { ob.photo = url; renderOb(); }
    else { store.load().user.photo = url; store.save(); route(); }
  };
  input.click();
}

function resizePhoto(file) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const s = 144;
      c.width = c.height = s;
      const m = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.src = URL.createObjectURL(file);
  });
}

// ---------------------------------------------------------------------------
// Placement test
// ---------------------------------------------------------------------------
let pl = null; // {test, answers:{}, readingAnswers:{}, mode:'placement'|'exam', level}

routes['/placement'] = () => {
  pl = null;
  view().innerHTML = `
    <div class="wizard" style="justify-content:center">
      <div class="card center">
        <h1>🧭 ${t('pl_title')}</h1>
        <p class="dim" style="margin:14px 0 6px">${t('pl_intro_1')}</p>
        <p class="dim" style="margin:0 0 20px">${t('pl_intro_2')}</p>
        <button class="btn btn-primary btn-lg" style="min-width:230px" data-act="pl-start">${t('pl_start')}</button>
      </div>
    </div>`;
};

async function plStart() {
  const user = C.userForPrompt() || {
    name: ob.name || 'Student', age: ob.age, goal: ob.goal || 'general English',
    current_level: 'B1', level_score: 50, preferred_english: ob.variant || 'british', ui_lang: lang(),
  };
  const test = await withLoader(t('pl_generating'), () => G.generatePlacement(user));
  if (!test) return;
  pl = { test, answers: {}, readingAnswers: {}, mode: 'placement' };
  renderPlTest();
}

function examIntro() {
  const level = store.load().user.current_level;
  view().innerHTML = `
    <div class="wizard" style="justify-content:center">
      <div class="card center exam-banner">
        <h1>🎓 ${t('exam_title', { level })}</h1>
        <p class="dim" style="margin:14px 0 20px">${t('exam_intro', { level, pass: C.CERT_PASS })}</p>
        <button class="btn btn-primary btn-lg" style="min-width:230px" data-act="exam-gen">${t('pl_start')}</button>
      </div>
    </div>`;
}

async function examGen() {
  const level = store.load().user.current_level;
  const test = await withLoader(t('exam_generating'), () => G.generateCertExam(C.userForPrompt(), level));
  if (!test) return;
  pl = { test, answers: {}, readingAnswers: {}, mode: 'exam', level };
  renderPlTest();
}

const qBlock = (it, group) => `
  <div class="card">
    <p><b>${it.id}.</b> ${esc(it.prompt)}</p>
    ${Array.isArray(it.options) && it.options.length ? `
      <div class="qa" style="margin-top:10px">${it.options.map(o =>
        `<button class="opt" data-act="pl-pick" data-g="${group}" data-id="${it.id}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}
      </div>` :
      `<input class="input" style="margin-top:10px" data-plfill="${group}:${it.id}" autocapitalize="none" placeholder="${t('ex_your_answer')}"/>`}
  </div>`;

function renderPlTest() {
  const { test } = pl;
  view().innerHTML = `
    <div class="wizard">
      <h1>${pl.mode === 'exam' ? '🎓 ' + t('exam_title', { level: pl.level }) : '🧭 ' + t('pl_title')}</h1>
      <h3 style="margin:18px 0 10px">${t('pl_part1')}</h3>
      <div class="stack">${test.items.map(it => qBlock(it, 'g')).join('')}</div>
      <h3 style="margin:24px 0 10px">${t('pl_part2')}</h3>
      <div class="card" style="line-height:1.65">${esc(test.reading.passage)}</div>
      <div class="stack" style="margin-top:12px">${(test.reading.items || []).map(it => qBlock(it, 'r')).join('')}</div>
      <h3 style="margin:24px 0 10px">${t('pl_part3')}</h3>
      <div class="card"><p>${esc(test.writing_prompt)}</p><small class="muted">${t('pl_words')}</small>
        <textarea id="pl-writing" class="input" style="margin-top:12px"></textarea></div>
      <button class="btn btn-primary btn-lg btn-block" style="margin-top:18px" data-act="pl-submit">✅ ${t('pl_submit')}</button>
    </div>`;
}

async function plSubmit() {
  document.querySelectorAll('[data-plfill]').forEach(el => {
    const [g, id] = el.dataset.plfill.split(':');
    if (el.value.trim()) (g === 'g' ? pl.answers : pl.readingAnswers)[id] = el.value.trim();
  });
  const total = pl.test.items.length + (pl.test.reading.items || []).length;
  const done = Object.keys(pl.answers).length + Object.keys(pl.readingAnswers).length;
  if (done < total / 2) return toast(t('pl_answer_more'), 'bad');

  if (pl.mode === 'exam') {
    const result = await withLoader(t('exam_grading'), () => G.evaluateCertExam(
      C.userForPrompt(), pl.level, pl.test,
      { grammar: pl.answers, reading: pl.readingAnswers },
      $('#pl-writing').value.trim(),
    ));
    if (result) renderExamResult(result);
    return;
  }
  const result = await withLoader(t('pl_eval'), () => G.evaluatePlacement(
    C.userForPrompt(), pl.test,
    { grammar: pl.answers, reading: pl.readingAnswers },
    $('#pl-writing').value.trim(),
  ));
  if (!result) return;
  confetti();
  const scores = result.scores || {};
  view().innerHTML = `
    <div class="wizard" style="justify-content:center">
      <div class="card center">
        <p class="dim">${t('pl_result')}</p>
        <div class="rank-hero">${rankSVG(result.level, 120)}<h1>${rankName(result.level)} · ${result.level}</h1></div>
        <div class="hbars" style="margin:20px 0;text-align:left">${Object.entries(scores).map(([k, v]) =>
          `<div class="hbar-row"><span style="text-transform:capitalize">${esc(k)}</span><div class="bar"><span style="width:${v}%"></span></div><b>${v}</b></div>`).join('')}
        </div>
        ${result.summary ? `<p class="dim" style="text-align:left">${esc(result.summary)}</p>` : ''}
        <button class="btn btn-primary btn-lg btn-block" style="margin-top:18px" data-act="pl-apply" data-v="${result.level}">🚀 ${t('pl_apply')}</button>
      </div>
    </div>`;
}

function renderExamResult(result) {
  C.recordWeaknesses(result.mistakes || []);
  const res = C.resolveCertExam(result.score);
  if (res.passed) confetti();
  const sections = result.sections || {};
  view().innerHTML = `
    <div class="wizard" style="justify-content:center">
      <div class="card center">
        <h1 style="font-size:2.2rem">${res.passed ? '🎉 ' + t('exam_passed', { score: Math.round(result.score) }) : t('exam_failed', { score: Math.round(result.score) })}</h1>
        ${res.passed
          ? `<div class="rank-hero" style="margin-top:14px">${rankSVG(res.to, 120)}<h2>${rankName(res.to)} · ${res.to}</h2></div>`
          : `<p class="dim" style="margin-top:12px">${t('exam_failed_body', { pass: C.CERT_PASS })}</p>`}
        <div class="hbars" style="margin:20px 0;text-align:left">${Object.entries(sections).map(([k, v]) =>
          `<div class="hbar-row"><span style="text-transform:capitalize">${esc(k.replace(/_/g, ' '))}</span><div class="bar"><span style="width:${v}%"></span></div><b>${v}</b></div>`).join('')}
        </div>
        ${result.feedback ? `<p class="dim" style="text-align:left">${esc(result.feedback)}</p>` : ''}
        ${res.passed
          ? `<button class="btn btn-primary btn-lg btn-block" style="margin-top:18px" data-act="dip-view" data-i="${store.load().diplomas.length - 1}">🎓 ${t('exam_diploma')}</button>
             <a class="btn btn-ghost btn-block" style="margin-top:10px" href="#/dashboard">🏠 ${t('ex_home')}</a>`
          : `<a class="btn btn-primary btn-lg btn-block" style="margin-top:18px" href="#/dashboard">💪 ${t('exam_retry')}</a>`}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Diplomas
// ---------------------------------------------------------------------------
function diplomaSVG(d) {
  const to = C.nextLevel(d.level);
  const st = RANK_STYLE[C.rankOf(to)];
  const gid = `dg${++svgN}`;
  const date = new Date(d.date).toLocaleDateString(lang() === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const cursive = "font-family=\"'Segoe Script','Brush Script MT','Snell Roundhand',cursive\"";
  const corner = 'M0 46 Q0 8 38 8 M0 30 Q0 16 16 16';
  return `<svg viewBox="0 0 840 594" xmlns="http://www.w3.org/2000/svg" font-family="Georgia,'Times New Roman',serif">
  <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${st.g[0]}"/><stop offset=".5" stop-color="${st.g[1]}"/><stop offset="1" stop-color="${st.g[2]}"/>
  </linearGradient></defs>
  <rect width="840" height="594" fill="#f8f3e4"/>
  <rect x="20" y="20" width="800" height="554" fill="none" stroke="#b08d3e" stroke-width="3"/>
  <rect x="30" y="30" width="780" height="534" fill="none" stroke="#b08d3e" stroke-width="1"/>
  ${[[44, 44, 1, 1], [796, 44, -1, 1], [44, 550, 1, -1], [796, 550, -1, -1]].map(([x, y, sx, sy]) =>
    `<path d="${corner}" transform="translate(${x},${y}) scale(${sx},${sy})" fill="none" stroke="#b08d3e" stroke-width="2"/>`).join('')}
  <svg x="385" y="52" width="70" height="82" viewBox="0 0 100 116">
    <path d="M50 4 L88 18 V56 C88 86 70 104 50 112 C30 104 12 86 12 56 V18 Z" fill="url(#${gid})" stroke="${st.stroke}" stroke-width="3.5"/>
    <text x="50" y="68" text-anchor="middle" font-size="30" font-weight="800" fill="${st.text}" font-family="Georgia,serif">${to}</text>
  </svg>
  <text x="420" y="176" text-anchor="middle" font-size="34" letter-spacing="4" fill="#7a5b1e">${t('dip_cert').toUpperCase()}</text>
  <text x="420" y="212" text-anchor="middle" font-size="15" fill="#8a7a55" letter-spacing="2">AI ENGLISH COACH</text>
  <text x="420" y="258" text-anchor="middle" font-size="16" fill="#5c5138" font-style="italic">${t('dip_text')}</text>
  <text x="420" y="316" text-anchor="middle" font-size="46" fill="#2e2818" ${cursive}>${esc(d.name)}</text>
  <line x1="240" y1="332" x2="600" y2="332" stroke="#b08d3e" stroke-width="1"/>
  <text x="420" y="368" text-anchor="middle" font-size="16" fill="#5c5138">${t('dip_passed', { level: d.level })}</text>
  <text x="420" y="392" text-anchor="middle" font-size="16" fill="#5c5138">${t('dip_score', { score: d.score })} · ${date}</text>
  <text x="200" y="486" text-anchor="middle" font-size="26" fill="#31415f" ${cursive}>${esc(d.name)}</text>
  <line x1="110" y1="500" x2="290" y2="500" stroke="#8a7a55" stroke-width="1"/>
  <text x="200" y="520" text-anchor="middle" font-size="12" fill="#8a7a55">${t('dip_student')}</text>
  <text x="640" y="482" text-anchor="middle" font-size="30" fill="#31415f" transform="rotate(-4 640 482)" ${cursive}>Diego Martinez</text>
  <line x1="550" y1="500" x2="730" y2="500" stroke="#8a7a55" stroke-width="1"/>
  <text x="640" y="520" text-anchor="middle" font-size="12" fill="#8a7a55">Diego Martinez · ${t('dip_ceo')}</text>
</svg>`;
}

function viewDiploma(i) {
  const d = store.load().diplomas[i];
  if (!d) return;
  openModal(`<div class="diploma-wrap">${diplomaSVG(d)}</div>
    <button class="btn btn-primary btn-block" style="margin-top:14px" data-act="dip-down" data-i="${i}">⬇️ ${t('dip_download')}</button>`);
}

function downloadDiploma(i) {
  const d = store.load().diplomas[i];
  if (!d) return;
  const blob = new Blob([diplomaSVG(d)], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `diploma-${C.nextLevel(d.level)}.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
routes['/dashboard'] = () => {
  const s = store.load();
  const u = s.user;
  const recent = C.recentEvaluableScores(10);
  const last = recent[0];
  const weak = C.dedupedWeaknesses(4);
  const history = C.studyHistory(14);
  const maxEx = Math.max(1, ...history.map(h => h.exercises));
  const totalMin = Math.round(Object.values(s.study_logs).reduce((a, l) => a + (l.minutes || 0), 0));
  const perf = C.performanceByType().filter(p => p.count);
  const today = C.studyHistory(1)[0];
  const next = C.nextLevel(u.current_level);

  view().innerHTML = `
    <div class="page-head">
      <h1 class="gradient-title">${t('dash_hi', { name: esc(u.name) })} 👋</h1>
      <p class="dim">${goalIcon(u.goal)} ${esc(goalLabel(u.goal))} · ${u.preferred_english === 'british' ? '🇬🇧 British' : '🇺🇸 American'} English</p>
    </div>

    ${u.pending_exam ? `<div class="card exam-banner" style="margin-bottom:16px">
      <div class="icon-row"><span style="font-size:24px">🎓</span><b style="flex:1">${t('exam_ready_title')}</b></div>
      <p class="dim" style="margin:8px 0 12px">${t('exam_ready_body', { level: u.current_level, pass: C.CERT_PASS, next: `${rankName(next)} (${next})` })}</p>
      <button class="btn btn-primary" data-act="exam-start">🎓 ${t('exam_take')}</button>
    </div>` : ''}

    <div class="kpis">
      <div class="kpi"><b>${u.streak_days} 🔥</b><small>${t('dash_streak')}</small></div>
      <div class="kpi"><b>${today.exercises}</b><small>${t('dash_today')}</small></div>
      <div class="kpi"><b>${totalMin}</b><small>${t('dash_minutes')}</small></div>
      <div class="kpi"><b>${last ? Math.round(last.score) : '—'}</b><small>${t('dash_last')}</small></div>
    </div>

    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-title"><h3>${t('dash_level')}</h3><button class="info-dot" data-act="ranks-info">?</button></div>
        <div style="display:flex;align-items:center;gap:18px">
          ${rankSVG(u.current_level, 64)}
          <div style="flex:1">
            <h2>${rankName(u.current_level)} · ${u.current_level}</h2>
            <div class="bar" style="margin:10px 0 6px"><span style="width:${u.level_score}%"></span></div>
            <small class="dim">${next !== u.current_level ? t('dash_towards', { p: u.level_score, next: `${rankName(next)} (${next})` }) : t('dash_max')}</small>
          </div>
        </div>
        ${u.target_level ? `<div class="icon-row" style="margin-top:12px">
          <span class="pill pill-link">🎯 ${u.current_level} → ${u.target_level}</span>
          ${u.target_months ? `<span class="pill sev-1">${t('m_' + u.target_months)}</span>` : ''}
          ${(u.study_days || []).length ? `<span class="pill sev-2">${u.study_days.map(x => t('d_' + x)).join(' · ')}</span>` : ''}
        </div>` : ''}
      </div>
      <div class="card">
        <div class="card-title"><h3>${t('dash_activity')}</h3></div>
        <div class="spark">${history.map(h =>
          `<div style="height:${Math.round((h.exercises / maxEx) * 100)}%" title="${h.date}: ${h.exercises}"></div>`).join('')}</div>
        <small class="muted">${t('dash_acts', { n: history.reduce((a, h) => a + h.exercises, 0), m: Math.round(history.reduce((a, h) => a + h.minutes, 0)) })}</small>
      </div>
    </div>

    <h3 style="margin:24px 0 12px">${t('dash_do')}</h3>
    <div class="tile-grid">
      <a class="tile" href="#/exercises"><span class="tile-ico">📝</span><b>${t('nav_practice')}</b><small>${t('ex_sub')}</small></a>
      <a class="tile" href="#/vocab"><span class="tile-ico">📖</span><b>${t('nav_vocab')}</b><small>${t('vb_sub')}</small></a>
      <a class="tile" href="#/lessons"><span class="tile-ico">📚</span><b>${t('nav_lessons')}</b><small>${t('ls_sub').split(':')[0]}</small></a>
    </div>

    <div class="grid-2" style="margin-top:16px">
      ${perf.length ? `<div class="card">
        <div class="card-title"><h3>${t('dash_bytype')}</h3></div>
        <div class="hbars">${perf.map(p =>
          `<div class="hbar-row"><span>${esc(p.label)}</span><div class="bar"><span style="width:${p.average}%"></span></div><b>${p.average}</b></div>`).join('')}</div>
      </div>` : `<div class="card"><p class="muted">${t('dash_empty_perf')}</p></div>`}
      ${weak.length ? `<div class="card">
        <div class="card-title"><h3>${t('dash_focus')}</h3><button class="info-dot" data-act="sev-info">?</button></div>
        <div class="stack" style="gap:10px">${weak.map(w => `
          <div class="icon-row"><b style="flex:1">${esc(w.topic)}</b>${sevPill(w.severity)}
          <a class="pill pill-link" href="#/lessons?topic=${encodeURIComponent(w.topic)}">📚</a></div>`).join('')}</div>
      </div>` : ''}
    </div>

    <div class="grid-2" style="margin-top:16px">
      ${recent.length ? `<div class="card">
        <div class="card-title"><h3>${t('dash_recent')}</h3></div>
        <div class="stack" style="gap:8px">${recent.slice(0, 6).map(r =>
          `<div class="icon-row"><b style="width:34px">${Math.round(r.score)}</b><small class="dim" style="flex:1">${esc(r.topic || r.type)}</small><small class="muted">${esc(r.type)}</small></div>`).join('')}</div>
      </div>` : ''}
      <div class="card">
        <div class="card-title"><h3>${t('dash_tips')} 🧠</h3></div>
        ${C.nextRecommendations(last ? last.score : 70).map(r => `<p class="dim" style="margin:4px 0">• ${esc(r)}</p>`).join('')}
      </div>
    </div>`;
};

// ---------------------------------------------------------------------------
// Exercises (incl. Speaking)
// ---------------------------------------------------------------------------
const EX_TYPES = [
  { key: 'use_of_english', ico: '🧩', name: 'ex_uoe', desc: 'ex_uoe_d' },
  { key: 'reading', ico: '📖', name: 'ex_read', desc: 'ex_read_d' },
  { key: 'listening', ico: '🎧', name: 'ex_listen', desc: 'ex_listen_d' },
  { key: 'writing', ico: '✍️', name: 'ex_write', desc: 'ex_write_d' },
  { key: 'speaking', ico: '🎙️', name: 'ex_speak', desc: 'ex_speak_d' },
  { key: 'photos', ico: '📷', name: 'ex_photos', desc: 'ex_photos_d' },
];

let current = null; // { session, answers, isVocab }

routes['/exercises'] = () => {
  view().innerHTML = `
    <div class="page-head"><h1 class="gradient-title">${t('ex_title')}</h1><p class="dim">${t('ex_sub')}</p></div>
    <div class="tile-grid">${EX_TYPES.map(x =>
      `<button class="tile" data-act="${x.key === 'speaking' ? 'speak-setup' : 'gen-ex'}" data-type="${x.key}">
        <span class="tile-ico">${x.ico}</span><b>${t(x.name)}</b><small>${t(x.desc)}</small></button>`).join('')}
    </div>
    <label class="f" style="margin-top:18px">${t('ex_topic')}
      <input id="ex-topic" class="input" placeholder="${t('ex_topic_ph')}"/></label>`;
};

async function generatePhotos() {
  const data = await withLoader(t('ph_generating'), () => C.generatePhotoExercise());
  if (!data) return;
  current = { photo: data };
  view().innerHTML = `
    <div class="page-head"><h1>📷 ${t('ph_title')}</h1></div>
    <div class="photo-grid">
      <figure><img src="${data.images[0]}" alt="A"/><figcaption>${t('ph_a')}</figcaption></figure>
      <figure><img src="${data.images[1]}" alt="B"/><figcaption>${t('ph_b')}</figcaption></figure>
    </div>
    <div class="card" style="margin-top:14px"><p class="dim">${esc(data.prompt)}</p></div>
    <textarea id="w-text" class="input" style="margin-top:14px" placeholder="${t('ex_write_ph')}"></textarea>
    <p class="muted" id="w-count">${t('ex_words', { n: 0 })}</p>
    <button class="btn btn-primary btn-lg btn-block" data-act="submit-photos">✅ ${t('ex_check')}</button>`;
  $('#w-text').addEventListener('input', e => {
    $('#w-count').textContent = t('ex_words', { n: e.target.value.trim().split(/\s+/).filter(Boolean).length });
  });
}

async function submitPhotos() {
  const text = $('#w-text').value.trim();
  if (text.split(/\s+/).filter(Boolean).length < 20) return toast(t('ex_write_more'), 'bad');
  const grade = await withLoader(t('ex_grading'), () => C.gradeWriting(current.photo.prompt, text, 'photo comparison'));
  if (grade) renderWritingGrade(grade);
}

async function generateExercise(type, topicOverride, isVocab = false) {
  const topic = topicOverride ?? (($('#ex-topic')?.value || '').trim() || null);
  const n = type === 'writing' ? 1 : type === 'listening' ? 5 : 8;
  const session = await withLoader(t('ex_generating'), () =>
    isVocab ? C.generateVocabPractice(topicOverride) : C.generateExercise(type, topic, n));
  if (!session) return;
  current = { session, answers: {}, isVocab };
  renderExercise();
}

function renderExercise() {
  const { session } = current;
  const p = session.payload;

  if (session.exercise_type === 'writing') {
    view().innerHTML = `
      <div class="page-head"><h1>✍️ Writing</h1></div>
      <div class="card"><p>${esc(p.prompt)}</p><small class="muted">${p.min_words || 80}–${p.max_words || 180} words</small></div>
      <textarea id="w-text" class="input" style="margin-top:14px" placeholder="${t('ex_write_ph')}"></textarea>
      <p class="muted" id="w-count">${t('ex_words', { n: 0 })}</p>
      <button class="btn btn-primary btn-lg btn-block" data-act="submit-writing">✅ ${t('ex_check')}</button>`;
    $('#w-text').addEventListener('input', e => {
      $('#w-count').textContent = t('ex_words', { n: e.target.value.trim().split(/\s+/).filter(Boolean).length });
    });
    return;
  }

  const items = p.items || [];
  view().innerHTML = `
    <div class="page-head">
      <h1>${EX_TYPES.find(x => x.key === session.exercise_type)?.ico || '📖'} ${esc(p.topic || '')}</h1>
      <p class="dim">${t('ex_level', { l: esc(session.level) })} · ${t('ex_questions', { n: items.length })}</p>
    </div>
    ${session.exercise_type === 'listening' ? `
      <div class="card">
        <p class="dim">${esc(p.scenario || t('ex_listen_hint'))}</p>
        <button class="btn btn-ghost btn-block" style="margin-top:10px" data-act="play-audio">🔊 ${t('ex_play')}</button>
        <audio id="ex-audio" controls hidden style="width:100%;margin-top:10px"></audio>
        <details style="margin-top:12px"><summary>${t('ex_transcript')}</summary>
          <pre style="white-space:pre-wrap;font-family:inherit">${esc(p.dialogue || '')}</pre></details>
      </div>` : ''}
    ${p.passage ? `<div class="card" style="line-height:1.65">${esc(p.passage).replace(/\n/g, '<br/>')}</div>` : ''}
    <div class="stack" style="margin-top:16px">
      ${items.map(it => `
        <div class="card">
          <p><b>${it.id}.</b> ${esc(it.prompt)}</p>
          ${Array.isArray(it.options) && it.options.length ? `
            <div class="qa" style="margin-top:10px">${it.options.map(o =>
              `<button class="opt" data-act="pick" data-id="${it.id}" data-value="${esc(o)}">${esc(o)}</button>`).join('')}</div>` :
            `<input class="input" style="margin-top:10px" data-answer="${it.id}" placeholder="${t('ex_your_answer')}" autocapitalize="none"/>`}
        </div>`).join('')}
    </div>
    <button class="btn btn-primary btn-lg btn-block" style="margin-top:16px" data-act="submit-ex">✅ ${t('ex_check')}</button>`;
}

async function playListening() {
  const url = await withLoader(t('loading'), () =>
    G.synthesizeDialogue(current.session.payload.dialogue, store.load().user.preferred_english));
  if (!url) return;
  const audio = $('#ex-audio');
  audio.src = url; audio.hidden = false; audio.play();
}

async function submitExercise() {
  const { session } = current;
  const answers = (session.payload.items || []).map(it => ({
    id: it.id,
    answer: current.answers[it.id] ?? (document.querySelector(`[data-answer="${it.id}"]`)?.value || ''),
  }));
  if (answers.every(a => !String(a.answer).trim())) return toast(t('ex_answer_one'), 'bad');
  const grade = await withLoader(t('ex_grading'), () => C.gradeExercise(session.id, answers));
  if (!grade) return;
  if (current.isVocab) {
    for (const r of grade.per_item || []) C.markVocabResult(r.expected, !!r.correct);
  }
  renderGrade(grade, session);
}

async function submitWriting() {
  const text = $('#w-text').value.trim();
  if (text.split(/\s+/).filter(Boolean).length < 20) return toast(t('ex_write_more'), 'bad');
  const p = current.session.payload;
  const grade = await withLoader(t('ex_grading'), () => C.gradeWriting(p.prompt, text, p.topic));
  if (grade) renderWritingGrade(grade);
}

function levelChangeCard(lc) {
  if (!lc) return '';
  if (lc.exam_ready) {
    const u = store.load().user;
    const next = C.nextLevel(u.current_level);
    return `<div class="card exam-banner"><div class="icon-row"><span style="font-size:24px">🎓</span><b style="flex:1">${t('exam_ready_title')}</b></div>
      <p class="dim" style="margin:8px 0 12px">${t('exam_ready_body', { level: u.current_level, pass: C.CERT_PASS, next: `${rankName(next)} (${next})` })}</p>
      <button class="btn btn-primary btn-block" data-act="exam-start">🎓 ${t('exam_take')}</button></div>`;
  }
  const msg = lc.leveled_up ? `🎉 ${t('level_up', { r: `${rankName(lc.new_level)} (${lc.new_level})` })}`
    : lc.leveled_down ? `📉 ${t('level_down', { r: `${rankName(lc.new_level)} (${lc.new_level})` })}`
    : `${rankName(lc.new_level)} ${lc.new_level} · ${lc.new_score}/100 (${lc.delta >= 0 ? '+' : ''}${lc.delta})`;
  if (lc.leveled_up) confetti();
  return `<div class="card"><div class="icon-row">${rankSVG(lc.new_level, 40)}<b style="flex:1">${msg}</b></div>
    <div class="bar" style="margin-top:10px"><span style="width:${lc.new_score}%"></span></div></div>`;
}

const mistakesCard = mistakes => (mistakes || []).length ? `
  <div class="card"><div class="card-title"><h3>${t('ex_review')}</h3><button class="info-dot" data-act="sev-info">?</button></div>
  ${mistakes.map(m => `<p style="margin:8px 0"><b>${esc(m.topic)}</b> ${sevPill(m.severity)}
    <a class="pill pill-link" href="#/lessons?topic=${encodeURIComponent(m.topic)}">📚</a><br/>
    <span class="dim">${esc(m.explanation)}</span></p>`).join('')}</div>` : '';

function renderGrade(grade, session) {
  const per = grade.per_item || [];
  view().innerHTML = `
    <div class="page-head center"><h1 style="font-size:3rem">${Math.round(grade.score || 0)}<small class="muted" style="font-size:1.2rem">/100</small></h1>
      <p class="dim">${t('ex_correct_of', { a: grade.correct_answers ?? 0, b: grade.total_questions ?? per.length })}</p></div>
    ${levelChangeCard(grade.level_change)}
    ${grade.feedback ? `<div class="card" style="margin-top:14px"><p>${esc(grade.feedback)}</p></div>` : ''}
    ${grade.coach_note ? `<div class="card" style="margin-top:14px"><b>🧠 Coach:</b> ${esc(grade.coach_note)}</div>` : ''}
    <div class="stack" style="margin-top:14px">
      ${per.map(r => `<div class="card">
        <p>${r.correct ? '✅' : '❌'} <b>${esc(r.user_answer || '—')}</b></p>
        ${!r.correct ? `<p class="dim">${t('ex_expected')}: <b>${esc(r.expected)}</b></p>` : ''}
        ${r.explanation ? `<p class="muted">${esc(r.explanation)}</p>` : ''}
      </div>`).join('')}
    </div>
    <div style="margin-top:14px">${mistakesCard(grade.mistakes)}</div>
    <button class="btn btn-primary btn-lg btn-block" style="margin-top:16px" data-act="gen-ex" data-type="${session.exercise_type}">🔄 ${t('ex_again')}</button>
    <a class="btn btn-ghost btn-block" style="margin-top:10px" href="#/dashboard">🏠 ${t('ex_home')}</a>`;
}

function renderWritingGrade(grade) {
  const crit = grade.criteria || {};
  view().innerHTML = `
    <div class="page-head center"><h1 style="font-size:3rem">${Math.round(grade.score || 0)}<small class="muted" style="font-size:1.2rem">/100</small></h1></div>
    ${levelChangeCard(grade.level_change)}
    ${grade.feedback ? `<div class="card" style="margin-top:14px"><p>${esc(grade.feedback)}</p></div>` : ''}
    <div class="card" style="margin-top:14px"><h3>${t('ex_criteria')}</h3><div class="hbars" style="margin-top:12px">
      ${Object.entries(crit).map(([k, v]) => `<div class="hbar-row"><span style="text-transform:capitalize">${esc(k)}</span>
        <div class="bar"><span style="width:${Math.max(0, Math.min(100, v))}%"></span></div><b>${v}</b></div>`).join('')}
    </div></div>
    ${grade.corrected_text ? `<div class="card" style="margin-top:14px"><h3>${t('ex_corrected')}</h3><p style="line-height:1.65;margin-top:8px">${esc(grade.corrected_text)}</p></div>` : ''}
    ${grade.improved_version ? `<div class="card" style="margin-top:14px"><h3>${t('ex_improved')} ✨</h3><p style="line-height:1.65;margin-top:8px">${esc(grade.improved_version)}</p></div>` : ''}
    <div style="margin-top:14px">${mistakesCard(grade.mistakes)}</div>
    <a class="btn btn-ghost btn-block" style="margin-top:16px" href="#/exercises">📝 ${t('ex_again')}</a>`;
}

// ---------------------------------------------------------------------------
// Speaking (voice + text conversation)
// ---------------------------------------------------------------------------
let speakMode = 'voice';
let chat = null;
let live = null;

function renderSpeakSetup() {
  const roles = C.listRoles(store.load().user.goal);
  view().innerHTML = `
    <div class="page-head"><h1 class="gradient-title">🎙️ ${t('ex_speak')}</h1><p class="dim">${t('ex_pick_role')}</p></div>
    <div class="seg" style="margin-bottom:16px">
      <button class="${speakMode === 'voice' ? 'on' : ''}" data-act="speak-mode" data-v="voice">🎙️ ${t('ex_voice')}</button>
      <button class="${speakMode === 'text' ? 'on' : ''}" data-act="speak-mode" data-v="text">⌨️ ${t('ex_text')}</button>
    </div>
    <div class="stack">${roles.map(r =>
      `<button class="opt" data-act="${speakMode === 'voice' ? 'start-live' : 'start-chat'}" data-role="${esc(r.role)}" data-scenario="${esc(r.scenario)}">
        <b>${esc(r.role)}</b><br/><small class="muted">${esc(r.scenario)}</small></button>`).join('')}
    </div>`;
}

function startChat(role, scenario) {
  chat = C.startConversation(role, scenario);
  renderChat();
  coachOpens();
}

/* The coach speaks first, like a real person would. */
async function coachOpens() {
  showTyping();
  try { await C.conversationGreeting(chat.id); } catch (err) { console.warn(err); }
  renderChat();
}

function showTyping() {
  $('#typing')?.remove();
  $('#stream')?.insertAdjacentHTML('beforeend',
    '<div class="bubble bubble-ai typing" id="typing"><i></i><i></i><i></i></div>');
  window.scrollTo(0, document.body.scrollHeight);
}

function renderChat() {
  const session = store.load().conversations.find(c => c.id === chat.id);
  view().innerHTML = `
    <div class="page-head"><h1>${esc(session.role)}</h1><p class="dim">${esc(session.scenario)}</p></div>
    <div class="chat-stream" id="stream">
      ${session.messages.map(m => `<div class="bubble ${m.role === 'user' ? 'bubble-me' : 'bubble-ai'}">${esc(m.content)}</div>`).join('')
        || `<div class="bubble bubble-ai">${t('sp_say_hi')} 👋</div>`}
    </div>
    <div class="row">
      <input id="chat-input" class="input" placeholder="${t('sp_type')}" style="flex:3"/>
      <button class="btn btn-primary" data-act="send-chat" style="flex:0 0 64px">➤</button>
    </div>
    <button class="btn btn-ghost btn-block" style="margin-top:12px" data-act="end-chat">🏁 ${t('sp_end')}</button>
    <p class="muted" style="margin-top:10px;font-size:12.5px;text-align:center">${t('chat_over')}</p>`;
  $('#chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  $('#chat-input').focus();
}

async function sendChat() {
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  // No blur overlay here: paint the message + typing dots, like a real chat.
  $('#stream').insertAdjacentHTML('beforeend', `<div class="bubble bubble-me">${esc(text)}</div>`);
  showTyping();
  try {
    await C.conversationTurn(chat.id, text);
  } catch (err) {
    toast(err instanceof QuotaExhausted ? err.message : (err.message || t('error_generic')), 'bad');
    input.value = text;   // give the message back so nothing is lost
  }
  renderChat();
  window.scrollTo(0, document.body.scrollHeight);
}

async function endChat() {
  const evaluation = await withLoader(t('sp_eval'), () => C.endConversation(chat.id));
  if (!evaluation) return go('/exercises');
  renderEvaluation(evaluation);
}

async function startLive(role, scenario) {
  view().innerHTML = `
    <div class="page-head center"><h1>🎙️ ${esc(role)}</h1><p class="dim">${esc(scenario)}</p></div>
    <div class="card center">
      <div class="orb" id="orb"></div>
      <b id="live-status">${t('sp_connecting')}</b>
    </div>
    <div class="card" style="margin-top:14px"><h3>${t('sp_you')}</h3><p id="tx-in" class="dim" style="white-space:pre-wrap">…</p></div>
    <div class="card" style="margin-top:14px"><h3>${t('sp_coach')}</h3><p id="tx-out" style="white-space:pre-wrap">…</p></div>
    <button class="btn btn-primary btn-lg btn-block" style="margin-top:16px" data-act="end-live">🏁 ${t('sp_end')}</button>`;

  const put = (sel, txt) => { const el = $(sel); if (el) el.textContent = (el.textContent === '…' ? '' : el.textContent) + txt; };
  live = new LiveSession({
    status: sVal => { const el = $('#live-status'); if (el) el.textContent = sVal; },
    inputText: x => put('#tx-in', x),
    outputText: x => put('#tx-out', x),
    speaking: on => $('#orb')?.classList.toggle('talk', on),
  });
  live.role = role; live.scenario = scenario;
  try {
    await live.start(C.userForPrompt(), role, scenario);
    $('#live-status').textContent = t('sp_listening');
  } catch (err) {
    live = null;
    toast(err instanceof QuotaExhausted ? err.message : t('sp_mic_err') + (err.message || ''), 'bad');
    renderSpeakSetup();
  }
}

async function endLive() {
  if (!live) return renderSpeakSetup();
  const { role, scenario } = live;
  const messages = live.stop();
  live = null;
  if (!messages.length) { toast(t('sp_no_time'), 'bad'); return renderSpeakSetup(); }
  const session = C.saveLiveConversation(role, scenario, messages);
  chat = session;
  const evaluation = await withLoader(t('sp_eval'), () => C.endConversation(session.id));
  if (evaluation) renderEvaluation(evaluation);
  else renderSpeakSetup();
}

function renderEvaluation(evaluation) {
  const bars = ['fluency', 'grammar', 'vocabulary', 'naturalness', 'comprehension'];
  view().innerHTML = `
    <div class="page-head center"><h1 style="font-size:3rem">${Math.round(evaluation.score)}<small class="muted" style="font-size:1.2rem">/100</small></h1>
      <p class="dim">${t('sp_estimated')}: <b>${esc(evaluation.estimated_level || '—')}</b></p></div>
    ${levelChangeCard(evaluation.level_change)}
    <div class="card" style="margin-top:14px"><div class="hbars">
      ${bars.map(k => `<div class="hbar-row"><span style="text-transform:capitalize">${k}</span>
        <div class="bar"><span style="width:${evaluation[k]}%"></span></div><b>${Math.round(evaluation[k])}</b></div>`).join('')}
    </div></div>
    ${evaluation.feedback ? `<div class="card" style="margin-top:14px"><p>${esc(evaluation.feedback)}</p></div>` : ''}
    ${(evaluation.better_phrases || []).length ? `<div class="card" style="margin-top:14px"><h3>${t('sp_better')}</h3>
      ${evaluation.better_phrases.map(b => `<p style="margin:8px 0">❌ <s class="muted">${esc(b.said)}</s><br/>✅ <b>${esc(b.better)}</b></p>`).join('')}</div>` : ''}
    ${(evaluation.tips || []).length ? `<div class="card" style="margin-top:14px"><h3>${t('sp_tips')}</h3>${evaluation.tips.map(x => `<p style="margin:6px 0">💡 ${esc(x)}</p>`).join('')}</div>` : ''}
    <div style="margin-top:14px">${mistakesCard(evaluation.mistakes)}</div>
    <button class="btn btn-ghost btn-block" style="margin-top:16px" data-act="speak-setup">🎙️ ${t('ex_again')}</button>`;
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------
routes['/vocab'] = () => {
  const words = C.vocabList();
  const pending = words.filter(w => w.status !== 'mastered');
  view().innerHTML = `
    <div class="page-head"><h1 class="gradient-title">📖 ${t('vb_title')}</h1><p class="dim">${t('vb_sub')}</p></div>
    ${pending.length ? `<button class="btn btn-primary btn-lg btn-block" data-act="vocab-practice">✨ ${t('vb_practice', { n: Math.min(8, pending.length) })}</button>` : ''}
    <div class="card" style="margin-top:16px">
      ${words.length ? words.map(w => `
        <div class="vocab-row">
          <div style="flex:1">
            <span class="vocab-word">${esc(w.word)}</span>
            ${w.meaning ? `<span class="dim"> — ${esc(w.meaning)}</span>` : ''}
            ${w.example ? `<div class="vocab-ex">“${esc(w.example)}”</div>` : ''}
          </div>
          <div style="text-align:right">
            <span class="pill ${w.status === 'mastered' ? 'sev-2' : 'sev-3'}">${w.status === 'mastered' ? '✓ ' + t('vb_mastered') : t('vb_learning')}</span>
            <div><small class="muted">${t('vb_missed', { n: w.times_failed })}</small></div>
          </div>
        </div>`).join('') : `<p class="muted">${t('vb_empty')}</p>`}
    </div>`;
};

async function vocabPractice() {
  const pending = C.vocabList().filter(w => w.status !== 'mastered').slice(0, 8);
  if (!pending.length) return;
  await generateExercise('use_of_english', pending, true);
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------
routes['/lessons'] = params => {
  const preset = params.get('topic') || '';
  const suggested = C.suggestedTopics(6);
  const saved = C.listLessons(20);
  view().innerHTML = `
    <div class="page-head"><h1 class="gradient-title">📚 ${t('ls_title')}</h1><p class="dim">${t('ls_sub')}</p></div>
    <div class="card">
      <label class="f">${t('ls_topic')}<input id="lesson-topic" class="input" value="${esc(preset)}" placeholder="${t('ls_topic_ph')}"/></label>
      <button class="btn btn-primary btn-block" style="margin-top:12px" data-act="gen-lesson">✨ ${t('ls_gen')}</button>
    </div>
    ${suggested.length ? `<div class="card" style="margin-top:14px">
      <div class="card-title"><h3>${t('ls_suggested')}</h3><button class="info-dot" data-act="sev-info">?</button></div>
      <div class="chips">${suggested.map(x =>
        `<button class="chip" data-act="pick-topic" data-topic="${esc(x.topic)}">${esc(x.topic)} · ${t('sev_' + Math.min(5, x.severity || 1))}</button>`).join('')}</div>
    </div>` : ''}
    ${saved.length ? `<div class="card" style="margin-top:14px"><h3>${t('ls_yours')}</h3>
      <div class="stack" style="margin-top:10px">${saved.map(l =>
        `<button class="opt" data-act="open-lesson" data-id="${l.id}">📚 <b>${esc(l.title)}</b><br/><small class="muted">${esc(l.topic)}</small></button>`).join('')}</div>
    </div>` : ''}`;
};

async function generateLesson() {
  const topic = $('#lesson-topic').value.trim();
  if (!topic) return toast(t('ls_topic_req'), 'bad');
  const lesson = await withLoader(t('ls_writing'), () => C.generateLesson(topic));
  if (lesson) renderLesson(lesson);
}

function renderLesson(lesson) {
  const c = lesson.content || {};
  view().innerHTML = `
    <div class="page-head"><h1>${esc(c.title || lesson.title)}</h1>
      <p class="dim">${esc(lesson.topic)} · ${t('ex_level', { l: esc(lesson.level) })}</p></div>
    ${c.intro ? `<div class="card"><h3>💡 ${t('ls_explain')}</h3><p style="margin-top:8px;line-height:1.6">${esc(c.intro)}</p></div>` : ''}
    ${(c.sections || []).map(sec => `<div class="card" style="margin-top:14px">
      <h3>${esc(sec.heading)}</h3><p style="line-height:1.65;margin-top:8px">${esc(sec.content)}</p>
      ${(sec.examples || []).length ? `<hr class="divider"/><small class="muted">${t('ls_examples')}</small>` : ''}
      ${(sec.examples || []).map(e => `<p style="margin:8px 0"><b>${esc(e.en)}</b><br/><span class="dim">${esc(e.es)}</span></p>`).join('')}
    </div>`).join('')}
    ${(c.common_mistakes || []).length ? `<div class="card" style="margin-top:14px"><h3>⚖️ ${t('ls_rules')}</h3>
      ${c.common_mistakes.map(m => `<p style="margin:10px 0">❌ <s class="muted">${esc(m.wrong)}</s><br/>✅ <b>${esc(m.right)}</b><br/><span class="dim">${esc(m.why)}</span></p>`).join('')}</div>` : ''}
    ${c.mini_exercise ? `<div class="card" style="margin-top:14px"><h3>📝 ${t('ls_practice')}</h3>
      <p class="dim" style="margin-top:6px">${esc(c.mini_exercise.prompt || '')}</p>
      <div class="stack" style="margin-top:12px">
        ${(c.mini_exercise.items || []).map((it, i) => `<div><p>${esc(it.prompt)}</p>
          <input class="input" style="margin-top:6px" data-mini="${i}" autocapitalize="none" placeholder="${t('ex_your_answer')}"/></div>`).join('')}
      </div>
      <button class="btn btn-primary btn-block" style="margin-top:14px" data-act="check-mini" data-id="${lesson.id}">✅ ${t('ls_check')}</button>
      <div id="mini-result"></div>
    </div>` : ''}
    ${(c.tips || []).length ? `<div class="card" style="margin-top:14px"><h3>💡 ${t('ls_tips')}</h3>${c.tips.map(x => `<p style="margin:6px 0">• ${esc(x)}</p>`).join('')}</div>` : ''}
    <a class="btn btn-ghost btn-block" style="margin-top:16px" href="#/lessons">📚 ${t('ls_other')}</a>`;
}

const normalise = s => String(s || '').trim().toLowerCase().replace(/[.,!?;:"']/g, '');

function checkMini(lessonId) {
  const lesson = store.load().lessons.find(l => l.id === lessonId);
  const items = lesson?.content?.mini_exercise?.items || [];
  let correct = 0;
  const rows = items.map((it, i) => {
    const given = document.querySelector(`[data-mini="${i}"]`)?.value || '';
    const ok = normalise(given) === normalise(it.answer);
    if (ok) correct++;
    return `<p>${ok ? '✅' : '❌'} ${esc(given || '—')}${ok ? '' : ` → <b>${esc(it.answer)}</b>`}</p>`;
  });
  const res = C.markLessonImprovement(lesson.topic, correct, items.length);
  $('#mini-result').innerHTML = `<div class="card" style="margin-top:14px">
    <b>${correct}/${items.length} · ${res.score_percent}%</b>${rows.join('')}
    ${res.mastered ? `<p>🏆 ${t('ls_mastered')}</p>` : res.updated.length ? `<p>📈 ${t('ls_improved')}</p>` : ''}</div>`;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
routes['/profile'] = () => {
  const s = store.load();
  const u = s.user;
  view().innerHTML = `
    <div class="page-head"><h1 class="gradient-title">👤 ${t('pf_title')}</h1></div>

    <div class="card">
      <div class="photo-pick">
        <div class="ph ${u.photo ? 'has' : ''}">${u.photo ? `<img src="${u.photo}"/>` : '📷'}</div>
        <button class="btn btn-ghost" data-act="pf-photo">${u.photo ? t('ob_photo_change') : t('ob_photo')}</button>
        <input id="pf-file" type="file" accept="image/*" hidden/>
      </div>
      <div class="row" style="margin-top:16px">
        <label class="f">${t('pf_name')}<input id="p-name" class="input" value="${esc(u.name)}"/></label>
        <label class="f">${t('pf_lastname')}<input id="p-last" class="input" value="${esc(u.last_name || '')}"/></label>
      </div>
      <label class="f" style="margin-top:12px">${t('pf_goal')}</label>
      <div class="chips" style="margin-top:8px">${Object.keys(GOAL_LABELS).map(g =>
        `<button class="chip ${u.goal === g ? 'on' : ''}" data-act="pf-goal" data-v="${esc(g)}">${goalIcon(g)} ${esc(goalLabel(g))}</button>`).join('')}</div>
      <label class="f" style="margin-top:14px">${t('pf_variant')}</label>
      <div class="seg" style="margin-top:8px">
        <button class="${u.preferred_english === 'british' ? 'on' : ''}" data-act="pf-variant" data-v="british">🇬🇧 British</button>
        <button class="${u.preferred_english === 'american' ? 'on' : ''}" data-act="pf-variant" data-v="american">🇺🇸 American</button>
      </div>
      <label class="f" style="margin-top:14px">${t('pf_hours')}</label>
      <div class="chips" style="margin-top:8px">${HOURS.map(([v, l]) =>
        `<button class="chip ${u.daily_hours_goal === v ? 'on' : ''}" data-act="pf-hours" data-v="${v}">${l}</button>`).join('')}</div>
      <button class="btn btn-primary btn-block" style="margin-top:16px" data-act="save-profile">💾 ${t('pf_save')}</button>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card-title"><h3>${t('pf_level')}</h3><button class="info-dot" data-act="ranks-info">?</button></div>
      <div class="icon-row">${rankSVG(u.current_level, 46)}<div><b>${rankName(u.current_level)} · ${u.current_level}</b>
        <div class="bar" style="width:160px;margin-top:6px"><span style="width:${u.level_score}%"></span></div></div></div>
      <div class="chips" style="margin-top:12px">${C.LEVELS.map(l =>
        `<button class="chip ${u.current_level === l ? 'on' : ''}" data-act="pf-level" data-v="${l}">${l}</button>`).join('')}</div>
      <a class="btn btn-ghost btn-block" style="margin-top:12px" href="#/placement">🧭 ${t('pf_retest')}</a>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>${t('pf_lang')}</h3>
      <div class="lang-toggle" style="margin-top:10px">${langToggle()}</div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>🔔 ${t('pf_reminder')}</h3><p class="muted" style="margin:6px 0 12px">${t('pf_reminder_sub')}</p>
      <div class="chips scroll">${Array.from({ length: 16 }, (_, i) => i + 7).map(h =>
        `<button class="chip ${s.settings.reminder_hour === h ? 'on' : ''}" data-act="rem-hour" data-v="${h}">${String(h).padStart(2, '0')}:00</button>`).join('')}</div>
      <button class="btn ${s.settings.reminders_on ? 'btn-ghost' : 'btn-primary'} btn-block" style="margin-top:12px" data-act="reminder-toggle">
        ${s.settings.reminders_on ? '🔕 ' + t('pf_rem_off') : '🔔 ' + t('pf_rem_on')}</button>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>🎓 ${t('dip_title')}</h3>
      ${s.diplomas.length ? s.diplomas.map((d, i) => `<div class="dip-row">
        ${rankSVG(C.nextLevel(d.level), 32)}
        <div style="flex:1"><b>${d.level} → ${C.nextLevel(d.level)}</b><br/>
          <small class="muted">${new Date(d.date).toLocaleDateString()} · ${d.score}/100</small></div>
        <button class="btn btn-ghost btn-sm" data-act="dip-view" data-i="${i}">👁️</button>
        <button class="btn btn-ghost btn-sm" data-act="dip-down" data-i="${i}">⬇️</button>
      </div>`).join('') : `<p class="muted" style="margin-top:6px">${t('dip_none')}</p>`}
    </div>

    <div class="card" style="margin-top:14px">
      <h3>💾 ${t('pf_data')}</h3><p class="muted" style="margin:6px 0 12px">${t('pf_data_sub')}</p>
      <div class="row">
        <button class="btn btn-ghost" data-act="export">⬇️ ${t('pf_export')}</button>
        <button class="btn btn-ghost" data-act="import">⬆️ ${t('pf_import')}</button>
      </div>
      <input id="import-file" type="file" accept="application/json" hidden/>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>🔑 ${t('pf_key')}</h3>
      <p class="muted" style="margin:6px 0 12px">${t('pf_model')}: <b>${esc(G.ladder.currentModel('text') || t('pf_no_quota'))}</b></p>
      <a class="btn btn-ghost btn-block" href="#/setup">${t('pf_key_change')}</a>
    </div>

    <button class="btn btn-danger btn-block" style="margin:16px 0 8px" data-act="reset">🗑️ ${t('pf_reset')}</button>`;
};

function saveProfile() {
  const s = store.load();
  s.user.name = $('#p-name').value.trim() || s.user.name;
  s.user.last_name = $('#p-last').value.trim();
  store.save();
  toast(t('pf_saved'), 'good');
  route();
}

function exportBackup() {
  const blob = new Blob([store.exportJson()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ai-english-coach-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importBackup() {
  const input = $('#import-file');
  input.onchange = async () => {
    try {
      store.importJson(await input.files[0].text());
      toast(t('pf_restored'), 'good');
      go('/dashboard');
      route();
    } catch {
      toast(t('pf_bad_backup'), 'bad');
    }
  };
  input.click();
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
const setUser = (k, v) => { store.load().user[k] = v; store.save(); route(); };

const ACTIONS = {
  'lang': el => { setLang(el.dataset.lang); route(); },
  'modal-close': closeModal,
  'sev-info': sevLegend,
  'ranks-info': ranksLegend,
  'welcome-go': () => go(G.hasKey() ? '/onboarding' : '/setup'),
  'save-key': saveKey,
  // onboarding
  'ob-back': () => { ob.step = Math.max(0, ob.step - 1); renderOb(); },
  'ob-next': obAdvance,
  'ob-photo': pickPhoto,
  'ob-goal': el => { ob.goal = el.dataset.v; obAdvance(); },
  'ob-variant': el => { ob.variant = el.dataset.v; obAdvance(); },
  'ob-level': el => { ob.level = el.dataset.v; obAdvance(); },
  'ob-test': () => { ob.level = 'TEST'; obAdvance(); },
  'ob-hours': el => { ob.hours = parseFloat(el.dataset.v); obAdvance(); },
  'ob-finish': obFinish,
  // placement
  'pl-start': plStart,
  'pl-pick': el => {
    document.querySelectorAll(`[data-act="pl-pick"][data-g="${el.dataset.g}"][data-id="${el.dataset.id}"]`)
      .forEach(b => b.classList.toggle('sel', b === el));
    (el.dataset.g === 'g' ? pl.answers : pl.readingAnswers)[el.dataset.id] = el.dataset.v;
  },
  'pl-submit': plSubmit,
  'pl-apply': el => { C.applyPlacement(el.dataset.v); go('/dashboard'); },
  // exam + diplomas
  'exam-start': examIntro,
  'exam-gen': examGen,
  'dip-view': el => viewDiploma(+el.dataset.i),
  'dip-down': el => downloadDiploma(+el.dataset.i),
  // onboarding goal step
  'ob-tlevel': el => { ob.target_level = el.dataset.v; renderOb(); },
  'ob-tmonths': el => { ob.target_months = parseInt(el.dataset.v, 10); renderOb(); },
  'ob-tday': el => {
    const d = el.dataset.v;
    ob.study_days = ob.study_days.includes(d) ? ob.study_days.filter(x => x !== d) : [...ob.study_days, d];
    renderOb();
  },
  // exercises
  'gen-ex': el => (el.dataset.type === 'photos' ? generatePhotos() : generateExercise(el.dataset.type)),
  'submit-photos': submitPhotos,
  'play-audio': playListening,
  'pick': el => {
    document.querySelectorAll(`[data-act="pick"][data-id="${el.dataset.id}"]`)
      .forEach(b => b.classList.toggle('sel', b === el));
    current.answers[el.dataset.id] = el.dataset.value;
  },
  'submit-ex': submitExercise,
  'submit-writing': submitWriting,
  // speaking
  'speak-setup': renderSpeakSetup,
  'speak-mode': el => { speakMode = el.dataset.v; renderSpeakSetup(); },
  'start-chat': el => startChat(el.dataset.role, el.dataset.scenario),
  'send-chat': sendChat,
  'end-chat': endChat,
  'start-live': el => startLive(el.dataset.role, el.dataset.scenario),
  'end-live': endLive,
  // vocab
  'vocab-practice': vocabPractice,
  // lessons
  'gen-lesson': generateLesson,
  'pick-topic': el => { $('#lesson-topic').value = el.dataset.topic; window.scrollTo(0, 0); },
  'open-lesson': el => renderLesson(store.load().lessons.find(l => l.id === +el.dataset.id)),
  'check-mini': el => checkMini(+el.dataset.id),
  // profile
  'pf-photo': pickPhoto,
  'pf-goal': el => setUser('goal', el.dataset.v),
  'pf-variant': el => setUser('preferred_english', el.dataset.v),
  'pf-hours': el => setUser('daily_hours_goal', parseFloat(el.dataset.v)),
  'pf-level': el => setUser('current_level', el.dataset.v),
  'rem-hour': el => { setReminderHour(el.dataset.v); route(); },
  'reminder-toggle': async () => {
    const res = await toggleReminders();
    toast(res.message, res.ok ? 'good' : 'bad');
    route();
  },
  'save-profile': saveProfile,
  'export': exportBackup,
  'import': importBackup,
  'reset': () => {
    if (!confirm(t('pf_reset_confirm'))) return;
    store.reset();
    go('/welcome');
  },
};

document.addEventListener('click', e => {
  if (e.target.id === 'modal') return closeModal();
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el); }
});
window.addEventListener('hashchange', route);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW', err));
}
if (store.load().user) C.touchLogin();
initReminders();
route();
