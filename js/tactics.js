// 戰術戰場：六角格攻城戰。規則層，不碰畫面。
// 座標為 odd-r 位移（尖頂六角），q = 欄、r = 列。
import { TRAITS } from './data.js';
import { rand, chance, clamp, gen, city, gensIn, pick } from './rules.js';

export const COLS = 16, ROWS = 11;
export const MAX_TURNS = 20;

export const TYPES = {
  spear: { name: '槍兵', glyph: '槍', mv: 4, atk: 1.0, def: 1.1, range: 1 },
  cav:   { name: '騎兵', glyph: '騎', mv: 6, atk: 1.15, def: 0.9, range: 1 },
  bow:   { name: '弓兵', glyph: '弓', mv: 3, atk: 0.85, def: 0.85, range: 2 },
  siege: { name: '衝車', glyph: '車', mv: 3, atk: 0.45, def: 0.7, range: 1 },
};
const BEATS = { spear: 'cav', cav: 'bow', bow: 'spear' };

export const TERRAIN = {
  plain:    { name: '平原', cost: 1, def: 1.0 },
  forest:   { name: '林地', cost: 2, def: 0.8 },
  hill:     { name: '丘陵', cost: 2, def: 0.85 },
  mountain: { name: '山岳', cost: 99, def: 1 },
  river:    { name: '河川', cost: 3, def: 1.2 },
  wall:     { name: '城牆', cost: 1, def: 0.6 },
  gate:     { name: '城門', cost: 1, def: 0.7 },
  inner:    { name: '城內', cost: 1, def: 0.95 },
  keep:     { name: '本陣', cost: 1, def: 0.85 },
};

export const TACTICS = {
  fire:    { name: '火計', cost: 30, range: 2, desc: '在目標處放火，連續燃燒兩回合' },
  confuse: { name: '混亂', cost: 25, range: 2, desc: '使敵軍混亂，下回合無法行動' },
  rouse:   { name: '鼓舞', cost: 20, range: 0, desc: '解除自身與鄰近友軍混亂，並提振氣力' },
  rocks:   { name: '落石', cost: 30, range: 1, desc: '自丘陵或城牆投下落石，打擊所有相鄰敵軍' },
};

// ---------- 六角格工具 ----------
export const key = (q, r) => q + ',' + r;
export function toCube(q, r) { const x = q - (r - (r & 1)) / 2; return [x, -x - r, r]; }
export function dist(a, b) {
  const [ax, ay, az] = toCube(a.q, a.r), [bx, by, bz] = toCube(b.q, b.r);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}
const DIRS = [[[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]], [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]];
export function neighbors(q, r) {
  return DIRS[r & 1].map(([dq, dr]) => ({ q: q + dq, r: r + dr })).filter(h => h.q >= 0 && h.q < COLS && h.r >= 0 && h.r < ROWS);
}

