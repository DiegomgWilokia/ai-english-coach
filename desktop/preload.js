// window.aecDesktop: native English TTS (SAPI, see tts.js), app version and auto-update status.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aecDesktop', {
  speak: opts => ipcRenderer.invoke('tts:speak', opts), // resolves when speech ends (or is stopped)
  stop: () => ipcRenderer.invoke('tts:stop'),
  voices: () => ipcRenderer.invoke('tts:voices'), // English SAPI voice names, the one used first; [] if none
  version: () => ipcRenderer.invoke('app:version'),
  // cb({ status: 'available' | 'downloaded', version }); also replays the current state on subscribe
  onUpdate: cb => {
    if (typeof cb !== 'function') return;
    ipcRenderer.on('update', (_e, state) => cb(state));
    ipcRenderer.invoke('update:state').then(state => state && cb(state));
  },
  installUpdate: () => ipcRenderer.invoke('update:install'), // false if no update is downloaded yet
});
