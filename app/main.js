// Scriptorium – main process (Windows, macOS, Linux)
const { app, BrowserWindow, ipcMain, screen, dialog, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const DATA_DIR = path.join(__dirname, 'data');
const IS_WIN = process.platform === 'win32', IS_MAC = process.platform === 'darwin';
let USER_DIR, SONG_DIR, MEDIA_DIR, DL_DIR, BIN_DIR, SETTINGS_FILE;
let controlWin = null, projWin = null, lastState = null, lastMedia = null, projVisible = false;
const SELFTEST = process.env.SCRIPTORIUM_SELFTEST;
const dbg = (m) => { if (SELFTEST) fs.appendFileSync(path.join(SELFTEST, 'main.log'), new Date().toISOString() + ' ' + m + '\n'); };

const MEDIA_EXT = {
  audio: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'weba'],
  video: ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'],
};
const kindOf = (f) => { const e = path.extname(f).slice(1).toLowerCase(); return Object.keys(MEDIA_EXT).find(k => MEDIA_EXT[k].includes(e)) || null; };
const fileItem = (p) => ({ name: path.basename(p), path: p, url: pathToFileURL(p).href, kind: kindOf(p) });

// Linux .tar.gz copies can't keep the root-owned setuid sandbox helper; the app only shows local pages,
// so fall back to no sandbox instead of refusing to start (AppImage/.deb installs are unaffected).
if (process.platform === 'linux') {
  try {
    const sb = path.join(path.dirname(process.execPath), 'chrome-sandbox'), st = fs.statSync(sb);
    if (st.uid !== 0 || !(st.mode & 0o4000)) app.commandLine.appendSwitch('no-sandbox');
  } catch { /* no helper → Chromium uses namespaces */ }
}
if (SELFTEST) app.setPath('userData', path.join(SELFTEST, 'userdata'));
app.setName('Scriptorium');
if (IS_WIN) app.setAppUserModelId('ro.scriptorium.app');
if (!SELFTEST && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (controlWin) { if (controlWin.isMinimized()) controlWin.restore(); controlWin.focus(); } });

function initDirs() {
  USER_DIR = app.getPath('userData');
  SONG_DIR = path.join(USER_DIR, 'songs');
  MEDIA_DIR = path.join(USER_DIR, 'media');
  DL_DIR = path.join(MEDIA_DIR, 'downloads');
  BIN_DIR = path.join(USER_DIR, 'bin');
  SETTINGS_FILE = path.join(USER_DIR, 'settings.json');
  for (const d of [SONG_DIR, MEDIA_DIR, DL_DIR, BIN_DIR]) fs.mkdirSync(d, { recursive: true });
  // bundled song books → editable copies; a newer bundled version replaces a copy the user never edited
  const src = path.join(DATA_DIR, 'songs');
  for (const f of fs.readdirSync(src)) {
    const dst = path.join(SONG_DIR, f);
    if (!fs.existsSync(dst)) { fs.copyFileSync(path.join(src, f), dst); continue; }
    try {
      const b = JSON.parse(fs.readFileSync(path.join(src, f), 'utf8')), u = JSON.parse(fs.readFileSync(dst, 'utf8'));
      if (!u.edited && (u.dataVersion || 1) < (b.dataVersion || 1)) fs.copyFileSync(path.join(src, f), dst);
    } catch { /* keep the user's file */ }
  }
}
const readSettings = () => { try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return null; } };
function pickDisplay() {
  const s = readSettings(), displays = screen.getAllDisplays(), primary = screen.getPrimaryDisplay();
  if (s && s.projectorDisplayId != null) { const d = displays.find(d => d.id === s.projectorDisplayId); if (d) return d; }
  return displays.find(d => d.id !== primary.id) || null;
}
const iconPath = () => path.join(__dirname, 'build', IS_WIN ? 'icon.ico' : 'icon.png');
const webPrefs = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false };

