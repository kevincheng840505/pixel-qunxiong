// 水墨戰場：以程式繪製的宣紙、墨色山水與六角格棋盤。
import { COLS, ROWS, tileAt, gateOpen, key } from './tactics.js';
import { facColor, facDark } from './art.js';

export const HR = 26;                       // 六角格半徑（邏輯像素）
export const HW = Math.sqrt(3) * HR;        // 六角格寬
export const BW = Math.ceil(HW * (COLS + 0.5)), BH = Math.ceil(HR * 1.5 * (ROWS - 1) + HR * 2);
export const SCALE = 2;

export function hexCenter(q, r) {
  return { x: HW * (q + 0.5 * (r & 1)) + HW / 2, y: HR + HR * 1.5 * r };
}
export function pixelToHex(x, y) {
  let best = null, bd = 1e9;
  const r0 = Math.round((y - HR) / (HR * 1.5));
  for (let r = r0 - 1; r <= r0 + 1; r++) for (let q = -1; q <= COLS; q++) {
    if (r < 0 || r >= ROWS || q < 0 || q >= COLS) continue;
    const c = hexCenter(q, r); const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bd) { bd = d; best = { q, r }; }
  }
  return bd < HR * HR * 1.1 ? best : null;
}

function hexPath(ctx, x, y, rad = HR) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    const px = x + rad * Math.cos(a), py = y + rad * Math.sin(a);
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function hrand(a, b, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const ink = a => `rgba(28,24,20,${a})`;

// ---------- 宣紙 ----------
let paperCache = null;
function paper() {
  if (paperCache) return paperCache;
  const cv = document.createElement('canvas');
  cv.width = BW * SCALE; cv.height = BH * SCALE;
  const c = cv.getContext('2d'); c.scale(SCALE, SCALE);
  const g = c.createRadialGradient(BW / 2, BH / 2, BH * 0.2, BW / 2, BH / 2, BW * 0.7);
  g.addColorStop(0, '#f1e9d4'); g.addColorStop(1, '#dccfae');
  c.fillStyle = g; c.fillRect(0, 0, BW, BH);
  // 纖維
  for (let i = 0; i < 2600; i++) {
    const x = hrand(i, 1) * BW, y = hrand(i, 2) * BH, l = 2 + hrand(i, 3) * 7, a = hrand(i, 4) * Math.PI;
    c.strokeStyle = hrand(i, 5) > 0.5 ? 'rgba(120,96,60,.07)' : 'rgba(255,255,245,.18)';
    c.lineWidth = 0.5;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  // 暈染斑
  for (let i = 0; i < 26; i++) {
    const x = hrand(i, 11) * BW, y = hrand(i, 12) * BH, rr = 20 + hrand(i, 13) * 70;
    const gg = c.createRadialGradient(x, y, 0, x, y, rr);
    gg.addColorStop(0, 'rgba(150,120,70,.06)'); gg.addColorStop(1, 'rgba(150,120,70,0)');
    c.fillStyle = gg; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  paperCache = cv;
  return cv;
}

// ---------- 地形筆觸 ----------
function wash(c, x, y, rx, ry, col, a) {
  const g = c.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0));
  c.save(); c.translate(x, y); c.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, Math.max(rx, ry), 0, Math.PI * 2); c.fill(); c.restore();
}

function drawGrass(c, x, y, q, r) {
  for (let i = 0; i < 3; i++) {
    if (hrand(q, r, i) > 0.45) continue;
    const gx = x + (hrand(q, r, i + 10) - 0.5) * HW * 0.8, gy = y + (hrand(q, r, i + 20) - 0.5) * HR * 1.1;
    c.strokeStyle = ink(0.22); c.lineWidth = 0.7;
    c.beginPath(); c.moveTo(gx - 3, gy); c.quadraticCurveTo(gx - 1, gy - 3, gx, gy - 5);
    c.moveTo(gx, gy); c.quadraticCurveTo(gx + 1, gy - 3, gx + 3, gy - 4); c.stroke();
  }
}

