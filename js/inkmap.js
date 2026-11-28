// 水墨古地圖：宣紙、淡墨山勢、青綠設色、河海紋、城郭關隘港口。邏輯座標 480×300，可平移縮放。
import { FACTIONS, CITIES, EDGES } from './data.js';
import { MAP_W, MAP_H, hash, smooth, isSea, riverPaths, LAKES, COAST, elevation } from './geo.js';
import { facColor, facDark } from './art.js';

export const MK = 4;                      // 底圖倍率：1920×1200
const W = MAP_W * MK, H = MAP_H * MK;
const ink = a => `rgba(30,24,18,${a})`;

const SEASON_TINT = [
  { land: 'rgba(120,160,90,A)', peak: 'rgba(60,120,110,A)', snow: 0 },
  { land: 'rgba(90,140,70,A)', peak: 'rgba(40,100,96,A)', snow: 0 },
  { land: 'rgba(190,140,60,A)', peak: 'rgba(150,90,40,A)', snow: 0 },
  { land: 'rgba(150,170,190,A)', peak: 'rgba(110,130,150,A)', snow: 1 },
];

// ---------- 底圖（依季節快取） ----------
const baseCache = {};
function baseLayer(season) {
  if (baseCache[season]) return baseCache[season];
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const pg = c.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.7);
  pg.addColorStop(0, '#f2ead4'); pg.addColorStop(1, '#d9caa4');
  c.fillStyle = pg; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    const x = hash(i, 1, 3) * W, y = hash(i, 2, 3) * H, l = 3 + hash(i, 3, 3) * 10, a = hash(i, 4, 3) * Math.PI;
    c.strokeStyle = hash(i, 5, 3) > 0.5 ? 'rgba(120,96,60,.06)' : 'rgba(255,255,245,.2)'; c.lineWidth = 0.7;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  c.scale(MK, MK);
  const T = SEASON_TINT[season];
  // 地勢墨暈
  const gw = 240, gh = 150;
  const mk = () => { const cv2 = document.createElement('canvas'); cv2.width = gw; cv2.height = gh; return cv2; };
  const g = mk(), tint = mk();
  const gc = g.getContext('2d'), tc = tint.getContext('2d');
  const img = gc.createImageData(gw, gh), timg = tc.createImageData(gw, gh);
  const tcol = T.peak.match(/\d+/g).map(Number);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const lx = (x + 0.5) / gw * MAP_W, ly = (y + 0.5) / gh * MAP_H, o = (y * gw + x) * 4;
    if (isSea(lx, ly)) continue;
    const e = elevation(lx, ly);
    img.data[o] = 40; img.data[o + 1] = 36; img.data[o + 2] = 30; img.data[o + 3] = Math.max(0, Math.min(1, (e - 0.28) * 1.4)) * 150;
    timg.data[o] = tcol[0]; timg.data[o + 1] = tcol[1]; timg.data[o + 2] = tcol[2]; timg.data[o + 3] = Math.max(0, Math.min(1, (e - 0.35) * 2)) * (T.snow ? 60 : 110);
  }
  gc.putImageData(img, 0, 0); tc.putImageData(timg, 0, 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(g, 0, 0, MAP_W, MAP_H);
  c.drawImage(tint, 0, 0, MAP_W, MAP_H);
  for (let i = 0; i < 260; i++) {
    const x = hash(i, 7, 9) * MAP_W, y = hash(i, 8, 9) * MAP_H;
    if (isSea(x, y) || elevation(x, y) > 0.45) continue;
    const r = 8 + hash(i, 9, 9) * 18;
    const rg = c.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, T.land.replace('A', 0.12)); rg.addColorStop(1, T.land.replace('A', 0));
    c.fillStyle = rg; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 海
  c.save();
  c.beginPath(); COAST.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.lineTo(MAP_W + 5, MAP_H + 5); c.lineTo(MAP_W + 5, -5); c.closePath();
  const sg = c.createLinearGradient(380, 0, MAP_W, 0);
  sg.addColorStop(0, 'rgba(80,110,130,.38)'); sg.addColorStop(1, 'rgba(50,80,110,.55)');
  c.fillStyle = sg; c.fill(); c.clip();
  c.strokeStyle = 'rgba(40,60,80,.42)'; c.lineWidth = 0.25;
  for (let y = 2; y < MAP_H; y += 3.2) for (let x = 330 + ((y / 3.2) % 2) * 2.5; x < MAP_W; x += 5) {
    c.beginPath(); c.arc(x, y, 2.4, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
  }
  c.restore();
  c.strokeStyle = ink(0.8); c.lineWidth = 0.55;
  c.beginPath(); COAST.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
  // 湖
  for (const L of LAKES) {
    const [x, y] = L.x;
    c.fillStyle = 'rgba(80,110,130,.4)'; c.beginPath(); c.ellipse(x, y, L.rx, L.ry, 0.2, 0, 7); c.fill();
    c.strokeStyle = ink(0.6); c.lineWidth = 0.35; c.stroke();
    c.strokeStyle = 'rgba(40,60,80,.4)'; c.lineWidth = 0.2;
    for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(x - L.rx * 0.5, y + k * 1.5); c.quadraticCurveTo(x, y + k * 1.5 - 1, x + L.rx * 0.5, y + k * 1.5); c.stroke(); }
  }
  // 河
  for (const r of riverPaths) {
    const path = () => { c.beginPath(); r.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); };
    path(); c.strokeStyle = season === 3 ? 'rgba(150,170,190,.7)' : 'rgba(80,110,130,.55)'; c.lineWidth = r.w * 0.75; c.stroke();
    path(); c.strokeStyle = ink(0.7); c.lineWidth = 0.32; c.stroke();
    path(); c.strokeStyle = 'rgba(245,240,226,.5)'; c.lineWidth = r.w * 0.18; c.stroke();
  }
  // 山
  const peaks = [];
  for (let y = 3; y < MAP_H - 3; y += 4.5) for (let x = 3; x < MAP_W - 3; x += 5.5) {
    const jx = x + hash(x, y, 11) * 3, jy = y + hash(x, y, 12) * 2.5;
    const e = elevation(jx, jy);
    if (e > 0.62 && hash(x, y, 13) > 0.3 && !isSea(jx, jy + 3)) peaks.push([jx, jy, e]);
  }
  peaks.sort((a, b) => a[1] - b[1]).forEach(([x, y, e]) => drawPeak(c, x, y, e, T, season));
  // 林
  for (let y = 2; y < MAP_H; y += 3.2) for (let x = 2; x < MAP_W; x += 3.8) {
    const f = smooth(x * 2, y * 2, 40, 83);
    if (f < 0.66 || isSea(x, y) || elevation(x, y) > 0.6) continue;
    if (hash(x, y, 84) > (f - 0.6) * 2.2) continue;
    drawTree(c, x + hash(x, y, 85) * 2, y + hash(x, y, 86) * 1.5, season);
  }
  if (season === 3) for (let i = 0; i < 700; i++) {
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.beginPath(); c.arc(hash(i, 1, 99) * MAP_W, hash(i, 2, 99) * MAP_H, 0.25 + hash(i, 3, 99) * 0.35, 0, 7); c.fill();
  }
  // 題字
  c.fillStyle = ink(0.75); c.font = '900 8px "Noto Serif TC", "Songti TC", serif'; c.textAlign = 'center';
  ['漢', '末', '輿', '圖'].forEach((ch, i) => c.fillText(ch, 455, 196 + i * 9));
  c.fillStyle = 'rgba(179,38,30,.85)'; c.fillRect(449, 236, 12, 12);
  c.fillStyle = '#f4e6c8'; c.font = '900 5px serif'; c.fillText('群雄', 455, 241); c.fillText('逐鹿', 455, 246.5);
  baseCache[season] = cv;
  return cv;
}

