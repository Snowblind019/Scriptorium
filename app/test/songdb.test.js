// Tests for the song database merge (run: npm test). Uses copies of the shipped songs in a temp folder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { SongDB, parseSnapshot, CONFLICT_BOOK, stampFolder } = require('../songdb');

const BUNDLED = path.join(__dirname, '..', 'data', 'songs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'scr-test-'));
const copyDir = (a, b) => { fs.mkdirSync(b, { recursive: true }); for (const f of fs.readdirSync(a)) fs.copyFileSync(path.join(a, f), path.join(b, f)); return b; };

// a computer: own data folder, shared shipped songs
function computer(name, bundled = BUNDLED) {
  const root = tmp();
  const db = new SongDB({ dir: path.join(root, 'songs'), bundledDir: bundled, backupDir: path.join(root, 'backups'), appVersion: '0.5.0', hostname: name }).load();
  db.mergeBundled();
  return db;
}
const reopen = (db) => new SongDB({ dir: db.dir, bundledDir: db.bundledDir, backupDir: db.backupDir, appVersion: db.appVersion, hostname: db.hostname }).load();
const find = (db, book, number) => [...db.state.songs.values()].find(s => s.book === book && s.number === number);
const edit = (db, s, change, when) => db.apply({ songs: [{ ...s, ...change }] }, when);
// everything that matters about a database, for comparing two computers
const content = (db) => JSON.stringify({
  songs: [...db.state.songs.values()].map(s => [s.uid, s.hash]).sort(),
  gone: [...db.state.goneSongs.keys()].sort(),
  books: [...db.state.books.values()].map(b => [b.id, b.hash]).sort(),
});
const exchange = (a, b) => { const s1 = a.merge(b.exportObject(), { source: 'B' }); const s2 = b.merge(a.exportObject(), { source: 'A' }); return [s1, s2]; };

test('fresh install gets every shipped song with the same ids on every computer', () => {
  const a = computer('church'), b = computer('home');
  assert.equal(a.state.songs.size, 4550);
  assert.equal(content(a), content(b));
  assert.equal(a.booksForUi().length, 16);
  // survives a restart unchanged
  assert.equal(content(reopen(a)), content(a));
  // no backups for a first install
  assert.equal(a.listBackups().length, 0);
});

test('changes made on two computers are merged without losing anything', () => {
  const a = computer('church'), b = computer('home');
  const s1 = find(a, 'cantarile-evangheliei', 1), s2 = find(b, 'cantarile-evangheliei', 2), s3 = find(b, 'cor', 3);
  edit(a, s1, { title: 'Edited at church' }, 1000);
  edit(b, s2, { key: 'Sol' }, 1001);
  const added = a.apply({ songs: [{ book: 'altele', number: 999, title: 'New at church', sections: [{ type: 'verse', text: 'la la' }] }] }, 1002).songs[0];
  b.apply({ remove: [s3.uid] }, 1003);
  const [ra, rb] = exchange(a, b);
  assert.equal(ra.updated, 1); assert.equal(ra.deleted, 1);
  assert.equal(rb.updated, 1); assert.equal(rb.added, 1);
  assert.equal(content(a), content(b));
  assert.equal(b.state.songs.get(s1.uid).title, 'Edited at church');
  assert.equal(a.state.songs.get(s2.uid).key, 'Sol');
  assert.ok(b.state.songs.get(added.uid));
  assert.ok(!a.state.songs.get(s3.uid) && a.state.goneSongs.get(s3.uid));
  // merging again changes nothing (no extra backups either)
  const backups = a.listBackups().length;
  const [again] = exchange(a, b);
  assert.equal(again.changed, false);
  assert.equal(a.listBackups().length, backups);
  assert.equal(content(reopen(a)), content(a));
});

test('the same song changed on both computers: newer wins, the other is kept as a copy', () => {
  const a = computer('church'), b = computer('home');
  const s = find(a, 'cantarile-evangheliei', 10);
  edit(a, s, { title: 'Church version' }, 5000);
  edit(b, s, { title: 'Home version' }, 6000);   // newer
  const [ra, rb] = exchange(a, b);
  assert.equal(ra.conflicts.length, 1);
  assert.equal(rb.conflicts.length, 0);   // b simply follows a's resolution
  for (const db of [a, b]) {
    assert.equal(db.state.songs.get(s.uid).title, 'Home version');
    const copies = [...db.state.songs.values()].filter(x => x.book === CONFLICT_BOOK);
    assert.equal(copies.length, 1);
    assert.equal(copies[0].title, 'Church version');
    assert.ok(db.state.books.has(CONFLICT_BOOK));
  }
  assert.equal(content(a), content(b));
  assert.equal(exchange(a, b)[0].changed, false);
});

test('both computers resolving the same conflict at once make the same copy (no duplicates)', () => {
  const a = computer('church'), b = computer('home');
  const s = find(a, 'cor', 5);
  edit(a, s, { title: 'A' }, 100);
  edit(b, s, { title: 'B' }, 200);
  const ea = a.exportObject(), eb = b.exportObject();
  a.merge(eb, { source: 'home' }); b.merge(ea, { source: 'church' });   // simultaneous
  exchange(a, b);
  assert.equal(content(a), content(b));
  assert.equal([...a.state.songs.values()].filter(x => x.book === CONFLICT_BOOK).length, 1);
});

test('delete vs edit: the edit wins, a plain delete wins over an unchanged copy', () => {
  const a = computer('church'), b = computer('home');
  const x = find(a, 'laudele-domnului', 7), y = find(a, 'laudele-domnului', 8);
  a.apply({ remove: [x.uid, y.uid] }, 100);
  edit(b, x, { title: 'Still needed' }, 200);
  exchange(a, b);
  assert.equal(a.state.songs.get(x.uid).title, 'Still needed');
  assert.ok(!a.state.songs.has(y.uid) && !b.state.songs.has(y.uid));
  assert.equal(content(a), content(b));
});

test('a deleted book comes back only with the songs the other computer added to it', () => {
  const a = computer('church'), b = computer('home');
  a.apply({ removeBooks: ['cor'] }, 100);
  const n = b.apply({ songs: [{ book: 'cor', number: 500, title: 'New choir song', sections: [{ type: 'verse', text: 'x' }] }] }, 200).songs[0];
  exchange(a, b);
  for (const db of [a, b]) {
    const songs = [...db.state.songs.values()].filter(s => s.book === 'cor');
    assert.deepEqual(songs.map(s => s.uid), [n.uid]);
    assert.equal(db.state.books.get('cor').name, 'Cor / Orchestră');
  }
  assert.equal(content(a), content(b));
  // without new songs a deleted book stays deleted
  const c = computer('third'), d = computer('fourth');
  c.apply({ removeBooks: ['altele'] }, 100);
  exchange(c, d);
  assert.ok(!c.state.books.has('altele') && !d.state.books.has('altele'));
  assert.equal(d.booksForUi().length, 15);
});

test('moving a song to another book while it is edited elsewhere keeps both', () => {
  const a = computer('church'), b = computer('home');
  const s = find(a, 'altele', 3);
  edit(a, s, { book: 'cor' }, 100);
  edit(b, s, { title: 'Edited' }, 200);
  exchange(a, b);
  assert.equal(content(a), content(b));
  assert.equal(a.state.songs.get(s.uid).title, 'Edited');
  assert.equal([...a.state.songs.values()].filter(x => x.book === CONFLICT_BOOK).length, 1);
});

test('an update brings fixed songs, keeps local edits, and deletes what the update deleted', () => {
  const v1 = copyDir(BUNDLED, path.join(tmp(), 'v1'));
  const a = computer('church', v1);
  const s7 = find(a, 'cantarile-evangheliei', 7), s8 = find(a, 'cantarile-evangheliei', 8), s9 = find(a, 'cantarile-evangheliei', 9);
  edit(a, s8, { title: 'Local edit' }, Date.now() + 1000);
  // next release: the developer fixes 7 and 8 and deletes 9 in a copy of the shipped data
  const dev = new SongDB({ dir: path.join(tmp(), 'dev'), bundledDir: v1, backupDir: path.join(tmp(), 'b'), hostname: 'dev' }).load();
  dev.mergeBundled();
  edit(dev, s7, { title: 'Fixed typo 7' }, 1); edit(dev, s8, { title: 'Fixed typo 8' }, 1);
  dev.apply({ remove: [s9.uid] }, 1);
  const v2 = path.join(tmp(), 'v2'); fs.mkdirSync(v2);
  for (const f of fs.readdirSync(dev.dir)) fs.copyFileSync(path.join(dev.dir, f), path.join(v2, f));
  // the church computer installs the update
  a.bundledDir = v2;
  const sum = a.mergeBundled();
  assert.equal(a.state.songs.get(s7.uid).title, 'Fixed typo 7');
  assert.equal(a.state.songs.get(s8.uid).title, 'Local edit');        // newer local edit wins …
  assert.equal(sum.conflicts.length, 1);                                // … and the release's fix is kept as a copy
  assert.ok(!a.state.songs.has(s9.uid));
  assert.ok(a.listBackups().some(b => b.reason.startsWith('before-update')));
  assert.equal(a.mergeBundled(), null);                                 // only once per release
});

test('upgrading a data folder from Scriptorium 0.4 keeps edits, additions, deletions and renames', () => {
  const root = tmp(), dir = path.join(root, 'songs');
  fs.mkdirSync(dir);
  // 0.4-style files: no ids, pretty-printed, book flagged as edited
  for (const f of fs.readdirSync(BUNDLED)) {
    const o = JSON.parse(fs.readFileSync(path.join(BUNDLED, f), 'utf8'));
    const old = { id: o.id, name: o.name, short: o.short, dataVersion: 4, songs: o.songs.map(({ uid, hash, modified, hist, ...rest }) => rest) };
    if (o.id === 'cor') { old.edited = true; old.songs[0].title = 'Edited in 0.4'; old.songs.splice(1, 1); old.songs.push({ number: 77, title: 'Added in 0.4', sections: [{ type: 'verse', text: 'abc' }] }); old.name = 'Choir'; }
    if (o.id === 'altele') { fs.writeFileSync(path.join(dir, f + '.deleted'), JSON.stringify(old)); continue; }
    fs.writeFileSync(path.join(dir, f), JSON.stringify(old, null, 1));
  }
  const db = new SongDB({ dir, bundledDir: BUNDLED, backupDir: path.join(root, 'backups'), hostname: 'old-pc' }).load();
  db.mergeBundled();
  const fresh = computer('new-pc');
  const cor = [...db.state.songs.values()].filter(s => s.book === 'cor');
  const shippedCor = [...fresh.state.songs.values()].filter(s => s.book === 'cor');
  assert.equal(cor.length, shippedCor.length);                           // one deleted, one added
  const e = cor.find(s => s.title === 'Edited in 0.4');
  assert.equal(e.uid, shippedCor.find(s => s.number === e.number).uid);  // same id as on other computers
  assert.ok(e.hist.length >= 1);
  assert.ok(cor.find(s => s.title === 'Added in 0.4'));
  assert.equal(db.state.books.get('cor').name, 'Choir');
  assert.ok(!db.state.books.has('altele') && db.state.goneBooks.has('altele'));
  // and it merges cleanly with a computer that never had 0.4
  exchange(db, fresh);
  assert.equal(content(db), content(fresh));
  assert.equal(fresh.state.books.get('cor').name, 'Choir');
  assert.ok(!fresh.state.books.has('altele'));
  assert.equal(fresh.state.songs.get(e.uid).title, 'Edited in 0.4');
});

test('an edit made in a window that had not seen a merged change keeps both versions', () => {
  const a = computer('church'), b = computer('home');
  const s = find(a, 'cor', 2);
  const windowCopy = { ...s };                     // what the window loaded
  edit(b, s, { title: 'From home' }, 100);
  a.merge(b.exportObject());                       // merge happens while the window still shows the old one
  edit(a, windowCopy, { title: 'Typed in the window' }, 200);
  assert.equal(a.state.songs.get(s.uid).title, 'Typed in the window');
  assert.ok([...a.state.songs.values()].some(x => x.book === CONFLICT_BOOK && x.title === 'From home'));
  // a second save from the same window is not a conflict
  const cur = a.booksForUi().find(b2 => b2.id === 'cor').songs.find(x => x.uid === s.uid);
  edit(a, cur, { title: 'Typed again' }, 300);
  edit(a, { ...cur, title: 'Typed again' }, { title: 'Typed a third time' }, 400);
  assert.equal([...a.state.songs.values()].filter(x => x.book === CONFLICT_BOOK).length, 1);
});

test('sync folder: computers exchange changes through a shared folder', () => {
  const folder = tmp();
  const a = computer('church'), b = computer('home');
  a.setDeviceName('Church PC'); b.setDeviceName('Home PC');
  const s = find(a, 'cor', 4);
  edit(a, s, { title: 'Sync me' }, 100);
  a.syncFolder(folder); b.syncFolder(folder); a.syncFolder(folder);
  assert.equal(b.state.songs.get(s.uid).title, 'Sync me');
  assert.equal(content(a), content(b));
  assert.equal(fs.readdirSync(folder).filter(f => f.endsWith('.scsongs')).length, 2);
  // nothing new → nothing merged, no new backups
  const n = b.listBackups().length;
  assert.equal(b.syncFolder(folder).merged.length, 0);
  assert.equal(b.listBackups().length, n);
  // a half-written file is skipped, not fatal
  fs.writeFileSync(path.join(folder, 'Scriptorium-songs-broken-abcdef.scsongs'), '{"format":"scriptorium-songs","boo');
  const r = a.syncFolder(folder);
  assert.equal(r.errors.length, 1);
  // a missing folder (USB stick not plugged in) is reported, not fatal
  assert.deepEqual(a.syncFolder(path.join(folder, 'nope')).errors, ['missing']);
});

test('restoring a backup brings the old songs back on every computer', () => {
  const a = computer('church'), b = computer('home');
  const s = find(a, 'cor', 6);
  const file = a.backup('manual');
  edit(a, s, { title: 'Oops' }, Date.now());
  a.apply({ removeBooks: ['imnurile-harului'] }, Date.now());
  exchange(a, b);
  assert.equal(b.state.songs.get(s.uid).title, 'Oops');
  a.restore(file);
  assert.equal(a.state.songs.get(s.uid).title, s.title);
  assert.ok(a.state.books.has('imnurile-harului'));
  exchange(a, b);
  assert.equal(b.state.songs.get(s.uid).title, s.title);
  assert.ok(b.state.books.has('imnurile-harului'));
  assert.equal(content(a), content(b));
});

test('hostile or broken files are rejected or cleaned, never trusted', () => {
  assert.throws(() => parseSnapshot(null));
  assert.throws(() => parseSnapshot({ format: 'other', books: [] }));
  const evil = JSON.parse(`{"format":"scriptorium-songs","books":[
    {"id":"../../etc","name":"<img src=x onerror=alert(1)>","__proto__":{"polluted":1},"songs":[
      {"uid":"ok1","number":"12abc","title":${JSON.stringify('x'.repeat(5000))},"sections":[{"type":"<script>","text":"hi"},{"text":null},"bad"],"evil":"drop me","hist":["zz",123,"deadbeefdeadbeef"]},
      {"uid":"../bad id","title":"no"},
      {"uid":"__proto__","title":"proto"}]},
    {"id":"","songs":[]}, {"id":"constructor","songs":"nope"}],
    "deleted":{"songs":[{"uid":"ok1"},{"uid":"gone1","hist":["not hex"]}],"books":"x"}}`);
  const { state } = parseSnapshot(evil);
  assert.equal({}.polluted, undefined);
  assert.ok(!state.books.has('../../etc'));
  const id = [...state.books.keys()][0];
  assert.match(id, /^[a-z0-9\-_]+$/);
  const s = state.songs.get('ok1');
  assert.equal(s.number, 0);
  assert.equal(s.title.length, 1000);
  assert.deepEqual(s.sections, [{ type: 'verse', text: 'hi' }]);
  assert.equal(s.evil, undefined);
  assert.deepEqual(s.hist, ['deadbeefdeadbeef']);
  assert.ok(!state.songs.has('../bad id'));
  assert.ok(!state.goneSongs.has('ok1'));               // a song can't be both alive and deleted
  assert.deepEqual(state.goneSongs.get('gone1').hist, []);
  // merging it into a real database doesn't break anything
  const a = computer('church');
  a.merge(evil, { source: 'evil' });
  assert.ok(a.state.songs.size > 4550);
  assert.equal(content(reopen(a)), content(a));
});

test('stamping the shipped files is stable and records hand edits as a new version', () => {
  const dir = copyDir(BUNDLED, path.join(tmp(), 'stamp'));
  assert.equal(stampFolder(dir), 0);
  const f = path.join(dir, 'cor.json');
  const txt = fs.readFileSync(f, 'utf8').replace('"Ce poate fi mai minunat"', '"Ce poate fi mai minunat!"');
  fs.writeFileSync(f, txt);
  assert.equal(stampFolder(dir), 1);
  const song = JSON.parse(fs.readFileSync(f, 'utf8')).songs.find(s => s.number === 1);
  assert.equal(song.title, 'Ce poate fi mai minunat!');
  assert.equal(song.hist.length, 1);
  // a computer that had the old version takes the fixed one
  const a = computer('church');
  a.bundledDir = dir;
  a.mergeBundled();
  assert.equal(find(a, 'cor', 1).title, 'Ce poate fi mai minunat!');
});

test('backups are gzip exports that can be read back', () => {
  const a = computer('church');
  const name = a.backup('manual');
  const o = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(a.backupDir, name))).toString());
  assert.equal(parseSnapshot(o).state.songs.size, 4550);
  for (let i = 0; i < 35; i++) a.backup('x' + i);
  assert.equal(a.listBackups().length, 30);
});

