// Helpers shared by the control-window scripts + the forgiving search engine.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), ms);
}
const fmtTime = (t) => {
  t = Math.max(0, Math.floor(t || 0));
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0');
};

// ---------------------------------------------------------------- text folding
// lowercase, no diacritics, î/â → i, hyphens/apostrophes joined (m-am → mam), punctuation → space.
// Cyrillic letters are kept (Russian media titles).
function fold(s) {
  return String(s ?? '').toLowerCase()
    .replace(/[âî]/g, 'i')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/(\S)['’‘`´\-‐‑](?=\S)/g, '$1')
    .replace(/[^a-z0-9а-яё ]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
const norm = fold;

// light Romanian/English stemmer – gives a prefix used for inflected forms
function stem(w) {
  if (w.length <= 4) return w;
  const suf = ['urilor', 'ilor', 'elor', 'ului', 'urile', 'iile', 'ele', 'ile', 'uri', 'lor', 'ul', 'ua', 'ea', 'ei', 'ii', 'le', 'ia', 'ie', 'ing', 'ed', 'es', 'a', 'e', 'i', 'u', 's'];
  for (const s of suf) if (w.endsWith(s) && w.length - s.length >= 4) return w.slice(0, -s.length);
  return w;
}

// bounded Damerau-Levenshtein
function editDist(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length, m = b.length;
  let prev2 = null, prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= m; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v); if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[m];
}

// ---------------------------------------------------------------- search index
// docs: [{ id, title, text }] → query(q) returns { hits:[{id, score, why}], fixed: 'corrected query' | null }
class SearchIndex {
  constructor(docs, opts = {}) {
    this.opts = opts;
    this.docs = docs.map(d => ({ id: d.id, t: ' ' + fold(d.title || '') + ' ', x: ' ' + fold(d.text || '') + ' ' }));
    this.vocab = new Map();
    for (const d of this.docs) for (const w of (d.t + d.x).split(' ')) if (w.length > 1) this.vocab.set(w, (this.vocab.get(w) || 0) + 1);
    this.words = [...this.vocab.keys()];
  }
  hasPrefix(tok) {
    if (this.vocab.has(tok)) return true;
    for (const w of this.words) if (w.startsWith(tok)) return true;
    return false;
  }
  // closest dictionary words for a misspelled token
  correct(tok) {
    const max = tok.length <= 3 ? 0 : tok.length <= 5 ? 1 : tok.length <= 9 ? 2 : 3;
    if (!max) return [];
    const out = [];
    for (const w of this.words) {
      if (Math.abs(w.length - tok.length) > max) continue;
      const d = editDist(tok, w, max);
      if (d <= max) out.push([d, -(this.vocab.get(w) || 0), w]);
    }
    out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return out.slice(0, 4).map(x => x[2]);
  }
  // alternatives per token: exact/prefix form first, then stem prefix, then spelling corrections
  expand(tok) {
    const alts = [];
    if (this.hasPrefix(tok)) alts.push({ w: tok, k: 1 });
    const st = stem(tok);
    if (st !== tok && this.hasPrefix(st)) alts.push({ w: st, k: 0.8 });
    if (!alts.length) for (const c of this.correct(tok)) alts.push({ w: stem(c), k: 0.6, fix: c });
    return alts;
  }
  query(q, limit = 500) {
    const fq = fold(q);
    if (!fq) return { hits: this.docs.slice(0, limit).map(d => ({ id: d.id, score: 0 })), fixed: null };
    const toks = fq.split(' ').filter(Boolean);
    const exp = toks.map(t => this.expand(t));
    const fixedToks = toks.map((t, i) => exp[i][0] && exp[i][0].fix ? exp[i][0].fix : t);
    const fixed = fixedToks.join(' ') !== toks.join(' ') ? fixedToks.join(' ') : null;
    const phrase = ' ' + fq;
    const phrase2 = fixed ? ' ' + fixed : null;
    const hits = [];
    for (const d of this.docs) {
      let s = 0;
      const all = d.t + d.x;
      if (d.t.includes(phrase)) s += d.t.startsWith(phrase) ? 120 : 90;
      else if (d.x.includes(phrase)) s += 70;
      else if (phrase2 && all.includes(phrase2)) s += 60;
      let got = 0, w = 0;
      exp.forEach((alts, i) => {
        if (!alts.length) return;
        for (const a of alts) {
          if (all.includes(' ' + a.w)) { got++; w += a.k * (d.t.includes(' ' + a.w) ? 1.5 : 1); break; }
        }
      });
      if (!s && toks.length > 1 && got < Math.ceil(toks.length * (this.opts.loose ? 0.6 : 1))) continue;
      if (!s && !got) continue;
      s += w * 10 + (got === toks.length ? 20 : 0);
      hits.push({ id: d.id, score: s });
    }
    hits.sort((a, b) => b.score - a.score);
    return { hits: hits.slice(0, limit), fixed, total: hits.length };
  }
}

// ---------------------------------------------------------------- SVG icons (no emoji)
const ICONS = {
  play: '<path d="M7 5v14l11-7z"/>',
  pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>',
  stop: '<path d="M6 6h12v12H6z"/>',
  prev: '<path d="M6 5h2v14H6zM20 5v14L9 12z"/>',
  next: '<path d="M16 5h2v14h-2zM4 5v14l11-7z"/>',
  back10: '<path d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z" /><text x="12" y="16.5" font-size="6.5" text-anchor="middle" font-family="Segoe UI,Arial" font-weight="700">10</text>',
  fwd10: '<path d="M12 5V2l5 4-5 4V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/><text x="12" y="16.5" font-size="6.5" text-anchor="middle" font-family="Segoe UI,Arial" font-weight="700">10</text>',
  vol: '<path d="M4 9v6h4l5 4V5L8 9zM16 8.5a4.5 4.5 0 0 1 0 7v-2a2.5 2.5 0 0 0 0-3zM16 4.5a8.5 8.5 0 0 1 0 15v-2a6.5 6.5 0 0 0 0-11z"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9zM16.3 9.7l1.4-1.4 2 2 2-2 1.4 1.4-2 2 2 2-1.4 1.4-2-2-2 2-1.4-1.4 2-2z"/>',
  repeat: '<path d="M7 7h10v3l4-4-4-4v3H5v6h2zM17 17H7v-3l-4 4 4 4v-3h12v-6h-2z"/>',
  repeat1: '<path d="M7 7h10v3l4-4-4-4v3H5v6h2zM17 17H7v-3l-4 4 4 4v-3h12v-6h-2z"/><path d="M11 10h2v5h-1.5v-3.5H11z"/>',
  shuffle: '<path d="M10.6 9.2 5.4 4 4 5.4l5.2 5.2zM14.5 4l2 2L4 18.6 5.4 20 18 7.5l2 2V4zM14.8 13.4l-1.4 1.4 3.1 3.2-2 2H20v-5.5l-2 2z"/>',
  list: '<path d="M4 6h16v2H4zM4 11h16v2H4zM4 16h10v2H4z"/>',
  pin: '<path d="M14 3l7 7-2 1-4 4 1 5-2 1-4-4-5 5-1-1 5-5-4-4 1-2 5 1 4-4z"/>',
  float: '<path d="M4 4h10v2H6v8H4zM8 8h12v12H8zM10 10v8h8v-8z"/>',
  close: '<path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  edit: '<path d="M4 17.3V20h2.7l8-8L12 9.3zM19.7 7a1 1 0 0 0 0-1.4l-1.3-1.3a1 1 0 0 0-1.4 0L15.6 5.7l2.7 2.7z"/>',
  plus: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>',
  addList: '<path d="M3 6h12v2H3zM3 11h12v2H3zM3 16h8v2H3zM17 13h2v3h3v2h-3v3h-2v-3h-3v-2h3z"/>',
  monitor: '<path d="M3 4h18v12H3zM5 6v8h14V6zM9 18h6v2H9z"/>',
  layout: '<path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z"/>',
  freeze: '<path d="M11 2h2v4.6l2.3-1.4 1 1.7L13 9v2h2l2.1-3.3 1.7 1L17.4 11H22v2h-4.6l1.4 2.3-1.7 1L15 13h-2v2l3.3 2.1-1 1.7-2.3-1.4V22h-2v-4.6l-2.3 1.4-1-1.7L11 15v-2H9l-2.1 3.3-1.7-1L6.6 13H2v-2h4.6L5.2 8.7l1.7-1L9 11h2V9L7.7 6.9l1-1.7L11 6.6z"/>',
  eye: '<path d="M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7S3 14.5 2 12c1-2.5 5-7 10-7zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>',
  eyeOff: '<path d="M3.3 2 2 3.3 5.4 6.7C3.7 8 2.6 9.8 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.6 4.8-1.4l3.9 3.9 1.3-1.3zM12 5c5 0 9 4.5 10 7-.5 1.3-1.6 3-3.2 4.4l-2.9-2.9A4 4 0 0 0 10.5 8.1L8.6 6.2C9.7 5.4 10.8 5 12 5z"/>',
  download: '<path d="M11 3h2v9l3.5-3.5 1.4 1.4L12 15.8 6.1 9.9l1.4-1.4L11 12zM4 18h16v2H4z"/>',
  folder: '<path d="M3 5h7l2 2h9v12H3z"/>',
  grip: '<path d="M8 5h2v2H8zM14 5h2v2h-2zM8 11h2v2H8zM14 11h2v2h-2zM8 17h2v2H8zM14 17h2v2h-2z"/>',
  search: '<path d="M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/>',
  note: '<path d="M5 3h10l4 4v14H5zM14 4.5V8h3.5zM7 11h10v1.5H7zM7 14h10v1.5H7zM7 17h7v1.5H7z"/>',
};
const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONS[name] || ''}</svg>`;