function drawTree(c, x, y, s, seed) {
  // 樹幹
  c.strokeStyle = ink(0.7); c.lineWidth = 1.1 * s;
  c.beginPath(); c.moveTo(x, y + 6 * s); c.quadraticCurveTo(x + 1 * s, y + 1 * s, x, y - 3 * s); c.stroke();
  // 墨點樹冠
  for (let i = 0; i < 9; i++) {
    const a = hrand(seed, i) * Math.PI * 2, d = hrand(seed, i + 30) * 6 * s;
    const px = x + Math.cos(a) * d, py = y - 5 * s + Math.sin(a) * d * 0.8;
    c.fillStyle = i % 3 ? ink(0.18 + hrand(seed, i + 50) * 0.35) : 'rgba(64,86,60,.35)';
    c.beginPath(); c.ellipse(px, py, 2.6 * s, 1.8 * s, a, 0, Math.PI * 2); c.fill();
  }
}

function drawForest(c, x, y, q, r) {
  wash(c, x, y + 2, HW * 0.5, HR * 0.55, 'rgba(70,96,66,A)', 0.28);
  const pts = [[-9, -4], [7, -6], [-2, 5], [10, 6], [-11, 8]];
  pts.forEach(([dx, dy], i) => { if (i < 4 || hrand(q, r, 9) > 0.5) drawTree(c, x + dx, y + dy, 0.9 + hrand(q, r, i) * 0.3, q * 31 + r * 7 + i); });
}

function drawHill(c, x, y, q, r) {
  const w = HW * 0.46, h = HR * 0.5;
  const g = c.createLinearGradient(x, y - h, x, y + h * 0.6);
  g.addColorStop(0, 'rgba(70,74,56,.42)'); g.addColorStop(1, 'rgba(110,104,70,0)');
  c.fillStyle = g;
  c.beginPath(); c.moveTo(x - w, y + h * 0.6);
  c.quadraticCurveTo(x - w * 0.4, y - h * 1.2, x + w * 0.1, y - h * 0.5);
  c.quadraticCurveTo(x + w * 0.5, y - h * 1.0, x + w, y + h * 0.6); c.closePath(); c.fill();
  c.strokeStyle = ink(0.55); c.lineWidth = 1.2; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x - w, y + h * 0.5); c.quadraticCurveTo(x - w * 0.4, y - h * 1.2, x + w * 0.1, y - h * 0.5); c.stroke();
  c.lineWidth = 0.8; c.strokeStyle = ink(0.35);
  c.beginPath(); c.moveTo(x - w * 0.05, y - h * 0.4); c.quadraticCurveTo(x + w * 0.5, y - h * 1.0, x + w * 0.95, y + h * 0.4); c.stroke();
  // 皴法短筆
  for (let i = 0; i < 4; i++) {
    const sx = x - w * 0.5 + hrand(q, r, i) * w, sy = y - h * 0.1 + hrand(q, r, i + 5) * h * 0.5;
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 3, sy + 4); c.stroke();
  }
}

