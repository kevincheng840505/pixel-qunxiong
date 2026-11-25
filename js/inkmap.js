// 水墨古地圖：宣紙、淡墨山勢、青綠設色、河海紋與城郭。邏輯座標 320×180。
import { FACTIONS, ROADS, CITIES } from './data.js';
import { MAP_W, MAP_H, hash, smooth, coastX, riverPaths, elevation, facColor, facDark } from './art.js';

export const MK = 4;                      // 輸出倍率：1280×720
const W = MAP_W * MK, H = MAP_H * MK;
const ink = a => `rgba(30,24,18,${a})`;

const SEASON_TINT = [
  { land: 'rgba(120,160,90,A)', peak: 'rgba(60,120,110,A)', snow: 0 },     // 春：青綠
  { land: 'rgba(90,140,70,A)', peak: 'rgba(40,100,96,A)', snow: 0 },       // 夏
  { land: 'rgba(190,140,60,A)', peak: 'rgba(150,90,40,A)', snow: 0 },      // 秋：赭石
  { land: 'rgba(150,170,190,A)', peak: 'rgba(110,130,150,A)', snow: 1 },   // 冬：花青
];

// ---------- 底圖（依季節快取） ----------
const baseCache = {};
function baseLayer(season) {
  if (baseCache[season]) return baseCache[season];
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  // 宣紙
  const pg = c.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.7);
  pg.addColorStop(0, '#f2ead4'); pg.addColorStop(1, '#d9caa4');
  c.fillStyle = pg; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 5000; i++) {
    const x = hash(i, 1, 3) * W, y = hash(i, 2, 3) * H, l = 3 + hash(i, 3, 3) * 10, a = hash(i, 4, 3) * Math.PI;
    c.strokeStyle = hash(i, 5, 3) > 0.5 ? 'rgba(120,96,60,.06)' : 'rgba(255,255,245,.2)'; c.lineWidth = 0.7;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  c.scale(MK, MK);
  const T = SEASON_TINT[season];

  // 地勢：低解析度墨暈，放大後自然渲開
  const gw = 160, gh = 90;
  const g = document.createElement('canvas'); g.width = gw; g.height = gh;
  const gc = g.getContext('2d'); const img = gc.createImageData(gw, gh);
  const tint = document.createElement('canvas'); tint.width = gw; tint.height = gh;
  const tc = tint.getContext('2d'); const timg = tc.createImageData(gw, gh);
  const tcol = T.peak.match(/\d+/g).map(Number);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const lx = x / gw * MAP_W, ly = y / gh * MAP_H, o = (y * gw + x) * 4;
    if (lx > coastX(ly) - 1) continue;
    const e = elevation(lx, ly);
    const a = Math.max(0, Math.min(1, (e - 0.28) * 1.5));
    img.data[o] = 40; img.data[o + 1] = 36; img.data[o + 2] = 30; img.data[o + 3] = a * 150;
    const ta = Math.max(0, Math.min(1, (e - 0.35) * 2));
    timg.data[o] = tcol[0]; timg.data[o + 1] = tcol[1]; timg.data[o + 2] = tcol[2]; timg.data[o + 3] = ta * (T.snow ? 60 : 110);
  }
  gc.putImageData(img, 0, 0); tc.putImageData(timg, 0, 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(g, 0, 0, MAP_W, MAP_H);
  c.drawImage(tint, 0, 0, MAP_W, MAP_H);
  // 平原淡彩
  for (let i = 0; i < 140; i++) {
    const x = hash(i, 7, 9) * MAP_W, y = hash(i, 8, 9) * MAP_H;
    if (x > coastX(y) - 4 || elevation(x, y) > 0.45) continue;
    const r = 8 + hash(i, 9, 9) * 18;
    const rg = c.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, T.land.replace('A', 0.12)); rg.addColorStop(1, T.land.replace('A', 0));
    c.fillStyle = rg; c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // 海
  c.save();
  c.beginPath(); c.moveTo(MAP_W, 0);
  for (let y = 0; y <= MAP_H; y += 1) c.lineTo(coastX(y) + (smooth(0, y * 4, 12, 5) - 0.5) * 3, y);
  c.lineTo(MAP_W, MAP_H); c.closePath();
  const sg = c.createLinearGradient(280, 0, MAP_W, 0);
  sg.addColorStop(0, 'rgba(80,110,130,.35)'); sg.addColorStop(1, 'rgba(50,80,110,.55)');
  c.fillStyle = sg; c.fill();
  c.clip();
  // 海水紋（魚鱗波）
  c.strokeStyle = 'rgba(40,60,80,.45)'; c.lineWidth = 0.25;
  for (let y = 2; y < MAP_H; y += 3.2) for (let x = 270 + ((y / 3.2) % 2) * 2.5; x < MAP_W; x += 5) {
    c.beginPath(); c.arc(x, y, 2.4, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
  }
  c.restore();
  // 海岸墨線
  c.strokeStyle = ink(0.8); c.lineWidth = 0.55;
  c.beginPath();
  for (let y = 0; y <= MAP_H; y += 1) { const x = coastX(y) + (smooth(0, y * 4, 12, 5) - 0.5) * 3; y ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.stroke();

  // 河流
  for (const r of riverPaths) {
    const path = () => { c.beginPath(); r.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); };
    path(); c.strokeStyle = season === 3 ? 'rgba(150,170,190,.7)' : 'rgba(80,110,130,.55)'; c.lineWidth = r.w * 0.75; c.stroke();
    path(); c.strokeStyle = ink(0.75); c.lineWidth = 0.35; c.stroke();
    path(); c.strokeStyle = 'rgba(245,240,226,.5)'; c.lineWidth = r.w * 0.2; c.stroke();
  }

  // 山峰（皴擦筆意）
  const peaks = [];
  for (let y = 3; y < MAP_H - 3; y += 4.5) for (let x = 3; x < MAP_W - 3; x += 5.5) {
    const jx = x + hash(x * 10, y * 10, 11) * 3, jy = y + hash(x * 10, y * 10, 12) * 2.5;
    const e = elevation(jx, jy);
    if (e > 0.6 && hash(x * 10, y * 10, 13) > 0.3 && jx < coastX(jy) - 3) peaks.push([jx, jy, e]);
  }
  peaks.sort((a, b) => a[1] - b[1]).forEach(([x, y, e]) => drawPeak(c, x, y, e, T, season));

  // 林木
  for (let y = 2; y < MAP_H; y += 3.2) for (let x = 2; x < MAP_W; x += 3.8) {
    const f = smooth(x * MK / 2, y * MK / 2, 40, 83);
    if (f < 0.66 || x > coastX(y) - 4 || elevation(x, y) > 0.6) continue;
    if (hash(x * 10, y * 10, 84) > (f - 0.6) * 2.2) continue;
    drawTree(c, x + hash(x, y, 85) * 2, y + hash(x, y, 86) * 1.5, season);
  }

  // 冬雪
  if (season === 3) {
    for (let i = 0; i < 400; i++) {
      c.fillStyle = 'rgba(255,255,255,.55)';
      c.beginPath(); c.arc(hash(i, 1, 99) * MAP_W, hash(i, 2, 99) * MAP_H, 0.25 + hash(i, 3, 99) * 0.35, 0, 7); c.fill();
    }
  }
  // 暗角
  const vg = c.createRadialGradient(MAP_W / 2, MAP_H / 2, MAP_H * 0.45, MAP_W / 2, MAP_H / 2, MAP_W * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(90,60,30,.28)');
  c.fillStyle = vg; c.fillRect(0, 0, MAP_W, MAP_H);
  // 題字
  c.save();
  c.fillStyle = ink(0.75); c.font = '900 7px "Noto Serif TC", "Songti TC", serif'; c.textAlign = 'center';
  ['漢', '末', '輿', '圖'].forEach((ch, i) => c.fillText(ch, 304, 112 + i * 8));
  c.fillStyle = 'rgba(179,38,30,.85)'; c.fillRect(299, 146, 10, 10);
  c.fillStyle = '#f4e6c8'; c.font = '900 4px serif'; c.fillText('群雄', 304, 150); c.fillText('逐鹿', 304, 154.5);
  c.restore();
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
  // 披麻皴
  c.beginPath(); c.moveTo(x - w * 0.2, y - h * 0.55); c.lineTo(x - w * 0.45, y); c.moveTo(x + w * 0.1, y - h * 0.6); c.lineTo(x - w * 0.05, y - 0.5); c.stroke();
  // 苔點
  c.fillStyle = ink(0.7);
  if (hash(x * 13, y * 7, 3) > 0.5) { c.beginPath(); c.arc(x - w * 0.3, y - h * 0.62, 0.3, 0, 7); c.fill(); }
}

function drawTree(c, x, y, season) {
  const leaf = [ink(0.55), ink(0.6), 'rgba(140,70,30,.6)', ink(0.35)][season];
  c.strokeStyle = ink(0.6); c.lineWidth = 0.2;
  c.beginPath(); c.moveTo(x, y + 1.6); c.lineTo(x, y); c.stroke();
  c.fillStyle = leaf;
  for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(x + (hash(x * 9, y * 9, i) - 0.5) * 1.6, y - 0.4 + (hash(x * 9, y * 9, i + 5) - 0.5) * 1.2, 0.45, 0, 7); c.fill(); }
}

// ---------- 勢力範圍 ----------
const terrCache = { key: '', cv: null };
function territory(s) {
  const key = s.cities.map(c => c.owner || '-').join(',');
  if (terrCache.key === key) return terrCache.cv;
  const gw = 320, gh = 180;
  const own = new Int8Array(gw * gh).fill(-1);
  const ids = FACTIONS.map(f => f.id);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const lx = x + 0.5, ly = y + 0.5;
    if (lx > coastX(ly)) continue;
    let best = 1e9, bc = null;
    for (const c of s.cities) { const d = (c.x - lx) ** 2 + (c.y - ly) ** 2 * 1.2; if (d < best) { best = d; bc = c; } }
    if (best < 34 * 34 && bc.owner) own[y * gw + x] = ids.indexOf(bc.owner);
  }
  const fill = document.createElement('canvas'); fill.width = gw; fill.height = gh;
  const fc = fill.getContext('2d'); const img = fc.createImageData(gw, gh);
  for (let i = 0; i < gw * gh; i++) {
    const o = own[i]; if (o < 0) continue;
    const col = facColor(FACTIONS[o].id).match(/\w\w/g).map(h => parseInt(h, 16));
    img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 62;
  }
  fc.putImageData(img, 0, 0);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = true; c.filter = 'blur(6px)';
  c.drawImage(fill, 0, 0, W, H);
  c.filter = 'none';
  // 疆界：墨點虛線
  c.scale(MK, MK);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const o = own[y * gw + x]; if (o < 0) continue;
    const r = x + 1 < gw ? own[y * gw + x + 1] : o, d = y + 1 < gh ? own[(y + 1) * gw + x] : o;
    if (r !== o && r >= 0 && (y % 2 === 0)) { c.fillStyle = 'rgba(60,30,20,.7)'; c.fillRect(x + 0.8, y + 0.2, 0.45, 0.8); }
    if (d !== o && d >= 0 && (x % 2 === 0)) { c.fillStyle = 'rgba(60,30,20,.7)'; c.fillRect(x + 0.2, y + 0.8, 0.8, 0.45); }
    if ((r < 0 && r !== o && x + 1 < gw && x + 1 < coastX(y)) || (d < 0 && d !== o && y + 1 < gh && x < coastX(y + 1))) {
      c.fillStyle = facDark(FACTIONS[o].id); c.globalAlpha = 0.5; c.fillRect(x + 0.4, y + 0.4, 0.5, 0.5); c.globalAlpha = 1;
    }
  }
  terrCache.key = key; terrCache.cv = cv;
  return cv;
}

