// Song database with merge support (main process; plain Node, no Electron imports).
//
// Every song has a stable id (uid). Every edit gets its own revision id (rev), and each song keeps
// the revs of its earlier versions (hist). Deleted songs and books leave a small "tombstone".
// With that, two copies of the database – from the church computer, the home computer, or the
// songs that ship with an update – can be merged song by song without losing anything:
//   • a song added on either side is kept;
//   • a song changed on one side only takes the changed version;
//   • a song deleted on one side stays deleted, unless the other side edited it in the meantime;
//   • a song changed on BOTH sides keeps the newer version, and the other version is saved as a
//     copy in the "Merge conflicts" book, so nothing is ever lost.
// Merging is idempotent (merging the same file twice changes nothing) and gives the same result in
// both directions, so computers converge whichever way the data travels.
// Revs (not content hashes) decide what is newer, so changing something back (or restoring a
// backup) is still recognised as a new edit.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const FORMAT = 'scriptorium-songs';
const BOOK_FORMAT = 'scriptorium-book';
const SYNC_FILE = '_sync.json';
const DATA_VERSION = 5;
const HIST_MAX = 80;
const CONFLICT_BOOK = 'merge-conflicts';
const CONFLICT_NAME = 'Conflicte la îmbinare / Merge conflicts';
const OPT_FIELDS = ['key', 'info', 'notes', 'words', 'music'];
const LIMITS = { books: 5000, songs: 300000, sections: 400, text: 60000, field: 4000, hist: 300 };

// ------------------------------------------------------------------ small helpers
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newUid = () => 's' + crypto.randomBytes(9).toString('base64url');
const newRev = () => 'v' + crypto.randomBytes(9).toString('base64url');
const detRev = (...parts) => 'r' + sha(parts.join('|')).slice(0, 18);   // same on every computer
const isId = (u) => typeof u === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(u);
const isRev = (r) => typeof r === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(r);
const str = (v, max = LIMITS.field) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const time = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };
const capHist = (h) => (h.length > HIST_MAX ? h.slice(h.length - HIST_MAX) : h);
const joinHist = (...lists) => capHist([...new Set(lists.flat().filter(Boolean))]);
const histOf = (v) => (Array.isArray(v) ? v.filter(isRev).slice(-LIMITS.hist) : []);
// does `rec` (live or deleted) already contain version `rev`?
const knows = (rec, rev) => !!rec && (rec.rev === rev || rec.hist.includes(rev));
// the same answer on every computer: newer edit first, then the larger rev
const newer = (a, b) => (a.modified !== b.modified ? a.modified > b.modified : a.rev > b.rev);

// book ids are also file names
function cleanBookId(id) {
  const raw = String(id ?? '').trim();
  if (!raw) return '';
  const s = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\-_]+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 80);
  return s && s !== '_sync' ? s : 'book-' + sha(raw).slice(0, 10);   // e.g. a Cyrillic name keeps a stable id
}
// songs that ship with the program get ids that are the same on every computer
const stableUid = (bookId, number, title, n) => 'b' + sha(`${bookId}|${number}|${title}|${n}`).slice(0, 15);

function writeAtomic(file, data) {
  const tmp = path.join(path.dirname(file), '.' + path.basename(file) + '.' + crypto.randomBytes(6).toString('hex') + '.tmp');
  const fd = fs.openSync(tmp, 'wx', 0o644);   // new file only – an existing name or link is never written through
  try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, file); }
  catch (e) {   // e.g. Windows antivirus holding the file for a moment
    try { fs.copyFileSync(tmp, file); } finally { fs.rmSync(tmp, { force: true }); }
    if (!fs.existsSync(file)) throw e;
  }
}

// ------------------------------------------------------------------ records
// the fields that make up a song's content (and its hash); `book` is part of it, so moving a song is an edit
function songContent(s) {
  const o = { book: s.book, number: s.number, title: s.title, sections: s.sections.map(x => [x.type, x.text]) };
  for (const k of OPT_FIELDS) if (s[k]) o[k] = s[k];
  return o;
}
const songHash = (s) => sha(JSON.stringify(songContent(s))).slice(0, 24);
const bookHash = (b) => sha(JSON.stringify([b.name, b.short, b.description])).slice(0, 24);

function cleanSections(v) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, LIMITS.sections)
    .map(x => ({ type: x && x.type === 'chorus' ? 'chorus' : 'verse', text: str(x && x.text, LIMITS.text).replace(/\r/g, '') }))
    .filter(x => x.text.trim());
}
// a song from any source → a clean record (only known fields survive)
function makeSong(raw, bookId) {
  const s = { uid: isId(raw.uid) ? raw.uid : '', book: bookId, number: num(raw.number), title: str(raw.title, 1000).trim(), sections: cleanSections(raw.sections) };
  for (const k of OPT_FIELDS) { const v = str(raw[k]).trim(); if (v) s[k] = v; }
  s.modified = time(raw.modified);
  s.rev = isRev(raw.rev) ? raw.rev : '';
  s.hist = histOf(raw.hist);
  s.hash = songHash(s);
  return s;
}
function makeBook(raw, id) {
  const b = { id, name: str(raw.name, 300).trim() || id, short: str(raw.short, 60).trim(), description: str(raw.description, 2000).trim() };
  b.modified = time(raw.modified);
  b.rev = isRev(raw.rev) ? raw.rev : '';
  b.hist = histOf(raw.hist);
  b.hash = bookHash(b);
  return b;
}
const makeGone = (raw) => ({ rev: isRev(raw.rev) ? raw.rev : detRev('gone', JSON.stringify(histOf(raw.hist))), modified: time(raw.modified), hist: histOf(raw.hist), title: str(raw.title, 300), book: raw.book ? cleanBookId(raw.book) : '', name: str(raw.name, 300), short: str(raw.short, 60) });
const tombOf = (rec, when, extra = {}) => ({ rev: newRev(), modified: when, hist: joinHist(rec.hist, [rec.rev]), title: rec.title || '', book: rec.book || '', name: rec.name || '', short: rec.short || '', ...extra });
const pubSong = (s) => { const o = { uid: s.uid, number: s.number, title: s.title, sections: s.sections }; for (const k of OPT_FIELDS) if (s[k]) o[k] = s[k]; o.modified = s.modified; o.rev = s.rev; o.hist = s.hist; return o; };
const pubGone = (g, extra) => ({ ...extra, rev: g.rev, modified: g.modified, hist: g.hist, ...(g.title ? { title: g.title } : {}), ...(g.book ? { book: g.book } : {}), ...(g.name ? { name: g.name, short: g.short } : {}) });
const pubBook = (b) => ({ id: b.id, name: b.name, short: b.short, ...(b.description ? { description: b.description } : {}), modified: b.modified, rev: b.rev, hist: b.hist });

