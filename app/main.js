// Scriptorium – main process (Windows, macOS, Linux)
const { app, BrowserWindow, ipcMain, screen, dialog, shell, net, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { pathToFileURL, fileURLToPath } = require('url');
const { SongDB } = require('./songdb');
const { Updater } = require('./updater');

const DATA_DIR = path.join(__dirname, 'data');
const IS_WIN = process.platform === 'win32', IS_MAC = process.platform === 'darwin', IS_LINUX = process.platform === 'linux';
let USER_DIR, MEDIA_DIR, DL_DIR, BIN_DIR, SETTINGS_FILE;
let controlWin = null, projWin = null, lastState = null, lastMedia = null, projVisible = false;
let songDb = null, updater = null, startupReport = null;
const SELFTEST = process.env.SCRIPTORIUM_SELFTEST;
const dbg = (m) => { if (SELFTEST) fs.appendFileSync(path.join(SELFTEST, 'main.log'), new Date().toISOString() + ' ' + m + '\n'); };

const MEDIA_EXT = {
  audio: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'weba'],
  video: ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'],
};
const kindOf = (f) => { const e = path.extname(f).slice(1).toLowerCase(); return Object.keys(MEDIA_EXT).find(k => MEDIA_EXT[k].includes(e)) || null; };
const fileItem = (p) => ({ name: path.basename(p), path: p, url: pathToFileURL(p).href, kind: kindOf(p) });

// ---------------- Linux: projector placement + sandbox ----------------
if (IS_LINUX) {
  // On Wayland (Fedora's default) programs may not place their windows, so the projector window
  // could open on the wrong screen. XWayland lets us put it on the projector. SCRIPTORIUM_WAYLAND=1 keeps native Wayland.
  if (process.env.XDG_SESSION_TYPE === 'wayland' && process.env.DISPLAY && process.env.SCRIPTORIUM_WAYLAND !== '1') app.commandLine.appendSwitch('ozone-platform', 'x11');
  // Chromium sandboxes with user namespaces (Fedora, most distros) or a root-owned setuid helper.
  // Only when neither is available (e.g. a hardened kernel) is the sandbox turned off, instead of refusing to start.
  const read = f => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return null; } };
  const usernsOff = read('/proc/sys/kernel/unprivileged_userns_clone') === '0' || read('/proc/sys/user/max_user_namespaces') === '0' || read('/proc/sys/kernel/apparmor_restrict_unprivileged_userns') === '1';
  let suidOk = false;
  try { const st = fs.statSync(path.join(path.dirname(process.execPath), 'chrome-sandbox')); suidOk = st.uid === 0 && !!(st.mode & 0o4000); } catch { /* no helper */ }
  if (usernsOff && !suidOk) app.commandLine.appendSwitch('no-sandbox');
}
if (SELFTEST) app.setPath('userData', path.join(SELFTEST, 'userdata'));
app.setName('Scriptorium');
if (IS_WIN) app.setAppUserModelId('ro.scriptorium.app');
const gotLock = !!SELFTEST || app.requestSingleInstanceLock();
if (!gotLock) app.exit(0);
app.on('second-instance', () => { if (controlWin) { if (controlWin.isMinimized()) controlWin.restore(); controlWin.focus(); } });

// a stable id of this computer (not just its name: two PCs may both be called "fedora"), hashed
function machineId() {
  let raw = '';
  try {
    if (IS_LINUX) raw = ['/etc/machine-id', '/var/lib/dbus/machine-id'].map(f => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return ''; } }).find(Boolean) || '';
    else if (IS_MAC) raw = (spawnSync('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8', timeout: 5000 }).stdout || '').match(/"IOPlatformUUID" = "([^"]+)"/)?.[1] || '';
    else if (IS_WIN) raw = (spawnSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', timeout: 5000, windowsHide: true }).stdout || '').match(/MachineGuid\s+REG_SZ\s+(\S+)/)?.[1] || '';
  } catch { /* fall back to the name */ }
  return crypto.createHash('sha256').update('scriptorium|' + (raw || os.hostname())).digest('hex').slice(0, 32);
}

