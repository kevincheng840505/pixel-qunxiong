// 像素美術：全部以程式繪製，不使用任何外部素材。
import { FACTIONS, NEUTRAL_COLOR, ROADS, CITIES } from './data.js';

export const MAP_W = 320, MAP_H = 180;
export const facColor = id => (FACTIONS.find(f => f.id === id) || {}).color || NEUTRAL_COLOR;
export const facDark = id => (FACTIONS.find(f => f.id === id) || {}).dark || '#5a5246';

function hash(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 982451653) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smooth(x, y, s, seed) {
  const x0 = Math.floor(x / s), y0 = Math.floor(y / s), fx = x / s - x0, fy = y / s - y0;
  const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed), c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }

// ---------- 地圖 ----------
const COAST = [[0, 318], [28, 316], [32, 286], [60, 284], [64, 312], [96, 314], [100, 302], [140, 300], [146, 290], [180, 286]];
function coastX(y) {
  for (let i = 0; i < COAST.length - 1; i++) {
    const [y0, x0] = COAST[i], [y1, x1] = COAST[i + 1];
    if (y >= y0 && y <= y1) return x0 + (x1 - x0) * ((y - y0) / Math.max(1, y1 - y0));
  }
  return 290;
}
const RIVERS = [
  [[30, 58], [70, 72], [100, 86], [128, 90], [150, 86], [172, 84], [200, 80], [222, 74], [246, 62], [286, 54]],
  [[10, 148], [50, 152], [90, 158], [124, 168], [150, 166], [178, 162], [196, 154], [226, 152], [262, 150], [292, 142]],
  [[56, 128], [90, 134], [124, 140], [150, 148], [176, 152], [196, 154]],
];
const MOUNTAIN_ZONES = [
  { x: 176, y: 26, w: 26, h: 44 }, { x: 50, y: 106, w: 92, h: 14 }, { x: 196, y: 140, w: 30, h: 10 },
  { x: 20, y: 70, w: 40, h: 50 }, { x: 110, y: 20, w: 40, h: 30 }, { x: 30, y: 160, w: 70, h: 20 },
];

const SEASON_LAND = [
  { base: [120, 168, 84], alt: [98, 146, 70], hi: [150, 190, 100] },
  { base: [88, 146, 68], alt: [70, 124, 56], hi: [120, 170, 84] },
  { base: [176, 150, 80], alt: [150, 122, 64], hi: [200, 176, 100] },
  { base: [206, 210, 214], alt: [176, 182, 190], hi: [236, 238, 240] },
];

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

const terrainCache = {};
function terrainLayer(season) {
  if (terrainCache[season]) return terrainCache[season];
  const cv = document.createElement('canvas');
  cv.width = MAP_W; cv.height = MAP_H;
  const ctx = cv.getContext('2d');
  const pal = SEASON_LAND[season];
  const img = ctx.createImageData(MAP_W, MAP_H);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const i = (y * MAP_W + x) * 4;
    const n = smooth(x, y, 14, 3) * 0.7 + smooth(x, y, 5, 9) * 0.3;
    const cx = coastX(y) + (smooth(x, y, 6, 5) - 0.5) * 6;
    let c;
    if (x > cx) {
      const deep = x > cx + 6;
      c = deep ? [52, 92, 140] : [74, 120, 164];
      if (((x + y * 3) % 11 === 0) && hash(x, y, 2) > 0.5) c = [110, 150, 190];
    } else if (x > cx - 2) {
      c = [214, 196, 140];
    } else {
      c = n > 0.62 ? pal.hi : n < 0.38 ? pal.alt : pal.base;
      if (hash(x, y, 7) > 0.985) c = pal.alt;
    }
    img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // 河流
  const water = season === 3 ? '#9cc4e0' : '#4a86c0';
  for (const r of RIVERS) {
    for (let k = 0; k < r.length - 1; k++) {
      const [x0, y0] = r[k], [x1, y1] = r[k + 1];
      lineCells(x0, y0, x1, y1, (x, y) => { rect(ctx, x, y, 2, 2, water); });
    }
  }
  // 山
  for (const z of MOUNTAIN_ZONES) {
    for (let y = z.y; y < z.y + z.h; y += 5) for (let x = z.x; x < z.x + z.w; x += 7) {
      const jx = x + Math.floor(hash(x, y, 11) * 4), jy = y + Math.floor(hash(x, y, 12) * 3);
      if (hash(x, y, 13) < 0.25) continue;
      drawMountain(ctx, jx, jy, season);
    }
  }
  // 林
  for (let i = 0; i < 160; i++) {
    const x = Math.floor(hash(i, 1, 21) * 280), y = 110 + Math.floor(hash(i, 2, 21) * 70);
    if (x > coastX(y) - 4) continue;
    drawTree(ctx, x, y, season);
  }
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(hash(i, 3, 23) * 280), y = 10 + Math.floor(hash(i, 4, 23) * 100);
    if (x > coastX(y) - 4) continue;
    drawTree(ctx, x, y, season);
  }
  terrainCache[season] = cv;
  return cv;
}