// ------------------------------------------------------------------ state
// { books: Map id→book, songs: Map uid→song, goneBooks: Map id→tomb, goneSongs: Map uid→tomb }
const emptyState = () => ({ books: new Map(), songs: new Map(), goneBooks: new Map(), goneSongs: new Map() });
function cloneState(st) {
  const m = (map) => new Map([...map].map(([k, v]) => [k, { ...v, hist: v.hist.slice() }]));
  return { books: m(st.books), songs: m(st.songs), goneBooks: m(st.goneBooks), goneSongs: m(st.goneSongs) };
}

// parse an export (a file another computer wrote – validated, never trusted)
function parseSnapshot(o) {
  if (!o || typeof o !== 'object' || o.format !== FORMAT || !Array.isArray(o.books)) throw new Error('This is not a Scriptorium song database file');
  const st = emptyState();
  let n = 0;
  for (const rb of o.books.slice(0, LIMITS.books)) {
    if (!rb || typeof rb !== 'object') continue;
    const id = cleanBookId(rb.id); if (!id || st.books.has(id)) continue;
    const b = makeBook(rb, id); if (!b.rev) b.rev = detRev('book', id, b.hash);
    st.books.set(id, b);
    for (const rs of Array.isArray(rb.songs) ? rb.songs : []) {
      if (!rs || typeof rs !== 'object' || ++n > LIMITS.songs) continue;
      const s = makeSong(rs, id);
      if (!s.uid || st.songs.has(s.uid)) continue;   // songs without an id can't be merged safely
      if (!s.rev) s.rev = detRev(s.uid, s.hash);
      st.songs.set(s.uid, s);
    }
  }
  const d = o.deleted && typeof o.deleted === 'object' ? o.deleted : {};
  for (const g of Array.isArray(d.books) ? d.books.slice(0, LIMITS.books) : []) { const id = g && typeof g === 'object' && cleanBookId(g.id); if (id && !st.books.has(id)) st.goneBooks.set(id, makeGone(g)); }
  for (const g of Array.isArray(d.songs) ? d.songs.slice(0, LIMITS.songs) : []) { if (g && typeof g === 'object' && isId(g.uid) && !st.songs.has(g.uid)) st.goneSongs.set(g.uid, makeGone(g)); }
  const dev = o.device && typeof o.device === 'object' ? o.device : {};
  return { state: st, device: { id: str(dev.id, 64), name: str(dev.name, 120) }, exported: time(o.exported) };
}

function snapshotOf(st, device) {
  const byBook = new Map([...st.books.keys()].map(id => [id, []]));
  for (const s of st.songs.values()) (byBook.get(s.book) || byBook.set(s.book, []).get(s.book)).push(s);
  const books = [...byBook.entries()].map(([id, songs]) => {
    const b = st.books.get(id) || { ...makeBook({ name: id }, id), rev: detRev('book', id) };
    songs.sort((a, c) => a.number - c.number || a.title.localeCompare(c.title));
    return { ...pubBook(b), songs: songs.map(pubSong) };
  });
  return {
    format: FORMAT, version: 1, device: device || { id: '', name: '' }, exported: Date.now(), books,
    deleted: { books: [...st.goneBooks.entries()].map(([id, g]) => pubGone(g, { id })), songs: [...st.goneSongs.entries()].map(([uid, g]) => pubGone(g, { uid })) },
  };
}

// ------------------------------------------------------------------ merge
const conflictUid = (uid, rev) => 'x' + sha(uid + ':' + rev).slice(0, 20);
// the other version of a song changed on two computers; built only from the song itself, so two
// computers that resolve the same conflict make the very same copy (no duplicates)
function conflictCopy(loser, cu, fromBook) {
  const label = `⚠ ${fromBook ? fromBook.short || fromBook.name : loser.book} ${loser.number}` + (loser.modified ? ` · ${new Date(loser.modified).toISOString().slice(0, 10)}` : '');
  const c = { ...loser, uid: cu, book: CONFLICT_BOOK, info: (loser.info ? label + ' · ' + loser.info : label).slice(0, LIMITS.field), hist: [], rev: detRev('copy', cu) };
  c.hash = songHash(c);
  return c;
}
const conflictBook = (when) => ({ ...makeBook({ name: CONFLICT_NAME, short: 'Conflicte', modified: when }, CONFLICT_BOOK), rev: detRev('book', CONFLICT_BOOK) });

