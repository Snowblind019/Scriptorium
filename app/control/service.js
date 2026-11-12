// Service list (order of worship). Ctrl+click (configurable) on a song adds it.
// Lists can be saved inside the program (Save / Open) or shared as .sclist files (Export / Import).
// Exported lists carry the full text of every song, so they also work on a copy that lacks the song.
const Service = {
  sel: -1,
  init() {
    // drop entries this program can't show (e.g. damaged lists saved by an older version)
    App.settings.serviceList = (Array.isArray(App.settings.serviceList) ? App.settings.serviceList : []).filter(it => this.valid(it));
    $('#svUp').onclick = () => this.move(-1);
    $('#svDown').onclick = () => this.move(1);
    $('#svRemove').onclick = () => this.remove();
    $('#svClear').onclick = () => {
      if (!this.list().length || !confirm(t('Clear the whole service list?'))) return;
      App.settings.serviceList = []; this.sel = -1; this.changed();
    };
    $('#svNew').onclick = () => this.newList();
    $('#svSave').onclick = () => this.save(false);
    $('#svSaveAs').onclick = () => this.save(true);
    $('#svOpen').onclick = () => this.toggleMenu();
    $('#svExport').onclick = () => this.exportFile();
    $('#svImport').onclick = () => this.importFile();
    $('#svDelete').onclick = () => this.deleteCurrent();
    this.render();
  },
  list() { return App.settings.serviceList; },
  valid(it) {
    if (!it || typeof it !== 'object') return false;
    if (it.type === 'song') return typeof it.title === 'string' || !!(it.song && typeof it.song === 'object');
    if (it.type === 'bible') return !!(it.ref && Number.isInteger(it.ref.book) && Number.isInteger(it.ref.chapter) && Number.isInteger(it.ref.from) && Number.isInteger(it.ref.to));
    if (it.type === 'media') return !!(it.item && typeof it.item.url === 'string' && /^file:\/\/\//i.test(it.item.url));
    return false;
  },
  meta() { return (App.settings.serviceMeta = App.settings.serviceMeta || { name: '', dirty: false }); },
  changed() { this.meta().dirty = true; App.save(); this.render(); },

  addSong(x) { this.add({ type: 'song', bookId: x.book.id, number: x.song.number, title: x.song.title }); },
  add(item) {
    this.list().push(item); this.changed();
    toast(t('Added to the service list') + ': ' + this.label(item));
  },
  label(it) {
    if (it.type === 'song') {
      const b = Songs.books.find(b => b.id === it.bookId);
      return `${b ? (b.short || b.name) : (it.bookShort || it.bookName || '?')} ${it.number} – ${it.title}`;
    }
    if (it.type === 'bible') return String(it.label || '');
    if (it.type === 'media') return String((it.item && it.item.name) || '');
    return '?';
  },
  // the song in this program, or (for lists from another computer) the text that came in the file
  resolve(it) {
    let x = Songs.find(it.bookId, it.number, it.title);
    if (!x && it.title) { const ft = fold(it.title); x = Songs.all.find(y => fold(y.song.title) === ft); }
    if (!x && it.song) { const { uid, rev, ...song } = it.song; x = { book: { id: it.bookId || 'list', name: it.bookName || t('From the list file'), short: it.bookShort || '' }, song, embedded: true }; }
    return x;
  },
  render() {
    const box = $('#serviceList'); if (!box) return;
    const l = this.list(), m = this.meta();
    $('#svName').textContent = (m.name || t('Unsaved list')) + (m.dirty && l.length ? ' •' : '');
    $('#svName').title = m.dirty ? t('Changes not saved') : '';
    $('#svDelete').disabled = !m.name;
    box.innerHTML = l.length ? l.map((it, i) => {
      const missing = it.type === 'song' && !Songs.find(it.bookId, it.number, it.title);
      const tag = missing ? (it.song ? `<span class="tag">${t('from file')}</span>` : `<span class="tag">${t('missing')}</span>`) : '';
      return `<div class="item${i === this.sel ? ' sel' : ''}" data-i="${i}" draggable="true"><span class="num">${i + 1}.</span><span class="ttl">${esc(this.label(it))}</span>${tag}</div>`;
    }).join('') : `<div class="empty">${t('Empty. Ctrl+click a song, or use the add button on a song.')}</div>`;
    $$('#serviceList .item').forEach(el => {
      const i = +el.dataset.i;
      el.onclick = () => { this.sel = i; this.render(); this.open(l[i], false); };
      el.ondblclick = () => { this.sel = i; this.render(); this.open(l[i], true); };
      el.ondragstart = e => { e.dataTransfer.setData('text/svc', String(i)); };
      el.ondragover = e => { e.preventDefault(); el.classList.add('drag-over'); };
      el.ondragleave = () => el.classList.remove('drag-over');
      el.ondrop = e => { e.preventDefault(); const from = +e.dataTransfer.getData('text/svc'); const [mv] = l.splice(from, 1); l.splice(i, 0, mv); this.sel = i; this.changed(); };
    });
  },
  open(it, go) {
    if (it.type === 'song') {
      const x = this.resolve(it);
      if (!x) { toast(t('Song not found any more')); return; }
      App.setView('songs');
      Songs.open(x); if (go) Songs.showSlide(0);
    } else if (it.type === 'bible') {
      const r = it.ref; App.setView('bible'); Bible.goto(r.book, r.chapter, r.from); Bible.sel = { from: r.from, to: r.to }; Bible.markLive(); if (go) Bible.project();
    } else if (it.type === 'media') Player.playItem(it.item, go);
  },
  move(d) {
    const l = this.list(), i = this.sel, j = i + d;
    if (i < 0 || j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]]; this.sel = j; this.changed();
  },
  remove() {
    if (this.sel < 0) return;
    this.list().splice(this.sel, 1); this.sel = Math.min(this.sel, this.list().length - 1); this.changed();
  },

  // ---------- save / open / share ----------
  snapshot(name) {
    return {
      format: 'scriptorium-service-list', version: 1, name, saved: new Date().toISOString(),
      items: this.list().map(it => {
        if (it.type !== 'song') return it;
        const x = this.resolve(it);
        return x ? { type: 'song', bookId: x.book.id, bookName: x.book.name, bookShort: x.book.short || '', number: x.song.number, title: x.song.title,
          song: { number: x.song.number, title: x.song.title, sections: x.song.sections || [], ...(x.song.key ? { key: x.song.key } : {}) } } : it;
      }),
    };
  },
  load(o) {
    App.settings.serviceList = (o.items || []).filter(it => this.valid(it)).map(it => ({ ...it }));
    Object.assign(this.meta(), { name: o.name || '', dirty: false });
    this.sel = -1; App.save(); this.render();
    Layout.show('service');
  },
  okToReplace() { return !(this.meta().dirty && this.list().length) || confirm(t('The current list has unsaved changes. Replace it anyway?')); },
  newList() {
    if (!this.okToReplace()) return;
    App.settings.serviceList = []; Object.assign(this.meta(), { name: '', dirty: false }); this.sel = -1; App.save(); this.render();
  },
  async save(asNew) {
    if (!this.list().length) { toast(t('The list is empty')); return; }
    let name = this.meta().name;
    if (asNew || !name) {
      const d = new Date();
      name = await App.ask(t('Name for this service list:'), name || `${t('Service')} ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      if (!name) return;
    }
    await api.listSave(this.snapshot(name));
    Object.assign(this.meta(), { name, dirty: false }); App.save(); this.render();
    toast(t('Service list saved') + ': ' + name);
  },
  async toggleMenu() {
    const m = $('#svMenu');
    if (!m.classList.contains('hidden')) { m.classList.add('hidden'); return; }
    const lists = await api.listsAll();
    m.innerHTML = lists.length ? lists.map((l, i) => `<div class="item" data-i="${i}"><span class="ttl">${esc(l.name)}<span class="snip">${l.count} · ${new Date(l.modified).toLocaleDateString()}</span></span><button class="btn sm ghost danger" data-x="1">${t('Delete')}</button></div>`).join('')
      : `<div class="empty">${t('No saved lists yet. Use Save to keep this list.')}</div>`;
    m.classList.remove('hidden');
    $$('.item', m).forEach(el => el.onclick = async e => {
      const l = lists[+el.dataset.i];
      if (e.target.closest('[data-x]')) {
        if (!confirm(t('Delete this saved list?') + '\n' + l.name)) return;
        await api.listDelete(l.file); m.classList.add('hidden'); this.toggleMenu(); return;
      }
      m.classList.add('hidden');
      if (!this.okToReplace()) return;
      try { this.load(await api.listLoad(l.file)); toast(t('Opened') + ': ' + l.name); } catch (err) { toast(err.message); }
    });
  },
  // delete the saved copy of the list that is open (the songs stay on screen as an unsaved list)
  async deleteCurrent() {
    const name = this.meta().name;
    const l = name && (await api.listsAll()).find(x => x.name === name);
    if (!l) { toast(t('This list is not saved – use Clear to empty it, or Open ▾ to delete a saved list')); return; }
    if (!confirm(t('Delete the saved list?') + '\n' + name)) return;
    await api.listDelete(l.file);
    Object.assign(this.meta(), { name: '', dirty: true }); App.save(); this.render();
    toast(t('Deleted') + ': ' + name);
  },
  async exportFile() {
    if (!this.list().length) { toast(t('The list is empty')); return; }
    const name = this.meta().name || await App.ask(t('Name for this service list:'), t('Service'));
    if (!name) return;
    const p = await api.listExport(this.snapshot(name));
    if (p) toast(t('Exported') + ': ' + p, 4000);
  },
  async importFile() {
    if (!this.okToReplace()) return;
    let o;
    try { o = await api.listImport(); } catch (e) { toast(t('Import failed') + ': ' + e.message, 5000); return; }
    if (!o) return;
    this.load(o);
    await api.listSave(this.snapshot(o.name));   // keep it under Open as well
    const fromFile = this.list().filter(it => it.type === 'song' && !Songs.find(it.bookId, it.number, it.title)).length;
    toast(t('Imported') + `: ${o.name} (${this.list().length})` + (fromFile ? ` · ${fromFile} ${t('songs shown from the file')}` : ''), 4000);
  },
};