function drawMountain(c, x, y, q, r) {
  const peaks = [[-6, 2, 0.85], [6, 4, 0.7], [0, -2, 1.05]];
  for (const [dx, dy, k] of peaks) {
    const px = x + dx, py = y + dy, w = HW * 0.38 * k, h = HR * 1.05 * k;
    const g = c.createLinearGradient(px, py - h, px, py + h * 0.4);
    g.addColorStop(0, 'rgba(30,32,30,.82)'); g.addColorStop(0.55, 'rgba(70,74,66,.45)'); g.addColorStop(1, 'rgba(120,116,96,0)');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(px - w, py + h * 0.4);
    c.lineTo(px - w * 0.35, py - h * 0.45); c.lineTo(px - w * 0.1, py - h * 0.75); c.lineTo(px + w * 0.15, py - h * 0.55);
    c.lineTo(px + w, py + h * 0.4); c.closePath(); c.fill();
    c.strokeStyle = ink(0.85); c.lineWidth = 1.4; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(px - w, py + h * 0.35); c.lineTo(px - w * 0.35, py - h * 0.45); c.lineTo(px - w * 0.1, py - h * 0.75); c.stroke();
    c.lineWidth = 0.7; c.strokeStyle = ink(0.5);
    c.beginPath(); c.moveTo(px - w * 0.1, py - h * 0.75); c.lineTo(px + w * 0.15, py - h * 0.55); c.lineTo(px + w * 0.9, py + h * 0.3); c.stroke();
    // 皴
    c.strokeStyle = ink(0.4);
    for (let i = 0; i < 3; i++) { const sx = px - w * 0.3 + i * w * 0.25; c.beginPath(); c.moveTo(sx, py - h * 0.3 + i * 3); c.lineTo(sx + 2, py + h * 0.1); c.stroke(); }
  }
  // 山腳雲霧
  wash(c, x, y + HR * 0.55, HW * 0.55, HR * 0.22, 'rgba(244,238,222,A)', 0.9);
}

function drawRiverTile(c, x, y, q, r) {
  c.save(); hexPath(c, x, y, HR + 1.5);
  const g = c.createLinearGradient(x - HW / 2, y - HR, x + HW / 2, y + HR);
  g.addColorStop(0, 'rgba(96,130,140,.5)'); g.addColorStop(1, 'rgba(70,104,120,.6)');
  c.fillStyle = g; c.fill(); c.clip();
  c.strokeStyle = 'rgba(240,244,236,.55)'; c.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) {
    const yy = y - HR * 0.6 + i * HR * 0.4 + hrand(q, r, i) * 4;
    const xx = x - HW * 0.4 + hrand(q, r, i + 9) * HW * 0.3;
    c.beginPath(); c.moveTo(xx, yy); c.bezierCurveTo(xx + 5, yy - 2, xx + 9, yy + 2, xx + 15, yy); c.stroke();
  }
  c.restore();
}

function drawInner(c, x, y, q, r) {
  c.save(); hexPath(c, x, y, HR + 0.6);
  c.fillStyle = 'rgba(176,150,110,.2)'; c.fill(); c.restore();
  if (hrand(q, r, 3) > 0.45) {
    // 民居：灰瓦屋頂
    const hx = x + (hrand(q, r, 4) - 0.5) * 10, hy = y + (hrand(q, r, 5) - 0.5) * 8;
    c.fillStyle = 'rgba(236,226,204,.95)'; c.fillRect(hx - 8, hy - 2, 16, 8);
    c.strokeStyle = ink(0.5); c.lineWidth = 0.7; c.strokeRect(hx - 8, hy - 2, 16, 8);
    c.fillStyle = ink(0.7);
    c.beginPath(); c.moveTo(hx - 11, hy - 1); c.quadraticCurveTo(hx, hy - 9, hx + 11, hy - 1); c.quadraticCurveTo(hx, hy - 5, hx - 11, hy - 1); c.fill();
    c.fillStyle = ink(0.55); c.fillRect(hx - 2, hy + 1, 4, 5);
  }
}

