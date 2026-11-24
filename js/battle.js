// 三路陣線戰：左、中、右三路，共 8 回合。
import { TRAITS } from './data.js';
import { rand, chance, clamp, gen, city, gensIn, pick } from './rules.js';

export const TYPES = { spear: '槍兵', cav: '騎兵', bow: '弓兵' };
export const LANES = ['左路', '中路', '右路'];
export const MAX_ROUNDS = 8;
const BEATS = { spear: 'cav', cav: 'bow', bow: 'spear' };

function laneTerrains(s, c) {
  const opts = ['P', 'P', 'M', 'F', 'R'];
  const seedState = { rng: (c.id * 2654435761) >>> 0 };
  const side = () => opts[Math.floor(rand(seedState) * opts.length)];
  return [side(), c.terrain, side()];
}

function makeUnit(s, side, g, troops, type, lane) {
  return {
    uid: `${side}${lane}`, side, genId: g ? g.id : null, name: g ? g.name : '守備隊',
    str: g ? g.str : 45, int: g ? g.int : 30, trait: g ? g.trait : null,
    troops: Math.round(troops), max: Math.round(troops), type, lane,
    morale: 100, spirit: 0, guard: 0, routed: false,
  };
}

export function prefType(s, g) {
  const t = g && TRAITS[g.trait] && TRAITS[g.trait].pref;
  if (t) return t;
  if (!g) return 'spear';
  return g.str >= 80 ? 'cav' : g.int >= 70 ? 'bow' : 'spear';
}

// 守方佈陣：針對攻方兵種選擇剋制兵種
function buildDefenders(s, c, attackers) {
  const units = [];
  const gens = c.owner ? gensIn(s, c.id, c.owner).sort((a, b) => (b.str + b.int / 2) - (a.str + a.int / 2)).slice(0, 3) : [];
  const n = gens.length || (c.troops > 0 ? 3 : 0);
  if (!n || c.troops <= 0) return units;
  const weights = gens.length ? gens.map(g => g.str + 50) : [1, 1, 1];
  const wsum = weights.reduce((a, b) => a + b, 0);
  // 決定哪一路放誰：最強者對攻方最強那一路
  const atkOrder = [0, 1, 2].sort((a, b) => {
    const ua = attackers.find(u => u.lane === a), ub = attackers.find(u => u.lane === b);
    return (ub ? ub.troops : -1) - (ua ? ua.troops : -1);
  });
  const lanesForN = n >= 3 ? atkOrder : n === 2 ? atkOrder.slice(0, 2) : [1];
  for (let i = 0; i < n; i++) {
    const g = gens[i] || null;
    const lane = lanesForN[i] ?? i;
    const enemy = attackers.find(u => u.lane === lane);
    let type = prefType(s, g);
    if (enemy && chance(s, 55)) type = Object.keys(BEATS).find(k => BEATS[k] === enemy.type);
    units.push(makeUnit(s, 'D', g, c.troops * weights[i] / wsum, type, lane));
  }
  return units;
}

// plan.units: [{ genId, troops, type, lane }]
export function createBattle(s, plan) {
  const c = city(s, plan.to);
  const attackers = plan.units.map(u => makeUnit(s, 'A', gen(s, u.genId), u.troops, u.type, u.lane));
  const winter = s.season === 3;
  if (winter) for (const u of attackers) u.morale = 85;
  const defenders = buildDefenders(s, c, attackers);
  return {
    cityId: c.id, cityName: c.name, atk: plan.faction, def: c.owner,
    wall: c.wall, terrain: laneTerrains(s, c), round: 0, units: [...attackers, ...defenders],
    tacticReady: { A: 0, D: 0 }, over: false, winner: null, log: [], capturedA: [], capturedD: [],
    winter, startA: attackers.reduce((a, u) => a + u.troops, 0), startD: defenders.reduce((a, u) => a + u.troops, 0),
  };
}

export const alive = (b, side) => b.units.filter(u => u.side === side && !u.routed);
export const unitAt = (b, side, lane) => b.units.find(u => u.side === side && u.lane === lane && !u.routed);
const other = side => (side === 'A' ? 'D' : 'A');

function terrainMult(u, t) {
  let m = 1;
  if (u.type === 'cav') m *= t === 'P' ? 1.2 : (t === 'M' || t === 'F') ? 0.8 : 0.9;
  if (u.type === 'bow' && t === 'F') m *= 1.1;
  if (t === 'R') m *= u.trait === '水戰' ? 1.2 : 0.9;
  return m;
}