test('changing something back (A → B → A) still reaches the other computer', () => {
  const a = computer('church'), b = computer('home');
  const s = find(a, 'cor', 9), original = s.title;
  edit(a, s, { title: 'Temporary' }, 100);
  exchange(a, b);
  edit(a, a.state.songs.get(s.uid), { title: original }, 200);
  exchange(a, b);
  assert.equal(b.state.songs.get(s.uid).title, original);
  assert.equal(content(a), content(b));
});

test('three computers, random edits and merges in random order: all converge, no edit is lost', () => {
  let seed = +process.env.SONGDB_SEED || 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const pcs = [computer('pc1'), computer('pc2'), computer('pc3')];
  const pool = [...pcs[0].state.songs.values()].filter(s => s.book === 'cor' || s.book === 'imnurile-harului').map(s => s.uid);
  let clock = 1000;
  const edits = [];   // [uid, rev] of every edit made – each must survive somewhere
  const old = [];
  for (let round = 0; round < 12; round++) {
    for (let k = 0; k < 9; k++) {
      const i = rnd(3), db = pcs[i], uid = pool[rnd(pool.length)], cur = db.state.songs.get(uid), op = rnd(10);
      clock += 1 + rnd(5);
      if (op < 4 && cur) { const r = edit(db, cur, { title: `r${round}-pc${i}-${k}` }, clock).songs[0]; edits.push([uid, r.rev]); }
      else if (op < 6 && cur) { const r = edit(db, cur, { title: ['A', 'B'][rnd(2)] }, clock).songs[0]; edits.push([uid, r.rev]); }   // back and forth between two titles
      else if (op < 8 && cur) db.apply({ remove: [uid] }, clock);
      else { const r = db.apply({ songs: [{ book: 'cor', number: 900 + rnd(50), title: `new-${round}-${i}-${k}`, sections: [{ type: 'verse', text: 'x' }] }] }, clock).songs[0]; pool.push(r.uid); }
    }
    for (let m = 0; m < 3; m++) { const x = rnd(3), y = (x + 1 + rnd(2)) % 3; pcs[x].merge(pcs[y].exportObject(), { source: 'pc' + y }); }
    old.push(pcs[rnd(3)].exportObject());                                   // a file that stays on a USB stick…
    if (round > 2) pcs[rnd(3)].merge(old[rnd(old.length)], { source: 'old file' });   // …and is merged again much later
  }
  for (let r = 0; r < 3; r++) for (const x of pcs) for (const y of pcs) if (x !== y) x.merge(y.exportObject());
  assert.equal(content(pcs[0]), content(pcs[1]));
  assert.equal(content(pcs[1]), content(pcs[2]));
  for (const db of pcs) assert.equal(content(reopen(db)), content(db));
  // every edit is either part of the song's history (a later edit or a delete built on it)
  // or was kept as a conflict copy – nothing silently disappears
  const st = pcs[0].state, knowsRev = (rec, rev) => !!rec && (rec.rev === rev || rec.hist.includes(rev));
  const copyId = (uid, rev) => 'x' + crypto.createHash('sha256').update(uid + ':' + rev).digest('hex').slice(0, 20);
  const lost = edits.filter(([uid, rev]) => !knowsRev(st.songs.get(uid) || st.goneSongs.get(uid), rev) && !st.songs.has(copyId(uid, rev)) && !st.goneSongs.has(copyId(uid, rev)));
  assert.ok(edits.length > 20, `only ${edits.length} edits`);
  assert.deepEqual(lost, []);
});