// how two versions of the same record relate
// (history first: a newer version that happens to have old content – changed back – must still win)
function relate(L, R) {
  if (L.rev === R.rev) return 'same';
  if (knows(L, R.rev)) return 'keep';             // we already have this change
  if (knows(R, L.rev)) return 'take';             // the other side built on our version
  if (L.hash === R.hash) return 'equal';          // the same content reached separately
  return 'conflict';
}
// two records with equal content but different revs → one agreed rev (same choice on every computer).
// If one already contains the other, that one is the newer and wins.
function unify(L, R) {
  const [hi, lo] = knows(L, R.rev) ? [L, R] : knows(R, L.rev) ? [R, L] : L.rev > R.rev ? [L, R] : [R, L];
  return { ...L, rev: hi.rev, modified: Math.max(L.modified, R.modified), hist: joinHist(L.hist, R.hist, [lo.rev]).filter(r => r !== hi.rev) };
}

// Merge `remote` into `local` (both states). Mutates `local`. Returns a summary.
function mergeStates(local, remote, opts = {}) {
  const sum = { source: opts.source || '', added: 0, updated: 0, deleted: 0, restored: 0, booksAdded: 0, booksChanged: 0, booksDeleted: 0, conflicts: [], changed: false };
  const touched = new Set();
  const when = opts.when || Date.now();
  const histChanged = (a, b) => a.length !== b.length || a.some((x, i) => x !== b[i]);

  // ---- books (name / short name / description)
  for (const id of new Set([...remote.books.keys(), ...remote.goneBooks.keys()])) {
    const L = local.books.get(id), Lg = local.goneBooks.get(id), R = remote.books.get(id), Rg = remote.goneBooks.get(id);
    if (R) {
      if (L) {
        const rel = relate(L, R);
        if (rel === 'same') { const h = joinHist(L.hist, R.hist); if (histChanged(h, L.hist)) { L.hist = h; touched.add(id); } }
        else if (rel === 'equal') { local.books.set(id, unify(L, R)); touched.add(id); }
        else if (rel === 'take' || (rel === 'conflict' && newer(R, L))) { local.books.set(id, { ...R, hist: joinHist(L.hist, R.hist, [L.rev]).filter(r => r !== R.rev) }); sum.booksChanged++; touched.add(id); }
        else if (rel === 'conflict') { L.hist = joinHist(L.hist, R.hist, [R.rev]); touched.add(id); }   // ours is newer; remember theirs
      } else if (Lg && knows(Lg, R.rev)) {
        const h = joinHist(Lg.hist, R.hist); if (histChanged(h, Lg.hist)) { Lg.hist = h; sum.changed = true; }   // deleted here after that version
      } else {
        local.books.set(id, { ...R, hist: joinHist(Lg ? [...Lg.hist, Lg.rev] : [], R.hist).filter(r => r !== R.rev) }); local.goneBooks.delete(id);
        sum.booksAdded++; touched.add(id);
      }
    } else if (Rg) {
      if (L) {
        if (knows(Rg, L.rev)) { local.goneBooks.set(id, { ...Rg, hist: joinHist(L.hist, Rg.hist, [L.rev]), name: L.name, short: L.short }); local.books.delete(id); sum.booksDeleted++; touched.add(id); }
      } else if (Lg) {
        if (Lg.rev !== Rg.rev) { const u = unify(Lg, Rg); if (u.rev !== Lg.rev || histChanged(u.hist, Lg.hist)) { local.goneBooks.set(id, u); sum.changed = true; } }
      } else { local.goneBooks.set(id, { ...Rg }); sum.changed = true; }
    }
  }

  // ---- songs
  const copies = [];
  for (const uid of new Set([...remote.songs.keys(), ...remote.goneSongs.keys()])) {
    const L = local.songs.get(uid), Lg = local.goneSongs.get(uid), R = remote.songs.get(uid), Rg = remote.goneSongs.get(uid);
    if (R) {
      if (L) {
        const rel = relate(L, R);
        if (rel === 'same') { const h = joinHist(L.hist, R.hist); if (histChanged(h, L.hist)) { L.hist = h; touched.add(L.book); } continue; }
        if (rel === 'equal') { local.songs.set(uid, unify(L, R)); touched.add(L.book); continue; }
        if (rel === 'keep') continue;
        if (rel === 'take') { local.songs.set(uid, { ...R, hist: joinHist(L.hist, R.hist, [L.rev]).filter(r => r !== R.rev) }); sum.updated++; touched.add(L.book); touched.add(R.book); continue; }
        // edited on both sides → the newer edit wins, the other is kept as a conflict copy
        const rWins = newer(R, L), winner = rWins ? R : L, loser = rWins ? L : R;
        sum.conflicts.push({ uid, title: winner.title, number: winner.number, book: winner.book, otherTitle: loser.title, kept: rWins ? 'remote' : 'local', copyUid: conflictUid(uid, loser.rev) });
        copies.push(loser);
        local.songs.set(uid, { ...winner, hist: joinHist(L.hist, R.hist, [loser.rev]).filter(r => r !== winner.rev) });
        touched.add(L.book); touched.add(R.book);
      } else if (Lg) {
        if (knows(Lg, R.rev)) { const h = joinHist(Lg.hist, R.hist); if (histChanged(h, Lg.hist)) { Lg.hist = h; sum.changed = true; } continue; }   // deleted here after that version
        local.songs.set(uid, { ...R, hist: joinHist(Lg.hist, [Lg.rev], R.hist).filter(r => r !== R.rev) }); local.goneSongs.delete(uid);
        sum.restored++; touched.add(R.book);                        // changed there after we deleted it → keep the edit
      } else { local.songs.set(uid, { ...R }); sum.added++; touched.add(R.book); }
    } else if (Rg) {
      if (L) {
        if (knows(Rg, L.rev)) {                                     // they deleted the version we have
          local.goneSongs.set(uid, { ...Rg, hist: joinHist(L.hist, Rg.hist, [L.rev]), title: L.title, book: L.book });
          local.songs.delete(uid); sum.deleted++; touched.add(L.book);
        }                                                           // else: we edited it since → keep ours
      } else if (Lg) {
        if (Lg.rev !== Rg.rev) { const u = unify(Lg, Rg); if (u.rev !== Lg.rev || histChanged(u.hist, Lg.hist)) { local.goneSongs.set(uid, u); sum.changed = true; } }
      } else { local.goneSongs.set(uid, { ...Rg }); sum.changed = true; }
    }
  }
  for (const loser of copies) {
    const cu = conflictUid(loser.uid, loser.rev);
    if (local.songs.has(cu) || local.goneSongs.has(cu)) continue;   // already copied (or the copy was reviewed and deleted)
    local.songs.set(cu, conflictCopy(loser, cu, local.books.get(loser.book) || remote.books.get(loser.book)));
    touched.add(CONFLICT_BOOK);
  }
  // every live song needs a live book (a book deleted on one side comes back if the other side still uses it)
  for (const s of local.songs.values()) {
    if (local.books.has(s.book)) continue;
    const g = local.goneBooks.get(s.book) || remote.goneBooks.get(s.book);
    const b = s.book === CONFLICT_BOOK ? conflictBook(when)
      : { ...makeBook({ name: (g && g.name) || s.book, short: g && g.short, modified: when }, s.book), rev: detRev('back', s.book, g ? g.rev : ''), hist: g ? joinHist(g.hist, [g.rev]) : [] };
    local.books.set(s.book, b); local.goneBooks.delete(s.book); touched.add(s.book);
  }
  sum.changed = sum.changed || touched.size > 0;
  sum.touchedBooks = [...touched];
  return sum;
}