function drawMountain(ctx, x, y, season) {
  const dark = season === 3 ? '#8a8f98' : '#6b5a44', light = season === 3 ? '#f4f6f8' : '#9a845e', snow = '#f4f4f0';
  for (let r = 0; r < 4; r++) {
    for (let c = -r; c <= r; c++) px(ctx, x + 3 + c, y + r, c < 0 ? light : dark);
  }
  px(ctx, x + 3, y, (season === 3 || season === 0) ? snow : light);
}
function drawTree(ctx, x, y, season) {
  const leaf = ['#3f7a3a', '#2f6a2e', '#b86a2a', '#e8eef0'][season];
  rect(ctx, x, y, 3, 2, leaf); px(ctx, x + 1, y - 1, leaf); px(ctx, x + 1, y + 2, '#5a3e24');
}

export function drawMap(ctx, s, opts = {}) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(terrainLayer(s.season), 0, 0);
  // 道路
  for (const [a, b] of ROADS) {
    const A = CITIES[a - 1], B = CITIES[b - 1];
    const hl = opts.routes && opts.routes.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
    lineCells(A.x, A.y, B.x, B.y, (x, y, i) => {
      if (hl) { rect(ctx, x, y, 2, 2, (i >> 1) % 2 ? '#c8402f' : '#f4d070'); }
      else if (i % 3 !== 2) px(ctx, x, y, '#d8c08a');
    });
  }
  // 勢力範圍光暈
  for (const c of s.cities) {
    if (!c.owner) continue;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = facColor(c.owner);
    ctx.beginPath(); ctx.arc(c.x, c.y, 13, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const c of s.cities) drawCastle(ctx, c.x, c.y, c.owner, c.size, opts.selected === c.id, opts.targets && opts.targets.includes(c.id));
}

export function drawCastle(ctx, cx, cy, owner, size, selected, targeted) {
  const big = size === '大', pass = size === '關';
  const w = big ? 13 : pass ? 9 : 11, h = big ? 10 : 8;
  const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
  const col = facColor(owner), dark = facDark(owner);
  if (selected) { rect(ctx, x - 3, y - 4, w + 6, h + 7, '#fff4c0'); }
  if (targeted) { rect(ctx, x - 3, y - 4, w + 6, h + 7, '#c8402f'); }
  rect(ctx, x - 1, y + 2, w + 2, h - 1, '#2b2118');
  rect(ctx, x, y + 3, w, h - 3, '#c8c0b0');
  for (let i = 0; i < w; i += 2) px(ctx, x + i, y + 2, '#c8c0b0');
  rect(ctx, x + Math.floor(w / 2) - 1, y + h - 3, 3, 3, '#3a2a1a');
  // 樓
  rect(ctx, x + 2, y - 1, w - 4, 3, dark);
  rect(ctx, x + 1, y - 2, w - 2, 1, col);
  rect(ctx, x + 3, y - 3, w - 6, 1, col);
  // 旗
  rect(ctx, x + w - 1, y - 6, 1, 6, '#2b2118');
  rect(ctx, x + w, y - 6, 3, 2, col);
}

