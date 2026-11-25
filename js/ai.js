// AI 層：效用評分，依君主方針加權。
import {
  fac, city, citiesOf, gensIn, gensOf, ADJ, atPeace, doCityAction, calcOrders, chance, rand, clamp,
  capOf, troopCapOf, moveUnits, diplomacy, power, gen, randInt, recruitChance, changeRel, pick,
} from './rules.js';
import { prefType } from './battle.js';

const THRESH = { 擴張: 0.95, 穩健: 1.15, 投機: 1.0, 守成: 1.4 };

function defenseStrength(s, c) {
  const gens = c.owner ? gensIn(s, c.id, c.owner) : [];
  const best = gens.reduce((a, g) => Math.max(a, g.str), 45);
  return c.troops * (1 + c.wall / 1000 * 0.3) * (0.75 + best / 200);
}

function frontline(s, fid, c) {
  return ADJ[c.id].some(n => { const o = city(s, n).owner; return o !== fid && !atPeace(s, fid, o); });
}

function threat(s, fid, c) {
  return ADJ[c.id].reduce((m, n) => {
    const o = city(s, n);
    return o.owner && o.owner !== fid && !atPeace(s, fid, o.owner) ? Math.max(m, o.troops) : m;
  }, 0);
}

// 規劃一個勢力本季的行動；出征以 plan 形式回傳，由呼叫端執行戰鬥
export function planTurn(s, fid) {
  const f = fac(s, fid);
  let orders = calcOrders(s, fid);
  const attacks = [];
  const th = THRESH[f.aiType] || 1.5;
  const myCities = citiesOf(s, fid);
  const targeted = new Set();

  // 1) 出征
  const cand = [];
  for (const c of myCities) {
    const gens = gensIn(s, c.id, fid).filter(g => !g.acted);
    if (!gens.length || c.troops < 3000) continue;
    for (const tid of ADJ[c.id]) {
      const t = city(s, tid);
      if (t.owner === fid || atPeace(s, fid, t.owner)) continue;
      let need = defenseStrength(s, t) * th;
      if (s.coalition && s.coalition.target === t.owner) need *= 0.85;
      if (!t.owner) need *= 1.1;
      if (t.owner === s.player) { if (s.turn < 3) continue; need *= 1.15; }
      if (s.season === 3) need *= 1.2;
      const avail = c.troops * (frontline(s, fid, c) && threat(s, fid, c) > c.troops * 0.5 ? 0.6 : 0.8);
      if (avail > need) cand.push({ c, t, avail, score: avail / need + (t.owner ? 0 : 0.1) + (t.size === '大' ? 0.2 : 0) + rand(s) * 0.3 });
    }
  }
  cand.sort((a, b) => b.score - a.score);
  for (const k of cand) {
    if (orders <= 0 || attacks.length >= 2) break;
    if (targeted.has(k.t.id)) continue;
    if (attacks.some(a => a.from === k.c.id)) continue;
    if (f.food < k.avail / 10) continue;
    const gens = gensIn(s, k.c.id, fid).filter(g => !g.acted).sort((a, b) => b.str + b.int / 3 - (a.str + a.int / 3)).slice(0, 3);
    // 君主留守機率
    const units = [];
    const n = gens.length;
    const lanes = n === 1 ? [1] : n === 2 ? [1, 0] : [1, 0, 2];
    gens.forEach((g, i) => units.push({ genId: g.id, troops: Math.floor(k.avail / n), type: prefType(s, g), lane: lanes[i] }));
    // 城防高時，最弱的一位改帶衝車
    if (n >= 3 && k.t.wall >= 400) units[n - 1].type = 'siege';
    for (const g of gens) g.acted = true;
    f.food -= Math.round(k.avail / 10);
    attacks.push({ faction: fid, from: k.c.id, to: k.t.id, units });
    targeted.add(k.t.id);
    orders--;
  }

  // 2) 內政
  const work = [];
  for (const c of myCities) {
    for (const g of gensIn(s, c.id, fid).filter(x => !x.acted)) work.push({ c, g });
  }
  work.sort(() => rand(s) - 0.5);
  for (const { c, g } of work) {
    if (orders <= 0) break;
    const front = frontline(s, fid, c);
    const thr = threat(s, fid, c);
    const opts = [];
    if (c.troops < troopCapOf(c) && f.gold >= 100 && f.food > 800) opts.push(['draft', (front ? 3 : 1) * (thr > c.troops ? 2 : 1) + (c.order > 50 ? 0.5 : -1)]);
    if (c.order < 75) opts.push(['govern', (80 - c.order) / 10]);
    if (c.farm < capOf(c) && f.gold >= 50) opts.push(['farm', f.food < 3000 ? 2.5 : 1.2]);
    if (c.market < capOf(c) && f.gold >= 50) opts.push(['market', f.gold < 600 ? 2.5 : 1.2]);
    if (c.wall < capOf(c) && f.gold >= 60 && front) opts.push(['wall', f.aiType === '守成' ? 1.8 : 0.8]);
    if (s.generals.some(x => x.city === c.id && (x.status === 'hidden' || x.status === 'free')) && chance(s, 30)) opts.push(['search', 2]);
    if (!opts.length) continue;
    opts.sort((a, b) => b[1] - a[1]);
    const act = opts[0][0];
    const r = doCityAction(s, fid, c.id, g.id, act);
    if (r.ok) orders--;
  }

  // 3) 調兵：後方往前線
  for (const c of myCities) {
    if (frontline(s, fid, c) || c.troops < 4000) continue;
    const dest = ADJ[c.id].map(id => city(s, id)).filter(x => x.owner === fid && frontline(s, fid, x)).sort((a, b) => a.troops - b.troops)[0];
    if (dest) moveUnits(s, fid, c.id, dest.id, [], Math.floor(c.troops * 0.6));
    // 武將也往前線靠
    const idle = gensIn(s, c.id, fid).filter(g => g.id !== f.ruler);
    if (dest && idle.length > 1) moveUnits(s, fid, c.id, dest.id, [idle[0].id], 0);
  }

  // 4) 外交
  if (chance(s, 20) && f.gold > 900) {
    const others = Object.values(s.factions).filter(o => o.alive && o.id !== fid && o.id !== s.player);
    if (others.length) {
      const strong = others.sort((a, b) => power(s, b.id) - power(s, a.id))[0];
      if (f.aiType !== '擴張' || chance(s, 30)) diplomacy(s, fid, strong.id, 'gift');
    }
  }
  if (chance(s, 10)) {
    const others = Object.values(s.factions).filter(o => o.alive && o.id !== fid && o.id !== s.player);
    for (const o of others) if ((f.relations[o.id] || 0) >= 0 && !atPeace(s, fid, o.id) && chance(s, 30)) diplomacy(s, fid, o.id, 'truce');
  }
  // AI 偶爾向玩家贈禮
  const p = s.player;
  if (fac(s, p).alive && chance(s, 6) && (f.relations[p] || 0) > 20 && f.gold > 1200) {
    f.gold -= 200; fac(s, p).gold += 200; changeRel(s, fid, p, 8);
    s.log.unshift({ t: '', text: `${f.name}遣使贈送 200 金，表示友好。`, kind: '' });
  }
  return attacks;
}

// 對玩家提出的外交回應：AI 在玩家贈禮後偶爾主動提議停戰
export function aiProposals(s) {
  const out = [];
  const p = s.player;
  for (const f of Object.values(s.factions)) {
    if (!f.alive || f.id === p) continue;
    const rel = f.relations[p] || 0;
    if (!atPeace(s, f.id, p) && rel >= 30 && chance(s, 12)) out.push({ from: f.id, kind: 'truce' });
    else if (!f.alliance[p] && rel >= 70 && chance(s, 10)) out.push({ from: f.id, kind: 'ally' });
  }
  return out.slice(0, 1);
}
