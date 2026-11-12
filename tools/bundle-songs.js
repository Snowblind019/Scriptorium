// Put the songs from a computer into the songs that ship with the next Scriptorium release
// (app/data/songs), using the same merge as the program: additions, edits and deletions are carried
// over, nothing is lost, and the next update brings them to every other computer.
//
//   node tools/bundle-songs.js <file.scsongs | songs folder> [more…]
//
//   file.scsongs  – made in Scriptorium: Settings › Song sync & backups › Save songs to a file…
//   songs folder  – e.g. ~/.config/Scriptorium/songs (Linux), %APPDATA%\Scriptorium\songs (Windows),
//                   ~/Library/Application Support/Scriptorium/songs (macOS)
//
// Songs in the "merge conflicts" book are not shipped – sort those out in the program first.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { readFolder, parseSnapshot, snapshotOf, mergeStates, CONFLICT_BOOK, stampFolder } = require('../app/songdb');

const BUNDLED = process.env.SCRIPTORIUM_BUNDLED_DIR || path.join(__dirname, '..', 'app', 'data', 'songs');   // (the variable is for testing)
const sources = process.argv.slice(2);
if (!sources.length) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 11).join('\n').replace(/^\/\/ ?/gm, '')); process.exit(1); }

stampFolder(BUNDLED);
const { state } = readFolder(BUNDLED, { assignUids: true });
for (const src of sources) {
  let remote;
  if (fs.statSync(src).isDirectory()) remote = readFolder(src).state;
  else {
    let buf = fs.readFileSync(src);
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
    remote = parseSnapshot(JSON.parse(buf.toString('utf8'))).state;
  }
  // never ship conflict copies
  const skipped = [...remote.songs.values()].filter(s => s.book === CONFLICT_BOOK);
  for (const s of skipped) remote.songs.delete(s.uid);
  remote.books.delete(CONFLICT_BOOK);
  const sum = mergeStates(state, remote, { source: path.basename(src) });
  console.log(`${path.basename(src)}: +${sum.added} new, ${sum.updated} changed, ${sum.deleted} deleted, ${sum.restored} brought back, ${sum.conflicts.length} conflict(s)` + (skipped.length ? `, ${skipped.length} conflict copies left out` : ''));
  for (const c of sum.conflicts) console.log(`   conflict: ${c.book} ${c.number} “${c.title}” (kept the newer one)`);
}
state.songs.forEach((s, uid) => { if (s.book === CONFLICT_BOOK) state.songs.delete(uid); });
state.books.delete(CONFLICT_BOOK);

// write the shipped folder: one file per book + _sync.json with what was deleted
const snap = snapshotOf(state, { id: 'bundled', name: 'Scriptorium' });
const keep = new Set(snap.books.map(b => b.id + '.json'));
for (const f of fs.readdirSync(BUNDLED)) if (f.endsWith('.json') && f !== '_sync.json' && !keep.has(f)) { fs.unlinkSync(path.join(BUNDLED, f)); console.log('removed book', f); }
for (const b of snap.books) {
  const { songs, ...head } = b;
  const text = JSON.stringify({ format: 'scriptorium-book', dataVersion: 5, ...head }).slice(0, -1) + ',"songs":[\n' + songs.map(s => JSON.stringify(s)).join(',\n') + '\n]}\n';
  fs.writeFileSync(path.join(BUNDLED, b.id + '.json'), text);
}
fs.writeFileSync(path.join(BUNDLED, '_sync.json'), JSON.stringify({ format: 'scriptorium-sync', version: 1, deleted: snap.deleted }) + '\n');
stampFolder(BUNDLED);
console.log(`app/data/songs: ${snap.books.length} books, ${state.songs.size} songs, ${state.goneSongs.size} deletions recorded. Commit it and tag a release.`);
