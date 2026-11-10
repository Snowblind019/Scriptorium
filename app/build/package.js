// Builds a portable Windows folder: ../dist/Scriptorium/Scriptorium.exe
// (electron-packager's zip extraction fails on this PC, so this copies the already-installed
//  Electron runtime instead.)  Run:  node build/package.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const APP = path.resolve(__dirname, '..');
const OUT = path.resolve(APP, '..', 'dist', 'Scriptorium');
const ELECTRON = path.join(APP, 'node_modules', 'electron', 'dist');
const pkg = require(path.join(APP, 'package.json'));

if (fs.existsSync(OUT)) {
  // only ever remove our own previous build folder
  if (!fs.existsSync(path.join(OUT, 'Scriptorium.exe'))) throw new Error('Refusing to replace ' + OUT);
  fs.rmSync(OUT, { recursive: true, force: true });
}
fs.mkdirSync(OUT, { recursive: true });

// 1. Electron runtime, without the default app
fs.cpSync(ELECTRON, OUT, { recursive: true, filter: src => !src.endsWith('default_app.asar') });
fs.renameSync(path.join(OUT, 'electron.exe'), path.join(OUT, 'Scriptorium.exe'));

// 2. our app into resources/app (no node_modules – the app has no runtime dependencies)
const dst = path.join(OUT, 'resources', 'app');
const include = ['main.js', 'preload.js', 'selftest.js', 'control', 'projector', 'shared', 'data', 'build/icon.png', 'build/icon.ico'];
for (const rel of include) fs.cpSync(path.join(APP, rel), path.join(dst, rel), { recursive: true });
fs.writeFileSync(path.join(dst, 'package.json'), JSON.stringify({ name: pkg.name, productName: pkg.productName, version: pkg.version, main: pkg.main, author: pkg.author }, null, 1));

// 3. icon + version info on the exe
const rcedit = path.join(APP, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');
if (fs.existsSync(rcedit)) {
  execFileSync(rcedit, [path.join(OUT, 'Scriptorium.exe'),
    '--set-icon', path.join(APP, 'build', 'icon.ico'),
    '--set-version-string', 'ProductName', 'Scriptorium',
    '--set-version-string', 'FileDescription', 'Scriptorium',
    '--set-version-string', 'CompanyName', 'Scriptorium',
    '--set-file-version', pkg.version, '--set-product-version', pkg.version]);
} else console.warn('rcedit not found – exe keeps the Electron icon');
console.log('Built', path.join(OUT, 'Scriptorium.exe'));