// ---------- 地圖生成 ----------
function noise(seed, q, r) {
  let h = (q * 374761393 + r * 668265263 + seed * 982451653) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function buildMap(c) {
  const seed = c.id * 97 + 13;
  const tiles = [];
  const big = c.size === '大';
  const gates = big ? [3, 7] : [5];
  const wallQ = 11;
  for (let r = 0; r < ROWS; r++) for (let q = 0; q < COLS; q++) {
    let t = 'plain';
    const n = noise(seed, q, r), n2 = noise(seed + 7, q >> 1, r >> 1);
    if (q < wallQ - 1) {
      if (c.terrain === 'M') t = n2 > 0.55 ? (n > 0.8 ? 'mountain' : 'hill') : n > 0.8 ? 'forest' : 'plain';
      else if (c.terrain === 'F') t = n2 > 0.45 ? 'forest' : n > 0.88 ? 'hill' : 'plain';
      else t = n > 0.9 ? 'forest' : n > 0.84 ? 'hill' : 'plain';
      if (q <= 1) t = t === 'mountain' ? 'plain' : t;
    } else if (q === wallQ) t = gates.includes(r) ? 'gate' : 'wall';
    else t = 'inner';
    tiles.push({ q, r, t, fire: 0 });
  }
  // 河川：縱向穿過戰場中段
  if (c.terrain === 'R' || noise(seed, 99, 1) > 0.6) {
    let q = 6 + Math.floor(noise(seed, 5, 5) * 2);
    for (let r = 0; r < ROWS; r++) {
      tiles[r * COLS + q].t = 'river';
      if (noise(seed, r, 77) > 0.6) q = clamp(q + (noise(seed, r, 78) > 0.5 ? 1 : -1), 4, 8);
    }
    // 渡口
    const ford = 2 + Math.floor(noise(seed, 3, 3) * 7);
    for (const r of [ford]) for (let qq = 4; qq <= 9; qq++) if (tiles[r * COLS + qq].t === 'river') tiles[r * COLS + qq].t = 'plain';
  }
  // 護城河前清出空地
  for (let r = 0; r < ROWS; r++) { const t = tiles[r * COLS + wallQ - 1]; if (t.t === 'mountain' || t.t === 'river') t.t = 'plain'; }
  const keepR = 5;
  tiles[keepR * COLS + 14].t = 'keep';
  return { tiles, gates: gates.map(r => ({ q: wallQ, r })), keep: { q: 14, r: keepR } };
}

// ---------- 建立戰鬥 ----------
// plan.units: [{ genId, troops, type }]
export function createTactical(s, plan) {
  const c = city(s, plan.to);
  const map = buildMap(c);
  const b = {
    cityId: c.id, cityName: c.name, atk: plan.faction, def: c.owner,
    tiles: map.tiles, keep: map.keep, turn: 1, side: 'A', units: [], log: [],
    gateHp: {}, gateMax: 0, over: false, winner: null, capturedA: [], capturedD: [],
    winter: s.season === 3, startA: 0, startD: 0, seq: 0,
  };
  b.gateMax = Math.round(800 + c.wall * 3);
  for (const g of map.gates) b.gateHp[key(g.q, g.r)] = b.gateMax;
  // 攻方佈陣：左側三欄
  const slotsA = [[1, 5], [1, 3], [1, 7], [0, 4], [0, 6], [2, 2], [2, 8]];
  plan.units.forEach((u, i) => {
    const g = gen(s, u.genId);
    const [q, r] = slotsA[i];
    addUnit(b, 'A', g, u.troops, u.type, q, r);
  });
  // 守方
  const gens = c.owner ? gensIn(s, c.id, c.owner).sort((a, b2) => (b2.str + b2.int) - (a.str + a.int)).slice(0, 5) : [];
  const n = gens.length || (c.troops > 0 ? Math.min(3, Math.max(1, Math.round(c.troops / 2500))) : 0);
  if (n && c.troops > 0) {
    const gatePos = map.gates;
    // 守軍佈陣：城門兩側城牆優先，其次城內與本陣
    const slotsD = [];
    const push = (q, r) => { if (r >= 0 && r < ROWS && !slotsD.some(([x, y]) => x === q && y === r)) slotsD.push([q, r]); };
    for (const g of gatePos) { push(11, g.r - 1); push(11, g.r + 1); }
    push(13, gatePos[0].r); push(14, 5); push(11, gatePos[0].r - 3); push(11, gatePos[0].r + 3);
    const weights = gens.length ? gens.map(g => g.str + 50) : Array(n).fill(1);
    const wsum = weights.reduce((a, x) => a + x, 0);
    for (let i = 0; i < n; i++) {
      const g = gens[i] || null;
      let type = g ? (g.int >= 75 && g.str < 80 ? 'bow' : (TRAITS[g.trait] && TRAITS[g.trait].pref === 'cav') ? 'cav' : (TRAITS[g.trait] && TRAITS[g.trait].pref) || 'spear') : (i === 1 ? 'bow' : 'spear');
      if (i > 0 && i < 3 && type === 'cav') type = 'bow'; // 城牆上不放騎兵
      const [q, r] = slotsD[i];
      addUnit(b, 'D', g, c.troops * weights[i] / wsum, type, q, r);
    }
  }
  b.startA = b.units.filter(u => u.side === 'A').reduce((a, u) => a + u.troops, 0);
  b.startD = b.units.filter(u => u.side === 'D').reduce((a, u) => a + u.troops, 0);
  if (!b.units.some(u => u.side === 'D')) { b.over = true; b.winner = 'A'; b.log.push(`${b.cityName}無人防守，不戰而下！`); }
  else b.log.push(`第 1 回合・${b.winter ? '寒冬行軍，士卒疲憊' : '兩軍對陣'}`);
  return b;
}

function addUnit(b, side, g, troops, type, q, r) {
  b.units.push({
    id: ++b.seq, side, genId: g ? g.id : null, name: g ? g.name : '守備隊',
    str: g ? g.str : 45, int: g ? g.int : 30, cha: g ? g.cha : 40, trait: g ? g.trait : null,
    troops: Math.round(troops), max: Math.round(troops), type, q, r,
    energy: 40 + (g ? Math.round(g.int / 4) : 0), conf: 0, moved: false, acted: false, dead: false, steps: 0,
  });
}

// ---------- 查詢 ----------
export const tileAt = (b, q, r) => b.tiles[r * COLS + q];
export const unitAt = (b, q, r) => b.units.find(u => !u.dead && u.q === q && u.r === r);
export const alive = (b, side) => b.units.filter(u => !u.dead && (!side || u.side === side));
const other = s => (s === 'A' ? 'D' : 'A');
export const gateOpen = (b, q, r) => (b.gateHp[key(q, r)] ?? 1) <= 0;

function passable(b, u, q, r) {
  const t = tileAt(b, q, r);
  if (t.t === 'mountain') return false;
  if (t.t === 'wall') return u.side === 'D';
  if (t.t === 'gate') return gateOpen(b, q, r); // 城門緊閉時雙方都不能通過
  if (u.type === 'siege' && t.t === 'forest') return false;
  return true;
}
function moveCost(b, u, q, r) {
  const t = tileAt(b, q, r);
  let c = TERRAIN[t.t].cost;
  if (u.type === 'cav' && (t.t === 'forest' || t.t === 'hill')) c += 1;
  if (t.fire) c += 2;
  return c;
}
function zoc(b, u, q, r) { return neighbors(q, r).some(h => { const e = unitAt(b, h.q, h.r); return e && e.side !== u.side; }); }

// 可到達的格子：Map key -> { q, r, cost, prev }
export function reachable(b, u) {
  const res = new Map();
  const start = { q: u.q, r: u.r, cost: 0, prev: null };
  res.set(key(u.q, u.r), start);
  if (u.moved || u.conf) return res;
  let mv = TYPES[u.type].mv - (b.winter && u.side === 'A' ? 1 : 0);
  const open = [start];
  while (open.length) {
    open.sort((a, c) => a.cost - c.cost);
    const cur = open.shift();
    if (cur !== start && zoc(b, u, cur.q, cur.r)) continue;
    for (const n of neighbors(cur.q, cur.r)) {
      if (!passable(b, u, n.q, n.r)) continue;
      const occ = unitAt(b, n.q, n.r);
      if (occ && occ.side !== u.side) continue;
      const cost = cur.cost + moveCost(b, u, n.q, n.r);
      if (cost > mv) continue;
      const k = key(n.q, n.r);
      if (res.has(k) && res.get(k).cost <= cost) continue;
      const node = { q: n.q, r: n.r, cost, prev: cur };
      res.set(k, node); open.push(node);
    }
  }
  // 不能停在友軍上
  for (const [k, n] of res) { const occ = unitAt(b, n.q, n.r); if (occ && occ !== u) res.delete(k); }
  return res;
}
export function pathTo(node) { const p = []; for (let n = node; n; n = n.prev) p.unshift({ q: n.q, r: n.r }); return p; }

function rangeOf(b, u) {
  let r = TYPES[u.type].range;
  if (u.type === 'bow' && ['wall', 'hill'].includes(tileAt(b, u.q, u.r).t)) r += 1;
  return r;
}
// 可攻擊的目標（敵軍與城門）
export function attackTargets(b, u, from = u) {
  const out = [];
  const rg = rangeOf(b, { ...u, q: from.q, r: from.r });
  for (const e of alive(b, other(u.side))) if (dist(from, e) <= rg) out.push({ kind: 'unit', unit: e, q: e.q, r: e.r });
  if (u.side === 'A') for (const k in b.gateHp) {
    if (b.gateHp[k] <= 0) continue;
    const [q, r] = k.split(',').map(Number);
    if (dist(from, { q, r }) <= rg && !unitAt(b, q, r)) out.push({ kind: 'gate', q, r });
  }
  return out;
}

// ---------- 戰鬥計算 ----------
export function previewDamage(b, u, t, from = u) {
  const ty = TYPES[u.type];
  let d = u.troops * 0.085 * (0.55 + u.str / 110) * ty.atk;
  if (t.kind === 'gate') {
    d *= u.type === 'siege' ? 9 : 1;
    return Math.round(d);
  }
  const e = t.unit;
  if (BEATS[u.type] === e.type) d *= 1.3; else if (BEATS[e.type] === u.type) d *= 0.8;
  if (u.type === 'cav' && u.steps >= 3) d *= 1.2;
  if (u.trait === '突擊' && u.type === 'cav') d *= 1.15;
  if (u.trait === '神射' && u.type === 'bow') d *= 1.15;
  if (u.trait === '水戰' && tileAt(b, from.q, from.r).t === 'river') d *= 1.3;
  const tt = tileAt(b, e.q, e.r).t;
  d *= TERRAIN[tt].def / TYPES[e.type].def;
  if (e.trait === '鐵壁') d *= 0.9;
  if (e.trait === '善守' && e.side === 'D') d *= 0.85;
  // 夾擊：目標周圍每多一支我軍 +10%
  const flank = neighbors(e.q, e.r).filter(h => { const x = unitAt(b, h.q, h.r); return x && x.side === u.side && x !== u; }).length;
  d *= 1 + flank * 0.1;
  if (e.conf) d *= 1.2;
  return Math.max(30, Math.round(d));
}

function hurt(b, e, d, ev) {
  const real = Math.min(e.troops, Math.round(d));
  e.troops -= real;
  ev.push({ kind: 'hit', id: e.id, dmg: real });
  if (e.troops <= 0) kill(b, e, ev);
  return real;
}

function kill(b, e, ev) {
  e.dead = true; e.troops = 0;
  ev.push({ kind: 'rout', id: e.id });
  b.log.push(`${e.name}隊潰散！`);
  if (e.genId) e.fallen = true; // 稍後以種子亂數判定是否被俘
}

export function doMove(b, u, q, r) {
  const reach = reachable(b, u);
  const node = reach.get(key(q, r));
  if (!node) return null;
  const path = pathTo(node);
  u.q = q; u.r = r; u.moved = true; u.steps = path.length - 1;
  checkKeep(b, u);
  return path;
}

export function doAttack(s, b, u, t) {
  if (u.acted || u.conf || b.over) return null;
  const targets = attackTargets(b, u);
  const tgt = targets.find(x => x.q === t.q && x.r === t.r);
  if (!tgt) return null;
  const ev = [{ kind: 'atk', id: u.id, q: tgt.q, r: tgt.r, ranged: dist(u, tgt) > 1 }];
  const d = previewDamage(b, u, tgt) * (0.9 + rand(s) * 0.2);
  if (tgt.kind === 'gate') {
    const k = key(tgt.q, tgt.r);
    b.gateHp[k] = Math.max(0, b.gateHp[k] - Math.round(d));
    ev.push({ kind: 'gate', q: tgt.q, r: tgt.r, dmg: Math.round(d) });
    if (b.gateHp[k] <= 0) { b.log.push(`${u.name}隊攻破了城門！`); ev.push({ kind: 'gatebreak', q: tgt.q, r: tgt.r }); }
    else b.log.push(`${u.name}隊衝擊城門（剩 ${b.gateHp[k]}）。`);
  } else {
    const e = tgt.unit;
    hurt(b, e, d, ev);
    b.log.push(`${u.name}攻擊${e.name}，造成 ${Math.round(d)} 傷亡。`);
    // 反擊：近戰且相鄰
    if (!e.dead && dist(u, e) === 1 && e.type !== 'siege' && !e.conf) {
      const cd = previewDamage(b, e, { kind: 'unit', unit: u }) * 0.5 * (0.9 + rand(s) * 0.2);
      ev.push({ kind: 'counter', id: e.id });
      hurt(b, u, cd, ev);
    }
  }
  u.acted = true; u.moved = true;
  u.energy = clamp(u.energy + 5, 0, 100);
  resolveFallen(s, b);
  checkEnd(b);
  return ev;
}

// ---------- 計策 ----------
export function tacticChance(b, u, kind, t) {
  if (kind === 'rouse') return 100;
  if (kind === 'rocks') return 85;
  const e = t && unitAt(b, t.q, t.r);
  const foeInt = e ? e.int : 40;
  let p = 50 + (u.int - foeInt) * 1.0;
  const tt = tileAt(b, t.q, t.r).t;
  if (kind === 'fire') { if (tt === 'forest') p += 20; if (tt === 'river') p -= 40; if (['wall', 'gate', 'inner', 'keep'].includes(tt)) p -= 20; if (b.winter) p += 10; }
  if (u.trait === '鬼謀') p += 15;
  return clamp(Math.round(p), 5, 95);
}

export function tacticTargets(b, u, kind) {
  const T = TACTICS[kind];
  if (u.energy < T.cost) return [];
  if (kind === 'rouse') return [{ q: u.q, r: u.r }];
  if (kind === 'rocks') {
    const tt = tileAt(b, u.q, u.r).t;
    if (!['hill', 'wall', 'gate'].includes(tt)) return [];
    return neighbors(u.q, u.r).some(h => { const e = unitAt(b, h.q, h.r); return e && e.side !== u.side; }) ? [{ q: u.q, r: u.r }] : [];
  }
  return alive(b, other(u.side)).filter(e => dist(u, e) <= T.range).map(e => ({ q: e.q, r: e.r }));
}

export function doTactic(s, b, u, kind, t) {
  if (u.acted || u.conf || b.over) return null;
  const T = TACTICS[kind];
  if (!tacticTargets(b, u, kind).some(x => x.q === t.q && x.r === t.r)) return null;
  u.energy -= T.cost; u.acted = true; u.moved = true;
  const ev = [{ kind: 'tactic', id: u.id, name: T.name, q: t.q, r: t.r }];
  const p = tacticChance(b, u, kind, t);
  if (!chance(s, p)) {
    ev.push({ kind: 'fail', q: t.q, r: t.r });
    b.log.push(`${u.name}的${T.name}被識破了。`);
    return ev;
  }
  if (kind === 'fire') {
    const tiles = [tileAt(b, t.q, t.r), ...neighbors(t.q, t.r).map(h => tileAt(b, h.q, h.r)).filter(x => x.t === 'forest' && chance(s, 50))];
    for (const x of tiles) if (x.t !== 'river') x.fire = 2;
    const e = unitAt(b, t.q, t.r);
    if (e) hurt(b, e, e.troops * 0.06 + u.int * 4, ev);
    ev.push({ kind: 'fire', tiles: tiles.map(x => ({ q: x.q, r: x.r })) });
    b.log.push(`${u.name}施放火計，烈焰四起！`);
  } else if (kind === 'confuse') {
    const e = unitAt(b, t.q, t.r);
    e.conf = 2;
    ev.push({ kind: 'conf', id: e.id });
    b.log.push(`${u.name}使${e.name}隊陷入混亂！`);
  } else if (kind === 'rouse') {
    for (const a of [u, ...neighbors(u.q, u.r).map(h => unitAt(b, h.q, h.r)).filter(x => x && x.side === u.side)]) {
      a.conf = 0; a.energy = clamp(a.energy + 15, 0, 100);
      ev.push({ kind: 'buff', id: a.id });
    }
    b.log.push(`${u.name}鼓舞士卒，軍心大振！`);
  } else if (kind === 'rocks') {
    for (const h of neighbors(u.q, u.r)) {
      const e = unitAt(b, h.q, h.r);
      if (e && e.side !== u.side) hurt(b, e, u.troops * 0.06 + u.int * 6 + 150, ev);
    }
    b.log.push(`${u.name}投下落石，敵軍死傷慘重！`);
  }
  resolveFallen(s, b);
  checkEnd(b);
  return ev;
}

// ---------- 單挑 ----------
export function duelCandidates(b, u) {
  if (!u.genId || u.acted || u.conf) return [];
  return neighbors(u.q, u.r).map(h => unitAt(b, h.q, h.r)).filter(e => e && e.side !== u.side && e.genId);
}
export function acceptsDuel(s, ch, t) {
  if (t.str >= ch.str) return true;
  return chance(s, Math.max(5, 60 - (ch.str - t.str) * 3));
}
// duel 結果：winner 'a' = u 勝、'd' = e 勝、null = 平手；ko 表示敗者體力歸零
export function applyDuel(s, b, u, e, winner, ko) {
  u.acted = true; u.moved = true;
  const ev = [];
  if (!winner) { b.log.push(`${u.name}與${e.name}大戰數十回合，不分勝負。`); return ev; }
  const [w, l] = winner === 'a' ? [u, e] : [e, u];
  b.log.push(`${w.name}在單挑中擊敗了${l.name}！`);
  hurt(b, l, l.troops * 0.25, ev);
  l.conf = Math.max(l.conf, 2);
  w.energy = clamp(w.energy + 20, 0, 100);
  if (ko && !l.dead && chance(s, 40)) {
    b.log.push(`${l.name}被生擒，其部隊潰散！`);
    (l.side === 'A' ? b.capturedA : b.capturedD).push(l.genId);
    l.genId = null; kill(b, l, ev);
  }
  resolveFallen(s, b);
  checkEnd(b);
  return ev;
}

function resolveFallen(s, b) {
  for (const u of b.units) {
    if (!u.fallen) continue;
    u.fallen = false;
    if (u.genId && chance(s, 35)) {
      (u.side === 'A' ? b.capturedA : b.capturedD).push(u.genId);
      b.log.push(`${u.name}被俘了！`);
    }
  }
}

function checkKeep(b, u) {
  if (u.side === 'A' && u.q === b.keep.q && u.r === b.keep.r) {
    b.log.push(`${u.name}攻佔了本陣！`);
    finish(b, 'A');
  }
}
function checkEnd(b) {
  if (b.over) return;
  if (!alive(b, 'A').length) return finish(b, 'D');
  if (!alive(b, 'D').length) return finish(b, 'A');
}
function finish(b, w) {
  if (b.over) return;
  b.over = true; b.winner = w;
  b.log.push(w === 'A' ? `攻方攻破${b.cityName}！` : `守方守住了${b.cityName}！`);
}
export function retreat(b, side) { b.log.push(`${side === 'A' ? '攻方' : '守方'}撤退了。`); finish(b, other(side)); }

// 結束一方回合：換邊、處理燃燒與混亂
export function endPhase(s, b) {
  const ev = [];
  if (b.over) return ev;
  b.side = other(b.side);
  // 輪到的一方：重置行動、混亂遞減（混亂 2 = 跳過自己的一個回合）
  for (const u of alive(b, b.side)) { u.moved = false; u.acted = false; u.steps = 0; if (u.conf) u.conf--; }
  if (b.side === 'A') {
    b.turn++;
    // 燃燒
    for (const t of b.tiles) {
      if (!t.fire) continue;
      const u = unitAt(b, t.q, t.r);
      if (u) hurt(b, u, u.troops * 0.05 + 60, ev);
      t.fire--;
    }
    for (const u of alive(b)) u.energy = clamp(u.energy + 10, 0, 100);
    resolveFallen(s, b);
    checkEnd(b);
    if (!b.over && b.turn > MAX_TURNS) { b.log.push('時限已到，攻方糧盡退兵。'); finish(b, 'D'); }
    if (!b.over) b.log.push(`第 ${b.turn} 回合`);
  }
  return ev;
}

export function totals(b) {
  const sum = side => b.units.filter(u => u.side === side).reduce((x, u) => x + Math.max(0, u.troops), 0);
  return { A: sum('A'), D: sum('D') };
}
export function result(s, b) {
  const t = totals(b);
  return { winner: b.winner, survA: Math.round(t.A), survD: Math.round(t.D), capturedA: [...new Set(b.capturedA)], capturedD: [...new Set(b.capturedD)] };
}

// ---------- AI ----------
function objective(b, u) {
  // 攻方：城門未破則往最近城門，破了往本陣
  const gates = Object.keys(b.gateHp).map(k => { const [q, r] = k.split(',').map(Number); return { q, r, open: b.gateHp[k] <= 0 }; });
  const open = gates.filter(g => g.open);
  if (open.length) return b.keep;
  return gates.sort((a, c) => dist(u, a) - dist(u, c))[0];
}

function positionScore(b, u, h) {
  const t = tileAt(b, h.q, h.r).t;
  let sc = 0;
  if (u.side === 'A') {
    const obj = objective(b, u);
    sc -= dist(h, obj) * (u.type === 'siege' ? 14 : 8);
    if (obj === b.keep) sc -= dist(h, b.keep) * 6;
  } else {
    const gates = Object.keys(b.gateHp).map(k => { const [q, r] = k.split(',').map(Number); return { q, r }; });
    const g = gates.sort((a, c) => dist(h, a) - dist(h, c))[0];
    sc -= dist(h, g) * 4;
    if (t === 'wall' || t === 'gate') sc += 30;
    if (h.q < 10) sc -= 25; // 不輕易出城
    sc -= dist(h, b.keep) * (alive(b, 'A').some(a => dist(a, b.keep) <= 3) ? 10 : 0);
  }
  sc += (1 - TERRAIN[t].def) * 60;
  if (tileAt(b, h.q, h.r).fire) sc -= 80;
  // 危險度：鄰近敵軍數
  const threats = alive(b, u.side === 'A' ? 'D' : 'A').filter(e => dist(e, h) <= 2).length;
  sc -= threats * (u.type === 'bow' ? 12 : 3);
  return sc;
}

// 決定並執行一支部隊的行動，回傳事件序列（含移動路徑）
export function aiUnit(s, b, u) {
  if (u.dead || u.acted || b.over) return [];
  if (u.conf) { u.moved = true; u.acted = true; return [{ kind: 'confused', id: u.id }]; }
  const reach = reachable(b, u);
  let best = { score: -1e9 };
  const oq = u.q, or = u.r;
  for (const node of reach.values()) {
    u.q = node.q; u.r = node.r;
    const base = positionScore(b, u, node);
    // 攻擊
    for (const t of attackTargets(b, u)) {
      const d = previewDamage(b, u, t);
      let sc;
      if (t.kind === 'gate') sc = d * 0.12 + 40;
      else {
        sc = d * 0.1 + (d >= t.unit.troops ? 120 : 0) + (t.unit.genId ? 8 : 0);
        if (dist(node, t) === 1 && t.unit.type !== 'siege') sc -= previewDamage(b, t.unit, { kind: 'unit', unit: u }) * 0.05;
      }
      if (sc + base * 0.6 > best.score) best = { score: sc + base * 0.6, node, act: 'attack', t };
    }
    // 計策（只在原地或移動後評估代表性的幾種）
    for (const kind of ['fire', 'confuse', 'rocks']) {
      if (u.energy < TACTICS[kind].cost) continue;
      for (const t of tacticTargets(b, u, kind)) {
        const p = tacticChance(b, u, kind, t) / 100;
        let v = 0;
        if (kind === 'fire') { const e = unitAt(b, t.q, t.r); v = e ? (e.troops * 0.06 + u.int * 4) * 0.12 + 20 : 0; }
        if (kind === 'confuse') { const e = unitAt(b, t.q, t.r); v = e ? e.troops * 0.012 + 20 : 0; }
        if (kind === 'rocks') v = neighbors(node.q, node.r).filter(h => { const e = unitAt(b, h.q, h.r); return e && e.side !== u.side; }).length * 45;
        const sc = v * p + base * 0.6;
        if (sc > best.score) best = { score: sc, node, act: 'tactic', kind, t };
      }
    }
    if (base > best.score) best = { score: base, node, act: 'wait' };
  }
  u.q = oq; u.r = or;
  if (!best.node) { u.moved = true; u.acted = true; return []; }
  const ev = [];
  if (best.node.q !== u.q || best.node.r !== u.r) {
    const path = doMove(b, u, best.node.q, best.node.r);
    ev.push({ kind: 'move', id: u.id, path });
  }
  if (b.over) return ev;
  if (best.act === 'attack') ev.push(...(doAttack(s, b, u, best.t) || []));
  else if (best.act === 'tactic') ev.push(...(doTactic(s, b, u, best.kind, best.t) || []));
  u.moved = true; u.acted = true;
  return ev;
}

export function aiOrder(b, side) {
  // 弓兵與謀士先動，近戰後動
  return alive(b, side).filter(u => !u.acted).sort((a, c) => (a.type === 'bow' ? 0 : 1) - (c.type === 'bow' ? 0 : 1) || c.int - a.int);
}

export function aiPhase(s, b) {
  const all = [];
  for (const u of aiOrder(b, b.side)) { all.push(...aiUnit(s, b, u)); if (b.over) break; }
  all.push(...endPhase(s, b));
  return all;
}

// AI 對 AI：完整自動戰鬥
export function autoBattle(s, b) {
  let guard = 0;
  while (!b.over && guard++ < 200) aiPhase(s, b);
  if (!b.over) finish(b, 'D');
  return result(s, b);
}
