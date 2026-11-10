// Media panel: VLC-style player + library (durations, reorder, forgiving search) + playlist
// + downloader (yt-dlp). Audio plays here; videos can play on the projector with a muted mirror.
const Player = {
  el: null, idx: -1, remote: false, st: { time: 0, duration: 0, paused: true }, seeking: false,
  libSel: -1, mt: 'lib',

  get cfg() { return App.settings.player; },
  get pl() { return (this.cfg.playlist = this.cfg.playlist || []); },
  lib() { return App.settings.mediaLibrary; },

  async init() {
    $$('#pc-media [data-icon]').forEach(s => { s.outerHTML = icon(s.dataset.icon); });
    this.el = $('#plVideo');
    const el = this.el;
    el.volume = this.cfg.volume;
    if (this.cfg.sinkId && el.setSinkId) el.setSinkId(this.cfg.sinkId).catch(() => {});
    for (const ev of ['timeupdate', 'play', 'pause', 'loadedmetadata', 'durationchange']) el.addEventListener(ev, () => {
      if (this.remote) return;
      this.st = { time: el.currentTime, duration: isFinite(el.duration) ? el.duration : 0, paused: el.paused };
      this.ui();
    });
    el.addEventListener('ended', () => { if (!this.remote) this.ended(); });
    el.addEventListener('error', () => { if (!this.remote && el.getAttribute('src')) toast(t('This file cannot be played (format/codec not supported)')); });
    api.onMediaStatus(st => {
      if (!this.remote) return;
      if (st.error) { toast(t('The projector cannot play this video (format/codec not supported)')); return; }
      this.st = st;
      App.preview.mediaCmd({ op: 'sync', t: st.time, paused: st.paused });
      if (st.ended) this.ended();
      this.ui();
    });
    $('#plPlay').onclick = () => this.toggle();
    $('#plStop').onclick = () => this.stop();
    $('#plPrev').onclick = () => this.prev();
    $('#plNext').onclick = () => this.next(false);
    $('#plBack').onclick = () => this.seek(this.st.time - 10);
    $('#plFwd').onclick = () => this.seek(this.st.time + 10);
    $('#plLoop').onclick = () => { this.cfg.loop = { off: 'one', one: 'all', all: 'off' }[this.cfg.loop] || 'off'; this.applyLoop(); App.save(); this.ui(); };
    $('#plShuffle').onclick = () => { this.cfg.shuffle = !this.cfg.shuffle; App.save(); this.ui(); };
    $('#plMute').onclick = () => { this.cfg.muted = !this.cfg.muted; this.applyVolume(); App.save(); this.ui(); };
    $('#plVol').value = Math.round(this.cfg.volume * 100);
    $('#plVol').oninput = e => { this.cfg.volume = e.target.value / 100; this.cfg.muted = false; this.applyVolume(); App.save(); this.ui(); };
    const seek = $('#plSeek');
    seek.oninput = () => { this.seeking = true; $('#plCur').textContent = fmtTime(seek.value / 1000 * this.st.duration); };
    seek.onchange = () => { this.seeking = false; this.seek(seek.value / 1000 * this.st.duration); };
    $('#plToProj').checked = this.cfg.toProjector;
    $('#plToProj').onchange = e => { this.cfg.toProjector = e.target.checked; App.save(); const it = this.pl[this.idx]; if (it && it.kind === 'video') this.load(this.idx, !this.st.paused, this.st.time); };
    $$('#mediaTabs button').forEach(b => b.onclick = () => this.setTab(b.dataset.mt));
    $('#plClear').onclick = () => { this.stop(); this.cfg.playlist = []; this.idx = -1; App.save(); this.renderPlaylist(); this.ui(); };
    $('#mediaSearch').addEventListener('input', debounce(() => this.renderLibrary(), 120));
    $('#mediaFilter').onchange = () => this.renderLibrary();
    $('#mediaAdd').onclick = async () => this.addFiles(await api.addMediaFiles());
    $('#mediaAddFolder').onclick = async () => this.addFiles(await api.addMediaFolder());
    $('#mediaOpenFolder').onclick = () => api.openMediaFolder();
    $('#mediaRemove').onclick = () => {
      const it = this.libItems()[this.libSel]; if (!it) return;
      this.lib().splice(this.lib().indexOf(it), 1); this.libSel = -1; App.save(); this.renderLibrary();
    };
    Downloader.init();
    // files that were downloaded earlier are always in the library
    const known = await api.scanDownloads();
    const missing = known.filter(f => !this.lib().some(x => x.path === f.path));
    if (missing.length) { missing.forEach(f => this.lib().push(f)); App.save(); }
    this.renderLibrary(); this.renderPlaylist(); this.ui();
  },

  setTab(mt) {
    this.mt = mt;
    $$('#mediaTabs button').forEach(b => b.classList.toggle('on', b.dataset.mt === mt));
    $$('#pc-media .mt').forEach(el => el.classList.toggle('hidden', el.id !== 'mt-' + mt));
    if (mt === 'pl') this.renderPlaylist();
  },

  // ---------- library ----------
  addFiles(files, toPlaylist = this.cfg.addNewToPlaylist !== false) {
    let n = 0;
    for (const f of files) {
      if (!this.lib().some(x => x.path === f.path)) { this.lib().push(f); n++; }
      if (toPlaylist && f.kind !== 'image' && !this.pl.some(x => x.path === f.path)) this.pl.push(f);
    }
    App.save();
    if (n) toast(`${n} ${t('file(s) added to the media library')}`);
    this.renderLibrary(); this.renderPlaylist();
  },
  libItems() {
    const q = $('#mediaSearch').value.trim(), f = $('#mediaFilter').value;
    let items = this.lib().filter(x => !f || x.kind === f);
    if (q) {
      const ix = new SearchIndex(items.map((x, i) => { const n = x.name.replace(/\.[^.]+$/, ''); return { id: i, title: n.replace(/[-_.]+/g, ' ') + ' ' + n }; }), { loose: true });
      items = ix.query(q).hits.map(h => items[h.id]);
    }
    return items;
  },
  async renderLibrary() {
    const items = this.libItems(), filtered = !!$('#mediaSearch').value.trim() || !!$('#mediaFilter').value;
    const ic = k => k === 'audio' ? '♪' : k === 'video' ? '▶' : '▣';
    $('#mediaList').innerHTML = items.length ? items.map((x, i) => `<div class="item${i === this.libSel ? ' sel' : ''}" data-i="${i}" draggable="${!filtered}" title="${esc(x.path)}"><span class="ic2">${ic(x.kind)}</span><span class="ttl">${esc(x.name.replace(/\.[^.]+$/, ''))}</span><span class="dur">${x.duration ? fmtTime(x.duration) : ''}</span><span class="act"><button data-a="pl" title="${t('Add to playlist')}">${icon('plus')}</button></span></div>`).join('')
      : `<div class="empty">${t('No media yet. Add files or a folder, or download from a link. Files stay where they are.')}</div>`;
    $$('#mediaList .item').forEach(el => {
      const it = items[+el.dataset.i];
      el.onclick = e => {
        if (e.target.closest('[data-a="pl"]') || App.clickMacro(e)) { this.addToPlaylist(it); return; }
        this.libSel = +el.dataset.i; $$('#mediaList .item').forEach(x => x.classList.toggle('sel', x === el));
      };
      el.ondblclick = () => { if (it.kind === 'image') this.playItem(it, true); else this.addToPlaylist(it); };
      el.ondragstart = e => e.dataTransfer.setData('text/lib', String(this.lib().indexOf(it)));
      el.ondragover = e => { e.preventDefault(); el.classList.add('drag-over'); };
      el.ondragleave = () => el.classList.remove('drag-over');
      el.ondrop = e => {
        e.preventDefault(); el.classList.remove('drag-over');
        const from = +e.dataTransfer.getData('text/lib'); if (isNaN(from)) return;
        const L = this.lib(), [m] = L.splice(from, 1); L.splice(L.indexOf(it) + (from <= L.indexOf(it) ? 1 : 0), 0, m);
        App.save(); this.renderLibrary();
      };
    });
    const ex = await api.mediaExists(items.map(x => x.path));
    $$('#mediaList .item').forEach((el, i) => el.classList.toggle('missing', ex[i] === false));
    this.fillDurations(items);
  },
  // read each file's length once (stored in the library)
  async fillDurations(items) {
    for (const it of items.filter(x => !x.duration && x.kind !== 'image').slice(0, 40)) {
      const d = await new Promise(res => {
        const a = document.createElement(it.kind === 'video' ? 'video' : 'audio');
        a.preload = 'metadata'; a.src = it.url;
        a.onloadedmetadata = () => res(isFinite(a.duration) ? a.duration : 0); a.onerror = () => res(0);
        setTimeout(() => res(0), 6000);
      });
      if (d) { it.duration = d; const el = [...$$('#mediaList .item')].find(x => x.title === it.path); if (el) $('.dur', el).textContent = fmtTime(d); }
    }
    App.save();
  },
  addToPlaylist(it) {
    if (it.kind === 'image') { this.playItem(it, true); return; }
    if (!this.pl.some(x => x.path === it.path)) { this.pl.push(it); App.save(); }
    this.renderPlaylist();
    toast(t('Added to playlist') + ': ' + it.name);
  },
  playItem(it, go) {
    if (it.kind === 'image') {
      if (go) App.show({ kind: 'image', url: it.url }, '▣ ' + it.name, { view: App.view, key: 'img:' + it.path });
      return;
    }
    let i = this.pl.findIndex(x => x.path === it.path);
    if (i < 0) { this.pl.push(it); i = this.pl.length - 1; App.save(); }
    this.load(i, go); this.renderPlaylist();
  },
  renderPlaylist() {
    const box = $('#plList'); if (!box) return;
    box.innerHTML = this.pl.length ? this.pl.map((x, i) => `<div class="item${i === this.idx ? ' cur' : ''}" data-i="${i}" draggable="true"><span class="ic2">${x.kind === 'video' ? '▶' : '♪'}</span><span class="ttl">${esc(x.name.replace(/\.[^.]+$/, ''))}</span><span class="dur">${x.duration ? fmtTime(x.duration) : ''}</span><span class="act"><button data-rm="1" title="${t('Remove')}">${icon('close')}</button></span></div>`).join('')
      : `<div class="empty">${t('Playlist is empty. Double-click media in the Library to add it.')}</div>`;
    $$('#plList .item').forEach(el => {
      const i = +el.dataset.i;
      el.onclick = e => {
        if (!e.target.closest('[data-rm]')) return;
        if (i === this.idx) this.stop();
        this.pl.splice(i, 1); if (this.idx > i) this.idx--; else if (this.idx === i) this.idx = -1;
        App.save(); this.renderPlaylist(); this.ui();
      };
      el.ondblclick = () => this.load(i, true);
      el.ondragstart = e => e.dataTransfer.setData('text/pl', String(i));
      el.ondragover = e => { e.preventDefault(); el.classList.add('drag-over'); };
      el.ondragleave = () => el.classList.remove('drag-over');
      el.ondrop = e => {
        e.preventDefault(); const from = +e.dataTransfer.getData('text/pl'); if (isNaN(from)) return;
        const cur = this.pl[this.idx]; const [m] = this.pl.splice(from, 1); this.pl.splice(i, 0, m);
        this.idx = this.pl.indexOf(cur); App.save(); this.renderPlaylist();
      };
    });
  },

  // ---------- engine ----------
  load(i, autoplay = true, startAt = 0) {
    const it = this.pl[i]; if (!it) return;
    this.idx = i;
    const toProj = it.kind === 'video' && this.cfg.toProjector;
    if (this.remote && !toProj) this.unloadRemote();
    if (!this.remote && toProj) { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); }
    this.remote = toProj;
    this.st = { time: startAt, duration: it.duration || 0, paused: !autoplay };
    if (toProj) {
      const c = { op: 'load', url: it.url, play: autoplay, time: startAt, volume: this.cfg.muted ? 0 : this.cfg.volume, loop: this.cfg.loop === 'one', fit: 'contain' };
      api.mediaCmd(c);
      if (this.cfg.sinkId) api.mediaCmd({ op: 'sink', id: this.cfg.sinkId });
      App.preview.mediaCmd(c);
      if (!App.outputOn) toast(t('Video is playing on the projector – the projector output is off'));
    } else {
      this.el.src = it.url; this.el.loop = this.cfg.loop === 'one'; this.applyVolume();
      if (startAt) this.el.addEventListener('loadedmetadata', () => { this.el.currentTime = startAt; }, { once: true });
      if (autoplay) this.el.play().catch(() => {});
    }
    this.renderPlaylist(); this.ui();
  },
  unloadRemote() { api.mediaCmd({ op: 'unload' }); App.preview.mediaCmd({ op: 'unload' }); this.remote = false; },
  toggle() { if (this.idx < 0) { if (this.pl.length) this.load(0, true); return; } if (this.st.paused) this.play(); else this.pause(); },
  play() {
    if (this.remote) { api.mediaCmd({ op: 'play' }); App.preview.mediaCmd({ op: 'play' }); this.st.paused = false; this.ui(); }
    else if (this.el.getAttribute('src')) this.el.play().catch(() => {});
    else if (this.idx >= 0) this.load(this.idx, true);
  },
  pause() {
    if (this.remote) { api.mediaCmd({ op: 'pause' }); App.preview.mediaCmd({ op: 'pause' }); this.st.paused = true; this.ui(); }
    else this.el.pause();
  },
  stop() {
    if (this.remote) this.unloadRemote();
    else { this.el.pause(); if (this.el.getAttribute('src')) this.el.currentTime = 0; }
    this.st = { time: 0, duration: this.st.duration, paused: true }; this.ui();
  },
  seek(tm) {
    tm = Math.max(0, Math.min(tm, this.st.duration || tm));
    if (this.remote) { api.mediaCmd({ op: 'seek', t: tm }); App.preview.mediaCmd({ op: 'seek', t: tm }); this.st.time = tm; }
    else if (this.el.getAttribute('src')) this.el.currentTime = tm;
    this.ui();
  },
  next(auto) {
    const n = this.pl.length; if (!n) return;
    let i;
    if (this.cfg.shuffle && n > 1) { do { i = Math.floor(Math.random() * n); } while (i === this.idx); } else i = this.idx + 1;
    if (i >= n) { if (this.cfg.loop === 'all' || !auto) i = 0; else { this.stop(); return; } }
    this.load(i, true);
  },
  prev() { if (this.st.time > 3) { this.seek(0); return; } if (this.pl.length) this.load((this.idx - 1 + this.pl.length) % this.pl.length, true); },
  ended() { if (this.cfg.loop !== 'one') this.next(true); },
  applyLoop() { const on = this.cfg.loop === 'one'; this.el.loop = on; if (this.remote) api.mediaCmd({ op: 'loop', on }); },
  applyVolume() { const v = this.cfg.muted ? 0 : this.cfg.volume; this.el.volume = v; if (this.remote) api.mediaCmd({ op: 'volume', v }); },
  setSink(id) {
    this.cfg.sinkId = id; App.save();
    if (this.el.setSinkId) this.el.setSinkId(id || '').catch(() => toast(t('Could not switch audio output')));
    api.mediaCmd({ op: 'sink', id });
  },
  ui() {
    const it = this.pl[this.idx];
    $('#plNow').textContent = it ? (this.remote ? '[' + t('on projector') + '] ' : '') + it.name.replace(/\.[^.]+$/, '') : t('Nothing loaded');
    $('#plNow').classList.toggle('playing', !!it && !this.st.paused);
    $('#plVideo').classList.toggle('hidden', !it || it.kind !== 'video' || this.remote);
    $('#plPlay').innerHTML = icon(this.st.paused ? 'play' : 'pause');
    $('#plCur').textContent = fmtTime(this.st.time);
    $('#plDur').textContent = fmtTime(this.st.duration);
    if (!this.seeking) $('#plSeek').value = this.st.duration ? Math.round(this.st.time / this.st.duration * 1000) : 0;
    $('#plLoop').innerHTML = icon(this.cfg.loop === 'one' ? 'repeat1' : 'repeat');
    $('#plLoop').classList.toggle('on', this.cfg.loop !== 'off');
    $('#plLoop').title = t('Repeat') + ': ' + t(this.cfg.loop === 'one' ? 'one' : this.cfg.loop === 'all' ? 'all' : 'off');
    $('#plShuffle').classList.toggle('on', !!this.cfg.shuffle);
    $('#plMute').innerHTML = icon(this.cfg.muted || !this.cfg.volume ? 'mute' : 'vol');
  },
};

