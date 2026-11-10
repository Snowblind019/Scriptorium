// Songs: song books, forgiving search, slides, paste-to-format editor, chord/key detection,
// song-book manager and importers (SoftProjector, OpenLP, OpenLyrics, OpenSong, ChordPro, CSV, TXT, JSON).

// ------------------------------------------------------------------ song text formatting
const SongFormat = {
  NOTE_EN: '[A-G](?:#|b|♯|♭)?',
  NOTE_RO: '(?:Do|Re|Mi|Fa|Sol|La|Si)(?:#|b|♯|♭|diez|bemol)?',
  chordRe() {
    const q = '(?:m|min|maj|M|dim|aug|sus|add|-)?\\d*(?:sus\\d|add\\d|maj\\d)?';
    return new RegExp(`^(?:(?:${this.NOTE_EN}|${this.NOTE_RO})${q}(?:\\/(?:${this.NOTE_EN}|${this.NOTE_RO}))?)$`);
  },
  isChordLine(line) {
    const toks = line.trim().replace(/[|()[\]]/g, ' ').split(/\s+/).filter(Boolean);
    if (!toks.length || toks.length > 16) return false;
    const re = this.chordRe();
    return toks.every(t => re.test(t));
  },
  keyLine(line) {
    const m = line.trim().match(/^(?:tonalitate[a]?|tonul|ton|gama|gamă|key|cheia|acord(?:uri)?)\s*[:\-–]?\s*(.+)$/i);
    if (!m) return null;
    return m[1].replace(/[.;]+$/, '').trim();
  },
  // turn pasted text into { title, number, key, sections }
  parse(raw) {
    let text = String(raw || '').replace(/\r/g, '').replace(/\t/g, ' ').replace(/ /g, ' ');
    const out = { title: '', number: null, key: '', sections: [], detected: [] };
    // ChordPro inline chords [G] and directives {title: …}
    text = text.replace(/\{(?:title|t):\s*([^}]*)\}/gi, (_, x) => { out.title = out.title || x.trim(); return ''; })
      .replace(/\{(?:key):\s*([^}]*)\}/gi, (_, x) => { out.key = out.key || x.trim(); return ''; })
      .replace(/\{(?:soc|start_of_chorus)\}/gi, '[R]').replace(/\{(?:eoc|end_of_chorus)\}/gi, '\n')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\[([A-H][^\]\s]{0,7})\]/g, (_, ch) => { if (!out.key) out.key = ch; return ''; });
    let lines = text.split('\n').map(l => l.replace(/\s+$/, ''));
    // key / chord lines
    lines = lines.filter(l => {
      const k = this.keyLine(l);
      if (k) { out.key = out.key || k; out.detected.push('key'); return false; }
      if (l.trim() && this.isChordLine(l)) { if (!out.key) out.key = l.trim().split(/\s+/)[0]; out.detected.push('chords'); return false; }
      return true;
    });
    while (lines.length && !lines[0].trim()) lines.shift();
    // title: "123. Title" or a short first line followed by an empty line
    if (lines.length > 2) {
      const m = lines[0].match(/^\s*(?:nr\.?\s*)?(\d{1,4})[.)]?\s+(.{2,80})$/i);
      if (m && !lines[1].trim()) { out.number = +m[1]; out.title = out.title || m[2].trim(); lines.splice(0, 2); }
      else if (!lines[1].trim() && lines[0].length < 70 && !/^\s*\d+[.)]/.test(lines[0]) && !/^\s*(R|Ref|Refren|Cor|Chorus)\b/i.test(lines[0])) { out.title = out.title || lines[0].trim(); lines.splice(0, 2); }
    }
    // blocks separated by empty lines; also split before "2." numbered stanzas or "R:" markers
    const blocks = []; let cur = [];
    const flush = () => { if (cur.some(l => l.trim())) blocks.push(cur); cur = []; };
    for (const l of lines) {
      if (!l.trim()) { flush(); continue; }
      if (cur.length && (/^\s*\d{1,2}\s*[.)]\s+\S/.test(l) || /^\s*(R|Ref|Refren|Refrain|Cor|Chorus)\s*\d*\s*[:.)]/i.test(l))) flush();
      cur.push(l);
    }
    flush();
    for (const b of blocks) {
      let type = 'verse', first = b[0];
      const head = first.match(/^\s*\[?(R|Ref|Refren|Refrain|Cor|Chorus|Bridge|Punte)\s*(\d*)\s*\]?\s*[:.)]?\s*(.*)$/i);
      const numbered = first.match(/^\s*\[?(\d{1,2})\]?\s*[.)]?\s+(.*)$/);
      let tag = '';
      if (head && (head[3] !== undefined) && /^(r|ref|refren|refrain|cor|chorus)$/i.test(head[1])) { type = 'chorus'; tag = head[2]; b[0] = head[3]; }
      else if (head && /^(bridge|punte)$/i.test(head[1])) { b[0] = head[3]; }
      else if (numbered) b[0] = numbered[2];
      const body = b.map(l => l.trim()).filter(Boolean).join('\n');
      if (body) out.sections.push({ type, text: body, tag });
    }
    // identical blocks that repeat → chorus
    const seen = {};
    out.sections.forEach(s => { const k = fold(s.text); seen[k] = (seen[k] || 0) + 1; });
    out.sections.forEach(s => { if (seen[fold(s.text)] > 1) s.type = 'chorus'; });
    // keep a repeated chorus only once when it simply alternates with verses (it is repeated on screen)
    const ch = out.sections.filter(s => s.type === 'chorus');
    const distinct = [...new Set(ch.map(s => fold(s.text)))];
    if (distinct.length === 1 && ch.length > 1) {
      let firstSeen = false;
      out.sections = out.sections.filter(s => { if (s.type !== 'chorus') return true; if (!firstSeen) { firstSeen = true; return true; } return false; });
    }
    if (out.title === '' && out.sections[0]) out.title = out.sections[0].text.split('\n')[0].replace(/[,.;:!?]+$/, '');
    return out;
  },
  toMarkup(sections) {
    const distinct = [...new Set(sections.filter(s => s.type === 'chorus').map(s => fold(s.text)))];
    return sections.map(s => {
      if (s.type !== 'chorus') return s.text;
      const i = distinct.indexOf(fold(s.text));
      return (distinct.length > 1 ? `[R${i + 1}]` : '[R]') + '\n' + s.text;
    }).join('\n\n');
  },
  fromMarkup(t) {
    return t.replace(/\r/g, '').split(/\n\s*\n/).map(block => {
      const lines = block.split('\n');
      let type = 'verse';
      const m = lines[0].trim().match(/^\[(R\d*|Refren\s*\d*|Chorus\s*\d*|C|B|Bridge|V|\d+)\]\s*(.*)$/i);
      if (m) {
        if (/^(r|refren|chorus|c)/i.test(m[1])) type = 'chorus';
        lines[0] = m[2]; if (!lines[0].trim()) lines.shift();
      }
      return { type, text: lines.map(l => l.trim()).join('\n').trim() };
    }).filter(s => s.text);
  },
};