function createControl() {
  controlWin = new BrowserWindow({ width: 1500, height: 900, minWidth: 1100, minHeight: 680, title: 'Scriptorium', backgroundColor: '#121419', show: false, icon: path.join(__dirname, 'build', 'icon.png'), webPreferences: webPrefs });
  controlWin.removeMenu();
  controlWin.loadFile(path.join(__dirname, 'control', 'index.html'));
  controlWin.once('ready-to-show', () => { controlWin.maximize(); controlWin.show(); });
  controlWin.on('closed', () => { controlWin = null; if (projWin) projWin.destroy(); app.quit(); });
  controlWin.webContents.on('before-input-event', (e, input) => { if (input.type === 'keyDown' && input.key === 'F12') controlWin.webContents.toggleDevTools(); });
}
function createProjector() {
  const d = pickDisplay();
  const opts = { show: false, frame: false, backgroundColor: '#000000', title: 'Scriptorium – Projector', icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { ...webPrefs, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } };
  if (d) Object.assign(opts, { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, fullscreen: true });
  else Object.assign(opts, { width: 960, height: 540, frame: true, resizable: true });
  projWin = new BrowserWindow(opts);
  projWin.removeMenu();
  projWin.loadFile(path.join(__dirname, 'projector', 'index.html'));
  projWin.webContents.on('did-finish-load', () => { if (lastState) projWin.webContents.send('proj:state', lastState); if (lastMedia) projWin.webContents.send('media:cmd', lastMedia); });
  projWin.webContents.on('render-process-gone', (_e, x) => dbg('proj gone ' + JSON.stringify(x)));
  projWin.on('closed', () => { projWin = null; projVisible = false; notifyProj(); });
}
const notifyProj = () => { if (controlWin) controlWin.webContents.send('proj:visible', projVisible); };
function showProjector(show) {
  if (show) {
    if (!projWin) createProjector();
    const d = pickDisplay();
    if (d) { projWin.setBounds(d.bounds); projWin.setFullScreen(true); }
    projWin.showInactive(); projVisible = true;
  } else if (projWin) { projWin.hide(); projVisible = false; }
  notifyProj();
}

app.whenReady().then(() => {
  initDirs();
  createControl();
  createProjector();
  const s = readSettings();
  if (pickDisplay() && s && s.projectorOnStartup === true) projWin.once('ready-to-show', () => showProjector(true));
  if (SELFTEST) require('./selftest')(() => ({ controlWin, projWin }), SELFTEST).then(() => app.quit());
  screen.on('display-added', () => controlWin && controlWin.webContents.send('displays:changed'));
  screen.on('display-removed', () => controlWin && controlWin.webContents.send('displays:changed'));
});
app.on('window-all-closed', () => app.quit());

// ---------------- projector ----------------
ipcMain.on('proj:state', (_e, st) => { lastState = st; if (projWin) projWin.webContents.send('proj:state', st); });
ipcMain.handle('proj:show', (_e, show) => { showProjector(show); return projVisible; });
ipcMain.handle('proj:visible', () => projVisible);
ipcMain.handle('proj:applyDisplay', () => { if (projVisible) showProjector(true); return true; });
ipcMain.handle('displays:list', () => {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((d, i) => ({ id: d.id, label: `Display ${i + 1}${d.id === primary.id ? ' (main)' : ''} – ${d.bounds.width}×${d.bounds.height}` }));
});
ipcMain.on('media:cmd', (_e, cmd) => { if (cmd.op === 'load') lastMedia = cmd; if (cmd.op === 'unload') lastMedia = null; if (projWin) projWin.webContents.send('media:cmd', cmd); });
ipcMain.on('media:status', (_e, st) => { if (controlWin) controlWin.webContents.send('media:status', st); });