function initDirs() {
  USER_DIR = app.getPath('userData');
  MEDIA_DIR = path.join(USER_DIR, 'media');
  DL_DIR = path.join(MEDIA_DIR, 'downloads');
  BIN_DIR = path.join(USER_DIR, 'bin');
  SETTINGS_FILE = path.join(USER_DIR, 'settings.json');
  for (const d of [MEDIA_DIR, DL_DIR, BIN_DIR]) fs.mkdirSync(d, { recursive: true });
  // song books: change-tracked database; the songs that come with this version are merged in
  songDb = new SongDB({ dir: path.join(USER_DIR, 'songs'), bundledDir: path.join(DATA_DIR, 'songs'), backupDir: path.join(USER_DIR, 'backups'), appVersion: app.getVersion(), hostname: os.hostname(), machine: machineId(), log: dbg });
  try {
    songDb.load();
    startupReport = { bundled: songDb.mergeBundled(), damaged: songDb.damaged || [] };
  } catch (e) {
    // never lose data: nothing is written to the song folder until this is fixed
    dbg('songdb load failed ' + e.stack);
    songDb.readOnly = e.message;
    startupReport = { error: e.message };
  }
}
const readSettings = () => { try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return null; } };
function writeAtomic(file, data) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, data, 'utf8');
  try { fs.renameSync(tmp, file); } catch { fs.writeFileSync(file, data, 'utf8'); fs.rmSync(tmp, { force: true }); }   // e.g. Windows antivirus holding the file
}
function pickDisplay() {
  const s = readSettings(), displays = screen.getAllDisplays(), primary = screen.getPrimaryDisplay();
  if (s && s.projectorDisplayId != null) { const d = displays.find(d => d.id === s.projectorDisplayId); if (d) return d; }
  return displays.find(d => d.id !== primary.id) || null;
}
const webPrefs = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, spellcheck: false };

// ---------------- security: windows only ever show the program's own pages ----------------
const insideApp = (u) => {
  try {
    if (!u || !u.startsWith('file:')) return false;
    const rel = path.relative(__dirname, fileURLToPath(u));
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  } catch { return false; }
};
function lockDown(win) {
  const wc = win.webContents;
  wc.on('will-navigate', (e, url) => { if (url !== wc.getURL()) e.preventDefault(); });   // e.g. a file dropped on the window
  wc.on('will-redirect', (e) => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-attach-webview', (e) => e.preventDefault());
}
const fromApp = (e) => { try { return insideApp(e.senderFrame && e.senderFrame.url); } catch { return false; } };
const handle = (ch, fn) => ipcMain.handle(ch, (e, ...a) => { if (!fromApp(e)) throw new Error('Not allowed'); return fn(e, ...a); });
const listen = (ch, fn) => ipcMain.on(ch, (e, ...a) => { if (fromApp(e)) fn(e, ...a); });

function createControl() {
  controlWin = new BrowserWindow({ width: 1500, height: 900, minWidth: 760, minHeight: 480, title: 'Scriptorium', backgroundColor: '#121419', show: false, icon: path.join(__dirname, 'build', 'icon.png'), webPreferences: webPrefs });
  if (!IS_MAC) controlWin.removeMenu();
  lockDown(controlWin);
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
  if (!IS_MAC) projWin.removeMenu();
  lockDown(projWin);
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
const send = (ch, data) => { if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send(ch, data); };

// macOS keeps an application menu; give it the usual items (and no Reload, which would clear the screen mid-service)
function macMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' },
    { role: 'windowMenu', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] },
  ]));
}

app.whenReady().then(() => {
  if (!gotLock) return;
  // only the permissions the program uses (audio output choice, fullscreen, clipboard)
  const allowed = new Set(['media', 'speaker-selection', 'fullscreen', 'clipboard-sanitized-write', 'clipboard-read']);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => cb(allowed.has(perm) && insideApp(details.requestingUrl || wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin, details) => allowed.has(perm) && (insideApp((details && details.requestingUrl) || (wc && wc.getURL())) || String(origin || '').startsWith('file:')));
  if (IS_MAC) macMenu();
  initDirs();
  updater = new Updater({ dir: path.join(USER_DIR, 'updates'), send, log: dbg, beforeInstall: async (v) => { try { songDb.backup('before-update-' + v); } catch (e) { dbg('backup ' + e.message); } } });
  createControl();
  createProjector();
  const s = readSettings();
  if (pickDisplay() && s && s.projectorOnStartup === true) projWin.once('ready-to-show', () => showProjector(true));
  if (SELFTEST) require('./selftest')(() => ({ controlWin, projWin, songDb, updater }), SELFTEST).then(() => app.quit());
  screen.on('display-added', () => send('displays:changed'));
  screen.on('display-removed', () => send('displays:changed'));
  // automatic update check, a few seconds after start (needs internet; quietly skipped without it)
  if (!SELFTEST) setTimeout(autoCheckUpdate, 6000);
  setTimeout(() => runSync('start'), SELFTEST ? 0 : 4000);
  setInterval(() => runSync('timer'), 3 * 60 * 1000);
});
app.on('window-all-closed', () => app.quit());
let quitSynced = false;
app.on('before-quit', () => { if (!quitSynced) { quitSynced = true; try { runSync('quit'); } catch { /* never block quitting */ } } });

