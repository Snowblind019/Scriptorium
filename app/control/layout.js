// Panel layout engine: every part of the Songs / Bible screens is a panel that can be moved,
// resized, removed, added, stacked as tabs, detached (floating) and pinned back.
// Positions are in grid units (24 × 24 of the workspace). Snapping (grid, edges, zones) can be off.
const Layout = {
  COLS: 24, ROWS: 24,
  panels: {},          // id -> { id, title, el, body, views }
  view: 'songs',
  editing: false,
  drag: null,

  DEFAULTS: {
    songs: {
      songList: { x: 0, y: 0, w: 5, h: 24 },
      service: { x: 0, y: 0, w: 5, h: 24 },
      songSlides: { x: 5, y: 0, w: 10, h: 24 },
      media: { x: 15, y: 0, w: 8, h: 10 },
      live: { x: 15, y: 10, w: 8, h: 9 },
      songHistory: { x: 15, y: 19, w: 8, h: 5 },
      themes: { x: 23, y: 0, w: 1, h: 24 },
    },
    bible: {
      bibleBooks: { x: 0, y: 0, w: 9, h: 13 },
      bibleChapters: { x: 0, y: 13, w: 5, h: 11 },
      bibleVerses: { x: 5, y: 13, w: 4, h: 11 },
      bibleText: { x: 9, y: 0, w: 8, h: 24 },
      live: { x: 17, y: 0, w: 6, h: 9 },
      bibleFavorites: { x: 17, y: 9, w: 6, h: 15 },
      bibleSearch: { x: 17, y: 9, w: 6, h: 15 },
      bibleHistory: { x: 17, y: 9, w: 6, h: 15 },
      themes: { x: 23, y: 0, w: 1, h: 24 },
    },
  },

  // premade snapping zones (grid units); users can add their own from a layout
  ZONES: {
    holyrics: { name: 'Holyrics style', zones: [[0, 0, 5, 24], [5, 0, 10, 24], [15, 0, 8, 10], [15, 10, 8, 9], [15, 19, 8, 5], [23, 0, 1, 24]] },
    columns3: { name: '3 columns', zones: [[0, 0, 6, 24], [6, 0, 11, 24], [17, 0, 7, 24]] },
    bibleDesk: { name: 'Bible desk', zones: [[0, 0, 9, 13], [0, 13, 5, 11], [5, 13, 4, 11], [9, 0, 8, 24], [17, 0, 6, 9], [17, 9, 6, 15], [23, 0, 1, 24]] },
    grid2x2: { name: '2 × 2', zones: [[0, 0, 12, 12], [12, 0, 12, 12], [0, 12, 12, 12], [12, 12, 12, 12]] },
    sidebar: { name: 'Sidebar + main', zones: [[0, 0, 6, 24], [6, 0, 18, 24]] },
    focusRight: { name: 'Big center, stacked right', zones: [[0, 0, 5, 24], [5, 0, 12, 24], [17, 0, 7, 8], [17, 8, 7, 8], [17, 16, 7, 8]] },
  },

  cfg() { return App.settings.layout; },
  rects() {
    const L = this.cfg();
    if (!L.views[this.view]) L.views[this.view] = JSON.parse(JSON.stringify(this.DEFAULTS[this.view] || {}));
    return L.views[this.view];
  },

  register(id, title, contentEl, opts = {}) {
    const el = document.createElement('section');
    el.className = 'panel';
    el.dataset.panel = id;
    el.innerHTML = `<header class="ph"><div class="ptabs"></div><span class="pt"></span><span class="spacer"></span><span class="pact">
      <button class="pbtn p-float" title="${t('Detach / pin')}">${icon('float')}</button>
      <button class="pbtn p-close" title="${t('Remove panel')}">${icon('close')}</button></span></header>
      <div class="pb"></div>
      ${['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(d => `<div class="rz rz-${d}" data-rz="${d}"></div>`).join('')}`;
    el.querySelector('.pb').appendChild(contentEl);
    $('#ws').appendChild(el);
    const p = { id, title, el, body: contentEl, compact: !!opts.compact };
    this.panels[id] = p;
    el.classList.toggle('compact', !!opts.compact);
    el.querySelector('.p-close').onclick = () => this.removePanel(id);
    el.querySelector('.p-float').onclick = () => this.toggleFloat(id);
    el.querySelector('.ph').addEventListener('pointerdown', e => this.startMove(e, id));
    el.querySelectorAll('.rz').forEach(h => h.addEventListener('pointerdown', e => this.startResize(e, id, h.dataset.rz)));
    el.addEventListener('pointerdown', () => { if (this.rects()[id] && this.rects()[id].float) this.raise(id); }, true);
    return p;
  },

  init() {
    $('#lyEdit').onclick = () => this.setEditing(!this.editing);
    $('#lyDone').onclick = () => this.setEditing(false);
    $('#lyReset').onclick = () => { if (confirm(t('Reset this screen to the default layout?'))) { delete this.cfg().views[this.view]; this.apply(); } };
    $('#lyAdd').onclick = e => this.menuAdd(e);
    $('#lyZones').onchange = e => { this.cfg().zoneSet = e.target.value; this.drawZones(); App.save(); };
    $('#lySaveZones').onclick = () => this.saveZones();
    $('#lySnap').onchange = e => { this.cfg().snap = e.target.checked; App.save(); };
    $('#lyPresets').onchange = e => { this.applyPreset(e.target.value); e.target.value = ''; };
    new ResizeObserver(() => this.drawZones()).observe($('#ws'));
  },

  setView(v) { this.view = v; this.apply(); },

  setEditing(on) {
    this.editing = on;
    document.body.classList.toggle('editing', on);
    $('#lyBar').classList.toggle('hidden', !on);
    $('#lyEdit').classList.toggle('on', on);
    if (on) { this.fillZoneSelect(); $('#lySnap').checked = this.cfg().snap !== false; }
    this.drawZones();
    this.apply();
  },

  fillZoneSelect() {
    const all = this.allZoneSets();
    $('#lyZones').innerHTML = `<option value="">${t('No zones')}</option>` + Object.entries(all).map(([k, z]) => `<option value="${k}">${esc(t(z.name))}</option>`).join('');
    $('#lyZones').value = this.cfg().zoneSet || '';
    $('#lyPresets').innerHTML = `<option value="">${t('Layout presets…')}</option><option value="default">${t('Default')}</option>` +
      Object.keys(this.cfg().saved || {}).map(n => `<option value="saved:${esc(n)}">${esc(n)}</option>`).join('') + `<option value="__save">${t('Save current layout as…')}</option>`;
  },
  allZoneSets() { return Object.assign({}, this.ZONES, this.cfg().customZones || {}); },

  // ---------- apply layout ----------
  apply() {
    const R = this.rects();
    const groups = {};
    for (const id in this.panels) {
      const p = this.panels[id], r = R[id];
      p.el.classList.toggle('hidden', !r);
      if (!r) continue;
      p.el.classList.toggle('floating', !!r.float);
      Object.assign(p.el.style, { left: (r.x / this.COLS * 100) + '%', top: (r.y / this.ROWS * 100) + '%', width: (r.w / this.COLS * 100) + '%', height: (r.h / this.ROWS * 100) + '%', zIndex: r.float ? 20 + (r.z || 0) : '' });
      p.el.querySelector('.pt').textContent = t(p.title);
      if (!r.float) { const k = [r.x, r.y, r.w, r.h].join(','); (groups[k] = groups[k] || []).push(id); }
      else { p.el.querySelector('.ptabs').innerHTML = ''; p.el.classList.remove('tabbed', 'tab-hidden'); }
    }
    const act = this.cfg().active || (this.cfg().active = {});
    for (const k in groups) {
      const ids = groups[k];
      const gk = this.view + ':' + ids.slice().sort().join('+');
      let a = act[gk]; if (!ids.includes(a)) a = ids[0];
      ids.forEach(id => {
        const p = this.panels[id];
        p.el.classList.toggle('tabbed', ids.length > 1);
        p.el.classList.toggle('tab-hidden', id !== a);
        const tabs = p.el.querySelector('.ptabs');
        tabs.innerHTML = ids.length > 1 ? ids.map(j => `<button class="ptab${j === a ? ' on' : ''}" data-id="${j}">${esc(t(this.panels[j].title))}</button>`).join('') : '';
        tabs.querySelectorAll('.ptab').forEach(b => {
          b.onclick = () => { act[gk] = b.dataset.id; App.save(); this.apply(); };
          b.addEventListener('pointerdown', e => { e.stopPropagation(); this.startTabDrag(e, b.dataset.id); });
        });
      });
    }
    document.dispatchEvent(new CustomEvent('layout-changed'));
  },

  show(id) {   // bring a panel to the front of its tab group (e.g. Ctrl+F → search panel)
    const R = this.rects(), r = R[id];
    if (!r) return false;
    if (!r.float) {
      const ids = Object.keys(R).filter(j => this.panels[j] && !R[j].float && R[j].x === r.x && R[j].y === r.y && R[j].w === r.w && R[j].h === r.h);
      this.cfg().active[this.view + ':' + ids.sort().join('+')] = id;
      this.apply();
    }
    return true;
  },
  visible(id) { const r = this.rects()[id]; return !!r && !this.panels[id].el.classList.contains('tab-hidden'); },

  removePanel(id) { delete this.rects()[id]; App.save(); this.apply(); },
  toggleFloat(id) {
    const r = this.rects()[id];
    if (!r) return;
    if (r.float) { delete r.float; if (this.snapOn()) Object.assign(r, this.snapRect(r)); }
    else { r.float = true; r.x = Math.min(r.x + 0.6, this.COLS - r.w); r.y = Math.min(r.y + 0.6, this.ROWS - r.h); this.raise(id); }
    App.save(); this.apply();
  },
  raise(id) {
    const R = this.rects(); const z = Math.max(0, ...Object.values(R).map(r => r.z || 0)) + 1;
    R[id].z = z; this.panels[id].el.style.zIndex = 20 + z;
  },

  menuAdd(e) {
    const R = this.rects();
    const missing = Object.keys(this.panels).filter(id => !R[id]);
    const m = $('#lyMenu');
    m.innerHTML = missing.length ? missing.map(id => `<div class="item" data-id="${id}">${esc(t(this.panels[id].title))}</div>`).join('') : `<div class="empty">${t('All panels are already on this screen.')}</div>`;
    m.classList.remove('hidden');
    $$('.item', m).forEach(el => el.onclick = () => {
      R[el.dataset.id] = { x: 8, y: 6, w: 8, h: 10, float: true };
      this.raise(el.dataset.id); m.classList.add('hidden'); App.save(); this.apply();
    });
  },

  applyPreset(v) {
    if (!v) return;
    if (v === '__save') { this.saveLayoutAs(); return; }
    if (v === 'default') { delete this.cfg().views[this.view]; }
    else if (v.startsWith('saved:')) { const s = this.cfg().saved[v.slice(6)]; if (s) this.cfg().views[this.view] = JSON.parse(JSON.stringify(s)); }
    App.save(); this.apply();
  },
  async saveLayoutAs() {
    const name = await App.ask(t('Name for this layout:'), t('My layout'));
    if (!name) return;
    (this.cfg().saved = this.cfg().saved || {})[name] = JSON.parse(JSON.stringify(this.rects()));
    App.save(); this.fillZoneSelect(); toast(t('Layout saved'));
  },
  async saveZones() {
    const name = await App.ask(t('Name for these zones (made from the current panel positions):'), t('My zones'));
    if (!name) return;
    const seen = new Set(), zones = [];
    for (const r of Object.values(this.rects())) { if (r.float) continue; const k = [r.x, r.y, r.w, r.h].map(n => Math.round(n)).join(','); if (!seen.has(k)) { seen.add(k); zones.push(k.split(',').map(Number)); } }
    const id = 'c_' + uid();
    (this.cfg().customZones = this.cfg().customZones || {})[id] = { name, zones };
    this.cfg().zoneSet = id; App.save(); this.fillZoneSelect(); this.drawZones(); toast(t('Zones saved'));
  },

  drawZones() {
    const box = $('#lyZoneLayer');
    if (!this.editing) { box.innerHTML = ''; return; }
    const set = this.allZoneSets()[this.cfg().zoneSet];
    box.innerHTML = set ? set.zones.map((z, i) => `<div class="zone" data-i="${i}" style="left:${z[0] / this.COLS * 100}%;top:${z[1] / this.ROWS * 100}%;width:${z[2] / this.COLS * 100}%;height:${z[3] / this.ROWS * 100}%"></div>`).join('') : '';
  },

  // ---------- drag / resize ----------
  snapOn() { return this.cfg().snap !== false; },
  unit() { const ws = $('#ws'); return { ux: ws.clientWidth / this.COLS, uy: ws.clientHeight / this.ROWS, ws }; },
  snapRect(r) { const q = v => Math.round(v); return { x: q(r.x), y: q(r.y), w: Math.max(1, q(r.w)), h: Math.max(2, q(r.h)) }; },

  startMove(e, id) {
    if (e.button !== 0 || e.target.closest('button, input, select')) return;
    const r = this.rects()[id];
    if (!r || (!this.editing && !r.float)) return;
    e.preventDefault();
    const { ux, uy } = this.unit();
    this.drag = { id, mode: 'move', sx: e.clientX, sy: e.clientY, r0: { ...r }, ux, uy };
    this.bindDrag();
  },
  startTabDrag(e, id) {
    // drag a tab out of its group in edit mode → it becomes a floating panel
    if (!this.editing || e.button !== 0) return;
    const r = this.rects()[id];
    const sx = e.clientX, sy = e.clientY;
    const mv = ev => {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 12) return;
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      r.float = true; r.w = Math.min(r.w, 8); r.h = Math.min(r.h, 10); this.raise(id); this.apply();
      const { ux, uy } = this.unit();
      this.drag = { id, mode: 'move', sx: ev.clientX, sy: ev.clientY, r0: { ...r }, ux, uy };
      this.bindDrag();
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  },
  startResize(e, id, dir) {
    if (e.button !== 0) return;
    const r = this.rects()[id];
    if (!r || (!this.editing && !r.float)) return;
    e.preventDefault(); e.stopPropagation();
    const { ux, uy } = this.unit();
    this.drag = { id, mode: 'resize', dir, sx: e.clientX, sy: e.clientY, r0: { ...r }, ux, uy };
    this.bindDrag();
  },
  bindDrag() {
    const mv = e => this.onDrag(e), up = e => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); this.endDrag(e); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    document.body.classList.add('dragging');
  },
  onDrag(e) {
    const d = this.drag; if (!d) return;
    const dx = (e.clientX - d.sx) / d.ux, dy = (e.clientY - d.sy) / d.uy;
    const r = this.rects()[d.id], o = d.r0;
    if (d.mode === 'move') { r.x = o.x + dx; r.y = o.y + dy; }
    else {
      if (d.dir.includes('e')) r.w = o.w + dx;
      if (d.dir.includes('s')) r.h = o.h + dy;
      if (d.dir.includes('w')) { r.x = o.x + dx; r.w = o.w - dx; }
      if (d.dir.includes('n')) { r.y = o.y + dy; r.h = o.h - dy; }
    }
    r.w = Math.max(1, Math.min(this.COLS, r.w)); r.h = Math.max(2, Math.min(this.ROWS, r.h));
    r.x = Math.max(0, Math.min(this.COLS - r.w, r.x)); r.y = Math.max(0, Math.min(this.ROWS - r.h, r.y));
    if (this.snapOn() && !r.float) Object.assign(r, this.snapRect(r));
    else if (this.snapOn() && r.float) { r.x = Math.round(r.x * 2) / 2; r.y = Math.round(r.y * 2) / 2; r.w = Math.round(r.w * 2) / 2; r.h = Math.round(r.h * 2) / 2; }
    // zone highlight
    d.zone = null;
    if (d.mode === 'move' && this.editing) {
      const { ws } = this.unit(), b = ws.getBoundingClientRect();
      const gx = (e.clientX - b.left) / d.ux, gy = (e.clientY - b.top) / d.uy;
      const set = this.allZoneSets()[this.cfg().zoneSet];
      $$('#lyZoneLayer .zone').forEach(z => z.classList.remove('hot'));
      if (set) set.zones.forEach((z, i) => { if (gx >= z[0] && gx < z[0] + z[2] && gy >= z[1] && gy < z[1] + z[3]) { d.zone = z; $(`#lyZoneLayer .zone[data-i="${i}"]`).classList.add('hot'); } });
      // dropping on another docked panel's header joins it as a tab
      d.joinTo = null;
      for (const [id, rr] of Object.entries(this.rects())) {
        if (id === d.id || rr.float || !this.panels[id]) continue;
        const hb = this.panels[id].el.querySelector('.ph').getBoundingClientRect();
        if (!this.panels[id].el.classList.contains('tab-hidden') && e.clientX >= hb.left && e.clientX <= hb.right && e.clientY >= hb.top && e.clientY <= hb.bottom) d.joinTo = id;
      }
      $$('.panel').forEach(p => p.classList.toggle('join-hot', p.dataset.panel === d.joinTo));
    }
    this.apply();
  },
  endDrag() {
    const d = this.drag; this.drag = null;
    document.body.classList.remove('dragging');
    $$('.panel').forEach(p => p.classList.remove('join-hot'));
    $$('#lyZoneLayer .zone').forEach(z => z.classList.remove('hot'));
    if (!d) return;
    const r = this.rects()[d.id];
    if (d.joinTo) {
      const t2 = this.rects()[d.joinTo]; Object.assign(r, { x: t2.x, y: t2.y, w: t2.w, h: t2.h }); delete r.float;
      App.save(); this.show(d.id); return;
    }
    else if (d.zone && this.snapOn()) { Object.assign(r, { x: d.zone[0], y: d.zone[1], w: d.zone[2], h: d.zone[3] }); delete r.float; }
    App.save(); this.apply();
  },
};
