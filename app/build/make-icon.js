// Renders the Scriptorium icon with Electron and writes build/icon.png + build/icon.ico
// Run: node_modules\electron\dist\electron.exe build\make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const html = `<html><body style="margin:0;background:transparent">
<div style="width:1024px;height:1024px;border-radius:208px;background:linear-gradient(150deg,#2a4f9e,#0d1730);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden">
  <div style="position:absolute;inset:72px;border:12px solid rgba(255,212,121,.35);border-radius:152px"></div>
  <svg width="600" height="680" viewBox="0 0 150 170">
    <rect x="62" y="8" width="26" height="154" rx="6" fill="#ffd479"/>
    <rect x="22" y="48" width="106" height="26" rx="6" fill="#ffd479"/>
  </svg>
</div></body></html>`;

app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise(r => setTimeout(r, 400));
  const img = await w.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  fs.writeFileSync(path.join(__dirname, 'icon.png'), img.resize({ width: 1024, height: 1024 }).toPNG());
  const png = img.resize({ width: 256, height: 256 }).toPNG();
  // ICO container with one 256x256 PNG entry
  const head = Buffer.alloc(6 + 16);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head.writeUInt8(0, 6); head.writeUInt8(0, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9);
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), Buffer.concat([head, png]));
  app.quit();
});