function damage(s, b, u, t, flank) {
  let d = u.troops * 0.07 * (0.6 + u.str / 125) * (0.5 + u.morale / 200);
  if (BEATS[u.type] === t.type) d *= 1.3; else if (BEATS[t.type] === u.type) d *= 0.8;
  d *= terrainMult(u, b.terrain[u.lane]);
  if (u.trait === '突擊' && u.type === 'cav') d *= 1.15;
  if (u.trait === '神射' && u.type === 'bow') d *= 1.15;
  if (flank) d *= 1.25;
  d *= defenseMult(b, t);
  d *= 0.85 + rand(s) * 0.3;
  return Math.max(20, Math.round(d));
}

function defenseMult(b, t) {
  let m = 1;
  if (t.side === 'D' && b.def !== undefined) m *= 1 - (b.wall / 1000) * 0.35;
  if (t.guard > 0) m *= 0.5;
  if (t.trait === '鐵壁') m *= 0.9;
  if (t.trait === '善守' && t.side === 'D') m *= 0.85;
  return m;
}

function hurt(b, t, d, ev) {
  const real = Math.min(t.troops, d);
  t.troops -= real;
  t.morale = clamp(t.morale - (real / t.max) * 110 - 2, 0, 100);
  ev.push({ kind: 'hit', to: t.uid, dmg: real });
  return real;
}

function checkRout(b, ev) {
  for (const u of b.units) {
    if (u.routed) continue;
    if (u.troops <= 0 || u.morale <= 0) {
      u.routed = true;
      ev.push({ kind: 'rout', to: u.uid });
      b.log.push(`${u.name}隊潰散了！`);
      if (u.lane === 1) {
        for (const o of alive(b, u.side)) o.morale = clamp(o.morale - 15, 0, 100);
        b.log.push(`${u.side === 'A' ? '我方' : '敵方'}中路崩潰，全軍士氣大挫！`);
      }
    }
  }
}

function flankTarget(b, u) {
  const foes = alive(b, other(u.side));
  if (!foes.length) return null;
  return foes.sort((a, c) => Math.abs(a.lane - u.lane) - Math.abs(c.lane - u.lane) || a.troops - c.troops)[0];
}

// 執行一回合交戰，回傳動畫事件
export function resolveRound(s, b) {
  if (b.over) return [];
  b.round++;
  const ev = [];
  const hits = [];
  for (const u of b.units) {
    if (u.routed) continue;
    const opp = unitAt(b, other(u.side), u.lane);
    const t = opp || flankTarget(b, u);
    if (!t) continue;
    hits.push([u, t, damage(s, b, u, t, !opp)]);
    ev.push({ kind: 'atk', from: u.uid, to: t.uid, flank: !opp });
  }
  for (const [u, t, d] of hits) hurt(b, t, d, ev);
  for (const u of b.units) {
    if (u.routed) continue;
    u.spirit = clamp(u.spirit + 22 + Math.round(u.str / 12), 0, 100);
    if (u.guard > 0) u.guard--;
  }
  checkRout(b, ev);
  if (b.tacticReady.A > 0) b.tacticReady.A--;
  if (b.tacticReady.D > 0) b.tacticReady.D--;
  checkEnd(b);
  return ev;
}

function checkEnd(b) {
  const a = alive(b, 'A'), d = alive(b, 'D');
  if (!a.length) return finish(b, 'D');
  if (!d.length) return finish(b, 'A');
  if (b.round >= MAX_ROUNDS) {
    const ta = a.reduce((x, u) => x + u.troops, 0), td = d.reduce((x, u) => x + u.troops, 0);
    finish(b, ta > td * 2 ? 'A' : 'D');
  }
}

function finish(b, w) {
  b.over = true; b.winner = w;
  b.log.push(w === 'A' ? `攻方攻破${b.cityName}！` : `守方守住了${b.cityName}！`);
}

export function totals(b) {
  const sum = side => b.units.filter(u => u.side === side).reduce((x, u) => x + Math.max(0, u.troops), 0);
  return { A: sum('A'), D: sum('D') };
}

// 戰後結果給 rules.applyBattle
export function result(s, b) {
  const t = totals(b);
  // 戰敗方潰散的武將有機會被俘
  const loser = b.winner === 'A' ? 'D' : 'A';
  for (const u of b.units) {
    if (u.side !== loser || !u.genId || !u.routed) continue;
    if (loser === 'A' && chance(s, 25)) b.capturedA.push(u.genId);
  }
  return { winner: b.winner, survA: Math.round(t.A), survD: Math.round(t.D), capturedA: [...new Set(b.capturedA)], capturedD: [...new Set(b.capturedD)] };
}

// ---------- 指令 ----------
export function skillName(u) { return u.trait && TRAITS[u.trait] ? TRAITS[u.trait].skill : '猛攻'; }

