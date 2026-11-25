// 像素美術：全部以程式繪製，不使用任何外部素材。
// 地圖與戰場以 640×360 繪製（邏輯座標 320×180 的兩倍），頭像 48×48。
import { FACTIONS, NEUTRAL_COLOR, ROADS, CITIES } from './data.js';
import { drawPortrait } from './portrait.js';

export const MAP_W = 320, MAP_H = 180;       // 邏輯座標（城池位置）
const K = 2;                                  // 繪製倍率
const W = MAP_W * K, H = MAP_H * K;

export const facColor = id => (FACTIONS.find(f => f.id === id) || {}).color || NEUTRAL_COLOR;
export const facDark = id => (FACTIONS.find(f => f.id === id) || {}).dark || '#5a5246';
export const FAC_GLYPH = { cao: '曹', liu: '劉', sun: '孫', yuans: '袁', yuanh: '術', dong: '董', gong: '瓚', biao: '表' };

// ---------- 工具 ----------
export function hash(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 982451653) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function smooth(x, y, s, seed) {
  const x0 = Math.floor(x / s), y0 = Math.floor(y / s);
  let fx = x / s - x0, fy = y / s - y0;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed), c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
export function fbm(x, y, seed) {
  return smooth(x, y, 64, seed) * 0.5 + smooth(x, y, 24, seed + 1) * 0.28 + smooth(x, y, 9, seed + 2) * 0.14 + smooth(x, y, 4, seed + 3) * 0.08;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16 - 0.5);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const rgb = a => `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c, k) => rgb(mix(hex(c), k > 0 ? [255, 250, 235] : [20, 12, 8], Math.abs(k)));

function lineCells(x0, y0, x1, y1, cb) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, i = 0;
  for (;;) {
    cb(x0, y0, i++);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
// 平滑曲線（Catmull-Rom）取樣
function spline(pts, step = 0.05) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    for (let t = 0; t < 1; t += step) {
      const t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ---------- 地形資料 ----------
const COAST = [[0, 318], [28, 316], [32, 286], [60, 284], [64, 312], [96, 314], [100, 302], [140, 300], [146, 290], [180, 286]];
export function coastX(y) {
  for (let i = 0; i < COAST.length - 1; i++) {
    const [y0, x0] = COAST[i], [y1, x1] = COAST[i + 1];
    if (y >= y0 && y <= y1) { const t = (y - y0) / Math.max(1, y1 - y0); return x0 + (x1 - x0) * (t * t * (3 - 2 * t)); }
  }
  return 290;
}
const RIVERS = [
  { w: 3, pts: [[20, 50], [44, 62], [70, 72], [100, 86], [128, 90], [150, 86], [172, 84], [200, 80], [222, 74], [246, 62], [270, 56], [288, 54]] },
  { w: 3, pts: [[4, 146], [30, 150], [60, 154], [90, 158], [112, 166], [128, 168], [150, 166], [178, 162], [196, 154], [226, 152], [262, 150], [292, 142]] },
  { w: 2, pts: [[56, 128], [90, 134], [124, 140], [150, 148], [176, 152], [196, 154]] },
  { w: 2, pts: [[100, 86], [96, 96], [88, 98], [70, 100], [50, 102]] },
  { w: 2, pts: [[200, 116], [214, 128], [232, 138], [250, 146]] },
];
const RANGES = [
  { x: 188, y: 46, rx: 12, ry: 24, h: 0.9 }, { x: 96, y: 112, rx: 50, ry: 8, h: 0.9 }, { x: 40, y: 92, rx: 22, ry: 30, h: 1 },
  { x: 130, y: 34, rx: 24, ry: 16, h: 0.7 }, { x: 210, y: 146, rx: 18, ry: 6, h: 0.6 }, { x: 62, y: 170, rx: 40, ry: 12, h: 0.7 },
  { x: 120, y: 128, rx: 20, ry: 8, h: 0.5 }, { x: 18, y: 130, rx: 16, ry: 30, h: 0.9 }, { x: 280, y: 92, rx: 10, ry: 6, h: 0.45 },
  { x: 220, y: 20, rx: 30, ry: 10, h: 0.55 },
];
export const riverPaths = RIVERS.map(r => ({ w: r.w, pts: spline(r.pts) }));

export function elevation(lx, ly) {
  let e = fbm(lx * K, ly * K, 7) * 0.45;
  for (const r of RANGES) {
    const dx = (lx - r.x) / r.rx, dy = (ly - r.y) / r.ry;
    const d = dx * dx + dy * dy;
    if (d < 1) e += (1 - d) * (1 - d) * r.h * (0.6 + fbm(lx * K, ly * K, 31) * 0.8);
  }
  return e;
}

const SEASON = [
  { low: '#7fb069', mid: '#a3b865', high: '#8a7a52', peak: '#b8ab8a', snow: 0.95, tint: [255, 248, 230] }, // 春
  { low: '#5e9a52', mid: '#86a650', high: '#7a6a48', peak: '#a89c80', snow: 1.2, tint: [255, 250, 220] },  // 夏
  { low: '#b89a4e', mid: '#c8a85a', high: '#8a6440', peak: '#a8987a', snow: 0.95, tint: [255, 236, 200] }, // 秋
  { low: '#c8ccc4', mid: '#d8dad2', high: '#9a968a', peak: '#e8eaea', snow: 0.62, tint: [235, 240, 255] }, // 冬
];

const terrainCache = {};
function terrainLayer(season) {
  if (terrainCache[season]) return terrainCache[season];
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const P = SEASON[season];
  const low = hex(P.low), mid = hex(P.mid), high = hex(P.high), peak = hex(P.peak), snowC = [244, 246, 248];
  const img = ctx.createImageData(W, H);
  const elev = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) elev[y * W + x] = elevation(x / K, y / K);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4;
    const lx = x / K, ly = y / K;
    const cx = coastX(ly) + (smooth(x, y, 12, 5) - 0.5) * 10;
    let c;
    const d = bayer(x, y);
    if (lx > cx) {
      const depth = Math.min(1, (lx - cx) / 22 + d * 0.12);
      c = mix([96, 150, 186], [34, 66, 112], depth);
      if (lx < cx + 1.6) c = [228, 236, 230];
      else if (hash(x >> 2, y, 4) > 0.93 && ((x + y) & 3) === 0) c = mix(c, [190, 214, 230], 0.6);
    } else {
      const e = elev[i];
      const t = e + d * 0.08;
      if (t < 0.3) c = mix(low, mid, Math.max(0, t / 0.3));
      else if (t < 0.55) c = mix(mid, high, (t - 0.3) / 0.25);
      else if (t < 0.8) c = mix(high, peak, (t - 0.55) / 0.25);
      else c = peak;
      if (e > P.snow + d * 0.1) c = snowC;
      // 立體陰影：光從西北來
      const ex = elev[i + (x < W - 1 ? 1 : 0)] - elev[i - (x > 0 ? 1 : 0)];
      const ey = elev[i + (y < H - 1 ? W : 0)] - elev[i - (y > 0 ? W : 0)];
      const light = Math.max(-1, Math.min(1, -(ex + ey) * 26));
      const lq = Math.round((light + d * 0.5) * 3) / 3;
      c = lq > 0 ? mix(c, P.tint, lq * 0.35) : mix(c, [40, 30, 30], -lq * 0.45);
      if (lx > cx - 2.5) c = mix(c, [226, 206, 150], 0.7); // 沙岸
    }
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // 農田（城池周圍）
  for (const city of CITIES) {
    if (elevation(city.x, city.y) > 0.5) continue;
    for (let k = 0; k < 7; k++) {
      const fx = Math.round(city.x * K + (hash(city.id, k, 61) - 0.5) * 60), fy = Math.round(city.y * K + (hash(city.id, k, 62) - 0.5) * 44);
      if (fx / K > coastX(fy / K) - 4) continue;
      const fw = 8 + Math.floor(hash(city.id, k, 63) * 8), fh = 5 + Math.floor(hash(city.id, k, 64) * 4);
      const fc = [['#9ab85a', '#7ea048'], ['#6a9a3e', '#588a34'], ['#d8b85a', '#c09a40'], ['#d4d4cc', '#c0c0b8']][season];
      for (let r = 0; r < fh; r++) rect(ctx, fx, fy + r, fw, 1, fc[r % 2]);
      ctx.globalAlpha = 0.5; rect(ctx, fx, fy + fh, fw, 1, '#3a2a1a'); ctx.globalAlpha = 1;
    }
  }
  // 河流
  const water = season === 3 ? '#a8c8dc' : '#3f7ab0', bank = season === 3 ? '#7a98ac' : '#2a5480', glint = season === 3 ? '#e8f0f4' : '#7ab0d8';
  for (const r of riverPaths) {
    const seg = (col, w) => { for (let i = 0; i < r.pts.length - 1; i++) lineCells(r.pts[i][0] * K, r.pts[i][1] * K, r.pts[i + 1][0] * K, r.pts[i + 1][1] * K, (x, y) => rect(ctx, x - (w >> 1), y - (w >> 1), w, w, col)); };
    seg(bank, r.w + 2); seg(water, r.w);
    for (let i = 0; i < r.pts.length - 1; i += 3) if (hash(i, r.w, 71) > 0.5) px(ctx, Math.round(r.pts[i][0] * K), Math.round(r.pts[i][1] * K) - 1, glint);
  }
  // 山峰
  const peaks = [];
  for (let y = 6; y < H - 6; y += 9) for (let x = 6; x < W - 6; x += 11) {
    const jx = x + Math.floor(hash(x, y, 11) * 6), jy = y + Math.floor(hash(x, y, 12) * 5);
    const e = elevation(jx / K, jy / K);
    if (e > 0.62 && hash(x, y, 13) > 0.25 && jx / K < coastX(jy / K) - 4) peaks.push([jx, jy, e]);
  }
  peaks.sort((a, b) => a[1] - b[1]).forEach(([x, y, e]) => drawPeak(ctx, x, y, e > 0.95 ? 1 : 0, season));
  // 森林
  for (let y = 4; y < H; y += 6) for (let x = 4; x < W; x += 7) {
    const lx = x / K, ly = y / K;
    const f = smooth(x, y, 40, 83);
    if (f < 0.6 || lx > coastX(ly) - 5) continue;
    const e = elevation(lx, ly);
    if (e > 0.6) continue;
    if (hash(x, y, 84) > (f - 0.5) * 2) continue;
    drawTree(ctx, x + Math.floor(hash(x, y, 85) * 4), y + Math.floor(hash(x, y, 86) * 3), season);
  }
  // 邊框暗角
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(30,16,8,0.35)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  terrainCache[season] = cv;
  return cv;
}

function drawPeak(ctx, x, y, big, season) {
  const h = big ? 9 : 7;
  const rock = season === 3 ? '#8c8a86' : '#7a6448', lit = season === 3 ? '#e8ecee' : '#b09a72', dark = season === 3 ? '#5a5a5e' : '#4a3a2a';
  for (let r = 0; r < h; r++) {
    const half = Math.floor(r * 0.9);
    for (let c = -half; c <= half; c++) px(ctx, x + c, y + r, c < 0 ? lit : c === 0 ? rock : dark);
  }
  if (big || season === 3 || season === 0) { px(ctx, x, y, '#f8f8f4'); px(ctx, x - 1, y + 1, '#f8f8f4'); px(ctx, x, y + 1, '#e0e4e8'); if (big) { px(ctx, x - 2, y + 2, '#f8f8f4'); px(ctx, x + 1, y + 2, '#d0d4d8'); } }
  ctx.globalAlpha = 0.25; rect(ctx, x - Math.floor(h * 0.9) + 1, y + h, h * 2 - 2, 1, '#000'); ctx.globalAlpha = 1;
}
function drawTree(ctx, x, y, season) {
  const pal = [['#3f8a3a', '#2a6a2a', '#6ab05a'], ['#2f7a2e', '#1e5a20', '#4e9a44'], ['#c8782a', '#9a5418', '#e8a048'], ['#5a7a6a', '#3a5a4a', '#f0f4f4']][season];
  rect(ctx, x - 1, y + 4, 1, 2, '#4a2e1a');
  rect(ctx, x - 2, y + 1, 4, 3, pal[0]);
  rect(ctx, x - 1, y, 2, 1, pal[0]);
  px(ctx, x - 2, y + 1, pal[2]); px(ctx, x - 1, y, pal[2]);
  rect(ctx, x, y + 2, 2, 2, pal[1]);
  px(ctx, x - 3, y + 2, pal[0]); px(ctx, x + 2, y + 2, pal[1]);
}

// ---------- 勢力範圍 ----------
const territoryCache = { key: '', cv: null };
function territoryLayer(s) {
  const key = s.cities.map(c => c.owner || '-').join(',');
  if (territoryCache.key === key) return territoryCache.cv;
  const cv = territoryCache.cv || document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const step = 2, GW = W / step, GH = H / step;
  const own = new Int8Array(GW * GH).fill(-1);
  const ids = FACTIONS.map(f => f.id);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const lx = gx * step / K, ly = gy * step / K;
    if (lx > coastX(ly)) continue;
    let best = 1e9, bc = null;
    for (const c of s.cities) {
      const d = (c.x - lx) ** 2 + (c.y - ly) ** 2 * 1.2;
      if (d < best) { best = d; bc = c; }
    }
    if (best < 34 * 34 && bc.owner) own[gy * GW + gx] = ids.indexOf(bc.owner);
  }
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const o = own[gy * GW + gx];
    if (o < 0) continue;
    const col = hex(FACTIONS[o].color);
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => own[(gy + dy) * GW + gx + dx] !== o);
    for (let yy = 0; yy < step; yy++) for (let xx = 0; xx < step; xx++) {
      const x = gx * step + xx, y = gy * step + yy, p = (y * W + x) * 4;
      const a = edge ? (((x + y) >> 1) % 2 ? 210 : 0) : 46;
      img.data[p] = edge ? col[0] * 0.7 : col[0]; img.data[p + 1] = edge ? col[1] * 0.7 : col[1]; img.data[p + 2] = edge ? col[2] * 0.7 : col[2]; img.data[p + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  territoryCache.key = key; territoryCache.cv = cv;
  return cv;
}

export function drawMap(ctx, s, opts = {}) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(terrainLayer(s.season), 0, 0);
  ctx.drawImage(territoryLayer(s), 0, 0);
  // 道路
  for (const [a, b] of ROADS) {
    const A_ = CITIES[a - 1], B_ = CITIES[b - 1];
    const hl = opts.routes && opts.routes.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
    if (hl) lineCells(A_.x * K, A_.y * K, B_.x * K, B_.y * K, (x, y) => rect(ctx, x - 1, y - 1, 4, 4, '#2b1a10'));
    lineCells(A_.x * K, A_.y * K, B_.x * K, B_.y * K, (x, y, i) => {
      if (hl) rect(ctx, x, y, 2, 2, (i >> 2) % 2 ? '#e04030' : '#f8d870');
      else if (i % 5 < 3) { rect(ctx, x, y + 1, 2, 1, '#6a4a2a'); rect(ctx, x, y, 2, 1, '#e8d4a0'); }
    });
  }
  const sorted = [...s.cities].sort((a, b) => a.y - b.y);
  for (const c of sorted) drawCastle(ctx, c.x * K, c.y * K, c.owner, c.size, opts.selected === c.id, opts.targets && opts.targets.includes(c.id));
}

// 城池（640 尺度）
export function drawCastle(ctx, cx, cy, owner, size, selected, targeted) {
  const big = size === '大', pass = size === '關';
  const w = big ? 26 : pass ? 18 : 22, h = big ? 12 : 10;
  const x = Math.round(cx - w / 2), y = Math.round(cy - 2);
  const col = facColor(owner), dark = facDark(owner);
  if (selected || targeted) {
    ctx.globalAlpha = 0.9;
    const ring = selected ? '#fff2a8' : '#ff4a32';
    for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; rect(ctx, Math.round(cx + Math.cos(t) * (w / 2 + 6)), Math.round(cy + 2 + Math.sin(t) * (h / 2 + 8)), 2, 2, ring); }
    ctx.globalAlpha = 1;
  }
  // 影子
  ctx.globalAlpha = 0.35; rect(ctx, x + 2, y + h + 1, w, 3, '#000'); ctx.globalAlpha = 1;
  // 城牆
  rect(ctx, x - 1, y - 1, w + 2, h + 2, '#2b1d12');
  rect(ctx, x, y, w, h, '#b8ae98');
  rect(ctx, x, y + h - 3, w, 3, '#8a806c');
  for (let i = 0; i < w; i += 3) { rect(ctx, x + i, y - 3, 2, 2, '#b8ae98'); px(ctx, x + i, y - 4, '#2b1d12'); px(ctx, x + i + 1, y - 4, '#2b1d12'); }
  for (let r = 2; r < h - 3; r += 3) for (let i = (r % 2) * 2; i < w; i += 5) px(ctx, x + i, y + r, '#9a907c');
  // 城門
  const gx = x + Math.floor(w / 2) - 2;
  rect(ctx, gx - 1, y + h - 7, 6, 7, '#2b1d12'); rect(ctx, gx, y + h - 6, 4, 6, '#4a2a18'); px(ctx, gx + 1, y + h - 6, '#6a3a20');
  // 城樓（兩層屋簷）
  const tw = big ? 16 : 12, tx = x + Math.floor((w - tw) / 2), ty = y - 9;
  rect(ctx, tx + 2, ty + 3, tw - 4, 6, '#5a3a24'); rect(ctx, tx + 3, ty + 4, 2, 3, '#f0d890'); rect(ctx, tx + tw - 5, ty + 4, 2, 3, '#f0d890');
  rect(ctx, tx - 1, ty + 2, tw + 2, 2, dark); rect(ctx, tx, ty + 1, tw, 1, col); px(ctx, tx - 2, ty + 1, dark); px(ctx, tx + tw + 1, ty + 1, dark);
  if (big) {
    rect(ctx, tx + 4, ty - 3, tw - 8, 4, '#5a3a24');
    rect(ctx, tx + 2, ty - 4, tw - 4, 2, dark); rect(ctx, tx + 3, ty - 5, tw - 6, 1, col); px(ctx, tx + 1, ty - 5, dark); px(ctx, tx + tw - 2, ty - 5, dark);
  }
  // 角樓
  rect(ctx, x - 2, y - 4, 4, 5, '#8a806c'); rect(ctx, x + w - 2, y - 4, 4, 5, '#8a806c');
  rect(ctx, x - 3, y - 5, 6, 1, dark); rect(ctx, x + w - 3, y - 5, 6, 1, dark);
  // 旗
  const fx = x + w + 2, fy = y - 14;
  rect(ctx, fx, fy, 1, 15, '#2b1d12');
  rect(ctx, fx + 1, fy, 7, 5, col); rect(ctx, fx + 1, fy + 5, 5, 1, col); px(ctx, fx + 7, fy + 4, col);
  rect(ctx, fx + 1, fy + 5, 6, 1, dark);
  px(ctx, fx + 3, fy + 2, owner ? '#fff6dc' : '#d8d0bc'); px(ctx, fx + 4, fy + 2, owner ? '#fff6dc' : '#d8d0bc');
}

// ---------- 標題畫面 ----------
export function drawTitleArt(ctx, t = 0) {
  const TW = 320, TH = 120;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < TH; y++) {
    const k = y / TH;
    for (let x = 0; x < TW; x += 1) {
      const d = bayer(x, y) * 0.06;
      const c = mix([236, 168, 96], [120, 52, 48], Math.min(1, k * 1.2 + d));
      if (x === 0 || hash(x, y, 9) > 0) { ctx.fillStyle = rgb(c); ctx.fillRect(x, y, 1, 1); }
    }
  }
  // 太陽與雲
  ctx.fillStyle = '#f8d878'; ctx.beginPath(); ctx.arc(236, 44, 19, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fbe8a8'; ctx.beginPath(); ctx.arc(236, 44, 14, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 5; i++) { const cx = (i * 71 + t / 90) % 360 - 30, cy = 20 + i * 7; rect(ctx, cx, cy, 30, 2, '#f8d8a8'); rect(ctx, cx + 6, cy - 2, 16, 2, '#f8d8a8'); }
  // 遠山（多層）
  const layers = [[58, '#a85a48', 4, 0.6], [70, '#7a3a34', 8, 0.8], [84, '#4a2226', 11, 1]];
  for (const [base, col, seed, amp] of layers) {
    for (let x = 0; x < TW; x++) {
      const h = base + (Math.sin(x / 19 + seed) * 7 + smooth(x, seed, 13, seed) * 18 - 9) * amp;
      rect(ctx, x, h, 1, TH - h, col);
      if (smooth(x, seed, 13, seed) > 0.7 && seed === 4) px(ctx, x, h, '#e8c8b0');
    }
  }
  // 城
  const cx = 58, cy = 72;
  rect(ctx, cx - 2, cy - 1, 76, 34, '#1e1010');
  rect(ctx, cx, cy, 72, 32, '#5a4036');
  for (let r = 3; r < 30; r += 4) for (let i = (r % 8 ? 0 : 3); i < 72; i += 6) rect(ctx, cx + i, cy + r, 4, 1, '#4a342c');
  for (let i = 0; i < 72; i += 6) rect(ctx, cx + i, cy - 4, 4, 4, '#1e1010');
  rect(ctx, cx + 28, cy + 14, 16, 18, '#140a08'); rect(ctx, cx + 30, cy + 16, 12, 16, '#2a1410');
  rect(ctx, cx + 14, cy - 15, 44, 12, '#1e1010'); rect(ctx, cx + 18, cy - 13, 6, 6, '#f0b860'); rect(ctx, cx + 48, cy - 13, 6, 6, '#f0b860');
  rect(ctx, cx + 8, cy - 18, 56, 3, '#7a1e18'); px(ctx, cx + 6, cy - 19, '#7a1e18'); px(ctx, cx + 65, cy - 19, '#7a1e18');
  rect(ctx, cx + 18, cy - 27, 36, 9, '#1e1010'); rect(ctx, cx + 24, cy - 25, 4, 4, '#f0b860'); rect(ctx, cx + 44, cy - 25, 4, 4, '#f0b860');
  rect(ctx, cx + 14, cy - 30, 44, 3, '#7a1e18'); px(ctx, cx + 12, cy - 31, '#7a1e18'); px(ctx, cx + 59, cy - 31, '#7a1e18');
  // 旗海與大軍
  const cols = ['#3b5dc9', '#3a9a4a', '#c8402f', '#d8a531', '#8a4fb0', '#e6e2d4', '#2f9c9c'];
  for (let i = 0; i < 14; i++) {
    const x = 150 + i * 12, y = 82 + (i % 3) * 5;
    rect(ctx, x, y - 20, 1, 26, '#140a08');
    const wv = Math.round(Math.sin(t / 220 + i * 0.7) * 1.4);
    const c = cols[i % cols.length];
    rect(ctx, x + 1, y - 20 + wv, 8, 6, c); rect(ctx, x + 1, y - 14 + wv, 6, 1, c); px(ctx, x + 8, y - 15 + wv, c);
    rect(ctx, x + 1, y - 20 + wv, 8, 1, shade(c, 0.4));
  }
  rect(ctx, 0, 104, TW, 16, '#1e100c');
  for (let i = 0; i < 52; i++) {
    const x = 132 + i * 3.6 | 0, y = 100 + (i % 3) * 2;
    rect(ctx, x, y, 2, 5, '#0e0806'); rect(ctx, x, y - 2, 2, 2, '#c89a70'); rect(ctx, x + 1, y - 9, 1, 8, '#b8b8c0'); px(ctx, x + 1, y - 10, '#f0f0f0');
  }
}

// ---------- 武將頭像（48×48） ----------
const portraitCache = new Map();
const PS = 48;
export function portrait(g, factionId) {
  const key = `${g.id}:${factionId || ''}`;
  if (portraitCache.has(key)) return portraitCache.get(key);
  const url = drawPortrait(g, facColor(factionId), facDark(factionId)).toDataURL();
  portraitCache.set(key, url);
  return url;
}
export function pixelPortrait(g, factionId) {
  const key = `${g.id}:${factionId || ''}`;
  const cv = document.createElement('canvas');
  cv.width = PS; cv.height = PS;
  const ctx = cv.getContext('2d');
  const r = k => hash(g.id, k, 77);
  const look = g.look || '';
  const col = facColor(factionId), dark = facDark(factionId);
  const old = look.includes('o'), young = look.includes('y');
  const helm = look.includes('h'), scholar = look.includes('s');
  const armored = helm || g.str >= 80;

  // 背景：勢力色漸層 + 抖動
  const bgA = hex(col), bgB = [40, 26, 18];
  for (let y = 0; y < PS; y++) for (let x = 0; x < PS; x++) {
    const d = Math.hypot(x - 24, y - 18) / 34 + bayer(x, y) * 0.18;
    ctx.fillStyle = rgb(mix(mix(bgA, [232, 217, 176], 0.55), bgB, Math.min(1, Math.max(0, d - 0.15))));
    ctx.fillRect(x, y, 1, 1);
  }
  // 雲紋
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 3; i++) { const yy = 8 + i * 12; for (let x = 0; x < PS; x++) if (Math.sin(x / 3 + i) > 0.6) px(ctx, x, yy + Math.round(Math.sin(x / 5 + i) * 2), '#fff6dc'); }
  ctx.globalAlpha = 1;

  // 膚色
  const skins = [['#f2cfa6', '#d9a87e', '#fbe2c4'], ['#e8bb8c', '#c8946a', '#f6d2a8'], ['#d8a274', '#b47e54', '#ecbc90'], ['#c88e62', '#a06c44', '#dca67a']];
  let [skin, skinS, skinH] = skins[Math.floor(r(1) * skins.length)];
  if (look.includes('r')) [skin, skinS, skinH] = ['#b8483a', '#8a2e24', '#d06a58'];
  const hair = old ? '#c8c4bc' : '#1c1410', hairH = old ? '#ecebe6' : '#4a3a30';

  // 肩與身體
  const fx = 15 + Math.floor(r(2) * 2), fw = 18 - Math.floor(r(2) * 2) * 2 + (g.str > 90 ? 2 : 0);
  const cxm = 24;
  if (armored) {
    // 甲冑：鱗片
    rect(ctx, 4, 37, 40, 11, '#3a3a44');
    rect(ctx, 2, 40, 44, 8, '#3a3a44');
    for (let y = 38; y < 48; y += 2) for (let x = 3 + (y % 4 ? 0 : 1); x < 46; x += 3) { px(ctx, x, y, '#8a8a98'); px(ctx, x + 1, y, '#5a5a66'); }
    rect(ctx, 2, 39, 8, 3, col); rect(ctx, 38, 39, 8, 3, col); // 肩甲飾邊
    rect(ctx, 2, 42, 8, 1, dark); rect(ctx, 38, 42, 8, 1, dark);
    rect(ctx, 18, 36, 12, 12, col); rect(ctx, 20, 38, 8, 8, shade(col, 0.2)); // 胸前護心
    rect(ctx, 22, 40, 4, 4, '#d8b048'); px(ctx, 22, 40, '#f8e088');
  } else {
    // 交領長袍
    rect(ctx, 4, 37, 40, 11, col);
    rect(ctx, 2, 41, 44, 7, col);
    for (let y = 38; y < 48; y++) { px(ctx, 10 + (y % 3), y, dark); px(ctx, 37 - (y % 3), y, dark); }
    for (let i = 0; i < 11; i++) { px(ctx, 18 + i, 36 + i, '#f0e8d0'); px(ctx, 19 + i, 36 + i, '#f0e8d0'); px(ctx, 30 - i, 36 + i, '#d8ccb0'); }
    rect(ctx, 4, 37, 40, 1, shade(col, 0.25));
  }
  // 頸
  rect(ctx, 20, 31, 8, 6, skinS); rect(ctx, 21, 31, 6, 5, skin);

  // 臉
  const fy = 12;
  rect(ctx, fx, fy + 2, fw, 15, skin);
  rect(ctx, fx + 1, fy + 1, fw - 2, 1, skin);
  rect(ctx, fx + 1, fy + 17, fw - 2, 1, skin);
  rect(ctx, fx + 3, fy + 18, fw - 6, 2, skin);
  rect(ctx, fx + 5, fy + 20, fw - 10, 1, skin);
  // 陰影（右側）與高光（左額）
  rect(ctx, fx + fw - 3, fy + 3, 3, 14, skinS); rect(ctx, fx + fw - 5, fy + 17, 3, 2, skinS);
  rect(ctx, fx + 2, fy + 3, 3, 2, skinH);
  // 耳
  rect(ctx, fx - 2, fy + 8, 2, 4, skin); px(ctx, fx - 2, fy + 11, skinS);
  rect(ctx, fx + fw, fy + 8, 2, 4, skinS);
  // 眉眼
  const ey = fy + 8 + Math.floor(r(3) * 2);
  const eL = fx + 3, eR = fx + fw - 7;
  const fierce = g.str >= 85, wise = g.int >= 85;
  const brow = old ? '#e4e2dc' : '#1c1410';
  if (fierce) {
    rect(ctx, eL - 1, ey - 3, 5, 1, brow); px(ctx, eL + 3, ey - 2, brow); px(ctx, eL + 4, ey - 2, brow);
    rect(ctx, eR, ey - 3, 5, 1, brow); px(ctx, eR - 1, ey - 2, brow); px(ctx, eR, ey - 2, brow);
  } else {
    rect(ctx, eL, ey - 3, 4, 1, brow); rect(ctx, eR, ey - 3, 4, 1, brow);
    if (wise) { px(ctx, eL - 1, ey - 2, brow); px(ctx, eR + 4, ey - 2, brow); }
  }
  for (const ex of [eL, eR]) {
    rect(ctx, ex, ey, 4, 2, '#f8f4ec');
    rect(ctx, ex + (ex === eL ? 2 : 1), ey, 2, 2, '#1c1410');
    rect(ctx, ex, ey - 1, 4, 1, skinS);
    if (wise) rect(ctx, ex, ey + 2, 4, 1, skinS);
  }
  if (fierce) { px(ctx, eL, ey, skinS); px(ctx, eR + 3, ey, skinS); }
  // 鼻
  rect(ctx, cxm - 1, ey + 2, 1, 4, skinS); px(ctx, cxm - 2, ey + 6, skinS); px(ctx, cxm + 1, ey + 6, skinS); px(ctx, cxm, ey + 5, skinH);
  // 嘴
  const my = ey + 9;
  rect(ctx, cxm - 3, my, 6, 1, look.includes('r') ? '#5a1810' : '#8a4a3a');
  if (old) { px(ctx, fx + 3, my - 2, skinS); px(ctx, fx + fw - 4, my - 2, skinS); }

  // 鬍鬚
  if (!young) {
    if (look.includes('l')) {
      rect(ctx, cxm - 6, my - 1, 4, 1, hair); rect(ctx, cxm + 2, my - 1, 4, 1, hair); px(ctx, cxm - 7, my, hair); px(ctx, cxm + 6, my, hair);
      for (let i = 0; i < 18; i++) { const w = Math.max(1, 7 - Math.floor(i / 3)); rect(ctx, cxm - (w >> 1) - 1, my + 2 + i, w + 1, 1, hair); if (i % 3 === 0) px(ctx, cxm - 1, my + 2 + i, hairH); }
      rect(ctx, cxm - 3, my + 1, 6, 1, hair);
    } else if (look.includes('b')) {
      for (let y = my - 2; y < my + 9; y++) for (let x = fx; x < fx + fw; x++) {
        const inMouth = y === my && Math.abs(x - cxm) < 3;
        if (!inMouth && (y > my - 2 || Math.abs(x - cxm) > 3) && hash(x, y, g.id) > 0.15) px(ctx, x, y, hash(x, y, 5) > 0.8 ? hairH : hair);
      }
      for (let x = fx + 1; x < fx + fw - 1; x += 2) px(ctx, x, my + 9 + (x % 3 === 0 ? 1 : 0), hair);
      rect(ctx, cxm - 2, my, 4, 1, '#5a1810');
    } else if (r(4) > 0.3) {
      rect(ctx, cxm - 4, my - 1, 3, 1, hair); rect(ctx, cxm + 1, my - 1, 3, 1, hair); px(ctx, cxm - 5, my, hair); px(ctx, cxm + 4, my, hair);
      if (r(5) > 0.45) { rect(ctx, cxm - 1, my + 2, 2, 4, hair); px(ctx, cxm - 1, my + 6, hair); }
    }
  }

  // 頭頂
  if (helm) {
    const hc = '#6a6a78', hl = '#a8a8b8', hd = '#3a3a46';
    rect(ctx, fx - 2, fy - 4, fw + 4, 7, hc);
    rect(ctx, fx, fy - 6, fw, 2, hc); rect(ctx, fx + 3, fy - 7, fw - 6, 1, hc);
    rect(ctx, fx, fy - 5, 4, 3, hl);
    rect(ctx, fx - 2, fy + 3, fw + 4, 1, hd);
    rect(ctx, fx - 3, fy + 2, fw + 6, 1, '#c8a040'); // 額飾
    rect(ctx, cxm - 2, fy - 3, 4, 4, '#c8a040'); px(ctx, cxm - 1, fy - 2, '#f8e088');
    rect(ctx, fx - 4, fy + 3, 3, 10, hc); rect(ctx, fx + fw + 1, fy + 3, 3, 10, hd); // 護頰
    for (let i = 4; i < 13; i += 2) { px(ctx, fx - 3, fy + i, hl); px(ctx, fx + fw + 2, fy + i, '#5a5a66'); }
    // 盔纓
    rect(ctx, cxm - 1, fy - 10, 2, 4, '#c8a040');
    for (let i = 0; i < 7; i++) rect(ctx, cxm - 3 + Math.round(Math.sin(i) * 1), fy - 16 + i, 6 - (i > 4 ? 2 : 0), 1, i % 2 ? col : shade(col, 0.3));
  } else if (scholar) {
    rect(ctx, fx, fy - 1, fw, 4, hair); rect(ctx, fx + 1, fy - 2, fw - 2, 1, hair); rect(ctx, fx + 2, fy, 4, 1, hairH);
    rect(ctx, fx - 1, fy + 2, 2, 7, hair); rect(ctx, fx + fw - 1, fy + 2, 2, 7, hair);
    // 進賢冠
    rect(ctx, cxm - 5, fy - 9, 10, 8, '#1c1410');
    rect(ctx, cxm - 6, fy - 2, 12, 2, '#2a201a');
    rect(ctx, cxm - 4, fy - 8, 3, 1, '#4a3a30');
    rect(ctx, cxm - 9, fy - 9, 18, 1, '#1c1410'); rect(ctx, cxm - 10, fy - 10, 2, 1, '#1c1410'); rect(ctx, cxm + 8, fy - 10, 2, 1, '#1c1410');
    px(ctx, cxm, fy - 5, '#c8a040');
  } else {
    // 髮髻與頭巾
    rect(ctx, fx - 1, fy - 2, fw + 2, 5, hair); rect(ctx, fx + 1, fy - 3, fw - 2, 1, hair);
    rect(ctx, fx + 2, fy - 2, 5, 1, hairH);
    rect(ctx, fx - 1, fy + 3, 2, 8, hair); rect(ctx, fx + fw - 1, fy + 3, 2, 8, hair);
    rect(ctx, cxm - 3, fy - 8, 6, 6, hair); rect(ctx, cxm - 2, fy - 7, 2, 2, hairH);
    rect(ctx, cxm - 4, fy - 4, 8, 2, young ? col : '#c8a040'); rect(ctx, cxm - 4, fy - 4, 8, 1, young ? shade(col, 0.3) : '#f0d070');
    if (young) { rect(ctx, cxm + 4, fy - 3, 3, 1, col); rect(ctx, cxm + 6, fy - 2, 1, 4, col); }
  }
  // 名將光暈（任一屬性 ≥ 95）
  if (Math.max(g.str, g.int, g.pol, g.cha) >= 95) {
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 48; i += 3) { px(ctx, i, 0, '#f8e088'); px(ctx, 0, i, '#f8e088'); px(ctx, 47, i, '#f8e088'); }
    ctx.globalAlpha = 1;
  }
  // 框
  rect(ctx, 0, 47, 48, 1, '#1c1410'); rect(ctx, 47, 0, 1, 48, '#1c1410');
  const url = cv.toDataURL();
  portraitCache.set(key, url);
  return url;
}

// ---------- 戰場（640×360） ----------
export const BF_W = 640, BF_H = 360;
export const LANE_Y = [44, 148, 252];
export const LANE_H = 96;
export const UNIT_X = { A: 150, D: 490 };
const TERRAIN_COL = { P: ['#86a656', '#7a9a4c', '#9ab866'], M: ['#8a7656', '#76644a', '#a08a66'], F: ['#4a7a3a', '#3e6a30', '#5a8a46'], R: ['#7a9a6a', '#6a8a5a', '#8aaa7a'] };

const bfCache = new Map();
export function drawBattlefield(ctx, b, season) {
  ctx.imageSmoothingEnabled = false;
  const key = b.terrain.join('') + season + (b.wall > 0 ? 'w' : '');
  if (!bfCache.has(key)) {
    const cv = document.createElement('canvas'); cv.width = BF_W; cv.height = BF_H;
    const c2 = cv.getContext('2d');
    // 天空與遠山
    for (let y = 0; y < 44; y++) rect(c2, 0, y, BF_W, 1, rgb(mix([214, 160, 108], [120, 80, 70], y / 44 + bayer(0, y) * 0.05)));
    for (let x = 0; x < BF_W; x++) { const h = 22 + Math.sin(x / 37) * 6 + smooth(x, 2, 23, 3) * 14; rect(c2, x, h, 1, 44 - h, '#5a3a32'); }
    for (let l = 0; l < 3; l++) {
      const t = b.terrain[l], [c1, cB, cH] = TERRAIN_COL[t].map(hex);
      const y0 = LANE_Y[l];
      const img = c2.createImageData(BF_W, LANE_H);
      for (let y = 0; y < LANE_H; y++) for (let x = 0; x < BF_W; x++) {
        const n = smooth(x, y + l * 200, 18, 40 + l) + bayer(x, y) * 0.25;
        let c = n > 0.68 ? cH : n < 0.32 ? cB : c1;
        if (season === 3) c = mix(c, [236, 240, 244], 0.55);
        if (season === 2 && t !== 'R') c = mix(c, [200, 150, 70], 0.3);
        const o = (y * BF_W + x) * 4;
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
      }
      c2.putImageData(img, 0, y0);
      // 地形裝飾
      for (let i = 0; i < 26; i++) {
        const x = Math.floor(hash(i, l, 51) * 600) + 20, y = y0 + 8 + Math.floor(hash(i, l, 52) * (LANE_H - 20));
        if (t === 'M') drawPeak(c2, x, y, hash(i, l, 53) > 0.6 ? 1 : 0, season);
        else if (t === 'F') { drawTree(c2, x, y, season); drawTree(c2, x + 6, y + 3, season); }
        else if (t === 'P') { px(c2, x, y, '#d8e898'); px(c2, x + 1, y - 1, '#c8d888'); }
      }
      if (t === 'R') {
        const ry = y0 + LANE_H / 2;
        for (let x = 0; x < BF_W; x++) { const yy = ry + Math.round(Math.sin(x / 40 + l) * 6); rect(c2, x, yy - 7, 1, 14, season === 3 ? '#b8d0e0' : '#4a84b8'); if ((x + l * 7) % 23 === 0) rect(c2, x, yy - 2, 5, 1, '#a8d0f0'); }
      }
      rect(c2, 0, y0 + LANE_H, BF_W, 8, '#2b1d12');
      rect(c2, 0, y0 + LANE_H + 3, BF_W, 1, '#4a3424');
    }
    if (b.wall > 0) {
      rect(c2, 604, 40, 36, 320, '#6a6050');
      for (let y = 40; y < 360; y += 6) for (let x = 606 + ((y / 6) % 2) * 4; x < 640; x += 8) rect(c2, x, y, 6, 1, '#4a4236');
      for (let y = 40; y < 360; y += 12) rect(c2, 598, y, 8, 8, '#7a705e');
      rect(c2, 600, 40, 2, 320, '#3a342a');
    }
    bfCache.set(key, cv);
  }
  ctx.drawImage(bfCache.get(key), 0, 0);
}

// 一支部隊：A 面向右，D 面向左
export function drawUnit(ctx, u, factionId, opts = {}) {
  const col = facColor(factionId), dark = facDark(factionId);
  const dir = u.side === 'A' ? 1 : -1;
  const baseX = UNIT_X[u.side] + (opts.dx || 0) * dir * 2;
  const y0 = LANE_Y[u.lane] + 14;
  const n = u.routed ? 0 : Math.max(1, Math.ceil((u.troops / Math.max(1, u.max)) * 12));
  if (!u.routed) {
    // 帥旗
    const fx = baseX - dir * 76;
    rect(ctx, fx, y0 - 6, 2, 62, '#2b1d12');
    const bx = dir > 0 ? fx + 2 : fx - 18;
    rect(ctx, bx, y0 - 6, 18, 22, col); rect(ctx, bx + 2, y0 - 4, 14, 18, dark);
    rect(ctx, bx, y0 - 6, 18, 2, shade(col, 0.3));
    for (let i = 0; i < 18; i += 4) rect(ctx, bx + i, y0 + 16, 2, 3, col);
    rect(ctx, bx + 5, y0 + 1, 8, 8, '#f4e8c8'); rect(ctx, bx + 7, y0 + 3, 4, 4, col);
    px(ctx, fx, y0 - 8, '#d8b048'); px(ctx, fx + 1, y0 - 8, '#d8b048');
  }
  for (let i = 0; i < n; i++) {
    const r = i % 3, c = Math.floor(i / 3);
    const x = baseX - dir * c * 20 + (r % 2) * dir * 8;
    const y = y0 + r * 26;
    drawSoldier(ctx, x, y, u.type, col, dark, dir, opts.flash);
  }
}

function drawSoldier(ctx, x, y, type, col, dark, dir, flash) {
  const W_ = '#ffffff';
  const skin = flash ? W_ : '#e8b88a', body = flash ? W_ : col, bodyD = flash ? W_ : dark, metal = flash ? W_ : '#9a9aa8';
  ctx.globalAlpha = 0.3; rect(ctx, x - 6, y + 20, 13, 2, '#000'); ctx.globalAlpha = 1;
  if (type === 'cav') {
    const hc = flash ? W_ : '#7a4a2a', hd = flash ? W_ : '#4a2a18';
    rect(ctx, x - 8, y + 10, 17, 7, hc); rect(ctx, x - 8, y + 15, 17, 2, hd);
    const hx = dir > 0 ? x + 7 : x - 11;
    rect(ctx, hx, y + 4, 5, 8, hc); rect(ctx, dir > 0 ? hx + 2 : hx - 2, y + 4, 5, 4, hc); px(ctx, dir > 0 ? hx + 5 : hx - 1, y + 5, '#1a0e08');
    rect(ctx, dir > 0 ? hx : hx + 4, y + 2, 1, 3, hd);
    for (const lx of [-7, -4, 4, 7]) rect(ctx, x + lx, y + 17, 2, 4, hd);
    rect(ctx, dir > 0 ? x - 10 : x + 9, y + 10, 2, 6, hd); // 尾
    rect(ctx, x - 5, y + 9, 9, 2, body); // 鞍布
    rect(ctx, x - 2, y, 5, 9, body); rect(ctx, x - 2, y + 6, 5, 2, bodyD);
    rect(ctx, x - 2, y - 5, 5, 5, skin); rect(ctx, x - 2, y - 6, 5, 2, metal); px(ctx, x, y - 8, body); px(ctx, x, y - 7, body);
    rect(ctx, dir > 0 ? x + 3 : x - 13, y + 2, 11, 1, '#8a6a3a'); rect(ctx, dir > 0 ? x + 13 : x - 15, y + 1, 3, 3, '#e8e8f0');
  } else {
    rect(ctx, x - 3, y + 2, 7, 10, body); rect(ctx, x - 3, y + 9, 7, 3, bodyD);
    rect(ctx, x - 3, y + 6, 7, 1, flash ? W_ : '#c8a040');
    rect(ctx, x - 2, y + 12, 2, 7, bodyD); rect(ctx, x + 1, y + 12, 2, 7, bodyD);
    rect(ctx, x - 2, y + 18, 2, 2, '#2b1d12'); rect(ctx, x + 1, y + 18, 2, 2, '#2b1d12');
    rect(ctx, x - 2, y - 4, 5, 6, skin); px(ctx, dir > 0 ? x + 2 : x - 2, y - 2, '#1c1410');
    rect(ctx, x - 3, y - 6, 7, 3, metal); px(ctx, x, y - 7, body);
    if (type === 'spear') {
      const sx = dir > 0 ? x + 5 : x - 5;
      rect(ctx, sx, y - 12, 1, 30, '#8a6a3a');
      rect(ctx, sx - 1, y - 16, 3, 4, '#e8e8f0'); px(ctx, sx, y - 17, '#ffffff');
      rect(ctx, sx - 1, y - 11, 3, 2, '#c8402f');
    } else {
      const bx = dir > 0 ? x + 5 : x - 5;
      for (let i = 0; i < 13; i++) { const off = Math.round(Math.sin(i / 12 * Math.PI) * 3); px(ctx, bx + off * dir, y - 2 + i, '#8a5a2a'); }
      rect(ctx, bx, y - 1, 1, 11, '#e8e0c8');
      rect(ctx, dir > 0 ? x - 5 : x + 4, y + 1, 2, 8, '#6a4a2a'); px(ctx, dir > 0 ? x - 5 : x + 4, y, '#f0f0f0');
    }
  }
}

export function drawFire(ctx, u, t) {
  const baseX = UNIT_X[u.side];
  const y0 = LANE_Y[u.lane] + 6;
  for (let i = 0; i < 46; i++) {
    const x = baseX - 60 + Math.floor(hash(i, t, 91) * 100), y = y0 + Math.floor(hash(i, t, 92) * 80);
    const s = 2 + Math.floor(hash(i, t, 93) * 3);
    rect(ctx, x, y, s, s * 2, i % 3 ? '#f08a2a' : '#f8d870');
    rect(ctx, x, y - 2, s, 2, '#c8402f');
  }
  ctx.globalAlpha = 0.25; rect(ctx, baseX - 70, y0, 140, 88, '#f06020'); ctx.globalAlpha = 1;
}

export function drawArrows(ctx, from, to, p) {
  const fx = UNIT_X[from.side] + 16 * (from.side === 'A' ? 1 : -1), tx = UNIT_X[to.side];
  const fy = LANE_Y[from.lane] + 30, ty = LANE_Y[to.lane] + 36;
  for (let i = 0; i < 7; i++) {
    const q = Math.min(1, Math.max(0, p - i * 0.06));
    if (q <= 0 || q >= 1) continue;
    const x = fx + (tx - fx) * q, y = fy + (ty - fy) * q - Math.sin(q * Math.PI) * 30 + (i % 3) * 8;
    const d = tx > fx ? 1 : -1;
    rect(ctx, Math.round(x), Math.round(y), 7 * d, 1, '#2b1d12'); px(ctx, Math.round(x + 7 * d), Math.round(y), '#e8e8f0');
  }
}
