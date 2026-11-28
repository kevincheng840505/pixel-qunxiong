// 半寫實厚塗武將像（256×256）。全部以程式繪製：
// 1) 以高度場逐像素打光（柔和環境光 + 左上主光 + 勢力色輪廓光），邊緣反鋸齒；
// 2) 五官、鬚髮絲、服飾紋樣以 Canvas 筆觸疊畫；
// 3) 雲霧背景與筆刷紋理，營造數位厚塗質感。
// 模型座標為 96×96 單位，輸出放大 S 倍。
export const PW = 256;
const MW = 96, S = PW / MW;

// ---------------- 小工具 ----------------
function hash(a, b, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const sq = v => v * v;
const gs = (dx, dy, sx, sy) => Math.exp(-(dx * dx) / (sx * sx) - (dy * dy) / (sy * sy));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const toRGB = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const mixC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scaleC = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const css = (c, a = 1) => `rgba(${c.map(Math.round).join(',')},${a})`;

// 數值雜訊（雲霧、筆刷）
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, seed, oct = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, seed + i); f *= 2; a *= 0.5; } return s; };
// 筆刷紋：沿 30° 方向拉長的雜訊
const brush = (x, y) => { const u = x * 0.87 + y * 0.5, v = -x * 0.5 + y * 0.87; return vnoise(u / 9, v / 2.2, 77) * 0.6 + vnoise(u / 4, v / 1.2, 78) * 0.4; };

const LIGHT = norm3([-0.62, -0.55, 0.56]);
const HALF = norm3([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);
const HILITE = toRGB('#fff0d8');

// 色階：暗部偏暖褐（厚塗寫實），亮部偏暖白
function ramp(hex, hi = 0.45, lo = 0.3, shadow = '#2a1a1c') {
  const base = toRGB(hex), dark = mixC(scaleC(base, lo), toRGB(shadow), 0.45);
  return t => t < 0.6 ? mixC(dark, base, Math.pow(t / 0.6, 0.85)) : mixC(base, HILITE, hi * (t - 0.6) / 0.4);
}

function polyDist(pts, x, y) {
  let best = 1e9, bt = 0, acc = 0, total = 0;
  const lens = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); total += l; }
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], vx = bx - ax, vy = by - ay;
    const t = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1));
    const d = Math.hypot(x - ax - vx * t, y - ay - vy * t);
    if (d < best) { best = d; bt = (acc + lens[i - 1] * t) / (total || 1); }
    acc += lens[i - 1];
  }
  return [best, bt];
}
function tube(pts, r0, r1, z0 = 0) {
  const R = (x, y) => { const [d, t] = polyDist(pts, x, y); return [d, r0 + (r1 - r0) * t]; };
  return {
    mask: (x, y) => { const [d, r] = R(x, y); return d < r; },
    h: (x, y) => { const [d, r] = R(x, y); return z0 + Math.sqrt(Math.max(0, r * r - d * d)) * 1.2; },
  };
}

// ---------------- 緩衝區 ----------------
function makeBuf() { return { c: new Float32Array(PW * PW * 3), fig: new Float32Array(PW * PW) }; }
const SUB = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];

function paint(B, L) {
  const e = 0.35, op = L.opacity ?? 1;
  const bb = L.bbox || [0, 0, MW, MW];
  const x0 = Math.max(0, Math.floor(bb[0] * S)), x1 = Math.min(PW, Math.ceil(bb[2] * S));
  const y0 = Math.max(0, Math.floor(bb[1] * S)), y1 = Math.min(PW, Math.ceil(bb[3] * S));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    let cov = 0;
    for (const [ox, oy] of SUB) if (L.mask((x + ox) / S, (y + oy) / S)) cov += 0.25;
    if (!cov) continue;
    const X = (x + 0.5) / S, Y = (y + 0.5) / S;
    const hx = (L.h(X + e, Y) - L.h(X - e, Y)) / (2 * e), hy = (L.h(X, Y + e) - L.h(X, Y - e)) / (2 * e);
    let n = [-hx, -hy, 1], add = 0, mul = 1;
    if (L.tex) { const t = L.tex(X, Y); if (t) { n[0] += t.nx || 0; n[1] += t.ny || 0; add = t.s || 0; mul = t.m ?? 1; } }
    n = norm3(n);
    const d = dot(n, LIGHT);
    const wrap = Math.max(0, (d + 0.15) / 1.15);
    let s = (L.amb ?? 0.13) + (L.key ?? 0.85) * Math.pow(wrap, 1.25) + 0.08 * Math.max(0, n[1]);
    if (L.spec) s += L.spec * Math.pow(Math.max(0, dot(n, HALF)), L.specPow || 20);
    s = s * mul * (L.ao ? L.ao(X, Y) : 1) + add;
    s += ((L.brush ?? 0.07) * (brush(x, y) - 0.5));
    let c = L.ramp(clamp(s));
    if (L.warm) { const term = gs(d, 0, 0.22, 1); c = mixC(c, L.warm, 0.2 * term); }
    const a = cov * op, i = y * PW + x;
    for (let k = 0; k < 3; k++) B.c[i * 3 + k] = B.c[i * 3 + k] * (1 - a) + c[k] * a;
    if (L.fig !== false) B.fig[i] = Math.max(B.fig[i], cov);
  }
}

// Kuwahara 濾鏡：把細節壓成色塊筆觸，產生油彩厚塗感
function kuwahara(B, R) {
  const src = B.c.slice(), W = PW;
  const lum = new Float32Array(W * W);
  for (let i = 0; i < W * W; i++) lum[i] = src[i * 3] * 0.3 + src[i * 3 + 1] * 0.59 + src[i * 3 + 2] * 0.11;
  const Q = [[-R, 0, -R, 0], [0, R, -R, 0], [-R, 0, 0, R], [0, R, 0, R]];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    let best = 1e18, bc = null;
    for (const [ax, bx2, ay, by] of Q) {
      let n = 0, m = 0, m2 = 0, r = 0, g = 0, b = 0;
      for (let j = ay; j <= by; j++) { const yy = Math.min(W - 1, Math.max(0, y + j));
        for (let k = ax; k <= bx2; k++) { const xx = Math.min(W - 1, Math.max(0, x + k)), q = yy * W + xx, L = lum[q];
          n++; m += L; m2 += L * L; r += src[q * 3]; g += src[q * 3 + 1]; b += src[q * 3 + 2]; } }
      const v = m2 / n - sq(m / n);
      if (v < best) { best = v; bc = [r / n, g / n, b / n]; }
    }
    const i = y * W + x; B.c[i * 3] = bc[0]; B.c[i * 3 + 1] = bc[1]; B.c[i * 3 + 2] = bc[2];
  }
}