// ---------- 標題畫面 ----------
export function drawTitleArt(ctx, t = 0) {
  const W = 320, H = 120;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < H; y++) {
    const k = y / H;
    rect(ctx, 0, y, W, 1, `rgb(${Math.round(232 - k * 60)},${Math.round(150 - k * 70)},${Math.round(90 - k * 30)})`);
  }
  // 太陽
  ctx.fillStyle = '#f4d070'; ctx.beginPath(); ctx.arc(240, 46, 18, 0, Math.PI * 2); ctx.fill();
  // 遠山
  for (let x = 0; x < W; x++) {
    const h1 = 60 + Math.sin(x / 23) * 10 + smooth(x, 0, 9, 4) * 14;
    rect(ctx, x, h1, 1, H - h1, '#7a4a3a');
    const h2 = 80 + Math.sin(x / 31 + 2) * 8 + smooth(x, 1, 7, 8) * 10;
    rect(ctx, x, h2, 1, H - h2, '#4a2e28');
  }
  // 城
  const cx = 70, cy = 72;
  rect(ctx, cx, cy, 60, 30, '#2b2118');
  rect(ctx, cx + 2, cy + 2, 56, 26, '#5a4636');
  for (let i = 0; i < 60; i += 6) rect(ctx, cx + i, cy - 3, 4, 3, '#2b2118');
  rect(ctx, cx + 24, cy + 14, 12, 16, '#1a120c');
  rect(ctx, cx + 12, cy - 14, 36, 11, '#2b2118');
  rect(ctx, cx + 8, cy - 17, 44, 3, '#8a2a20');
  rect(ctx, cx + 14, cy - 22, 32, 5, '#2b2118');
  rect(ctx, cx + 11, cy - 24, 38, 2, '#8a2a20');
  // 旗海
  const cols = ['#3b5dc9', '#3a9a4a', '#c8402f', '#d8a531', '#8a4fb0', '#e6e2d4'];
  for (let i = 0; i < 12; i++) {
    const x = 150 + i * 13, y = 86 + (i % 3) * 5;
    rect(ctx, x, y - 16, 1, 22, '#1a120c');
    const wave = Math.round(Math.sin(t / 200 + i) * 1);
    rect(ctx, x + 1, y - 16 + wave, 7, 5, cols[i % cols.length]);
    rect(ctx, x + 1, y - 11 + wave, 5, 1, cols[i % cols.length]);
  }
  // 地面
  rect(ctx, 0, 104, W, 16, '#2b1a14');
  for (let i = 0; i < 40; i++) {
    const x = 140 + i * 4 + (i % 2) * 2, y = 100 + (i % 3);
    rect(ctx, x, y, 2, 4, '#1a100c'); px(ctx, x, y - 1, '#e8b88a'); rect(ctx, x + 1, y - 7, 1, 7, '#cfcfcf');
  }
}

