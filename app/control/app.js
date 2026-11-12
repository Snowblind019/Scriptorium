// Core of the control window: settings, live state (Show / Hide / Freeze), projector link,
// views (Songs / Bible / Settings), keybinds, histories, theme strip.
const KEY_ACTIONS = [
  ['show', 'Show selection on screen'], ['hide', 'Hide text from screen'], ['next', 'Next slide / verse on screen'], ['prev', 'Previous slide / verse on screen'],
  ['selNext', 'Select next (screen does not change until Show)'], ['selPrev', 'Select previous (screen does not change until Show)'],
  ['freeze', 'Freeze / unfreeze the projector'], ['black', 'Black screen'], ['clock', 'Clock on screen on/off'],
  ['switchView', 'Switch between Songs and Bible'], ['search', 'Search (songs or Bible words)'], ['playPause', 'Media: play / pause'],
  ['output', 'Projector output on/off'], ['favorite', 'Bible: add selection to favorites'], ['editLayout', 'Edit layout on/off'],
  ['newSong', 'New song'], ['addToList', 'Add to service list / playlist (with a click)'],
];
const DEFAULT_KEYS = {
  show: ['Enter'], hide: ['Escape'], next: ['ArrowDown', 'PageDown', 'Space'], prev: ['ArrowUp', 'PageUp'], selNext: ['ArrowRight'], selPrev: ['ArrowLeft'],
  freeze: ['F'], black: ['B'], clock: ['C'], switchView: ['Ctrl+Tab', 'F2'], search: ['Ctrl+F'], playPause: ['P'], output: ['F9'],
  favorite: ['Ctrl+D'], editLayout: ['Ctrl+E'], newSong: ['Ctrl+N'], addToList: ['Ctrl+Click'],
};

