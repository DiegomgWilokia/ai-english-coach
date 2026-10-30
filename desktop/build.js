// npm run dist: copy ../app (single source) into ./app, take the version from app/js/version.js,
// build the NSIS installer + latest.yml (auto-update feed), copy the installer to ../downloads.
const fs = require('fs');
const path = require('path');
const { build } = require('electron-builder');

const appSrc = path.join(__dirname, '..', 'app');
const appDst = path.join(__dirname, 'app');
const dist = path.join(__dirname, 'dist');
const NAME = 'AI-English-Coach.exe'; // stable: releases/latest/download/AI-English-Coach.exe

const m = /APP_VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]/.exec(fs.readFileSync(path.join(appSrc, 'js', 'version.js'), 'utf8'));
if (!m) throw new Error("app/js/version.js must contain APP_VERSION = 'x.y.z'");
const version = m[1];

fs.rmSync(appDst, { recursive: true, force: true });
fs.cpSync(appSrc, appDst, { recursive: true });
fs.rmSync(dist, { recursive: true, force: true }); // no stale installers next to the ones to upload

build({ win: ['nsis'], publish: 'never', config: { extraMetadata: { version } } }).then(() => {
  const latest = fs.readFileSync(path.join(dist, 'latest.yml'), 'utf8');
  if (!latest.includes(`version: ${version}`) || !latest.includes(`path: ${NAME}`)) throw new Error('latest.yml does not match:\n' + latest);
  const target = path.join(__dirname, '..', 'downloads', NAME);
  fs.copyFileSync(path.join(dist, NAME), target);
  console.log(`\nVersion ${version}. Upload to a GitHub release tagged v${version}:\n  ${path.join(dist, NAME)}\n  ${path.join(dist, 'latest.yml')}`);
  console.log(`Copied to ${target} (${(fs.statSync(target).size / 1048576).toFixed(1)} MB)`);
}).catch(err => { console.error(err); process.exit(1); });
