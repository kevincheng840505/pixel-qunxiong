// 部隊與行軍：武將帶兵離城成為地圖上的部隊，每月沿道路或水路前進。
// 規則層，不碰畫面；戰鬥交給呼叫端提供的 battle(kind, plan) 回呼。
import {
  ADJ, edgeOf, city, gen, fac, citiesOf, gensIn, atPeace, chance, pick, clamp, log, changeRel,
  troopCapOf, armyTroops, checkVictory, checkElimination,
} from './rules.js';

export const SPEED = 46;          // 每月陸路行進距離（地圖單位）
export const WATER_MUL = 1.8;     // 水路倍率
export const FOOD_RATE = 0.03;    // 每兵每月耗糧
const STEPS = 12;

export const armyOf = (s, id) => s.armies.find(a => a.id === id);
export const armiesOf = (s, fid) => s.armies.filter(a => a.faction === fid);
export const leaderOf = (s, a) => gen(s, a.units[0].genId);
export const hostile = (s, a, b) => a !== b && !atPeace(s, a, b);

// 可通行：己方或和平勢力的據點才能穿越；中立與敵方據點只能當終點
function passable(s, fid, id) { const o = city(s, id).owner; return o === fid || (o && atPeace(s, fid, o)); }

// 最短路（Dijkstra），水路以加速後的距離計
export function findPath(s, fid, from, to) {
  if (from === to) return [];
  const dist = { [from]: 0 }, prev = {}, done = new Set();
  const open = [from];
  while (open.length) {
    open.sort((a, b) => dist[a] - dist[b]);
    const cur = open.shift();
    if (cur === to) break;
    if (done.has(cur)) continue;
    done.add(cur);
    if (cur !== from && !passable(s, fid, cur)) continue;
    for (const n of ADJ[cur]) {
      const e = edgeOf(cur, n);
      const d = dist[cur] + (e.type === 'water' ? e.len / WATER_MUL : e.len);
      if (dist[n] == null || d < dist[n]) { dist[n] = d; prev[n] = cur; open.push(n); }
    }
  }
  if (dist[to] == null) return null;
  const path = [];
  for (let n = to; n !== from; n = prev[n]) path.unshift(n);
  return path;
}

export function pathMonths(s, fid, from, path) {
  let d = 0, cur = from;
  for (const n of path) { const e = edgeOf(cur, n); d += e.type === 'water' ? e.len / WATER_MUL : e.len; cur = n; }
  return d / SPEED;
}

// 部隊在地圖上的位置
export function armyXY(s, a) {
  if (a.edge) {
    const A = city(s, a.edge.from), B = city(s, a.edge.to), e = edgeOf(a.edge.from, a.edge.to);
    const t = clamp(a.edge.prog / e.len, 0, 1);
    return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, water: e.type === 'water' };
  }
  const c = city(s, a.at);
  // 同一據點多支部隊時略為錯開
  const same = s.armies.filter(x => !x.edge && x.at === a.at);
  const i = same.indexOf(a);
  return { x: c.x + 5 + i * 4, y: c.y - 6, water: false };
}

// 出陣：units [{ genId, troops, type }]
export function muster(s, fid, from, units, food, dest) {
  const c = city(s, from), f = fac(s, fid);
  if (c.owner !== fid) return { ok: false, msg: '只能從己方據點出陣' };
  if (!units.length) return { ok: false, msg: '請選擇武將' };
  const total = units.reduce((a, u) => a + u.troops, 0);
  if (total < 100) return { ok: false, msg: '兵力太少' };
  if (total > c.troops) return { ok: false, msg: '兵力不足' };
  if (food > f.food) return { ok: false, msg: '糧草不足' };
  for (const u of units) { const g = gen(s, u.genId); if (g.city !== from || g.faction !== fid || g.status !== 'active' || g.acted) return { ok: false, msg: `${g.name}無法出陣` }; }
  const path = dest === from ? [] : findPath(s, fid, from, dest);
  if (path == null) return { ok: false, msg: '無法抵達該地' };
  const a = { id: ++s.armySeq, faction: fid, units: units.map(u => ({ genId: u.genId, troops: Math.round(u.troops), type: u.type })), food: Math.round(food), at: from, edge: null, path, dest, origin: from, last: from };
  c.troops -= total; f.food -= Math.round(food);
  for (const u of units) { const g = gen(s, u.genId); g.city = null; g.army = a.id; g.acted = true; }
  s.armies.push(a);
  return { ok: true, army: a, msg: `${leaderOf(s, a).name}率 ${total} 兵自${c.name}出陣，目標${city(s, dest).name}。` };
}