const App = {
  settings: null,
  view: 'songs',
  live: { view: 'clear', content: null, label: '', source: null },
  shownState: null,          // what the projector shows (differs while frozen)
  frozen: false,
  clockOn: false,
  outputOn: false,
  preview: null,
  nav: {},                   // view -> { next, prev, selection(), show() }
  history: { songs: [], bible: [] },
  stripStages: [],

  presetThemes() {
    const T = ScripRender.DEFAULT_THEME, M = ScripRender.merge;
    const base = JSON.parse(JSON.stringify(T));
    const anim = (id, name, anim, c, c2, a1, a2, extra = {}) => M(base, { id, name, bg: { type: 'animated', anim, color: c, color2: c2, angle: 160, a1, a2, dim: 0, speed: 1, density: 1, size: 1, opacity: 0.6, ...extra } });
    const grad = (id, name, c, c2, angle = 150) => M(base, { id, name, bg: { type: 'gradient', color: c, color2: c2, angle, dim: 0 } });
    return [
      M(base, { id: 'default', name: 'Default' }),
      M(base, { id: 'black', name: 'Black – white text', bg: { type: 'color', color: '#000000', dim: 0 } }),
      M(base, { id: 'night', name: 'Night sky', bg: { type: 'gradient', color: '#020611', color2: '#16305e', angle: 160, dim: 0 }, refColor: '#9fd0ff' }),
      anim('p-particles', 'Particles · Midnight', 'particles', '#050914', '#13224a', '#9fc2ff', '#ffffff'),
      anim('p-bokeh', 'Bokeh · Navy & gold', 'bokeh', '#070b18', '#1a2547', '#ffd479', '#7fa7ff', { opacity: 0.7 }),
      anim('p-flow', 'Gradient flow · Plum', 'flow', '#0d0a1a', '#1a1030', '#8a5cf6', '#2dd4bf', { speed: 0.6 }),
      anim('p-waves', 'Soft waves · Teal', 'waves', '#031417', '#06323a', '#5eead4', '#93c5fd'),
      anim('p-network', 'Network · Slate', 'network', '#0b0f14', '#1e293b', '#94a3b8', '#cbd5e1', { opacity: 0.5 }),
      anim('p-rays', 'Light rays · Amber', 'rays', '#140c05', '#2b1a0b', '#fcd34d', '#fda4af', { opacity: 0.55 }),
      anim('p-dust', 'Fine dust · Charcoal', 'dust', '#0a0a0a', '#1c1c1c', '#e5e7eb', '#fde68a'),
      anim('p-rings', 'Slow rings · Indigo', 'rings', '#070718', '#18183a', '#818cf8', '#c4b5fd', { speed: 0.7 }),
      anim('p-grid', 'Glow grid · Ocean', 'grid', '#020617', '#0c1a33', '#38bdf8', '#22d3ee', { opacity: 0.5 }),
      grad('p-charcoal', 'Charcoal', '#0e0e10', '#2a2a2e'),
      grad('p-burgundy', 'Burgundy', '#1f050c', '#4a1424'),
      grad('p-slate', 'Slate blue', '#0f172a', '#334155'),
      grad('p-deepgreen', 'Deep green', '#03140d', '#0f3a2a'),
    ];
  },

  defaultSettings() {
    return {
      version: 5, lang: 'en', startView: 'songs',
      uiTheme: 'dark', uiAccent: '#5b8dff', uiScale: 'auto', customColors: null,
      themes: this.presetThemes(), activeTheme: 'default',
      ui: JSON.parse(JSON.stringify(ScripRender.DEFAULT_UI)),
      bible: { list: { vdc: true, bsb: true }, screen: { vdc: true, bsb: true, showTag: true }, names: 'ro', favorites: [], histMode: 'both', bookStyle: 'groups' },
      songs: { repeatChorus: true, splitLines: 0, showTitle: false },
      clickShows: true, escClearsSearch: true, showTurnsOnProjector: true,
      keys: JSON.parse(JSON.stringify(DEFAULT_KEYS)),
      serviceList: [], serviceMeta: { name: '', dirty: false }, mediaLibrary: [],
      player: { volume: 0.8, loop: 'off', shuffle: false, toProjector: true, sinkId: '', playlist: [], addNewToPlaylist: true },
      layout: { views: {}, snap: true, zoneSet: 'holyrics', customZones: {}, saved: {}, active: {} },
      downloads: { kind: 'audio', aformat: 'mp3', aquality: '192', rate: '', vformat: 'mp4', vres: '1080' },
      projectorDisplayId: null, projectorOnStartup: false,
      update: { auto: true, skip: '' }, songSync: { folder: '' },
    };
  },

  migrate(saved) {
    const def = this.defaultSettings();
    if (!saved) return def;
    const s = ScripRender.merge(def, saved);
    s.themes = saved.themes || def.themes;
    s.keys = Object.assign({}, def.keys, saved.keys || {});
    if ((saved.version || 2) < 3) {
      // v2 → v3: new theme presets, bible/songs groups, favorites with notes
      const have = new Set(s.themes.map(t => t.id));
      for (const t of def.themes) if (!have.has(t.id)) s.themes.push(t);
      if (saved.bibleMode) s.bible.screen = { vdc: saved.bibleMode !== 'bsb', bsb: saved.bibleMode !== 'vdc' };
      if (saved.bibleNames) s.bible.names = saved.bibleNames;
      if (Array.isArray(saved.bibleFavorites)) s.bible.favorites = saved.bibleFavorites.map(r => ({ ...r, note: r.note || '' }));
      if (saved.repeatChorus != null) s.songs.repeatChorus = saved.repeatChorus;
      s.songs.splitLines = 0;
      s.layout = def.layout;
      for (const k of ['bibleMode', 'bibleNames', 'bibleFavorites', 'repeatChorus', 'splitLines', 'autoShowProjector', 'songBook']) delete s[k];
      s.version = 3;
    }
    if (s.version < 4) {
      // v3 → v4: ←/→ only move the selection; ↑/↓ change the screen
      s.keys.next = (s.keys.next || []).filter(k => k !== 'ArrowRight');
      s.keys.prev = (s.keys.prev || []).filter(k => k !== 'ArrowLeft');
      if (!saved.keys || !saved.keys.selNext) { s.keys.selNext = ['ArrowRight']; s.keys.selPrev = ['ArrowLeft']; }
      s.version = 4;
    }
    if (s.version < 5) {   // v4 → v5: text size became the automatic program size
      if (s.uiScale === 100 || s.uiScale == null) s.uiScale = 'auto';
      s.version = 5;
    }
    return s;
  },

  async init() {
    this.settings = this.migrate(await api.loadSettings());
    I18N.lang = this.settings.lang;
    this.applyUi();
    applyI18n(document);

    // panels
    const P = (id, title, opts) => Layout.register(id, title, $('#pc-' + id), opts);
    P('songList', 'Songs'); P('service', 'Service list'); P('songSlides', 'Song'); P('media', 'Media'); P('live', 'Live');
    P('songHistory', 'Song history'); P('themes', 'Themes', { compact: true });
    P('bibleBooks', 'Books'); P('bibleChapters', 'Chapters'); P('bibleVerses', 'Verses'); P('bibleText', 'Bible text');
    P('bibleSearch', 'Bible search'); P('bibleFavorites', 'Favorites'); P('bibleHistory', 'Bible history');
    Layout.init();

    this.preview = new ScripRender.Stage($('#preview'), { aspect: 16 / 9, mutedMedia: true, lowFps: true });
    this.pushState();

    $$('#viewTabs button').forEach(b => b.onclick = () => this.setView(b.dataset.view));
    const tick = () => { $('#clock').textContent = ScripRender.clockText(new Date(), this.settings.ui.overlays.clock.format, true); };
    tick(); setInterval(tick, 1000);
    this.initUpdates();

    $('#btnOutput').onclick = () => this.setOutput(!this.outputOn);
    api.onProjectorVisible(v => this.outputChanged(v));
    this.outputChanged(await api.projectorVisible());
    $('#btnShow').onclick = () => this.showSelection();
    $('#btnHide').onclick = () => this.hide();
    $('#btnFreeze').onclick = () => this.toggleFreeze();
    $('#histMode').value = this.settings.bible.histMode;
    $('#histMode').onchange = e => { this.settings.bible.histMode = e.target.value; this.save(); this.renderHistory('bible'); };
    $('#askOk').onclick = () => this._askDone(true);
    $('#askCancel').onclick = () => this._askDone(false);
    $('#askInput').addEventListener('keydown', e => { if (e.key === 'Enter') this._askDone(true); if (e.key === 'Escape') this._askDone(false); });
    $('#mergeOk').onclick = () => $('#mergeModal').classList.add('hidden');
    this.renderStrip();

    document.addEventListener('keydown', e => this.onKey(e), true);
    document.addEventListener('mousedown', e => { if (!e.target.closest('.dd')) $$('.menu').forEach(m => m.classList.add('hidden')); });
  },

  applyUi() {
    const s = this.settings, root = document.documentElement;
    root.dataset.ui = s.uiTheme === 'custom' ? 'dark' : s.uiTheme;
    root.style.cssText = '';
    if (s.uiTheme === 'custom' && s.customColors) for (const [k, v] of Object.entries(s.customColors)) root.style.setProperty('--' + k, v);
    root.style.setProperty('--accent', s.uiTheme === 'custom' && s.customColors && s.customColors.accent ? s.customColors.accent : s.uiAccent);
    document.body.style.fontSize = '14px';
    this.applyZoom();
  },

  // The layout was designed for big screens; on laptops the whole interface is scaled down so
  // nothing overlaps. "Automatic" picks the size from the window; Settings › Program appearance can fix it.
  zoomFor() {
    const s = this.settings.uiScale;
    if (s !== 'auto' && s != null && !isNaN(+s)) return Math.max(0.5, Math.min(2, +s / 100));
    const z = api.getZoom() || 1, w = innerWidth * z, h = innerHeight * z;   // size in real CSS pixels
    return Math.max(0.62, Math.min(1, w / 1480, h / 830));
  },
  applyZoom() {
    const z = Math.round(this.zoomFor() * 100) / 100;
    if (Math.abs((api.getZoom() || 1) - z) > 0.005) api.setZoom(z);
    if (!this._zoomBound) { this._zoomBound = true; addEventListener('resize', debounce(() => this.applyZoom(), 150)); }
  },

  save: debounce(function () { api.saveSettings(App.settings); }, 400),

  // switch the interface language in place (no reload: the projector and the open song/verse stay as they are)
  async setLanguage(lang) {
    this.settings.lang = lang === 'ro' ? 'ro' : 'en';
    I18N.lang = this.settings.lang;
    await api.saveSettings(this.settings);
    const safe = f => { try { f(); } catch (e) { console.error(e); } };
    safe(() => applyI18n(document));
    safe(() => Layout.apply());
    safe(() => this.outputChanged(this.outputOn));
    safe(() => { this.renderHistory('songs'); this.renderHistory('bible'); this.pushState(); });
    safe(() => { Songs.fillBookSelect(); Songs.search(); if (Songs.current) Songs.open(Songs.current, true); else $('#songTitle').textContent = t('Select a song'); });
    safe(() => { Bible.renderBooks(); Bible.updateTitles(); Bible.renderVerseList(); Bible.renderFavorites(); if ($('#bibleSearch').value) Bible.search(); });
    safe(() => { $('#bkFit').textContent = t('Fit'); $('#bkStyle').title = t('Tiles / list'); });
    safe(() => Service.render());
    safe(() => { Player.ui(); Player.renderLibrary(); Player.renderPlaylist(); Downloader.fillFormats(); Downloader.refreshTools(); });
    safe(() => { if (this.view === 'settings') { Settings.renderNav(); Settings.show(Settings.sec); } });
  },

  ask(question, def = '') {
    $('#askText').textContent = question; $('#askInput').value = def;
    $('#askModal').classList.remove('hidden'); setTimeout(() => $('#askInput').select(), 0);
    return new Promise(res => { this._askRes = res; });
  },
  _askDone(ok) { $('#askModal').classList.add('hidden'); const r = this._askRes; this._askRes = null; if (r) r(ok ? $('#askInput').value.trim() : null); },

  activeTheme() { return this.settings.themes.find(t => t.id === this.settings.activeTheme) || this.settings.themes[0]; },
  setActiveTheme(id) {
    this.settings.activeTheme = id;
    this.save(); this.pushState(); this.renderStrip();
    if (typeof Settings !== 'undefined') Settings.refreshIfOpen();
  },
  renderStrip() {
    this.stripStages.forEach(s => s.destroy());
    $('#themeStrip').innerHTML = this.settings.themes.map(th =>
      `<div><div class="thumb${th.id === this.settings.activeTheme ? ' on' : ''}" data-id="${esc(th.id)}" title="${esc(th.name)}"><div class="th-stage"></div></div><div class="thumb-name">${esc(th.name)}</div></div>`).join('');
    this.stripStages = $$('#themeStrip .thumb').map(el => {
      const th = this.settings.themes.find(x => x.id === el.dataset.id);
      const st = new ScripRender.Stage(el.querySelector('.th-stage'), { aspect: 16 / 9, mutedMedia: true, static: true });
      st.render({ theme: Object.assign({}, th, { songMax: 640, padding: 10 }), view: 'text', content: { kind: 'text', text: 'Aa' } });
      el.onclick = () => this.setActiveTheme(th.id);
      return st;
    });
  },

  // ---------- views ----------
  setView(v) {
    const prev = this.view;
    this.view = v;
    $$('#viewTabs button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    const isWs = v !== 'settings';
    $('#ws').classList.toggle('hidden', !isWs);
    $('#settingsView').classList.toggle('hidden', isWs);
    $('#lyEdit').classList.toggle('hidden', !isWs);
    if (!isWs && Layout.editing) Layout.setEditing(false);
    if (isWs) { Layout.setView(v); this.renderHistory(v); }
    if (v === 'settings') Settings.open();
    if (v === 'songs') setTimeout(() => { if (Layout.visible('songList')) $('#songSearch').focus(); }, 0);
    if (v === 'bible') setTimeout(() => { $('#bibleRef').focus(); Bible.layoutGrids(); }, 0);
    if (prev !== v) document.dispatchEvent(new CustomEvent('view-changed'));
  },

  // ---------- projector output ----------
  async setOutput(on) { this.outputChanged(await api.showProjector(on)); },
  outputChanged(v) {
    this.outputOn = v;
    $('#btnOutput').classList.toggle('live', v);
    $('#outLabel').textContent = t(v ? 'Projector on' : 'Projector off');
    $('#liveDot').classList.toggle('on', v);
  },

  // ---------- live ----------
  // put content on screen (replaces whatever is there, Bible or song)
  show(content, label, source, opts = {}) {
    if (this.settings.showTurnsOnProjector && !this.outputOn) this.setOutput(true);
    const same = this.live.view === 'text' && JSON.stringify(this.live.content) === JSON.stringify(content);
    if (same) return;                         // pressing Show again does nothing
    this.live = { view: 'text', content, label, source };
    this.pushState({ dir: opts.dir || 0 });
    if (label && !opts.noHistory && source && source.view) this.addHistory(source.view, label, source);
  },
  showSelection() {
    const n = this.nav[this.view];
    if (n && n.show) n.show();
  },
  hide() {
    if (this.live.view === 'clear') return;   // pressing Hide again does nothing
    this.live = { view: 'clear', content: null, label: '', source: null };
    this.pushState();
  },
  toggleBlack() { this.live.view = this.live.view === 'black' ? 'clear' : 'black'; if (this.live.view === 'black') { this.live.content = null; this.live.source = null; } this.pushState(); },
  toggleClock() { this.clockOn = !this.clockOn; this.pushState(); },
  toggleFreeze() {
    this.frozen = !this.frozen;
    $('#btnFreeze').classList.toggle('on', this.frozen);
    $('#frozenTag').classList.toggle('hidden', !this.frozen);
    this.pushState();
    toast(t(this.frozen ? 'Projector frozen – changes stay off screen until you unfreeze' : 'Projector unfrozen'));
  },

  stateFor(hint) {
    return { theme: this.activeTheme(), ui: this.settings.ui, view: this.live.view, content: this.live.content, overlay: { clock: this.clockOn }, hint: hint || {} };
  },
  pushState(hint) {
    const st = this.stateFor(hint);
    if (!this.frozen) { api.sendState(st); this.preview.render(st); this.shownState = st; }
    else if (this.shownState) { const s2 = { ...this.shownState, theme: st.theme, ui: st.ui }; this.preview.render(s2); }
    $('#liveLabel').textContent = this.live.view === 'black' ? t('BLACK') : this.live.view === 'clear' ? t('hidden') : (this.live.label || '');
    const nx = this.live.source && this.live.source.next ? this.live.source.next() : null;
    $('#nextLine').innerHTML = nx ? `<b>${t('Next')}:</b> ${esc(nx)}` : '';
    document.dispatchEvent(new CustomEvent('live-changed'));
  },
  // re-send theme / options without content effects (settings changed)
  refreshProjector() { this.pushState(); },

  // ---------- histories (separate for songs and Bible) ----------
  addHistory(view, label, source) {
    const H = this.history[view];
    const key = source.key || label;
    if (H[0] && H[0].key === key) return;
    this.history[view] = [{ key, label, text: source.text || '', source }, ...H.filter(h => h.key !== key)].slice(0, 80);
    this.renderHistory(view);
  },
  renderHistory(view) {
    const box = view === 'bible' ? $('#bibleHistory') : $('#songHistory');
    const H = this.history[view];
    const mode = this.settings.bible.histMode;
    box.innerHTML = H.length ? H.map((h, i) => {
      if (view !== 'bible') return `<div class="item" data-i="${i}"><span class="ttl">${esc(h.label)}</span></div>`;
      const ref = `<b>${esc(h.label)}</b>`, txt = esc(h.text);
      return `<div class="item" data-i="${i}"><span class="ttl">${mode === 'ref' ? ref : mode === 'text' ? txt : ref + ' <span class="muted">' + txt + '</span>'}</span></div>`;
    }).join('') : `<div class="empty">${t('Nothing shown yet.')}</div>`;
    $$('.item', box).forEach(el => {
      const h = H[+el.dataset.i];
      el.onclick = () => h.source.open && h.source.open();
      el.ondblclick = () => h.source.replay && h.source.replay();
    });
  },

  // ---------- keyboard ----------
  comboOf(e) {
    let k = e.key;
    if (k === ' ') k = 'Space';
    if (k.length === 1) k = k.toUpperCase();
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return null;
    return (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey && k.length > 1 ? 'Shift+' : '') + k;
  },
  actionFor(combo) {
    for (const [a, list] of Object.entries(this.settings.keys)) if ((list || []).includes(combo)) return a;
    return null;
  },
  clickMacro(e) {   // e.g. Ctrl+Click → add to service list / playlist
    const list = this.settings.keys.addToList || [];
    const c = (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + 'Click';
    return list.includes(c);
  },
  onKey(e) {
    if (Settings.capturing) return;
    const modal = ['#modal', '#booksModal', '#askModal', '#updModal', '#mergeModal'].some(m => !$(m).classList.contains('hidden'));
    if (modal) return;
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = (tag === 'input' && !['checkbox', 'range', 'color', 'radio'].includes(e.target.type)) || tag === 'textarea' || tag === 'select';
    const combo = this.comboOf(e);
    if (!combo) return;
    // Esc inside a search box clears the search (keeps Bible position)
    if (typing && e.key === 'Escape') {
      e.preventDefault();
      if (this.settings.escClearsSearch && e.target.type === 'search' && e.target.value) { e.target.value = ''; e.target.dispatchEvent(new Event('input')); }
      else e.target.blur();
      return;
    }
    const action = this.actionFor(combo);
    const strong = /^(Ctrl|Alt)\+|^F\d+$/.test(combo);
    if (typing && !strong) return;
    if (!action) {
      if (this.view === 'bible' && !typing && /^[\p{L}0-9]$/u.test(e.key) && !e.ctrlKey && !e.altKey) { $('#bibleRef').value = ''; $('#bibleRef').focus(); }
      else if (this.view === 'songs' && !typing && /^[\p{L}0-9]$/u.test(e.key) && !e.ctrlKey && !e.altKey && Layout.visible('songList')) { $('#songSearch').value = ''; $('#songSearch').focus(); }
      return;
    }
    if (this.view === 'settings' && !['switchView', 'output', 'freeze', 'hide'].includes(action)) return;
    e.preventDefault(); e.stopPropagation();
    const n = this.nav[this.view];
    switch (action) {
      case 'show': this.showSelection(); break;
      case 'hide': this.hide(); break;
      case 'next': n && n.next(); break;
      case 'prev': n && n.prev(); break;
      case 'selNext': n && n.selStep && n.selStep(1); break;
      case 'selPrev': n && n.selStep && n.selStep(-1); break;
      case 'freeze': this.toggleFreeze(); break;
      case 'black': this.toggleBlack(); break;
      case 'clock': this.toggleClock(); break;
      case 'switchView': this.setView(this.view === 'bible' ? 'songs' : 'bible'); break;
      case 'search': if (this.view === 'bible') Bible.focusSearch(); else { Layout.show('songList'); $('#songSearch').select(); $('#songSearch').focus(); } break;
      case 'playPause': Player.toggle(); break;
      case 'output': this.setOutput(!this.outputOn); break;
      case 'favorite': if (this.view === 'bible') Bible.addFavorite(); break;
      case 'editLayout': Layout.setEditing(!Layout.editing); break;
      case 'newSong': Songs.edit(null); break;
    }
  },

  // ---------- song merges (update, sync folder, file) ----------
  // a short note for simple merges; a window listing the songs that were changed on two computers
  mergeReport(list, title) {
    list = (list || []).filter(Boolean);
    if (!list.length) return;
    const tot = k => list.reduce((n, m) => n + (Array.isArray(m[k]) ? m[k].length : +m[k] || 0), 0);
    const parts = [[tot('added'), 'new'], [tot('updated'), 'changed'], [tot('deleted'), 'deleted'], [tot('restored'), 'brought back']].filter(([n]) => n).map(([n, w]) => `${n} ${t(w)}`);
    const from = [...new Set(list.map(m => m.source).filter(Boolean))].join(', ');
    const conflicts = list.flatMap(m => m.conflicts || []);
    const text = (title || t('Songs merged')) + (from ? ` (${from})` : '') + ': ' + (parts.join(', ') || t('no changes'));
    if (!conflicts.length) { toast(text, 5000); return; }
    $('#mergeTitle').textContent = title || t('Songs merged');
    $('#mergeText').innerHTML = `${esc(text)}<div class="muted small" style="margin-top:8px">${esc(t('These songs were changed on both computers. The newer version was kept; the other one is in the song book “Conflicte la îmbinare / Merge conflicts”. Compare them and delete the copy you don’t need.'))}</div>`;
    const bookName = id => { const b = Songs.books.find(x => x.id === id); return b ? b.short || b.name : id; };
    $('#mergeList').innerHTML = conflicts.slice(0, 200).map(c => `<div class="item"><span class="num">${esc(c.number)}</span><span class="ttl">${esc(c.title)}${c.otherTitle && c.otherTitle !== c.title ? ` <span class="muted">/ ${esc(c.otherTitle)}</span>` : ''}</span><span class="tag">${esc(bookName(c.book))}</span></div>`).join('');
    $('#mergeModal').classList.remove('hidden');
  },

  // ---------- updates (GitHub releases) ----------
  initUpdates() {
    api.onUpdateAvailable(info => this.showUpdate(info));
    api.onUpdateProgress(p => {
      $('#updBar').style.width = (p.pct || 0).toFixed(1) + '%';
      $('#updStatus').textContent = t('Downloading') + '… ' + (p.total ? `${(p.got / 1048576).toFixed(1)} / ${(p.total / 1048576).toFixed(1)} MB` : '');
    });
    $('#updLater').onclick = () => $('#updModal').classList.add('hidden');
    $('#updSkip').onclick = () => { this.settings.update.skip = this.update && this.update.version; this.save(); $('#updModal').classList.add('hidden'); };
    $('#updGo').onclick = () => this.runUpdate();
    $('#updPage').onclick = () => api.updateOpenPage();
  },
  showUpdate(info) {
    this.update = info;
    $('#updTitle').textContent = `${t('A new version of Scriptorium is available')}: ${info.version}`;
    $('#updSub').textContent = `${t('You have')} ${info.current}` + (info.date ? ` · ${t('released')} ${new Date(info.date).toLocaleDateString()}` : '') + (info.size ? ` · ${(info.size / 1048576).toFixed(0)} MB` : '');
    $('#updNotes').textContent = info.notes || '';
    $('#updNotes').classList.toggle('hidden', !info.notes);
    $('#updProg').classList.add('hidden'); $('#updBar').style.width = '0%';
    $('#updStatus').textContent = info.canInstall ? t('Your songs are backed up first and merged with the songs in the new version – nothing is lost.') : t('This copy can’t update itself – open the download page and install the new version.');
    $('#updGo').classList.toggle('hidden', !info.canInstall);
    for (const b of ['#updGo', '#updLater', '#updSkip']) $(b).disabled = false;
    $('#updModal').classList.remove('hidden');
  },
  async runUpdate() {
    for (const b of ['#updGo', '#updLater', '#updSkip']) $(b).disabled = true;
    $('#updProg').classList.remove('hidden');
    try {
      await api.updateDownload();
      $('#updStatus').textContent = t('Installing – Scriptorium restarts by itself…');
      await api.saveSettings(this.settings);
      const r = await api.updateInstall();
      if (r && r.manual) $('#updStatus').textContent = t('The download page was opened.');
    } catch (e) {
      $('#updStatus').textContent = t('Update failed') + ': ' + String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      for (const b of ['#updGo', '#updLater', '#updSkip']) $(b).disabled = false;
    }
  },
};

window.addEventListener('DOMContentLoaded', async () => {
  await App.init();
  // each part starts on its own: a problem in one (e.g. a damaged list) must not stop the others
  for (const [name, fn] of [['songs', () => Songs.init()], ['service', () => Service.init()], ['bible', () => Bible.init()], ['media', () => Player.init()], ['settings', () => Settings.init()]]) {
    try { await fn(); } catch (e) { console.error('init ' + name, e); toast(`${t('Problem starting')}: ${name} – ${e.message}`, 8000); }
  }
  App.setView(App.settings.startView === 'bible' ? 'bible' : 'songs');
  // what happened to the song database while starting (songs that came with an update, problems)
  const rep = await api.songsStartupReport();
  if (rep && rep.error) { $('#mergeTitle').textContent = t('The song database could not be opened'); $('#mergeText').textContent = rep.error; $('#mergeList').textContent = t('Nothing is changed until this is fixed. Your song files are in Settings › Song sync & backups › Open songs folder.'); $('#mergeModal').classList.remove('hidden'); }
  else if (rep && rep.bundled) App.mergeReport([{ ...rep.bundled, source: '' }], t('Songs updated with the new version'));
  if (rep && rep.damaged && rep.damaged.length) {
    const lost = rep.damaged.filter(d => !d.recovered).map(d => d.file);
    toast(t('A damaged song file was found') + ': ' + rep.damaged.map(d => d.file).join(', ') + ' – ' + (lost.length ? t('it was set aside; restore the songs from a backup or sync (Settings › Song sync & backups)') : t('it was restored from its .bak copy')), 12000);
  }
});
