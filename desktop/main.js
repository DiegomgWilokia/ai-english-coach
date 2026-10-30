// AI English Coach desktop shell: serves ../app (copied into ./app when packaged) from app://local.
const { app, BrowserWindow, Menu, ipcMain, protocol, net, session, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { pathToFileURL } = require('url');
const tts = require('./tts');

const ORIGIN = 'app://local';
const ROOT = app.isPackaged ? path.join(__dirname, 'app') : path.join(__dirname, '..', 'app');
const SMOKE = process.argv.includes('--smoke');

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);
// No allowServiceWorkers: sw.js precaches with the Cache API, which rejects non-http(s) schemes,
// so its install always failed. Files are local anyway; register() now just logs a warning.

app.setAppUserModelId('com.aienglishcoach.desktop'); // same id as the installer shortcut, needed for toasts
Menu.setApplicationMenu(null);

const smokeLog = { externalOpened: [], failedRequests: [], consoleErrors: [], consoleWarnings: [], defaultUserData: app.getPath('userData') };
// Smoke never touches the real profile, except --smoke-real-profile (upgrade tests with a throwaway app identity).
if (SMOKE && !process.argv.includes('--smoke-real-profile')) app.setPath('userData', path.join(os.tmpdir(), 'aec-desktop-smoke'));
else if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let updater = null;
let updateState = null; // { status: 'available' | 'downloaded', version }

function openExternal(url) {
  let u;
  try { u = new URL(url); } catch { return; }
  if (u.protocol !== 'https:') return;
  if (SMOKE) smokeLog.externalOpened.push(u.href); // record instead of launching the browser
  else shell.openExternal(u.href);
}

