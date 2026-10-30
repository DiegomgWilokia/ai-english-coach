/* New versions. Windows downloads them in the background and installs on close
 * (electron-updater); here we only say so. Android cannot install silently, so it
 * checks GitHub once a day and offers the new APK. The web version updates itself.
 * User data lives in the app's own storage and is never touched by an update. */
import { APP_VERSION } from './version.js';
import { t } from './i18n.js';
import { esc } from './dom.js';

const RELEASES = 'https://api.github.com/repos/DiegomgWilokia/ai-english-coach/releases/latest';
export const APK_URL = 'https://github.com/DiegomgWilokia/ai-english-coach/releases/latest/download/AI-English-Coach.apk';
const CHECK_KEY = 'aec.updcheck';

/* 1 if a > b, -1 if a < b, 0 if equal ("2.10.0" > "2.9.1"). Pure. */
export function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function banner(html) {
  document.getElementById('update-banner')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="update-banner" id="update-banner" role="status">${html}
    <button class="icon-btn" data-act="update-dismiss" aria-label="${t('close')}">✕</button></div>`);
}

export function initUpdates() {
  const desk = window.aecDesktop;
  if (desk?.onUpdate) {
    desk.onUpdate(u => {
      if (u?.status === 'downloaded') {
        banner(`<span>✨ ${t('upd_ready', { v: esc(u.version) })}</span>
          <button class="btn btn-sm btn-primary" data-act="update-install">${t('upd_restart')}</button>`);
      }
    });
    return;
  }
  if (!window.Capacitor) return;
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(CHECK_KEY) === today) return;
  fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json' } })
    .then(r => (r.ok ? r.json() : null))
    .then(rel => {
      localStorage.setItem(CHECK_KEY, today);
      if (rel?.tag_name && compareVersions(rel.tag_name, APP_VERSION) > 0) {
        banner(`<span>✨ ${t('upd_apk', { v: esc(rel.tag_name.replace(/^v/, '')) })}</span>
          <a class="btn btn-sm btn-primary" href="${APK_URL}" target="_blank" rel="noopener">${t('upd_download')}</a>`);
      }
    })
    .catch(() => { /* offline: try again next launch */ });
}

export const updateActions = {
  'update-install': () => window.aecDesktop?.installUpdate?.(),
  'update-dismiss': () => document.getElementById('update-banner')?.remove(),
};

export { APP_VERSION };
