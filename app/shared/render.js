// Shared projector renderer – used by the projector window, the live preview and theme thumbnails.
// The stage is laid out at a logical width of 1920px and scaled to its container, so text fitting
// is identical everywhere.  Features: text auto-fit, subtle in/out/step/section effects (Web
// Animations), overlays (clock, key/chord, page n/N), end-of-song divider designs, Bible version
// separator, backgrounds (color, gradient, image, video, slideshow, animated canvas), video layer.
(function () {
  const LOGICAL_W = 1920;

  const DEFAULT_THEME = {
    name: 'Default',
    bg: {
      type: 'gradient', color: '#0b1020', color2: '#1d2b52', angle: 135, image: '', video: '', slides: [],
      interval: 10, fade: 2, fit: 'cover', dim: 0.25, blur: 0, mediaOpacity: 1, videoSpeed: 1,
      anim: 'particles', a1: '#9fc2ff', a2: '#ffd479', speed: 1, density: 1, size: 1, opacity: 0.6,
    },
    font: 'Segoe UI', weight: 600, color: '#ffffff', shadow: true, outline: false, align: 'center',
    lineHeight: 1.22, padding: 5, songMax: 96, bibleMax: 80, uppercase: false,
    refColor: '#ffd479', refSize: 44, showSongFooter: true, footerSize: 30,
    vdcScale: 100, bsbScale: 100, bsbItalic: false,
  };

  // program-wide projector options (set in Settings, not per theme)
  const DEFAULT_UI = {
    effects: {
      in: { type: 'rise', dur: 0.45, dist: 18 },
      out: { type: 'fade', dur: 0.35, dist: 12 },
      step: { type: 'slide', dur: 0.35, dist: 28, songs: true, bible: true },
      section: { type: 'fadeThrough', dur: 0.6 },
    },
    overlays: {
      clock: { on: false, pos: 'top-right', size: 46, color: '#ffffff', opacity: 0.9 },
      key: { on: false, pos: 'top-left', size: 40, color: '#ffd479', opacity: 0.9, prefix: '♪ ' },
      page: { on: false, pos: 'bottom-right', size: 34, color: '#ffffff', opacity: 0.75, style: 'fraction' },
    },
    endMark: { on: true, design: 'cross-flourish', width: 34, height: 46, thickness: 3, spacing: 22, gap: 26, color: '#ffd479', color2: '#ffffff', opacity: 0.85, glow: 6, anim: 'draw' },
    bibleSep: { design: 'line', width: 70, height: 24, thickness: 3, spacing: 18, gap: 20, color: '#ffffff', color2: '#ffffff', opacity: 0.55, glow: 0, anim: 'none' },
  };

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function merge(a, b) {
    const o = Array.isArray(a) ? a.slice() : { ...a };
    for (const k in b) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a && typeof a[k] === 'object' && !Array.isArray(a[k])) o[k] = merge(a[k], b[k]);
      else if (b[k] !== undefined) o[k] = b[k];
    }
    return o;
  }

  // ------------------------------------------------------------------ divider designs
  const DIVIDERS = {
    'cross-flourish': 'Cross with flourish', 'line': 'Tapered line', 'double': 'Double line', 'diamond': 'Diamond',
    'dots': 'Three dots', 'dot-line': 'Line with dots', 'chevrons': 'Chevrons', 'swirl': 'Swirl', 'star': 'Star sparkle',
    'wave': 'Wave', 'cross-rays': 'Cross with rays', 'gap-cross': 'Small cross in a gap', 'arc': 'Soft arc', 'bar': 'Short bar',
    'circle': 'Ring', 'lozenges': 'Lozenge chain',
  };
  function dividerSvg(cfg, uidp) {
    const W = Math.max(40, Math.round(LOGICAL_W * (cfg.width || 30) / 100)), H = Math.max(8, cfg.height || 40);
    const cx = W / 2, cy = H / 2, t = cfg.thickness || 3, sp = cfg.spacing || 20, g = cfg.gap ?? 24;
    const id = 'g' + (uidp || '') + Math.random().toString(36).slice(2, 8);
    const c1 = cfg.color || '#fff', c2 = cfg.color2 || c1;
    const defs = `<defs>
      <linearGradient id="${id}L" x1="0" x2="1"><stop offset="0" stop-color="${c2}" stop-opacity="0"/><stop offset="1" stop-color="${c1}"/></linearGradient>
      <linearGradient id="${id}R" x1="0" x2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></linearGradient>
      <linearGradient id="${id}F" x1="0" x2="1"><stop offset="0" stop-color="${c2}" stop-opacity="0"/><stop offset=".5" stop-color="${c1}"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></linearGradient>
    </defs>`;
    const S = (d, stroke, w = t) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/>`;
    const F = d => `<path class="fill" d="${d}" fill="${c1}"/>`;
    const lineL = (a, b, y = cy, w = t) => `<path d="M${b},${y} L${a},${y}" stroke="url(#${id}L)" stroke-width="${w}" stroke-linecap="round" pathLength="1" fill="none"/>`;
    const lineR = (a, b, y = cy, w = t) => `<path d="M${a},${y} L${b},${y}" stroke="url(#${id}R)" stroke-width="${w}" stroke-linecap="round" pathLength="1" fill="none"/>`;
    const sides = (from, y = cy, w = t) => lineL(t, cx - from, y, w) + lineR(cx + from, W - t, y, w);
    const full = (y = cy, w = t, x0 = t, x1 = W - t) => `<path d="M${x0},${y} L${x1},${y}" stroke="url(#${id}F)" stroke-width="${w}" stroke-linecap="round" pathLength="1" fill="none"/>`;
    let body = '';
    const r = H * 0.38;
    switch (cfg.design) {
      case 'line': body = full(); break;
      case 'double': body = full(cy - sp / 4) + full(cy + sp / 4, Math.max(1, t * 0.6), W * 0.15, W * 0.85); break;
      case 'diamond': body = sides(g + r) + S(`M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z`, c1) + F(`M${cx},${cy - r * 0.35} L${cx + r * 0.35},${cy} L${cx},${cy + r * 0.35} L${cx - r * 0.35},${cy} Z`); break;
      case 'dots': body = [-1, 0, 1].map(i => `<circle class="fill" cx="${cx + i * sp}" cy="${cy}" r="${t * 1.5}" fill="${c1}"/>`).join(''); break;
      case 'dot-line': body = sides(g) + `<circle class="fill" cx="${cx}" cy="${cy}" r="${t * 1.6}" fill="${c1}"/><circle class="fill" cx="${cx - g - sp}" cy="${cy}" r="${t}" fill="${c1}"/><circle class="fill" cx="${cx + g + sp}" cy="${cy}" r="${t}" fill="${c1}"/>`; break;
      case 'chevrons': body = sides(g + sp) + S(`M${cx - g},${cy - r * 0.6} L${cx - g - r * 0.6},${cy} L${cx - g},${cy + r * 0.6}`, c1) + S(`M${cx + g},${cy - r * 0.6} L${cx + g + r * 0.6},${cy} L${cx + g},${cy + r * 0.6}`, c1) + `<circle class="fill" cx="${cx}" cy="${cy}" r="${t * 1.3}" fill="${c1}"/>`; break;
      case 'swirl': body = sides(g + r * 2.2) + S(`M${cx - g - r * 2.2},${cy} C${cx - g - r},${cy} ${cx - g - r},${cy - r} ${cx - g * 0.5},${cy - r * 0.6} S${cx - r * 0.6},${cy + r * 0.2} ${cx - r * 0.5},${cy}`, c1) + S(`M${cx + g + r * 2.2},${cy} C${cx + g + r},${cy} ${cx + g + r},${cy - r} ${cx + g * 0.5},${cy - r * 0.6} S${cx + r * 0.6},${cy + r * 0.2} ${cx + r * 0.5},${cy}`, c1) + `<circle cx="${cx}" cy="${cy}" r="${r * 0.3}" fill="none" stroke="${c1}" stroke-width="${t}" pathLength="1"/>`; break;
      case 'star': { const R = H * 0.45, q = R * 0.18; body = sides(g + R * 0.6) + F(`M${cx},${cy - R} Q${cx + q},${cy - q} ${cx + R},${cy} Q${cx + q},${cy + q} ${cx},${cy + R} Q${cx - q},${cy + q} ${cx - R},${cy} Q${cx - q},${cy - q} ${cx},${cy - R} Z`); break; }
      case 'wave': { let d = `M${t},${cy}`; const n = Math.max(4, Math.round(W / Math.max(30, sp * 4))); const step = (W - 2 * t) / n; for (let i = 0; i < n; i++) d += ` Q${t + step * (i + 0.5)},${cy + (i % 2 ? r : -r)} ${t + step * (i + 1)},${cy}`; body = `<path d="${d}" stroke="url(#${id}F)" stroke-width="${t}" fill="none" stroke-linecap="round" pathLength="1"/>`; break; }
      case 'cross-rays': { const ch = H * 0.42, cw = ch * 0.62; body = sides(g + cw, cy - sp / 5, Math.max(1, t * 0.7)) + sides(g + cw, cy + sp / 5, Math.max(1, t * 0.7)) + S(`M${cx},${cy - ch} L${cx},${cy + ch}`, c1, t * 1.2) + S(`M${cx - cw},${cy - ch * 0.35} L${cx + cw},${cy - ch * 0.35}`, c1, t * 1.2) + [30, 60, 120, 150, 210, 240, 300, 330].map(a => { const ra = a * Math.PI / 180, r1 = ch * 1.05, r2 = ch * 1.3; return S(`M${cx + Math.cos(ra) * r1},${cy - ch * 0.35 + Math.sin(ra) * r1 * 0.6} L${cx + Math.cos(ra) * r2},${cy - ch * 0.35 + Math.sin(ra) * r2 * 0.6}`, c1, Math.max(1, t * 0.5)); }).join(''); break; }
      case 'gap-cross': { const ch = H * 0.3; body = sides(g + ch) + S(`M${cx},${cy - ch} L${cx},${cy + ch}`, c1) + S(`M${cx - ch * 0.62},${cy - ch * 0.3} L${cx + ch * 0.62},${cy - ch * 0.3}`, c1); break; }
      case 'arc': body = `<path d="M${t},${cy + r * 0.6} Q${cx},${cy - r * 1.6} ${W - t},${cy + r * 0.6}" stroke="url(#${id}F)" stroke-width="${t}" fill="none" stroke-linecap="round" pathLength="1"/>`; break;
      case 'bar': body = `<rect class="fill" x="${cx - W * 0.18}" y="${cy - t}" width="${W * 0.36}" height="${t * 2}" rx="${t}" fill="url(#${id}F)"/>`; break;
      case 'circle': body = sides(g + r) + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c1}" stroke-width="${t}" pathLength="1"/><circle class="fill" cx="${cx}" cy="${cy}" r="${t * 1.2}" fill="${c1}"/>`; break;
      case 'lozenges': { const s = sp * 1.2; body = sides(g + s * 2.6); for (let i = -2; i <= 2; i++) { const k = 1 - Math.abs(i) * 0.25, rr = r * 0.55 * k, x = cx + i * s; body += F(`M${x},${cy - rr} L${x + rr * 0.6},${cy} L${x},${cy + rr} L${x - rr * 0.6},${cy} Z`); } break; }
      case 'cross-flourish': default: {
        const ch = H * 0.46, cw = ch * 0.6, w2 = Math.max(1, t * 0.8);
        body = sides(g + cw + r * 1.4)
          + S(`M${cx - g - cw},${cy} C${cx - g - cw - r * 0.6},${cy - r * 0.9} ${cx - g - cw - r * 1.4},${cy - r * 0.2} ${cx - g - cw - r * 1.4},${cy}`, c1, w2)
          + S(`M${cx + g + cw},${cy} C${cx + g + cw + r * 0.6},${cy - r * 0.9} ${cx + g + cw + r * 1.4},${cy - r * 0.2} ${cx + g + cw + r * 1.4},${cy}`, c1, w2)
          + S(`M${cx - g},${cy} L${cx - g - cw},${cy}`, c1, w2) + S(`M${cx + g},${cy} L${cx + g + cw},${cy}`, c1, w2)
          + S(`M${cx},${cy - ch} L${cx},${cy + ch}`, c1, t * 1.3) + S(`M${cx - cw},${cy - ch * 0.32} L${cx + cw},${cy - ch * 0.32}`, c1, t * 1.3);
      }
    }
    const glow = cfg.glow ? `filter:drop-shadow(0 0 ${cfg.glow}px ${c1});` : '';
    return `<svg class="sr-div anim-${cfg.anim || 'none'}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="--op:${cfg.opacity ?? 1};opacity:${cfg.opacity ?? 1};${glow}" xmlns="http://www.w3.org/2000/svg">${defs}${body}</svg>`;
  }

  // ------------------------------------------------------------------ animated backgrounds (canvas)
  const ANIMS = { particles: 'Floating particles', bokeh: 'Soft bokeh', flow: 'Gradient flow', waves: 'Soft waves', network: 'Network lines', rays: 'Light rays', rings: 'Slow rings', dust: 'Fine dust', grid: 'Glow grid' };
  function hexRgb(h) { const n = parseInt(String(h || '#ffffff').slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  class BgAnim {
    constructor(canvas, cfg, opts) {
      this.c = canvas; this.ctx = canvas.getContext('2d'); this.cfg = cfg; this.opts = opts || {};
      this.t = 0; this.last = 0; this.parts = []; this.running = false;
      this.seed();
      if (this.opts.static) { this.t = 300; this.frame(16); } else this.start();
    }
    seed() {
      const { c, cfg } = this, W = c.width, H = c.height, dens = cfg.density || 1;
      const n = { particles: 70, bokeh: 22, network: 55, dust: 220, rings: 6, rays: 7, waves: 5, flow: 5, grid: 1 }[cfg.anim] || 40;
      const rnd = (a, b) => a + Math.random() * (b - a);
      this.parts = Array.from({ length: Math.max(1, Math.round(n * dens)) }, (_, i) => ({
        x: rnd(0, W), y: rnd(0, H), vx: rnd(-1, 1), vy: rnd(-1, 1), r: rnd(0.5, 1), p: rnd(0, Math.PI * 2), k: i, c: Math.random() < 0.5 ? 0 : 1,
      }));
      this.densKey = cfg.anim + ':' + dens;
    }
    start() {
      this.running = true;
      const loop = (ts) => {
        if (!this.running) return;
        const dt = this.last ? Math.min(50, ts - this.last) : 16; this.last = ts;
        if (this.densKey !== this.cfg.anim + ':' + (this.cfg.density || 1)) this.seed();
        this.frame(dt);
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }
    stop() { this.running = false; cancelAnimationFrame(this.raf); }
    frame(dt) {
      const { c, ctx, cfg } = this, W = c.width, H = c.height, sp = (cfg.speed ?? 1) * dt / 16, sz = (cfg.size || 1) * W / 1280, op = cfg.opacity ?? 0.6;
      this.t += sp;
      const A = hexRgb(cfg.a1), B = hexRgb(cfg.a2), col = (k, a) => `rgba(${(k ? B : A).join(',')},${Math.max(0, Math.min(1, a))})`;
      ctx.clearRect(0, 0, W, H);
      const P = this.parts, t = this.t;
      switch (cfg.anim) {
        case 'bokeh':
          ctx.globalCompositeOperation = 'lighter';
          for (const p of P) {
            p.x += p.vx * 0.15 * sp; p.y += p.vy * 0.1 * sp - 0.05 * sp;
            if (p.x < -80) p.x = W + 80; if (p.x > W + 80) p.x = -80; if (p.y < -80) p.y = H + 80; if (p.y > H + 80) p.y = -80;
            const R = (20 + p.r * 45) * sz, a = op * (0.12 + 0.12 * Math.sin(t * 0.01 + p.p));
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R); g.addColorStop(0, col(p.c, a)); g.addColorStop(0.7, col(p.c, a * 0.6)); g.addColorStop(1, col(p.c, 0));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, 7); ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over'; break;
        case 'flow':
          for (const p of P) {
            const x = W * (0.5 + 0.42 * Math.sin(t * 0.0021 * (1 + p.k * 0.13) + p.p)), y = H * (0.5 + 0.42 * Math.cos(t * 0.0017 * (1 + p.k * 0.11) + p.p * 2));
            const R = Math.max(W, H) * (0.35 + 0.12 * p.r) * (cfg.size || 1), g = ctx.createRadialGradient(x, y, 0, x, y, R);
            g.addColorStop(0, col(p.c, op * 0.35)); g.addColorStop(1, col(p.c, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          } break;
        case 'waves':
          ctx.lineWidth = 1.5 * sz;
          P.forEach((p, i) => {
            ctx.strokeStyle = col(i % 2, op * 0.35); ctx.beginPath();
            for (let x = 0; x <= W; x += 8) { const y = H * (0.3 + i * 0.1) + Math.sin(x * 0.006 * 1280 / W + t * 0.012 * (1 + i * 0.2) + p.p) * 28 * sz + Math.sin(x * 0.013 * 1280 / W - t * 0.008) * 12 * sz; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
            ctx.stroke();
          }); break;
        case 'network':
          for (const p of P) { p.x += p.vx * 0.25 * sp; p.y += p.vy * 0.25 * sp; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; }
          ctx.lineWidth = 1;
          for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
            const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, d = Math.hypot(dx, dy), L = 130 * sz;
            if (d < L) { ctx.strokeStyle = col(0, op * 0.35 * (1 - d / L)); ctx.beginPath(); ctx.moveTo(P[i].x, P[i].y); ctx.lineTo(P[j].x, P[j].y); ctx.stroke(); }
          }
          for (const p of P) { ctx.fillStyle = col(p.c, op * 0.8); ctx.beginPath(); ctx.arc(p.x, p.y, 1.8 * sz, 0, 7); ctx.fill(); }
          break;
        case 'rays':
          ctx.globalCompositeOperation = 'lighter';
          P.forEach((p, i) => {
            const x0 = W * (0.1 + i / P.length * 0.9) + Math.sin(t * 0.004 + p.p) * 60 * sz, w = (60 + p.r * 120) * sz;
            const g = ctx.createLinearGradient(x0, 0, x0 - 200 * sz, H); g.addColorStop(0, col(p.c, op * 0.22 * (0.6 + 0.4 * Math.sin(t * 0.006 + p.p)))); g.addColorStop(1, col(p.c, 0));
            ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + w, 0); ctx.lineTo(x0 + w - 300 * sz, H); ctx.lineTo(x0 - 300 * sz, H); ctx.fill();
          });
          ctx.globalCompositeOperation = 'source-over'; break;
        case 'rings':
          ctx.lineWidth = 1.5 * sz;
          P.forEach((p, i) => {
            const M = Math.max(W, H), R = ((t * 0.6 * W / 1280 + i * (M / P.length)) % M), a = op * 0.4 * (1 - R / M);
            ctx.strokeStyle = col(i % 2, a); ctx.beginPath(); ctx.arc(W / 2, H / 2, R, 0, 7); ctx.stroke();
          }); break;
        case 'grid': {
          const s = 60 * sz, off = (t * 0.3 * W / 1280) % s;
          ctx.lineWidth = 1; ctx.strokeStyle = col(0, op * 0.12);
          for (let x = -s + off; x < W; x += s) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
          for (let y = -s + off; y < H; y += s) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
          const gx = W / 2 + Math.sin(t * 0.004) * W * 0.3, gy = H / 2 + Math.cos(t * 0.003) * H * 0.3, g = ctx.createRadialGradient(gx, gy, 0, gx, gy, W * 0.4);
          g.addColorStop(0, col(1, op * 0.25)); g.addColorStop(1, col(1, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); break;
        }
        case 'dust':
          for (const p of P) {
            p.x += (p.vx * 0.12 + 0.05) * sp; p.y += p.vy * 0.08 * sp; if (p.x > W) p.x = 0; if (p.x < 0) p.x = W; if (p.y > H) p.y = 0; if (p.y < 0) p.y = H;
            ctx.fillStyle = col(p.c, op * (0.25 + 0.35 * Math.abs(Math.sin(t * 0.01 + p.p)))); ctx.fillRect(p.x, p.y, 1.6 * sz, 1.6 * sz);
          } break;
        case 'particles': default:
          for (const p of P) {
            p.x += p.vx * 0.2 * sp; p.y += (p.vy * 0.1 - 0.25) * sp; if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; } if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
            const R = (1.2 + p.r * 2.6) * sz, a = op * (0.35 + 0.45 * Math.abs(Math.sin(t * 0.008 + p.p)));
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 3); g.addColorStop(0, col(p.c, a)); g.addColorStop(1, col(p.c, 0));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, R * 3, 0, 7); ctx.fill();
          }
      }
    }
  }

  // ------------------------------------------------------------------ effects
  const EASE = 'cubic-bezier(.22,.61,.36,1)';
  function frames(type, dir, dist, entering) {
    const d = dist || 20, s = dir || 1;
    const k = {
      none: [{ opacity: 1 }, { opacity: 1 }],
      fade: [{ opacity: 0 }, { opacity: 1 }],
      crossfade: [{ opacity: 0 }, { opacity: 1 }],
      rise: [{ opacity: 0, transform: `translateY(${d}px)` }, { opacity: 1, transform: 'none' }],
      sink: [{ opacity: 0, transform: `translateY(${-d}px)` }, { opacity: 1, transform: 'none' }],
      zoom: [{ opacity: 0, transform: 'scale(0.965)' }, { opacity: 1, transform: 'none' }],
      blur: [{ opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0)' }],
      focus: [{ opacity: 0, filter: 'blur(6px)', transform: 'scale(1.03)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }],
      slide: [{ opacity: 0, transform: `translateX(${d * s}px)` }, { opacity: 1, transform: 'none' }],
      lift: [{ opacity: 0, transform: `translateY(${d * s}px)` }, { opacity: 1, transform: 'none' }],
    }[type] || [{ opacity: 0 }, { opacity: 1 }];
    if (entering) return k;
    if (type === 'none') return [{ opacity: 1 }, { opacity: 0 }];
    const out = [k[1], { ...k[0] }];
    if (type === 'slide') out[1].transform = `translateX(${-d * s}px)`;
    if (type === 'lift') out[1].transform = `translateY(${-d * s}px)`;
    return out;
  }

  // ------------------------------------------------------------------ Stage
  class Stage {
    constructor(container, opts = {}) {
      this.container = container;
      this.aspect = opts.aspect || null;
      this.isStatic = !!opts.static;
      this.lowFps = !!opts.lowFps;
      container.classList.add('sr-host');
      container.innerHTML = `
        <div class="sr-stage">
          <div class="sr-bg"><div class="sr-bgl"></div><div class="sr-bgl"></div><canvas class="sr-anim"></canvas><div class="sr-dim"></div></div>
          <div class="sr-media"><video playsinline preload="auto"></video></div>
          <div class="sr-content"><div class="sr-txt"></div><div class="sr-txt"></div></div>
          <div class="sr-ov" data-o="clock"></div><div class="sr-ov" data-o="key"></div><div class="sr-ov" data-o="page"></div>
          <div class="sr-black"></div>
        </div>`;
      this.stage = container.querySelector('.sr-stage');
      this.bgLayers = [...container.querySelectorAll('.sr-bgl')];
      this.canvas = container.querySelector('.sr-anim');
      this.dim = container.querySelector('.sr-dim');
      this.txt = [...container.querySelectorAll('.sr-txt')];
      this.cur = 0;
      this.ov = { clock: container.querySelector('[data-o="clock"]'), key: container.querySelector('[data-o="key"]'), page: container.querySelector('[data-o="page"]') };
      this.blackEl = container.querySelector('.sr-black');
      this.mediaLayer = container.querySelector('.sr-media');
      this.video = container.querySelector('.sr-media video');
      this.mediaMuted = !!opts.mutedMedia;
      this.video.muted = this.mediaMuted;
      this.theme = DEFAULT_THEME; this.ui = DEFAULT_UI;
      this.bgKey = ''; this.contentKey = ''; this.content = null;
      this.slideTimer = null; this.slideIdx = 0; this.activeBg = 0;
      this.ro = new ResizeObserver(() => this.layout());
      this.ro.observe(container);
      if (!this.isStatic) this.clockTimer = setInterval(() => this.tickOverlays(), 1000);
      this.layout();
    }

    layout() {
      const cw = this.container.clientWidth, ch = this.container.clientHeight;
      if (!cw || !ch) return;
      const aspect = this.aspect || cw / ch;
      const W = LOGICAL_W, H = Math.round(W / aspect);
      const scale = Math.min(cw / W, ch / H);
      Object.assign(this.stage.style, { width: W + 'px', height: H + 'px', transform: `translate(${(cw - W * scale) / 2}px, ${(ch - H * scale) / 2}px) scale(${scale})` });
      if (this.W !== W || this.H !== H) { this.W = W; this.H = H; this.refit(); }
    }

    render(state) {
      state = state || {};
      const theme = merge(DEFAULT_THEME, state.theme || {});
      const ui = merge(DEFAULT_UI, state.ui || {});
      this.theme = theme; this.ui = ui;
      this.applyBg(theme.bg);
      this.applyTextStyle(theme);
      this.blackEl.classList.toggle('on', state.view === 'black');
      this.ovState = state.overlay || {};
      const content = state.view === 'text' ? state.content : null;
      this.meta = content || null;
      this.tickOverlays();
      const key = JSON.stringify([content, theme.font, theme.weight, theme.songMax, theme.bibleMax, theme.uppercase, theme.lineHeight, theme.padding, theme.refSize, theme.showSongFooter, theme.footerSize, theme.align, theme.vdcScale, theme.bsbScale, theme.bsbItalic, ui.endMark, ui.bibleSep]);
      if (key !== this.contentKey) {
        this.contentKey = key;
        this.showContent(content, theme, ui, state.hint || {});
      }
    }

    applyTextStyle(t) {
      const s = this.stage.style;
      s.setProperty('--sr-font', `"${t.font}", "Segoe UI", Arial, sans-serif`);
      s.setProperty('--sr-weight', t.weight);
      s.setProperty('--sr-color', t.color);
      s.setProperty('--sr-ref', t.refColor);
      s.setProperty('--sr-lh', t.lineHeight);
      s.setProperty('--sr-pad', t.padding + '%');
      s.setProperty('--sr-align', t.align);
      s.setProperty('--sr-shadow', t.shadow ? '0 3px 12px rgba(0,0,0,.85), 0 0 3px rgba(0,0,0,.9)' : 'none');
      s.setProperty('--sr-outline', t.outline ? '2px rgba(0,0,0,.9)' : '0px transparent');
    }

    // ---------- background ----------
    applyBg(bg) {
      const key = JSON.stringify(bg);
      this.dim.style.background = `rgba(0,0,0,${bg.dim || 0})`;
      this.bgLayers.forEach(l => { l.style.filter = bg.blur ? `blur(${bg.blur}px)` : ''; l.style.setProperty('--sr-mop', bg.mediaOpacity ?? 1); });
      const v = this.bgLayers[this.activeBg].querySelector('video');
      if (v) v.playbackRate = bg.videoSpeed || 1;
      if (key === this.bgKey) return;
      const prev = this.bgKey ? JSON.parse(this.bgKey) : null;
      this.bgKey = key;
      const strip = b => JSON.stringify({ ...b, dim: 0, blur: 0, mediaOpacity: 0, videoSpeed: 0, speed: 0, density: 0, size: 0, opacity: 0, a1: 0, a2: 0 });
      if (bg.type === 'animated') this.setAnim(bg); else this.setAnim(null);
      if (prev && strip(prev) === strip(bg)) return;   // only tweakable values changed
      clearInterval(this.slideTimer); this.slideTimer = null;
      const fade = bg.fade != null ? bg.fade : 1;
      this.bgLayers.forEach(l => (l.style.transition = `opacity ${fade}s ease`));
      if (bg.type === 'slideshow' && bg.slides && bg.slides.length) {
        this.slideIdx = 0;
        this.setBgLayer({ type: 'image', image: bg.slides[0], fit: bg.fit });
        if (bg.slides.length > 1 && !this.isStatic) {
          this.slideTimer = setInterval(() => {
            this.slideIdx = (this.slideIdx + 1) % bg.slides.length;
            this.setBgLayer({ type: 'image', image: bg.slides[this.slideIdx], fit: bg.fit });
          }, Math.max(2, bg.interval || 10) * 1000);
        }
      } else if (bg.type === 'animated') this.setBgLayer({ type: 'gradient', color: bg.color, color2: bg.color2, angle: bg.angle });
      else this.setBgLayer(bg);
    }

    setAnim(bg) {
      if (!bg) { if (this.anim) { this.anim.stop(); this.anim = null; } this.canvas.style.display = 'none'; return; }
      this.canvas.style.display = '';
      if (this.anim && this.anim.cfg.anim === bg.anim) { this.anim.cfg = bg; return; }
      if (this.anim) this.anim.stop();
      const w = this.isStatic ? 320 : this.lowFps ? 640 : 1280;
      this.canvas.width = w; this.canvas.height = Math.round(w * 9 / 16);
      this.anim = new BgAnim(this.canvas, bg, { static: this.isStatic });
    }

    setBgLayer(bg) {
      const next = 1 - this.activeBg;
      const el = this.bgLayers[next], old = this.bgLayers[this.activeBg];
      el.innerHTML = ''; el.style.background = '';
      if (bg.type === 'color') el.style.background = bg.color;
      else if (bg.type === 'gradient') el.style.background = `linear-gradient(${bg.angle || 135}deg, ${bg.color}, ${bg.color2})`;
      else if (bg.type === 'image' && bg.image) {
        el.style.background = this.theme.bg.color || '#000';
        el.innerHTML = `<div class="sr-bgmedia" style="background:url('${String(bg.image).replace(/'/g, '%27')}') center / ${bg.fit || 'cover'} no-repeat"></div>`;
      } else if (bg.type === 'video' && bg.video) {
        el.style.background = this.theme.bg.color || '#000';
        const v = document.createElement('video');
        Object.assign(v, { src: bg.video, autoplay: !this.isStatic, loop: true, muted: true, playsInline: true, preload: 'auto' });
        v.className = 'sr-bgmedia'; v.style.objectFit = bg.fit || 'cover';
        v.playbackRate = bg.videoSpeed || 1;
        el.appendChild(v);
        if (!this.isStatic) v.play().catch(() => {});
      } else el.style.background = '#000';
      el.classList.add('on'); old.classList.remove('on');
      const oldEl = old;
      setTimeout(() => { if (!oldEl.classList.contains('on')) oldEl.innerHTML = ''; }, 3000);
      this.activeBg = next;
    }

    // ---------- text + effects ----------
    showContent(content, t, ui, hint) {
      const prev = this.content;
      this.content = content;
      const fx = ui.effects;
      let mode;
      if (!prev && content) mode = 'in';
      else if (prev && !content) mode = 'out';
      else if (!prev && !content) mode = 'none';
      else if (prev.kind !== content.kind) mode = 'section';
      else if (hint.dir && ((content.kind === 'song' && fx.step.songs) || (content.kind === 'bible' && fx.step.bible))) mode = 'step';
      else mode = 'change';
      const next = 1 - this.cur;
      const el = this.txt[next], old = this.txt[this.cur];
      el.innerHTML = content ? this.buildHtml(content, t, ui) : '';
      el.dataset.kind = content ? content.kind : '';
      this.cur = next;
      if (content) this.fitEl(el, t);
      const anim = (node, type, dur, dist, dir, entering, delay = 0) => {
        node.getAnimations().forEach(a => a.cancel());
        return node.animate(frames(this.isStatic ? 'none' : type, dir, dist, entering),
          { duration: this.isStatic ? 0 : Math.max(0, dur) * 1000, delay: this.isStatic ? 0 : delay * 1000, easing: EASE, fill: 'both' });
      };
      const D = (o) => Math.max(0, +o.dur || 0);
      if (mode === 'none') { anim(old, 'none', 0, 0, 1, false); anim(el, 'none', 0, 0, 1, false); }
      else if (mode === 'in') { anim(old, 'none', 0, 0, 1, false); anim(el, fx.in.type, D(fx.in), fx.in.dist, 1, true); }
      else if (mode === 'out') { anim(old, fx.out.type, D(fx.out), fx.out.dist, 1, false); anim(el, 'none', 0, 0, 1, false); }
      else if (mode === 'step') { anim(old, fx.step.type, D(fx.step), fx.step.dist, hint.dir, false); anim(el, fx.step.type, D(fx.step), fx.step.dist, hint.dir, true); }
      else if (mode === 'section') {
        const s = fx.section, d = D(s);
        if (s.type === 'fadeThrough') { anim(old, 'fade', d / 2, 0, 1, false); anim(el, 'fade', d / 2, 0, 1, true, d / 2); }
        else { anim(old, s.type, d, 16, 1, false); anim(el, s.type, d, 16, 1, true); }
      } else { anim(old, 'fade', Math.min(D(fx.in), 0.4), 0, 1, false); anim(el, 'crossfade', Math.min(D(fx.in), 0.4), 0, 1, true); }
      if (!this.isStatic) el.querySelectorAll('.sr-div').forEach(svg => { svg.classList.remove('play'); void svg.getBoundingClientRect(); svg.classList.add('play'); });
    }

    buildHtml(c, t, ui) {
      const lines = s => esc(s).replace(/\n/g, '<br>');
      if (c.kind === 'song') {
        const footer = t.showSongFooter && c.footer ? `<div class="sr-footer" style="font-size:${t.footerSize}px">${esc(c.footer)}</div>` : '';
        const end = c.last && ui.endMark.on ? `<div class="sr-end" style="margin-top:${ui.endMark.spacing}px">${dividerSvg(ui.endMark, 'e')}</div>` : '';
        return `<div class="sr-block sr-song"><div class="sr-body${t.uppercase ? ' up' : ''}">${lines(c.text)}</div>${end}</div>${footer}`;
      }
      if (c.kind === 'bible') {
        const sep = `<div class="sr-sepwrap" style="margin:${ui.bibleSep.spacing}px 0">${dividerSvg(ui.bibleSep, 's')}</div>`;
        return c.blocks.map(b => `<div class="sr-block sr-bible" data-scale="${(b.ver === 'BSB' ? t.bsbScale : b.ver === 'VDC' ? t.vdcScale : 100) / 100}"><div class="sr-body${b.ver === 'BSB' && t.bsbItalic ? ' it' : ''}">${lines(b.text)}</div><div class="sr-refline" style="font-size:${t.refSize}px">${esc(b.ref)}</div></div>`).join(sep);
      }
      if (c.kind === 'image') return `<div class="sr-image" style="background-image:url('${String(c.url).replace(/'/g, '%27')}')"></div>`;
      if (c.kind === 'text') return `<div class="sr-block"><div class="sr-body">${lines(c.text)}</div></div>`;
      return '';
    }

    refit() { const el = this.txt[this.cur]; if (el && el.innerHTML) this.fitEl(el, this.theme); }

    fitEl(el, t) {
      const kind = el.dataset.kind;
      const max = kind === 'bible' ? t.bibleMax : t.songMax;
      const blocks = [...el.querySelectorAll('.sr-block')];
      if (!blocks.length) return;
      const bodies = blocks.map(b => b.querySelector('.sr-body'));
      const mult = blocks.map(b => parseFloat(b.dataset.scale || '1') || 1);
      const fits = (size) => {
        bodies.forEach((b, i) => (b.style.fontSize = Math.max(10, Math.round(size * mult[i])) + 'px'));
        return blocks.every(b => b.scrollHeight <= b.clientHeight + 1 && b.scrollWidth <= b.clientWidth + 1);
      };
      let lo = 12, hi = Math.round(max / Math.max(...mult, 0.1)), best = lo;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (fits(mid)) { best = mid; lo = mid + 1; } else hi = mid - 1; }
      fits(best);
    }

    // ---------- overlays: clock (24 h), key/chord, page n/N ----------
    tickOverlays() {
      const o = this.ui.overlays, on = this.ovState || {}, m = this.meta;
      const set = (name, text) => {
        const el = this.ov[name], cfg = o[name];
        const show = !!(cfg && (cfg.on || on[name]) && text);
        el.style.display = show ? '' : 'none';
        if (!show) return;
        el.dataset.pos = cfg.pos;
        Object.assign(el.style, { fontSize: cfg.size + 'px', color: cfg.color, opacity: cfg.opacity ?? 1 });
        if (el.textContent !== text) el.textContent = text;
      };
      const d = new Date();
      set('clock', String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'));
      set('key', m && m.kind === 'song' && m.key ? (o.key.prefix || '') + m.key : '');
      let pg = '';
      if (m && m.kind === 'song' && m.page) {
        const [i, n] = m.page;
        pg = o.page.style === 'dots' ? Array.from({ length: n }, (_, k) => k === i - 1 ? '●' : '○').join(' ') : o.page.style === 'words' ? `${i} / ${n}` : `${i}/${n}`;
      }
      set('page', pg);
    }

    // ---------- media (video on the projector) ----------
    mediaCmd(c, onStatus) {
      const v = this.video;
      if (onStatus && !this.statusTimer) {
        const send = (extra) => onStatus(Object.assign({ time: v.currentTime || 0, duration: isFinite(v.duration) ? v.duration : 0, paused: v.paused, url: this.mediaUrl || '' }, extra));
        this.statusTimer = setInterval(() => { if (this.mediaUrl) send(); }, 250);
        v.addEventListener('ended', () => send({ ended: true }));
        v.addEventListener('error', () => send({ error: v.error ? v.error.code : 1 }));
      }
      switch (c.op) {
        case 'load':
          this.mediaUrl = c.url; v.src = c.url; v.loop = !!c.loop;
          v.volume = c.volume != null ? c.volume : 1; v.muted = this.mediaMuted || !!c.muted;
          v.style.objectFit = c.fit || 'contain';
          if (c.time) v.addEventListener('loadedmetadata', () => { v.currentTime = c.time; }, { once: true });
          this.mediaLayer.classList.add('on');
          if (c.play) v.play().catch(() => {});
          break;
        case 'play': v.play().catch(() => {}); break;
        case 'pause': v.pause(); break;
        case 'seek': if (isFinite(c.t)) v.currentTime = c.t; break;
        case 'sync': if (this.mediaUrl && Math.abs(v.currentTime - c.t) > 0.6) v.currentTime = c.t; if (c.paused && !v.paused) v.pause(); if (!c.paused && v.paused) v.play().catch(() => {}); break;
        case 'volume': v.volume = Math.max(0, Math.min(1, c.v)); break;
        case 'loop': v.loop = !!c.on; break;
        case 'sink': if (v.setSinkId && !this.mediaMuted) v.setSinkId(c.id || '').catch(() => {}); break;
        case 'unload': this.mediaUrl = ''; v.pause(); v.removeAttribute('src'); v.load(); this.mediaLayer.classList.remove('on'); break;
      }
    }

    destroy() {
      this.ro.disconnect();
      clearInterval(this.clockTimer); clearInterval(this.slideTimer); clearInterval(this.statusTimer);
      if (this.anim) this.anim.stop();
      try { this.video.pause(); } catch { /* ignore */ }
      this.container.innerHTML = '';
    }
  }

  window.ScripRender = { Stage, DEFAULT_THEME, DEFAULT_UI, merge, dividerSvg, DIVIDERS, ANIMS };
})();
