// window.aecDesktop: native English TTS (SAPI) for the web app; see tts.js.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aecDesktop', {
  speak: opts => ipcRenderer.invoke('tts:speak', opts), // resolves when speech ends (or is stopped)
  stop: () => ipcRenderer.invoke('tts:stop'),
  voices: () => ipcRenderer.invoke('tts:voices'), // English SAPI voice names, the one used first; [] if none
});