function drawPeak(c, x, y, e, T, season) {
  const k = 0.7 + Math.min(1, (e - 0.6) * 1.5) * 0.7;
  const w = 4.2 * k, h = 5.5 * k;
  const g = c.createLinearGradient(x, y - h, x, y + 1);
  g.addColorStop(0, season === 3 ? 'rgba(250,252,255,.95)' : T.peak.replace('A', 0.55));
  g.addColorStop(0.6, 'rgba(60,58,50,.25)'); g.addColorStop(1, 'rgba(120,110,90,0)');
  c.fillStyle = g;
  c.beginPath(); c.moveTo(x - w, y + 1); c.quadraticCurveTo(x - w * 0.4, y - h * 0.5, x, y - h); c.quadraticCurveTo(x + w * 0.4, y - h * 0.5, x + w, y + 1); c.closePath(); c.fill();
  c.strokeStyle = ink(0.8); c.lineWidth = 0.35;
  c.beginPath(); c.moveTo(x - w, y + 1); c.quadraticCurveTo(x - w * 0.4, y - h * 0.5, x, y - h); c.stroke();
  c.strokeStyle = ink(0.45); c.lineWidth = 0.25;
  c.beginPath(); c.moveTo(x, y - h); c.quadraticCurveTo(x + w * 0.4, y - h * 0.5, x + w, y + 1); c.stroke();
  c.beginPath(); c.moveTo(x - w * 0.2, y - h * 0.55); c.lineTo(x - w * 0.45, y); c.moveTo(x + w * 0.1, y - h * 0.6); c.lineTo(x - w * 0.05, y - 0.5); c.stroke();
}
function drawTree(c, x, y, season) {
  const leaf = [ink(0.55), ink(0.6), 'rgba(140,70,30,.6)', ink(0.35)][season];
  c.strokeStyle = ink(0.6); c.lineWidth = 0.2;
  c.beginPath(); c.moveTo(x, y + 1.6); c.lineTo(x, y); c.stroke();
  c.fillStyle = leaf;
  for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(x + (hash(x, y, i) - 0.5) * 1.6, y - 0.4 + (hash(x, y, i + 5) - 0.5) * 1.2, 0.45, 0, 7); c.fill(); }
}

