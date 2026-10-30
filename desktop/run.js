// Starts Electron (or the packaged build with --packaged) without ELECTRON_RUN_AS_NODE,
// which VS Code leaks into its terminals and which makes Electron run as plain Node.
const { spawnSync } = require('child_process');
const path = require('path');

delete process.env.ELECTRON_RUN_AS_NODE;
const args = process.argv.slice(2).filter(a => a !== '--packaged');
const [bin, binArgs] = process.argv.includes('--packaged')
  ? [path.join(__dirname, 'dist', 'win-unpacked', 'AI English Coach.exe'), args]
  : [require('electron'), ['.', ...args]];
const r = spawnSync(bin, binArgs, { stdio: 'inherit', cwd: __dirname });
if (r.error) throw r.error;
process.exit(r.status ?? 1);
