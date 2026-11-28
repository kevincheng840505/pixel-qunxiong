// 行軍地理：把每條道路切成路段，判定地形、道路等級與渡河點；並提供逐日天候。
// 規則層，不碰畫面。地形判定與水墨地圖（inkmap.js）用同一套高度與林地函式，畫面上看到山就是山。
import { CITIES, EDGES, cityId } from './data.js';
import { elevation, smooth, hash, isSea, riverPaths, LAKES } from './geo.js';

export const LI_PER_UNIT = 16;     // 地圖 1 單位約 16 里（已含道路曲折）
export const BASE_LI = 30;         // 步兵常行一日 30 里（一舍）

// 地形種類：速度倍率、顯示名、路線顏色
export const TERRAINS = {
  plain: { mul: 1.0, name: '平原', color: '#6f8f4e', hard: 1.0 },
  hill: { mul: 0.75, name: '丘陵', color: '#a88a4a', hard: 1.3 },
  forest: { mul: 0.7, name: '林地', color: '#3f6b45', hard: 1.35 },
  marsh: { mul: 0.5, name: '沼澤', color: '#5c7c80', hard: 1.6 },
  mountain: { mul: 0.45, name: '山地', color: '#6b5440', hard: 1.8 },
  plank: { mul: 0.3, name: '棧道', color: '#8a2f22', hard: 2.2 },
  water: { mul: 1.0, name: '水路', color: '#2f5f8a', hard: 0.4 },
};
export const ROAD_GRADE = { highway: { mul: 1.2, name: '官道' }, road: { mul: 1.0, name: '道路' }, trail: { mul: 0.7, name: '山徑' } };

const pair = s => s.split(/\s+/).filter(Boolean).map(p => p.split('-').map(cityId));
// 秦漢以來的官道（馳道）
const HIGHWAYS = pair(`洛陽-虎牢關 虎牢關-陳留 洛陽-弘農 弘農-潼關 潼關-長安 洛陽-許昌 陳留-許昌 洛陽-孟津 許昌-宛 宛-襄陽 襄陽-江陵
  鄴-白馬津 濮陽-陳留 鄴-南皮 南皮-薊 陳留-譙 譙-小沛 小沛-下邳 長安-安定 晉陽-上黨 上黨-鄴`);
// 蜀道、子午等棧道
const PLANKS = pair(`散關-漢中 漢中-陽平關 陽平關-劍閣 劍閣-梓潼 散關-天水`);
// 窄險山徑
const TRAILS = pair(`漢中-上庸 上庸-襄陽 長安-武關 武關-宛 井陘關-晉陽 南皮-井陘關 鄴-井陘關 江州-永安 永安-夷陵關 天水-陽平關`);
const has = (list, a, b) => list.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

// 順流方向：江河大致由西向東流
const DOWNSTREAM_EAST = true;

export function terrainAt(x, y) {
  const e = elevation(x, y);
  for (const L of LAKES) {
    const [lx, ly] = L.x, dx = (x - lx) / (L.rx + 5), dy = (y - ly) / (L.ry + 4);
    if (dx * dx + dy * dy < 1) return 'marsh';
  }
  if (e > 0.56) return 'mountain';
  if (smooth(x * 2, y * 2, 40, 83) > 0.74 && e <= 0.6) return 'forest';
  if (e > 0.36) return 'hill';
  // 淮河、雲夢一帶低窪多澤
  if (e < 0.16 && y > 150 && smooth(x, y, 20, 91) > 0.6) return 'marsh';
  return 'plain';
}

function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

// 每條有向邊的路段資料：{ type, len, grade, segs:[{ a, b, t }], cross:[{ at, river, days, ford }], days, li }
export const ROUTE = {};