// ---------- 勢力範圍 ----------
const terrCache = { key: '', cv: null };
function territory(s) {
  const key = s.cities.map(c => c.owner || '-').join(',');
  if (terrCache.key === key) return terrCache.cv;
  const gw = MAP_W, gh = MAP_H;
  const own = new Int8Array(gw * gh).fill(-1);
  const ids = FACTIONS.map(f => f.id);
  const cities = s.cities.filter(c => c.kind === 'city');
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const lx = x + 0.5, ly = y + 0.5;
    if (isSea(lx, ly)) continue;
    let best = 1e9, bc = null;
    for (const c of cities) { const d = (c.x - lx) ** 2 + (c.y - ly) ** 2; if (d < best) { best = d; bc = c; } }
    if (best < 30 * 30 && bc.owner) own[y * gw + x] = ids.indexOf(bc.owner);
  }
  const fill = document.createElement('canvas'); fill.width = gw; fill.height = gh;
  const fc = fill.getContext('2d'); const img = fc.createImageData(gw, gh);
  for (let i = 0; i < gw * gh; i++) {
    const o = own[i]; if (o < 0) continue;
    const col = facColor(FACTIONS[o].id).match(/\w\w/g).map(h => parseInt(h, 16));
    img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 60;
  }
  fc.putImageData(img, 0, 0);
  const cv = terrCache.cv || document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, W, H);
  c.imageSmoothingEnabled = true; c.filter = 'blur(6px)';
  c.drawImage(fill, 0, 0, W, H);
  c.filter = 'none';
  c.save(); c.scale(MK, MK);
  c.fillStyle = 'rgba(60,30,20,.65)';
  for (let y = 0; y < gh - 1; y++) for (let x = 0; x < gw - 1; x++) {
    const o = own[y * gw + x], r = own[y * gw + x + 1], d = own[(y + 1) * gw + x];
    if (o < 0) continue;
    if (r !== o && r >= 0 && y % 2 === 0) c.fillRect(x + 0.8, y + 0.2, 0.45, 0.8);
    if (d !== o && d >= 0 && x % 2 === 0) c.fillRect(x + 0.2, y + 0.8, 0.8, 0.45);
  }
  c.restore();
  terrCache.key = key; terrCache.cv = cv;
  return cv;
}

// ---------- 視角 ----------
// view: { x, y, z }：螢幕像素 = (邏輯座標 - (x,y)) * z
export function clampView(v, cw, ch) {
  const zMin = Math.max(cw / MAP_W, ch / MAP_H);
  v.z = Math.max(zMin, Math.min(zMin * 5, v.z));
  v.x = Math.max(0, Math.min(MAP_W - cw / v.z, v.x));
  v.y = Math.max(0, Math.min(MAP_H - ch / v.z, v.y));
  return v;
}

