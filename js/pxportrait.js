// 像素厚塗武將像（96×96）：以程式建立臉部高度場，逐像素打光，
// 再量化到色階並以 Bayer 抖色，做出「厚塗明暗 × 像素點陣」的質感。
// 主光左上、勢力色輪廓光自右後方，背景暗沉，半身漸隱入黑。
export const PXW = 96;

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

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

const LIGHT = norm3([-0.74, -0.46, 0.5]);
const HALF = norm3([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);
const RIM = norm3([0.9, -0.2, 0.05]);
const SHADOW = toRGB('#1c1024');
const HILITE = toRGB('#ffe9c0');

// 色階：暗部偏冷紫、亮部偏暖黃（像素畫常用的色相偏移）
function ramp(hex, n = 7, hi = 0.55, lo = 0.26) {
  const base = toRGB(hex), dark = mixC(scaleC(base, lo), SHADOW, 0.5);
  const p = Math.round((n - 1) * 0.58), out = [];
  for (let i = 0; i < n; i++) {
    if (i <= p) out.push(mixC(dark, base, Math.pow(i / p, 0.9)));
    else out.push(mixC(base, HILITE, hi * (i - p) / (n - 1 - p)));
  }
  return out.map(c => c.map(Math.round));
}
const fixed = list => list.map(toRGB);

// 線段距離（回傳距離與沿線比例）
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
// 管狀筆觸：給鬍鬚、盔纓、眉等使用
function tube(pts, r0, r1, z0 = 0) {
  const R = (x, y) => { const [d, t] = polyDist(pts, x, y); return [d, r0 + (r1 - r0) * t]; };
  return {
    mask: (x, y) => { const [d, r] = R(x, y); return d < r; },
    h: (x, y) => { const [d, r] = R(x, y); return z0 + Math.sqrt(Math.max(0, r * r - d * d)) * 1.2; },
  };
}

// ---------------- 畫布 ----------------
function makeBuf() {
  return { col: new Array(PXW * PXW).fill(null), mat: new Int16Array(PXW * PXW).fill(-1), ramps: [] };
}

function paint(B, L) {
  const id = B.ramps.length; B.ramps.push(L.ramp);
  const N = L.ramp.length, e = 0.55;
  for (let y = 0; y < PXW; y++) for (let x = 0; x < PXW; x++) {
    const X = x + 0.5, Y = y + 0.5;
    if (!L.mask(X, Y)) continue;
    const hx = (L.h(X + e, Y) - L.h(X - e, Y)) / (2 * e), hy = (L.h(X, Y + e) - L.h(X, Y - e)) / (2 * e);
    let n = [-hx, -hy, 1], add = 0, mul = 1;
    if (L.tex) { const t = L.tex(X, Y, x, y); if (t) { n[0] += t.nx || 0; n[1] += t.ny || 0; add = t.s || 0; mul = t.m ?? 1; } }
    n = norm3(n);
    const d = dot(n, LIGHT);
    let s = (L.amb ?? 0.1) + (L.key ?? 0.88) * Math.pow(Math.max(0, d), 1.15) + 0.06 * Math.max(0, n[1]);
    if (L.spec) s += L.spec * Math.pow(Math.max(0, dot(n, HALF)), L.specPow || 20);
    s = s * mul * (L.ao ? L.ao(X, Y) : 1) + add;
    const idx = clamp(Math.floor(s * (N - 0.01) + (bay(x, y) - 0.5) * (L.dither ?? 0.8)), 0, N - 1);
    let c = L.ramp[idx];
    const i = y * PXW + x;
    B.col[i] = c; B.mat[i] = id;
  }
}
// 直接點像素（五官細節）
function dotPx(B, x, y, c) { if (x < 0 || y < 0 || x >= PXW || y >= PXW) return; const i = y * PXW + x; B.col[i] = Array.isArray(c) ? c : toRGB(c); }
function getPx(B, x, y) { return B.col[y * PXW + x]; }
function tint(B, x, y, c, t) { const o = getPx(B, x, y); if (o) dotPx(B, x, y, mixC(o, Array.isArray(c) ? c : toRGB(c), t).map(Math.round)); }

// ---------------- 主繪製 ----------------
// 頭部以約 17° 的四分之三側面朝向畫面左方（迎光），遠側臉頰落入陰影。
export function renderPxPortrait(g, colHex, darkHex) {
  const B = makeBuf();
  const look = g.look || '', has = k => look.includes(k);
  const r = k => hash(g.id, k, 977);
  const old = has('o'), young = has('y'), helm = has('h'), scholar = has('s');
  const redFace = has('r'), longB = has('l'), bushy = has('b'), fan = has('f'), whiteRobe = has('w');
  const armored = (helm || g.str >= 82) && !scholar;
  const fierce = g.str >= 85 && !scholar;
  const wise = g.int >= 85;
  const sly = g.pers === '野心';
  const legend = Math.max(g.str, g.int, g.pol, g.cha) >= 95;
  const col = toRGB(colHex);
  const rimC = mixC(col, [255, 246, 220], 0.5).map(Math.round);

  const cx = 49, ey = 43;
  const TH = 0.36;                                  // 轉頭角度
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
  // 螢幕 ↔ 臉部本地座標（以正面為準）
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
    b += 2.4 * gs(L, y - (ey - 4), 11, 1.7);
    b -= 2.8 * gs(aL - 6.8, y - ey, 3.6, 2.4);
    const nt = clamp((y - (ey - 1)) / 10);
    b += (1.4 + 4.2 * nt) * Math.exp(-L * L / 2.4) * smooth(ey - 2, ey + 1, y) * (1 - smooth(ey + 9, ey + 11, y));
    b += 1.6 * gs(aL - 2.6, y - (ey + 9), 1.5, 1.4);
    b += 1.8 * gs(aL - 9.5, y - (ey + 4.5), 3.4, 3);
    b += 1.1 * gs(L, y - my, 4.5, 1.6);
    b -= 0.9 * gs(L, y - (my + 2.5), 3.5, 1);
    b += 1.6 * gs(L, y - (chinY - 3), 4, 2.6);
    if (old || g.str > 88) b -= 1.1 * gs(aL - 5 - (y - ey - 9) * 0.35, y - (ey + 12), 1.1, 3.2);
    if (old) b -= 1.4 * gs(aL - 10, y - (ey + 10), 2.4, 3);
    return z + b * front;
  };

  // ---------- 背景 ----------
  const bgTop = toRGB('#2a2019'), bgBot = toRGB('#0c0908');
  const glowC = mixC(scaleC(col, 0.5), toRGB('#3a2a1c'), 0.4);
  for (let y = 0; y < PXW; y++) for (let x = 0; x < PXW; x++) {
    const d2 = sq((x - 58) / 44) + sq((y - 34) / 40);
    const glow = Math.exp(-d2 * 1.7);
    const ink = 0.07 * Math.sin(x * 0.19 + y * 0.08 + Math.sin(y * 0.11 + x * 0.03) * 2.2) + 0.05 * (hash(x >> 2, y >> 2, 5) - 0.5);
    const q = clamp(Math.floor(clamp(glow * 0.85 + ink) * 5 + bay(x, y) - 0.5), 0, 4) / 4;
    const base = mixC(bgTop, bgBot, clamp(y / 95 + 0.12 * Math.abs(x - 48) / 48));
    dotPx(B, x, y, mixC(base, glowC, q * 0.8).map(Math.round));
  }

  // ---------- 調色 ----------
  const skinBase = redFace ? '#9e3a28' : ['#d8aa82', '#cf9e76', '#c4906a', '#b6825c'][Math.floor(r(3) * 4)];
  const SKIN = ramp(skinBase, 8, 0.42, 0.3);
  const HAIR = old ? fixed(['#2e2a28', '#4a4440', '#6a645e', '#8c867e', '#aea89e', '#cec8be', '#e8e4da'])
    : fixed(['#060406', '#0d090a', '#151011', '#1f1816', '#2c221d', '#3e322a', '#5a4a3e']);
  const goldHelm = helm && (legend || r(4) > 0.7);
  const STEEL = ramp('#5e6674', 8, 0.55, 0.22);
  const BRONZE = ramp('#7a5a2a', 8, 0.5, 0.24);
  const GOLD = ramp('#8e6c2c', 7, 0.5, 0.25);
  const robeHex = whiteRobe ? '#b4ad9a' : '#' + mixC(col, toRGB('#c8b896'), 0.15).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const ROBE = ramp(robeHex, 7, 0.3, 0.28);
  const ROBED = ramp(darkHex, 6, 0.3, 0.35);
  const WHITE = ramp('#bdb4a0', 6, 0.35, 0.35);
  const LAC = ramp(['#4e2620', '#2e2a36', '#3a2c20'][Math.floor(r(5) * 3)], 7, 0.5, 0.35);
  const RED = ramp('#a2261e', 6, 0.45, 0.3);

  // ---------- 身軀（略轉向左） ----------
  const bx = cx - 2;
  const shTop = dx => { const a = Math.abs(dx); return a <= 36 ? 64 + 9 * sq(a / 36) : 73 + (a - 36) * 2.4; };
  const bodyMask = (x, y) => y >= shTop(x - bx);
  const bodyFade = (x, y) => 1 - 0.68 * smooth(70, 99, y) - 0.2 * smooth(26, 48, Math.abs(x - bx));

  if (scholar) for (const s of [-1, 1]) { // 綸巾飄帶
    const t = tube([[cx + s * 13 + 3, 28], [cx + s * 17 + 3, 38], [cx + s * 20 + 2, 54], [cx + s * 23, 68]], 2.8, 2, 0);
    paint(B, { ...t, ramp: ramp('#262b38', 6, 0.3), dither: 0.6, ao: () => 0.8 });
  }

  if (armored) {
    const torsoH = (x, y) => { const dx = x - bx; return 22 * Math.sqrt(Math.max(0, 1 - sq(dx / 54))) + 2.5 * gs(Math.abs(dx) - 10, y - 83, 9, 7); };
    paint(B, { mask: bodyMask, h: torsoH, ramp: ROBE, ao: bodyFade, dither: 0.6,
      tex: (X, Y) => ({ nx: 0.35 * Math.sin((X - bx) * 0.5 + Y * 0.1) * smooth(70, 80, Y) }) });
    // 札甲胸（漆甲）
    const chestM = (x, y) => y >= shTop(x - bx) + 1 && Math.abs(x - bx) < 23 - (y < 73 ? (73 - y) * 0.5 : 0) && y > 67;
    paint(B, { mask: chestM, h: torsoH, ramp: LAC, ao: bodyFade, spec: 0.3, specPow: 10, dither: 0.5,
      tex: (X, Y) => {
        const row = Math.floor((Y - 67) / 4), off = (row & 1) * 2.5, u = (((X + off) % 5) + 5) % 5 / 5, v = ((Y - 67) % 4) / 4;
        return { nx: (u - 0.5) * 0.45, ny: (v - 0.4) * 0.8, m: v > 0.76 ? 0.55 : u < 0.12 ? 0.75 : 1 };
      } });
    // 腰前護心鏡
    const mcx = bx - 1, mcy = 87;
    paint(B, { mask: (x, y) => sq(x - mcx) + sq(y - mcy) < 30, h: (x, y) => 24 + Math.sqrt(Math.max(0, 30 - sq(x - mcx) - sq(y - mcy))) * 0.8,
      ramp: GOLD, spec: 0.7, specPow: 14, ao: (x, y) => 1 - 0.3 * smooth(80, 96, y), dither: 0.3 });
    paint(B, { mask: (x, y) => sq(x - mcx) + sq(y - mcy) < 12, h: (x, y) => 26 - 0.15 * (sq(x - mcx) + sq(y - mcy)),
      ramp: STEEL, spec: 1.1, specPow: 30, dither: 0.2, ao: () => 0.85 });
    // 肩甲：三片弧形甲板
    for (const s of [-1, 1]) {
      const pcx = bx + s * 31, pcy = 79, ax = 14, ay = 11;
      const q = (x, y) => sq((x - pcx) / ax) + sq((y - pcy) / ay);
      const pm = (x, y) => q(x, y) < 1 && y > shTop(x - bx) - 3;
      const ph = (x, y) => 22 + 8 * Math.sqrt(Math.max(0, 1 - q(x, y)));
      const PM = goldHelm ? BRONZE : STEEL;
      paint(B, { mask: pm, h: ph, ramp: PM, spec: 0.3, specPow: 14, dither: 0.5, ao: (x, y) => 0.88 - 0.35 * smooth(78, 92, y),
        tex: (X, Y) => { const v = ((Y - pcy + 30 - Math.abs(X - pcx) * 0.35 * s * -1 + (X - pcx) * s * 0.35) % 7) / 7; return { ny: (v - 0.5) * 0.5, m: v > 0.87 ? 0.55 : 1 }; } });
      paint(B, { mask: (x, y) => { const k = q(x, y); return k < 1 && k > 0.78 && y < pcy + 1 && y > shTop(x - bx) - 3; },
        h: ph, ramp: GOLD, spec: 0.6, specPow: 12, dither: 0.3 });
    }
    // 領巾
    paint(B, { mask: (x, y) => { const dx = x - bx; return Math.abs(dx) < 14 && y > 61 && y < shTop(dx) + 4.5; },
      h: (x, y) => 20 + 4 * Math.sqrt(Math.max(0, 1 - sq((x - bx) / 14))) + Math.sin((x - bx) * 0.9) * 0.6, ramp: ROBE, dither: 0.6 });
  } else {
    const robeH = (x, y) => { const dx = x - bx, a = Math.abs(dx);
      return 20 * Math.sqrt(Math.max(0, 1 - sq(dx / 54))) + 5 * gs(a - 30, y - 75, 12, 9) + 0.9 * Math.sin(dx * 0.42 + (y - 66) * 0.12 * Math.sign(dx)) * smooth(70, 82, y); };
    paint(B, { mask: bodyMask, h: robeH, ramp: ROBE, ao: bodyFade, dither: 0.7 });
    const L1 = y => bx - 8 + (y - 64) * 0.6, R1 = y => bx + 8 - (y - 64) * 0.42;
    paint(B, { mask: (x, y) => y > 64 && x > L1(y) && x < R1(y) && y > shTop(x - bx) - 1, h: robeH, ramp: WHITE, ao: bodyFade, dither: 0.5 });
    paint(B, { mask: (x, y) => y > 63 && ((x > L1(y) - 3.4 && x <= L1(y) + 0.2) || (x >= R1(y) - 0.2 && x < R1(y) + 3.2 && x > L1(y))) && y > shTop(x - bx) - 1.5,
      h: (x, y) => robeH(x, y) + 1, ramp: whiteRobe ? ramp('#2a2a30', 6, 0.35) : ROBED, ao: bodyFade, dither: 0.4 });
  }

  // ---------- 頸 ----------
  const nw = g.str > 85 ? 8.3 : 7.2, ncx = cx - 1.5;
  paint(B, { mask: (x, y) => Math.abs(x - ncx) < nw && y > chinY - 12 && y < shTop(x - bx) + 1 && !(armored && y > 61 && Math.abs(x - bx) < 14 && y > shTop(x - bx) - 2),
    h: (x, y) => 9 * Math.sqrt(Math.max(0, 1 - sq((x - ncx) / nw))), ramp: SKIN,
    ao: (x, y) => 0.3 + 0.4 * smooth(chinY, chinY + 8, y) });

  // ---------- 耳（只見遠側） ----------
  if (!helm) {
    const ecx = cx + faceW(ey + 2) - 1.2, ecy = ey + 2.5;
    paint(B, { mask: (x, y) => sq((x - ecx) / 3) + sq((y - ecy) / 5) < 1 && x > ecx - 1.5, h: (x, y) => 6 + 2 * Math.sqrt(Math.max(0, 1 - sq((x - ecx) / 3) - sq((y - ecy) / 5))),
      ramp: SKIN, ao: () => 0.8, dither: 0.5 });
  }

  // ---------- 臉 ----------
  const helmBot = l => ey - 6.5 + 0.055 * l * l;
  const hairline = l => ey - 11.5 + 0.045 * l * l;
  paint(B, { mask: faceMask, h: faceH, ramp: SKIN, dither: 0.5, amb: 0.12,
    ao: (x, y) => (helm && y < helmBot(lx(x, y)) + 3.5 ? 0.6 : 1) * (1 - 0.2 * smooth(55, 63, y)) * (1 - 0.25 * smooth(1.2, 1.55, ang(x, y))) });

  // ---------- 五官 ----------
  const sk = i => SKIN[clamp(i, 0, SKIN.length - 1)];
  const R = v => Math.round(v);
  const span = (l0, l1, y) => { const a = R(sx(l0, y) - 0.5), b = R(sx(l1, y) - 0.5); const out = []; for (let x = Math.min(a, b); x <= Math.max(a, b); x++) out.push(x); return out; };
  const lash = toRGB('#120808');
  const eyeRows = (fierce && !bushy) || sly ? 1 : 2;
  for (const s of [-1, 1]) {
    const lit = s < 0;
    const li = s * 3.6, lo = s * 10.4, lc = s * 6.8;
    const xs = span(li, lo, ey);                         // 由內而外的像素
    if (s < 0) xs.reverse();
    const first = xs[0], last = xs[xs.length - 1], dir = s;
    if (wise || old || young) for (const x of xs.slice(1, -1)) dotPx(B, x, ey - 2, sk(lit ? 3 : 1));
    for (const x of xs) dotPx(B, x, ey - 1, lash);
    if (fierce || sly) { dotPx(B, last + dir, ey - 2, lash); dotPx(B, last, ey - 2, lash); }
    const wC = lit ? toRGB('#d2c6b0') : toRGB('#8e806c');
    for (let row = 0; row < eyeRows; row++) { for (const x of xs.slice(1, -1)) dotPx(B, x, ey + row, wC); dotPx(B, first, ey + row, sk(1)); dotPx(B, last, ey + row, lash); }
    const ic = R(sx(lc - 1.2, ey) - 0.5);                   // 目光略看向左
    const irisC = toRGB('#24140c');
    for (let row = 0; row < eyeRows; row++) { dotPx(B, ic, ey + row, irisC); dotPx(B, ic + 1, ey + row, irisC); if (eyeRows > 1 && !bushy) dotPx(B, ic - 1, ey + row, row ? irisC : toRGB('#3a2418')); }
    if (bushy) { dotPx(B, ic - 1, ey, irisC); }
    dotPx(B, ic, ey, lit ? toRGB('#e8dcc6') : toRGB('#6e6050'));
    for (const x of xs.slice(1, -1)) dotPx(B, x, ey + eyeRows, sk(lit ? 2 : 1));
    if (old) { dotPx(B, last + dir, ey + 1, sk(2)); dotPx(B, last + dir * 2, ey + 2, sk(2)); for (const x of xs.slice(1, -1)) tint(B, x, ey + eyeRows + 1, sk(1), 0.5); }
    // 眉
    const thick = fierce ? 3 : 2;
    for (let k = 0; k <= 10; k++) {
      const t = k / 10, l = s * (2.6 + t * 9.5);
      let yb = fierce ? ey - 3.5 - t * 3.4 : sly ? ey - 4.2 - t * 2.4 : ey - 4.4 - Math.sin(Math.PI * t) * 1.7;
      if ((wise || old) && t > 0.85) yb += 1.2;
      const x = R(sx(l, ey - 4) - 0.5), th = t > 0.85 ? thick - 1 : thick;
      for (let j = 0; j < th; j++) dotPx(B, x, R(yb) + j, HAIR[j === 0 ? (lit ? 5 : 3) : (lit ? 3 : 1)]);
    }
  }
  if (fierce) { const x = R(sx(0, ey - 5) - 0.5); dotPx(B, x - 1, ey - 5, sk(2)); dotPx(B, x - 1, ey - 4, sk(2)); dotPx(B, x + 1, ey - 5, sk(1)); }
  // 鼻：遠側鼻翼陰影、鼻孔
  { const nx0 = R(sx(0, ey + 8) - 0.5);
    dotPx(B, nx0 + 1, ey + 6, sk(1)); dotPx(B, nx0 + 1, ey + 7, sk(1)); dotPx(B, nx0 + 2, ey + 8, sk(1));
    dotPx(B, R(sx(-2.6, ey + 9) - 0.5), ey + 9, sk(0)); dotPx(B, R(sx(2.2, ey + 9) - 0.5), ey + 9, sk(0)); dotPx(B, nx0, ey + 9, sk(1));
    dotPx(B, nx0 - 1, ey + 7, sk(6)); }
  // 口
  const mouthC = toRGB(redFace ? '#360c08' : '#3e1616');
  { const xs = span(-4.2, 4.2, my); xs.forEach((x, i) => {
      let yy = my;
      if (fierce && (i === 0 || i === xs.length - 1)) yy = my + 1;
      if (sly && i === xs.length - 1) yy = my - 1;
      dotPx(B, x, yy, mouthC); });
    for (const x of span(-2.2, 2.2, my + 1)) tint(B, x, my + 1, '#6a2a22', 0.28); }
  if (old) {
    for (const yy of [ey - 8, ey - 10]) for (const x of span(-6, 6, yy)) if ((x + yy) % 5) tint(B, x, yy, SKIN[1], 0.5);
    for (const s of [-1, 1]) for (let k = 0; k < 5; k++) tint(B, R(sx(s * (4.5 + k * 0.5), ey + 10 + k) - 0.5), ey + 10 + k, SKIN[1], 0.6);
  }

  // ---------- 頭髮／頭盔／頭巾 ----------
  const hairH = (x, y) => 15 * Math.sqrt(Math.max(0, 1 - sq((x - cx) / (rx + 2)) - sq((y - 41) / 22)));
  const inSkull = (x, y, pad) => sq((x - cx) / (rx + pad)) + sq((y - 41) / (21.5 + pad * 0.5)) < 1;
  if (helm) {
    const hrx = rx + 3.6, hcy = 38, hry = 20.5;
    const domeM = (x, y) => sq((x - cx) / hrx) + sq((y - hcy) / hry) < 1 && y < helmBot(lx(x, Math.max(y, 20))) && y < hcy + 13;
    const domeH = (x, y) => 17 * Math.sqrt(Math.max(0, 1 - sq((x - cx) / hrx) - sq((y - hcy) / hry)));
    const HM = goldHelm ? BRONZE : STEEL;
    // 頓項
    paint(B, { mask: (x, y) => { const a = Math.abs(x - cx), w = faceW(Math.min(y, 53)); return y > ey - 9 && y < 64 && a > w - (x > cx ? 3.5 : 0.6) && a < w + 5.5 - (x < cx ? 1.5 : 0); },
      h: (x, y) => 6 + 3 * Math.cos(clamp((Math.abs(x - cx) - faceW(Math.min(y, 53)) - 2) / 4) * 1.5), ramp: HM, spec: 0.35, ao: (x, y) => 0.78 - 0.3 * smooth(46, 63, y), dither: 0.5,
      tex: (X, Y) => { const v = (Y % 3.5) / 3.5; return { ny: (v - 0.45) * 1, m: v > 0.74 ? 0.55 : 1 }; } });
    paint(B, { mask: domeM, h: domeH, ramp: HM, spec: 0.45, specPow: 18, dither: 0.45,
      tex: (X, Y) => { const a = Math.atan2(X - cx + 2, (hcy + 8) - Y), seam = Math.abs(((a * 5 / Math.PI) % 1 + 1) % 1 - 0.5); return seam > 0.44 ? { m: 0.6 } : null; } });
    paint(B, { mask: (x, y) => domeM(x, y) && y > helmBot(lx(x, Math.max(y, 20))) - 3.2, h: (x, y) => domeH(x, y) + 1.5, ramp: GOLD, spec: 0.7, specPow: 12, dither: 0.3 });
    const fx = sx(0, ey - 8);
    paint(B, { mask: (x, y) => y > ey - 19 && y < ey - 8.5 && Math.abs(x - fx) < (y - (ey - 19)) * 0.42, h: (x, y) => 19 - Math.abs(x - fx) * 0.8, ramp: GOLD, spec: 0.9, specPow: 12, dither: 0.3 });
    const tx = cx - 1.5;
    paint(B, { mask: (x, y) => Math.abs(x - tx) < 1.6 && y > 13 && y < 19.5, h: (x, y) => 4 - sq(x - tx), ramp: GOLD, spec: 0.5, dither: 0.2 });
    const pl = tube([[tx, 13.5], [tx + 3, 9.5], [tx + 8, 8.5], [tx + 12.5, 11.5]], 3.6, 2, 2);
    paint(B, { ...pl, ramp: r(6) > 0.4 ? RED : ROBE, dither: 0.6, tex: (X, Y) => ({ m: 0.8 + 0.28 * Math.sin(X * 1.7 + Y * 0.8) }) });
  } else {
    const hairM = (x, y) => {
      if (!inSkull(x, y, 1.6)) return false;
      const a = ang(x, Math.max(y, 18));
      return y < hairline(lx(x, Math.max(y, 18))) || (y < ey + 3 && (a > 1.28 || a < -1.45)) ;
    };
    if (!scholar) {
      paint(B, { mask: hairM, h: hairH, ramp: HAIR, dither: 0.5, spec: 0.22, specPow: 8,
        tex: (X, Y) => { const a = Math.atan2(X - cx + 1.5, Y - 16); return { m: 0.85 + 0.2 * Math.sin(a * 34 + hash(Math.round(a * 30), 1, g.id) * 2) }; } });
      const kx = cx - 1.5;
      paint(B, { mask: (x, y) => sq((x - kx) / 5.5) + sq((y - 18) / 5) < 1, h: (x, y) => 3 + 5 * Math.sqrt(Math.max(0, 1 - sq((x - kx) / 5.5) - sq((y - 18) / 5))),
        ramp: HAIR, spec: 0.25, specPow: 8, dither: 0.4, tex: X => ({ m: 0.88 + 0.2 * Math.sin(X * 1.4) }) });
      paint(B, { mask: (x, y) => Math.abs(x - kx) < 3.2 && y > 19.5 && y < 22.5, h: (x, y) => 6 - sq(x - kx) * 0.3, ramp: GOLD, spec: 0.5, dither: 0.2 });
      paint(B, { mask: (x, y) => hairM(x, y) && y > hairline(lx(x, Math.max(y, 18))) - 2.2 && y < ey - 2, h: (x, y) => hairH(x, y) + 0.8, ramp: young ? ROBE : ROBED, dither: 0.4 });
    } else {
      // 綸巾：柔軟黑紗頭巾，頂部圓隆、後腦打結
      const capM = (x, y) => (inSkull(x, y, 2.4) || (sq((x - cx + 1) / (rx + 0.5)) + sq((y - 28) / 11) < 1 && y < 32)) && y < hairline(lx(x, Math.max(y, 18))) + 0.5;
      const capH = (x, y) => Math.max(hairH(x, y), 12 * Math.sqrt(Math.max(0, 1 - sq((x - cx + 1) / (rx + 0.5)) - sq((y - 28) / 11))));
      const CAP = ramp(old ? '#3a3a44' : '#283040', 7, 0.35, 0.35);
      paint(B, { mask: capM, h: capH, ramp: CAP, dither: 0.6, spec: 0.15,
        tex: (X, Y) => ({ m: 0.86 + 0.2 * Math.sin((X - cx) * 1.1 + Y * 0.15) * smooth(8, 26, Y) }) });
      paint(B, { mask: (x, y) => capM(x, y) && Math.abs(y - (hairline(lx(x, Math.max(y, 18))) - 1)) < 1.1, h: (x, y) => capH(x, y) + 1, ramp: ramp('#15171e', 5, 0.4), dither: 0.3 });
      paint(B, { mask: (x, y) => !capM(x, y) && hairM(x, y), h: hairH, ramp: HAIR, dither: 0.4 });
      const kx = cx + rx - 1;                                    // 後結
      paint(B, { mask: (x, y) => sq((x - kx) / 3.2) + sq((y - 29) / 2.6) < 1, h: (x, y) => 14 + 2 * Math.sqrt(Math.max(0, 1 - sq((x - kx) / 3.2) - sq((y - 29) / 2.6))), ramp: CAP, dither: 0.3 });
    }
  }

  // ---------- 鬍鬚 ----------
  const beardTex = (X, Y) => ({ m: 0.74 + 0.36 * hash(Math.round(X + Math.sin(Y * 0.25) * 1.5), 3, g.id) });
  const chinX = sx(0, chinY - 2);
  if (!young) {
    if (longB) {
      const sway = y => Math.sin((y - my) / 11) * 1.3;
      const bc = y => (y < chinY ? sx(0, y) : chinX - 1) + sway(y);
      const bw = y => { const t = clamp((y - my) / (96 - my)); return t < 0.25 ? 6.5 + t * 14 : 10 * (1 - Math.pow((t - 0.25) / 0.75, 1.4)) + 1; };
      const bm = (x, y) => y > my + 1.5 && y < 97 && Math.abs(x - bc(y)) < bw(y);
      const jawM = (x, y) => { const a = ang(x, y); return y > ey + 4 && y < chinY + 1 && faceMask(x, y) && (a > 1.05 || a < -0.95); };
      paint(B, { mask: (x, y) => bm(x, y) || jawM(x, y), h: (x, y) => 14 + 5 * Math.sqrt(Math.max(0, 1 - sq((x - bc(y)) / Math.max(1, bw(y))))) - (y - my) * 0.05,
        ramp: HAIR, spec: 0.25, specPow: 6, dither: 0.5, tex: beardTex, ao: (x, y) => 1 - 0.35 * smooth(80, 96, y) });
      for (const s of [-1, 1]) paint(B, { ...tube([P(s * 0.8, my - 2.2), P(s * 4.5, my - 1.5), P(s * 7, my + 2.5), [sx(s * 7.5, my + 4), my + 7]], 1.6, 0.9, 15), ramp: HAIR, dither: 0.3 });
    } else if (bushy) {
      const jag = (x, y) => (hash(Math.round(x), Math.round(y), 41) - 0.5) * 2.6;
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
      paint(B, { mask: bm, h: (x, y) => faceH(x, Math.min(y, chinY - 1)) + 2.5 + 1.5 * hash(Math.round(x), Math.round(y), 7), ramp: HAIR, dither: 0.6,
        tex: (X, Y) => ({ m: 0.72 + 0.45 * hash(Math.round(X * 0.7), Math.round(Y * 0.7), 13), nx: Math.sin(X * 1.3 + Y) * 0.4 }) });
      for (const x of span(-1.5, 1.5, my)) dotPx(B, x, my, mouthC);
    } else if (r(7) > 0.22) {
      for (const s of [-1, 1]) paint(B, { ...tube([P(s * 0.8, my - 2.3), P(s * 4, my - 1.6), P(s * 6.5, my + 1 + (old ? 2 : 0))], 1.3, 0.7, 15), ramp: HAIR, dither: 0.3 });
      if (r(8) > 0.3) {
        const len = 4 + r(9) * (old ? 10 : 6);
        paint(B, { ...tube([[chinX, my + 2.5], [chinX - 0.5, chinY + len * 0.5], [chinX - 1.5, chinY + len]], 2.4, 0.8, 14), ramp: HAIR, dither: 0.4, tex: beardTex });
      }
    }
  }

  // ---------- 羽扇 ----------
  if (fan) {
    const fx = cx - 28, fy = 80;
    paint(B, { ...tube([[fx + 3, fy + 8], [fx + 7, 97]], 1.4, 1.4, 20), ramp: ramp('#5a3e24', 6, 0.5), dither: 0.2 });
    paint(B, { mask: (x, y) => sq((x - fx) / 11) + sq((y - fy + 2) / 14) < 1 && y < fy + 9,
      h: (x, y) => 22 + 3 * Math.sqrt(Math.max(0, 1 - sq((x - fx) / 11) - sq((y - fy + 2) / 14))), ramp: WHITE, dither: 0.5,
      tex: (X, Y) => { const a = Math.atan2(X - fx - 3, Y - fy - 8); return { m: 0.8 + 0.25 * Math.sin(a * 22) }; } });
  }

  // ---------- 描邊與輪廓光 ----------
  const out = B.col.map(c => c && c.slice());
  const bg = (x, y) => x < 0 || x >= PXW || y < 0 || y >= PXW ? false : B.mat[y * PXW + x] < 0;
  for (let y = 1; y < PXW - 1; y++) for (let x = 1; x < PXW - 1; x++) {
    const i = y * PXW + x, m = B.mat[i];
    if (m < 0) continue;
    if (bg(x - 1, y) || bg(x, y - 1) || bg(x + 1, y) || bg(x, y + 1)) {
      const litSide = (bg(x - 1, y) || bg(x, y - 1)) && !bg(x + 1, y);
      out[i] = mixC(B.ramps[m][litSide ? 1 : 0], SHADOW, litSide ? 0.2 : 0.5).map(Math.round);
    } else if (bg(x + 2, y) && y < 90) out[i] = mixC(B.col[i], rimC, 0.6).map(Math.round);
    else if (bg(x + 3, y) && y < 90) out[i] = mixC(B.col[i], rimC, 0.25).map(Math.round);
  }
  const frame = legend ? toRGB('#b8923e') : toRGB('#0a0706');
  for (let k = 0; k < PXW; k++) for (const [x, y] of [[k, 0], [k, PXW - 1], [0, k], [PXW - 1, k]]) out[y * PXW + x] = frame;
  if (legend) for (let k = 1; k < PXW - 1; k++) for (const [x, y] of [[k, 1], [k, PXW - 2], [1, k], [PXW - 2, k]]) out[y * PXW + x] = toRGB('#3a2a10');
  return out;
}

export function drawPxPortrait(g, col, dark) {
  const px = renderPxPortrait(g, col, dark);
  const cv = document.createElement('canvas');
  cv.width = PXW; cv.height = PXW;
  const c = cv.getContext('2d'), im = c.createImageData(PXW, PXW);
  for (let i = 0; i < px.length; i++) { const p = px[i] || [0, 0, 0]; im.data.set([p[0], p[1], p[2], 255], i * 4); }
  c.putImageData(im, 0, 0);
  return cv;
}
