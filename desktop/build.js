// npm run dist: copy ../app (single source) into ./app, build the NSIS installer,
// then publish it as ../downloads/AI-English-Coach.exe.
const fs = require('fs');
const path = require('path');
const { build } = require('electron-builder');

const appSrc = path.join(__dirname, '..', 'app');
const appDst = path.join(__dirname, 'app');
fs.rmSync(appDst, { recursive: true, force: true });
fs.cpSync(appSrc, appDst, { recursive: true });

build({ win: ['nsis'] }).then(() => {
  const installer = path.join(__dirname, 'dist', 'AI-English-Coach-Setup.exe');
  const target = path.join(__dirname, '..', 'downloads', 'AI-English-Coach.exe');
  fs.copyFileSync(installer, target);
  console.log(`Installer: ${target} (${(fs.statSync(target).size / 1048576).toFixed(1)} MB)`);
}).catch(err => { console.error(err); process.exit(1); });