// ---------- 武將頭像 ----------
const portraitCache = new Map();
export function portrait(g, factionId) {
  const key = `${g.id}:${factionId || ''}`;
  if (portraitCache.has(key)) return portraitCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 32;
  const ctx = cv.getContext('2d');
  const r = k => hash(g.id, k, 77);
  const look = g.look || '';
  const col = facColor(factionId), dark = facDark(factionId);
  // 背景
  rect(ctx, 0, 0, 32, 32, '#e8d9b0');
  for (let y = 0; y < 32; y += 2) for (let x = (y / 2) % 2; x < 32; x += 2) px(ctx, x, y, '#ddcb9c');
  const skins = ['#f0c8a0', '#e8b88a', '#d8a478', '#c89068'];
  let skin = skins[Math.floor(r(1) * skins.length)];
  if (look.includes('r')) skin = '#b8483a';
  const old = look.includes('o'), young = look.includes('y');
  const hairC = old ? '#b8b4ac' : '#1e1612';
  const fw = 10 + Math.floor(r(2) * 3); // 臉寬
  const fx = 16 - Math.floor(fw / 2), fy = 9;
  // 身體/衣甲
  const armored = look.includes('h') || g.str >= 80;
  rect(ctx, 5, 24, 22, 8, armored ? '#6a6a72' : col);
  rect(ctx, 7, 23, 18, 2, armored ? '#8a8a94' : col);
  if (armored) { rect(ctx, 9, 25, 14, 7, col); rect(ctx, 13, 24, 6, 8, '#a8a8b0'); }
  else { rect(ctx, 14, 23, 4, 9, '#f0e8d0'); px(ctx, 15, 27, dark); }
  rect(ctx, 14, 21, 4, 3, skin); // 頸
  // 臉
  rect(ctx, fx, fy, fw, 13, skin);
  rect(ctx, fx + 1, fy + 13, fw - 2, 1, skin);
  px(ctx, fx - 1, fy + 5, skin); px(ctx, fx + fw, fy + 5, skin); // 耳
  // 眼與眉
  const ey = fy + 5 + Math.floor(r(3) * 2);
  const eyeL = fx + 2, eyeR = fx + fw - 4;
  rect(ctx, eyeL, ey, 2, 1, '#1e1612'); rect(ctx, eyeR, ey, 2, 1, '#1e1612');
  const browC = old ? '#d8d4cc' : '#1e1612';
  const fierce = g.str > 85;
  rect(ctx, eyeL - (fierce ? 1 : 0), ey - 2 + (fierce ? 0 : 0), 3, 1, browC);
  rect(ctx, eyeR, ey - 2, 3, 1, browC);
  if (fierce) { px(ctx, eyeL + 2, ey - 1, browC); px(ctx, eyeR - 1, ey - 1, browC); }
  // 鼻、嘴
  px(ctx, 16, ey + 3, '#a07050');
  rect(ctx, 15, ey + 5, 3, 1, look.includes('r') ? '#6a1a12' : '#8a4a3a');
  // 鬍鬚
  if (!young) {
    if (look.includes('l')) { // 長鬚
      rect(ctx, fx + 2, ey + 4, fw - 4, 1, hairC);
      rect(ctx, 14, ey + 6, 5, 6, hairC); rect(ctx, 15, ey + 12, 3, 4, hairC);
      px(ctx, 16, ey + 16, hairC);
    } else if (look.includes('b')) { // 虬髯
      rect(ctx, fx, ey + 3, fw, 6, hairC); rect(ctx, fx + 1, ey + 9, fw - 2, 2, hairC);
      rect(ctx, 15, ey + 5, 3, 1, '#6a2a1a');
      for (let i = 0; i < fw; i += 2) px(ctx, fx + i, ey + 11, hairC);
    } else if (r(4) > 0.35) {
      rect(ctx, 14, ey + 4, 5, 1, hairC);
      if (r(5) > 0.5) rect(ctx, 15, ey + 7, 3, 2, hairC);
    }
  }
  // 頭頂
  if (look.includes('h')) { // 盔
    rect(ctx, fx - 1, fy - 3, fw + 2, 5, '#7a7a84');
    rect(ctx, fx - 1, fy + 1, fw + 2, 1, '#4a4a54');
    rect(ctx, fx - 2, fy + 2, 2, 6, '#7a7a84'); rect(ctx, fx + fw, fy + 2, 2, 6, '#7a7a84');
    rect(ctx, 15, fy - 6, 2, 3, '#c8a040');
    rect(ctx, 14, fy - 9, 4, 3, col);
  } else if (look.includes('s')) { // 冠
    rect(ctx, fx, fy - 1, fw, 3, hairC);
    rect(ctx, 13, fy - 6, 6, 5, '#1e1612');
    rect(ctx, 11, fy - 6, 10, 1, '#1e1612');
    px(ctx, 16, fy - 3, '#c8a040');
  } else { // 髻
    rect(ctx, fx, fy - 1, fw, 3, hairC);
    rect(ctx, fx - 1, fy, 1, 5, hairC); rect(ctx, fx + fw, fy, 1, 5, hairC);
    rect(ctx, 14, fy - 4, 4, 3, hairC);
    rect(ctx, 13, fy - 2, 6, 1, young ? col : '#c8a040');
  }
  // 框
  ctx.strokeStyle = '#2b2118'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, 31, 31);
  const url = cv.toDataURL();
  portraitCache.set(key, url);
  return url;
}