function drawRampart(c, pts) {
  if (pts.length < 2) return;
  const th = 15;
  const first = { x: pts[0].x, y: pts[0].y - HR }, last = { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y + HR };
  const P = [first, ...pts, last];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const ang = Math.atan2(b.y - a.y, b.x - a.x), len = Math.hypot(b.x - a.x, b.y - a.y);
    c.save(); c.translate(a.x, a.y); c.rotate(ang);
    // 牆身
    const g = c.createLinearGradient(0, -th / 2, 0, th / 2);
    g.addColorStop(0, '#5e564c'); g.addColorStop(0.45, '#958a7a'); g.addColorStop(1, '#6e665a');
    c.fillStyle = g; c.fillRect(-1, -th / 2, len + 2, th);
    c.strokeStyle = ink(0.28); c.lineWidth = 0.6;
    for (let k = 0; k < 3; k++) { const yy = -th / 2 + (k + 1) * th / 4; c.beginPath(); c.moveTo(0, yy); c.lineTo(len, yy); c.stroke(); }
    for (let xx = 4; xx < len; xx += 7) for (let k = 0; k < 4; k++) {
      const x0 = xx + (k % 2) * 3.5, y0 = -th / 2 + k * th / 4;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0, y0 + th / 4); c.stroke();
    }
    // 雉堞：朝西（攻方）一側；旋轉後的「左側」是 -y 或 +y 取決於方向，向下走時 +y 指向西
    c.fillStyle = '#4e463e';
    for (let xx = 2; xx < len - 2; xx += 6) c.fillRect(xx, th / 2, 3.5, 3);
    c.strokeStyle = ink(0.85); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(0, th / 2); c.lineTo(len, th / 2); c.moveTo(0, -th / 2); c.lineTo(len, -th / 2); c.stroke();
    c.restore();
  }
  // 角樓
  for (const p of pts.filter((_, i) => i % 3 === 1)) {
    c.fillStyle = '#7a7064'; c.fillRect(p.x - 6, p.y - 6, 12, 12);
    c.strokeStyle = ink(0.8); c.lineWidth = 1; c.strokeRect(p.x - 6, p.y - 6, 12, 12);
  }
}

function drawGate(c, x, y, open, hp) {
  const w = HW * 0.62, h = HR * 1.55;
  c.fillStyle = '#6a6258'; c.fillRect(x - w / 2, y - h / 2, w, h);
  if (!open) {
    c.fillStyle = '#8e2a1c'; c.fillRect(x - w / 2 + 3, y - 10, w - 6, 20);
    c.strokeStyle = '#3a120c'; c.lineWidth = 1; c.strokeRect(x - w / 2 + 3, y - 10, w - 6, 20);
    c.beginPath(); c.moveTo(x, y - 10); c.lineTo(x, y + 10); c.stroke();
    c.fillStyle = '#d8b060';
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { c.beginPath(); c.arc(x - 6 + j * 12, y - 6 + i * 6, 0.9, 0, 7); c.fill(); }
    if (hp < 0.5) { c.strokeStyle = ink(0.8); c.lineWidth = 1; c.beginPath(); c.moveTo(x - 6, y - 8); c.lineTo(x - 1, y - 1); c.lineTo(x - 5, y + 6); c.stroke(); }
  } else {
    c.fillStyle = '#2a1e16'; c.fillRect(x - w / 2 + 3, y - 10, w - 6, 20);
    c.fillStyle = '#6e2418';
    c.save(); c.translate(x - w / 2 + 2, y + 9); c.rotate(-0.5); c.fillRect(0, -3, 9, 3); c.restore();
    c.save(); c.translate(x + w / 2 - 3, y + 8); c.rotate(0.7); c.fillRect(-8, -3, 8, 3); c.restore();
  }
  // 城樓
  c.fillStyle = ink(0.88);
  c.beginPath(); c.moveTo(x - w / 2 - 6, y - 12); c.quadraticCurveTo(x, y - 24, x + w / 2 + 6, y - 12); c.quadraticCurveTo(x, y - 17, x - w / 2 - 6, y - 12); c.fill();
  c.fillStyle = '#8e2a1c'; c.fillRect(x - 7, y - 15, 2, 4); c.fillRect(x + 5, y - 15, 2, 4);
}