// Canvas 疊畫階段：把緩衝區送進畫布，以模型座標作畫，再讀回
function stage(B, ctx, fn) {
  const im = ctx.createImageData(PW, PW);
  for (let i = 0; i < PW * PW; i++) { im.data[i * 4] = B.c[i * 3]; im.data[i * 4 + 1] = B.c[i * 3 + 1]; im.data[i * 4 + 2] = B.c[i * 3 + 2]; im.data[i * 4 + 3] = 255; }
  ctx.putImageData(im, 0, 0);
  ctx.save(); ctx.scale(S, S); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  fn(ctx);
  ctx.restore();
  const d = ctx.getImageData(0, 0, PW, PW).data;
  for (let i = 0; i < PW * PW; i++) { B.c[i * 3] = d[i * 4]; B.c[i * 3 + 1] = d[i * 4 + 1]; B.c[i * 3 + 2] = d[i * 4 + 2]; }
}

// ---------------- 主繪製 ----------------
export function drawPaintPortrait(g, colHex, darkHex) {
  const cv = document.createElement('canvas');
  cv.width = PW; cv.height = PW;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const B = makeBuf();
  const look = g.look || '', has = k => look.includes(k);
  const r = k => hash(g.id, k, 977);
  const rr = (k, j) => hash(g.id * 131 + j, k, 313);
  const old = has('o'), young = has('y'), helm = has('h'), scholar = has('s');
  const redFace = has('r'), longB = has('l'), bushy = has('b'), fan = has('f'), whiteRobe = has('w');
  const armored = (helm || g.str >= 82) && !scholar;
  const fierce = g.str >= 85 && !scholar;
  const wise = g.int >= 85;
  const sly = g.pers === '野心';
  const col = toRGB(colHex);
  const rimC = mixC(col, [255, 248, 230], 0.55);

  const cx = 49, ey = 43;
  const TH = 0.34;
  const rx = 14.2 + r(1) * 1.3 + (g.str > 88 ? 1 : 0) - (young ? 0.6 : 0);
  const chinY = young ? 61 : 62.5;
  const jawW = 5 + (g.str > 85 ? 2.8 : 0) + r(2) * 1.5 - (young ? 1 : 0);
  const my = ey + 14;

  const faceW = y => {
    if (y < 48) return rx * Math.sqrt(Math.max(0, 1 - sq((y - 45.5) / 25.5)));
    const t = clamp((y - 48) / (chinY - 48)), p = Math.pow(t, 1.8);
    let w = rx * (1 - p) + jawW * p;
    if (t > 0.78) w *= Math.sqrt(Math.max(0, 1 - sq((t - 0.78) / 0.22)));
    return w;
  };
  const ang = (x, y) => { const w = Math.max(0.6, faceW(y)); return Math.asin(clamp((x - cx) / w, -1, 1)) + TH; };
  const lx = (x, y) => { const w = Math.max(0.6, faceW(y)); return w * Math.sin(Math.min(Math.PI / 2, ang(x, y))); };
  const sx = (l, y) => { const w = Math.max(0.6, faceW(y)); return cx + w * Math.sin(Math.asin(clamp(l / w, -1, 1)) - TH); };
  const P = (l, y) => [sx(l, y), y];
  const faceMask = (x, y) => y > 15 && y < chinY && Math.abs(x - cx) < faceW(y);
  const faceH = (x, y) => {
    const dx = x - cx, w = Math.max(0.5, faceW(y)), u = dx / w;
    const L = lx(x, y), aL = Math.abs(L), front = 1 - smooth(1.15, 1.5, Math.abs(ang(x, y)));
    let z = 13 * Math.sqrt(Math.max(0, 1 - u * u)) * Math.sqrt(Math.max(0.02, 1 - sq((y - 43) / 24)));
    let b = 0;
    b += 2.2 * gs(L, y - (ey - 4), 11, 1.8);
    b -= 2.4 * gs(aL - 6.8, y - ey, 3.8, 2.6);
    const nt = clamp((y - (ey - 1)) / 10);
    b += (1.3 + 4 * nt) * Math.exp(-L * L / 2.6) * smooth(ey - 2, ey + 1, y) * (1 - smooth(ey + 9, ey + 11, y));
    b += 1.5 * gs(aL - 2.6, y - (ey + 9), 1.6, 1.5);
    b += 1.6 * gs(aL - 9.5, y - (ey + 4.5), 3.6, 3.2);
    b += 1.1 * gs(L, y - my, 4.5, 1.7);
    b -= 0.8 * gs(L, y - (my + 2.6), 3.5, 1.1);
    b += 1.5 * gs(L, y - (chinY - 3), 4, 2.6);
    if (old || g.str > 88) b -= 0.9 * gs(aL - 5 - (y - ey - 9) * 0.35, y - (ey + 12), 1.2, 3.2);
    if (old) b -= 1.3 * gs(aL - 10, y - (ey + 10), 2.6, 3);
    return z + b * front;
  };

  // ---------- 背景：雲霧 ----------
  const sky1 = toRGB('#d9d3c6'), sky2 = toRGB('#8f979c'), sky3 = toRGB('#4a4f56');
  const tintC = mixC(col, toRGB('#9aa0a4'), 0.7);
  for (let y = 0; y < PW; y++) for (let x = 0; x < PW; x++) {
    const X = x / S, Y = y / S;
    const n = fbm(X / 22 + 3.1, Y / 14 + g.id * 0.37, 11, 5);
    const n2 = fbm(X / 9 + 7, Y / 6, 21, 3);
    const glow = Math.exp(-(sq((X - 60) / 42) + sq((Y - 32) / 36)));
    let t = clamp(0.25 + n * 0.75 + glow * 0.35 - Y / MW * 0.45 + (n2 - 0.5) * 0.15);
    let c = t > 0.5 ? mixC(sky2, sky1, (t - 0.5) * 2) : mixC(sky3, sky2, t * 2);
    c = mixC(c, tintC, 0.18);
    const vig = 1 - 0.35 * smooth(0.55, 1.05, Math.hypot((X - 50) / 52, (Y - 45) / 55));
    c = scaleC(c, vig);
    const i = y * PW + x; B.c[i * 3] = c[0]; B.c[i * 3 + 1] = c[1]; B.c[i * 3 + 2] = c[2];
  }

  // ---------- 調色 ----------
  const skinBase = redFace ? '#a8432e' : ['#e0b896', '#d8ab86', '#cc9c78', '#c08e6a'][Math.floor(r(3) * 4)];
  const SKIN = ramp(skinBase, 0.38, 0.42, '#4a2018');
  const skinC = toRGB(skinBase);
  const HAIRC = old ? ['#5a5550', '#d6d0c6'] : ['#0e0a0a', '#4a3c32'];
  const HAIR = old ? ramp('#a8a298', 0.5, 0.45, '#2a2626') : ramp('#2a201c', 0.25, 0.35, '#080506');
  const goldHelm = helm && (Math.max(g.str, g.int, g.pol, g.cha) >= 95 || r(4) > 0.7);
  const STEEL = ramp('#6a727e', 0.6, 0.28, '#14161c');
  const BRONZE = ramp('#8a6a34', 0.6, 0.3, '#24160a');
  const GOLD = ramp('#a88238', 0.6, 0.3, '#2a1a08');
  const goldC = toRGB('#c9a24a');
  const robeHex = whiteRobe ? '#d4cfc2' : '#' + mixC(col, toRGB('#c8b896'), 0.12).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const ROBE = ramp(robeHex, 0.3, 0.32);
  const ROBED = ramp(whiteRobe ? '#3a3a52' : darkHex, 0.3, 0.4);
  const WHITE = ramp('#d6cebd', 0.4, 0.45);
  const LAC = ramp(['#5a2a22', '#2e2a36', '#3e2e22'][Math.floor(r(5) * 3)], 0.45, 0.35, '#0e0808');
  const RED = ramp('#a8281e', 0.45, 0.35);

  // ---------- 身軀 ----------
  const bx = cx - 2;
  const shTop = dx => { const a = Math.abs(dx); return a <= 36 ? 64 + 9 * sq(a / 36) : 73 + (a - 36) * 2.4; };
  const bodyMask = (x, y) => y >= shTop(x - bx);
  const bodyFade = (x, y) => 1 - 0.45 * smooth(74, 100, y) - 0.12 * smooth(26, 48, Math.abs(x - bx));
  const lowBB = [0, 58, 96, 96];

  // 散髮（自耳後垂到肩上）
  const loose = !helm;
  if (loose) stage(B, ctx, c => {
    for (const s of [-1, 1]) for (let i = 0; i < 40; i++) {
      const t = rr(i, s + 3), x0 = cx + s * (rx - 1 + t * 2.5) + (s > 0 ? 1 : -1), y0 = ey - 6 + t * 6;
      const len = 22 + rr(i, s + 9) * 14 + (scholar ? 6 : 0);
      const x1 = x0 + s * (3 + rr(i, s + 5) * 6);
      c.strokeStyle = css(toRGB(HAIRC[rr(i, 7) > 0.75 ? 1 : 0]), 0.55 + rr(i, 8) * 0.4);
      c.lineWidth = 0.35 + rr(i, 6) * 0.5;
      c.beginPath(); c.moveTo(x0, y0); c.bezierCurveTo(x0 + s * 2, y0 + len * 0.35, x1 - s * 1, y0 + len * 0.7, x1, y0 + len); c.stroke();
    }
  });

  let collar = null;
  if (armored) {
    const torsoH = (x, y) => { const dx = x - bx; return 22 * Math.sqrt(Math.max(0, 1 - sq(dx / 54))) + 2.5 * gs(Math.abs(dx) - 10, y - 83, 9, 7); };
    paint(B, { mask: bodyMask, h: torsoH, ramp: ROBE, ao: bodyFade, bbox: lowBB,
      tex: (X, Y) => ({ nx: 0.4 * Math.sin((X - bx) * 0.45 + Y * 0.1) * smooth(70, 80, Y) }) });
    const chestM = (x, y) => y >= shTop(x - bx) + 1 && Math.abs(x - bx) < 23 - (y < 73 ? (73 - y) * 0.5 : 0) && y > 67;
    paint(B, { mask: chestM, h: torsoH, ramp: LAC, ao: bodyFade, spec: 0.35, specPow: 12, bbox: lowBB, brush: 0.04,
      tex: (X, Y) => {
        const row = Math.floor((Y - 67) / 3.4), off = (row & 1) * 2, u = (((X + off) % 4) + 4) % 4 / 4, v = ((Y - 67) % 3.4) / 3.4;
        return { nx: (u - 0.5) * 0.5, ny: (v - 0.45) * 0.9, m: v > 0.82 ? 0.5 : u < 0.08 ? 0.75 : 1 };
      } });
    const mcx = bx - 1, mcy = 87;
    paint(B, { mask: (x, y) => sq(x - mcx) + sq(y - mcy) < 30, h: (x, y) => 24 + Math.sqrt(Math.max(0, 30 - sq(x - mcx) - sq(y - mcy))) * 0.8,
      ramp: GOLD, spec: 0.8, specPow: 14, bbox: [mcx - 6, mcy - 6, mcx + 6, mcy + 6], brush: 0.03 });
    paint(B, { mask: (x, y) => sq(x - mcx) + sq(y - mcy) < 12, h: (x, y) => 26 - 0.15 * (sq(x - mcx) + sq(y - mcy)),
      ramp: STEEL, spec: 1.2, specPow: 30, bbox: [mcx - 4, mcy - 4, mcx + 4, mcy + 4], brush: 0.02 });
    for (const s of [-1, 1]) {
      const pcx = bx + s * 31, pcy = 79, ax = 14, ay = 11;
      const q = (x, y) => sq((x - pcx) / ax) + sq((y - pcy) / ay);
      const pm = (x, y) => q(x, y) < 1 && y > shTop(x - bx) - 3;
      const ph = (x, y) => 22 + 8 * Math.sqrt(Math.max(0, 1 - q(x, y)));
      paint(B, { mask: pm, h: ph, ramp: goldHelm ? BRONZE : STEEL, spec: 0.5, specPow: 16, ao: (x, y) => 0.95 - 0.3 * smooth(80, 92, y),
        bbox: [pcx - ax, pcy - ay, pcx + ax, pcy + ay], brush: 0.04,
        tex: (X, Y) => { const v = ((Y - pcy + 30 + (X - pcx) * s * 0.35) % 6) / 6; return { ny: (v - 0.5) * 0.6, m: v > 0.88 ? 0.55 : 1 }; } });
    }
    paint(B, { mask: (x, y) => { const dx = x - bx; return Math.abs(dx) < 14 && y > 61 && y < shTop(dx) + 4.5; },
      h: (x, y) => 20 + 4 * Math.sqrt(Math.max(0, 1 - sq((x - bx) / 14))) + Math.sin((x - bx) * 0.9) * 0.6, ramp: ROBE, bbox: [bx - 15, 60, bx + 15, 72] });
    // 金邊、鉚釘
    stage(B, ctx, c => {
      for (const s of [-1, 1]) {
        const pcx = bx + s * 31, pcy = 79;
        for (let k = 0; k < 4; k++) {
          const a = Math.PI * (1.15 + k * 0.22), px = pcx + Math.cos(a) * 11, py = pcy + Math.sin(a) * 8.4;
          if (py < shTop(px - bx) - 2) continue;
          c.fillStyle = css(goldC, 0.9); c.beginPath(); c.arc(px, py, 0.6, 0, 7); c.fill();
          c.fillStyle = 'rgba(255,245,210,.7)'; c.beginPath(); c.arc(px - 0.2, py - 0.2, 0.25, 0, 7); c.fill();
        }
      }
      c.strokeStyle = css(goldC, 0.8); c.lineWidth = 0.8;
      c.beginPath(); c.arc(bx - 1, 87, 5.4, 0, 7); c.stroke();
    });
  } else {
    const robeH = (x, y) => { const dx = x - bx, a = Math.abs(dx);
      return 20 * Math.sqrt(Math.max(0, 1 - sq(dx / 54))) + 5 * gs(a - 30, y - 75, 12, 9) + 1.1 * Math.sin(dx * 0.42 + (y - 66) * 0.12 * Math.sign(dx)) * smooth(70, 82, y); };
    paint(B, { mask: bodyMask, h: robeH, ramp: ROBE, ao: bodyFade, bbox: lowBB });
    const L1 = y => bx - 8 + (y - 64) * 0.6, R1 = y => bx + 8 - (y - 64) * 0.42;
    paint(B, { mask: (x, y) => y > 64 && x > L1(y) && x < R1(y) && y > shTop(x - bx) - 1, h: robeH, ramp: WHITE, ao: bodyFade, bbox: lowBB });
    const bandM = (x, y) => y > 63 && ((x > L1(y) - 3.6 && x <= L1(y) + 0.2) || (x >= R1(y) - 0.2 && x < R1(y) + 3.4 && x > L1(y))) && y > shTop(x - bx) - 1.5;
    paint(B, { mask: bandM, h: (x, y) => robeH(x, y) + 1, ramp: ROBED, ao: bodyFade, bbox: lowBB });
    collar = { L1, R1 };
  }
  // 交領回紋
  if (collar) stage(B, ctx, c => {
    const { L1, R1 } = collar;
    const band = (fx, w, ya, yb) => {
      c.save(); c.beginPath(); c.moveTo(fx(ya) - (w < 0 ? 0 : 0), ya);
      c.lineTo(fx(yb), yb); c.lineTo(fx(yb) + w, yb); c.lineTo(fx(ya) + w, ya); c.closePath(); c.clip();
      const ang = Math.atan2(fx(yb) - fx(ya), yb - ya);
      c.translate(fx(ya) + w / 2, ya); c.rotate(-ang);
      c.strokeStyle = css(goldC, 0.75); c.lineWidth = 0.32;
      for (let t = 0; t < 40; t += 3.2) {
        const h = Math.abs(w) * 0.32;
        c.beginPath(); c.moveTo(-h, t); c.lineTo(h, t); c.lineTo(h, t + 2.4); c.lineTo(-h * 0.2, t + 2.4); c.lineTo(-h * 0.2, t + 1); c.lineTo(h * 0.5, t + 1); c.stroke();
      }
      c.restore();
    };
    band(L1, -3.4, 63, 100);
    const meet = 64 + 16 / 1.02;
    band(R1, 3.2, 63, meet);
  });

  // ---------- 頸 ----------
  const nw = g.str > 85 ? 8.3 : 7.2, ncx = cx - 1.5;
  paint(B, { mask: (x, y) => Math.abs(x - ncx) < nw && y > chinY - 12 && y < shTop(x - bx) + 1 && !(armored && y > 61 && Math.abs(x - bx) < 14 && y > shTop(x - bx) - 2),
    h: (x, y) => 9 * Math.sqrt(Math.max(0, 1 - sq((x - ncx) / nw))), ramp: SKIN, warm: toRGB('#b04a30'),
    ao: (x, y) => 0.45 + 0.4 * smooth(chinY, chinY + 8, y), bbox: [ncx - 9, chinY - 12, ncx + 9, 76] });

  if (!helm) {
    const ecx = cx + faceW(ey + 2) - 1.2, ecy = ey + 2.5;
    paint(B, { mask: (x, y) => sq((x - ecx) / 3) + sq((y - ecy) / 5) < 1 && x > ecx - 1.5, h: (x, y) => 6 + 2 * Math.sqrt(Math.max(0, 1 - sq((x - ecx) / 3) - sq((y - ecy) / 5))),
      ramp: SKIN, ao: () => 0.85, warm: toRGB('#c04a30'), bbox: [ecx - 4, ecy - 6, ecx + 4, ecy + 6] });
  }

  // ---------- 臉 ----------
  const helmBot = l => ey - 6.5 + 0.055 * l * l;
  const hairline = l => ey - 11.5 + 0.045 * l * l;
  paint(B, { mask: faceMask, h: faceH, ramp: SKIN, amb: 0.16, warm: toRGB('#c0503a'), brush: 0.05, bbox: [cx - 20, 14, cx + 20, chinY + 1],
    ao: (x, y) => (helm && y < helmBot(lx(x, y)) + 3.5 ? 0.7 : 1) * (1 - 0.15 * smooth(56, 63, y)) * (1 - 0.2 * smooth(1.2, 1.55, ang(x, y))) });

  // ---------- 五官（筆觸） ----------
  const HC = toRGB(HAIRC[0]), HL = toRGB(HAIRC[1]);
  const eyeOpen = fierce || sly ? 0.75 : young ? 1.1 : 1;
  kuwahara(B, 3);
  stage(B, ctx, c => {
    const blur = v => { c.filter = v ? `blur(${v}px)` : 'none'; };
    // 腮紅、鼻頭紅潤
    blur(4);
    for (const [l, y, rad, a] of [[-8, ey + 6, 4, 0.16], [8, ey + 6, 3.5, 0.12], [0, ey + 8, 2.4, 0.12]]) {
      const [x] = P(l, y); c.fillStyle = css(redFace ? [90, 10, 5] : [200, 80, 60], a); c.beginPath(); c.ellipse(x, y, rad, rad * 0.8, 0, 0, 7); c.fill();
    }
    // 眼窩陰影
    blur(2.5);
    for (const s of [-1, 1]) { const [x] = P(s * 6.8, ey); c.fillStyle = css([90, 45, 35], s < 0 ? 0.16 : 0.26); c.beginPath(); c.ellipse(x, ey - 1, 4.2, 2.2, 0, 0, 7); c.fill(); }
    blur(0);
    for (const s of [-1, 1]) {
      const lit = s < 0;
      const I = P(s * 3.3, ey + 0.3), O = P(s * 10.3, ey - (fierce ? 0.9 : 0.15));
      const [mx] = P(s * 6.6, ey);
      const top = ey - 2.1 * eyeOpen, bot = ey + 1.5 * eyeOpen;
      const almond = () => { c.beginPath(); c.moveTo(...I); c.quadraticCurveTo(mx, top, ...O); c.quadraticCurveTo(mx, bot, ...I); c.closePath(); };
      // 眼白
      almond();
      const wg = c.createLinearGradient(0, top, 0, bot);
      wg.addColorStop(0, lit ? '#a8988a' : '#7e7064'); wg.addColorStop(0.5, lit ? '#e6dccc' : '#b4a694'); wg.addColorStop(1, lit ? '#d0c4b2' : '#988a78');
      c.fillStyle = wg; c.fill();
      c.save(); almond(); c.clip();
      const ix = mx - 0.7, iy = ey - 0.15, ir = 1.75;
      const ig = c.createRadialGradient(ix + 0.3, iy + 0.5, 0.2, ix, iy, ir);
      ig.addColorStop(0, '#6a4428'); ig.addColorStop(0.6, '#3a2414'); ig.addColorStop(1, '#140a06');
      c.fillStyle = ig; c.beginPath(); c.arc(ix, iy, ir, 0, 7); c.fill();
      c.fillStyle = '#0a0504'; c.beginPath(); c.arc(ix, iy, 0.7, 0, 7); c.fill();
      c.fillStyle = 'rgba(40,20,10,.45)'; c.fillRect(I[0] - 12, top - 2, 30, (ey - top) * 0.7 + 1.6);
      c.fillStyle = lit ? 'rgba(255,250,240,.9)' : 'rgba(230,220,200,.6)'; c.beginPath(); c.arc(ix - 0.55, iy - 0.6, 0.38, 0, 7); c.fill();
      c.restore();
      // 上眼瞼與睫毛線
      c.strokeStyle = '#1a0e0a'; c.lineWidth = fierce ? 0.85 : 0.7;
      c.beginPath(); c.moveTo(...I); c.quadraticCurveTo(mx, top, ...O); c.stroke();
      c.lineWidth = 0.5; c.beginPath(); c.moveTo(...O); c.lineTo(O[0] + s * 0.9, O[1] - (fierce ? 0.9 : 0.3)); c.stroke();
      // 雙眼皮摺線
      c.strokeStyle = 'rgba(80,40,28,.55)'; c.lineWidth = 0.35;
      c.beginPath(); c.moveTo(I[0] + s * 0.8, I[1] - 1.3); c.quadraticCurveTo(mx, top - 1.4, O[0] - s * 0.4, O[1] - 1.2); c.stroke();
      // 下眼瞼
      c.strokeStyle = 'rgba(100,55,40,.55)'; c.lineWidth = 0.35;
      c.beginPath(); c.moveTo(I[0] + s * 0.6, I[1] + 0.2); c.quadraticCurveTo(mx, bot + 0.2, ...O); c.stroke();
      if (old) { c.strokeStyle = 'rgba(90,50,35,.35)'; c.beginPath(); c.moveTo(I[0] + s * 1, I[1] + 1.8); c.quadraticCurveTo(mx, bot + 2, O[0] - s * 0.8, O[1] + 1.4); c.stroke();
        for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(O[0] + s * 0.8, O[1] + k * 0.8 - 0.4); c.lineTo(O[0] + s * 2.4, O[1] + k * 1.3 - 1); c.stroke(); } }
      // 眉
      const pts = [];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12, l = s * (2.4 + t * 9.6);
        let yb = fierce ? ey - 3.4 - t * 3.4 : sly ? ey - 4 - t * 2.4 : ey - 4.3 - Math.sin(Math.PI * t) * 1.6;
        if ((wise || old) && t > 0.8) yb += (t - 0.8) * 6;
        pts.push([sx(l, ey - 4), yb, t]);
      }
      const th = fierce ? 1.6 : 1.1;
      c.fillStyle = css(old ? toRGB('#b8b2a8') : HC, 0.85);
      c.beginPath(); pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
      for (let k = pts.length - 1; k >= 0; k--) { const [x, y, t] = pts[k]; c.lineTo(x, y + th * (1 - t * 0.7)); }
      c.closePath(); c.fill();
      c.lineWidth = 0.22;
      for (let k = 0; k < 26; k++) {
        const t = rr(k, s + 20), j = Math.floor(t * 12), [x, y] = pts[j];
        c.strokeStyle = css(old ? [230, 226, 218] : (k % 3 ? HC : HL), 0.7);
        c.beginPath(); c.moveTo(x, y + rr(k, s + 21) * th); c.lineTo(x + s * 1.4, y - 0.4 + rr(k, s + 22) * 0.6); c.stroke();
      }
    }
    if (fierce || old) { c.strokeStyle = 'rgba(90,45,30,.45)'; c.lineWidth = 0.35; const [x] = P(0, ey - 5);
      c.beginPath(); c.moveTo(x - 0.8, ey - 6.5); c.lineTo(x - 0.5, ey - 3.6); c.moveTo(x + 0.7, ey - 6.2); c.lineTo(x + 0.6, ey - 4); c.stroke(); }
    // 鼻
    blur(1);
    const [nx0] = P(0, ey + 8);
    c.strokeStyle = 'rgba(255,238,215,.35)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(...P(-0.7, ey + 1)); c.lineTo(...P(-0.7, ey + 7.6)); c.stroke();
    c.fillStyle = 'rgba(90,40,28,.35)'; c.beginPath(); c.ellipse(nx0 + 0.5, ey + 10.2, 3, 0.8, 0, 0, 7); c.fill();
    blur(0.4);
    c.fillStyle = 'rgba(60,24,16,.7)';
    for (const l of [-2.3, 2]) { const [x] = P(l, ey + 9.3); c.beginPath(); c.ellipse(x, ey + 9.4, 0.9, 0.45, l < 0 ? 0.3 : -0.3, 0, 7); c.fill(); }
    c.strokeStyle = 'rgba(90,40,28,.45)'; c.lineWidth = 0.4; c.beginPath(); c.moveTo(...P(-3.2, ey + 8.4)); c.quadraticCurveTo(...P(-3.6, ey + 9.8), ...P(-2, ey + 10)); c.stroke();
    // 口
    const ML = P(-4.4, my), MR = P(4.4, my + (sly ? -0.8 : 0)), [mcx] = P(0, my);
    const mid = my + (fierce ? -0.3 : 0.35);
    c.fillStyle = css(redFace ? [80, 15, 10] : [150, 70, 58], 0.5);
    c.beginPath(); c.moveTo(...ML); c.quadraticCurveTo(mcx - 2, my - 1.4, mcx, my - 0.9); c.quadraticCurveTo(mcx + 2, my - 1.4, ...MR); c.quadraticCurveTo(mcx, mid, ...ML); c.fill();
    c.fillStyle = css(redFace ? [100, 25, 15] : [175, 95, 78], 0.38);
    c.beginPath(); c.ellipse(mcx, my + 1.2, 2.8, 1, 0, 0, 7); c.fill();
    blur(0);
    c.strokeStyle = '#3a1410'; c.lineWidth = 0.5;
    c.beginPath(); c.moveTo(...ML); c.quadraticCurveTo(mcx, mid, ...MR); c.stroke();
    if (fierce) { c.lineWidth = 0.35; c.beginPath(); c.moveTo(...ML); c.lineTo(ML[0] - 0.4, ML[1] + 0.9); c.moveTo(...MR); c.lineTo(MR[0] + 0.3, MR[1] + 0.9); c.stroke(); }
    c.fillStyle = 'rgba(255,225,205,.22)'; c.beginPath(); c.ellipse(mcx - 0.5, my + 1.1, 1.2, 0.35, 0, 0, 7); c.fill();
    if (old || g.str > 88) {
      c.strokeStyle = 'rgba(90,45,32,.35)'; c.lineWidth = 0.45;
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(...P(s * 3.6, ey + 9.6)); c.quadraticCurveTo(...P(s * 6.2, ey + 12), ...P(s * 5.6, my + 2)); c.stroke(); }
    }
    if (old) { c.strokeStyle = 'rgba(90,45,32,.28)'; c.lineWidth = 0.35; for (const y of [ey - 8, ey - 10]) { c.beginPath(); c.moveTo(...P(-6, y + 0.3)); c.quadraticCurveTo(...P(0, y - 0.4), ...P(6, y + 0.3)); c.stroke(); } }
  });

  // ---------- 頭髮／頭盔／頭巾 ----------
  const hairH = (x, y) => 15 * Math.sqrt(Math.max(0, 1 - sq((x - cx) / (rx + 2)) - sq((y - 41) / 22)));
  const inSkull = (x, y, pad) => sq((x - cx) / (rx + pad)) + sq((y - 41) / (21.5 + pad * 0.5)) < 1;
  const headBB = [cx - 24, 0, cx + 26, 66];
  const hairM = (x, y) => {
    if (!inSkull(x, y, 1.6)) return false;
    const a = ang(x, Math.max(y, 18));
    return y < hairline(lx(x, Math.max(y, 18))) || (y < ey + 3 && (a > 1.28 || a < -1.45));
  };
  const hairStrands = (n, from, to, alpha = 0.45) => stage(B, ctx, c => {
    c.save(); c.beginPath();
    for (let y = 14; y < ey + 4; y += 0.5) { /* clip by mask rows */ }
    c.restore();
    for (let i = 0; i < n; i++) {
      const [x0, y0, x1, y1, bend] = from(i);
      c.strokeStyle = css(i % 4 ? HC : HL, alpha * (0.5 + rr(i, 50) * 0.5)); c.lineWidth = 0.25 + rr(i, 51) * 0.3;
      c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2, x1, y1); c.stroke();
    }
  });
  if (helm) {
    const hrx = rx + 3.6, hcy = 38, hry = 20.5;
    const domeM = (x, y) => sq((x - cx) / hrx) + sq((y - hcy) / hry) < 1 && y < helmBot(lx(x, Math.max(y, 20))) && y < hcy + 13;
    const domeH = (x, y) => 17 * Math.sqrt(Math.max(0, 1 - sq((x - cx) / hrx) - sq((y - hcy) / hry)));
    const HM = goldHelm ? BRONZE : STEEL;
    paint(B, { mask: (x, y) => { const a = Math.abs(x - cx), w = faceW(Math.min(y, 53)); return y > ey - 9 && y < 64 && a > w - (x > cx ? 3.5 : 0.6) && a < w + 5.5 - (x < cx ? 1.5 : 0); },
      h: (x, y) => 6 + 3 * Math.cos(clamp((Math.abs(x - cx) - faceW(Math.min(y, 53)) - 2) / 4) * 1.5), ramp: HM, spec: 0.35, ao: (x, y) => 0.85 - 0.3 * smooth(46, 63, y), bbox: headBB,
      tex: (X, Y) => { const v = (Y % 3.2) / 3.2; return { ny: (v - 0.45) * 0.5, m: v > 0.82 ? 0.78 : 1 }; } });
    paint(B, { mask: domeM, h: domeH, ramp: HM, spec: 0.7, specPow: 18, bbox: headBB, brush: 0.05,
      tex: (X, Y) => { const a = Math.atan2(X - cx + 2, (hcy + 8) - Y), seam = Math.abs(((a * 5 / Math.PI) % 1 + 1) % 1 - 0.5); return seam > 0.46 ? { m: 0.65 } : null; } });
    paint(B, { mask: (x, y) => domeM(x, y) && y > helmBot(lx(x, Math.max(y, 20))) - 3.2, h: (x, y) => domeH(x, y) + 1.5, ramp: GOLD, spec: 0.8, specPow: 14, bbox: headBB });
    const fx = sx(0, ey - 8);
    paint(B, { mask: (x, y) => y > ey - 19 && y < ey - 8.5 && Math.abs(x - fx) < (y - (ey - 19)) * 0.42, h: (x, y) => 19 - Math.abs(x - fx) * 0.8, ramp: GOLD, spec: 1, specPow: 14, bbox: headBB });
    const tx = cx - 1.5;
    paint(B, { mask: (x, y) => Math.abs(x - tx) < 1.6 && y > 13 && y < 19.5, h: (x, y) => 4 - sq(x - tx), ramp: GOLD, spec: 0.6, bbox: headBB });
    const plumeC = r(6) > 0.4 ? [168, 40, 30] : mixC(col, [0, 0, 0], 0.1);
    stage(B, ctx, c => {
      for (let i = 0; i < 70; i++) {
        const t = rr(i, 60), x0 = tx + (t - 0.5) * 2, y0 = 13.5;
        const x1 = tx + 4 + rr(i, 61) * 12, y1 = 6 + rr(i, 62) * 9;
        c.strokeStyle = css(mixC(plumeC, [255, 230, 200], rr(i, 63) * 0.35 * (x1 < tx + 9 ? 1 : 0.3)), 0.7);
        c.lineWidth = 0.4 + rr(i, 64) * 0.5;
        c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 + 2, y1 - 5, x1, y1); c.stroke();
      }
      // 盔上浮雕線
      c.strokeStyle = css(goldC, 0.6); c.lineWidth = 0.35;
      c.beginPath(); c.moveTo(...P(-10, helmBot(-10) - 3.6)); c.quadraticCurveTo(...P(0, helmBot(0) - 5), ...P(10, helmBot(10) - 3.6)); c.stroke();
    });
  } else if (!scholar) {
    paint(B, { mask: hairM, h: hairH, ramp: HAIR, spec: 0.3, specPow: 10, bbox: headBB, brush: 0.04 });
    hairStrands(110, i => { const l = (rr(i, 30) - 0.5) * 30, y0 = hairline(l) - 0.3; const [x0] = P(l, Math.max(y0, 20));
      return [x0, y0, cx - 1.5 + (rr(i, 31) - 0.5) * 4, 19, (x0 - cx) * 0.15]; }, 0.5);
    const kx = cx - 1.5;
    paint(B, { mask: (x, y) => sq((x - kx) / 5.5) + sq((y - 18) / 5) < 1, h: (x, y) => 3 + 5 * Math.sqrt(Math.max(0, 1 - sq((x - kx) / 5.5) - sq((y - 18) / 5))),
      ramp: HAIR, spec: 0.3, specPow: 10, bbox: [kx - 6, 12, kx + 6, 24] });
    paint(B, { mask: (x, y) => Math.abs(x - kx) < 3.2 && y > 19.5 && y < 22.5, h: (x, y) => 6 - sq(x - kx) * 0.3, ramp: GOLD, spec: 0.7, bbox: [kx - 4, 19, kx + 4, 23] });
    paint(B, { mask: (x, y) => hairM(x, y) && y > hairline(lx(x, Math.max(y, 18))) - 2.2 && y < ey - 2, h: (x, y) => hairH(x, y) + 0.8, ramp: young ? ROBE : ROBED, bbox: headBB });
  } else {
    // 綸巾
    const capM = (x, y) => (inSkull(x, y, 2.4) || (sq((x - cx + 1) / (rx + 0.5)) + sq((y - 28) / 11) < 1 && y < 32)) && y < hairline(lx(x, Math.max(y, 18))) + 0.5;
    const capH = (x, y) => Math.max(hairH(x, y), 12 * Math.sqrt(Math.max(0, 1 - sq((x - cx + 1) / (rx + 0.5)) - sq((y - 28) / 11))));
    const CAP = ramp(old ? '#4a4a56' : '#34405a', 0.35, 0.35, '#0a0c14');
    paint(B, { mask: (x, y) => !capM(x, y) && hairM(x, y), h: hairH, ramp: HAIR, bbox: headBB });
    paint(B, { mask: capM, h: capH, ramp: CAP, spec: 0.15, bbox: headBB,
      tex: (X, Y) => ({ m: 0.9 + 0.14 * Math.sin((X - cx) * 1.1 + Y * 0.15) * smooth(8, 26, Y) }) });
    paint(B, { mask: (x, y) => capM(x, y) && Math.abs(y - (hairline(lx(x, Math.max(y, 18))) - 1)) < 1.1, h: (x, y) => capH(x, y) + 1, ramp: ramp('#1a1e2a', 0.4), bbox: headBB });
    const kx = cx + rx - 1;
    paint(B, { mask: (x, y) => sq((x - kx) / 3.2) + sq((y - 29) / 2.6) < 1, h: (x, y) => 14 + 2 * Math.sqrt(Math.max(0, 1 - sq((x - kx) / 3.2) - sq((y - 29) / 2.6))), ramp: CAP, bbox: [kx - 4, 25, kx + 4, 33] });
    stage(B, ctx, c => {
      // 巾帶
      c.strokeStyle = 'rgba(30,36,52,.85)'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(kx, 29); c.bezierCurveTo(kx + 3, 36, kx + 1, 46, kx + 5, 58); c.stroke();
      c.lineWidth = 1.2; c.beginPath(); c.moveTo(kx - 0.5, 29.5); c.bezierCurveTo(kx + 1, 40, kx - 2, 50, kx + 1, 62); c.stroke();
      // 紗紋
      c.strokeStyle = 'rgba(160,170,190,.12)'; c.lineWidth = 0.3;
      for (let i = 0; i < 18; i++) { const x = cx - 12 + i * 1.5; c.beginPath(); c.moveTo(x, 34); c.quadraticCurveTo(x + 0.5, 25, cx - 1 + (x - cx) * 0.6, 18); c.stroke(); }
      // 金飾
      const [gx] = P(0, 30); c.fillStyle = css(goldC, 0.85); c.beginPath(); c.ellipse(gx, 29.6, 1.6, 1.1, 0, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,245,200,.7)'; c.beginPath(); c.arc(gx - 0.4, 29.2, 0.4, 0, 7); c.fill();
    });
  }

  // ---------- 鬍鬚 ----------
  const chinX = sx(0, chinY - 2);
  if (!young) {
    if (longB) {
      const sway = y => Math.sin((y - my) / 11) * 1.3;
      const bc = y => (y < chinY ? sx(0, y) : chinX - 1) + sway(y);
      const bw = y => { const t = clamp((y - my) / (96 - my)); return t < 0.25 ? 6.5 + t * 14 : 10 * (1 - Math.pow((t - 0.25) / 0.75, 1.4)) + 1; };
      const bm = (x, y) => y > my + 1.5 && y < 97 && Math.abs(x - bc(y)) < bw(y);
      const jawM = (x, y) => { const a = ang(x, y); return y > ey + 4 && y < chinY + 1 && faceMask(x, y) && (a > 1.05 || a < -0.95); };
      paint(B, { mask: (x, y) => bm(x, y) || jawM(x, y), h: (x, y) => 14 + 5 * Math.sqrt(Math.max(0, 1 - sq((x - bc(y)) / Math.max(1, bw(y))))),
        ramp: HAIR, spec: 0.25, specPow: 8, ao: (x, y) => 1 - 0.3 * smooth(80, 96, y), bbox: [cx - 20, ey, cx + 20, 96], opacity: 0.92 });
      stage(B, ctx, c => {
        for (let i = 0; i < 260; i++) {
          const y0 = my + 1 + rr(i, 70) * 14, x0 = bc(y0) + (rr(i, 71) - 0.5) * 2 * bw(y0) * 0.95;
          const y1 = Math.min(97, y0 + 10 + rr(i, 72) * 30), x1 = bc(y1) + (x0 - bc(y0)) * (bw(y1) / bw(y0)) * 0.8;
          c.strokeStyle = css(rr(i, 73) > 0.7 ? HL : HC, 0.35 + rr(i, 74) * 0.4); c.lineWidth = 0.2 + rr(i, 75) * 0.3;
          c.beginPath(); c.moveTo(x0, y0); c.bezierCurveTo(x0 + 1.5, y0 + (y1 - y0) * 0.35, x1 - 1, y0 + (y1 - y0) * 0.7, x1, y1); c.stroke();
        }
      });
    } else if (bushy) {
      const jag = (x, y) => (vnoise(x * 1.3, y * 1.3, 41) - 0.5) * 3;
      const bm = (x, y) => {
        if (y < ey + 5 || y > chinY + 7 + jag(x, 0)) return false;
        const yy = Math.min(y, chinY - 2), w = faceW(yy) + 2 + jag(x, y) * 0.6;
        if (Math.abs(x - cx) > w) return false;
        const L = lx(x, yy), aL = Math.abs(L);
        if (y < my - 1.5 && aL < 6 - (y - ey - 5) * 0.3) return false;
        if (y < ey + 9 && aL < 10 && ang(x, yy) < 1.2) return false;
        if (sq(L / 4.6) + sq((y - my - 0.5) / 1.6) < 1) return false;
        return true;
      };
      paint(B, { mask: bm, h: (x, y) => faceH(x, Math.min(y, chinY - 1)) + 2.5 + 1.5 * vnoise(x, y, 7), ramp: HAIR, bbox: [cx - 20, ey + 4, cx + 20, chinY + 9], opacity: 0.95,
        tex: (X, Y) => ({ m: 0.8 + 0.35 * vnoise(X * 1.2, Y * 1.2, 13) }) });
      stage(B, ctx, c => {
        for (let i = 0; i < 320; i++) {
          const x = cx + (rr(i, 80) - 0.5) * 2 * (rx + 2), y = ey + 5 + rr(i, 81) * (chinY + 7 - ey - 5);
          if (!bm(x, y)) continue;
          const a = Math.atan2(y - (ey + 4), x - cx) + (rr(i, 82) - 0.5) * 1.2, l = 1.2 + rr(i, 83) * 1.8;
          c.strokeStyle = css(rr(i, 84) > 0.6 ? HL : HC, 0.6); c.lineWidth = 0.3;
          c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 0.4, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
        }
      });
    }
    // 八字鬚與山羊鬚
    const hasMus = longB || bushy || r(7) > 0.22;
    const goatee = !longB && !bushy && r(8) > 0.3;
    if (hasMus || goatee) stage(B, ctx, c => {
      if (hasMus) for (const s of [-1, 1]) for (let i = 0; i < 40; i++) {
        const t = rr(i, s + 90), [x0, y0] = P(s * (0.4 + t * 3.4), my - 2.4 + t * 0.6);
        const [x1, y1] = P(s * (5 + rr(i, s + 91) * 2.4 + (longB ? 2 : 0)), my + 0.3 + rr(i, s + 92) * 1.5 + (longB ? 4 : old ? 2 : 0));
        c.strokeStyle = css(rr(i, 93) > 0.6 ? HL : HC, 0.38); c.lineWidth = 0.2 + rr(i, 94) * 0.25;
        c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 + s * 1.5, y0 + 0.2, x1, y1); c.stroke();
      }
      if (goatee) {
        const len = 4 + r(9) * (old ? 10 : 6);
        for (let i = 0; i < 90; i++) {
          const x0 = chinX + (rr(i, 95) - 0.5) * 4, y0 = my + 2.2 + rr(i, 96) * (chinY - my - 3);
          const x1 = chinX - 1 + (rr(i, 97) - 0.5) * 2, y1 = chinY + len * (0.6 + rr(i, 98) * 0.4);
          c.strokeStyle = css(rr(i, 99) > 0.6 ? HL : HC, 0.4); c.lineWidth = 0.2 + rr(i, 100) * 0.25;
          c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2 + 0.6, (y0 + y1) / 2, x1, y1); c.stroke();
        }
      }
    });
  }

  // ---------- 羽扇 ----------
  if (fan) {
    const fx = cx - 28, fy = 80;
    paint(B, { ...tube([[fx + 3, fy + 8], [fx + 7, 97]], 1.3, 1.3, 20), ramp: ramp('#5a3e24', 0.5), bbox: [fx - 2, fy, fx + 10, 97] });
    paint(B, { mask: (x, y) => sq((x - fx) / 11) + sq((y - fy + 2) / 14) < 1 && y < fy + 9,
      h: (x, y) => 22 + 3 * Math.sqrt(Math.max(0, 1 - sq((x - fx) / 11) - sq((y - fy + 2) / 14))), ramp: WHITE, bbox: [fx - 12, fy - 17, fx + 12, fy + 10], opacity: 0.95 });
    stage(B, ctx, c => {
      for (let i = 0; i < 60; i++) {
        const a = -2.6 + (i / 59) * 2.2, rad = 13 + rr(i, 110) * 2;
        c.strokeStyle = `rgba(${i % 3 ? '120,110,96' : '250,246,236'},.45)`; c.lineWidth = 0.25;
        c.beginPath(); c.moveTo(fx + 3, fy + 8); c.lineTo(fx + 3 + Math.cos(a) * rad * 0.85, fy + 8 + Math.sin(a) * rad); c.stroke();
      }
    });
  }

  kuwahara(B, 1);
  // ---------- 輪廓光（右側） ----------
  for (let y = 0; y < PW; y++) for (let x = 0; x < PW - 1; x++) {
    const i = y * PW + x, f = B.fig[i];
    if (f < 0.5 || y > PW * 0.9) continue;
    let gap = 0;
    for (let k = 1; k <= 7; k++) { const j = x + k; if (j >= PW) break; if (B.fig[y * PW + j] < 0.3) { gap = k; break; } }
    if (!gap) continue;
    const a = (gap <= 2 ? 0.55 : gap <= 4 ? 0.3 : 0.12) * (1 - smooth(PW * 0.6, PW * 0.9, y));
    for (let k = 0; k < 3; k++) B.c[i * 3 + k] = B.c[i * 3 + k] * (1 - a) + rimC[k] * a;
  }
  // 整體色調：微暖、暗角
  for (let y = 0; y < PW; y++) for (let x = 0; x < PW; x++) {
    const i = y * PW + x, v = 1 - 0.22 * smooth(0.6, 1.15, Math.hypot((x / PW - 0.5) * 1.6, (y / PW - 0.45) * 1.5));
    B.c[i * 3] *= v * 1.02; B.c[i * 3 + 1] *= v; B.c[i * 3 + 2] *= v * 0.96;
  }
  stage(B, ctx, () => {});
  return cv;
}