// ---------------- projector ----------------
listen('proj:state', (_e, st) => { lastState = st; if (projWin) projWin.webContents.send('proj:state', st); });
handle('proj:show', (_e, show) => { showProjector(!!show); return projVisible; });
handle('proj:visible', () => projVisible);
handle('proj:applyDisplay', () => { if (projVisible) showProjector(true); return true; });
handle('displays:list', () => {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((d, i) => ({ id: d.id, label: `Display ${i + 1}${d.id === primary.id ? ' (main)' : ''} – ${d.bounds.width}×${d.bounds.height}` }));
});
listen('media:cmd', (_e, cmd) => { if (!cmd || typeof cmd !== 'object') return; if (cmd.op === 'load') lastMedia = cmd; if (cmd.op === 'unload') lastMedia = null; if (projWin) projWin.webContents.send('media:cmd', cmd); });
listen('media:status', (_e, st) => send('media:status', st));

// ---------------- settings / data ----------------
handle('settings:load', () => readSettings());
handle('settings:save', (_e, s) => { if (s && typeof s === 'object') writeAtomic(SETTINGS_FILE, JSON.stringify(s, null, 1)); return true; });
handle('bible:load', (_e, id) => fs.readFileSync(path.join(DATA_DIR, 'bibles', String(id).toLowerCase().replace(/[^a-z]/g, '') + '.json'), 'utf8'));