function drawKeep(c, x, y, owner) {
  // 台基
  c.fillStyle = '#b8a888'; c.fillRect(x - 17, y + 4, 34, 7);
  c.strokeStyle = ink(0.6); c.lineWidth = 0.8; c.strokeRect(x - 17, y + 4, 34, 7);
  // 殿身
  c.fillStyle = '#efe4c8'; c.fillRect(x - 13, y - 6, 26, 10);
  c.fillStyle = '#8e2a1c'; for (let i = 0; i < 4; i++) c.fillRect(x - 12 + i * 8, y - 6, 2, 10);
  // 重簷
  c.fillStyle = ink(0.9);
  for (const [yy, ww] of [[-6, 21], [-15, 15]]) {
    c.beginPath(); c.moveTo(x - ww, y + yy); c.quadraticCurveTo(x, y + yy - 11, x + ww, y + yy); c.quadraticCurveTo(x, y + yy - 5, x - ww, y + yy); c.fill();
  }
  c.fillStyle = '#efe4c8'; c.fillRect(x - 8, y - 15, 16, 5);
  // 旗
  c.strokeStyle = ink(0.9); c.lineWidth = 1;
  c.beginPath(); c.moveTo(x + 16, y + 4); c.lineTo(x + 16, y - 30); c.stroke();
  c.fillStyle = facColor(owner);
  c.beginPath(); c.moveTo(x + 16, y - 30); c.lineTo(x + 30, y - 27); c.lineTo(x + 27, y - 23); c.lineTo(x + 30, y - 19); c.lineTo(x + 16, y - 21); c.fill();
}

// 靜態底圖（每場戰鬥快取）
export function baseLayer(b) {
  if (b._base) return b._base;
  const cv = document.createElement('canvas');
  cv.width = BW * SCALE; cv.height = BH * SCALE;
  const c = cv.getContext('2d');
  c.drawImage(paper(), 0, 0);
  c.scale(SCALE, SCALE);
  const order = [];
  for (let r = 0; r < ROWS; r++) for (let q = 0; q < COLS; q++) order.push(tileAt(b, q, r));
  // 先畫水與城內等「平面」地形
  for (const t of order) {
    const { x, y } = hexCenter(t.q, t.r);
    if (t.t === 'river') drawRiverTile(c, x, y, t.q, t.r);
    if (t.t === 'inner' || t.t === 'keep') drawInner(c, x, y, t.q, t.r);
  }
  // 格線
  c.lineWidth = 0.6; c.strokeStyle = 'rgba(60,44,28,.16)';
  for (const t of order) { const { x, y } = hexCenter(t.q, t.r); hexPath(c, x, y); c.stroke(); }
  // 立體地形，由上往下畫以便遮擋
  for (const t of order) {
    const { x, y } = hexCenter(t.q, t.r);
    if (t.t === 'plain') drawGrass(c, x, y, t.q, t.r);
    else if (t.t === 'forest') drawForest(c, x, y, t.q, t.r);
    else if (t.t === 'hill') drawHill(c, x, y, t.q, t.r);
    else if (t.t === 'mountain') drawMountain(c, x, y, t.q, t.r);
  }
  drawRampart(c, order.filter(t => t.t === 'wall' || t.t === 'gate').sort((a, z) => a.r - z.r).map(t => hexCenter(t.q, t.r)));
  // 落款印
  c.fillStyle = 'rgba(179,38,30,.8)'; c.fillRect(6, BH - 30, 22, 22);
  c.fillStyle = '#f4e6c8'; c.font = 'bold 9px serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const nm = (b.cityName || '').slice(0, 2);
  c.fillText(nm[0] || '', 17, BH - 24); c.fillText(nm[1] || '戰', 17, BH - 14);
  b._base = cv;
  return cv;
}

// ---------- 部隊棋子 ----------
const imgCache = new Map();
export function imgOf(src, onload) {
  if (!src) return null;
  let im = imgCache.get(src);
  if (!im) { im = new Image(); im.onload = () => onload && onload(); im.src = src; imgCache.set(src, im); }
  return im.complete && im.naturalWidth ? im : null;
}