// ---------------- settings / data ----------------
ipcMain.handle('settings:load', () => readSettings());
ipcMain.handle('settings:save', (_e, s) => { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 1), 'utf8'); return true; });
ipcMain.handle('bible:load', (_e, id) => fs.readFileSync(path.join(DATA_DIR, 'bibles', String(id).toLowerCase().replace(/[^a-z]/g, '') + '.json'), 'utf8'));
ipcMain.handle('songs:loadAll', () => fs.readdirSync(SONG_DIR).filter(f => f.endsWith('.json')).map(f => { try { return JSON.parse(fs.readFileSync(path.join(SONG_DIR, f), 'utf8')); } catch { return null; } }).filter(Boolean));
const bookFile = (id) => path.join(SONG_DIR, String(id).replace(/[^a-z0-9\-_]/gi, '_') + '.json');
ipcMain.handle('songs:saveBook', (_e, book) => { const f = bookFile(book.id); if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak'); fs.writeFileSync(f, JSON.stringify(book), 'utf8'); return true; });
ipcMain.handle('songs:deleteBook', (_e, id) => { const f = bookFile(id); if (fs.existsSync(f)) fs.renameSync(f, f + '.deleted'); return true; });
ipcMain.handle('songs:openFolder', () => shell.openPath(SONG_DIR));

// import songs from many formats (binary SQLite read here; text formats are parsed in the window)
function readText(file) {
  const buf = fs.readFileSync(file);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch { return new TextDecoder('windows-1250').decode(buf); }
}
ipcMain.handle('songs:import', async () => {
  const r = await dialog.showOpenDialog(controlWin, { properties: ['openFile', 'multiSelections'], filters: [
    { name: 'Song files', extensions: ['sps', 'sqlite', 'db', 'xml', 'csv', 'txt', 'cho', 'chordpro', 'pro', 'crd', 'json'] }, { name: 'All files', extensions: ['*'] }] });
  if (r.canceled) return [];
  const { DatabaseSync } = require('node:sqlite');
  return r.filePaths.map(file => {
    const ext = path.extname(file).slice(1).toLowerCase(), name = path.basename(file);
    if (['sps', 'sqlite', 'db'].includes(ext)) {
      const db = new DatabaseSync(file, { readOnly: true });
      try {
        const tables = db.prepare("select name from sqlite_master where type='table'").all().map(x => x.name);
        if (tables.includes('SongBook') && tables.includes('Songs')) {
          const sb = db.prepare('select title from SongBook').get() || {};
          return { kind: 'sps', ext, name, title: sb.title || path.basename(file, '.' + ext), rows: db.prepare('select number, title, song_text as text, notes from Songs order by number').all() };
        }
        if (tables.includes('songs')) {
          const cols = db.prepare('pragma table_info(songs)').all().map(c => c.name);
          const num = cols.includes('song_number') ? 'song_number' : 'NULL';
          return { kind: 'openlp', ext, name, title: path.basename(file, '.' + ext), rows: db.prepare(`select title, lyrics, ${num} as number from songs order by title`).all() };
        }
        throw new Error('Unknown database format');
      } finally { db.close(); }
    }
    return { kind: 'text', ext, name, title: path.basename(file, '.' + ext), text: readText(file) };
  });
});

// ---------------- media ----------------
ipcMain.handle('media:pick', async (_e, kind) => {   // theme backgrounds: copied into the program folder
  const filters = kind === 'video' ? [{ name: 'Video', extensions: MEDIA_EXT.video }] : [{ name: 'Images', extensions: MEDIA_EXT.image }];
  const r = await dialog.showOpenDialog(controlWin, { properties: ['openFile', 'multiSelections'], filters });
  if (r.canceled) return [];
  return r.filePaths.map(src => {
    const name = path.basename(src);
    let dst = path.join(MEDIA_DIR, name), i = 1;
    while (fs.existsSync(dst) && fs.statSync(dst).size !== fs.statSync(src).size) dst = path.join(MEDIA_DIR, `${path.parse(name).name}_${i++}${path.extname(name)}`);
    if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
    return { name: path.basename(dst), url: pathToFileURL(dst).href };
  });
});
ipcMain.handle('media:addFiles', async () => {
  const all = [...MEDIA_EXT.audio, ...MEDIA_EXT.video, ...MEDIA_EXT.image];
  const r = await dialog.showOpenDialog(controlWin, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Audio, video, images', extensions: all }] });
  return r.canceled ? [] : r.filePaths.map(fileItem).filter(x => x.kind);
});
ipcMain.handle('media:addFolder', async () => {
  const r = await dialog.showOpenDialog(controlWin, { properties: ['openDirectory'] });
  if (r.canceled) return [];
  const out = [];
  const walk = (d, depth) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, n.name); if (n.isDirectory() && depth < 3) walk(p, depth + 1); else if (n.isFile() && kindOf(p)) out.push(fileItem(p)); } };
  walk(r.filePaths[0], 0);
  return out;
});
ipcMain.handle('media:scanDownloads', () => fs.readdirSync(DL_DIR).map(n => path.join(DL_DIR, n)).filter(p => kindOf(p) && !/\.part$/.test(p)).map(fileItem));
ipcMain.handle('media:exists', (_e, paths) => paths.map(p => { try { return fs.existsSync(p); } catch { return false; } }));
ipcMain.handle('media:openFolder', () => shell.openPath(DL_DIR));