// ---------------- songs (database with merge support – see songdb.js) ----------------
handle('songs:loadAll', () => songDb.booksForUi());
handle('songs:startupReport', () => { const r = startupReport; startupReport = null; return r; });
handle('songs:apply', (_e, ops) => { const r = songDb.apply(ops && typeof ops === 'object' ? ops : {}); scheduleSync(); return r; });
handle('songs:openFolder', () => shell.openPath(songDb.dir));
handle('songs:status', () => ({ ...songDb.status(), folder: syncFolder(), backups: songDb.listBackups().slice(0, 30) }));
handle('songs:setDeviceName', (_e, n) => { const d = songDb.setDeviceName(n); scheduleSync(); return d; });
handle('songs:export', async () => {
  const d = new Date().toISOString().slice(0, 10), safe = songDb.device().name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Scriptorium';
  const r = await dialog.showSaveDialog(controlWin, { defaultPath: path.join(app.getPath('documents'), `Songs ${safe} ${d}.scsongs`), filters: [{ name: 'Scriptorium songs', extensions: ['scsongs'] }] });
  if (r.canceled || !r.filePath) return null;
  writeAtomic(r.filePath, JSON.stringify(songDb.exportObject()));
  return r.filePath;
});
handle('songs:mergeFile', async () => {
  const r = await dialog.showOpenDialog(controlWin, { properties: ['openFile'], filters: [{ name: 'Scriptorium songs', extensions: ['scsongs', 'json', 'gz'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const f = r.filePaths[0];
  if (fs.statSync(f).size > 200 * 1048576) throw new Error('File too large');
  let buf = fs.readFileSync(f);
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = require('zlib').gunzipSync(buf, { maxOutputLength: 400 * 1048576 });
  const sum = songDb.merge(JSON.parse(buf.toString('utf8').replace(/^﻿/, '')), { backupReason: 'before-merge' });
  scheduleSync();
  return sum;
});
handle('songs:pickSyncFolder', async () => {
  const r = await dialog.showOpenDialog(controlWin, { properties: ['openDirectory', 'createDirectory'], title: 'Sync folder (e.g. in OneDrive, Google Drive, Dropbox or on a USB stick)' });
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
});
handle('songs:syncNow', () => runSync('manual'));
handle('songs:backupNow', () => songDb.backup('manual'));
handle('songs:restore', (_e, file) => { const r = songDb.restore(file); scheduleSync(); return r; });
handle('songs:openBackups', () => { fs.mkdirSync(songDb.backupDir, { recursive: true }); return shell.openPath(songDb.backupDir); });

// sync folder: written after edits, read at start, every few minutes and when closing
const syncFolder = () => { const s = readSettings(); return s && s.songSync && s.songSync.folder ? String(s.songSync.folder) : ''; };
let syncTimer = null;
function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => runSync('edit'), 8000); }
function runSync(why) {
  const folder = syncFolder();
  if (!folder || !songDb) return { skipped: true };
  let res;
  try { res = songDb.syncFolder(folder); } catch (e) { dbg('sync failed: ' + e.message); return { merged: [], errors: [e.message] }; }
  dbg(`sync (${why}): ${JSON.stringify({ merged: res.merged.length, errors: res.errors })}`);
  if (res.merged.length && why !== 'quit') send('songs:changed', { merged: res.merged.map(m => ({ source: m.source, added: m.added, updated: m.updated, deleted: m.deleted, restored: m.restored, conflicts: m.conflicts })) });
  return res;
}

// import songs from many formats (binary SQLite read here; text formats are parsed in the window)
function readText(file) {
  const buf = fs.readFileSync(file);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch { return new TextDecoder('windows-1250').decode(buf); }
}
handle('songs:import', async () => {
  const r = await dialog.showOpenDialog(controlWin, { properties: ['openFile', 'multiSelections'], filters: [
    { name: 'Song files', extensions: ['sps', 'sqlite', 'db', 'xml', 'csv', 'txt', 'cho', 'chordpro', 'pro', 'crd', 'json'] }, { name: 'All files', extensions: ['*'] }] });
  if (r.canceled) return [];
  const { DatabaseSync } = require('node:sqlite');
  return r.filePaths.map(file => {
    const ext = path.extname(file).slice(1).toLowerCase(), name = path.basename(file);
    if (fs.statSync(file).size > 300 * 1048576) throw new Error(name + ': file too large');
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
handle('media:pick', async (_e, kind) => {   // theme backgrounds: copied into the program folder
  const filters = kind === 'video' ? [{ name: 'Video', extensions: MEDIA_EXT.video }] : [{ name: 'Images', extensions: MEDIA_EXT.image }];
  const r = await dialog.showOpenDialog(controlWin, { properties: ['openFile', 'multiSelections'], filters });
  if (r.canceled) return [];
  return r.filePaths.map(src => {
    const name = path.basename(src);
    let dst = path.join(MEDIA_DIR, name), i = 1;
    const same = (a, b) => { try { return fs.statSync(a).size === fs.statSync(b).size && crypto.createHash('sha256').update(fs.readFileSync(a)).digest('hex') === crypto.createHash('sha256').update(fs.readFileSync(b)).digest('hex'); } catch { return false; } };
    while (fs.existsSync(dst) && !same(dst, src)) dst = path.join(MEDIA_DIR, `${path.parse(name).name}_${i++}${path.extname(name)}`);
    if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
    return { name: path.basename(dst), url: pathToFileURL(dst).href };
  });
});
handle('media:addFiles', async () => {
  const all = [...MEDIA_EXT.audio, ...MEDIA_EXT.video, ...MEDIA_EXT.image];
  const r = await dialog.showOpenDialog(controlWin, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Audio, video, images', extensions: all }] });
  return r.canceled ? [] : r.filePaths.map(fileItem).filter(x => x.kind);
});
handle('media:addFolder', async () => {
  const r = await dialog.showOpenDialog(controlWin, { properties: ['openDirectory'] });
  if (r.canceled) return [];
  const out = [];
  const walk = (d, depth) => {
    let list = []; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }   // unreadable folder → skip it
    for (const n of list) { const p = path.join(d, n.name); if (n.isDirectory() && depth < 3) walk(p, depth + 1); else if (n.isFile() && kindOf(p) && out.length < 5000) out.push(fileItem(p)); }
  };
  walk(r.filePaths[0], 0);
  return out;
});
handle('media:scanDownloads', () => fs.readdirSync(DL_DIR).map(n => path.join(DL_DIR, n)).filter(p => kindOf(p) && !/\.part$/.test(p)).map(fileItem));
handle('media:exists', (_e, paths) => (Array.isArray(paths) ? paths : []).map(p => { try { return fs.existsSync(String(p)); } catch { return false; } }));
handle('media:openFolder', () => shell.openPath(DL_DIR));

// ---------------- yt-dlp / ffmpeg ----------------
const exe = n => IS_WIN ? n + '.exe' : n;
// find a program on PATH (plus the usual Homebrew folders, which macOS doesn't give to apps)
function which(n) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  if (IS_MAC) dirs.push('/opt/homebrew/bin', '/usr/local/bin');
  const exts = IS_WIN ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').filter(Boolean) : [''];
  for (const d of dirs) {
    if (IS_WIN && !path.isAbsolute(d)) continue;   // never pick up programs from the current folder
    for (const e of exts) {
      const p = path.join(d, n + e);
      try { const st = fs.statSync(p); if (st.isFile() && (IS_WIN || (st.mode & 0o111))) return p; } catch { /* not here */ }
    }
  }
  return null;
}
const tool = n => { const p = path.join(BIN_DIR, exe(n)); return fs.existsSync(p) ? p : which(n); };
function jsRuntimeArgs() {   // YouTube needs a JavaScript runtime for yt-dlp; use deno/node if present, else Electron's own Node
  if (which('deno')) return { args: [], env: {} };
  if (which('node')) return { args: ['--js-runtimes', 'node'], env: {} };
  return { args: ['--js-runtimes', 'node:' + process.execPath], env: { ELECTRON_RUN_AS_NODE: '1' } };
}
handle('ytdlp:status', () => ({ ytdlp: tool('yt-dlp'), ffmpeg: tool('ffmpeg'), folder: DL_DIR, ffmpegSize: IS_MAC ? '~25 MB' : '~90–140 MB' }));

const DL_HOSTS = /(^|\.)(github\.com|githubusercontent\.com|evermeet\.cx)$/;
async function fetchTo(url, file, label) {
  const res = await net.fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  if (res.url && !DL_HOSTS.test(new URL(res.url).hostname)) throw new Error('Redirected to an unknown address');
  const total = +res.headers.get('content-length') || 0;
  const out = fs.createWriteStream(file);
  const reader = res.body.getReader(), hash = crypto.createHash('sha256');
  let got = 0, lastT = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value); got += value.length;
      if (!out.write(Buffer.from(value))) await new Promise(r => out.once('drain', r));
      if (Date.now() - lastT > 300) { lastT = Date.now(); send('ytdlp:progress', { pct: total ? got / total * 100 : null, text: `${label}: ${(got / 1048576).toFixed(1)} MB${total ? ' / ' + (total / 1048576).toFixed(1) + ' MB' : ''}` }); }
    }
  } finally { await new Promise(r => out.end(r)); }
  return hash.digest('hex');
}
// the release's own checksum list (yt-dlp: SHA2-256SUMS, FFmpeg-Builds: checksums.sha256)
async function expectedSum(listUrl, name) {
  const res = await net.fetch(listUrl);
  if (!res.ok) throw new Error('Could not read the checksums (HTTP ' + res.status + ')');
  for (const line of (await res.text()).split(/\r?\n/)) { const m = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i); if (m && path.basename(m[2].trim()) === name) return m[1].toLowerCase(); }
  throw new Error('No checksum for ' + name);
}
function run(cmd, args, opts = {}) {
  return new Promise((res, rej) => { const p = spawn(cmd, args, opts); let err = ''; p.stderr && p.stderr.on('data', d => (err += d)); p.on('close', c => c === 0 ? res() : rej(new Error(err || cmd + ' failed'))); p.on('error', rej); });
}
function findFile(dir, name) {
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, n.name); if (n.isDirectory()) { const r = findFile(p, name); if (r) return r; } else if (n.name === name) return p; }
  return null;
}
handle('ytdlp:install', async (_e, which_) => {
  const arch = process.arch;
  if (which_ === 'ytdlp') {
    const f = IS_WIN ? 'yt-dlp.exe' : IS_MAC ? 'yt-dlp_macos' : arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
    const base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/';
    const dst = path.join(BIN_DIR, exe('yt-dlp'));
    const want = await expectedSum(base + 'SHA2-256SUMS', f);
    const got = await fetchTo(base + f, dst + '.part', 'yt-dlp');
    if (got !== want) { fs.rmSync(dst + '.part', { force: true }); throw new Error('yt-dlp download is damaged (checksum does not match)'); }
    fs.renameSync(dst + '.part', dst);
    if (!IS_WIN) fs.chmodSync(dst, 0o755);
    return dst;
  }
  if (which_ !== 'ffmpeg') throw new Error('Unknown tool');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scr-ff-'));
  try {
    if (IS_MAC) {
      // evermeet.cx builds (Intel; run through Rosetta on Apple Silicon). ffmpeg from Homebrew is used instead if installed.
      for (const n of ['ffmpeg', 'ffprobe']) {
        const z = path.join(tmp, n + '.zip');
        await fetchTo(`https://evermeet.cx/ffmpeg/getrelease/${n === 'ffmpeg' ? '' : 'ffprobe/'}zip`, z, n);
        await run('ditto', ['-x', '-k', z, tmp]);
        fs.copyFileSync(path.join(tmp, n), path.join(BIN_DIR, n)); fs.chmodSync(path.join(BIN_DIR, n), 0o755);
      }
    } else {
      const f = IS_WIN ? 'ffmpeg-master-latest-win64-gpl.zip' : arch === 'arm64' ? 'ffmpeg-master-latest-linuxarm64-gpl.tar.xz' : 'ffmpeg-master-latest-linux64-gpl.tar.xz';
      const base = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/';
      const arc = path.join(tmp, f);
      const want = await expectedSum(base + 'checksums.sha256', f);
      const got = await fetchTo(base + f, arc, 'ffmpeg');
      if (got !== want) throw new Error('ffmpeg download is damaged (checksum does not match)');
      send('ytdlp:progress', { text: 'Unpacking ffmpeg…' });
      await run('tar', IS_WIN ? ['-xf', arc, '-C', tmp] : ['-xJf', arc, '-C', tmp]);
      for (const n of ['ffmpeg', 'ffprobe']) { const p = findFile(tmp, exe(n)); if (p) { fs.copyFileSync(p, path.join(BIN_DIR, exe(n))); if (!IS_WIN) fs.chmodSync(path.join(BIN_DIR, exe(n)), 0o755); } }
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  if (!tool('ffmpeg')) throw new Error('ffmpeg not found after download');
  return tool('ffmpeg');
});

// a pasted link is only ever passed to yt-dlp as a web address (never as an option such as --exec)
const webUrl = (u) => { const s = String(u || '').trim(); if (!/^https?:\/\/[^\s]+$/i.test(s) || s.length > 2000) throw new Error('Paste a web link (https://…)'); return s; };
handle('ytdlp:info', async (_e, url) => {
  const y = tool('yt-dlp'); if (!y) throw new Error('yt-dlp is not installed');
  const u = webUrl(url), js = jsRuntimeArgs();
  return new Promise((res, rej) => {
    const p = spawn(y, ['--ignore-config', '-J', '--no-playlist', '--no-warnings', '--no-exec', ...js.args, '--', u], { cwd: DL_DIR, env: { ...process.env, ...js.env } });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; if (out.length > 64 * 1048576) p.kill(); }); p.stderr.on('data', d => (err += d));
    p.on('close', c => {
      if (c !== 0) return rej(new Error((err.split('\n').find(l => /ERROR/.test(l)) || err).slice(0, 300)));
      try { const j = JSON.parse(out); res({ title: j.title, track: j.track, artist: j.artist || (j.artists || [])[0], creator: j.creator, uploader: j.uploader, channel: j.channel, duration: j.duration }); }
      catch (e) { rej(e); }
    });
    p.on('error', rej);
  });
});

