// Updater tests – they need Electron:  npx electron test/updater.electron.js   (Linux: a display, e.g. xvfb-run)
// GitHub is replaced by a fake, so no internet is used.
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('node:assert/strict');
const { Updater, cmpVer, assetName } = require('../updater');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const PAYLOAD = Buffer.from('pretend this is an installer '.repeat(5000));
const ASSET = 'Scriptorium-9.0.0-linux-x64.tar.gz';
const DL = `https://github.com/Snowblind019/Scriptorium/releases/download/v9.0.0/${ASSET}`;
const SUMS = 'https://github.com/Snowblind019/Scriptorium/releases/download/v9.0.0/SHA256SUMS.txt';

// a fake GitHub: routes → { status, body, url (final address after redirects) }
function fakeFetch(routes) {
  return async (url) => {
    const r = routes[url];
    if (!r) return new Response('not found', { status: 404 });
    const res = new Response(typeof r.body === 'object' && !Buffer.isBuffer(r.body) ? JSON.stringify(r.body) : r.body, { status: r.status || 200 });
    Object.defineProperty(res, 'url', { value: r.url || url });
    return res;
  };
}
const release = (version, extra = {}) => ({ tag_name: 'v' + version, name: 'Scriptorium ' + version, body: 'notes', draft: false, prerelease: false, html_url: 'https://github.com/Snowblind019/Scriptorium/releases/tag/v' + version, assets: [], ...extra });
function updater(routes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scr-upd-'));
  return new Updater({ dir, send: () => {}, fetch: fakeFetch(routes) });
}
// what check() leaves behind for a folder install of 9.0.0
const prepared = (u, { digest = sha(PAYLOAD), sums = null, size = PAYLOAD.length } = {}) => {
  u.latest = { version: '9.0.0', kind: 'folder', page: 'https://github.com/Snowblind019/Scriptorium/releases',
    asset: { name: ASSET, size, browser_download_url: DL, ...(digest ? { digest: 'sha256:' + digest } : {}) },
    sums: sums ? { name: 'SHA256SUMS.txt', size: sums.length, browser_download_url: SUMS } : null };
  return u;
};

test('version comparison', () => {
  assert.ok(cmpVer('0.5.1', '0.5.0') > 0);
  assert.ok(cmpVer('0.10.0', '0.9.9') > 0);
  assert.ok(cmpVer('v1.0.0', '1.0.0-beta.2') > 0);
  assert.equal(cmpVer('0.5.0', 'v0.5.0'), 0);
  assert.ok(cmpVer('0.4.5', '0.5.0') < 0);
  assert.equal(cmpVer('garbage', '0.5.0'), 0);
});

test('installer names match what the release workflow builds', () => {
  assert.equal(assetName('nsis', '1.2.3'), 'Scriptorium-Setup-1.2.3.exe');
  assert.equal(assetName('rpm', '1.2.3'), `Scriptorium-1.2.3-linux-${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}.rpm`);
  assert.equal(assetName('folder', '1.2.3'), `Scriptorium-1.2.3-linux-${process.arch === 'arm64' ? 'arm64' : 'x64'}.tar.gz`);
  assert.match(assetName('mac', '1.2.3'), /^Scriptorium-1\.2\.3-mac-(arm64|x64)\.zip$/);
  assert.equal(assetName('dev', '1.2.3'), '');
});

const API = 'https://api.github.com/repos/Snowblind019/Scriptorium/releases/latest';
test('check: newer / same / older / pre-release / errors', async () => {
  const cur = app.getVersion();
  assert.equal((await updater({ [API]: { body: release('999.0.0') } }).check()).status, 'available');
  assert.equal((await updater({ [API]: { body: release(cur) } }).check()).status, 'none');
  assert.equal((await updater({ [API]: { body: release('0.0.1') } }).check()).status, 'none');
  await assert.rejects(updater({ [API]: { body: release('999.0.0', { prerelease: true }) } }).check(), /valid version/);
  await assert.rejects(updater({ [API]: { body: release('not-a-version') } }).check(), /valid version/);
  await assert.rejects(updater({}).check(), /No release has been published yet/);
  await assert.rejects(updater({ [API]: { status: 403, body: '{}' } }).check(), /rate limit/);
  // running from source ("dev") never installs, it only opens the download page
  const r = await updater({ [API]: { body: release('999.0.0', { assets: [{ name: 'x' }] }) } }).check();
  assert.equal(r.kind, 'dev'); assert.equal(r.canInstall, false);
});

test('download: a correct file is accepted', async () => {
  const u = prepared(updater({ [DL]: { body: PAYLOAD } }));
  await u.download();
  assert.equal(sha(fs.readFileSync(u.file.path)), sha(PAYLOAD));
});

test('download: a damaged or swapped file is refused and deleted', async () => {
  const u = prepared(updater({ [DL]: { body: Buffer.concat([PAYLOAD.subarray(0, -1), Buffer.from('X')]) } }));
  await assert.rejects(u.download(), /damaged/);
  assert.equal(u.file, null);
  assert.deepEqual(fs.readdirSync(u.dir), []);
});

test('download: checked against SHA256SUMS.txt when GitHub gives no digest', async () => {
  const sums = `${sha(PAYLOAD)}  ${ASSET}\n${'0'.repeat(64)}  other.exe\n`;
  const u = prepared(updater({ [DL]: { body: PAYLOAD }, [SUMS]: { body: sums } }), { digest: null, sums });
  await u.download();
  const bad = `${'1'.repeat(64)}  ${ASSET}\n`;
  const u2 = prepared(updater({ [DL]: { body: PAYLOAD }, [SUMS]: { body: bad } }), { digest: null, sums: bad });
  await assert.rejects(u2.download(), /damaged/);
});

test('download: the two checksums must agree', async () => {
  const sums = `${'2'.repeat(64)}  ${ASSET}\n`;
  const u = prepared(updater({ [DL]: { body: PAYLOAD }, [SUMS]: { body: sums } }), { sums });
  await assert.rejects(u.download(), /damaged/);
});

test('download: no checksums at all → not installed', async () => {
  const u = prepared(updater({ [DL]: { body: PAYLOAD } }), { digest: null });
  await assert.rejects(u.download(), /no checksums/);
});

test('download: a redirect away from GitHub is refused', async () => {
  const u = prepared(updater({ [DL]: { body: PAYLOAD, url: 'https://evil.example.com/x.tar.gz' } }));
  await assert.rejects(u.download(), /unknown address/);
});

test('download: a file larger than announced is refused', async () => {
  const u = prepared(updater({ [DL]: { body: PAYLOAD } }), { size: PAYLOAD.length - 10 });
  await assert.rejects(u.download(), /larger than announced/);
});

test('install: refuses a file that changed after it was checked', async () => {
  const u = prepared(updater({ [DL]: { body: PAYLOAD } }));
  await u.download();
  fs.appendFileSync(u.file.path, 'tampered');
  await assert.rejects(u.install(), /changed/);
});

app.whenReady().then(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log('ok -', name); }
    catch (e) { failed++; console.log('not ok -', name, '\n   ', e.message); }
  }
  console.log(`# ${tests.length - failed}/${tests.length} passed`);
  app.exit(failed ? 1 : 0);
});
