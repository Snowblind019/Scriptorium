// Updates from GitHub Releases (github.com/Snowblind019/Scriptorium).
// check() asks GitHub for the latest release; download() fetches the installer for this computer and
// checks its SHA-256 against the release's checksums; install() replaces the program and restarts it.
// The window never passes URLs or file names – it can only say "check", "download", "install".
'use strict';
const { app, net, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const REPO = 'Snowblind019/Scriptorium';
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const UA = 'Scriptorium-Updater';
const MAX_SIZE = 700 * 1048576;
const okHost = (u) => { try { const h = new URL(u).hostname; return new URL(u).protocol === 'https:' && (h === 'github.com' || h === 'api.github.com' || h.endsWith('.githubusercontent.com')); } catch { return false; } };

// ---------------------------------------------------------------- versions
function parseVer(v) {
  const m = String(v || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  return m ? { n: [+m[1], +m[2], +m[3]], pre: m[4] || '' } : null;
}
function cmpVer(a, b) {
  const A = parseVer(a), B = parseVer(b);
  if (!A || !B) return 0;
  for (let i = 0; i < 3; i++) if (A.n[i] !== B.n[i]) return A.n[i] - B.n[i];
  if (A.pre === B.pre) return 0;
  if (!A.pre) return 1;
  if (!B.pre) return -1;
  return A.pre < B.pre ? -1 : 1;
}

// ---------------------------------------------------------------- how this copy was installed
function installKind() {
  if (!app.isPackaged) return 'dev';
  if (process.platform === 'win32') return 'nsis';
  if (process.platform === 'darwin') return path.resolve(process.execPath, '../../..').endsWith('.app') ? 'mac' : 'manual';
  if (process.platform !== 'linux') return 'manual';
  try { if (spawnSync('rpm', ['-qf', process.execPath], { encoding: 'utf8', timeout: 5000 }).status === 0) return 'rpm'; } catch { /* no rpm */ }
  try {
    const dir = path.dirname(process.execPath);
    fs.accessSync(dir, fs.constants.W_OK); fs.accessSync(path.dirname(dir), fs.constants.W_OK);
    return 'folder';                          // install-linux.sh / extracted .tar.gz: we can replace it ourselves
  } catch { return 'manual'; }
}
function assetName(kind, version) {
  const a = process.arch === 'arm64' ? 'arm64' : 'x64';
  switch (kind) {
    case 'nsis': return `Scriptorium-Setup-${version}.exe`;
    case 'mac': return `Scriptorium-${version}-mac-${a}.zip`;
    case 'rpm': return `Scriptorium-${version}-linux-${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}.rpm`;
    case 'folder': return `Scriptorium-${version}-linux-${a}.tar.gz`;
    default: return '';
  }
}

// ---------------------------------------------------------------- the updater
class Updater {
  constructor({ dir, send, beforeInstall, log = () => {}, fetch = (u, o) => net.fetch(u, o) }) {
    Object.assign(this, { dir, send, beforeInstall, log, fetch });
    this.latest = null; this.file = null; this.busy = false;
  }

  async getJson(url) {
    if (!okHost(url)) throw new Error('Blocked address');
    const res = await this.fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (res.status === 403 || res.status === 429) throw new Error('GitHub is busy (rate limit) – try again later');
    if (res.status === 404) throw new Error('No release has been published yet');
    if (!res.ok) throw new Error('GitHub answered ' + res.status);
    return res.json();
  }

  // { status: 'none' | 'available', current, version, notes, date, canInstall, kind, size }
  async check() {
    const current = app.getVersion();
    const rel = await this.getJson(`https://api.github.com/repos/${REPO}/releases/latest`);
    const version = String(rel.tag_name || '').replace(/^v/i, '');
    if (!parseVer(version) || rel.draft || rel.prerelease) throw new Error('The latest release has no valid version number');
    const kind = installKind();
    const assets = Array.isArray(rel.assets) ? rel.assets : [];
    const asset = assets.find(a => a && a.name === assetName(kind, version)) || null;
    const sums = assets.find(a => a && a.name === 'SHA256SUMS.txt') || null;
    this.latest = { version, asset, sums, kind, page: okHost(rel.html_url) ? rel.html_url : RELEASES_PAGE };
    if (this.file && this.file.version !== version) this.file = null;
    return {
      status: cmpVer(version, current) > 0 ? 'available' : 'none', current, version, kind,
      notes: String(rel.body || '').slice(0, 6000), date: rel.published_at || '', name: String(rel.name || ''),
      canInstall: !!asset && kind !== 'dev' && kind !== 'manual', size: asset ? asset.size : 0,
    };
  }

  // Download the installer, check its SHA-256, keep it in <userData>/updates.
  async download() {
    const L = this.latest;
    if (!L || !L.asset) throw new Error('There is no installer for this computer in the release');
    if (this.file && this.file.version === L.version && fs.existsSync(this.file.path)) return { ok: true };
    if (this.busy) throw new Error('Already downloading');
    this.busy = true;
    try {
      const expected = await this.expectedHashes(L);
      if (!expected.length) throw new Error('The release has no checksums, so the download can\'t be verified');
      fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
      for (const f of fs.readdirSync(this.dir)) { try { fs.rmSync(path.join(this.dir, f), { recursive: true, force: true }); } catch { /* old file in use */ } }
      const dest = path.join(this.dir, path.basename(L.asset.name));
      const got = await this.fetchFile(L.asset.browser_download_url, dest + '.part', L.asset.size);
      if (!expected.every(h => h === got)) { fs.rmSync(dest + '.part', { force: true }); throw new Error('The download is damaged (checksum does not match) – please try again'); }
      fs.renameSync(dest + '.part', dest);
      this.file = { path: dest, version: L.version, sha256: got };
      return { ok: true };
    } finally { this.busy = false; }
  }
  // SHA-256 from GitHub's own asset digest and from SHA256SUMS.txt (both must agree when both exist)
  async expectedHashes(L) {
    const out = [];
    const d = String(L.asset.digest || '');
    if (/^sha256:[0-9a-f]{64}$/i.test(d)) out.push(d.slice(7).toLowerCase());
    if (L.sums && L.sums.size < 100000) {
      try {
        const res = await this.fetch(L.sums.browser_download_url, { headers: { 'User-Agent': UA } });
        if (res.ok && okHost(res.url || L.sums.browser_download_url)) {
          for (const line of (await res.text()).split(/\r?\n/)) {
            const m = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
            if (m && m[2].trim() === L.asset.name) out.push(m[1].toLowerCase());
          }
        }
      } catch (e) { this.log('SHA256SUMS: ' + e.message); }
    }
    return [...new Set(out)].length > 1 ? ['mismatch-between-checksums'] : [...new Set(out)];
  }
  async fetchFile(url, dest, size) {
    if (!okHost(url)) throw new Error('Blocked address');
    const res = await this.fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/octet-stream' } });
    if (!res.ok) throw new Error('Download failed: HTTP ' + res.status);
    if (res.url && !okHost(res.url)) throw new Error('Download was redirected to an unknown address');
    const total = +res.headers.get('content-length') || size || 0;
    if (total > MAX_SIZE) throw new Error('The download is too large');
    const hash = crypto.createHash('sha256'), out = fs.createWriteStream(dest, { mode: 0o600 });
    const reader = res.body.getReader();
    let got = 0, last = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.length;
        if (got > MAX_SIZE || (size && got > size)) throw new Error('The download is larger than announced');
        hash.update(value);
        if (!out.write(Buffer.from(value))) await new Promise(r => out.once('drain', r));
        if (Date.now() - last > 250) { last = Date.now(); this.send('update:progress', { pct: total ? got / total * 100 : null, got, total }); }
      }
    } finally { await new Promise(r => out.end(r)); }
    if (size && got !== size) throw new Error('The download is incomplete – please try again');
    this.send('update:progress', { pct: 100, got, total });
    return hash.digest('hex');
  }

  // Replace the program and restart. The song database is backed up first (beforeInstall).
  async install() {
    const L = this.latest, F = this.file;
    if (!L || !F || !fs.existsSync(F.path)) throw new Error('Download the update first');
    if (this.beforeInstall) await this.beforeInstall(L.version);
    // check again right before running it
    const h = crypto.createHash('sha256').update(fs.readFileSync(F.path)).digest('hex');
    if (h !== F.sha256) throw new Error('The downloaded file changed – download it again');
    const kind = L.kind;
    if (kind === 'nsis') {
      // silent install over the existing one (same folder), then start the new version
      spawn(F.path, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
      setTimeout(() => app.quit(), 200);
      return { restarting: true };
    }
    if (kind === 'mac') return this.installMac(F.path);
    if (kind === 'folder') return this.installFolder(F.path);
    if (kind === 'rpm') return this.installRpm(F.path, F.sha256);
    shell.openExternal(L.page);
    return { manual: true };
  }

  async installMac(zip) {
    const cur = path.resolve(process.execPath, '../../..');           // …/Scriptorium.app
    if (!cur.endsWith('.app')) throw new Error('Scriptorium is not running from an .app');
    if (cur.startsWith('/Volumes/')) throw new Error('Drag Scriptorium into the Applications folder first, then start it from there');
    try { fs.accessSync(path.dirname(cur), fs.constants.W_OK); fs.accessSync(cur, fs.constants.W_OK); }
    catch { shell.showItemInFolder(zip); throw new Error('No permission to replace ' + cur + '. The new version was downloaded – open it and drag it into Applications.'); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptorium-update-'));
    await run('/usr/bin/ditto', ['-x', '-k', zip, tmp]);
    const app2 = path.join(tmp, 'Scriptorium.app');
    if (!fs.existsSync(path.join(app2, 'Contents', 'MacOS'))) throw new Error('The update has an unexpected layout');
    // after we quit: swap the .app (rolling back if anything fails), clear quarantine, start it
    const script = `pid="$1"; app="$2"; new="$3"; tmp="$4"
i=0; while kill -0 "$pid" 2>/dev/null && [ $i -lt 240 ]; do sleep 0.5; i=$((i+1)); done
rm -rf "$app.update-old"
if mv "$app" "$app.update-old" && /usr/bin/ditto "$new" "$app"; then rm -rf "$app.update-old"; elif [ -d "$app.update-old" ]; then rm -rf "$app"; mv "$app.update-old" "$app"; fi
/usr/bin/xattr -dr com.apple.quarantine "$app" 2>/dev/null
/usr/bin/open "$app"
rm -rf "$tmp"`;
    spawn('/bin/sh', ['-c', script, 'sh', String(process.pid), cur, app2, tmp], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 200);
    return { restarting: true };
  }

  async installFolder(tgz) {
    const dir = path.dirname(process.execPath), exe = path.basename(process.execPath);
    const stage = dir + '.update-new';
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stage, { recursive: true });
    await run('tar', ['-xzf', tgz, '-C', stage, '--no-same-owner']);
    // the archive holds one folder with the program in it
    const top = fs.readdirSync(stage).map(n => path.join(stage, n)).find(p => fs.existsSync(path.join(p, exe))) || (fs.existsSync(path.join(stage, exe)) ? stage : null);
    if (!top) { fs.rmSync(stage, { recursive: true, force: true }); throw new Error('The update has an unexpected layout'); }
    const script = `pid="$1"; dir="$2"; new="$3"; exe="$4"; stage="$5"
i=0; while kill -0 "$pid" 2>/dev/null && [ $i -lt 240 ]; do sleep 0.5; i=$((i+1)); done
rm -rf "$dir.update-old"
if mv "$dir" "$dir.update-old" && mv "$new" "$dir"; then rm -rf "$dir.update-old"; elif [ -d "$dir.update-old" ]; then rm -rf "$dir"; mv "$dir.update-old" "$dir"; fi
rm -rf "$stage"
cd "$HOME" && nohup "$dir/$exe" >/dev/null 2>&1 &`;
    spawn('/bin/sh', ['-c', script, 'sh', String(process.pid), dir, top, exe, stage], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 200);
    return { restarting: true };
  }

  async installRpm(rpm, sha256) {
    // pkexec shows the system password prompt. As root: copy the file into a new folder only root can
    // write, check its SHA-256 there (so nothing can swap it while the password is typed), then upgrade.
    const script = `set -e
d=$(mktemp -d /tmp/scriptorium-update.XXXXXX)
trap 'rm -rf "$d"' EXIT
cp -- "$1" "$d/update.rpm"
echo "$2  $d/update.rpm" | sha256sum -c --quiet -
if command -v dnf >/dev/null 2>&1; then dnf install -y "$d/update.rpm"; else rpm -U "$d/update.rpm"; fi`;
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('Missing checksum');
    try { await run('pkexec', ['/bin/sh', '-c', script, 'sh', rpm, sha256]); }
    catch (e) { shell.showItemInFolder(rpm); throw new Error(`Could not install (${e.message.split('\n')[0]}). You can install it in a terminal: sudo dnf install "${rpm}"`); }
    app.relaunch(); setTimeout(() => app.exit(0), 200);
    return { restarting: true };
  }

  openPage() { shell.openExternal(this.latest && okHost(this.latest.page) ? this.latest.page : RELEASES_PAGE); }
}

function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err += d; if (err.length > 4000) err = err.slice(-4000); });
    p.on('error', rej);
    p.on('close', c => (c === 0 ? res() : rej(new Error(err.trim() || `${cmd} exited with code ${c}`))));
  });
}

module.exports = { Updater, cmpVer, parseVer, installKind, assetName, RELEASES_PAGE };