// 改變目的地
export function reroute(s, a, dest) {
  const from = a.edge ? a.edge.to : a.at;
  let path = findPath(s, a.faction, from, dest);
  if (path == null) return { ok: false, msg: '無法抵達該地' };
  if (a.edge) {
    // 已在路上：可以掉頭
    const back = findPath(s, a.faction, a.edge.from, dest);
    if (back && (back.length < path.length || dest === a.edge.from)) {
      a.edge = { from: a.edge.to, to: a.edge.from, prog: edgeOf(a.edge.from, a.edge.to).len - a.edge.prog };
      path = back;
    }
    a.path = [a.edge.to, ...path.filter((n, i) => !(i === 0 && n === a.edge.to))];
    if (a.path[0] !== a.edge.to) a.path.unshift(a.edge.to);
  } else a.path = path;
  a.dest = dest;
  return { ok: true, msg: `改往${city(s, dest).name}。` };
}

// 解散入城（須在己方據點）
export function disband(s, a) {
  if (a.edge) return { ok: false, msg: '部隊仍在路上' };
  const c = city(s, a.at);
  if (c.owner !== a.faction) return { ok: false, msg: '只能在己方據點解散' };
  const t = armyTroops(a);
  c.troops = Math.min(troopCapOf(c), c.troops + t);
  fac(s, a.faction).food += a.food;
  for (const u of a.units) { const g = gen(s, u.genId); g.army = null; g.city = c.id; }
  s.armies = s.armies.filter(x => x !== a);
  return { ok: true, msg: `${leaderOf(s, a) ? leaderOf(s, a).name : '部隊'}進入${c.name}。` };
}

// 退回最近的己方據點
function nearestOwn(s, fid, from) {
  const seen = new Set([from]), q = [from];
  while (q.length) {
    const cur = q.shift();
    if (city(s, cur).owner === fid) return cur;
    for (const n of ADJ[cur]) if (!seen.has(n)) { seen.add(n); q.push(n); }
  }
  const own = citiesOf(s, fid);
  return own.length ? own[0].id : null;
}

function retreatHome(s, a, why) {
  const home = nearestOwn(s, a.faction, a.edge ? a.edge.from : a.at);
  s.armies = s.armies.filter(x => x !== a);
  if (home == null) { for (const u of a.units) { const g = gen(s, u.genId); g.army = null; g.status = 'free'; g.faction = null; g.city = a.last; } return; }
  const c = city(s, home);
  c.troops = Math.min(troopCapOf(c), c.troops + armyTroops(a));
  fac(s, a.faction).food += Math.max(0, a.food);
  for (const u of a.units) { const g = gen(s, u.genId); g.army = null; g.city = home; }
  if (why) log(s, `${fac(s, a.faction).name}軍${why}，退回${c.name}。`, a.faction === s.player ? 'warn' : '');
}

// 戰後：依戰場上各武將剩餘兵力更新部隊；兵力歸零的武將自行逃回
function applyUnits(s, a, side, res) {
  const left = res.units.filter(u => u.side === side && u.genId);
  for (const u of a.units) {
    const r = left.find(x => x.genId === u.genId);
    u.troops = r ? r.troops : 0;
  }
  const caught = side === 'A' ? res.capturedA : res.capturedD;
  const keep = a.units.filter(u => !caught.includes(u.genId) && u.troops > 0);
  for (const u of a.units) {
    if (keep.includes(u) || caught.includes(u.genId)) continue;
    const g = gen(s, u.genId);
    if (g.status !== 'active') continue;
    const home = nearestOwn(s, a.faction, a.last);
    g.army = null;
    if (home == null) { g.status = 'free'; g.faction = null; g.city = a.last; } else g.city = home;
  }
  a.units = keep;
  return a.units.length > 0;
}