// ---------- 主繪製 ----------
// opts: { selected, targets:[ids], routes:[[a,b]], armies:[{id,x,y,fid,name,troops,sel,path:[[x,y]...]}], pick:Set(ids) }
export function drawInkMap(ctx, s, view, opts = {}) {
  const cw = ctx.canvas.width, ch = ctx.canvas.height, dpr = opts.dpr || 1;
  const z = view.z * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#d9caa4'; ctx.fillRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = true;
  const sx = view.x * MK, sy = view.y * MK, sw = cw / z * MK, sh = ch / z * MK;
  ctx.drawImage(baseLayer(s.season), sx, sy, sw, sh, 0, 0, cw, ch);
  ctx.drawImage(territory(s), sx, sy, sw, sh, 0, 0, cw, ch);
  ctx.setTransform(z, 0, 0, z, -view.x * z, -view.y * z);
  ctx.lineCap = 'round';
  // 道路與水路
  for (const [a, b, type] of EDGES) {
    const A = CITIES[a - 1], B = CITIES[b - 1];
    const hl = opts.routes && opts.routes.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
    const mx = (A.x + B.x) / 2 + (hash(a, b, 1) - 0.5) * 4, my = (A.y + B.y) / 2 + (hash(a, b, 2) - 0.5) * 4;
    ctx.beginPath(); ctx.moveTo(A.x, A.y);
    if (type === 'water') ctx.lineTo(B.x, B.y); else ctx.quadraticCurveTo(mx, my, B.x, B.y);
    if (hl) { ctx.setLineDash([]); ctx.strokeStyle = 'rgba(179,38,30,.9)'; ctx.lineWidth = 1.1; }
    else if (type === 'water') { ctx.setLineDash([0.6, 1.4]); ctx.strokeStyle = 'rgba(30,70,110,.75)'; ctx.lineWidth = 0.6; }
    else { ctx.setLineDash([1.6, 1.2]); ctx.strokeStyle = 'rgba(80,52,30,.55)'; ctx.lineWidth = 0.45; }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const now = opts.t || 0;
  // 據點
  const sorted = [...s.cities].sort((a, b) => a.y - b.y);
  for (const c of sorted) {
    if (opts.pick && opts.pick.has(c.id)) {
      ctx.fillStyle = 'rgba(179,38,30,.18)'; ctx.beginPath(); ctx.arc(c.x, c.y, 6.5, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(179,38,30,.8)'; ctx.lineWidth = 0.5; ctx.setLineDash([1, 0.8]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (opts.hover === c.id) {
      const rg = ctx.createRadialGradient(c.x, c.y, 1, c.x, c.y, 9);
      rg.addColorStop(0, 'rgba(255,226,140,.55)'); rg.addColorStop(1, 'rgba(255,226,140,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(c.x, c.y, 9, 0, 7); ctx.fill();
    }
    drawNode(ctx, c, opts.selected === c.id, opts.targets && opts.targets.includes(c.id), now);
  }
  if (opts.night) nightLights(ctx, s, opts, now);
  // 行軍路線：發光、流動
  for (const a of opts.armies || []) if (a.path && a.path.length >= 2) drawRoute(ctx, a, now, opts.night);
  // 戰火
  for (const f of opts.fx || []) drawFx(ctx, f, now);
  // 部隊
  for (const a of opts.armies || []) drawArmy(ctx, a, now, opts.night);
  // 雲霧與天候（螢幕上方飄過）
  drawMist(ctx, view, cw / z, ch / z, now, opts.night);
  drawWeather(ctx, view, cw / z, ch / z, now, s.season, opts.night);
}

const TERRAIN_COLOR = { plain: '#6f8f4e', hill: '#a88a4a', forest: '#3f6b45', marsh: '#5c7c80', mountain: '#6b5440', plank: '#8a2f22', water: '#2f5f8a' };
// 部隊路線：外層光暈＋流動虛線＋終點脈動
function drawRoute(c, a, now, night) {
  const col = a.mine ? [255, 138, 60] : a.threat ? [226, 52, 36] : hexRgb(facColor(a.fid));
  const al = a.sel || a.mine || a.threat ? 1 : 0.45;
  const line = () => { c.beginPath(); a.path.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); };
  c.lineJoin = 'round';
  // 選取時路線依地形上色（平原、山地、棧道、渡河……）
  if (a.terr) {
    c.lineCap = 'butt';
    for (const sg of a.terr) {
      if (sg.cross) continue;
      c.beginPath(); c.moveTo(sg.x1, sg.y1); c.lineTo(sg.x2, sg.y2);
      c.strokeStyle = 'rgba(250,244,228,.85)'; c.lineWidth = 2.6; c.stroke();
      c.strokeStyle = TERRAIN_COLOR[sg.t] || '#6f8f4e'; c.lineWidth = 1.8; c.stroke();
    }
    for (const sg of a.terr) if (sg.cross) {
      c.fillStyle = sg.cross.ford ? 'rgba(60,110,160,.95)' : 'rgba(30,60,110,.95)';
      c.strokeStyle = '#f6eed8'; c.lineWidth = 0.35;
      c.beginPath(); c.arc(sg.x1, sg.y1, sg.cross.ford ? 1.1 : 1.5, 0, 7); c.fill(); c.stroke();
    }
    c.lineCap = 'round';
  }
  line(); c.strokeStyle = `rgba(${col},${(night ? 0.32 : 0.2) * al})`; c.lineWidth = a.sel ? 3.2 : 2.2; c.stroke();
  line(); c.strokeStyle = `rgba(${col},${0.85 * al})`; c.lineWidth = a.sel ? 0.9 : 0.6; c.stroke();
  line(); c.setLineDash([1.4, 2.6]); c.lineDashOffset = -now * 0.006;
  c.strokeStyle = `rgba(255,${night ? 240 : 236},${night ? 200 : 190},${0.95 * al})`; c.lineWidth = a.sel ? 0.7 : 0.45; c.stroke();
  c.setLineDash([]); c.lineDashOffset = 0;
  const [ex, ey] = a.path[a.path.length - 1];
  const ph = (now / 1100 + a.id * 0.37) % 1;
  c.strokeStyle = `rgba(${col},${(1 - ph) * al})`; c.lineWidth = 0.5;
  c.beginPath(); c.arc(ex, ey, 2 + ph * 6, 0, 7); c.stroke();
  c.strokeStyle = `rgba(${col},${0.95 * al})`; c.lineWidth = 0.6;
  c.beginPath(); c.moveTo(ex - 1.6, ey - 1.6); c.lineTo(ex + 1.6, ey + 1.6); c.moveTo(ex + 1.6, ey - 1.6); c.lineTo(ex - 1.6, ey + 1.6); c.stroke();
}
const hexRgb = h => (h.match(/\w\w/g) || ['88', '88', '88']).slice(0, 3).map(x => parseInt(x, 16)).join(',');

// 夜色：暗藍罩染，城郭燈火與營火
function nightLights(c, s, opts, now) {
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = 'rgb(70,84,130)'; c.fillRect(0, 0, c.canvas.width, c.canvas.height);
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = 'rgba(8,12,32,.25)'; c.fillRect(0, 0, c.canvas.width, c.canvas.height);
  c.restore();
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const n of s.cities) {
    const r = n.kind === 'city' ? (n.size === '大' ? 12 : n.size === '小' ? 7 : 9) : 5;
    const fl = 0.85 + Math.sin(now / 180 + n.id * 1.7) * 0.08 + Math.sin(now / 67 + n.id) * 0.05;
    const rg = c.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
    rg.addColorStop(0, `rgba(255,190,90,${0.55 * fl})`); rg.addColorStop(0.4, `rgba(220,120,40,${0.22 * fl})`); rg.addColorStop(1, 'rgba(200,90,20,0)');
    c.fillStyle = rg; c.beginPath(); c.arc(n.x, n.y, r, 0, 7); c.fill();
  }
  for (const a of opts.armies || []) {
    const fl = 0.8 + Math.sin(now / 90 + a.id * 2.3) * 0.2;
    const rg = c.createRadialGradient(a.x, a.y + 1, 0, a.x, a.y + 1, 6);
    rg.addColorStop(0, `rgba(255,150,60,${0.6 * fl})`); rg.addColorStop(1, 'rgba(255,100,30,0)');
    c.fillStyle = rg; c.beginPath(); c.arc(a.x, a.y + 1, 6, 0, 7); c.fill();
  }
  c.restore();
  // 窗燈
  for (const n of s.cities) {
    if (n.kind !== 'city') continue;
    const w = n.size === '大' ? 8 : n.size === '小' ? 5.5 : 6.5;
    for (let i = 0; i < 3; i++) {
      const on = Math.sin(now / 900 + n.id * 3 + i * 2.1) > -0.6;
      if (!on) continue;
      c.fillStyle = 'rgba(255,214,120,.95)';
      c.fillRect(n.x - w / 2 + 1 + i * (w - 2.4) / 2, n.y - 0.9, 0.55, 0.55);
    }
  }
}

// 戰火：擴散的赤色圓環與交叉雙刀，停留到月底
function drawFx(c, f, now) {
  const age = (now - f.t0) / 1000;
  if (age < 0) return;
  if (age < 1.6) {
    for (let k = 0; k < 2; k++) {
      const p = Math.min(1, (age - k * 0.3) / 1.2);
      if (p <= 0) continue;
      c.strokeStyle = `rgba(${f.kind === 'capture' ? '201,162,74' : '220,50,30'},${(1 - p) * 0.9})`; c.lineWidth = 0.8 * (1 - p) + 0.2;
      c.beginPath(); c.arc(f.x, f.y, 2 + p * 12, 0, 7); c.stroke();
    }
  }
  const al = Math.min(1, age * 3) * (f.fade ? Math.max(0, 1 - (now - f.fade) / 600) : 1);
  if (al <= 0) return;
  const x = f.x + 4.5, y = f.y - 7;
  c.fillStyle = `rgba(150,24,16,${0.9 * al})`; c.beginPath(); c.arc(x, y, 2.4, 0, 7); c.fill();
  c.strokeStyle = `rgba(255,236,200,${al})`; c.lineWidth = 0.45;
  c.beginPath(); c.moveTo(x - 1.3, y - 1.3); c.lineTo(x + 1.3, y + 1.3); c.moveTo(x + 1.3, y - 1.3); c.lineTo(x - 1.3, y + 1.3); c.stroke();
  c.lineWidth = 0.35; c.beginPath(); c.moveTo(x - 1.5, y + 0.6); c.lineTo(x - 0.6, y + 1.5); c.moveTo(x + 1.5, y + 0.6); c.lineTo(x + 0.6, y + 1.5); c.stroke();
}

// 緩緩飄過的雲霧
function drawMist(c, v, vw, vh, now, night) {
  for (let i = 0; i < 6; i++) {
    const sp = 0.0016 + hash(i, 3, 41) * 0.0014;
    const x = ((hash(i, 1, 41) * (MAP_W + 160) + now * sp) % (MAP_W + 160)) - 80;
    const y = 20 + hash(i, 2, 41) * (MAP_H - 40);
    const r = 34 + hash(i, 4, 41) * 30;
    if (x + r < v.x || x - r > v.x + vw || y + r < v.y || y - r > v.y + vh) continue;
    c.save(); c.translate(x, y); c.scale(1.8, 0.55);
    const rg = c.createRadialGradient(0, 0, 0, 0, 0, r);
    const col = night ? '170,180,210' : '255,252,240';
    rg.addColorStop(0, `rgba(${col},${night ? 0.1 : 0.22})`); rg.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = rg; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
    c.restore();
  }
}

// 天候粒子：春落花、秋落葉、冬飛雪、夏夜螢火
function drawWeather(c, v, vw, vh, now, season, night) {
  if (season === 1 && !night) return;
  const n = season === 3 ? 90 : season === 1 ? 26 : 34;
  for (let i = 0; i < n; i++) {
    const fx = hash(i, 5, 77), fy = hash(i, 6, 77), sp = 0.6 + hash(i, 7, 77) * 0.8;
    if (season === 1) {
      const x = v.x + fx * vw + Math.sin(now / 1300 + i) * 3, y = v.y + fy * vh + Math.cos(now / 1700 + i * 2) * 2;
      const a = Math.max(0, Math.sin(now / 500 + i * 1.3));
      c.fillStyle = `rgba(220,255,140,${a * 0.9})`; c.beginPath(); c.arc(x, y, 0.45, 0, 7); c.fill();
      continue;
    }
    const fall = (fy * vh + now * 0.006 * sp * (season === 3 ? 1 : 0.7)) % vh;
    const x = v.x + ((fx * vw + Math.sin(now / 900 * sp + i) * 4 + now * 0.002 * sp) % vw + vw) % vw, y = v.y + fall;
    if (season === 3) { c.fillStyle = `rgba(255,255,255,${0.55 + sp * 0.3})`; c.beginPath(); c.arc(x, y, 0.35 + sp * 0.25, 0, 7); c.fill(); }
    else {
      c.save(); c.translate(x, y); c.rotate(now / 600 * sp + i);
      c.fillStyle = season === 0 ? 'rgba(240,170,190,.85)' : 'rgba(190,96,40,.8)';
      c.beginPath(); c.ellipse(0, 0, 0.9, 0.45, 0, 0, 7); c.fill(); c.restore();
    }
  }
}

let NOW = 0;
function drawNode(c, n, selected, targeted, now = 0) {
  NOW = now;
  if (selected || targeted) {
    c.strokeStyle = selected ? 'rgba(201,162,74,.95)' : 'rgba(179,38,30,.9)'; c.lineWidth = selected ? 0.9 : 0.7;
    c.beginPath(); c.ellipse(n.x, n.y + 0.5, 7, 6, -0.1, 0.2, Math.PI * 2 - 0.1); c.stroke();
  }
  if (n.kind === 'pass') return drawPass(c, n);
  if (n.kind === 'port') return drawPort(c, n);
  drawTown(c, n);
}

function flag(c, x, y, owner, s = 1) {
  c.strokeStyle = ink(0.9); c.lineWidth = 0.3; c.beginPath(); c.moveTo(x, y + 5.5 * s); c.lineTo(x, y); c.stroke();
  c.fillStyle = owner ? facColor(owner) : '#9a9080';
  const w = Math.sin(NOW / 260 + x * 0.7) * 0.35 * s, w2 = Math.sin(NOW / 260 + x * 0.7 - 1.2) * 0.35 * s;
  c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 1.7 * s, y + w2, x + 3.4 * s, y + 0.4 * s + w); c.lineTo(x + 2.6 * s, y + 1.3 * s + w); c.lineTo(x + 3.4 * s, y + 2.2 * s + w); c.quadraticCurveTo(x + 1.7 * s, y + 2.2 * s + w2, x, y + 2.2 * s); c.fill();
  c.strokeStyle = owner ? facDark(owner) : '#5a5246'; c.lineWidth = 0.2; c.stroke();
}

