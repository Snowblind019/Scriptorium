// Bible: VDC 1924 + BSB. Books (grouped tiles), chapters, verses, verse text (List versions are
// independent from Screen versions), smart search (typos, no diacritics, topics), favorites with notes.
const Bible = {
  vdc: null, bsb: null,
  book: 42, chapter: 3, sel: null, liveRef: null, aliases: [], idx: {},

  ABBR: [
    ['gen', 'gn', 'facerea'], ['ex', 'exod', 'exo', 'iesirea'], ['lev', 'lv'], ['num', 'nm', 'numbers'], ['deut', 'dt', 'deu'],
    ['ios', 'josh', 'jos'], ['jud', 'judg', 'jdg', 'jg'], ['rut', 'ruth', 'rt', 'ru'], ['1sam', '1sa', '1s', '1sm'], ['2sam', '2sa', '2s', '2sm'],
    ['1imp', '1im', '1ki', '1kgs', '1kings'], ['2imp', '2im', '2ki', '2kgs', '2kings'], ['1cron', '1cr', '1ch', '1chr'], ['2cron', '2cr', '2ch', '2chr'],
    ['ezr', 'ezra'], ['neem', 'neh', 'ne'], ['est', 'esth', 'estera', 'es'], ['iov', 'job', 'jb'], ['ps', 'psa', 'psalm', 'psalmul', 'psalmi', 'pslm'], ['prov', 'pr', 'prv', 'pv'],
    ['ecl', 'eccl', 'ecc', 'eclesiast', 'qoh', 'ec'], ['cant', 'song', 'sos', 'cc', 'ct', 'cantari', 'so'], ['is', 'isa'], ['ier', 'jer', 'jr'], ['plang', 'lam', 'pl', 'la', 'plan'],
    ['ezec', 'ezek', 'eze', 'ez'], ['dan', 'dn'], ['osea', 'hos', 'os', 'ho'], ['ioel', 'joel', 'il', 'jl'], ['amos', 'am'], ['obad', 'ob', 'abdia'], ['iona', 'jonah', 'jon'],
    ['mica', 'mic', 'mi'], ['naum', 'nah', 'na'], ['hab', 'hb'], ['tef', 'zeph', 'zep', 'sof', 'tefania', 'zp'], ['hag', 'hagai', 'hg'], ['zah', 'zech', 'zec', 'zaharia', 'zc'], ['mal', 'ml'],
    ['mat', 'mt', 'matt', 'matei'], ['marc', 'mc', 'mk', 'mrk', 'mark', 'mar'], ['luca', 'lc', 'lk', 'luk', 'luke'], ['ioan', 'in', 'jn', 'jhn', 'john', 'io'],
    ['fapte', 'fa', 'fap', 'acts', 'act', 'faptele', 'ac'], ['rom', 'rm', 'ro'], ['1cor', '1co'], ['2cor', '2co'], ['gal', 'ga'], ['ef', 'eph', 'efes'], ['filip', 'flp', 'phil', 'php', 'fil'],
    ['col', 'cl'], ['1tes', '1th', '1thess', '1tess', '1te'], ['2tes', '2th', '2thess', '2tess', '2te'], ['1tim', '1ti', '1tm'], ['2tim', '2ti', '2tm'], ['tit', 'titus', 'tt'],
    ['filim', 'phlm', 'phm', 'flm', 'filem'], ['evr', 'heb', 'ev', 'evrei'], ['iac', 'jas', 'jam', 'iacov', 'james', 'jm'], ['1pet', '1pe', '1pt', '1p'], ['2pet', '2pe', '2pt', '2p'],
    ['1ioan', '1in', '1jn', '1john', '1jo', '1i'], ['2ioan', '2in', '2jn', '2john', '2jo', '2i'], ['3ioan', '3in', '3jn', '3john', '3jo', '3i'], ['iuda', 'jude', 'iud', 'jd'],
    ['apoc', 'ap', 'rev', 'apocalipsa', 'revelation', 'rv', 'apo'],
  ],
  TILE_RO: ['Gen', 'Ex', 'Lev', 'Num', 'Deut', 'Ios', 'Jud', 'Rut', '1Sa', '2Sa', '1Îm', '2Îm', '1Cr', '2Cr', 'Ezra', 'Neem', 'Est', 'Iov', 'Ps', 'Prov', 'Ecl', 'Cînt',
    'Is', 'Ier', 'Plîn', 'Ezec', 'Dan', 'Osea', 'Ioel', 'Amos', 'Obad', 'Iona', 'Mica', 'Naum', 'Hab', 'Țef', 'Hag', 'Zah', 'Mal',
    'Mat', 'Mar', 'Luca', 'Ioan', 'Fap', 'Rom', '1Co', '2Co', 'Gal', 'Ef', 'Fil', 'Col', '1Te', '2Te', '1Ti', '2Ti', 'Tit', 'Flm', 'Evr', 'Iac', '1Pe', '2Pe', '1In', '2In', '3In', 'Iuda', 'Apoc'],
  TILE_EN: ['Gn', 'Ex', 'Lv', 'Nm', 'Dt', 'Jos', 'Jg', 'Ru', '1Sm', '2Sm', '1Ki', '2Ki', '1Ch', '2Ch', 'Ezr', 'Ne', 'Es', 'Jb', 'Ps', 'Pr', 'Ec', 'So',
    'Is', 'Jr', 'La', 'Eze', 'Dn', 'Ho', 'Jl', 'Am', 'Ob', 'Jon', 'Mic', 'Na', 'Hab', 'Zp', 'Hg', 'Zc', 'Ml',
    'Mt', 'Mk', 'Lk', 'Jn', 'Ac', 'Rm', '1Co', '2Co', 'Ga', 'Eph', 'Php', 'Col', '1Th', '2Th', '1Ti', '2Ti', 'Tit', 'Phm', 'Heb', 'Jm', '1Pe', '2Pe', '1Jo', '2Jo', '3Jo', 'Jud', 'Rev'],
  GROUPS: [
    { t: 'Old Testament', g: [['The Law', 0, 4, '#a0703f'], ['History', 5, 16, '#d08a2e'], ['Poetry & Wisdom', 17, 21, '#c6463f'], ['Major Prophets', 22, 26, '#9a4fb0'], ['Minor Prophets', 27, 38, '#7b5cc4']] },
    { t: 'New Testament', g: [['Gospels', 39, 42, '#3f6fd0'], ['Acts', 43, 43, '#1b9bb5'], ['Paul\'s Letters', 44, 56, '#23a061'], ['General Letters', 57, 64, '#5a9e3a'], ['Prophecy', 65, 65, '#c0a02a']] },
  ],
  color(i) { for (const T of this.GROUPS) for (const g of T.g) if (i >= g[1] && i <= g[2]) return g[3]; return '#888'; },

  cfg() { return App.settings.bible; },

  async init() {
    const [v, b] = await Promise.all([api.loadBible('vdc'), api.loadBible('bsb')]);
    this.vdc = JSON.parse(v); this.bsb = JSON.parse(b);
    this.buildAliases();
    // locate box: language + style toggles
    const loc = $('#pc-bibleBooks .locate');
    loc.insertAdjacentHTML('beforeend', `<div class="seg" id="nameLang"><button data-l="ro">RO</button><button data-l="en">EN</button></div><button class="icon-btn" id="bkStyle" title="${t('Tiles / list')}">${icon('list')}</button><span class="seg bk-size" title="${t('Book tile size')}"><button id="bkSmaller">−</button><button id="bkFit">${t('Fit')}</button><button id="bkBigger">+</button></span>`);
    $$('#nameLang button').forEach(btn => btn.onclick = () => { this.cfg().names = btn.dataset.l; App.save(); this.renderBooks(); this.updateTitles(); this.renderVerseList(); });
    $('#bkStyle').onclick = () => { this.cfg().bookStyle = this.cfg().bookStyle === 'list' ? 'groups' : 'list'; App.save(); this.renderBooks(); };
    const size = d => { const c = this.cfg(); const cur = c.bookSize === 'fit' || c.bookSize == null ? (this.fitScale || 1) : c.bookSize; c.bookSize = Math.round(Math.max(0.5, Math.min(3, cur * (d > 0 ? 1.15 : 1 / 1.15))) * 100) / 100; App.save(); this.sizeBooks(); };
    $('#bkSmaller').onclick = () => size(-0.1); $('#bkBigger').onclick = () => size(0.1);
    $('#bkFit').onclick = () => { this.cfg().bookSize = 'fit'; App.save(); this.sizeBooks(); };
    new ResizeObserver(debounce(() => this.sizeBooks(), 60)).observe($('#bookGrid'));
    const ref = $('#bibleRef');
    ref.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        const r = this.parse(ref.value);
        if (!r) { const m = this.bookMatches(ref.value)[0]; if (m != null) this.goto(m, 1); else toast(t('Reference not recognized')); return; }
        this.goto(r.book, r.chapter, r.from);
        if (r.from) { this.sel = { from: r.from, to: r.to || r.from }; this.project(); }
        ref.select();
      }
    });
    ref.addEventListener('input', debounce(() => this.onLocate(), 90));
    $('#bibleSearch').addEventListener('input', debounce(() => this.search(), 280));
    $('#bsScope').onchange = () => this.search(); $('#bsLang').onchange = () => this.search();
    $('#bFav').onclick = () => this.addFavorite();
    $$('.vt').forEach(b => b.onclick = () => this.toggleVer(b.dataset.set, b.dataset.v));
    this.syncVerButtons();
    App.nav.bible = { next: () => this.step(1), prev: () => this.step(-1), selStep: d => this.selStep(d), show: () => { if (this.sel) this.project(); else { this.sel = { from: 1, to: 1 }; this.project(); } } };
    new ResizeObserver(() => this.layoutGrids()).observe($('#chapGrid'));
    new ResizeObserver(() => this.layoutGrids()).observe($('#verseGrid'));
    document.addEventListener('live-changed', () => this.markLive());
    document.addEventListener('layout-changed', () => this.layoutGrids());
    this.renderBooks();
    this.renderFavorites();
    this.goto(42, 3);
  },

  lang() { return this.cfg().names === 'en' ? 'en' : 'ro'; },
  bookName(i, lang) { return (lang === 'en' ? this.bsb : this.vdc).books[i].name; },
  chapters(b) { return this.vdc.books[b].chapters.length; },
  verses(b, c) { return Math.max(this.vdc.books[b].chapters[c - 1].length, (this.bsb.books[b].chapters[c - 1] || []).length); },
  text(ver, b, c, v) { const bib = ver === 'bsb' ? this.bsb : this.vdc; return ((bib.books[b].chapters[c - 1] || [])[v - 1]) || ''; },

  buildAliases() {
    this.aliases = [];
    const add = (a, i) => this.aliases.push([fold(a).replace(/\s+/g, ''), i]);
    this.ABBR.forEach((list, i) => list.forEach(a => add(a, i)));
    this.TILE_RO.forEach((a, i) => add(a, i));
    this.vdc.books.forEach((bk, i) => add(bk.name, i));
    this.bsb.books.forEach((bk, i) => add(bk.name, i));
  },
  findBook(s) {
    const k = fold(s).replace(/\s+/g, '');
    if (!k) return -1;
    const ex = this.aliases.find(a => a[0] === k);
    if (ex) return ex[1];
    const m = this.bookMatches(s);
    return m.length ? m[0] : -1;
  },
  // books whose name/alias starts with (or nearly matches) the typed text
  bookMatches(s) {
    const k = fold(s).replace(/\s+/g, '').replace(/\d+$/, '');
    if (!k) return [];
    const out = [];
    const push = i => { if (!out.includes(i)) out.push(i); };
    this.aliases.forEach(([a, i]) => { if (a === k) push(i); });
    for (const bk of [this.vdc, this.bsb]) bk.books.forEach((b, i) => { if (fold(b.name).replace(/\s+/g, '').startsWith(k)) push(i); });
    this.aliases.forEach(([a, i]) => { if (a.startsWith(k)) push(i); });
    if (!out.length && k.length >= 4) this.vdc.books.forEach((b, i) => { const n = fold(b.name).replace(/\s+/g, ''); if (editDist(k, n.slice(0, k.length), 1) <= 1) push(i); });
    return out;
  },
  parse(s) {
    s = (s || '').trim();
    const m = s.match(/^(\d?\s*[^\d]+?)\s*(\d+)?(?:\s*[:., ]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?\s*$/);
    if (!m) return null;
    const book = this.findBook(m[1]);
    if (book < 0) return null;
    const nch = this.chapters(book);
    if (nch === 1 && m[2] && !m[3]) { m[3] = m[2]; m[2] = '1'; }
    const chapter = Math.min(Math.max(1, parseInt(m[2] || '1', 10)), nch);
    const nv = this.verses(book, chapter);
    const from = m[3] ? Math.min(Math.max(1, parseInt(m[3], 10)), nv) : null;
    let to = m[4] ? Math.min(parseInt(m[4], 10), nv) : null;
    if (to && to < from) to = from;
    return { book, chapter, from, to };
  },

  // ---------- books panel ----------
  renderBooks() {
    const L = this.lang(), ab = L === 'en' ? this.TILE_EN : this.TILE_RO;
    const box = $('#bookGrid');
    box.classList.toggle('list-style', this.cfg().bookStyle === 'list');
    box.innerHTML = this.GROUPS.map(T => `<div class="bk-testament"><div class="bk-tt">${t(T.t)}</div><div class="bk-groups">${T.g.map(([gn, a, z, c]) =>
      `<div class="bk-group" data-n="${z - a + 1}"><div class="bk-gname">${t(gn)}</div><div class="bk-row">${Array.from({ length: z - a + 1 }, (_, k) => a + k).map(i =>
        `<div class="bk${i === this.book ? ' sel' : ''}" data-b="${i}" style="--c:${c}" title="${esc(this.bookName(i, 'ro'))} · ${esc(this.bookName(i, 'en'))}"><span class="ab">${esc(ab[i])}</span><span class="nm">${esc(this.bookName(i, L))}</span><span class="cc">${this.chapters(i)}</span></div>`).join('')}</div></div>`).join('')}</div></div>`).join('');
    $$('#bookGrid .bk').forEach(el => el.onclick = () => { this.goto(+el.dataset.b, 1); $('#bibleRef').value = ''; this.onLocate(); });
    $$('#nameLang button').forEach(b => b.classList.toggle('on', b.dataset.l === L));
    this.sizeBooks();
  },
  // book tiles: "fit" grows/shrinks them to fill the panel; otherwise a fixed size (−/+)
  // All tiles share one column grid. "Fit" picks the fewest columns (= biggest tiles) that still fit
  // the panel without scrolling; −/+ set a fixed tile size instead.
  sizeBooks() {
    const g = $('#bookGrid'); if (!g || !g.offsetParent) return;
    const c = this.cfg(), fit = c.bookSize == null || c.bookSize === 'fit';
    if ($('#bkFit')) $('#bkFit').classList.toggle('on', fit);
    g.classList.toggle('fit', fit);
    const base = parseFloat(getComputedStyle(g.parentElement).fontSize) || 14;
    const W = g.clientWidth - 4;
    const apply = cols => {
      const tile = W / cols;
      g.style.setProperty('--bkmin', 'auto');
      g.style.setProperty('--cols', cols);
      g.style.setProperty('--bks', Math.max(0.55, Math.min(3, tile / (6.4 * base))).toFixed(3));
      $$('.bk-group', g).forEach(el => el.style.setProperty('--span', Math.min(+el.dataset.n, cols)));
    };
    if (g.classList.contains('list-style')) { g.style.setProperty('--bks', fit ? 1 : c.bookSize); return; }
    if (!fit) { apply(Math.max(3, Math.round(W / (6.4 * base * c.bookSize)))); this.fitScale = c.bookSize; return; }
    let chosen = 24;
    for (let cols = 4; cols <= 24; cols++) {
      apply(cols);
      if (g.scrollHeight <= g.clientHeight + 1) { chosen = cols; break; }
    }
    apply(chosen);
    // use the space that is left: first bigger text (while the abbreviations still fit the tile width) …
    const fits = () => g.scrollHeight <= g.clientHeight + 1;
    let lo = parseFloat(g.style.getPropertyValue('--bks')), hi = Math.min(3, (W / chosen) / (4.2 * base));
    for (let i = 0; i < 10 && hi > lo; i++) {
      const mid = (lo + hi) / 2;
      g.style.setProperty('--bks', mid.toFixed(3));
      if (fits()) lo = mid; else hi = mid;
    }
    g.style.setProperty('--bks', lo.toFixed(3));
    // … then taller tiles, sharing the remaining height between the rows of tiles
    const tiles = $$('.bk', g);
    const rows = new Set(tiles.map(el => el.offsetTop)).size || 1;
    const extra = g.clientHeight - g.scrollHeight;
    if (extra > rows && tiles.length) g.style.setProperty('--bkmin', (tiles[0].offsetHeight + Math.floor(extra / rows) - 1) + 'px');
    if (!fits()) g.style.setProperty('--bkmin', 'auto');
    this.fitScale = lo;
  },
  onLocate() {
    const v = $('#bibleRef').value;
    const r = this.parse(v);
    const matches = v.trim() ? this.bookMatches(v.replace(/\s*\d+(?:\s*[:., ]\s*\d+(?:\s*[-–]\s*\d+)?)?\s*$/, '')) : [];
    $$('#bookGrid .bk').forEach(el => { const i = +el.dataset.b; el.classList.toggle('dim', !!v.trim() && !!matches.length && !matches.includes(i)); el.classList.toggle('match', matches[0] === i); });
    if (r && /\d/.test(v)) {
      if (r.book !== this.book || r.chapter !== this.chapter) this.goto(r.book, r.chapter, r.from);
      if (r.from) { this.sel = { from: r.from, to: r.to || r.from }; this.markLive(); this.scrollToVerse(r.from); }
    } else if (matches.length === 1 && matches[0] !== this.book) this.goto(matches[0], 1);
  },

  renderNumGrids() {
    const col = this.color(this.book);
    const nch = this.chapters(this.book), nv = this.verses(this.book, this.chapter);
    $('#chapHead').textContent = `${this.bookName(this.book, this.lang())} · ${nch} ${t('chapters')}`;
    $('#verseHead').textContent = `${this.bookName(this.book, this.lang())} ${this.chapter} · ${nv} ${t('verses|bible')}`;
    $('#chapGrid').innerHTML = Array.from({ length: nch }, (_, i) => `<button class="nt${i + 1 === this.chapter ? ' sel' : ''}" style="--c:${col}" data-c="${i + 1}">${i + 1}</button>`).join('');
    $('#verseGrid').innerHTML = Array.from({ length: nv }, (_, i) => `<button class="nt" style="--c:${col}" data-v="${i + 1}">${i + 1}</button>`).join('');
    $$('#chapGrid .nt').forEach(b => b.onclick = () => this.goto(this.book, +b.dataset.c));
    $$('#verseGrid .nt').forEach(b => b.onclick = e => this.clickVerse(+b.dataset.v, e.shiftKey));
    this.layoutGrids();
  },
  layoutGrids() {
    for (const g of [$('#chapGrid'), $('#verseGrid')]) {
      if (!g || !g.offsetParent) continue;
      const n = g.children.length, W = g.clientWidth, H = g.clientHeight;
      if (!n || !W || !H) continue;
      let best = 1, bestSize = 0;
      for (let cols = 1; cols <= Math.min(n, 24); cols++) {
        const size = Math.min(W / cols, H / Math.ceil(n / cols));
        if (size > bestSize) { bestSize = size; best = cols; }
      }
      g.style.gridTemplateColumns = `repeat(${best}, 1fr)`;
      g.style.gridTemplateRows = `repeat(${Math.ceil(n / best)}, minmax(26px, 1fr))`;
      g.style.fontSize = Math.max(11, Math.min(34, bestSize * 0.36)) + 'px';
    }
  },
  updateTitles() {
    $('#chapTitle').textContent = `${this.bookName(this.book, this.lang())} ${this.chapter}`;
    if ($('#chapHead')) this.renderNumGrids();
  },

  goto(book, chapter, scrollVerse) {
    const changed = book !== this.book || chapter !== this.chapter;
    this.book = book; this.chapter = chapter;
    if (changed) this.sel = null;
    $$('#bookGrid .bk').forEach(el => el.classList.toggle('sel', +el.dataset.b === book));
    $('#chapTitle').textContent = `${this.bookName(book, this.lang())} ${chapter}`;
    this.renderNumGrids();
    this.renderVerseList();
    if (scrollVerse) this.scrollToVerse(scrollVerse); else $('#verseList').scrollTop = 0;
  },

  // ---------- versions: list (operator) vs screen (projector) ----------
  toggleVer(set, v) {
    const s = this.cfg()[set];
    s[v] = !s[v];
    if (!s.vdc && !s.bsb) s[v === 'vdc' ? 'bsb' : 'vdc'] = true;   // keep at least one
    App.save(); this.syncVerButtons();
    if (set === 'list') this.renderVerseList();
    else if (this.liveRef && App.live.source && App.live.source.view === 'bible') this.project(this.liveRef, { quiet: true });
  },
  syncVerButtons() { $$('.vt').forEach(b => b.classList.toggle('on', !!this.cfg()[b.dataset.set][b.dataset.v])); },

  renderVerseList() {
    const L = this.cfg().list;
    const n = this.verses(this.book, this.chapter);
    let html = '';
    for (let v = 1; v <= n; v++) {
      const a = L.vdc ? this.text('vdc', this.book, this.chapter, v) : this.text('bsb', this.book, this.chapter, v);
      const b = L.vdc && L.bsb ? `<span class="en">${esc(this.text('bsb', this.book, this.chapter, v))}</span>` : '';
      html += `<div class="vrow" data-v="${v}"><b>${v}</b>${esc(a)}${b}</div>`;
    }
    $('#verseList').innerHTML = html;
    $$('#verseList .vrow').forEach(el => el.onclick = e => this.clickVerse(+el.dataset.v, e.shiftKey));
    this.markLive();
  },
  clickVerse(v, shift) {
    if (shift && this.sel) this.sel = { from: Math.min(this.sel.from, v), to: Math.max(this.sel.to, v) };
    else this.sel = { from: v, to: v };
    if (App.settings.clickShows) this.project(); else this.markLive();
  },
  scrollToVerse(v) { const el = $(`#verseList .vrow[data-v="${v}"]`); if (el) el.scrollIntoView({ block: 'center' }); },
  refText(lang, book, ch, from, to) { return `${this.bookName(book, lang)} ${ch}:${from}${to && to !== from ? '–' + to : ''}`; },
  currentRef() { if (this.sel) return { book: this.book, chapter: this.chapter, from: this.sel.from, to: this.sel.to }; return this.liveRef ? { ...this.liveRef } : null; },

  passage(r) {
    const S = this.cfg().screen;
    const get = (ver, lang, tag) => {
      const vs = [];
      for (let v = r.from; v <= r.to; v++) { const x = this.text(ver, r.book, r.chapter, v); if (x) vs.push((r.to > r.from ? v + ' ' : '') + x); }
      const ref = this.refText(lang, r.book, r.chapter, r.from, r.to) + (S.showTag === false ? '' : ` (${tag})`);
      return { text: vs.join(' '), ref, ver: tag };
    };
    const blocks = [];
    if (S.vdc) blocks.push(get('vdc', 'ro', 'VDC'));
    if (S.bsb) blocks.push(get('bsb', 'en', 'BSB'));
    return blocks;
  },
  nextRef(r) {
    const len = r.to - r.from + 1;
    let from = r.to + 1, ch = r.chapter;
    if (from > this.verses(r.book, ch)) { if (ch < this.chapters(r.book)) { ch++; from = 1; } else return null; }
    return { book: r.book, chapter: ch, from, to: Math.min(from + len - 1, this.verses(r.book, ch)) };
  },
  project(r, opts = {}) {
    r = r || { book: this.book, chapter: this.chapter, from: this.sel.from, to: this.sel.to };
    this.liveRef = r;
    const label = this.refText('ro', r.book, r.chapter, r.from, r.to);
    const vtext = []; for (let v = r.from; v <= r.to; v++) vtext.push(this.text('vdc', r.book, r.chapter, v));
    const go = () => { App.setView('bible'); this.goto(r.book, r.chapter, r.from); this.sel = { from: r.from, to: r.to }; this.markLive(); };
    App.show({ kind: 'bible', blocks: this.passage(r) }, label, {
      view: 'bible', key: 'bible:' + label, ref: r, text: vtext.join(' '),
      open: go, replay: () => { go(); this.project(r); },
      next: () => { const n = this.nextRef(r); if (!n) return '— ' + t('end of book') + ' —'; return `${this.refText('ro', n.book, n.chapter, n.from, n.to)} ${this.text('vdc', n.book, n.chapter, n.from)}`; },
    }, { dir: opts.dir, noHistory: opts.quiet });
    this.markLive();
    this.scrollToVerse(r.from);
  },
  markLive() {
    const r = this.liveRef;
    const isLive = App.live.view === 'text' && App.live.source && App.live.source.view === 'bible' && r && r.book === this.book && r.chapter === this.chapter;
    const inLive = v => !!(isLive && v >= r.from && v <= r.to);
    const inSel = v => !!(this.sel && v >= this.sel.from && v <= this.sel.to);
    $$('#verseList .vrow[data-v]').forEach(el => { const v = +el.dataset.v; el.classList.toggle('live', inLive(v)); el.classList.toggle('sel', inSel(v) && !inLive(v)); });
    $$('#verseGrid .nt').forEach(el => { const v = +el.dataset.v; el.classList.toggle('live', inLive(v)); el.classList.toggle('sel', inSel(v) && this.sel.from === v); el.classList.toggle('range', inSel(v) && this.sel.from !== v); });
  },
  // ←/→: move the selected verse(s) only; the screen changes when you press Show (Enter)
  selStep(d) {
    const r = this.sel ? this.currentRef() : (this.liveRef ? { ...this.liveRef } : { book: this.book, chapter: this.chapter, from: 0, to: 0 });
    const len = Math.max(1, r.to - r.from + 1);
    let from = d > 0 ? r.to + 1 : r.from - len, ch = r.chapter;
    if (from > this.verses(r.book, ch)) { if (ch < this.chapters(r.book)) { ch++; from = 1; } else return; }
    else if (from < 1) { if (r.from > 1) from = 1; else if (ch > 1) { ch--; from = Math.max(1, this.verses(r.book, ch) - len + 1); } else return; }
    const to = Math.min(from + len - 1, this.verses(r.book, ch));
    if (ch !== this.chapter || r.book !== this.book) this.goto(r.book, ch);
    this.sel = { from, to };
    this.markLive(); this.scrollToVerse(from);
  },
  step(d) {
    const live = App.live.view === 'text' && App.live.source && App.live.source.view === 'bible';
    const r = live && this.liveRef ? { ...this.liveRef } : (this.sel ? this.currentRef() : null);
    if (!r) { this.sel = { from: 1, to: 1 }; if (App.settings.clickShows) this.project(); else this.markLive(); return; }
    const len = r.to - r.from + 1;
    let from = d > 0 ? r.to + 1 : r.from - len, ch = r.chapter;
    const book = r.book;
    if (from > this.verses(book, ch)) { if (ch < this.chapters(book)) { ch++; from = 1; } else return; }
    else if (from < 1) { if (r.from > 1) from = 1; else if (ch > 1) { ch--; from = Math.max(1, this.verses(book, ch) - len + 1); } else return; }
    const to = Math.min(from + len - 1, this.verses(book, ch));
    if (ch !== this.chapter || book !== this.book) this.goto(book, ch);
    this.sel = { from, to };
    if (live || App.settings.clickShows) this.project({ book, chapter: ch, from, to }, { dir: d });
    else { this.markLive(); this.scrollToVerse(from); }
  },

  // ---------- smart search ----------
  focusSearch() {
    if (!Layout.show('bibleSearch')) { Layout.rects().bibleSearch = { x: 17, y: 9, w: 6, h: 15 }; App.save(); Layout.apply(); Layout.show('bibleSearch'); }
    $('#bibleSearch').focus(); $('#bibleSearch').select();
  },
  ensureIndex(ver) {
    if (this.idx[ver]) return this.idx[ver];
    const bib = ver === 'bsb' ? this.bsb : this.vdc, docs = [];
    bib.books.forEach((bk, b) => bk.chapters.forEach((ch, c) => ch.forEach((x, v) => docs.push({ id: b * 1e6 + (c + 1) * 1e3 + (v + 1), text: x }))));
    return (this.idx[ver] = new SearchIndex(docs, { loose: true }));
  },
  search() {
    const q = $('#bibleSearch').value.trim();
    const box = $('#bsResults');
    if (fold(q).length < 2) { box.innerHTML = ''; $('#bsHint').textContent = ''; return; }
    const scope = $('#bsScope').value, langSel = $('#bsLang').value;
    const okRef = id => { const b = Math.floor(id / 1e6); return scope === 'all' || (scope === 'ot' && b < 39) || (scope === 'nt' && b >= 39) || (scope === 'book' && b === this.book); };
    const res = new Map(); let fixed = null;
    const runs = (langSel === 'both' ? ['vdc', 'bsb'] : [langSel]).map(ver => ({ ver, r: this.ensureIndex(ver).query(q, 3000) }));
    // a version that understood the words as typed wins over one that had to "correct" them
    const clean = runs.filter(x => !x.r.fixed && x.r.hits.length);
    const use = clean.length ? clean : runs.sort((a, b) => b.r.hits.length - a.r.hits.length).slice(0, 1);
    for (const { ver, r } of use) {
      if (r.fixed) fixed = r.fixed;
      for (const h of r.hits) if (okRef(h.id)) { const k = h.id; const prev = res.get(k); if (!prev || prev.score < h.score) res.set(k, { id: k, ver, score: h.score }); }
    }
    // topics: related verses that don't use the exact words
    const tps = topicsFor(q);
    if (tps.length) {
      for (const ver of (langSel === 'both' ? ['vdc', 'bsb'] : [langSel])) {
        const ix = this.ensureIndex(ver);
        for (const tp of tps) for (const d of ix.docs) {
          if (!okRef(d.id) || res.has(d.id)) continue;
          if (tp.phrases.some(p => d.x.includes(' ' + p))) res.set(d.id, { id: d.id, ver, score: 5, topic: tp.name });
        }
      }
    }
    const hits = [...res.values()].sort((a, b) => b.score - a.score || a.id - b.id);
    const shown = hits.slice(0, 400);
    $('#bsHint').innerHTML = `${hits.length} ${t('results')}` + (fixed ? ` · ${t('Showing results for')} “${esc(fixed)}”` : '') + (tps.length ? ` · ${t('Topic')}: ${esc(tps.map(x => this.lang() === 'ro' ? x.ro : x.name).join(', '))}` : '');
    const toks = fold(fixed || q).split(' ').filter(w => w.length > 1).map(stem);
    const hl = (s) => s.split(/(\s+)/).map(w => { const f = fold(w); return f && toks.some(tk => f.startsWith(tk)) ? `<mark class="hl">${esc(w)}</mark>` : esc(w); }).join('');
    box.innerHTML = shown.length ? shown.map((h, i) => {
      const b = Math.floor(h.id / 1e6), c = Math.floor(h.id / 1e3) % 1e3, v = h.id % 1e3;
      return `<div class="item" data-i="${i}"><span class="ttl"><b>${esc(this.refText(h.ver === 'bsb' ? 'en' : this.lang(), b, c, v))}</b>${h.topic ? ` <span class="tag">${esc(h.topic)}</span>` : ''}<span class="snip">${hl(this.text(h.ver, b, c, v))}</span></span></div>`;
    }).join('') : `<div class="empty">${t('Nothing found.')}</div>`;
    $$('#bsResults .item').forEach(el => {
      const h = shown[+el.dataset.i], b = Math.floor(h.id / 1e6), c = Math.floor(h.id / 1e3) % 1e3, v = h.id % 1e3;
      el.onclick = () => { this.goto(b, c, v); this.sel = { from: v, to: v }; this.markLive(); };
      el.ondblclick = () => { this.goto(b, c, v); this.sel = { from: v, to: v }; this.project(); };
    });
  },

  // ---------- favorites (with notes) ----------
  addFavorite() {
    const r = this.currentRef();
    if (!r) { toast(t('Select a verse first')); return; }
    const favs = this.cfg().favorites;
    if (!favs.some(f => f.book === r.book && f.chapter === r.chapter && f.from === r.from && f.to === r.to)) favs.unshift({ ...r, note: '' });
    App.save(); this.renderFavorites();
    Layout.show('bibleFavorites');
    toast(t('Added to favorites') + ': ' + this.refText('ro', r.book, r.chapter, r.from, r.to));
  },
  renderFavorites() {
    const favs = this.cfg().favorites;
    $('#favList').innerHTML = favs.length ? favs.map((r, i) => `<div class="item fav" data-i="${i}">
        <div class="row gap"><b class="grow">♥ ${esc(this.refText(this.lang(), r.book, r.chapter, r.from, r.to))}</b><span class="act" style="display:inline-flex"><button data-x="1" title="${t('Remove')}">${icon('close')}</button></span></div>
        <span class="snip">${esc(this.text('vdc', r.book, r.chapter, r.from).slice(0, 160))}</span>
        <input class="fav-note" data-n="${i}" value="${esc(r.note || '')}" placeholder="${t('Add a note…')}"></div>`).join('')
      : `<div class="empty">${t('No favorites yet – select verses and press the star (or Ctrl+D).')}</div>`;
    $$('#favList .item').forEach(el => {
      const r = favs[+el.dataset.i];
      el.onclick = e => {
        if (e.target.closest('[data-x]')) { favs.splice(+el.dataset.i, 1); App.save(); this.renderFavorites(); return; }
        if (e.target.classList.contains('fav-note')) return;
        App.setView('bible'); this.goto(r.book, r.chapter, r.from); this.sel = { from: r.from, to: r.to }; this.markLive();
      };
      el.ondblclick = e => { if (e.target.classList.contains('fav-note')) return; this.goto(r.book, r.chapter, r.from); this.sel = { from: r.from, to: r.to }; this.project(); };
    });
    $$('#favList .fav-note').forEach(inp => inp.oninput = () => { favs[+inp.dataset.n].note = inp.value; App.save(); });
  },
};