export function useSkill(s, b, uid) {
  const u = b.units.find(x => x.uid === uid);
  if (!u || u.routed || u.spirit < 100) return null;
  u.spirit = 0;
  const ev = [{ kind: 'skill', from: u.uid, name: skillName(u) }];
  const opp = unitAt(b, other(u.side), u.lane) || flankTarget(b, u);
  const sk = skillName(u);
  if (sk === '堅陣') { u.guard = 2; u.morale = clamp(u.morale + 20, 0, 100); b.log.push(`${u.name}擺出「堅陣」，固守陣線！`); }
  else if (sk === '激勵') { for (const o of alive(b, u.side)) o.morale = clamp(o.morale + 20, 0, 100); b.log.push(`${u.name}「激勵」全軍，士氣大振！`); }
  else if (sk === '連弩齊射') {
    for (const t of alive(b, other(u.side))) hurt(b, t, Math.round(u.troops * 0.07 * (u.str / 70) * defenseMult(b, t)), ev);
    b.log.push(`${u.name}發動「連弩齊射」，箭如雨下！`);
  } else if (sk === '奇策' && opp) {
    opp.morale = clamp(opp.morale - 35, 0, 100); ev.push({ kind: 'hit', to: opp.uid, dmg: 0 });
    b.log.push(`${u.name}施展「奇策」，${opp.name}隊陷入混亂！`);
  } else if (opp) {
    const mult = sk === '突陣' ? 0.2 : 0.15;
    hurt(b, opp, Math.round(u.troops * mult * (u.str / 70) * defenseMult(b, opp)), ev);
    if (sk === '突陣') opp.morale = clamp(opp.morale - 15, 0, 100);
    b.log.push(`${u.name}發動「${sk}」，猛擊${opp.name}隊！`);
  }
  checkRout(b, ev); checkEnd(b);
  return ev;
}

export function tacticCaster(b, side) {
  return alive(b, side).filter(u => u.genId).sort((a, c) => c.int - a.int)[0] || null;
}

export function tacticChance(b, side, target) {
  const caster = tacticCaster(b, side);
  if (!caster || !target) return 0;
  const foe = tacticCaster(b, other(side));
  let p = 45 + (caster.int - (foe ? foe.int : 30)) * 0.8;
  const t = b.terrain[target.lane];
  if (t === 'F') p += 15; if (t === 'R') p -= 15;
  if (caster.trait === '鬼謀') p += 15;
  return clamp(Math.round(p), 5, 95);
}

export function useTactic(s, b, side, targetUid) {
  const t = b.units.find(x => x.uid === targetUid);
  if (b.tacticReady[side] > 0 || !t || t.routed) return null;
  const caster = tacticCaster(b, side);
  const p = tacticChance(b, side, t);
  b.tacticReady[side] = 2;
  const ev = [{ kind: 'fire', to: t.uid }];
  if (chance(s, p)) {
    hurt(b, t, Math.round(t.troops * 0.12 + caster.int * 6), ev);
    t.morale = clamp(t.morale - 12, 0, 100);
    b.log.push(`${caster.name}施放火計，${t.name}隊陷入火海！`);
  } else {
    ev.length = 0;
    ev.push({ kind: 'fail', to: t.uid });
    b.log.push(`${caster.name}的火計被識破了。`);
  }
  checkRout(b, ev); checkEnd(b);
  return ev;
}

export function swapLane(b, uid, lane) {
  const u = b.units.find(x => x.uid === uid);
  if (!u || u.routed || u.lane === lane) return false;
  const o = unitAt(b, u.side, lane);
  if (o) o.lane = u.lane;
  u.lane = lane;
  b.log.push(`${u.name}隊轉往${LANES[lane]}。`);
  return true;
}

export function retreat(b, side) {
  finish(b, other(side));
  b.log.push(`${side === 'A' ? '攻方' : '守方'}撤退了。`);
}

// ---------- 單挑 ----------
// 攻 剋 奇、奇 剋 守、守 剋 攻
export const DUEL_MOVES = { atk: '攻', def: '守', trick: '奇' };
const DUEL_BEATS = { atk: 'trick', trick: 'def', def: 'atk' };

export function createDuel(s, a, d) {
  // 對手的傾向：勇越高越愛進攻，謀越高越愛奇招
  const w = { atk: 30 + d.str / 3, def: 30 + (100 - d.str) / 4, trick: 20 + d.int / 3 };
  return { a, d, hpA: 100, hpD: 100, round: 0, w, last: null, over: false, winner: null };
}

export function duelHint(s, duel) {
  if (duel.a.str < duel.d.str - 5) return null;
  const k = Object.keys(duel.w).sort((x, y) => duel.w[y] - duel.w[x])[0];
  return `你看穿了${duel.d.name}的架勢，他似乎想要「${DUEL_MOVES[k]}」。`;
}