// ---------- 主繪製 ----------
export function drawInkMap(ctx, s, opts = {}) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(baseLayer(s.season), 0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(territory(s), 0, 0, ctx.canvas.width, ctx.canvas.height);
  const k = ctx.canvas.width / MAP_W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.lineCap = 'round';
  // 道路
  for (const [a, b] of ROADS) {
    const A = CITIES[a - 1], B = CITIES[b - 1];
    const hl = opts.routes && opts.routes.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
    const mx = (A.x + B.x) / 2 + (hash(a, b, 1) - 0.5) * 4, my = (A.y + B.y) / 2 + (hash(a, b, 2) - 0.5) * 4;
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(mx, my, B.x, B.y);
    if (hl) { ctx.setLineDash([]); ctx.strokeStyle = 'rgba(179,38,30,.9)'; ctx.lineWidth = 1.1; }
    else { ctx.setLineDash([1.6, 1.2]); ctx.strokeStyle = 'rgba(80,52,30,.55)'; ctx.lineWidth = 0.45; }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const sorted = [...s.cities].sort((a, b) => a.y - b.y);
  for (const c of sorted) drawTown(ctx, c, opts.selected === c.id, opts.targets && opts.targets.includes(c.id));
}

function drawTown(c, city, selected, targeted) {
  const { x, y, size, owner } = city;
  const big = size === '大', pass = size === '關';
  const w = big ? 8 : pass ? 5.5 : 6.5, h = big ? 4.6 : 3.8;
  if (selected || targeted) {
    // 朱砂圈
    c.strokeStyle = selected ? 'rgba(201,162,74,.95)' : 'rgba(179,38,30,.9)'; c.lineWidth = selected ? 0.9 : 0.7;
    c.beginPath(); c.ellipse(x, y + 0.5, w * 0.95, h * 1.5, -0.1, 0.2, Math.PI * 2 - 0.1); c.stroke();
  }
  // 影
  c.fillStyle = 'rgba(40,24,10,.25)'; c.beginPath(); c.ellipse(x + 0.6, y + h * 0.6, w * 0.65, h * 0.35, 0, 0, 7); c.fill();
  // 城牆（白描）
  c.fillStyle = '#efe6cf'; c.strokeStyle = ink(0.9); c.lineWidth = 0.35;
  c.fillRect(x - w / 2, y - h / 2, w, h); c.strokeRect(x - w / 2, y - h / 2, w, h);
  c.fillStyle = '#b8ac90'; c.fillRect(x - w / 2, y + h / 2 - 1, w, 1);
  for (let i = 0; i < w - 0.5; i += 1.1) { c.fillStyle = ink(0.85); c.fillRect(x - w / 2 + i, y - h / 2 - 0.6, 0.6, 0.6); }
  // 城門
  c.fillStyle = ink(0.85); c.beginPath(); c.moveTo(x - 0.8, y + h / 2); c.lineTo(x - 0.8, y + 0.2); c.quadraticCurveTo(x, y - 0.5, x + 0.8, y + 0.2); c.lineTo(x + 0.8, y + h / 2); c.fill();
  // 城樓屋頂
  const rw = big ? 5 : 3.6;
  c.fillStyle = ink(0.9);
  c.beginPath(); c.moveTo(x - rw / 2 - 0.8, y - h / 2 - 0.4); c.quadraticCurveTo(x, y - h / 2 - 2.6, x + rw / 2 + 0.8, y - h / 2 - 0.4); c.quadraticCurveTo(x, y - h / 2 - 1.4, x - rw / 2 - 0.8, y - h / 2 - 0.4); c.fill();
  if (big) { c.beginPath(); c.moveTo(x - rw / 2, y - h / 2 - 2); c.quadraticCurveTo(x, y - h / 2 - 4, x + rw / 2, y - h / 2 - 2); c.quadraticCurveTo(x, y - h / 2 - 2.8, x - rw / 2, y - h / 2 - 2); c.fill(); }
  // 旗
  const fx = x + w / 2 + 0.6, fy = y - h / 2 - 3.5;
  c.strokeStyle = ink(0.9); c.lineWidth = 0.3; c.beginPath(); c.moveTo(fx, fy + 5.5); c.lineTo(fx, fy); c.stroke();
  c.fillStyle = owner ? facColor(owner) : '#9a9080';
  c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + 3.4, fy + 0.4); c.lineTo(fx + 2.6, fy + 1.3); c.lineTo(fx + 3.4, fy + 2.2); c.lineTo(fx, fy + 2.2); c.fill();
  c.strokeStyle = owner ? facDark(owner) : '#5a5246'; c.lineWidth = 0.2; c.stroke();
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