// ------------------------------------------------------------------ importers (text formats)
const Importers = {
  fromRecord(r) {   // {title, number, text|sections, key, info}
    let sections = r.sections;
    let key = r.key || '';
    if (!sections) { const p = SongFormat.parse(r.text || ''); sections = p.sections; key = key || p.key; }
    return { number: +r.number || 0, title: (r.title || (sections[0] ? sections[0].text.split('\n')[0] : '')).trim(), sections: sections.map(s => ({ type: s.type === 'chorus' ? 'chorus' : 'verse', text: s.text })), ...(key ? { key } : {}), ...(r.info ? { info: r.info } : {}) };
  },
  csv(text) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
      else if (c === '"') q = true; else if (c === ',' || c === ';' && !text.slice(0, 200).includes(',')) { row.push(f); f = ''; }
      else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    const head = rows.shift().map(h => fold(h.replace(/^﻿/, '')));
    const col = (...names) => head.findIndex(h => names.some(n => h.includes(n)));
    const ci = { n: col('number', 'numar', 'nr'), t: col('title', 'titlu', 'name', 'denumire'), l: col('lyrics', 'text', 'versuri', 'cuvinte', 'lyric'), k: col('key', 'tonalitate', 'chord'), i: col('info', 'notes', 'note') };
    return rows.filter(r => r.some(x => x.trim())).map(r => this.fromRecord({ number: r[ci.n], title: r[ci.t], text: r[ci.l], key: r[ci.k], info: r[ci.i] }));
  },
  txt(text) {   // one song, or several separated by lines of === / ---
    return text.split(/\n\s*(?:={3,}|-{3,}|\*{3,})\s*\n/).filter(x => x.trim()).map((chunk, i) => { const p = SongFormat.parse(chunk); return this.fromRecord({ number: p.number || i + 1, title: p.title, sections: p.sections, key: p.key }); });
  },
  chordpro(text) { const p = SongFormat.parse(text); return [this.fromRecord({ number: p.number || 1, title: p.title, sections: p.sections, key: p.key })]; },
  xml(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('song > lyrics > verse, lyrics verse lines')) {   // OpenLyrics
      const title = (doc.querySelector('titles title') || {}).textContent || '';
      const key = (doc.querySelector('key') || {}).textContent || '';
      const sections = [...doc.querySelectorAll('lyrics verse')].map(v => {
        const lines = [...v.querySelectorAll('lines')].map(l => { const c = l.cloneNode(true); c.querySelectorAll('br').forEach(b => b.replaceWith('\n')); c.querySelectorAll('chord').forEach(x => x.remove()); return c.textContent.trim(); }).join('\n');
        return { type: /^c/i.test(v.getAttribute('name') || '') ? 'chorus' : 'verse', text: lines };
      });
      return [this.fromRecord({ number: 1, title, sections, key })];
    }
    const lyr = doc.querySelector('song > lyrics');   // OpenSong
    if (lyr) {
      const title = (doc.querySelector('song > title') || {}).textContent || '';
      const sections = []; let cur = null;
      for (const l of lyr.textContent.split('\n')) {
        const m = l.match(/^\[(\w+)\]/);
        if (m) { cur = { type: /^c/i.test(m[1]) ? 'chorus' : 'verse', lines: [] }; sections.push(cur); continue; }
        if (l.startsWith('.') || l.startsWith(';')) continue;   // chord / comment lines
        if (!cur) { cur = { type: 'verse', lines: [] }; sections.push(cur); }
        cur.lines.push(l.replace(/^\s?\d?\s?/, '').replace(/\|/g, ' ').trim());
      }
      return [this.fromRecord({ number: 1, title, key: (doc.querySelector('key') || {}).textContent, sections: sections.map(s => ({ type: s.type, text: s.lines.filter(Boolean).join('\n') })).filter(s => s.text) })];
    }
    throw new Error('Unknown XML song format');
  },
  json(text) {
    const d = JSON.parse(text);
    const songs = Array.isArray(d) ? d : d.songs;
    return songs.map(s => this.fromRecord(s));
  },
  sps(rows) { return rows.map(r => this.fromRecord({ number: r.number, title: r.title, sections: Songs.parseSps(r.text), info: r.notes })); },
  openlp(rows) {
    return rows.map((r, i) => {
      const doc = new DOMParser().parseFromString(r.lyrics || '', 'application/xml');
      const verses = [...doc.querySelectorAll('verse')];
      const sections = verses.length ? verses.map(v => ({ type: (v.getAttribute('type') || 'v').toLowerCase() === 'c' ? 'chorus' : 'verse', text: v.textContent.replace(/\{[^}]*\}/g, '').trim() })) : SongFormat.parse(r.lyrics || '').sections;
      return this.fromRecord({ number: r.number || i + 1, title: r.title, sections });
    });
  },
};