// ------------------------------------------------------------------ downloader (yt-dlp)
const Downloader = {
  info: null, busy: false,
  JUNK: [
    // English
    'official music video', 'official video', 'official audio', 'official lyric video', 'lyric video', 'lyrics video', 'with lyrics', 'lyrics', 'lyric', 'karaoke', 'instrumental', 'playback', 'backing track',
    'music video', 'audio only', 'full hd', 'hd', 'hq', '4k', '1080p', '720p', '60fps', '30fps', '2160p', '1440p', '8k', 'visualizer', 'remastered', 'official', 'video', 'audio', 'cover', 'live session', 'vevo', 'topic',
    // Romanian
    'fonografie', 'negativ', 'cu versuri', 'versuri', 'cuvinte', 'cu cuvinte', 'videoclip oficial', 'videoclip', 'clip oficial', 'clip video', 'oficial', 'cintare crestina', 'cântare creștină', 'cantare crestina', 'cantari crestine', 'cântări creștine', 'muzica crestina', 'muzică creștină',
    // Russian
    'официальное видео', 'официальный клип', 'клип', 'караоке', 'минус', 'минусовка', 'текст песни', 'с текстом', 'текст', 'видео', 'аудио', 'новинка', 'христианские песни', 'христианская песня',
  ],
  cleanTitle(info) {
    let title = info.track || '', artist = info.artist || info.creator || '';
    let raw = info.title || '';
    if (!title) {
      // "Artist - Title" is the usual YouTube form
      const m = raw.split(/\s+[-–—|]\s+/);
      if (m.length >= 2) {
        const up = fold(info.uploader || info.channel || ''), L = fold(m[0]), R = fold(m[m.length - 1]);
        const rightIsArtist = up && R && (up.includes(R) || R.includes(up)) && !(L && (up.includes(L) || L.includes(up)));
        if (rightIsArtist) { artist = artist || m[m.length - 1]; title = m.slice(0, -1).join(' '); }
        else { artist = artist || m[0]; title = m.slice(1).join(' '); }
      } else title = raw;
    }
    if (!artist) artist = (info.uploader || info.channel || '').replace(/\s*-\s*Topic$/i, '').replace(/vevo$/i, '');
    const clean = s => {
      let x = ' ' + String(s || '') + ' ';
      x = x.replace(/[(\[{][^)\]}]*[)\]}]/g, m => this.JUNK.some(j => fold(m).includes(fold(j))) || /\d{4}/.test(m) ? ' ' : m);
      for (const j of this.JUNK.sort((a, b) => b.length - a.length)) x = x.replace(new RegExp('(^|[\\s|/•·,.:!-])' + j.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[\\s|/•·,.:!-])', 'gi'), ' ');
      return x.replace(/#\S+/g, ' ').replace(/\b(19|20)\d{2}\b/g, ' ').replace(/[|•·]+/g, ' ').replace(/\s*[-–—]\s*$/g, '').replace(/^\s*[-–—]\s*/g, '').replace(/\s+/g, ' ').replace(/[\s,.:;!-]+$/, '').trim();
    };
    title = clean(title); artist = clean(artist);
    if (artist && fold(title).includes(fold(artist))) artist = '';
    return [title, artist].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'download';
  },
  FORMATS: {
    audio: { formats: ['mp3', 'm4a', 'opus', 'wav', 'flac'], quality: [['best', 'Best'], ['320', '320 kbps'], ['256', '256 kbps'], ['192', '192 kbps'], ['128', '128 kbps']], rates: [['', 'Original Hz'], ['44100', '44.1 kHz'], ['48000', '48 kHz']] },
    video: { formats: ['mp4', 'webm', 'mkv'], quality: [['best', 'Best'], ['2160', '2160p (4K)'], ['1440', '1440p'], ['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['360', '360p']] },
  },
  cfg() { return App.settings.downloads; },
  init() {
    $$('#dlKind button').forEach(b => b.onclick = () => { this.cfg().kind = b.dataset.k; App.save(); this.fillFormats(); });
    $('#dlFormat').onchange = e => { this.cfg()[this.cfg().kind === 'audio' ? 'aformat' : 'vformat'] = e.target.value; App.save(); };
    $('#dlQuality').onchange = e => { this.cfg()[this.cfg().kind === 'audio' ? 'aquality' : 'vres'] = e.target.value; App.save(); };
    $('#dlRate').onchange = e => { this.cfg().rate = e.target.value; App.save(); };
    $('#dlInfo').onclick = () => this.fetchInfo();
    $('#dlUrl').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this.fetchInfo(); } });
    $('#dlUrl').addEventListener('paste', () => setTimeout(() => this.fetchInfo(), 50));
    $('#dlGo').onclick = () => this.download();
    $('#dlCancel').onclick = () => api.ytdlpCancel();
    api.onYtdlpProgress(p => {
      if (p.pct != null) $('#dlBar').style.width = p.pct + '%';
      if (p.text) $('#dlStatus').textContent = p.text;
    });
    this.fillFormats();
    this.refreshTools();
  },
  fillFormats() {
    const k = this.cfg().kind, F = this.FORMATS[k], c = this.cfg();
    $$('#dlKind button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    $('#dlFormat').innerHTML = F.formats.map(f => `<option value="${f}">${f.toUpperCase()}</option>`).join('');
    $('#dlFormat').value = k === 'audio' ? c.aformat : c.vformat;
    $('#dlQuality').innerHTML = F.quality.map(([v, l]) => `<option value="${v}">${t(l)}</option>`).join('');
    $('#dlQuality').value = k === 'audio' ? c.aquality : c.vres;
    $('#dlRate').classList.toggle('hidden', k !== 'audio');
    if (k === 'audio') { $('#dlRate').innerHTML = this.FORMATS.audio.rates.map(([v, l]) => `<option value="${v}">${t(l)}</option>`).join(''); $('#dlRate').value = c.rate || ''; }
  },
  async refreshTools() {
    const s = await api.ytdlpStatus();
    this.tools = s;
    const part = (ok, name, size, what) => ok ? `${name} ✓` : `${name} ✗ <a href="#" data-get="${what}">${t('Download')} ${name} (${size})</a>`;
    $('#dlTools').innerHTML = `${part(s.ytdlp, 'yt-dlp', '~18 MB', 'ytdlp')} · ${part(s.ffmpeg, 'ffmpeg', s.ffmpegSize || '~90 MB', 'ffmpeg')}` + (s.ffmpeg ? '' : ` <span>${t('(ffmpeg is needed for MP3/WAV/FLAC and for high-quality video)')}</span>`);
    $$('#dlTools [data-get]').forEach(a => a.onclick = async e => {
      e.preventDefault();
      if (!confirm(t('Download this tool from its official GitHub release?') + `\n${a.dataset.get === 'ytdlp' ? 'yt-dlp (github.com/yt-dlp/yt-dlp)' : 'ffmpeg (github.com/yt-dlp/FFmpeg-Builds / evermeet.cx)'}`)) return;
      $('#dlStatus').textContent = t('Downloading') + '…';
      try { await api.ytdlpInstall(a.dataset.get); toast(t('Installed')); } catch (err) { toast(t('Failed') + ': ' + err.message, 6000); }
      this.refreshTools();
    });
  },
  async fetchInfo() {
    const url = $('#dlUrl').value.trim();
    if (!/^https?:\/\//i.test(url)) return;
    if (!this.tools || !this.tools.ytdlp) { toast(t('yt-dlp is not installed yet – use the link above')); return; }
    $('#dlStatus').textContent = t('Reading video information…');
    try {
      this.info = await api.ytdlpInfo(url);
      $('#dlName').value = this.cleanTitle(this.info);
      $('#dlStatus').textContent = `${this.info.title || ''} · ${fmtTime(this.info.duration)}`;
    } catch (e) { $('#dlStatus').textContent = t('Failed') + ': ' + e.message; }
  },
  async download() {
    if (this.busy) return;
    const url = $('#dlUrl').value.trim();
    if (!url) { toast(t('Paste a link first')); return; }
    if (!this.tools || !this.tools.ytdlp) { toast(t('yt-dlp is not installed yet – use the link above')); return; }
    const c = this.cfg(), audio = c.kind === 'audio';
    const fmt = audio ? c.aformat : c.vformat;
    if (!this.tools.ffmpeg && (audio ? !['m4a', 'opus'].includes(fmt) : true)) {
      if (!confirm(t('ffmpeg is not installed. Without it the file is saved in its original format (M4A/WebM audio, or a lower-quality MP4 video). Continue?'))) return;
    }
    if (!$('#dlName').value.trim() && !this.info) await this.fetchInfo();
    const name = ($('#dlName').value.trim() || 'download').replace(/[\\/:*?"<>|]+/g, ' ');
    this.busy = true; $('#dlGo').disabled = true; $('#dlCancel').classList.remove('hidden'); $('#dlBar').style.width = '0%';
    try {
      const f = await api.ytdlpDownload({ url, name, kind: c.kind, format: fmt, quality: audio ? c.aquality : c.vres, rate: c.rate });
      if (this.info && this.info.duration) f.duration = this.info.duration;
      Player.addFiles([f]);
      $('#dlStatus').textContent = t('Saved') + ': ' + f.name;
      $('#dlBar').style.width = '100%';
      $('#dlUrl').value = ''; this.info = null;
    } catch (e) { $('#dlStatus').textContent = t('Failed') + ': ' + e.message; }
    this.busy = false; $('#dlGo').disabled = false; $('#dlCancel').classList.add('hidden');
  },
};