// ---------- 戰場 ----------
export const BF_W = 320, BF_H = 180;
export const LANE_Y = [22, 74, 126];
export const LANE_H = 48;
const TERRAIN_COL = { P: ['#8aa85a', '#7a9850'], M: ['#8a7a5a', '#6e6046'], F: ['#4e7a3e', '#3e6a32'], R: ['#6a9ab8', '#5a8aa8'] };

export function drawBattlefield(ctx, b, season) {
  ctx.imageSmoothingEnabled = false;
  rect(ctx, 0, 0, BF_W, BF_H, '#2b2118');
  rect(ctx, 0, 0, BF_W, 20, '#3a2a1e');
  for (let l = 0; l < 3; l++) {
    const t = b.terrain[l], [c1, c2] = TERRAIN_COL[t];
    const y0 = LANE_Y[l];
    for (let y = y0; y < y0 + LANE_H; y++) for (let x = 0; x < BF_W; x++) {
      const h = hash(x >> 1, y >> 1, l + 40);
      px(ctx, x, y, h > 0.8 ? c2 : c1);
    }
    if (season === 3) { ctx.globalAlpha = 0.35; rect(ctx, 0, y0, BF_W, LANE_H, '#f4f6f8'); ctx.globalAlpha = 1; }
    // 裝飾
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(hash(i, l, 51) * 300) + 10, y = y0 + 4 + Math.floor(hash(i, l, 52) * (LANE_H - 10));
      if (t === 'M') drawMountain(ctx, x, y, season);
      else if (t === 'F') drawTree(ctx, x, y, season);
      else if (t === 'R') { rect(ctx, x, y, 6, 1, '#9cc4e0'); }
      else px(ctx, x, y, '#c8d890');
    }
    rect(ctx, 0, y0 + LANE_H, BF_W, 4, '#2b2118');
  }
  // 城牆（守方）
  if (b.wall > 0) {
    rect(ctx, 304, 20, 16, 160, '#5a5246');
    for (let y = 20; y < 180; y += 6) rect(ctx, 302, y, 3, 4, '#7a7266');
    rect(ctx, 310, 20, 2, 160, '#3a342c');
  }
}

// 畫一支部隊：side A 面向右，D 面向左
export function drawUnit(ctx, u, factionId, opts = {}) {
  const col = facColor(factionId), dark = facDark(factionId);
  const dir = u.side === 'A' ? 1 : -1;
  const baseX = (u.side === 'A' ? 70 : 250) + (opts.dx || 0) * dir;
  const y0 = LANE_Y[u.lane] + 6;
  const n = u.routed ? 0 : Math.max(1, Math.ceil((u.troops / Math.max(1, u.max)) * 9));
  // 帥旗
  if (!u.routed) {
    const fx = baseX - dir * 34;
    rect(ctx, fx, y0 - 2, 1, 26, '#2b2118');
    rect(ctx, dir > 0 ? fx + 1 : fx - 8, y0 - 2, 8, 8, col);
    rect(ctx, dir > 0 ? fx + 2 : fx - 7, y0 - 1, 6, 6, dark);
    rect(ctx, dir > 0 ? fx + 4 : fx - 5, y0 + 1, 2, 2, '#f4e8c8');
  }
  for (let i = 0; i < n; i++) {
    const r = i % 3, c = Math.floor(i / 3);
    const x = baseX - dir * c * 11 + (r % 2) * dir * 4;
    const y = y0 + r * 13;
    drawSoldier(ctx, x, y, u.type, col, dark, dir, opts.flash);
  }
}