function drawTown(c, city) {
  const { x, y, size, owner } = city;
  const big = size === '大', small = size === '小';
  const w = big ? 8 : small ? 5.5 : 6.5, h = big ? 4.6 : small ? 3.4 : 3.8;
  c.fillStyle = 'rgba(40,24,10,.25)'; c.beginPath(); c.ellipse(x + 0.6, y + h * 0.6, w * 0.65, h * 0.35, 0, 0, 7); c.fill();
  c.fillStyle = '#efe6cf'; c.strokeStyle = ink(0.9); c.lineWidth = 0.35;
  c.fillRect(x - w / 2, y - h / 2, w, h); c.strokeRect(x - w / 2, y - h / 2, w, h);
  c.fillStyle = '#b8ac90'; c.fillRect(x - w / 2, y + h / 2 - 1, w, 1);
  for (let i = 0; i < w - 0.5; i += 1.1) { c.fillStyle = ink(0.85); c.fillRect(x - w / 2 + i, y - h / 2 - 0.6, 0.6, 0.6); }
  c.fillStyle = ink(0.85); c.beginPath(); c.moveTo(x - 0.8, y + h / 2); c.lineTo(x - 0.8, y + 0.2); c.quadraticCurveTo(x, y - 0.5, x + 0.8, y + 0.2); c.lineTo(x + 0.8, y + h / 2); c.fill();
  const rw = big ? 5 : 3.6;
  c.fillStyle = ink(0.9);
  c.beginPath(); c.moveTo(x - rw / 2 - 0.8, y - h / 2 - 0.4); c.quadraticCurveTo(x, y - h / 2 - 2.6, x + rw / 2 + 0.8, y - h / 2 - 0.4); c.quadraticCurveTo(x, y - h / 2 - 1.4, x - rw / 2 - 0.8, y - h / 2 - 0.4); c.fill();
  if (big) { c.beginPath(); c.moveTo(x - rw / 2, y - h / 2 - 2); c.quadraticCurveTo(x, y - h / 2 - 4, x + rw / 2, y - h / 2 - 2); c.quadraticCurveTo(x, y - h / 2 - 2.8, x - rw / 2, y - h / 2 - 2); c.fill(); }
  flag(c, x + w / 2 + 0.6, y - h / 2 - 3.5, owner);
}