let dlProc = null;
handle('ytdlp:cancel', () => { if (dlProc) dlProc.kill(); return true; });
const pickOne = (v, list, def) => (list.includes(String(v)) ? String(v) : def);
handle('ytdlp:download', async (_e, o) => {
  o = o && typeof o === 'object' ? o : {};
  const y = tool('yt-dlp'); if (!y) throw new Error('yt-dlp is not installed');
  if (dlProc) throw new Error('A download is already running');
  const url = webUrl(o.url), ff = tool('ffmpeg'), js = jsRuntimeArgs();
  const kind = o.kind === 'video' ? 'video' : 'audio';
  const format = kind === 'audio' ? pickOne(o.format, ['mp3', 'm4a', 'opus', 'wav', 'flac'], 'mp3') : pickOne(o.format, ['mp4', 'webm', 'mkv'], 'mp4');
  const quality = kind === 'audio' ? pickOne(o.quality, ['best', '320', '256', '192', '128'], 'best') : pickOne(o.quality, ['best', '2160', '1440', '1080', '720', '480', '360'], 'best');
  const rate = pickOne(o.rate, ['', '44100', '48000'], '');
  // the file name: no folders, and % is doubled because yt-dlp reads %(…)s as a template
  const safe = (String(o.name || 'download').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/^[.\s-]+/, '').trim().slice(0, 150) || 'download').replace(/%/g, '%%');
  const args = ['--ignore-config', '--no-playlist', '--newline', '--progress', '--no-warnings', '--no-exec', '--print', 'after_move:filepath', '-o', path.join(DL_DIR, safe + '.%(ext)s'), ...js.args];
  if (ff) args.push('--ffmpeg-location', path.dirname(ff));
  if (kind === 'audio') {
    if (ff) {
      args.push('-f', 'bestaudio/best', '-x', '--audio-format', format, '--audio-quality', quality === 'best' ? '0' : quality + 'K');
      if (rate) args.push('--postprocessor-args', 'ExtractAudio:-ar ' + rate);
    } else args.push('-f', format === 'opus' ? 'bestaudio[ext=webm]/bestaudio' : 'bestaudio[ext=m4a]/bestaudio');
  } else {
    const h = quality === 'best' ? '' : `[height<=${quality}]`;
    if (ff) {
      args.push('-f', format === 'mp4' ? `bv*${h}[ext=mp4]+ba[ext=m4a]/bv*${h}+ba/b${h}` : format === 'webm' ? `bv*${h}[ext=webm]+ba[ext=webm]/bv*${h}+ba/b${h}` : `bv*${h}+ba/b${h}`, '--merge-output-format', format);
    } else args.push('-f', `b${h}[ext=mp4]/b${h}/b`);
  }
  args.push('--', url);
  return new Promise((res, rej) => {
    dlProc = spawn(y, args, { cwd: DL_DIR, env: { ...process.env, ...js.env } });
    let finalPath = '', err = '';
    const onLine = l => {
      const m = l.match(/\[download\]\s+([\d.]+)%(.*)$/);
      if (m) send('ytdlp:progress', { pct: +m[1], text: l.replace('[download]', '').trim() });
      else if (/\[(ExtractAudio|Merger|VideoConvertor|ffmpeg)\]/.test(l)) send('ytdlp:progress', { text: l.trim() });
      else { const p = l.trim(); if (p && path.dirname(p) === DL_DIR && fs.existsSync(p)) finalPath = p; }   // only files in the download folder
    };
    let buf = '';
    dlProc.stdout.on('data', d => { buf += d; const lines = buf.split(/\r?\n/); buf = lines.pop(); lines.forEach(onLine); });
    dlProc.stderr.on('data', d => { err += d; if (err.length > 20000) err = err.slice(-20000); });
    dlProc.on('close', c => {
      if (buf) onLine(buf);
      dlProc = null;
      if (c !== 0 || !finalPath) return rej(new Error(c === null ? 'Cancelled' : (err.split('\n').find(l => /ERROR/.test(l)) || err || 'Download failed').slice(0, 300)));
      res(fileItem(finalPath));
    });
    dlProc.on('error', e => { dlProc = null; rej(e); });
  });
});