function captureGens(s, ids, captor, where) {
  const out = [];
  for (const id of ids) {
    const g = gen(s, id);
    if (g.status === 'captive' || g.status === 'dead') continue;
    g.army = null; g.city = where;
    if (!captor) { const h = g.faction && nearestOwn(s, g.faction, where); if (h != null && h !== false) g.city = h; else { g.status = 'free'; g.faction = null; } continue; }
    g.status = 'captive'; g.captor = captor; out.push(id);
  }
  return out;
}

// 攻城結果
function resolveSiege(s, a, node, res, ev) {
  const c = city(s, node), def = c.owner, atk = a.faction;
  if (def) changeRel(s, atk, def, -15);
  for (const u of a.units) gen(s, u.genId).exp += 2;
  const caps = [];
  caps.push(...captureGens(s, res.capturedA, def, node));
  caps.push(...captureGens(s, res.capturedD, atk, node));
  if (res.winner === 'A') {
    const defGens = def ? gensIn(s, c.id, def) : [];
    const escapes = def ? ADJ[c.id].filter(id => city(s, id).owner === def) : [];
    for (const g of defGens) {
      const isRuler = fac(s, def).ruler === g.id;
      const other = citiesOf(s, def).filter(x => x.id !== c.id);
      if (escapes.length && (isRuler || chance(s, 55))) g.city = pick(s, escapes);
      else if (isRuler && other.length) g.city = other[0].id;
      else { g.status = 'captive'; g.captor = atk; caps.push(g.id); }
    }
    applyUnits(s, a, 'A', res);
    c.owner = atk;
    c.troops = Math.min(troopCapOf(c), armyTroops(a));
    c.order = clamp(c.order - 10, 10, 100);
    fac(s, atk).food += Math.max(0, a.food);
    for (const u of a.units) { const g = gen(s, u.genId); if (g.status === 'active') { g.army = null; g.city = c.id; } }
    s.armies = s.armies.filter(x => x !== a);
    log(s, `${fac(s, atk).name}攻下了${c.name}！`, atk === s.player || def === s.player ? 'big' : '');
    ev.push({ kind: 'capture', node, faction: atk });
    if (def) checkElimination(s, def, atk);
  } else {
    c.troops = res.survD;
    const alive = applyUnits(s, a, 'A', res);
    log(s, `${fac(s, atk).name}進攻${c.name}失利。`, atk === s.player || def === s.player ? 'big' : '');
    if (alive) retreatHome(s, a, '攻城失利');
    else s.armies = s.armies.filter(x => x !== a);
  }
  return caps;
}

// 野戰結果
function resolveField(s, A, D, res, ev) {
  changeRel(s, A.faction, D.faction, -10);
  const caps = [];
  caps.push(...captureGens(s, res.capturedA, D.faction, A.last));
  caps.push(...captureGens(s, res.capturedD, A.faction, D.last));
  const okA = applyUnits(s, A, 'A', res), okD = applyUnits(s, D, 'D', res);
  const name = x => fac(s, x.faction).name;
  if (res.draw) {
    log(s, `${name(A)}軍與${name(D)}軍交戰，不分勝負。`, A.faction === s.player || D.faction === s.player ? 'big' : '');
    // 雙方都停下，攻方退後一步
    A.path = []; D.path = [];
    if (okA) retreatHome(s, A, '收兵'); else s.armies = s.armies.filter(x => x !== A);
    if (!okD) s.armies = s.armies.filter(x => x !== D);
    return caps;
  }
  const [W, L, okW, okL] = res.winner === 'A' ? [A, D, okA, okD] : [D, A, okD, okA];
  log(s, `${name(W)}軍在野戰中擊敗了${name(L)}軍！`, A.faction === s.player || D.faction === s.player ? 'big' : '');
  if (okL) retreatHome(s, L, '敗退'); else s.armies = s.armies.filter(x => x !== L);
  if (!okW) s.armies = s.armies.filter(x => x !== W);
  ev.push({ kind: 'field', winner: W.faction });
  return caps;
}