function drawPass(c, n) {
  const { x, y, owner } = n;
  c.fillStyle = 'rgba(40,24,10,.25)'; c.beginPath(); c.ellipse(x + 0.5, y + 2.2, 4, 1.2, 0, 0, 7); c.fill();
  // 兩側山壁
  c.fillStyle = ink(0.75);
  c.beginPath(); c.moveTo(x - 6, y + 2.5); c.lineTo(x - 4.5, y - 3); c.lineTo(x - 2.6, y + 2.5); c.fill();
  c.beginPath(); c.moveTo(x + 2.6, y + 2.5); c.lineTo(x + 4.5, y - 3.4); c.lineTo(x + 6, y + 2.5); c.fill();
  // 關牆與門樓
  c.fillStyle = '#d8ccb0'; c.fillRect(x - 3, y - 1, 6, 3.4);
  c.strokeStyle = ink(0.9); c.lineWidth = 0.3; c.strokeRect(x - 3, y - 1, 6, 3.4);
  c.fillStyle = ink(0.9); c.fillRect(x - 0.7, y + 0.6, 1.4, 1.8);
  c.beginPath(); c.moveTo(x - 3.6, y - 1); c.quadraticCurveTo(x, y - 3.4, x + 3.6, y - 1); c.quadraticCurveTo(x, y - 2, x - 3.6, y - 1); c.fill();
  flag(c, x + 3.8, y - 5.5, owner, 0.85);
}