// ---------------- yt-dlp / ffmpeg ----------------
const exe = n => IS_WIN ? n + '.exe' : n;
function which(n) {
  const r = spawnSync(IS_WIN ? 'where' : 'which', [n], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}
const tool = n => { const p = path.join(BIN_DIR, exe(n)); return fs.existsSync(p) ? p : which(n); };
function jsRuntimeArgs() {   // YouTube needs a JavaScript runtime for yt-dlp; use deno/node if present, else Electron's own Node
  if (which('deno')) return { args: [], env: {} };
  if (which('node')) return { args: ['--js-runtimes', 'node'], env: {} };
  return { args: ['--js-runtimes', 'node:' + process.execPath], env: { ELECTRON_RUN_AS_NODE: '1' } };
}
ipcMain.handle('ytdlp:status', () => ({ ytdlp: tool('yt-dlp'), ffmpeg: tool('ffmpeg'), folder: DL_DIR, ffmpegSize: IS_MAC ? '~25 MB' : '~90–140 MB' }));

async function fetchTo(url, file, label) {
  const res = await net.fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const total = +res.headers.get('content-length') || 0;
  const out = fs.createWriteStream(file);
  const reader = res.body.getReader();
  let got = 0, lastT = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.write(Buffer.from(value)); got += value.length;
    if (Date.now() - lastT > 300 && controlWin) { lastT = Date.now(); controlWin.webContents.send('ytdlp:progress', { pct: total ? got / total * 100 : null, text: `${label}: ${(got / 1048576).toFixed(1)} MB${total ? ' / ' + (total / 1048576).toFixed(1) + ' MB' : ''}` }); }
  }
  await new Promise(r => out.end(r));
}
function run(cmd, args, opts = {}) {
  return new Promise((res, rej) => { const p = spawn(cmd, args, opts); let err = ''; p.stderr && p.stderr.on('data', d => (err += d)); p.on('close', c => c === 0 ? res() : rej(new Error(err || cmd + ' failed'))); p.on('error', rej); });
}
function findFile(dir, name) {
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, n.name); if (n.isDirectory()) { const r = findFile(p, name); if (r) return r; } else if (n.name === name) return p; }
  return null;
}
ipcMain.handle('ytdlp:install', async (_e, which_) => {
  const arch = process.arch;
  if (which_ === 'ytdlp') {
    const f = IS_WIN ? 'yt-dlp.exe' : IS_MAC ? 'yt-dlp_macos' : arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
    const dst = path.join(BIN_DIR, exe('yt-dlp'));
    await fetchTo('https://github.com/yt-dlp/yt-dlp/releases/latest/download/' + f, dst + '.part', 'yt-dlp');
    fs.renameSync(dst + '.part', dst);
    if (!IS_WIN) fs.chmodSync(dst, 0o755);
    return dst;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scr-ff-'));
  try {
    if (IS_MAC) {
      for (const n of ['ffmpeg', 'ffprobe']) {
        const z = path.join(tmp, n + '.zip');
        await fetchTo(`https://evermeet.cx/ffmpeg/getrelease/${n === 'ffmpeg' ? '' : 'ffprobe/'}zip`, z, n);
        await run('ditto', ['-x', '-k', z, tmp]);
        fs.copyFileSync(path.join(tmp, n), path.join(BIN_DIR, n)); fs.chmodSync(path.join(BIN_DIR, n), 0o755);
      }
    } else {
      const f = IS_WIN ? 'ffmpeg-master-latest-win64-gpl.zip' : arch === 'arm64' ? 'ffmpeg-master-latest-linuxarm64-gpl.tar.xz' : 'ffmpeg-master-latest-linux64-gpl.tar.xz';
      const arc = path.join(tmp, f);
      await fetchTo('https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/' + f, arc, 'ffmpeg');
      if (controlWin) controlWin.webContents.send('ytdlp:progress', { text: 'Unpacking ffmpeg…' });
      await run('tar', IS_WIN ? ['-xf', arc, '-C', tmp] : ['-xJf', arc, '-C', tmp]);
      for (const n of ['ffmpeg', 'ffprobe']) { const p = findFile(tmp, exe(n)); if (p) { fs.copyFileSync(p, path.join(BIN_DIR, exe(n))); if (!IS_WIN) fs.chmodSync(path.join(BIN_DIR, exe(n)), 0o755); } }
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  if (!tool('ffmpeg')) throw new Error('ffmpeg not found after download');
  return tool('ffmpeg');
});

ipcMain.handle('ytdlp:info', async (_e, url) => {
  const y = tool('yt-dlp'); if (!y) throw new Error('yt-dlp is not installed');
  const js = jsRuntimeArgs();
  return new Promise((res, rej) => {
    const p = spawn(y, ['-J', '--no-playlist', '--no-warnings', ...js.args, url], { env: { ...process.env, ...js.env } });
    let out = '', err = '';
    p.stdout.on('data', d => (out += d)); p.stderr.on('data', d => (err += d));
    p.on('close', c => {
      if (c !== 0) return rej(new Error((err.split('\n').find(l => /ERROR/.test(l)) || err).slice(0, 300)));
      try { const j = JSON.parse(out); res({ title: j.title, track: j.track, artist: j.artist || (j.artists || [])[0], creator: j.creator, uploader: j.uploader, channel: j.channel, duration: j.duration }); }
      catch (e) { rej(e); }
    });
    p.on('error', rej);
  });
});

let dlProc = null;
ipcMain.handle('ytdlp:cancel', () => { if (dlProc) dlProc.kill(); return true; });
ipcMain.handle('ytdlp:download', async (_e, o) => {
  const y = tool('yt-dlp'); if (!y) throw new Error('yt-dlp is not installed');
  const ff = tool('ffmpeg'), js = jsRuntimeArgs();
  const safe = String(o.name || 'download').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 150) || 'download';
  const args = ['--no-playlist', '--newline', '--progress', '--no-warnings', '--print', 'after_move:filepath', '-o', path.join(DL_DIR, safe + '.%(ext)s'), ...js.args];
  if (ff) args.push('--ffmpeg-location', path.dirname(ff));
  if (o.kind === 'audio') {
    if (ff) {
      args.push('-f', 'bestaudio/best', '-x', '--audio-format', o.format, '--audio-quality', o.quality === 'best' ? '0' : o.quality + 'K');
      if (o.rate) args.push('--postprocessor-args', 'ExtractAudio:-ar ' + o.rate);
    } else args.push('-f', o.format === 'opus' ? 'bestaudio[ext=webm]/bestaudio' : 'bestaudio[ext=m4a]/bestaudio');
  } else {
    const h = o.quality === 'best' ? '' : `[height<=${o.quality}]`;
    if (ff) {
      args.push('-f', o.format === 'mp4' ? `bv*${h}[ext=mp4]+ba[ext=m4a]/bv*${h}+ba/b${h}` : o.format === 'webm' ? `bv*${h}[ext=webm]+ba[ext=webm]/bv*${h}+ba/b${h}` : `bv*${h}+ba/b${h}`, '--merge-output-format', o.format);
    } else args.push('-f', `b${h}[ext=mp4]/b${h}/b`);
  }
  args.push(o.url);
  return new Promise((res, rej) => {
    dlProc = spawn(y, args, { env: { ...process.env, ...js.env } });
    let finalPath = '', err = '';
    const onLine = l => {
      const m = l.match(/\[download\]\s+([\d.]+)%(.*)$/);
      if (m && controlWin) controlWin.webContents.send('ytdlp:progress', { pct: +m[1], text: l.replace('[download]', '').trim() });
      else if (/\[(ExtractAudio|Merger|VideoConvertor|ffmpeg)\]/.test(l) && controlWin) controlWin.webContents.send('ytdlp:progress', { text: l.trim() });
      else if (l.trim() && fs.existsSync(l.trim())) finalPath = l.trim();
    };
    let buf = '';
    dlProc.stdout.on('data', d => { buf += d; const lines = buf.split(/\r?\n/); buf = lines.pop(); lines.forEach(onLine); });
    dlProc.stderr.on('data', d => (err += d));
    dlProc.on('close', c => {
      if (buf) onLine(buf);
      dlProc = null;
      if (c !== 0 || !finalPath) return rej(new Error(c === null ? 'Cancelled' : (err.split('\n').find(l => /ERROR/.test(l)) || err || 'Download failed').slice(0, 300)));
      res(fileItem(finalPath));
    });
    dlProc.on('error', rej);
  });
});

// ---------------- saved service lists (files in <userData>/lists, shareable .sclist) ----------------
const LIST_EXT = 'sclist';
const listsDir = () => { const d = path.join(USER_DIR, 'lists'); fs.mkdirSync(d, { recursive: true }); return d; };
const safeName = n => String(n || 'list').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'list';
function readList(file) {
  const o = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  if (!o || !Array.isArray(o.items)) throw new Error('This is not a Scriptorium service list');
  return o;
}
ipcMain.handle('lists:all', () => fs.readdirSync(listsDir()).filter(f => f.endsWith('.' + LIST_EXT)).map(f => {
  const p = path.join(listsDir(), f);
  try { const o = readList(p); return { file: f, name: o.name || f.slice(0, -LIST_EXT.length - 1), count: o.items.length, modified: fs.statSync(p).mtimeMs }; }
  catch { return null; }
}).filter(Boolean).sort((a, b) => b.modified - a.modified));
ipcMain.handle('lists:save', (_e, obj) => { const f = safeName(obj.name) + '.' + LIST_EXT; fs.writeFileSync(path.join(listsDir(), f), JSON.stringify(obj, null, 1), 'utf8'); return f; });
ipcMain.handle('lists:load', (_e, file) => readList(path.join(listsDir(), path.basename(file))));
ipcMain.handle('lists:delete', (_e, file) => { const p = path.join(listsDir(), path.basename(file)); if (fs.existsSync(p)) fs.unlinkSync(p); return true; });
ipcMain.handle('lists:export', async (_e, obj) => {
  const r = await dialog.showSaveDialog(controlWin, { defaultPath: path.join(app.getPath('documents'), safeName(obj.name) + '.' + LIST_EXT), filters: [{ name: 'Scriptorium service list', extensions: [LIST_EXT] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, JSON.stringify(obj, null, 1), 'utf8');
  return r.filePath;
});
ipcMain.handle('lists:import', async () => {
  const r = await dialog.showOpenDialog(controlWin, { properties: ['openFile'], filters: [{ name: 'Scriptorium service list', extensions: [LIST_EXT, 'json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const o = readList(r.filePaths[0]);
  if (!o.name) o.name = path.basename(r.filePaths[0]).replace(/\.[^.]+$/, '');
  return o;
});

// ---------------- shortcuts / about ----------------
ipcMain.handle('app:about', () => ({ version: app.getVersion(), electron: process.versions.electron, platform: `${process.platform} ${process.arch}`, userData: USER_DIR }));
ipcMain.handle('app:makeShortcuts', () => {
  const target = process.env.APPIMAGE || process.execPath;
  const args = app.isPackaged ? '' : `"${app.getAppPath()}"`;
  if (IS_WIN) {
    const ico = path.join(__dirname, 'build', 'icon.ico');
    const lnk = { target, args, icon: ico, iconIndex: 0, description: 'Scriptorium – Bible & songs', appUserModelId: 'ro.scriptorium.app', cwd: path.dirname(target) };
    const start = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Scriptorium.lnk');
    const desk = path.join(app.getPath('desktop'), 'Scriptorium.lnk');
    shell.writeShortcutLink(start, lnk); shell.writeShortcutLink(desk, lnk);
    return 'Created: Start menu + desktop. Right-click the Start menu entry → “Pin to taskbar” to pin it.';
  }
  if (IS_MAC) return 'On macOS drag Scriptorium.app into Applications, then right-click its Dock icon → Options → Keep in Dock.';
  const appsDir = path.join(os.homedir(), '.local', 'share', 'applications');
  fs.mkdirSync(appsDir, { recursive: true });
  const icon = path.join(USER_DIR, 'scriptorium.png'); fs.copyFileSync(path.join(__dirname, 'build', 'icon.png'), icon);
  const exec = `"${target}"${args ? ' ' + args : ''}`;
  fs.writeFileSync(path.join(appsDir, 'scriptorium.desktop'), `[Desktop Entry]\nType=Application\nName=Scriptorium\nComment=Bible & songs projection\nExec=${exec}\nIcon=${icon}\nCategories=AudioVideo;Office;\nTerminal=false\n`, { mode: 0o755 });
  const desk = app.getPath('desktop');
  if (fs.existsSync(desk)) fs.copyFileSync(path.join(appsDir, 'scriptorium.desktop'), path.join(desk, 'scriptorium.desktop'));
  return 'Created the app-menu entry (and a desktop launcher).';
});