function weighted(s, w) {
  const tot = w.atk + w.def + w.trick;
  let r = rand(s) * tot;
  for (const k of ['atk', 'def', 'trick']) { if ((r -= w[k]) < 0) return k; }
  return 'trick';
}

export function duelRound(s, duel, mine) {
  const theirs = weighted(s, duel.w);
  duel.round++;
  let txt;
  const dmg = (x, y) => Math.round(18 + (x.str - y.str) * 0.6 + rand(s) * 10);
  if (mine === theirs) {
    const a = Math.max(4, Math.round(dmg(duel.a, duel.d) / 3)), d = Math.max(4, Math.round(dmg(duel.d, duel.a) / 3));
    duel.hpD -= a; duel.hpA -= d; txt = `雙方同時出「${DUEL_MOVES[mine]}」，刀來槍往，互有損傷。`;
  } else if (DUEL_BEATS[mine] === theirs) {
    const d = Math.max(8, dmg(duel.a, duel.d)); duel.hpD -= d;
    txt = `你出「${DUEL_MOVES[mine]}」破了對手的「${DUEL_MOVES[theirs]}」，重創${duel.d.name}！`;
  } else {
    const d = Math.max(8, dmg(duel.d, duel.a)); duel.hpA -= d;
    txt = `${duel.d.name}以「${DUEL_MOVES[theirs]}」破了你的「${DUEL_MOVES[mine]}」，你負傷了！`;
  }
  duel.hpA = Math.max(0, duel.hpA); duel.hpD = Math.max(0, duel.hpD);
  duel.last = { mine, theirs, txt };
  if (duel.hpA <= 0 || duel.hpD <= 0 || duel.round >= 6) {
    duel.over = true;
    duel.winner = duel.hpA === duel.hpD ? null : duel.hpA > duel.hpD ? 'a' : 'd';
  }
  return duel;
}

// 自動單挑（AI 對 AI 或略過時）
export function autoDuel(s, a, d) {
  const duel = createDuel(s, a, d);
  while (!duel.over) duelRound(s, duel, weighted(s, { atk: 33, def: 33, trick: 33 }));
  return duel;
}

// 單挑結果套用到戰場：a、d 是 battle unit
export function applyDuel(s, b, ua, ud, duel) {
  if (!duel.winner) { b.log.push(`${ua.name}與${ud.name}大戰數十回合，不分勝負。`); return; }
  const [w, l] = duel.winner === 'a' ? [ua, ud] : [ud, ua];
  const ko = (duel.winner === 'a' ? duel.hpD : duel.hpA) <= 0;
  l.morale = clamp(l.morale - 40, 0, 100);
  w.morale = clamp(w.morale + 15, 0, 100);
  b.log.push(`${w.name}在單挑中擊敗了${l.name}！`);
  if (ko && l.genId && chance(s, 45)) {
    l.routed = true;
    (l.side === 'A' ? b.capturedA : b.capturedD).push(l.genId);
    b.log.push(`${l.name}被生擒了！`);
  }
  const ev = [];
  checkRout(b, ev); checkEnd(b);
}

// 願不願意接受單挑
export function acceptsDuel(s, challenger, target) {
  if (!target.genId) return false;
  if (target.str >= challenger.str) return true;
  return chance(s, Math.max(5, 60 - (challenger.str - target.str) * 3));
}

// ---------- AI 指令 ----------
export function aiCommand(s, b, side) {
  if (b.over) return null;
  const mine = alive(b, side);
  const ready = mine.filter(u => u.spirit >= 100).sort((a, c) => c.troops - a.troops)[0];
  if (ready) return useSkill(s, b, ready.uid) && { kind: 'skill' };
  if (b.tacticReady[side] === 0) {
    const foes = alive(b, other(side)).sort((a, c) => c.troops - a.troops);
    const t = foes[0];
    if (t && tacticChance(b, side, t) >= 55) return useTactic(s, b, side, t.uid) && { kind: 'tactic' };
  }
  return null;
}

// 完整自動戰鬥（AI 對 AI）
export function autoBattle(s, b) {
  while (!b.over) {
    aiCommand(s, b, 'A');
    if (b.over) break;
    aiCommand(s, b, 'D');
    if (b.over) break;
    // AI 偶爾單挑
    if (b.round === 1) {
      for (const ua of alive(b, 'A')) {
        const ud = unitAt(b, 'D', ua.lane);
        if (ud && ud.genId && ua.str >= ud.str + 10 && chance(s, 30) && acceptsDuel(s, ua, ud)) {
          applyDuel(s, b, ua, ud, autoDuel(s, ua, ud));
          break;
        }
      }
      if (b.over) break;
    }
    resolveRound(s, b);
  }
  return result(s, b);
}