// ---------------- saved service lists (files in <userData>/lists, shareable .sclist) ----------------
const LIST_EXT = 'sclist';
const listsDir = () => { const d = path.join(USER_DIR, 'lists'); fs.mkdirSync(d, { recursive: true }); return d; };
const safeName = n => String(n || 'list').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/^[.\s]+/, '').trim().slice(0, 80) || 'list';
function readList(file) {
  if (fs.statSync(file).size > 50 * 1048576) throw new Error('File too large');
  const o = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  if (!o || typeof o !== 'object' || !Array.isArray(o.items)) throw new Error('This is not a Scriptorium service list');
  const str = (v, n = 500) => (typeof v === 'string' ? v.slice(0, n) : '');
  const int = v => (Number.isFinite(+v) ? Math.trunc(+v) : 0);
  o.items = o.items.slice(0, 2000).map(it => {
    if (!it || typeof it !== 'object') return null;
    if (it.type === 'song') {
      const out = { type: 'song', bookId: str(it.bookId, 100), bookName: str(it.bookName, 300), bookShort: str(it.bookShort, 60), number: int(it.number), title: str(it.title, 1000) };
      if (it.song && typeof it.song === 'object') out.song = { number: int(it.song.number), title: str(it.song.title, 1000), key: str(it.song.key, 100),
        sections: (Array.isArray(it.song.sections) ? it.song.sections : []).slice(0, 400).filter(x => x && typeof x === 'object').map(x => ({ type: x.type === 'chorus' ? 'chorus' : 'verse', text: str(x.text, 60000) })) };
      return out.title || out.song ? out : null;
    }
    if (it.type === 'bible' && it.ref && typeof it.ref === 'object') {
      const r = { book: int(it.ref.book), chapter: int(it.ref.chapter), from: int(it.ref.from), to: int(it.ref.to) };
      return r.book >= 0 && r.book < 66 && r.chapter > 0 && r.from > 0 && r.to >= r.from ? { type: 'bible', ref: r, label: str(it.label, 200) } : null;
    }
    if (it.type === 'media' && it.item && typeof it.item === 'object' && /^file:\/\/\//i.test(str(it.item.url, 4000)) && ['audio', 'video', 'image'].includes(it.item.kind)) {
      return { type: 'media', item: { name: str(it.item.name, 300) || 'media', path: str(it.item.path, 4000), url: str(it.item.url, 4000), kind: it.item.kind } };
    }
    return null;
  }).filter(Boolean);
  return o;
}
handle('lists:all', () => fs.readdirSync(listsDir()).filter(f => f.endsWith('.' + LIST_EXT)).map(f => {
  const p = path.join(listsDir(), f);
  try { const o = readList(p); return { file: f, name: String(o.name || f.slice(0, -LIST_EXT.length - 1)), count: o.items.length, modified: fs.statSync(p).mtimeMs }; }
  catch { return null; }
}).filter(Boolean).sort((a, b) => b.modified - a.modified));
handle('lists:save', (_e, obj) => { const f = safeName(obj && obj.name) + '.' + LIST_EXT; writeAtomic(path.join(listsDir(), f), JSON.stringify(obj, null, 1)); return f; });
handle('lists:load', (_e, file) => readList(path.join(listsDir(), path.basename(String(file)))));
handle('lists:delete', (_e, file) => { const p = path.join(listsDir(), path.basename(String(file))); if (p.endsWith('.' + LIST_EXT) && fs.existsSync(p)) fs.unlinkSync(p); return true; });
handle('lists:export', async (_e, obj) => {
  const r = await dialog.showSaveDialog(controlWin, { defaultPath: path.join(app.getPath('documents'), safeName(obj && obj.name) + '.' + LIST_EXT), filters: [{ name: 'Scriptorium service list', extensions: [LIST_EXT] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, JSON.stringify(obj, null, 1), 'utf8');
  return r.filePath;
});
handle('lists:import', async () => {
  const r = await dialog.showOpenDialog(controlWin, { properties: ['openFile'], filters: [{ name: 'Scriptorium service list', extensions: [LIST_EXT, 'json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const o = readList(r.filePaths[0]);
  if (!o.name) o.name = path.basename(r.filePaths[0]).replace(/\.[^.]+$/, '');
  return o;
});

// ---------------- updates (GitHub releases) ----------------
let lastCheck = null;
async function autoCheckUpdate() {
  const s = readSettings() || {};
  if (s.update && s.update.auto === false) return;
  try {
    lastCheck = await updater.check();
    if (lastCheck.status === 'available' && !(s.update && s.update.skip === lastCheck.version)) send('update:available', lastCheck);
  } catch (e) { dbg('update check: ' + e.message); }   // offline / GitHub unreachable → try again next start
}
handle('update:check', async () => { lastCheck = await updater.check(); return lastCheck; });
handle('update:download', () => updater.download());
handle('update:install', () => updater.install());
handle('update:openPage', () => updater.openPage());

// ---------------- shortcuts / about ----------------
handle('app:about', () => ({ version: app.getVersion(), electron: process.versions.electron, platform: `${process.platform} ${process.arch}`, userData: USER_DIR, packaged: app.isPackaged }));
handle('app:makeShortcuts', () => {
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
  const q = s => '"' + String(s).replace(/\\/g, '\\\\\\\\').replace(/(["`$])/g, '\\\\$1').replace(/%/g, '%%') + '"';   // desktop-entry Exec quoting: backslash → 4 backslashes, " ` $ → \\x, % → %%
  const exec = q(target) + (app.isPackaged ? '' : ' ' + q(app.getAppPath()));
  fs.writeFileSync(path.join(appsDir, 'scriptorium.desktop'), `[Desktop Entry]\nType=Application\nName=Scriptorium\nComment=Bible & songs projection\nExec=${exec}\nIcon=${icon}\nCategories=AudioVideo;\nTerminal=false\nStartupWMClass=Scriptorium\n`, { mode: 0o755 });
  const desk = app.getPath('desktop');
  if (fs.existsSync(desk)) fs.copyFileSync(path.join(appsDir, 'scriptorium.desktop'), path.join(desk, 'scriptorium.desktop'));
  return 'Created the app-menu entry (and a desktop launcher).';
});