const TYPE_GLYPH = { spear: '槍', cav: '騎', bow: '弓', siege: '車' };

export function drawToken(c, u, fid, x, y, o = {}) {
  const rad = HR * 0.74;
  c.save();
  // 投影
  c.fillStyle = 'rgba(20,14,8,.35)'; c.beginPath(); c.ellipse(x + 1.5, y + rad * 0.85, rad * 0.9, rad * 0.32, 0, 0, Math.PI * 2); c.fill();
  if (o.sel) {
    c.strokeStyle = `rgba(242,218,142,${0.6 + 0.4 * Math.sin(o.t / 160)})`; c.lineWidth = 3;
    c.beginPath(); c.arc(x, y, rad + 4, 0, Math.PI * 2); c.stroke();
  }
  // 底盤
  c.fillStyle = '#f3ead2'; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
  if (o.img) {
    c.save(); c.beginPath(); c.arc(x, y, rad - 2.5, 0, Math.PI * 2); c.clip();
    c.drawImage(o.img, x - rad + 2.5, y - rad + 2.5, (rad - 2.5) * 2, (rad - 2.5) * 2);
    c.restore();
  } else {
    c.fillStyle = facDark(fid); c.font = `900 ${rad}px "Noto Serif TC", serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(TYPE_GLYPH[u.type], x, y + 1);
  }
  // 勢力環
  c.strokeStyle = facColor(fid); c.lineWidth = 3;
  c.beginPath(); c.arc(x, y, rad - 1, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = 'rgba(20,14,8,.9)'; c.lineWidth = 1;
  c.beginPath(); c.arc(x, y, rad + 0.6, 0, Math.PI * 2); c.stroke();
  // 已行動：淡墨罩
  if (o.done) { c.fillStyle = 'rgba(60,52,40,.45)'; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill(); }
  if (o.flash) { c.fillStyle = 'rgba(200,30,20,.45)'; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill(); }
  // 兵種印
  const sx = x + rad * 0.55, sy = y + rad * 0.5;
  c.fillStyle = u.side === 'A' ? '#b3261e' : '#2e4a5e';
  c.fillRect(sx - 6, sy - 6, 12, 12);
  c.strokeStyle = '#f4e6c8'; c.lineWidth = 0.6; c.strokeRect(sx - 5, sy - 5, 10, 10);
  c.fillStyle = '#f8eed6'; c.font = '900 8.5px "Noto Serif TC", serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(TYPE_GLYPH[u.type], sx, sy + 0.5);
  // 兵力條
  const bw = rad * 1.7, by = y - rad - 6;
  c.fillStyle = 'rgba(20,14,8,.75)'; c.fillRect(x - bw / 2 - 1, by - 1, bw + 2, 5);
  const p = Math.max(0, Math.min(1, u.troops / u.max));
  c.fillStyle = p > 0.5 ? '#c9a24a' : p > 0.25 ? '#d07a2a' : '#c0301e';
  c.fillRect(x - bw / 2, by, bw * p, 3);
  // 混亂
  if (u.conf) {
    c.strokeStyle = '#7a4aa0'; c.lineWidth = 1.4;
    c.beginPath(); for (let i = 0; i < 20; i++) { const a = i / 3 + o.t / 200, rr = i * 0.5; c.lineTo(x - rad * 0.6 + Math.cos(a) * rr, y - rad * 0.5 + Math.sin(a) * rr); } c.stroke();
  }
  c.restore();
}

// ---------- 主繪製 ----------
// v: { sel, reach:Set(keys), attack:Set(keys), tactic:Set(keys), hover, pos:{id:{x,y}}, flash:Set(ids), arrows:[{x1,y1,x2,y2,p}], t, imgFor(u) }
export function drawTactical(ctx, b, v) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(baseLayer(b), 0, 0);
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  // 城門與本陣（會變化）
  for (const k in b.gateHp) {
    const [q, r] = k.split(',').map(Number); const { x, y } = hexCenter(q, r);
    drawGate(ctx, x, y, gateOpen(b, q, r), b.gateHp[k] / b.gateMax);
  }
  if (b.keep) { const { x, y } = hexCenter(b.keep.q, b.keep.r); drawKeep(ctx, x, y, b.def); }
  // 高亮
  const hl = (set, fill, stroke) => {
    if (!set) return;
    for (const k of set) {
      const [q, r] = k.split(',').map(Number); const { x, y } = hexCenter(q, r);
      hexPath(ctx, x, y, HR - 1.5); ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke();
    }
  };
  hl(v.reach, 'rgba(255,252,240,.38)', 'rgba(40,70,100,.6)');
  hl(v.attack, 'rgba(179,38,30,.26)', 'rgba(179,38,30,.85)');
  hl(v.tactic, 'rgba(110,60,150,.24)', 'rgba(110,60,150,.85)');
  if (v.target) hl(new Set([v.target]), 'rgba(179,38,30,.45)', '#7a1a12');
  // 火
  for (const t of b.tiles) if (t.fire) drawFlame(ctx, hexCenter(t.q, t.r), v.t, t.q * 7 + t.r);
  // 部隊：由上而下排序
  const units = b.units.filter(u => !u.dead).map(u => ({ u, p: v.pos[u.id] || hexCenter(u.q, u.r) })).sort((a, c) => a.p.y - c.p.y);
  for (const { u, p } of units) {
    const fid = u.side === 'A' ? b.atk : b.def;
    drawToken(ctx, u, fid, p.x, p.y, { sel: v.sel === u.id, done: u.acted && u.side === v.side && !b.over, flash: v.flash.has(u.id), img: v.imgFor(u), t: v.t });
  }
  for (const a of v.arrows) drawArrow(ctx, a);
}

function drawFlame(c, { x, y }, t, seed) {
  for (let i = 0; i < 5; i++) {
    const ph = t / 120 + i * 1.3 + seed;
    const fx = x - 12 + i * 6, fy = y + 6;
    const h = 12 + Math.sin(ph) * 4 + (i % 2) * 5;
    const g = c.createLinearGradient(fx, fy, fx, fy - h);
    g.addColorStop(0, 'rgba(190,40,20,.85)'); g.addColorStop(0.6, 'rgba(230,120,30,.7)'); g.addColorStop(1, 'rgba(250,210,90,0)');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(fx - 4, fy); c.quadraticCurveTo(fx - 3, fy - h * 0.6, fx + Math.sin(ph) * 2, fy - h); c.quadraticCurveTo(fx + 4, fy - h * 0.5, fx + 4, fy); c.fill();
  }
  c.fillStyle = 'rgba(40,30,24,.18)'; c.beginPath(); c.arc(x, y - 16, 8 + Math.sin(t / 300) * 2, 0, 7); c.fill();
}

function drawArrow(c, a) {
  // 拋物線箭雨
  const n = 5;
  for (let i = 0; i < n; i++) {
    const p = Math.max(0, Math.min(1, a.p - i * 0.06));
    if (p <= 0 || p >= 1) continue;
    const ox = (i - 2) * 3, oy = (i % 2) * 3;
    const x = a.x1 + (a.x2 - a.x1) * p + ox, y = a.y1 + (a.y2 - a.y1) * p - Math.sin(p * Math.PI) * 30 + oy;
    const p2 = Math.max(0, p - 0.05);
    const x0 = a.x1 + (a.x2 - a.x1) * p2 + ox, y0 = a.y1 + (a.y2 - a.y1) * p2 - Math.sin(p2 * Math.PI) * 30 + oy;
    c.strokeStyle = ink(0.85); c.lineWidth = 1;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x, y); c.stroke();
  }
}