// ------------------------------------------------------------------ files on disk
function readBookFile(file) {
  const o = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  if (!o || typeof o !== 'object' || !Array.isArray(o.songs)) throw new Error('not a song book');
  return o;
}
// A folder of <book>.json files (+ optional _sync.json with tombstones) → state.
// assignUids: shipped songs without an id get a stable one. A song whose content no longer matches
// its stored hash was edited by hand → it becomes a new version (the same one on every computer).
function readFolder(dir, { assignUids = false } = {}) {
  const st = emptyState(), legacy = [];
  let names = [];
  try { names = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== SYNC_FILE && !f.startsWith('.')); } catch { return { state: st, legacy, sync: null }; }
  const damaged = [];
  for (const f of names.sort()) {
    const file = path.join(dir, f);
    let o;
    try { o = readBookFile(file); }
    catch (e) {
      try { o = readBookFile(file + '.bak'); damaged.push({ file: f, recovered: true }); }
      catch { damaged.push({ file: f, recovered: false, error: e.message }); continue; }
    }
    const id = cleanBookId(o.id || f.slice(0, -5)); if (!id || st.books.has(id)) continue;
    const mtime = Math.round(fs.statSync(file).mtimeMs);
    const b = makeBook(o, id);
    if (!b.modified) b.modified = mtime;
    if (!b.rev) b.rev = detRev('book', id, b.hash);
    st.books.set(id, b);
    const occ = new Map();
    let old = false;
    for (const raw of o.songs) {
      if (!raw || typeof raw !== 'object') continue;
      const s = makeSong(raw, id);
      if (!s.modified) s.modified = mtime;
      if (!s.uid) {
        old = true;
        if (!assignUids) { legacy.push({ song: s, mtime }); continue; }
        const k = s.number + '|' + s.title, n = (occ.get(k) || 0) + 1; occ.set(k, n);
        s.uid = stableUid(id, s.number, s.title, n);
      }
      if (st.songs.has(s.uid)) s.uid = newUid();
      if (!s.rev) s.rev = detRev(s.uid, s.hash);
      else if (typeof raw.hash === 'string' && raw.hash !== s.hash) { s.hist = joinHist(s.hist, [s.rev]); s.rev = detRev(s.rev, s.hash); s.modified = mtime; }
      st.songs.set(s.uid, s);
    }
    if (old) legacy.push({ book: id, mtime });
  }
  let sync = null;
  try { sync = JSON.parse(fs.readFileSync(path.join(dir, SYNC_FILE), 'utf8')); } catch { /* none yet */ }
  const d = (sync && sync.deleted) || {};
  for (const g of Array.isArray(d.books) ? d.books : []) { const id = g && cleanBookId(g.id); if (id && !st.books.has(id)) st.goneBooks.set(id, makeGone(g)); }
  for (const g of Array.isArray(d.songs) ? d.songs : []) { if (g && isId(g.uid) && !st.songs.has(g.uid)) st.goneSongs.set(g.uid, makeGone(g)); }
  return { state: st, legacy, sync, damaged };
}

function bookFileData(st, id) {
  const b = st.books.get(id);
  const songs = [...st.songs.values()].filter(s => s.book === id).sort((a, c) => a.number - c.number || a.title.localeCompare(c.title));
  return { format: BOOK_FORMAT, dataVersion: DATA_VERSION, ...pubBook(b), songs: songs.map(s => ({ ...pubSong(s), hash: s.hash })) };
}
// one song per line keeps git diffs of the song files readable
function formatBookFile(o) {
  const { songs, ...head } = o;
  return JSON.stringify(head).slice(0, -1) + ',"songs":[\n' + songs.map(s => JSON.stringify(s)).join(',\n') + '\n]}\n';
}