// Auto-update from GitHub releases (publish config in package.json). Errors are only logged, never shown.
function startUpdater() {
  const { autoUpdater } = require('electron-updater');
  const logFile = path.join(app.getPath('logs'), 'updater.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  try { if (fs.statSync(logFile).size > 1e6) fs.renameSync(logFile, logFile + '.old'); } catch {}
  const log = (...a) => fs.appendFile(logFile, `${new Date().toISOString()} ${a.map(x => (x && x.stack) || String(x)).join(' ')}
`, () => {});
  autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.disableDifferentialDownload = true; // no blockmaps are published: always a full download
  autoUpdater.disableWebInstaller = true;
  const tell = status => info => {
    updateState = { status, version: info.version };
    if (win && !win.isDestroyed()) win.webContents.send('update', updateState);
  };
  autoUpdater.on('update-available', tell('available'));
  autoUpdater.on('update-downloaded', tell('downloaded'));
  autoUpdater.on('error', e => log('error', e));
  // rejections are already reported through the 'error' event
  const check = () => { if (!updateState || updateState.status !== 'downloaded') autoUpdater.checkForUpdates().catch(() => {}); };
  check();
  setInterval(check, 6 * 60 * 60 * 1000);
  return autoUpdater;
}

async function serve(req) {
  const { host, pathname } = new URL(req.url);
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return new Response('Bad request', { status: 400 }); }
  const file = path.resolve(ROOT, '.' + (rel.endsWith('/') ? rel + 'index.html' : rel));
  if (host !== 'local' || (file !== ROOT && !file.startsWith(ROOT + path.sep))) {
    return new Response('Forbidden', { status: 403 });
  }
  try {
    return await net.fetch(pathToFileURL(file).href);
  } catch {
    if (SMOKE) smokeLog.failedRequests.push(req.url);
    return new Response('Not found', { status: 404 });
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200, height: 820, minWidth: 380, minHeight: 640,
    title: 'AI English Coach',
    icon: path.join(ROOT, 'icon.ico'),
    backgroundColor: '#0f1226',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: !SMOKE,
    },
  });
  win.on('page-title-updated', e => e.preventDefault());
  if (!SMOKE) win.once('ready-to-show', () => win.show());

  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN + '/')) { e.preventDefault(); openExternal(url); }
  });
  if (SMOKE) {
    wc.on('console-message', e => {
      const line = `${e.message} (${e.sourceId}:${e.lineNumber})`;
      if (e.level === 'error') smokeLog.consoleErrors.push(line);
      else if (e.level === 'warning') smokeLog.consoleWarnings.push(line);
    });
    wc.on('did-fail-load', (_e, code, desc, url) => smokeLog.consoleErrors.push(`did-fail-load ${code} ${desc} ${url}`));
    wc.on('render-process-gone', (_e, d) => smokeLog.consoleErrors.push(`render-process-gone ${d.reason}`));
    wc.once('did-finish-load', () => setTimeout(runSmoke, 4000));
  }
  win.loadURL(`${ORIGIN}/index.html`);
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.whenReady().then(() => {
  protocol.handle('app', serve);

  const ses = session.defaultSession;
  const ours = url => typeof url === 'string' && (url === ORIGIN || url.startsWith(ORIGIN + '/'));
  ses.setPermissionRequestHandler((_wc, permission, cb, details) => {
    if (!ours(details.requestingUrl)) return cb(false);
    if (permission === 'media') {
      const types = details.mediaTypes || [];
      return cb(types.length > 0 && types.every(t => t === 'audio'));
    }
    cb(permission === 'notifications');
  });
  ses.setPermissionCheckHandler((_wc, permission, origin, details) => {
    if (!ours(origin)) return false;
    if (permission === 'media') return details.mediaType === 'audio';
    return permission === 'notifications';
  });

  const fromApp = e => ours(e.senderFrame && e.senderFrame.url);
  const guard = fn => (e, ...args) => { if (!fromApp(e)) throw new Error('forbidden'); return fn(...args); };
  ipcMain.handle('tts:voices', guard(tts.voices));
  ipcMain.handle('tts:speak', guard(tts.speak));
  ipcMain.handle('tts:stop', guard(tts.stop));
  ipcMain.handle('app:version', guard(() => app.getVersion()));
  ipcMain.handle('update:state', guard(() => updateState));
  ipcMain.handle('update:install', guard(() => {
    if (!updater || !updateState || updateState.status !== 'downloaded') return false;
    setImmediate(() => updater.quitAndInstall(true, true)); // silent install, then relaunch
    return true;
  }));
  tts.start(); // warm up PowerShell + System.Speech (~1 s) before the first speak

  createWindow();
  if (app.isPackaged && !SMOKE) updater = startUpdater();
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', tts.kill);

// --smoke: load the app, probe it from the renderer, screenshot, exit 0 (pass) / 1 (fail).
const SMOKE_PROBE = `(async () => {
  const r = {};
  const view = document.querySelector('#view');
  r.viewChildren = view ? view.children.length : -1;
  r.viewText = view ? view.innerText.trim().slice(0, 120) : null;
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=INVALID');
    const body = await res.text();
    let json = false; try { JSON.parse(body); json = true; } catch {}
    r.cors = { status: res.status, json };
  } catch (e) { r.cors = { error: String(e) }; }
  try { r.traversalStatus = (await fetch('app://local/..%2F..%2F..%2Fwindows%2Fwin.ini')).status; }
  catch (e) { r.traversalStatus = String(e); }
  r.localStoragePrevious = localStorage.getItem('__aec_smoke');
  localStorage.setItem('__aec_smoke', new Date().toISOString());
  let voices = speechSynthesis.getVoices();
  if (!voices.length) await new Promise(ok => { speechSynthesis.onvoiceschanged = ok; setTimeout(ok, 3000); });
  voices = speechSynthesis.getVoices();
  r.voices = voices.map(v => v.name + ' [' + v.lang + ']');
  r.englishVoices = voices.filter(v => /^en/i.test(v.lang)).map(v => v.name + ' [' + v.lang + ']');
  r.notificationPermission = typeof Notification === 'undefined' ? 'n/a' : Notification.permission;
  const gum = async c => { try { (await navigator.mediaDevices.getUserMedia(c)).getTracks().forEach(t => t.stop()); return 'granted'; } catch (e) { return e.name; } };
  r.micAudio = await gum({ audio: true });
  r.micVideo = await gum({ video: true });
  if (window.aecDesktop) {
    r.desktopApi = { version: await aecDesktop.version(), installUpdate: await aecDesktop.installUpdate(), onUpdate: typeof aecDesktop.onUpdate };
    const t = r.tts = {};
    t.voices = await aecDesktop.voices();
    let t0 = performance.now();
    try { await aecDesktop.speak({ text: 'Hello! This is a quick test of the English voice.', rate: 1 }); t.speakMs = Math.round(performance.now() - t0); }
    catch (e) { t.speakError = e.message; }
    t0 = performance.now();
    const long = aecDesktop.speak({ text: 'This sentence is long on purpose, so that stop can cut it off well before it reaches the end.', rate: 0.7 })
      .then(() => 'resolved', e => 'rejected: ' + e.message);
    await new Promise(ok => setTimeout(ok, 700));
    await aecDesktop.stop();
    t.stopped = await long;
    t.stopMs = Math.round(performance.now() - t0);
    t.tooLong = await aecDesktop.speak({ text: 'x'.repeat(501) }).then(() => 'resolved', () => 'rejected');
    t.notString = await aecDesktop.speak({ text: 42 }).then(() => 'resolved', () => 'rejected');
  }
  window.open('https://aistudio.google.com/apikey', '_blank');
  window.open('http://example.com/', '_blank');
  return r;
})()`;

async function runSmoke() {
  const outDir = path.join(os.tmpdir(), 'aec-desktop-smoke-out');
  fs.mkdirSync(outDir, { recursive: true });
  const tag = app.isPackaged ? 'packaged' : 'dev';
  let report;
  try {
    report = await win.webContents.executeJavaScript(SMOKE_PROBE, true);
    // a cross-origin navigation must be blocked and handed to openExternal
    await win.webContents.executeJavaScript(`location.href = 'https://example.org/'; 0`, true);
    await new Promise(ok => setTimeout(ok, 800));
    report.urlAfterNavigationAttempt = win.webContents.getURL();
    const png = (await win.webContents.capturePage()).toPNG();
    report.screenshot = path.join(outDir, `smoke-${tag}.png`);
    report.screenshotBytes = png.length;
    fs.writeFileSync(report.screenshot, png);
  } catch (e) {
    report = { fatal: String(e && e.stack || e) };
  }
  if (report.tts) Object.assign(report.tts, tts.info(), { sapiRate: { '0.6': tts.sapiRate(0.6), '0.7': tts.sapiRate(0.7), '1': tts.sapiRate(1), '1.2': tts.sapiRate(1.2), '5': tts.sapiRate(5) } });
  Object.assign(report, smokeLog, { version: app.getVersion(), userData: app.getPath('userData'), electron: process.versions.electron, chrome: process.versions.chrome, packaged: app.isPackaged });
  const fails = [];
  if (report.fatal) fails.push('fatal');
  if (!(report.viewChildren > 0)) fails.push('ui.js did not render #view');
  if (!(report.cors && report.cors.status === 400 && report.cors.json)) fails.push('CORS fetch to Gemini');
  if (report.traversalStatus !== 403) fails.push('path traversal not blocked');
  if (report.micAudio === 'NotAllowedError') fails.push('mic denied');
  if (report.micVideo !== 'NotAllowedError') fails.push('camera not denied');
  if (report.consoleErrors.length) fails.push('console errors');
  if (report.failedRequests.length) fails.push('404s');
  const expectedExternal = ['https://aistudio.google.com/apikey', 'https://example.org/'];
  if (JSON.stringify(report.externalOpened) !== JSON.stringify(expectedExternal)) fails.push('external link policy');
  if (report.urlAfterNavigationAttempt && !report.urlAfterNavigationAttempt.startsWith(ORIGIN + '/')) fails.push('window navigated away');
  if (!(report.screenshotBytes > 10000)) fails.push('screenshot empty');
  const api = report.desktopApi;
  if (!api || api.version !== app.getVersion() || api.installUpdate !== false || api.onUpdate !== 'function') fails.push('desktop update/version API');
  const t = report.tts;
  if (!t) fails.push('window.aecDesktop missing');
  else if (t.voices.length) {
    if (!(t.speakMs > 500)) fails.push('native speak did not wait for the end');
    if (t.stopped !== 'resolved' || !(t.stopMs < 2500)) fails.push('native stop');
  } else if (!t.speakError) fails.push('speak without English voice must reject');
  if (t && (t.tooLong !== 'rejected' || t.notString !== 'rejected')) fails.push('tts input validation');
  if (t && (t.sapiRate['1'] !== 0 || t.sapiRate['0.7'] !== -3 || t.sapiRate['5'] !== 2)) fails.push('rate mapping');
  report.result = fails.length ? 'FAIL: ' + fails.join(', ') : 'PASS';
  const json = JSON.stringify(report, null, 2);
  fs.writeFileSync(path.join(outDir, `smoke-${tag}.json`), json);
  console.log(json);
  tts.kill(); // app.exit skips will-quit
  await session.defaultSession.flushStorageData(); // app.exit skips the normal flush; keep localStorage for the next run
  app.exit(fails.length ? 1 : 0);
}