test('changing back, then merging an old file, still converges (no silent split)', () => {
  // needs a local (random) rev for the old version, so 20 songs make it near-certain one of them hits the bad case
  const a = computer('church'), c = computer('home');
  const songs = [...a.state.songs.values()].filter(x => x.book === 'laudele-domnului').slice(0, 20);
  for (const s of songs) edit(a, a.state.songs.get(s.uid), { title: 'X ' + s.number }, 50);
  const oldFile = a.exportObject();                                          // has every song at X
  for (const s of songs) edit(a, a.state.songs.get(s.uid), { title: 'Y ' + s.number }, 100);
  c.merge(a.exportObject());                                                 // c sees Y
  for (const s of songs) edit(a, a.state.songs.get(s.uid), { title: 'X ' + s.number }, 200);   // a changes them back to X
  a.merge(oldFile);                                                          // and merges an old file that also says X
  exchange(a, c);
  for (const s of songs) assert.equal(c.state.songs.get(s.uid).title, 'X ' + s.number);
  assert.equal(content(a), content(c));
});

test('a damaged book file is restored from its .bak, or set aside and reported', () => {
  const a = computer('church');
  edit(a, find(a, 'cor', 1), { title: 'saved twice' }, 100);   // makes cor.json.bak
  fs.writeFileSync(path.join(a.dir, 'cor.json'), '{"format":"scriptorium-book","songs":[{"uid":"x"');   // power cut
  const b = reopen(a);
  assert.deepEqual(b.damaged.map(d => [d.file, d.recovered]), [['cor.json', true]]);
  assert.equal([...b.state.songs.values()].filter(s => s.book === 'cor').length, 37);
  assert.ok(fs.readdirSync(a.dir).some(f => f.startsWith('cor.json.damaged-')));
  // no .bak: set aside, the rest still works, and the book comes back from another computer
  fs.writeFileSync(path.join(a.dir, 'altele.json'), 'garbage'); fs.rmSync(path.join(a.dir, 'altele.json.bak'), { force: true });
  const c = reopen(b);
  assert.deepEqual(c.damaged.map(d => [d.file, d.recovered]), [['altele.json', false]]);
  assert.ok(!c.state.books.has('altele'));
  c.merge(computer('home').exportObject());
  assert.equal([...c.state.songs.values()].filter(s => s.book === 'altele').length, 87);
});