// ------------------------------------------------------------------ the database
class SongDB {
  // dir: <userData>/songs · bundledDir: songs that ship with the program · backupDir: <userData>/backups
  // machine: a fingerprint of this computer (so a copied data folder or two PCs with the same name get their own ids)
  constructor({ dir, bundledDir, backupDir, appVersion = '', hostname = '', machine = '', log = () => {} }) {
    Object.assign(this, { dir, bundledDir, backupDir, appVersion, hostname, log, machine: machine || hostname });
    this.state = emptyState();
    this.sync = {};
    this.dirtyBooks = new Set();
    this.localRevs = new Set();   // versions saved from this window (editing them again is not a conflict)
  }

  // ---------- load (+ one-time upgrade of song books from Scriptorium 0.4 and older) ----------
  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    const { state, legacy, sync, damaged } = readFolder(this.dir);
    this.state = state;
    // damaged files: recovered from .bak (rewritten on save) or kept aside so nothing overwrites them
    this.damaged = damaged;
    for (const d of damaged) {
      const file = path.join(this.dir, d.file), stamp = new Date().toISOString().replace(/[:.]/g, '-');
      try { fs.renameSync(file, file + '.damaged-' + stamp); } catch { /* leave it */ }
      if (d.recovered) this.dirtyBooks.add(cleanBookId(d.file.slice(0, -5)));
      this.log(`songdb: ${d.file} could not be read – ${d.recovered ? 'restored from its .bak copy' : 'set aside'}`);
    }
    this.sync = sync && typeof sync === 'object' && !Array.isArray(sync) ? sync : {};
    let dirty = false;
    const dev = this.sync.device && typeof this.sync.device === 'object' ? this.sync.device : null;
    if (dev && !dev.machine && dev.host === this.hostname) { dev.machine = this.machine; dirty = true; }   // from an earlier 0.5 build
    if (!dev || dev.machine !== this.machine) { this.newDeviceId(dev); dirty = true; }   // new computer (or a copied data folder)
    if (legacy.length) this.migrateLegacy(legacy);
    if (dirty || this.dirtyBooks.size) this.save();
    return this;
  }

  // Songs from 0.4.x have no ids. Match them to the songs that ship with the program (same book +
  // number + title, then title, then number) so every computer gives the same song the same id.
  migrateLegacy(legacy) {
    const bundled = this.bundledDir ? readFolder(this.bundledDir, { assignUids: true }).state : emptyState();
    const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const shipped = new Map();
    for (const s of bundled.songs.values()) (shipped.get(s.book) || shipped.set(s.book, []).get(s.book)).push(s);
    const claimed = new Set(), byBook = new Map();
    for (const it of legacy.filter(x => x.song)) (byBook.get(it.song.book) || byBook.set(it.song.book, []).get(it.song.book)).push(it);
    const books = new Set(legacy.filter(x => x.book).map(x => x.book));
    const passes = [(s, b) => b.number === s.number && fold(b.title) === fold(s.title), (s, b) => fold(b.title) === fold(s.title), (s, b) => b.number === s.number];
    for (const id of books) {
      const items = byBook.get(id) || [], pool = shipped.get(id) || [];
      const match = new Map();
      for (const p of passes) for (const it of items) {
        if (match.has(it)) continue;
        const b = pool.find(b2 => !claimed.has(b2.uid) && p(it.song, b2));
        if (b) { claimed.add(b.uid); match.set(it, b); }
      }
      for (const it of items) {
        const s = it.song, b = match.get(it);
        if (b && s.hash === b.hash) Object.assign(s, { uid: b.uid, rev: b.rev, hist: b.hist.slice(), modified: b.modified });
        else if (b) Object.assign(s, { uid: b.uid, rev: newRev(), hist: joinHist(b.hist, [b.rev]), modified: it.mtime });   // edited on this computer
        else Object.assign(s, { uid: newUid(), rev: newRev(), hist: [], modified: it.mtime });
        this.state.songs.set(s.uid, s);
      }
      // songs of a shipped book that this computer no longer has were deleted here
      const mtime = (legacy.find(x => x.book === id) || {}).mtime || Date.now();
      for (const b of pool) if (!claimed.has(b.uid)) this.state.goneSongs.set(b.uid, tombOf(b, mtime));
      // book name: same as shipped → same version; renamed here → an edit
      const L = this.state.books.get(id), B = bundled.books.get(id);
      if (L && B) Object.assign(L, L.hash === B.hash ? { rev: B.rev, hist: B.hist.slice(), modified: B.modified } : { rev: newRev(), hist: joinHist(B.hist, [B.rev]) });
      else if (L) L.rev = newRev();
    }
    // shipped books that were deleted in 0.4 (left behind as <id>.json.deleted)
    for (const [id, B] of bundled.books) {
      const del = path.join(this.dir, id + '.json.deleted');
      if (this.state.books.has(id) || !fs.existsSync(del)) continue;
      const mtime = Math.round(fs.statSync(del).mtimeMs);
      this.state.goneBooks.set(id, tombOf(B, mtime));
      for (const s of shipped.get(id) || []) this.state.goneSongs.set(s.uid, tombOf(s, mtime));
    }
    this.markBooks(this.state.books.keys());
    this.log(`songdb: upgraded ${legacy.filter(x => x.song).length} songs from the old format`);
  }

  // ---------- save ----------
  markBooks(ids) { for (const id of ids) if (id) this.dirtyBooks.add(id); }
  save() {
    if (this.readOnly) throw new Error('The song database could not be opened, so nothing is saved (' + this.readOnly + ')');
    fs.mkdirSync(this.dir, { recursive: true });
    for (const id of this.dirtyBooks) {
      const file = path.join(this.dir, id + '.json');
      if (this.state.books.has(id)) {
        if (fs.existsSync(file)) { try { fs.copyFileSync(file, file + '.bak'); } catch { /* best effort */ } }
        writeAtomic(file, formatBookFile(bookFileData(this.state, id)));
      } else if (fs.existsSync(file)) fs.renameSync(file, file + '.deleted');
    }
    const st = this.state;
    Object.assign(this.sync, { format: 'scriptorium-sync', version: 1 });
    this.sync.deleted = { books: [...st.goneBooks.entries()].map(([id, g]) => pubGone(g, { id })), songs: [...st.goneSongs.entries()].map(([uid, g]) => pubGone(g, { uid })) };
    writeAtomic(path.join(this.dir, SYNC_FILE), JSON.stringify(this.sync));
    this.dirtyBooks = new Set();
  }

  // ---------- what the window sees ----------
  booksForUi() {
    const byBook = new Map([...this.state.books.keys()].map(id => [id, []]));
    for (const s of this.state.songs.values()) { const l = byBook.get(s.book); if (l) l.push(s); }
    return [...byBook.entries()].map(([id, songs]) => {
      const b = this.state.books.get(id);
      songs.sort((a, c) => a.number - c.number || a.title.localeCompare(c.title));
      return { id, name: b.name, short: b.short, ...(b.description ? { description: b.description } : {}),
        songs: songs.map(s => { const o = { uid: s.uid, rev: s.rev, number: s.number, title: s.title, sections: s.sections }; for (const k of OPT_FIELDS) if (s[k]) o[k] = s[k]; return o; }) };
    });
  }

  // ---------- edits from the window ----------
  // ops: { books: [{id, name, short, description}], songs: [{uid?, rev? (the version it was edited from), book, …content}], remove: [uid], removeBooks: [id] }
  // Returns { songs: [{uid, rev} | null] } in the order given, so new songs learn their id.
  apply(ops, when = Date.now()) {
    this.checkWritable();
    const st = this.state, touched = new Set(), out = [];
    for (const rb of Array.isArray(ops.books) ? ops.books : []) {
      if (!rb || typeof rb !== 'object') continue;
      const id = cleanBookId(rb.id); if (!id) continue;
      const cur = st.books.get(id), g = st.goneBooks.get(id);
      const b = makeBook({ ...rb, modified: when }, id);
      if (cur && cur.hash === b.hash) continue;
      b.rev = newRev();
      b.hist = cur ? joinHist(cur.hist, [cur.rev]) : g ? joinHist(g.hist, [g.rev]) : [];
      st.books.set(id, b); st.goneBooks.delete(id); touched.add(id);
    }
    for (const raw of Array.isArray(ops.songs) ? ops.songs : []) {
      const bookId = raw && typeof raw === 'object' ? cleanBookId(raw.book) : '';
      if (!bookId || !st.books.has(bookId)) { out.push(null); continue; }
      const s = makeSong({ ...raw, modified: when, rev: '', hist: [] }, bookId);
      if (s.uid && !st.songs.has(s.uid) && !st.goneSongs.has(s.uid)) s.uid = '';   // unknown id → a new song
      if (!s.uid) s.uid = newUid();
      const cur = st.songs.get(s.uid), g = st.goneSongs.get(s.uid);
      if (cur && cur.hash === s.hash) { out.push({ uid: s.uid, rev: cur.rev }); continue; }
      s.rev = newRev();
      if (cur) {
        // the window edited an older version than the one stored (a merge happened meanwhile) → keep both
        if (isRev(raw.rev) && raw.rev !== cur.rev && !this.localRevs.has(cur.rev)) {
          const cu = conflictUid(cur.uid, cur.rev);
          if (!st.songs.has(cu) && !st.goneSongs.has(cu)) {
            if (!st.books.has(CONFLICT_BOOK)) st.books.set(CONFLICT_BOOK, conflictBook(when));
            st.songs.set(cu, conflictCopy(cur, cu, st.books.get(cur.book))); touched.add(CONFLICT_BOOK);
          }
        }
        s.hist = joinHist(cur.hist, [cur.rev]);
        touched.add(cur.book);
      } else if (g) { s.hist = joinHist(g.hist, [g.rev]); st.goneSongs.delete(s.uid); }
      st.songs.set(s.uid, s); touched.add(bookId); this.localRevs.add(s.rev);
      out.push({ uid: s.uid, rev: s.rev });
    }
    for (const r of Array.isArray(ops.remove) ? ops.remove : []) {
      const uid = r && typeof r === 'object' ? r.uid : r, cur = this.state.songs.get(uid);
      // the window deleted an older version than the one stored (a merge brought a change meanwhile) → keep that change as a copy
      if (cur && r && typeof r === 'object' && isRev(r.rev) && r.rev !== cur.rev && !this.localRevs.has(cur.rev)) {
        const cu = conflictUid(cur.uid, cur.rev);
        if (!st.songs.has(cu) && !st.goneSongs.has(cu)) { if (!st.books.has(CONFLICT_BOOK)) st.books.set(CONFLICT_BOOK, conflictBook(when)); st.songs.set(cu, conflictCopy(cur, cu, st.books.get(cur.book))); touched.add(CONFLICT_BOOK); }
      }
      this.removeSong(uid, when, touched);
    }
    for (const id0 of Array.isArray(ops.removeBooks) ? ops.removeBooks : []) {
      const id = cleanBookId(id0), b = st.books.get(id); if (!b) continue;
      for (const s of [...st.songs.values()]) if (s.book === id) this.removeSong(s.uid, when, touched);
      st.goneBooks.set(id, tombOf(b, when, { title: '', book: '' })); st.books.delete(id); touched.add(id);
    }
    if (touched.size) { this.markBooks(touched); this.save(); }
    return { songs: out };
  }
  removeSong(uid, when, touched) {
    const s = this.state.songs.get(uid); if (!s) return;
    this.state.goneSongs.set(uid, tombOf(s, when));
    this.state.songs.delete(uid); touched.add(s.book);
  }

  // ---------- export / merge ----------
  newDeviceId(old) {
    this.sync.device = { id: crypto.randomBytes(8).toString('hex'), name: str(old && old.name, 80) || this.hostname || 'Computer', host: this.hostname, machine: this.machine };
  }
  device() { return { id: this.sync.device.id, name: this.sync.device.name, machine: sha(String(this.machine)).slice(0, 16) }; }
  checkWritable() { if (this.readOnly) throw new Error('The song database could not be opened, so nothing is changed (' + this.readOnly + ')'); }
  setDeviceName(name) { const n = str(name, 80).trim(); if (n && n !== this.sync.device.name) { this.sync.device.name = n; this.save(); } return this.device(); }
  exportObject() { return snapshotOf(this.state, this.device()); }

  // dry run first, so nothing is written (and no backup made) when there is nothing new
  merge(snapshotObj, { source, backupReason } = {}) {
    this.checkWritable();
    const { state: remote, device } = parseSnapshot(snapshotObj);
    const name = source || device.name || 'file';
    const when = Date.now();
    if (!mergeStates(cloneState(this.state), remote, { source: name, when }).changed) return { source: name, changed: false, added: 0, updated: 0, deleted: 0, restored: 0, conflicts: [] };
    if (backupReason) this.backup(backupReason);
    const sum = mergeStates(this.state, remote, { source: name, when });
    this.markBooks(sum.touchedBooks);
    this.logMerge(sum);
    this.save();
    return sum;
  }
  logMerge(s) {
    const entry = { when: Date.now(), source: s.source, added: s.added, updated: s.updated, deleted: s.deleted, restored: s.restored, conflicts: s.conflicts.length, books: s.booksAdded + s.booksChanged + s.booksDeleted };
    this.sync.log = [entry, ...(Array.isArray(this.sync.log) ? this.sync.log : [])].slice(0, 30);
  }

  // songs that come with the program: merged once per program version / data change
  bundledFingerprint() {
    if (!this.bundledDir || !fs.existsSync(this.bundledDir)) return '';
    const h = crypto.createHash('sha256');
    for (const f of fs.readdirSync(this.bundledDir).filter(f => f.endsWith('.json')).sort()) h.update(f).update(fs.readFileSync(path.join(this.bundledDir, f)));
    return h.digest('hex').slice(0, 24);
  }
  mergeBundled() {
    const fp = this.bundledFingerprint();
    if (!fp || this.sync.bundled === fp) return null;
    const { state } = readFolder(this.bundledDir, { assignUids: true });
    const firstRun = this.state.songs.size === 0 && this.state.goneSongs.size === 0;
    const source = 'Scriptorium ' + (this.appVersion || '');
    const s = this.merge(snapshotOf(state, { id: 'bundled', name: source }), { source, backupReason: firstRun ? null : 'before-update-' + (this.appVersion || 'new') });
    this.sync.bundled = fp; this.save();
    return firstRun || !s.changed ? null : s;
  }

  // ---------- backups (gzip'd exports, newest 30 kept) ----------
  backup(reason = 'manual') {
    if (!this.backupDir) return null;
    fs.mkdirSync(this.backupDir, { recursive: true });
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const base = `songs-${stamp}-${String(reason).replace(/[^A-Za-z0-9.\-]+/g, '-').slice(0, 40)}`;
    let name = base + '.scsongs.gz';
    for (let i = 2; fs.existsSync(path.join(this.backupDir, name)); i++) name = `${base}-${i}.scsongs.gz`;
    writeAtomic(path.join(this.backupDir, name), zlib.gzipSync(JSON.stringify(this.exportObject())));
    // newest 20 made before syncs + newest 30 of the others (so frequent syncs can't push out the backup from before an update)
    const all = this.listBackups(), isSync = b => b.reason.startsWith('before-sync');
    for (const old of [...all.filter(isSync).slice(20), ...all.filter(b => !isSync(b)).slice(30)]) { try { fs.unlinkSync(path.join(this.backupDir, old.file)); } catch { /* ignore */ } }
    return name;
  }
  listBackups() {
    if (!this.backupDir || !fs.existsSync(this.backupDir)) return [];
    return fs.readdirSync(this.backupDir).filter(f => /^songs-\d{8}-\d{6}-.*\.scsongs\.gz$/.test(f))
      .map(f => ({ f, t: fs.statSync(path.join(this.backupDir, f)) }))
      .sort((a, b) => b.f.slice(6, 21).localeCompare(a.f.slice(6, 21)) || b.t.mtimeMs - a.t.mtimeMs)
      .map(({ f, t }) => {
        const m = f.match(/^songs-(\d{8})-(\d{6})-(.*)\.scsongs\.gz$/);
        return { file: f, date: `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6)} ${m[2].slice(0, 2)}:${m[2].slice(2, 4)}`, reason: m[3], size: t.size };
      });
  }
  // Going back to a backup is recorded as new edits, so the other computers follow it too.
  restore(file) {
    this.checkWritable();
    const f = path.join(this.backupDir, path.basename(String(file)));
    const { state: B } = parseSnapshot(JSON.parse(zlib.gunzipSync(fs.readFileSync(f), { maxOutputLength: 400 * 1048576 }).toString('utf8')));
    this.backup('before-restore');
    const st = this.state, when = Date.now(), touched = new Set();
    for (const [id, b] of B.books) {
      const cur = st.books.get(id), g = st.goneBooks.get(id);
      if (cur && cur.hash === b.hash) continue;
      st.books.set(id, { ...b, modified: when, rev: newRev(), hist: joinHist(b.hist, [b.rev], cur ? [...cur.hist, cur.rev] : [], g ? [...g.hist, g.rev] : []) });
      st.goneBooks.delete(id); touched.add(id);
    }
    for (const [uid, s] of B.songs) {
      const cur = st.songs.get(uid), g = st.goneSongs.get(uid);
      if (cur && cur.hash === s.hash) continue;
      st.songs.set(uid, { ...s, modified: when, rev: newRev(), hist: joinHist(s.hist, [s.rev], cur ? [...cur.hist, cur.rev] : [], g ? [...g.hist, g.rev] : []) });
      st.goneSongs.delete(uid); touched.add(s.book); if (cur) touched.add(cur.book);
    }
    for (const s of [...st.songs.values()]) if (!B.songs.has(s.uid)) this.removeSong(s.uid, when, touched);
    for (const [id, b] of [...st.books]) if (!B.books.has(id) && ![...st.songs.values()].some(s => s.book === id)) { st.goneBooks.set(id, tombOf(b, when, { title: '', book: '' })); st.books.delete(id); touched.add(id); }
    this.markBooks(touched); this.save();
    return { changed: touched.size };
  }

  // ---------- sync folder (OneDrive / Google Drive / Dropbox / a USB stick …) ----------
  // Each computer writes its own file there and merges everyone else's.
  syncFolder(folder) {
    const res = { merged: [], errors: [], wrote: '' };
    if (this.readOnly) { res.errors.push('read-only'); return res; }
    let ok = false; try { ok = !!folder && fs.statSync(folder).isDirectory(); } catch { /* missing */ }
    if (!ok) { res.errors.push('missing'); return res; }
    const me = this.device();
    if (!this.sync.seen || typeof this.sync.seen !== 'object') this.sync.seen = {};
    const seen = this.sync.seen;
    for (const f of fs.readdirSync(folder).filter(f => f.endsWith('.scsongs') && !f.startsWith('.'))) {
      const file = path.join(folder, f);
      let stt; try { stt = fs.statSync(file); } catch { continue; }
      if (!stt.isFile() || stt.size > 200 * 1048576) continue;
      const sig = stt.size + ':' + Math.round(stt.mtimeMs);
      if (seen[f] === sig) continue;
      let obj;
      try { obj = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { res.errors.push(f + ': ' + e.message); continue; }   // half-synced file → next time
      if (obj && obj.device && obj.device.id === me.id) {
        if (!obj.device.machine || obj.device.machine === me.machine) { seen[f] = sig; continue; }
        this.newDeviceId(this.sync.device); Object.assign(me, this.device());   // another computer with a copy of our data folder
      }
      try {
        const s = this.merge(obj, { backupReason: 'before-sync' });
        if (s.changed) res.merged.push(s);
        seen[f] = sig;
      } catch (e) { res.errors.push(f + ': ' + e.message); }
    }
    const safe = String(me.name || 'computer').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9\-_ ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'computer';
    const mine = `Scriptorium-songs-${safe}-${me.id.slice(0, 6)}.scsongs`;
    try {
      writeAtomic(path.join(folder, mine), JSON.stringify(this.exportObject()));
      const st2 = fs.statSync(path.join(folder, mine)); seen[mine] = st2.size + ':' + Math.round(st2.mtimeMs);
      res.wrote = mine;
      for (const f of fs.readdirSync(folder)) if (f !== mine && f.startsWith('Scriptorium-songs-') && f.endsWith('-' + me.id.slice(0, 6) + '.scsongs')) { try { fs.unlinkSync(path.join(folder, f)); } catch { /* ignore */ } }   // this computer was renamed
    } catch (e) { res.errors.push('write: ' + e.message); }
    this.sync.lastSync = Date.now(); this.save();
    return res;
  }
  status() { return { device: this.device(), lastSync: this.sync.lastSync || 0, log: Array.isArray(this.sync.log) ? this.sync.log : [], songs: this.state.songs.size, books: this.state.books.size }; }
}

// Shipped song files: give every song a fixed id, rev and hash, and record edits made to the files
// by hand as a new version. Runs before every build (npm run songs:stamp); safe to run again.
function stampFolder(dir) {
  const { state } = readFolder(dir, { assignUids: true });
  let changed = 0;
  for (const id of state.books.keys()) {
    const file = path.join(dir, id + '.json');
    const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const text = formatBookFile(bookFileData(state, id));
    if (text !== before) { fs.writeFileSync(file, text); changed++; }
  }
  return changed;
}

module.exports = { SongDB, mergeStates, parseSnapshot, snapshotOf, readFolder, stampFolder, formatBookFile, cloneState, emptyState, cleanBookId, stableUid, FORMAT, CONFLICT_BOOK, CONFLICT_NAME };