function drawSoldier(ctx, x, y, type, col, dark, dir, flash) {
  const skin = flash ? '#ffffff' : '#e8b88a';
  const body = flash ? '#ffffff' : col;
  if (type === 'cav') {
    const horse = flash ? '#ffffff' : '#7a4a2a';
    rect(ctx, x - 4, y + 6, 9, 4, horse);
    rect(ctx, dir > 0 ? x + 4 : x - 6, y + 3, 3, 4, horse);
    px(ctx, dir > 0 ? x + 6 : x - 6, y + 3, '#2b2118');
    rect(ctx, x - 3, y + 10, 1, 3, horse); rect(ctx, x + 3, y + 10, 1, 3, horse);
    rect(ctx, x - 1, y + 1, 3, 5, body);
    rect(ctx, x - 1, y - 2, 3, 3, skin);
    rect(ctx, x - 1, y - 3, 3, 1, dark);
    rect(ctx, dir > 0 ? x + 2 : x - 6, y + 1, 5, 1, '#d8d8d8');
  } else {
    rect(ctx, x - 1, y + 2, 3, 6, body);
    rect(ctx, x - 1, y + 8, 1, 3, dark); rect(ctx, x + 1, y + 8, 1, 3, dark);
    rect(ctx, x - 1, y - 1, 3, 3, skin);
    rect(ctx, x - 1, y - 2, 3, 1, dark);
    if (type === 'spear') {
      rect(ctx, dir > 0 ? x + 2 : x - 2, y - 5, 1, 13, '#8a6a3a');
      px(ctx, dir > 0 ? x + 2 : x - 2, y - 6, '#e0e0e0');
    } else {
      const bx = dir > 0 ? x + 3 : x - 3;
      px(ctx, bx, y + 1, '#8a5a2a'); px(ctx, bx + dir, y + 2, '#8a5a2a'); px(ctx, bx + dir, y + 3, '#8a5a2a'); px(ctx, bx + dir, y + 4, '#8a5a2a'); px(ctx, bx, y + 5, '#8a5a2a');
    }
  }
}

export function drawFire(ctx, u, t) {
  const baseX = u.side === 'A' ? 70 : 250;
  const y0 = LANE_Y[u.lane] + 4;
  for (let i = 0; i < 26; i++) {
    const x = baseX - 22 + Math.floor(hash(i, t, 91) * 44), y = y0 + Math.floor(hash(i, t, 92) * 40);
    rect(ctx, x, y, 2, 3, i % 3 ? '#f08a2a' : '#f4d070');
    px(ctx, x, y - 1, '#c8402f');
  }
}

export function drawArrows(ctx, from, to, p) {
  const fx = from.side === 'A' ? 80 : 240, tx = to.side === 'A' ? 80 : 240;
  const fy = LANE_Y[from.lane] + 22, ty = LANE_Y[to.lane] + 22;
  for (let i = 0; i < 4; i++) {
    const q = Math.min(1, Math.max(0, p - i * 0.08));
    const x = fx + (tx - fx) * q, y = fy + (ty - fy) * q - Math.sin(q * Math.PI) * 10 + i * 3;
    rect(ctx, Math.round(x), Math.round(y), 3, 1, '#2b2118');
  }
}