function build(aId, bId, type) {
  const A = CITIES[aId - 1], B = CITIES[bId - 1];
  const len = Math.hypot(B.x - A.x, B.y - A.y);
  if (type === 'water') {
    const down = DOWNSTREAM_EAST ? B.x >= A.x : B.x <= A.x;
    const sea = isSea((A.x + B.x) / 2, (A.y + B.y) / 2);
    // 船行一日：順流 70 里、逆流 32 里、近海 50 里
    const liDay = sea ? 50 : down ? 70 : 32;
    return { type, len, grade: null, down, sea, liDay, segs: [{ a: 0, b: len, t: 'water' }], cross: [], li: len * LI_PER_UNIT, days: len * LI_PER_UNIT / liDay };
  }
  const grade = has(HIGHWAYS, aId, bId) ? 'highway' : has(TRAILS, aId, bId) ? 'trail' : 'road';
  const plank = has(PLANKS, aId, bId);
  // 每 1 單位取樣一次，合併相同地形
  const n = Math.max(2, Math.ceil(len));
  const segs = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2;
    const x = A.x + (B.x - A.x) * tm, y = A.y + (B.y - A.y) * tm;
    let t = terrainAt(x, y);
    if (plank && (t === 'mountain' || t === 'hill' || t === 'forest')) t = 'plank';
    // 據點附近一定是可通行的平地
    if (tm * len < 2.5 || (1 - tm) * len < 2.5) t = t === 'plank' ? 'mountain' : t === 'marsh' ? 'plain' : t;
    // 關隘一帶地勢險要
    const nearPass = (A.kind === 'pass' && tm * len < 5) || (B.kind === 'pass' && (1 - tm) * len < 5);
    if (nearPass && (t === 'plain' || t === 'forest')) t = 'hill';
    const last = segs[segs.length - 1];
    if (last && last.t === t) last.b = t1 * len; else segs.push({ a: t0 * len, b: t1 * len, t });
  }
  // 渡河點：與河流折線相交
  const cross = [];
  for (const r of riverPaths) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [cx, cy] = r.pts[i], [dx, dy] = r.pts[i + 1];
      const t = segIntersect(A.x, A.y, B.x, B.y, cx, cy, dx, dy);
      if (t == null) continue;
      // 河流若正好穿過終點據點，渡河點略往內移，確保抵達前要先渡河
      const at = Math.min(t * len, len - 0.3);
      if (cross.some(c => c.river === r.name && Math.abs(c.at - at) < 3)) continue;
      // 端點是港口或渡口（名稱帶津）則有船可渡
      const ford = [A, B].some(c => c.kind === 'port' || /津|口/.test(c.name)) || (r.w < 1.6);
      const big = r.w >= 3;
      cross.push({ at, river: r.name, ford, big, days: ford ? 0.5 : big ? 2 : 1 });
    }
  }
  cross.sort((p, q) => p.at - q.at);
  const g = ROAD_GRADE[grade].mul;
  let days = 0;
  for (const s of segs) days += (s.b - s.a) * LI_PER_UNIT / (BASE_LI * TERRAINS[s.t].mul * g);
  for (const c of cross) days += c.days;
  return { type, len, grade, segs, cross, li: len * LI_PER_UNIT, days };
}

for (const [a, b, type] of EDGES) {
  ROUTE[a + '-' + b] = build(a, b, type);
  const back = build(b, a, type);
  ROUTE[b + '-' + a] = back;
}
export const routeOf = (a, b) => ROUTE[a + '-' + b];

// 某段路上某位置的地形
export function segAt(r, prog) {
  for (const s of r.segs) if (prog < s.b - 1e-6) return s;
  return r.segs[r.segs.length - 1];
}

// ---------- 天候 ----------
// 依月份與緯度決定機率；同一天同一區域天氣固定（以雜湊決定，不耗用亂數）。
export const WEATHER = {
  clear: { name: '晴', mul: 1.0, icon: '☀' },
  cloud: { name: '陰', mul: 1.0, icon: '☁' },
  rain: { name: '雨', mul: 0.75, icon: '🌧' },
  storm: { name: '大雨', mul: 0.5, icon: '⛈' },
  snow: { name: '雪', mul: 0.6, icon: '❄' },
  blizzard: { name: '大雪', mul: 0.35, icon: '🌨' },
};
export function weatherAt(s, x, y, day) {
  const north = y < 105, south = y > 185;
  const m = s.month;   // 0 = 正月
  const r = hash(Math.floor(x / 60), Math.floor(y / 50), s.turn * 37 + day);
  const r2 = hash(Math.floor(x / 60) + 7, Math.floor(y / 50) + 3, s.turn * 41 + day);
  let pRain = 0.12, pStorm = 0.02, pSnow = 0, pBliz = 0;
  if (m >= 3 && m <= 5) { pRain = south ? 0.32 : 0.18; pStorm = south ? 0.08 : 0.04; }          // 春雨、梅雨
  else if (m >= 6 && m <= 7) { pRain = 0.3; pStorm = north ? 0.12 : 0.1; }                        // 夏季暴雨
  else if (m >= 8 && m <= 9) { pRain = 0.12; pStorm = 0.02; }                                     // 秋高氣爽
  else { pRain = south ? 0.14 : 0.05; pSnow = north ? 0.28 : south ? 0.02 : 0.1; pBliz = north ? 0.07 : south ? 0 : 0.02; } // 冬
  const hi = elevation(x, y) > 0.62;
  if (hi && pSnow) { pSnow += 0.15; pBliz += 0.05; }
  if (r < pBliz) return 'blizzard';
  if (r < pBliz + pSnow) return 'snow';
  if (r < pBliz + pSnow + pStorm) return 'storm';
  if (r < pBliz + pSnow + pStorm + pRain) return 'rain';
  return r2 < 0.35 ? 'cloud' : 'clear';
}

// 瘴癘：南方夏秋之際
export const miasma = (s, y) => y > 200 && s.month >= 4 && s.month <= 8;
