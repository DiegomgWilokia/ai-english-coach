/* Profile and settings: personal data, goal, variant, daily time, level, language,
 * reminders, sound, backup, API key and reset. */
import * as store from '../store.js';
import * as C from '../coach.js';
import * as G from '../gemini.js';
import * as gm from '../gamify.js';
import { toggleReminders, setReminderHour } from '../notify.js';
import { t, setLang, goalLabel, goalIcon, GOAL_LABELS } from '../i18n.js';
import { $, view, esc, routes, actions, go, toast, refresh, rankSVG, rankName } from '../dom.js';
import { pickPhoto, HOURS, langToggle } from './start.js';

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
      <label class="f" style="margin-top:14px">${t('pf_hours')} · <span class="muted">${t('pf_goal_xp', { n: gm.dailyGoal() })}</span></label>
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
      <h3>🔊 ${t('pf_sound')}</h3><p class="muted" style="margin:6px 0 12px">${t('pf_sound_sub')}</p>
      <div class="seg">
        <button class="${s.settings.sound !== false ? 'on' : ''}" data-act="pf-sound" data-v="1">${t('on')}</button>
        <button class="${s.settings.sound === false ? 'on' : ''}" data-act="pf-sound" data-v="0">${t('off')}</button>
      </div>
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
  refresh();
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
      go('/path');
    } catch {
      toast(t('pf_bad_backup'), 'bad');
    }
  };
  input.click();
}

const setUser = (k, v) => { store.load().user[k] = v; store.save(); refresh(); };

Object.assign(actions, {
  'lang': el => { setLang(el.dataset.lang); refresh(); },
  'pf-photo': pickPhoto,
  'pf-goal': el => setUser('goal', el.dataset.v),
  'pf-variant': el => setUser('preferred_english', el.dataset.v),
  'pf-hours': el => { store.load().user.daily_xp_goal = null; setUser('daily_hours_goal', parseFloat(el.dataset.v)); },
  'pf-level': el => {
    if (!confirm(t('pf_level_confirm'))) return;
    const u = store.load().user;
    u.level_score = 0; u.pending_exam = false; u.from_zero = false;
    setUser('current_level', el.dataset.v);
  },
  'pf-sound': el => { store.load().settings.sound = el.dataset.v === '1'; store.save(); refresh(); },
  'rem-hour': el => { setReminderHour(el.dataset.v); refresh(); },
  'reminder-toggle': async () => {
    const res = await toggleReminders();
    toast(res.message, res.ok ? 'good' : 'bad');
    refresh();
  },
  'save-profile': saveProfile,
  'export': exportBackup,
  'import': importBackup,
  'reset': () => {
    if (!confirm(t('pf_reset_confirm'))) return;
    store.reset();
    localStorage.removeItem('aec.lessoncache');
    go('/welcome');
  },
});