// ------------------------------------------------------------------ Songs UI
const Songs = {
  books: [], all: [], byId: new Map(), index: null,
  results: [], current: null, slides: [], liveIdx: -1, selIdx: -1,

  async init() {
    this.books = (await api.loadSongs()).sort((a, b) => this.bookOrder(a) - this.bookOrder(b));
    this.reindex();
    this.fillBookSelect();
    const sel = $('#songBook');
    sel.value = this.settings().book || '';
    sel.onchange = () => { this.settings().book = sel.value; App.save(); this.search(); };
    $('#songSearch').addEventListener('input', debounce(() => this.search(), 140));
    $('#songSearch').addEventListener('keydown', e => {
      if (e.key === 'Enter' && this.results[0]) { e.preventDefault(); e.stopPropagation(); this.open(this.results[0]); this.showSlide(0); e.target.blur(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); const f = $('#songList .item'); if (f) { f.focus(); this.open(this.results[+f.dataset.i]); } }
    });
    $('#tbEdit').onclick = () => this.current && this.edit(this.current);
    $('#tbService').onclick = () => this.current && Service.addSong(this.current);
    $('#songNew').onclick = () => this.edit(null);
    $('#songBooks').onclick = () => this.openBooks();
    $('#edCancel').onclick = () => this.closeEditor();
    $('#edSave').onclick = () => this.saveEditor();
    $('#edDelete').onclick = () => this.deleteCurrent();
    $('#edFormat').onclick = () => this.autoFormat($('#edText').value, true);
    $('#edText').addEventListener('paste', e => {
      const txt = e.clipboardData.getData('text/plain');
      const ta = e.target;
      if (txt.split('\n').length < 3 || (ta.value.trim() && ta.selectionEnd - ta.selectionStart < ta.value.length)) return;
      e.preventDefault();
      this.autoFormat(txt, false);
    });
    $('#bkClose').onclick = () => $('#booksModal').classList.add('hidden');
    $('#bkNew').onclick = () => this.newBook();
    $('#bkImport').onclick = () => this.importFiles();
    $('#bkFolder').onclick = () => api.openSongFolder();
    App.nav.songs = { next: () => this.step(1), prev: () => this.step(-1), selStep: d => this.selStep(d), show: () => this.showSlide(this.selIdx >= 0 ? this.selIdx : 0) };
    document.addEventListener('live-changed', () => this.markLive());
    this.search();
  },

  settings() { return App.settings.songs; },
  bookOrder(b) {
    const order = ['cantarile-evangheliei', 'cantarile-harului', 'harfa-evangheliei', 'cor', 'laudele-domnului', 'lauda-si-inchinare', 'altele'];
    const i = order.indexOf(b.id); return i < 0 ? 50 : i;
  },
  fillBookSelect() {
    const sel = $('#songBook'), v = sel.value;
    sel.innerHTML = `<option value="">${t('All song books')} (${this.all.length})</option>` + this.books.map(b => `<option value="${b.id}">${esc(b.name)} (${b.songs.length})</option>`).join('');
    sel.value = this.books.some(b => b.id === v) ? v : '';
  },
  reindex() {
    this.all = []; this.byId = new Map();
    let n = 0;
    for (const book of this.books) for (const song of book.songs) {
      const x = { id: n++, book, song };
      this.all.push(x); this.byId.set(x.id, x);
    }
    this.index = new SearchIndex(this.all.map(x => ({ id: x.id, title: x.song.title, text: (x.song.sections || []).map(s => s.text).join(' ') + ' ' + (x.song.info || '') })));
  },
  find(bookId, number, title) {
    return this.all.find(x => x.book.id === bookId && x.song.number === number && (!title || x.song.title === title)) || this.all.find(x => x.book.id === bookId && x.song.number === number);
  },

  search() {
    const q = $('#songSearch').value.trim();
    const bookId = $('#songBook').value;
    const inBook = x => !bookId || x.book.id === bookId;
    let res, hint = '';
    if (!q) res = this.all.filter(inBook);
    else if (/^\d+$/.test(q)) {
      const pool = this.all.filter(inBook);
      res = pool.filter(x => String(x.song.number) === q).concat(pool.filter(x => String(x.song.number).startsWith(q) && String(x.song.number) !== q));
    } else {
      const r = this.index.query(q, 2000);
      res = r.hits.map(h => this.byId.get(h.id)).filter(inBook);
      if (r.fixed) hint = t('Showing results for') + ' “' + r.fixed + '”';
    }
    this.results = res;
    $('#songHint').textContent = (hint ? hint + ' · ' : '') + res.length + ' ' + t(res.length === 1 ? 'song' : 'songs');
    const multi = !bookId;
    $('#songList').innerHTML = res.slice(0, 600).map((x, i) =>
      `<div class="item${this.current && this.current.song === x.song ? ' sel' : ''}" tabindex="0" data-i="${i}"><span class="num">${x.song.number}</span><span class="ttl">${esc(x.song.title)}</span>${multi ? `<span class="tag">${esc(x.book.short || x.book.name)}</span>` : ''}<span class="act"><button data-a="svc" title="${t('Add to service list')}">${icon('addList')}</button></span></div>`
    ).join('') + (res.length > 600 ? `<div class="empty">… ${res.length - 600} ${t('more – refine the search')}</div>` : '');
    $$('#songList .item[data-i]').forEach(el => {
      const x = this.results[+el.dataset.i];
      el.onclick = e => {
        if (e.target.closest('[data-a="svc"]') || App.clickMacro(e)) { Service.addSong(x); return; }
        this.open(x);
      };
      el.ondblclick = () => { this.open(x); this.showSlide(0); };
      el.onkeydown = e => {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this.open(x); this.showSlide(0); }
        else if (e.key === 'ArrowDown' && el.nextElementSibling && el.nextElementSibling.dataset.i) { e.preventDefault(); e.stopPropagation(); el.nextElementSibling.focus(); this.open(this.results[+el.nextElementSibling.dataset.i]); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); const p = el.previousElementSibling; if (p) { p.focus(); this.open(this.results[+p.dataset.i]); } else $('#songSearch').focus(); }
      };
    });
  },

  splitText(text, n) {
    const lines = text.split('\n');
    if (n && lines.length > n) {
      const parts = Math.ceil(lines.length / n), per = Math.ceil(lines.length / parts), out = [];
      for (let i = 0; i < lines.length; i += per) out.push(lines.slice(i, i + per).join('\n'));
      return out;
    }
    return [text];
  },
  buildSlides(song) {
    const secs = (song.sections || []).filter(s => s.text && s.text.trim()).map(s => ({ type: s.type === 'chorus' ? 'chorus' : 'verse', text: s.text }));
    const distinct = [...new Set(secs.filter(s => s.type === 'chorus').map(s => fold(s.text)))];
    const verses = secs.filter(s => s.type === 'verse');
    let seq = secs;
    // one chorus written once → repeat it after every verse (setting). Different choruses stay as written.
    if (this.settings().repeatChorus && distinct.length === 1 && secs.filter(s => s.type === 'chorus').length === 1 && verses.length > 1) {
      const ch = secs.find(s => s.type === 'chorus');
      seq = [];
      secs.forEach((s, i) => { seq.push(s); if (s.type === 'verse' && !(secs[i + 1] && secs[i + 1].type === 'chorus')) seq.push(ch); });
    }
    let vn = 0;
    const out = [];
    for (const s of seq) {
      const base = s.type === 'chorus' ? (distinct.length > 1 ? 'R' + (distinct.indexOf(fold(s.text)) + 1) : 'R') : String(++vn);
      const parts = this.splitText(s.text, this.settings().splitLines || 0);
      parts.forEach((p, i) => out.push({ type: s.type, text: p, label: parts.length > 1 ? base + '·' + (i + 1) : base }));
    }
    return out;
  },

  open(x, keepSel) {
    if (!x) return;
    this.current = x;
    this.slides = this.buildSlides(x.song);
    const isLive = App.live.source && App.live.source.song === x.song;
    this.liveIdx = isLive ? App.live.source.idx : -1;
    if (!keepSel) this.selIdx = this.liveIdx;
    $('#songTitle').textContent = `${x.song.number}. ${x.song.title}`;
    $('#songMeta').textContent = [x.book.name, x.song.key ? t('Key') + ': ' + x.song.key : '', x.song.info || ''].filter(Boolean).join('  ·  ');
    $$('#songList .item[data-i]').forEach(el => el.classList.toggle('sel', this.results[+el.dataset.i] === x));
    $('#slides').innerHTML = this.slides.length ? this.slides.map((s, i) =>
      `<div class="slide t-${s.type}${i === this.liveIdx ? ' live' : ''}${i === this.selIdx ? ' sel' : ''}" data-i="${i}"><span class="lbl">${s.label}</span><span class="txt">${esc(s.text)}</span></div>`
    ).join('') : `<div class="empty">${t('This song has no lyrics yet. Click ✎ to add them.')}</div>`;
    $$('#slides .slide').forEach(el => el.onclick = () => this.clickSlide(+el.dataset.i));
    $('#slides').scrollTop = 0;
  },
  clickSlide(i) {
    this.selIdx = i;
    if (App.settings.clickShows) this.showSlide(i); else this.markLive();
  },

  showSlide(i, dir) {
    if (!this.current || !this.slides[i]) return;
    this.liveIdx = this.selIdx = i;
    const cur = this.current, { book, song } = cur, slides = this.slides, s = slides[i];
    App.show(
      { kind: 'song', text: s.text, footer: this.settings().showTitle ? `${book.short || book.name} ${song.number} · ${song.title}` : '', key: song.key || '', page: [i + 1, slides.length], last: i === slides.length - 1 },
      `${book.short || ''} ${song.number} – ${song.title}`,
      {
        view: 'songs', key: 'song:' + book.id + ':' + song.number + ':' + song.title, song, idx: i,
        open: () => { App.setView('songs'); this.open(cur); },
        replay: () => { App.setView('songs'); this.open(cur); this.showSlide(0); },
        next: () => slides[i + 1] ? `[${slides[i + 1].label}] ${slides[i + 1].text.replace(/\n/g, ' / ')}` : '— ' + t('end of song') + ' —',
      }, { dir });
    this.markLive();
    const el = $(`#slides .slide[data-i="${i}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  },
  markLive() {
    const src = App.live.source;
    const on = src && this.current && src.song === this.current.song && App.live.view === 'text' ? src.idx : -1;
    $$('#slides .slide').forEach(el => { const i = +el.dataset.i; el.classList.toggle('live', i === on); el.classList.toggle('sel', i === this.selIdx && i !== on); });
  },
  // ←/→: move the highlighted slide only; the screen changes when you press Show (Enter)
  selStep(d) {
    if (!this.current || !this.slides.length) return;
    const base = this.selIdx >= 0 ? this.selIdx : (this.liveIdx >= 0 ? this.liveIdx : (d > 0 ? -1 : this.slides.length));
    this.selIdx = Math.max(0, Math.min(this.slides.length - 1, base + d));
    this.markLive();
    const el = $(`#slides .slide[data-i="${this.selIdx}"]`); if (el) el.scrollIntoView({ block: 'nearest' });
  },
  step(d) {
    if (!this.current) return;
    const live = App.live.source && App.live.source.song === this.current.song && App.live.view === 'text';
    const base = live ? this.liveIdx : this.selIdx;
    const i = base < 0 ? (d > 0 ? 0 : this.slides.length - 1) : base + d;
    if (i < 0 || i >= this.slides.length) return;
    if (live || App.settings.clickShows) this.showSlide(i, d); else { this.selIdx = i; this.markLive(); }
  },

  // ---------- editor ----------
  autoFormat(raw, keepFields) {
    const p = SongFormat.parse(raw);
    $('#edText').value = SongFormat.toMarkup(p.sections);
    if (p.title && (!keepFields || !$('#edName').value.trim())) $('#edName').value = p.title;
    if (p.key && !$('#edKey').value.trim()) $('#edKey').value = p.key;
    if (p.number && !keepFields) $('#edNumber').value = p.number;
    const nv = p.sections.filter(s => s.type === 'verse').length, nc = p.sections.filter(s => s.type === 'chorus').length;
    $('#edDetect').textContent = `${t('Formatted')}: ${nv} ${t('verses')}, ${nc} ${t('choruses')}` + (p.key ? ` · ${t('key')} ${p.key}` : '') + (p.detected.includes('chords') ? ` · ${t('chord lines removed')}` : '');
  },
  edit(x) {
    this.editing = x;
    $('#edTitle').textContent = t(x ? 'Edit song' : 'New song');
    $('#edBook').innerHTML = this.books.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
    const book = x ? x.book : (this.books.find(b => b.id === $('#songBook').value) || this.books[0]);
    $('#edBook').value = book.id;
    $('#edNumber').value = x ? x.song.number : Math.max(0, ...book.songs.map(s => +s.number || 0)) + 1;
    $('#edName').value = x ? x.song.title : '';
    $('#edKey').value = x ? (x.song.key || '') : '';
    $('#edInfo').value = x ? (x.song.info || '') : '';
    $('#edText').value = x ? SongFormat.toMarkup(x.song.sections || []) : '';
    $('#edDetect').textContent = '';
    $('#edDelete').classList.toggle('hidden', !x);
    $('#modal').classList.remove('hidden');
    (x ? $('#edName') : $('#edText')).focus();
  },
  closeEditor() { $('#modal').classList.add('hidden'); },
  async saveBook(book) { book.edited = true; await api.saveSongBook(book); },
  async saveEditor() {
    const x = this.editing;
    const sections = SongFormat.fromMarkup($('#edText').value);
    const title = $('#edName').value.trim() || (sections[0] ? sections[0].text.split('\n')[0] : '');
    if (!title) { toast(t('Title is required')); return; }
    const book = this.books.find(b => b.id === $('#edBook').value);
    const song = x ? x.song : {};
    Object.assign(song, { number: parseInt($('#edNumber').value, 10) || 0, title, sections });
    for (const k of ['key', 'info']) { const v = $('#ed' + k[0].toUpperCase() + k.slice(1)).value.trim(); if (v) song[k] = v; else delete song[k]; }
    const changed = new Set([book]);
    if (x && x.book !== book) { x.book.songs.splice(x.book.songs.indexOf(song), 1); changed.add(x.book); }
    if (!x || x.book !== book) book.songs.push(song);
    book.songs.sort((a, b) => a.number - b.number);
    for (const b of changed) await this.saveBook(b);
    this.afterBooksChanged();
    this.closeEditor();
    const nx = this.all.find(y => y.song === song);
    if (nx) this.open(nx, true);
    toast(t('Song saved'));
  },
  async deleteCurrent() {
    const x = this.editing;
    if (!x || !confirm(t('Delete this song?') + `\n${x.song.title} (${x.book.name})`)) return;
    x.book.songs.splice(x.book.songs.indexOf(x.song), 1);
    await this.saveBook(x.book);
    this.closeEditor();
    this.current = null; $('#slides').innerHTML = ''; $('#songTitle').textContent = t('Select a song'); $('#songMeta').textContent = '';
    this.afterBooksChanged();
    toast(t('Song deleted (a .bak copy of the book was kept)'));
  },
  afterBooksChanged() { this.reindex(); this.fillBookSelect(); this.search(); },

  // ---------- song-book manager ----------
  openBooks() { this.renderBooks(); $('#booksModal').classList.remove('hidden'); },
  renderBooks() {
    $('#booksTable').innerHTML = `<div class="brow headr"><span>${t('Name')}</span><span>${t('Short name')}</span><span>${t('Songs')}</span><span></span><span></span></div>` +
      this.books.map((b, i) => `<div class="brow" data-i="${i}"><input data-f="name" value="${esc(b.name)}"><input data-f="short" value="${esc(b.short || '')}"><span>${b.songs.length}</span>
        <span class="row gap"><button class="btn sm ghost" data-a="csv">CSV</button><button class="btn sm ghost" data-a="json">JSON</button></span><button class="btn sm ghost danger" data-a="del">${t('Delete')}</button></div>`).join('') +
      `<div class="brow"><span class="muted small">${t('Import into')}</span><select id="bkTarget"><option value="">${t('A new book (named after the file)')}</option>${this.books.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select><span></span><span></span><span></span></div>`;
    $$('#booksTable .brow[data-i]').forEach(row => {
      const b = this.books[+row.dataset.i];
      $$('input', row).forEach(inp => inp.onchange = async () => { b[inp.dataset.f] = inp.value.trim() || b[inp.dataset.f]; await this.saveBook(b); this.afterBooksChanged(); });
      $('[data-a="csv"]', row).onclick = () => this.exportBook(b, 'csv');
      $('[data-a="json"]', row).onclick = () => this.exportBook(b, 'json');
      $('[data-a="del"]', row).onclick = async () => {
        if (!confirm(t('Delete this song book?') + `\n${b.name} (${b.songs.length})`)) return;
        await api.deleteSongBook(b.id);
        this.books.splice(this.books.indexOf(b), 1);
        this.afterBooksChanged(); this.renderBooks();
      };
    });
  },
  slug(name) { let id = fold(name).replace(/ /g, '-') || 'carte'; while (this.books.some(b => b.id === id)) id += '-' + uid().slice(0, 3); return id; },
  async newBook() {
    const name = await App.ask(t('Name of the new song book:'), t('New book'));
    if (!name) return;
    const b = { id: this.slug(name), name, short: name.slice(0, 10), songs: [], edited: true };
    this.books.push(b); await this.saveBook(b); this.afterBooksChanged(); this.renderBooks();
  },
  parseSps(text) {
    const secs = []; let cur = null;
    for (const line of String(text).replace(/\r/g, '').split('\n')) {
      const m = line.match(/^\s*(verse|refrain|chorus|bridge)\s*(\d+)?\s*[:\-]?\s*$/i);
      if (m) { const k = m[1].toLowerCase(); cur = { type: k === 'refrain' || k === 'chorus' ? 'chorus' : 'verse', lines: [] }; secs.push(cur); continue; }
      if (!cur) { cur = { type: 'verse', lines: [] }; secs.push(cur); }
      cur.lines.push(line.trimEnd());
    }
    return secs.map(s => {
      const l = s.lines; while (l.length && !l[0].trim()) l.shift(); while (l.length && !l[l.length - 1].trim()) l.pop();
      if (!l.length) return null;
      l[0] = l[0].replace(/^\s*\d+\s*[.)]\s*/, '');
      return { type: s.type, text: l.map(x => x.trim()).join('\n') };
    }).filter(Boolean);
  },
  async importFiles() {
    let files;
    try { files = await api.importSongs(); } catch (e) { toast(t('Import failed') + ': ' + e.message); return; }
    const target = this.books.find(b => b.id === ($('#bkTarget') || {}).value);
    let total = 0;
    for (const f of files) {
      let songs = [];
      try {
        if (f.kind === 'sps') songs = Importers.sps(f.rows);
        else if (f.kind === 'openlp') songs = Importers.openlp(f.rows);
        else if (f.ext === 'csv') songs = Importers.csv(f.text);
        else if (f.ext === 'json') songs = Importers.json(f.text);
        else if (f.ext === 'xml' || /^\s*<\?xml|^\s*<song/i.test(f.text)) songs = Importers.xml(f.text);
        else if (['cho', 'chordpro', 'pro', 'crd'].includes(f.ext)) songs = Importers.chordpro(f.text);
        else songs = Importers.txt(f.text);
      } catch (e) { toast(`${f.name}: ${e.message}`); continue; }
      let book = target;
      if (!book) { book = { id: this.slug(f.title || f.name), name: f.title || f.name.replace(/\.[^.]+$/, ''), short: (f.title || f.name).slice(0, 10), songs: [], edited: true }; this.books.push(book); }
      let n = Math.max(0, ...book.songs.map(s => +s.number || 0));
      for (const s of songs) { if (!s.number || book.songs.some(x => x.number === s.number)) s.number = ++n; book.songs.push(s); }
      book.songs.sort((a, b) => a.number - b.number);
      await this.saveBook(book);
      total += songs.length;
    }
    if (files.length) { this.afterBooksChanged(); this.renderBooks(); toast(`${t('Imported')} ${total} ${t('songs')}`); }
  },
  exportBook(b, fmt) {
    let blob;
    if (fmt === 'json') blob = new Blob([JSON.stringify({ name: b.name, short: b.short, songs: b.songs }, null, 1)], { type: 'application/json' });
    else {
      const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
      const rows = [['number', 'title', 'key', 'info', 'lyrics']].concat(b.songs.map(s => [s.number, s.title, s.key || '', s.info || '', SongFormat.toMarkup(s.sections || [])]));
      blob = new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' });
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = b.id + '.' + fmt; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
};