test('a copied data folder on another computer gets its own id', () => {
  const a = new SongDB({ dir: path.join(tmp(), 'songs'), bundledDir: BUNDLED, backupDir: path.join(tmp(), 'b'), hostname: 'fedora', machine: 'machine-1' }).load();
  a.mergeBundled();
  const copy = path.join(tmp(), 'songs'); fs.cpSync(a.dir, copy, { recursive: true });
  const b = new SongDB({ dir: copy, bundledDir: BUNDLED, backupDir: path.join(tmp(), 'b2'), hostname: 'fedora', machine: 'machine-2' }).load();
  assert.notEqual(a.device().id, b.device().id);
  assert.equal(new SongDB({ dir: a.dir, bundledDir: BUNDLED, hostname: 'fedora', machine: 'machine-1' }).load().device().id, a.device().id);   // same computer keeps it
});

test('deleting a version that a sync had already replaced keeps the newer one as a copy', () => {
  const a = computer('church'), b = computer('home');
  const s = find(a, 'cor', 12), windowCopy = { ...s };
  edit(b, s, { title: 'Edited at home' }, 100);
  a.merge(b.exportObject());
  a.apply({ remove: [{ uid: s.uid, rev: windowCopy.rev }] });
  assert.ok(!a.state.songs.has(s.uid));
  assert.ok([...a.state.songs.values()].some(x => x.book === CONFLICT_BOOK && x.title === 'Edited at home'));
});

test('read-only (database could not be opened): nothing is changed or written', () => {
  const a = computer('church');
  a.readOnly = 'test';
  const before = content(a);
  assert.throws(() => a.apply({ remove: [find(a, 'cor', 1).uid] }), /could not be opened/);
  assert.throws(() => a.merge(computer('home').exportObject()), /could not be opened/);
  assert.deepEqual(a.syncFolder(tmp()).errors, ['read-only']);
  assert.equal(content(a), before);
});