// 抵達據點
async function arrive(s, a, node, hooks, ev) {
  a.last = node;
  const c = city(s, node);
  if (c.owner === a.faction || (c.owner && atPeace(s, a.faction, c.owner))) {
    if (!a.path.length && c.owner === a.faction) { disband(s, a); ev.push({ kind: 'arrive', node }); }
    return;
  }
  // 中立或敵方據點：停下攻城
  a.path = [];
  const defenders = c.owner ? gensIn(s, c.id, c.owner) : [];
  if (c.troops <= 0 && !defenders.length) {
    const old = c.owner;
    c.owner = a.faction; c.troops = Math.min(troopCapOf(c), armyTroops(a));
    for (const u of a.units) { const g = gen(s, u.genId); g.army = null; g.city = c.id; }
    fac(s, a.faction).food += a.food;
    s.armies = s.armies.filter(x => x !== a);
    log(s, `${fac(s, a.faction).name}兵不血刃取得${c.name}。`, a.faction === s.player || old === s.player ? 'big' : '');
    if (old) checkElimination(s, old, a.faction);
    return;
  }
  const plan = { faction: a.faction, from: a.origin, to: node, units: a.units.map(u => ({ ...u })), armyId: a.id };
  const res = await hooks.battle('siege', plan, { army: a, node });
  const caps = resolveSiege(s, a, node, res, ev);
  if (hooks.captives && caps.length) await hooks.captives(caps);
}

// 一個月的行軍：所有勢力的部隊同時前進
export async function marchMonth(s, hooks) {
  const ev = [];
  const spd = SPEED * (s.season === 3 ? 0.8 : 1);
  for (let step = 0; step < STEPS; step++) {
    for (const a of [...s.armies]) {
      if (!s.armies.includes(a)) continue;
      let budget = spd / STEPS;
      while (budget > 0 && s.armies.includes(a) && (a.edge || a.path.length)) {
        if (!a.edge) a.edge = { from: a.at, to: a.path[0], prog: 0 }, a.at = null;
        const e = edgeOf(a.edge.from, a.edge.to);
        const mul = e.type === 'water' ? WATER_MUL : 1;
        const need = (e.len - a.edge.prog) / mul;
        if (budget < need) { a.edge.prog += budget * mul; budget = 0; break; }
        budget -= need;
        const node = a.edge.to;
        a.edge = null; a.at = node; a.path.shift();
        await arrive(s, a, node, hooks, ev);
        if (!s.armies.includes(a) || !a.path.length) break;
      }
    }
    await encounters(s, hooks, ev);
    if (hooks.frame) await hooks.frame(step);
    if (s.over) break;
  }
  // 糧草
  for (const a of [...s.armies]) {
    a.food -= Math.round(armyTroops(a) * FOOD_RATE);
    if (a.food < 0) {
      a.food = 0;
      for (const u of a.units) u.troops = Math.round(u.troops * 0.85);
      if (a.faction === s.player) log(s, `${leaderOf(s, a).name}軍糧草斷絕，士兵逃散！`, 'warn');
    }
    // 停在己方據點且已到達目的地者自動入城
    if (!a.edge && !a.path.length && city(s, a.at).owner === a.faction && a.dest === a.at) disband(s, a);
  }
  checkVictory(s);
  return ev;
}

async function encounters(s, hooks, ev) {
  for (let i = 0; i < s.armies.length; i++) for (let j = i + 1; j < s.armies.length; j++) {
    const A = s.armies[i], D = s.armies[j];
    if (!A || !D || !hostile(s, A.faction, D.faction)) continue;
    const pa = armyXY(s, A), pd = armyXY(s, D);
    const sameEdge = A.edge && D.edge && ((A.edge.from === D.edge.from && A.edge.to === D.edge.to) || (A.edge.from === D.edge.to && A.edge.to === D.edge.from));
    const close = Math.hypot(pa.x - pd.x, pa.y - pd.y) < (sameEdge ? 4 : 2.5);
    const atNode = !A.edge && !D.edge && A.at === D.at;
    if (!close && !atNode) continue;
    // 正在移動者為攻方
    const [att, dfn] = (D.path.length && !A.path.length) ? [D, A] : [A, D];
    const c = city(s, att.last);
    const plan = {
      field: true, faction: att.faction, defFaction: dfn.faction, units: att.units.map(u => ({ ...u })), defUnits: dfn.units.map(u => ({ ...u })),
      terrain: c.terrain, water: pa.water || pd.water, seed: att.id * 31 + dfn.id, name: `${c.name}附近`,
    };
    const res = await hooks.battle('field', plan, { a: att, d: dfn });
    const caps = resolveField(s, att, dfn, res, ev);
    if (hooks.captives && caps.length) await hooks.captives(caps);
    return encounters(s, hooks, ev);
  }
}
