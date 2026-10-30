/* Shared UI plumbing: route/action registries, toast, loader, modal, confetti,
 * rank shields. Views import from here (never from each other). */
import * as store from './store.js';
import * as C from './coach.js';
import { QuotaExhausted } from './ladder.js';
import { t } from './i18n.js';
import { divisionOf } from './gamify.js';

export const $ = sel => document.querySelector(sel);
export const $$ = sel => [...document.querySelectorAll(sel)];
export const view = () => $('#view');

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Tiny markdown for coach messages: **bold**, *italic*, `code`, "- " lists, line breaks. Escapes first. */
export function md(text) {
  const lines = esc(text).split(/\r?\n/);
  let html = '', inList = false;
  for (const raw of lines) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\W)\*(?!\s)(.+?)\*(?=\W|$)/g, '$1<i>$2</i>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    const li = line.match(/^\s*(?:[-•]|\d+[.)])\s+(.*)$/);
    if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${li[1]}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    html += line.trim() ? `<p>${line}</p>` : '';
  }
  return html + (inList ? '</ul>' : '');
}

// ---------------------------------------------------------------------------
// Routing + actions (views register themselves)
// ---------------------------------------------------------------------------
export const routes = {};
export const actions = {};
let rerender = () => {};
export const setRerender = fn => { rerender = fn; };
export const refresh = () => rerender();
export const go = path => {
  if (window.location.hash === `#${path}`) rerender();
  else window.location.hash = `#${path}`;
};

// ---------------------------------------------------------------------------
// Feedback chrome
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

export const errorText = err => (err instanceof QuotaExhausted ? err.message : (err?.message || t('error_generic')));

export async function withLoader(text, fn) {
  $('#loader-text').textContent = text;
  $('#loader').hidden = false;
  try {
    return await fn();
  } catch (err) {
    toast(errorText(err), 'bad');
    console.error(err);
    return null;
  } finally {
    $('#loader').hidden = true;
  }
}

export function openModal(html, { closable = true } = {}) {
  $('#modal-card').innerHTML = html + (closable
    ? `<button class="btn btn-ghost btn-block" style="margin-top:16px" data-act="modal-close">${t('close')}</button>` : '');
  $('#modal').hidden = false;
}
export const closeModal = () => { $('#modal').hidden = true; };
actions['modal-close'] = closeModal;

export function confetti(n = 40) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#7c5cff', '#22d3ee', '#f0abfc', '#ffc83d', '#3ee08f', '#ff8a3d'];
  box.innerHTML = Array.from({ length: n }, (_, i) =>
    `<i style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * 0.9}s;animation-duration:${2.2 + Math.random() * 1.4}s"></i>`).join('');
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4400);
}

/* Animated number: counts from 0 (or `from`) to `to` inside el. */
export function countUp(el, to, { from = 0, ms = 900, suffix = '' } = {}) {
  if (!el) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = `${to}${suffix}`; return; }
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = `${Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)))}${suffix}`;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------------------
// Rank shields (SVG, no assets)
// ---------------------------------------------------------------------------
export const RANK_STYLE = {
  bronze:   { g: ['#7c4a1d', '#d99a55', '#8a5626'], stroke: '#3c2410', text: '#fff7ed' },
  silver:   { g: ['#8d97a7', '#eef2f7', '#aab4c2'], stroke: '#4b5563', text: '#1f2937' },
  gold:     { g: ['#a86f0e', '#ffe08a', '#e0ac25'], stroke: '#5c3d05', text: '#452c00' },
  platinum: { g: ['#2e8f96', '#c5fbf6', '#62d2d9'], stroke: '#155e63', text: '#083c40' },
  obsidian: { g: ['#181228', '#6d5bd8', '#241b3e'], stroke: '#0c0817', text: '#e9e3ff' },
  diamond:  { g: ['#2b7fb8', '#e3f6ff', '#72ccf9'], stroke: '#155a88', text: '#0b3954' },
};
let svgN = 0;
export const nextSvgId = () => ++svgN;

export function rankSVG(level, size = 56) {
  const st = RANK_STYLE[C.rankOf(level)];
  const id = `rg${++svgN}`;
  return `<svg class="shield" viewBox="0 0 100 116" width="${size}" height="${Math.round(size * 1.16)}" role="img" aria-label="${level}">
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

export const rankName = level => t('rank_' + C.rankOf(level));
export const rankLine = u => `${rankName(u.current_level)} ${divisionOf(u.level_score)}`;

export const sevPill = s => {
  const n = Math.max(1, Math.min(5, parseInt(s, 10) || 1));
  return `<span class="pill sev-${n}">${t('sev_' + n)}</span>`;
};

export function ranksLegend() {
  openModal(`<h3>${t('pf_ranks')}</h3><p class="dim" style="margin:8px 0 0">${t('ranks_body')}</p>
    <div class="rank-grid" style="margin-top:14px">${C.LEVELS.map(l =>
      `<div class="rank-card">${rankSVG(l, 42)}<b>${rankName(l)}</b><span>${l}</span></div>`).join('')}</div>`);
}
actions['ranks-info'] = ranksLegend;

export function sevLegend() {
  openModal(`<h3>${t('sev_title')}</h3><p class="dim" style="margin:10px 0 14px">${t('sev_body')}</p>
    <div class="stack" style="gap:9px">${[1, 2, 3, 4, 5].map(n =>
      `<div class="icon-row"><span class="pill sev-${n}">${t('sev_' + n)}</span><small>${n}/5</small></div>`).join('')}</div>`);
}
actions['sev-info'] = sevLegend;

/* Circular progress ring (SVG). pct 0..1 */
export function ring(pct, size = 44, stroke = 5, cls = '') {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<svg class="ring ${cls}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.max(0, Math.min(1, pct)))}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

export const userNow = () => store.load().user;