function drawPort(c, n) {
  const { x, y, owner } = n;
  // 棧橋
  c.strokeStyle = ink(0.8); c.lineWidth = 0.35;
  c.beginPath(); c.moveTo(x - 4, y + 1.8); c.lineTo(x + 4, y + 1.8); c.stroke();
  for (let i = -3; i <= 3; i += 2) { c.beginPath(); c.moveTo(x + i, y + 1.8); c.lineTo(x + i, y + 3); c.stroke(); }
  // 船
  c.fillStyle = ink(0.85);
  c.beginPath(); c.moveTo(x - 3.4, y); c.quadraticCurveTo(x, y + 1.6, x + 3.4, y); c.lineTo(x + 2.6, y + 1.2); c.lineTo(x - 2.6, y + 1.2); c.closePath(); c.fill();
  c.strokeStyle = ink(0.9); c.lineWidth = 0.3; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 4); c.stroke();
  c.fillStyle = '#efe6cf'; c.beginPath(); c.moveTo(x + 0.2, y - 3.8); c.quadraticCurveTo(x + 2.6, y - 2.2, x + 0.3, y - 0.4); c.closePath(); c.fill();
  c.strokeStyle = ink(0.7); c.lineWidth = 0.2; c.stroke();
  flag(c, x - 3.6, y - 5, owner, 0.75);
}

