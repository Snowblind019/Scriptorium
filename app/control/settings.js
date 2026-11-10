// Settings screen (full window, no live / media panels).
const Settings = {
  sec: 'general', editId: null, sample: 'song', stages: [], capturing: null,

  SECTIONS: [
    ['general', 'General'], ['projector', 'Projector & screens'], ['themes', 'Projector themes'], ['overlays', 'Clock, key & page'],
    ['marks', 'End-of-song mark & separator'], ['effects', 'Effects'], ['songs', 'Songs'], ['bible', 'Bible'],
    ['keys', 'Keyboard shortcuts'], ['layout', 'Layout'], ['appearance', 'Program appearance'], ['media', 'Media & downloads'], ['install', 'Shortcuts & about'],
  ],
  FONTS: ['Segoe UI', 'Arial', 'Calibri', 'Cambria', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Candara', 'Constantia', 'Corbel', 'Palatino Linotype', 'Book Antiqua', 'Bahnschrift', 'Franklin Gothic Medium', 'Noto Sans', 'Noto Serif', 'DejaVu Sans', 'Liberation Sans', 'Helvetica', 'Impact'],
  POS: [['top-left', 'Top left'], ['top-center', 'Top center'], ['top-right', 'Top right'], ['bottom-left', 'Bottom left'], ['bottom-center', 'Bottom center'], ['bottom-right', 'Bottom right'], ['center', 'Center']],
  FX_IN: [['none', 'None'], ['fade', 'Fade'], ['rise', 'Rise (fade + move up)'], ['sink', 'Settle (fade + move down)'], ['zoom', 'Gentle zoom'], ['blur', 'Blur to sharp'], ['focus', 'Focus (blur + zoom)']],
  FX_STEP: [['none', 'None (instant)'], ['crossfade', 'Cross-fade'], ['slide', 'Slide sideways (by direction)'], ['lift', 'Slide up/down (by direction)'], ['blur', 'Blur cross-fade'], ['zoom', 'Gentle zoom']],
  FX_SECTION: [['fadeThrough', 'Fade out, then in'], ['crossfade', 'Cross-fade'], ['blur', 'Blur'], ['zoom', 'Gentle zoom'], ['rise', 'Rise']],

  init() {
    $('#settingsView').innerHTML = `<nav class="set-nav" id="setNav"></nav><div class="set-body" id="setBody"></div>`;
    this.editId = App.settings.activeTheme;
  },
  open() { this.renderNav(); this.show(this.sec); },
  refreshIfOpen() { if (App.view === 'settings' && ['themes', 'appearance'].includes(this.sec)) this.show(this.sec); },
  renderNav() {
    $('#setNav').innerHTML = this.SECTIONS.map(([k, n]) => `<button data-s="${k}" class="${k === this.sec ? 'on' : ''}">${t(n)}</button>`).join('');
    $$('#setNav button').forEach(b => b.onclick = () => this.show(b.dataset.s));
  },

  // ---------- generic bound inputs ----------
  get(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); },
  set(obj, path, v) { const p = path.split('.'); let o = obj; while (p.length > 1) { const k = p.shift(); if (o[k] == null) o[k] = {}; o = o[k]; } o[p[0]] = v; },
  target(scope) { return scope === 'theme' ? this.editing() : App.settings; },
  f(label, html, cls = '') { return `<label class="${cls}"><span>${t(label)}</span>${html}</label>`; },
  rng(scope, path, min, max, step = 1, label) { const v = this.get(this.target(scope), path); return this.f(label, `<div class="rng"><input type="range" data-b="${scope}:${path}" data-num="1" min="${min}" max="${max}" step="${step}" value="${v}"><output>${v}</output></div>`); },
  col(scope, path, label) { return this.f(label, `<input type="color" data-b="${scope}:${path}" value="${this.get(this.target(scope), path) || '#ffffff'}">`); },
  sel(scope, path, opts, label) { const v = this.get(this.target(scope), path); return this.f(label, `<select data-b="${scope}:${path}">${opts.map(o => { const [a, b] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(a)}"${String(a) === String(v) ? ' selected' : ''}>${esc(t(b))}</option>`; }).join('')}</select>`); },
  chk(scope, path, label) { return `<label class="check${t(label).length > 42 ? ' wide' : ''}"><input type="checkbox" data-b="${scope}:${path}"${this.get(this.target(scope), path) ? ' checked' : ''}> <span>${t(label)}</span></label>`; },
  txt(scope, path, label) { return this.f(label, `<input data-b="${scope}:${path}" value="${esc(this.get(this.target(scope), path) || '')}">`); },
  bind(root, after) {
    $$('[data-b]', root).forEach(el => {
      const [scope, path] = el.dataset.b.split(':');
      const ev = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (el.dataset.num) v = parseFloat(v);
        this.set(this.target(scope), path, v);
        const out = el.parentElement.querySelector('output'); if (out) out.textContent = v;
        App.save();
        if (after) after(path, scope, el);
      });
    });
  },
  page(title, desc, body) { return `<h2>${t(title)}</h2>${desc ? `<div class="desc">${t(desc)}</div>` : ''}${body}`; },

  show(sec) {
    this.sec = sec;
    $$('#setNav button').forEach(b => b.classList.toggle('on', b.dataset.s === sec));
    this.stages.forEach(s => s.destroy()); this.stages = [];
    const box = $('#setBody');
    const fn = this['s_' + sec];
    box.innerHTML = fn ? fn.call(this) : '';
    if (this['b_' + sec]) this['b_' + sec](box);
  },

  // ---------- sections ----------
  s_general() {
    return this.page('General', '', `<div class="form cols">
      ${this.sel('app', 'lang', [['en', 'English'], ['ro', 'Romînă']], 'Interface language')}
      ${this.sel('app', 'startView', [['songs', 'Songs'], ['bible', 'Bible']], 'Open on start')}
      ${this.chk('app', 'clickShows', 'Clicking a slide or verse shows it immediately (otherwise click selects and Enter / Show puts it on screen)')}
      ${this.chk('app', 'escClearsSearch', 'Esc in a search box clears the search (the Bible stays on the same book, chapter and verse)')}
      ${this.chk('app', 'showTurnsOnProjector', 'Show turns the projector output on if it is off')}
      ${this.sel('app', 'bible.histMode', [['both', 'Reference + verse'], ['ref', 'Reference only'], ['text', 'Verse only']], 'Bible history shows')}
    </div>`);
  },
  b_general(box) { this.bind(box, p => { if (p === 'lang') App.setLanguage(App.settings.lang); if (p === 'bible.histMode') App.renderHistory('bible'); }); },

  s_projector() {
    return this.page('Projector & screens', 'The projector is a second screen connected with HDMI. In Windows press Win+P and choose “Extend” (macOS: Displays → use as separate display; Linux: display settings → join displays). Scriptorium then opens full-screen on that screen.',
      `<div class="form cols">
        ${this.f('Projector screen', '<select id="setDisplay"></select>')}
        ${this.chk('app', 'projectorOnStartup', 'Turn the projector output on automatically when the program starts (off by default)')}
        <div class="full row gap"><button class="btn sm" id="setTestOut">${t('Projector on / off')}</button></div>
      </div>`);
  },
  async b_projector(box) {
    this.bind(box);
    const ds = await api.listDisplays();
    if (!$('#setDisplay')) return;
    $('#setDisplay').innerHTML = `<option value="">${t('Automatic (first screen that is not the main one)')}</option>` + ds.map(d => `<option value="${d.id}">${esc(d.label)}</option>`).join('');
    $('#setDisplay').value = App.settings.projectorDisplayId != null ? String(App.settings.projectorDisplayId) : '';
    $('#setDisplay').onchange = async e => { App.settings.projectorDisplayId = e.target.value ? +e.target.value : null; await api.saveSettings(App.settings); await api.applyDisplay(); };
    $('#setTestOut').onclick = () => App.setOutput(!App.outputOn);
  },

  // ---------- themes ----------
  editing() { return App.settings.themes.find(x => x.id === this.editId) || App.settings.themes[0]; },
  s_themes() {
    const th = ScripRender.merge(ScripRender.DEFAULT_THEME, this.editing());
    Object.assign(this.editing(), th);
    const bg = th.bg, S = (...ty) => ty.includes(bg.type) ? '' : ' hidden';
    return this.page('Projector themes', 'Click a theme to edit it; “Use on screen” makes it live. Animated backgrounds are drawn live (no video files needed), so speed, density, size and opacity can be tuned.', `
      <div class="theme-edit">
        <div class="theme-list">
          <div id="themeList" class="list" style="max-height:380px"></div>
          <div class="row gap"><button id="thNew" class="btn sm">${t('+ New')}</button><button id="thDup" class="btn sm ghost">${t('Duplicate')}</button><button id="thDel" class="btn sm ghost danger">${t('Delete')}</button></div>
          <button id="thGallery" class="btn sm ghost">${t('Add the built-in themes again')}</button>
        </div>
        <div class="form">
          <div class="row gap"><div class="seg" id="thSample"><button data-s="song" class="on">${t('Song')}</button><button data-s="bible">${t('Bible')}</button><button data-s="both">VDC + BSB</button></div><div class="spacer"></div><button class="btn" id="thUse">${App.settings.activeTheme === th.id ? '● ' + t('On screen now') : t('Use on screen')}</button></div>
          <div id="thPreview" class="theme-preview"></div>
          <div class="form cols">
            ${this.txt('theme', 'name', 'Theme name')}
            <div class="sect">${t('Background')}</div>
            ${this.sel('theme', 'bg.type', [['color', 'Solid color'], ['gradient', 'Gradient'], ['animated', 'Animated (particles, waves…)'], ['image', 'Still image'], ['video', 'Moving video'], ['slideshow', 'Transitioning images']], 'Type')}
            ${this.col('theme', 'bg.color', 'Color')}
            <div class="${S('gradient', 'animated')}">${this.col('theme', 'bg.color2', 'Color 2')}</div>
            <div class="${S('gradient', 'animated')}">${this.rng('theme', 'bg.angle', 0, 360, 5, 'Angle')}</div>
            <div class="${S('animated')}">${this.sel('theme', 'bg.anim', Object.entries(ScripRender.ANIMS), 'Animation')}</div>
            <div class="${S('animated')}">${this.col('theme', 'bg.a1', 'Animation color 1')}</div>
            <div class="${S('animated')}">${this.col('theme', 'bg.a2', 'Animation color 2')}</div>
            <div class="${S('animated')}">${this.rng('theme', 'bg.speed', 0.1, 3, 0.1, 'Speed')}</div>
            <div class="${S('animated')}">${this.rng('theme', 'bg.density', 0.2, 3, 0.1, 'Density')}</div>
            <div class="${S('animated')}">${this.rng('theme', 'bg.size', 0.3, 3, 0.1, 'Size')}</div>
            <div class="${S('animated')}">${this.rng('theme', 'bg.opacity', 0.05, 1, 0.05, 'Opacity')}</div>
            <div class="${S('image')}">${this.f('Image', `<div class="row gap"><button class="btn sm ghost" data-pick="image">${t('Choose image…')}</button><span class="muted small">${esc(this.fileName(bg.image))}</span></div>`)}</div>
            <div class="${S('video')}">${this.f('Video (plays muted and looped)', `<div class="row gap"><button class="btn sm ghost" data-pick="video">${t('Choose video…')}</button><span class="muted small">${esc(this.fileName(bg.video))}</span></div>`)}</div>
            <div class="${S('video')}">${this.rng('theme', 'bg.videoSpeed', 0.25, 2, 0.05, 'Video speed')}</div>
            <div class="${S('slideshow')}">${this.f('Images', `<div class="row gap"><button class="btn sm ghost" data-pick="slides">${t('Add images…')}</button><span class="muted small">${(bg.slides || []).length}</span></div>`)}</div>
            <div class="${S('slideshow')}">${this.rng('theme', 'bg.interval', 3, 120, 1, 'Seconds per image')}</div>
            <div class="${S('slideshow', 'image')}">${this.rng('theme', 'bg.fade', 0, 8, 0.5, 'Cross-fade (seconds)')}</div>
            <div class="${S('image', 'video', 'slideshow')}">${this.sel('theme', 'bg.fit', [['cover', 'Fill screen'], ['contain', 'Fit whole picture']], 'Fit')}</div>
            <div class="${S('image', 'video', 'slideshow')}">${this.rng('theme', 'bg.mediaOpacity', 0.05, 1, 0.05, 'Picture / video opacity')}</div>
            ${this.rng('theme', 'bg.dim', 0, 0.9, 0.05, 'Darken background')}
            <div class="${S('image', 'video', 'slideshow')}">${this.rng('theme', 'bg.blur', 0, 20, 1, 'Blur')}</div>
            <div class="thumbs${S('slideshow')}">${(bg.slides || []).map((u, i) => `<div class="th" style="background-image:url('${u}')"><button data-rm="${i}">✕</button></div>`).join('')}</div>
            <div class="sect">${t('Text')}</div>
            ${this.sel('theme', 'font', this.FONTS, 'Font')}
            ${this.sel('theme', 'weight', [[400, 'Normal'], [500, 'Medium'], [600, 'Semi-bold'], [700, 'Bold'], [800, 'Extra bold']], 'Weight')}
            ${this.col('theme', 'color', 'Text color')}
            ${this.sel('theme', 'align', [['center', 'Center'], ['left', 'Left'], ['right', 'Right'], ['justify', 'Justify']], 'Alignment')}
            ${this.rng('theme', 'songMax', 30, 180, 2, 'Largest song text')}
            ${this.rng('theme', 'bibleMax', 30, 160, 2, 'Largest Bible text')}
            ${this.rng('theme', 'lineHeight', 1, 1.8, 0.02, 'Line spacing')}
            ${this.rng('theme', 'padding', 1, 15, 0.5, 'Margins (%)')}
            ${this.chk('theme', 'shadow', 'Text shadow')}
            ${this.chk('theme', 'outline', 'Text outline')}
            ${this.chk('theme', 'uppercase', 'Song text in capitals')}
            <div class="sect">${t('Bible reference & song footer')}</div>
            ${this.col('theme', 'refColor', 'Reference color')}
            ${this.rng('theme', 'refSize', 18, 90, 2, 'Reference size')}
            ${this.rng('theme', 'vdcScale', 50, 150, 5, 'VDC text size (%)')}
            ${this.rng('theme', 'bsbScale', 50, 150, 5, 'BSB text size (%)')}
            ${this.chk('theme', 'bsbItalic', 'BSB in italics')}
            ${this.rng('theme', 'footerSize', 14, 60, 2, 'Song title size (when shown – see Settings › Songs)')}
          </div>
        </div>
      </div>`);
  },
  b_themes(box) {
    const L = App.settings.themes;
    $('#themeList').innerHTML = L.map(x => `<div class="item${x.id === this.editId ? ' sel' : ''}" data-id="${x.id}"><span class="ttl">${esc(x.name)}</span>${x.id === App.settings.activeTheme ? `<span class="tag">● ${t('on screen')}</span>` : ''}</div>`).join('');
    $$('#themeList .item').forEach(el => { el.onclick = () => { this.editId = el.dataset.id; this.show('themes'); }; el.ondblclick = () => App.setActiveTheme(el.dataset.id); });
    $('#thNew').onclick = () => this.addTheme(JSON.parse(JSON.stringify(ScripRender.DEFAULT_THEME)), t('New theme'));
    $('#thDup').onclick = () => this.addTheme(JSON.parse(JSON.stringify(this.editing())), this.editing().name + ' (2)');
    $('#thDel').onclick = () => {
      if (L.length <= 1 || !confirm(t('Delete this theme?') + '\n' + this.editing().name)) return;
      const th = this.editing(); App.settings.themes = L.filter(x => x !== th);
      if (App.settings.activeTheme === th.id) App.settings.activeTheme = App.settings.themes[0].id;
      this.editId = App.settings.activeTheme; App.save(); App.renderStrip(); App.refreshProjector(); this.show('themes');
    };
    $('#thGallery').onclick = () => {
      const have = new Set(L.map(x => x.id)); let n = 0;
      for (const p of App.presetThemes()) if (!have.has(p.id)) { L.push(p); n++; }
      App.save(); App.renderStrip(); this.show('themes'); toast(`${n} ${t('themes added')}`);
    };
    $('#thUse').onclick = () => { App.setActiveTheme(this.editId); this.show('themes'); };
    $$('#thSample button').forEach(b => { b.classList.toggle('on', b.dataset.s === this.sample); b.onclick = () => { this.sample = b.dataset.s; $$('#thSample button').forEach(x => x.classList.toggle('on', x === b)); this.preview(); }; });
    $$('[data-pick]', box).forEach(b => b.onclick = () => this.pick(b.dataset.pick));
    $$('[data-rm]', box).forEach(b => b.onclick = () => { this.editing().bg.slides.splice(+b.dataset.rm, 1); this.themeChanged(); this.show('themes'); });
    this.thStage = new ScripRender.Stage($('#thPreview'), { aspect: 16 / 9, mutedMedia: true });
    this.stages.push(this.thStage);
    this.preview();
    this.bind(box, (p) => { this.themeChanged(); if (p === 'bg.type' || p === 'name') this.show('themes'); });
  },
  addTheme(th, name) { th.id = uid(); th.name = name; App.settings.themes.push(th); this.editId = th.id; App.save(); App.renderStrip(); this.show('themes'); },
  themeChanged() { this.preview(); if (this.editId === App.settings.activeTheme) App.refreshProjector(); this.stripLater(); },
  stripLater: debounce(() => App.renderStrip(), 700),
  fileName(u) { return u ? decodeURIComponent(u.split('/').pop()) : t('none'); },
  async pick(kind) {
    const th = this.editing();
    const files = await api.pickMedia(kind === 'video' ? 'video' : 'image');
    if (!files.length) return;
    if (kind === 'image') th.bg.image = files[0].url;
    if (kind === 'video') th.bg.video = files[0].url;
    if (kind === 'slides') th.bg.slides = (th.bg.slides || []).concat(files.map(f => f.url));
    App.save(); this.themeChanged(); this.show('themes');
  },
  sampleContent(kind, last) {
    if (kind === 'bible' || kind === 'both') return { kind: 'bible', blocks: [
      { text: 'Fiindcă atît de mult a iubit Dumnezeu lumea, că a dat pe singurul Lui Fiu, pentru ca oricine crede în El să nu piară, ci să aibă viaţa veşnică.', ref: 'Ioan 3:16 (VDC)', ver: 'VDC' },
      ...(kind === 'both' ? [{ text: 'For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life.', ref: 'John 3:16 (BSB)', ver: 'BSB' }] : [])] };
    return { kind: 'song', text: 'Doamne Mare, Te slăvim,\nNe-nchinăm puterii Tale,\nTe mărește ceru-ntreg,\nȘi-Ți înalță osanale', footer: 'CE 1 · Doamne Mare, Te slăvim', key: 'Sol', page: [4, 4], last: last !== false };
  },
  preview() { if (this.thStage) this.thStage.render({ theme: this.editing(), ui: App.settings.ui, view: 'text', content: this.sampleContent(this.sample), overlay: { clock: true } }); },

  // ---------- overlays ----------
  s_overlays() {
    const o = (name, label, extra = '') => `<div class="sect">${t(label)}</div>
      ${this.chk('app', `ui.overlays.${name}.on`, 'Always show')}
      ${this.sel('app', `ui.overlays.${name}.pos`, this.POS, 'Position')}
      ${this.rng('app', `ui.overlays.${name}.size`, 16, 120, 2, 'Size')}
      ${this.col('app', `ui.overlays.${name}.color`, 'Color')}
      ${this.rng('app', `ui.overlays.${name}.opacity`, 0.1, 1, 0.05, 'Opacity')}${extra}`;
    return this.page('Clock, key & page', 'Small indicators on the projector. The clock is always 24-hour; it can also be toggled with its shortcut (C). Key/chord and page n/N only appear while a song is on screen.', `
      <div class="form cols">
        ${o('clock', 'Clock (24 h)')}
        ${o('key', 'Song key / chord', this.txt('app', 'ui.overlays.key.prefix', 'Text before the key'))}
        ${o('page', 'Song page (e.g. 6/8)', this.sel('app', 'ui.overlays.page.style', [['fraction', '6/8'], ['words', '6 / 8'], ['dots', '● ○ ○ (dots)']], 'Style'))}
      </div><div id="ovPreview" class="demo-preview" style="margin-top:14px"></div>`);
  },
  b_overlays(box) { this.demoStage('#ovPreview', () => this.sampleContent('song', false)); this.bind(box, () => { App.refreshProjector(); this.demo(); }); },
  demoStage(sel, content) {
    const st = new ScripRender.Stage($(sel), { aspect: 16 / 9, mutedMedia: true }); this.stages.push(st);
    this.demo = () => st.render({ theme: App.activeTheme(), ui: App.settings.ui, view: 'text', content: content(), overlay: { clock: true } });
    this.demo();
  },

  // ---------- end mark & separator ----------
  s_marks() {
    const grid = (which) => `<div class="div-grid full">${Object.entries(ScripRender.DIVIDERS).map(([k, n]) => `<div class="div-opt${App.settings.ui[which].design === k ? ' on' : ''}" data-w="${which}" data-d="${k}">${ScripRender.dividerSvg(Object.assign({}, App.settings.ui[which], { design: k, width: 14, anim: 'none', opacity: 1 }), 'p')}<div>${t(n)}</div></div>`).join('')}</div>`;
    const params = (w) => `${this.rng('app', `ui.${w}.width`, 5, 90, 1, 'Length (% of screen width)')}${this.rng('app', `ui.${w}.height`, 8, 120, 1, 'Height')}${this.rng('app', `ui.${w}.thickness`, 1, 10, 0.5, 'Line thickness')}
      ${this.rng('app', `ui.${w}.gap`, 0, 120, 1, 'Space around the center ornament')}${this.rng('app', `ui.${w}.spacing`, 0, 120, 1, 'Spacing')}
      ${this.col('app', `ui.${w}.color`, 'Color')}${this.col('app', `ui.${w}.color2`, 'Fade-out color')}${this.rng('app', `ui.${w}.opacity`, 0.1, 1, 0.05, 'Opacity')}
      ${this.rng('app', `ui.${w}.glow`, 0, 30, 1, 'Glow')}${this.sel('app', `ui.${w}.anim`, [['none', 'No animation'], ['fade', 'Fade in'], ['draw', 'Draw in'], ['breathe', 'Slow breathe'], ['shimmer', 'Soft shimmer']], 'Effect')}`;
    return this.page('End-of-song mark & separator', 'The end-of-song mark appears under the text on the last slide of a song. The separator is the line between VDC and BSB when both are on screen.', `
      <div class="form cols">
        <div class="sect">${t('End-of-song mark')}</div>
        ${this.chk('app', 'ui.endMark.on', 'Show the mark on the last slide')}
        ${grid('endMark')}${params('endMark')}
        <div class="full"><div id="emPreview" class="demo-preview"></div></div>
        <div class="sect">${t('Separator between VDC and BSB')}</div>
        ${grid('bibleSep')}${params('bibleSep')}
        <div class="full"><div id="bsPreview" class="demo-preview"></div></div>
      </div>`);
  },
  b_marks(box) {
    const st1 = new ScripRender.Stage($('#emPreview'), { aspect: 16 / 9, mutedMedia: true }), st2 = new ScripRender.Stage($('#bsPreview'), { aspect: 16 / 9, mutedMedia: true });
    this.stages.push(st1, st2);
    const draw = () => {
      st1.render({ theme: App.activeTheme(), ui: App.settings.ui, view: 'text', content: { ...this.sampleContent('song'), text: 'Amin, amin, amin!\nSlavă Lui în veci!', n: Math.random() } });
      st2.render({ theme: App.activeTheme(), ui: App.settings.ui, view: 'text', content: { ...this.sampleContent('both'), n: Math.random() } });
    };
    draw();
    $$('.div-opt', box).forEach(el => el.onclick = () => { App.settings.ui[el.dataset.w].design = el.dataset.d; App.save(); App.refreshProjector(); this.show('marks'); });
    this.bind(box, () => { App.refreshProjector(); draw(); });
  },

  // ---------- effects ----------
  s_effects() {
    const E = 'ui.effects';
    return this.page('Effects', 'Subtle transitions on the projector. “Step” is used when you move to the next or previous slide/verse (the direction follows forward or back). “Switching” is used when the screen changes from a song to a Bible verse or back.', `
      <div class="form cols">
        <div class="sect">${t('Text appears')}</div>
        ${this.sel('app', E + '.in.type', this.FX_IN, 'Effect')}${this.rng('app', E + '.in.dur', 0, 2, 0.05, 'Duration (s)')}${this.rng('app', E + '.in.dist', 0, 80, 1, 'Distance')}
        <div class="sect">${t('Text is taken down')}</div>
        ${this.sel('app', E + '.out.type', this.FX_IN, 'Effect')}${this.rng('app', E + '.out.dur', 0, 2, 0.05, 'Duration (s)')}${this.rng('app', E + '.out.dist', 0, 80, 1, 'Distance')}
        <div class="sect">${t('Step forward / back')}</div>
        ${this.sel('app', E + '.step.type', this.FX_STEP, 'Effect')}${this.rng('app', E + '.step.dur', 0, 2, 0.05, 'Duration (s)')}${this.rng('app', E + '.step.dist', 0, 120, 1, 'Distance')}
        ${this.chk('app', E + '.step.songs', 'Use for songs')}${this.chk('app', E + '.step.bible', 'Use for Bible verses')}
        <div class="sect">${t('Switching between song and Bible')}</div>
        ${this.sel('app', E + '.section.type', this.FX_SECTION, 'Effect')}${this.rng('app', E + '.section.dur', 0, 2.5, 0.05, 'Duration (s)')}
        <div class="full row gap"><button class="btn sm" data-demo="in">${t('Try: appear')}</button><button class="btn sm" data-demo="next">${t('Try: next')}</button><button class="btn sm" data-demo="prev">${t('Try: back')}</button><button class="btn sm" data-demo="switch">${t('Try: switch to Bible')}</button><button class="btn sm" data-demo="out">${t('Try: take down')}</button></div>
        <div class="full"><div id="fxPreview" class="demo-preview"></div></div>
      </div>`);
  },
  b_effects(box) {
    const st = new ScripRender.Stage($('#fxPreview'), { aspect: 16 / 9, mutedMedia: true }); this.stages.push(st);
    let n = 1;
    const song = i => ({ kind: 'song', text: ['Doamne Mare, Te slăvim,\nNe-nchinăm puterii Tale', 'Orice glas de heruvim\nSe înalță către Tine', 'Al apostolilor cor,\nA profeților oștire'][i % 3], footer: 'CE 1', page: [i % 3 + 1, 3] });
    const R = (content, hint) => st.render({ theme: App.activeTheme(), ui: App.settings.ui, view: content ? 'text' : 'clear', content, hint });
    R(song(0));
    $$('[data-demo]', box).forEach(b => b.onclick = () => {
      const d = b.dataset.demo;
      if (d === 'in') { R(null); setTimeout(() => R(song(n)), 450); }
      if (d === 'out') R(null);
      if (d === 'next') R(song(++n), { dir: 1 });
      if (d === 'prev') R(song(--n + 300), { dir: -1 });
      if (d === 'switch') R(this.sampleContent('both'));
    });
    this.bind(box, () => App.refreshProjector());
  },

  s_songs() {
    return this.page('Songs', 'If a song has one chorus written once, it can be repeated after every verse automatically. Songs with two or more different choruses are shown exactly as written (labelled R1, R2…). Long slides can be split into parts (e.g. 3·1 and 3·2) – this only affects slides longer than the chosen number of lines.', `
      <div class="form cols">
        ${this.chk('app', 'songs.showTitle', 'Show the song number and title on the projector (under the lyrics)')}
        ${this.chk('app', 'songs.repeatChorus', 'Repeat a single chorus after every verse')}
        ${this.sel('app', 'songs.splitLines', [[0, 'Never split slides'], [4, 'Split slides longer than 4 lines'], [6, 'Split slides longer than 6 lines'], [8, 'Split slides longer than 8 lines'], [10, 'Split slides longer than 10 lines']], 'Long slides')}
      </div>`);
  },
  b_songs(box) { this.bind(box, (p, s, el) => { if (p === 'songs.splitLines') App.settings.songs.splitLines = +el.value; App.save(); if (Songs.current) Songs.open(Songs.current, true); if (p === 'songs.showTitle' && App.live.source && App.live.source.song && App.live.view === 'text') Songs.showSlide(App.live.source.idx); }); },

  s_bible() {
    return this.page('Bible', '“List” versions are what you see in the verse list; “Screen” versions are what goes on the projector. They are independent – e.g. read VDC + BSB in the list while only VDC is on screen.', `
      <div class="form cols">
        ${this.chk('app', 'bible.list.vdc', 'List: VDC')}${this.chk('app', 'bible.list.bsb', 'List: BSB (under VDC)')}
        ${this.chk('app', 'bible.screen.vdc', 'Screen: VDC')}${this.chk('app', 'bible.screen.bsb', 'Screen: BSB')}
        ${this.chk('app', 'bible.screen.showTag', 'Show (VDC) / (BSB) after the reference on the projector')}
        ${this.sel('app', 'bible.names', [['ro', 'Romanian'], ['en', 'English']], 'Book names')}
        ${this.sel('app', 'bible.bookStyle', [['groups', 'Grouped tiles'], ['list', 'Compact list']], 'Books panel style')}
      </div>`);
  },
  b_bible(box) { this.bind(box, () => { Bible.syncVerButtons(); Bible.renderBooks(); Bible.renderVerseList(); if (Bible.liveRef && App.live.source && App.live.source.view === 'bible' && App.live.view === 'text') Bible.project(Bible.liveRef, { quiet: true }); }); },

  // ---------- keys ----------
  s_keys() {
    const K = App.settings.keys;
    return this.page('Keyboard shortcuts', 'Click “Add” and press a key combination. Click a key to remove it. For “Add to service list / playlist” use a modifier with a click (e.g. Ctrl+Click).', `
      <div class="keys">${KEY_ACTIONS.map(([a, label]) => `<span>${t(label)}</span><span class="kb">${(K[a] || []).map((k, i) => `<kbd data-a="${a}" data-i="${i}" title="${t('Remove')}">${esc(k)}</kbd>`).join('')}</span><button class="btn sm ghost" data-add="${a}">${t('Add')}</button>`).join('')}</div>
      <div class="row gap" style="margin-top:14px"><button class="btn sm ghost" id="keysReset">${t('Reset to defaults')}</button></div>`);
  },
  b_keys(box) {
    const K = App.settings.keys;
    $$('kbd[data-a]', box).forEach(k => k.onclick = () => { K[k.dataset.a].splice(+k.dataset.i, 1); App.save(); this.show('keys'); });
    $('#keysReset').onclick = () => { App.settings.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS)); App.save(); this.show('keys'); };
    $$('[data-add]', box).forEach(b => b.onclick = () => {
      const a = b.dataset.add;
      b.textContent = a === 'addToList' ? t('Hold a modifier and click here…') : t('Press keys…'); b.classList.add('capture');
      this.capturing = a;
      const done = (combo) => {
        this.capturing = null; window.removeEventListener('keydown', kd, true); b.removeEventListener('mousedown', md, true);
        if (combo) { K[a] = K[a] || []; if (!K[a].includes(combo)) K[a].push(combo); App.save(); }
        this.show('keys');
      };
      const kd = e => { if (a === 'addToList') { if (e.key === 'Escape') done(null); return; } e.preventDefault(); e.stopPropagation(); if (e.key === 'Escape' && !e.ctrlKey) { done('Escape'); return; } const c = App.comboOf(e); if (c) done(c); };
      const md = e => { if (a !== 'addToList') return; e.preventDefault(); e.stopPropagation(); const c = (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + 'Click'; done(c === 'Click' ? null : c); };
      window.addEventListener('keydown', kd, true); b.addEventListener('mousedown', md, true);
    });
  },

  s_layout() {
    const cz = App.settings.layout.customZones || {}, sv = App.settings.layout.saved || {};
    return this.page('Layout', 'Use “Edit layout” in the top bar (or Ctrl+E) on the Songs or Bible screen to move, resize, add and remove panels, stack them as tabs, or detach them as floating windows.', `
      <div class="form cols">
        ${this.chk('app', 'layout.snap', 'Snap panels to the grid and to zones')}
        <div class="full row gap"><button class="btn sm ghost" id="lyResetAll">${t('Reset both screens to the default layout')}</button></div>
        <div class="sect">${t('My zones')}</div>
        <div class="full">${Object.keys(cz).length ? Object.entries(cz).map(([k, z]) => `<div class="row gap"><span>${esc(z.name)} (${z.zones.length})</span><button class="btn sm ghost danger" data-dz="${k}">${t('Delete')}</button></div>`).join('') : `<span class="muted">${t('None yet – in Edit layout, arrange panels and click “Make zones from this layout”.')}</span>`}</div>
        <div class="sect">${t('My layouts')}</div>
        <div class="full">${Object.keys(sv).length ? Object.keys(sv).map(n => `<div class="row gap"><span>${esc(n)}</span><button class="btn sm ghost danger" data-dl="${esc(n)}">${t('Delete')}</button></div>`).join('') : `<span class="muted">${t('None yet.')}</span>`}</div>
      </div>`);
  },
  b_layout(box) {
    this.bind(box);
    $('#lyResetAll').onclick = () => { if (confirm(t('Reset both screens to the default layout?'))) { App.settings.layout.views = {}; App.save(); toast(t('Layout reset')); } };
    $$('[data-dz]', box).forEach(b => b.onclick = () => { delete App.settings.layout.customZones[b.dataset.dz]; App.save(); this.show('layout'); });
    $$('[data-dl]', box).forEach(b => b.onclick = () => { delete App.settings.layout.saved[b.dataset.dl]; App.save(); this.show('layout'); });
  },

  // ---------- program appearance ----------
  VARS: [['bg', 'Background'], ['panel', 'Panels'], ['panel2', 'Inputs & lists'], ['line', 'Lines'], ['text', 'Text'], ['muted', 'Secondary text'], ['accent', 'Accent'], ['sel', 'Selection'], ['live', 'Live / danger']],
  s_appearance() {
    const s = App.settings, cs = s.customColors || {};
    const cur = getComputedStyle(document.documentElement);
    return this.page('Program appearance', 'Choose a ready-made look or make your own colors.', `
      <div class="form cols">
        ${this.sel('app', 'uiTheme', [['dark', 'Dark'], ['light', 'Light'], ['classic', 'Classic (Holyrics-like)'], ['midnight', 'Midnight blue'], ['warm', 'Warm'], ['contrast', 'High contrast'], ['custom', 'Custom colors']], 'Program theme')}
        ${this.col('app', 'uiAccent', 'Accent color')}
        ${this.sel('app', 'uiScale', [['auto', 'Automatic (fits the screen)'], ['70', '70%'], ['80', '80%'], ['90', '90%'], ['100', '100%'], ['110', '110%'], ['125', '125%'], ['140', '140%']], 'Program size')}
        <div class="sect">${t('Custom colors')}</div>
        <div class="full colors-grid">${this.VARS.map(([k, n]) => `<label class="field"><span>${t(n)}</span><input type="color" data-cv="${k}" value="${cs[k] || this.toHex(cur.getPropertyValue('--' + k))}"></label>`).join('')}</div>
        <div class="full muted small">${t('Changing a custom color switches the program theme to “Custom colors”.')}</div>
      </div>`);
  },
  toHex(c) { c = (c || '').trim(); if (c.startsWith('#')) return c.length === 4 ? '#' + [...c.slice(1)].map(x => x + x).join('') : c.slice(0, 7); const m = c.match(/\d+/g); return m ? '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('') : '#000000'; },
  b_appearance(box) {
    this.bind(box, () => App.applyUi());
    $$('[data-cv]', box).forEach(inp => inp.oninput = () => {
      const s = App.settings; s.customColors = s.customColors || {};
      $$('[data-cv]', box).forEach(i2 => { s.customColors[i2.dataset.cv] = i2.value; });
      s.uiTheme = 'custom'; $('[data-b="app:uiTheme"]', box).value = 'custom'; App.applyUi(); App.save();
    });
  },

  s_media() {
    return this.page('Media & downloads', '', `
      <div class="form cols">
        ${this.f('Audio output', '<select id="audioOut"></select>')}
        ${this.chk('app', 'player.addNewToPlaylist', 'New media (added or downloaded) also goes into the playlist')}
        ${this.chk('app', 'player.toProjector', 'Play videos on the projector')}
        <div class="sect">${t('Downloader')}</div>
        <div class="full" id="toolInfo"></div>
      </div>`);
  },
  async b_media(box) {
    this.bind(box);
    let outs = [];
    try { outs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput'); } catch { /* ignore */ }
    if (!$('#audioOut')) return;
    $('#audioOut').innerHTML = outs.map((d, i) => `<option value="${d.deviceId === 'default' ? '' : esc(d.deviceId)}">${esc(d.label || (d.deviceId === 'default' ? t('System default') : t('Audio device') + ' ' + (i + 1)))}</option>`).join('') || `<option value="">${t('System default')}</option>`;
    $('#audioOut').value = App.settings.player.sinkId || '';
    $('#audioOut').onchange = e => Player.setSink(e.target.value);
    const s = await api.ytdlpStatus();
    if (!$('#toolInfo')) return;
    $('#toolInfo').innerHTML = `yt-dlp: ${s.ytdlp ? esc(s.ytdlp) : t('not installed')}<br>ffmpeg: ${s.ffmpeg ? esc(s.ffmpeg) : t('not installed')}<br>${t('Downloads are saved in')}: ${esc(s.folder)}<br><span class="muted">${t('Install or update the tools from the Download tab of the Media panel.')}</span>`;
  },

  s_install() {
    return this.page('Shortcuts & about', 'Scriptorium is a normal program: the installer (Windows), AppImage / .deb (Linux) or .dmg (macOS) adds it to the Start menu / app launcher. If you use the portable folder, create the shortcuts here.', `
      <div class="form cols">
        <div class="full row gap"><button class="btn" id="mkShort">${t('Create Start menu and desktop shortcuts')}</button><span id="mkRes" class="muted small"></span></div>
        <div class="full muted small" id="aboutInfo"></div>
      </div>`);
  },
  async b_install() {
    $('#mkShort').onclick = async () => { try { const r = await api.makeShortcuts(); $('#mkRes').textContent = r; } catch (e) { $('#mkRes').textContent = e.message; } };
    const a = await api.about();
    if (!$('#aboutInfo')) return;
    $('#aboutInfo').innerHTML = `Scriptorium ${esc(a.version)} · Electron ${esc(a.electron)} · ${esc(a.platform)}<br>${t('Data folder')}: ${esc(a.userData)}<br>VDC 1924 (Cornilescu) · Berean Standard Bible (public domain)`;
  },
};