function drawArmy(c, a, now = 0, night = false) {
  const { x, y } = a;
  if (a.threat) { const ph = (now / 700) % 1; c.strokeStyle = `rgba(226,52,36,${0.9 * (1 - ph)})`; c.lineWidth = 0.6; c.beginPath(); c.arc(x, y - 1, 4 + ph * 4, 0, 7); c.stroke(); }
  if (a.hover && !a.sel) { c.strokeStyle = 'rgba(255,226,140,.9)'; c.lineWidth = 0.6; c.beginPath(); c.arc(x, y - 1, 5, 0, 7); c.stroke(); }
  const col = facColor(a.fid), dk = facDark(a.fid);
  if (a.sel) { c.strokeStyle = 'rgba(242,218,142,.95)'; c.lineWidth = 0.8; c.beginPath(); c.arc(x, y - 1, 5, 0, 7); c.stroke(); }
  c.fillStyle = 'rgba(20,14,8,.35)'; c.beginPath(); c.ellipse(x + 0.4, y + 2.6, 3.2, 0.9, 0, 0, 7); c.fill();
  // 旗桿與大旗
  c.strokeStyle = ink(0.95); c.lineWidth = 0.35;
  c.beginPath(); c.moveTo(x - 2.2, y + 2.6); c.lineTo(x - 2.2, y - 5.5); c.stroke();
  c.fillStyle = col;
  const wv = a.moving ? Math.sin(now / 160 + a.id) * 0.4 : Math.sin(now / 400 + a.id) * 0.15;
  c.beginPath(); c.moveTo(x - 2.2, y - 5.5); c.lineTo(x + 3.6, y - 5.5 + wv); c.lineTo(x + 3.0, y - 2.6 + wv); c.lineTo(x + 3.6, y + 0.4 + wv); c.lineTo(x - 2.2, y + 0.4); c.closePath(); c.fill();
  c.strokeStyle = dk; c.lineWidth = 0.3; c.stroke();
  c.fillStyle = a.fid === 'gong' ? '#2b2118' : '#fbf3df'; c.font = '900 3.6px "Noto Serif TC", serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText((a.name || '')[0] || '軍', x + 0.6, y - 2.5);
  // 兵力條
  const p = Math.max(0.05, Math.min(1, a.troops / 20000));
  c.fillStyle = 'rgba(20,14,8,.8)'; c.fillRect(x - 3, y + 1.2, 6.4, 1.1);
  c.fillStyle = '#c9a24a'; c.fillRect(x - 2.8, y + 1.4, 6 * p, 0.7);
  if (a.water) { c.strokeStyle = 'rgba(30,70,110,.9)'; c.lineWidth = 0.35; c.beginPath(); c.moveTo(x - 3.5, y + 3); c.quadraticCurveTo(x, y + 4.2, x + 3.5, y + 3); c.stroke(); }
}
// ---------- 標題畫：遠山、雲霧、朱日、雁行 ----------
let titleBase = null;
export function drawInkTitle(ctx, t = 0) {
  const W2 = ctx.canvas.width, H2 = ctx.canvas.height;
  if (!titleBase) {
    const cv = document.createElement('canvas'); cv.width = W2; cv.height = H2;
    const c = cv.getContext('2d');
    const pg = c.createLinearGradient(0, 0, 0, H2);
    pg.addColorStop(0, '#efe4c8'); pg.addColorStop(1, '#ddcca4');
    c.fillStyle = pg; c.fillRect(0, 0, W2, H2);
    for (let i = 0; i < 1500; i++) {
      const x = hash(i, 1, 7) * W2, y = hash(i, 2, 7) * H2, l = 3 + hash(i, 3, 7) * 9, a = hash(i, 4, 7) * Math.PI;
      c.strokeStyle = 'rgba(120,96,60,.07)'; c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
    }
    // 朱日
    c.fillStyle = 'rgba(190,52,36,.85)'; c.beginPath(); c.arc(W2 * 0.74, H2 * 0.3, H2 * 0.11, 0, 7); c.fill();
    // 三層山
    const layers = [[0.55, 0.18, 'rgba(90,100,100,.28)', 11], [0.68, 0.24, 'rgba(60,66,62,.5)', 23], [0.84, 0.3, 'rgba(26,24,20,.85)', 37]];
    for (const [base, amp, col, seed] of layers) {
      c.fillStyle = col;
      c.beginPath(); c.moveTo(0, H2);
      for (let x = 0; x <= W2; x += 4) {
        const n = smooth(x, seed * 10, 120, seed) * 0.6 + smooth(x, seed * 10, 40, seed + 1) * 0.3 + smooth(x, seed, 12, seed + 2) * 0.1;
        c.lineTo(x, H2 * (base - amp * (n - 0.3) * 1.6));
      }
      c.lineTo(W2, H2); c.closePath(); c.fill();
      // 山腳霧
      const mg = c.createLinearGradient(0, H2 * (base + 0.02), 0, H2 * (base + 0.14));
      mg.addColorStop(0, 'rgba(239,228,200,0)'); mg.addColorStop(1, 'rgba(239,228,200,.9)');
      c.fillStyle = mg; c.fillRect(0, H2 * (base + 0.02), W2, H2 * 0.12);
    }
    // 近景松
    for (const [x0, s] of [[0.1, 1], [0.16, 0.7], [0.9, 0.85]]) {
      const x = W2 * x0, y = H2 * 0.95, h = H2 * 0.35 * s;
      c.strokeStyle = 'rgba(20,16,12,.95)'; c.lineWidth = 3 * s;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 10 * s, y - h * 0.5, x - 4 * s, y - h); c.stroke();
      for (let i = 0; i < 4; i++) {
        const yy = y - h * (0.45 + i * 0.16), ww = (40 - i * 7) * s;
        c.fillStyle = 'rgba(20,24,18,.85)';
        c.beginPath(); c.ellipse(x + (i % 2 ? 8 : -6) * s, yy, ww, 6 * s, (i % 2 ? 0.08 : -0.08), 0, 7); c.fill();
      }
    }
    titleBase = cv;
  }
  ctx.drawImage(titleBase, 0, 0);
  // 流雲
  for (let i = 0; i < 3; i++) {
    const x = ((t / (60 + i * 25) + i * 330) % (W2 + 400)) - 200, y = H2 * (0.45 + i * 0.12);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 160);
    g.addColorStop(0, 'rgba(246,238,220,.75)'); g.addColorStop(1, 'rgba(246,238,220,0)');
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.22); ctx.translate(-x, -y);
    ctx.fillStyle = g; ctx.fillRect(x - 160, y - 160, 320, 320); ctx.restore();
  }
  // 雁行
  ctx.strokeStyle = 'rgba(20,16,12,.8)'; ctx.lineWidth = 1.6;
  const bx = W2 * 0.3 + ((t / 40) % (W2 * 0.8)) * 0.3, by = H2 * 0.22;
  for (let i = 0; i < 5; i++) {
    const x = bx + i * 18, y = by + Math.abs(i - 2) * 8, f = Math.sin(t / 180 + i) * 3;
    ctx.beginPath(); ctx.moveTo(x - 6, y - 2 + f); ctx.quadraticCurveTo(x - 2, y - 3, x, y); ctx.quadraticCurveTo(x + 2, y - 3, x + 6, y - 2 + f); ctx.stroke();
  }
}
