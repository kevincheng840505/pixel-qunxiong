// 規則層：不碰任何畫面，可在 Node 中無畫面模擬。
import { FACTIONS, EXTRA_FACTIONS, CITIES, EDGES, GENERALS, SIZE_INFO, RULERS, INIT_RELATIONS, SEASONS } from './data.js';

// ---------- 隨機數（可重現） ----------
export function rand(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randInt = (s, a, b) => a + Math.floor(rand(s) * (b - a + 1));
export const chance = (s, pct) => rand(s) * 100 < pct;
export const pick = (s, arr) => arr[Math.floor(rand(s) * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- 地圖 ----------
export const ADJ = {};
export const EDGE = {};   // `${a}-${b}` -> { type, len }
for (const c of CITIES) ADJ[c.id] = [];
for (const [a, b, type] of EDGES) {
  ADJ[a].push(b); ADJ[b].push(a);
  const A = CITIES[a - 1], B = CITIES[b - 1];
  const len = Math.hypot(A.x - B.x, A.y - B.y);
  EDGE[a + '-' + b] = EDGE[b + '-' + a] = { type, len };
}
export const edgeOf = (a, b) => EDGE[a + '-' + b];

// ---------- 建立新局 ----------
export const ADULT = 15;   // 武將登場年齡

export function newGame(playerFaction, seed = Date.now() >>> 0, opt = {}) {
  const state = {
    version: 5, rng: seed >>> 0, year: 190, month: 0, season: 0, turn: 0, armies: [], armySeq: 0,
    player: playerFaction, orders: 0, log: [], over: null,
    factions: {}, cities: [], generals: [],
    coalition: { target: 'dong', untilTurn: 24, name: '討董聯軍' },
    opt: { story: opt.story || 'yanyi', life: opt.life || 'hist' },
    emperor: 'dong',
    story: { done: {}, flags: {}, rec: [] },
  };
  for (const f of [...FACTIONS, ...EXTRA_FACTIONS]) {
    state.factions[f.id] = {
      id: f.id, name: f.name, gold: f.gold, food: f.food, alive: FACTIONS.includes(f), aiType: f.aiType,
      ruler: null, relations: {}, truce: {}, alliance: {},
    };
  }
  for (const a in state.factions) for (const b in state.factions) if (a !== b) state.factions[a].relations[b] = 0;
  for (const [a, b, v] of INIT_RELATIONS) {
    state.factions[a].relations[b] = v; state.factions[b].relations[a] = v;
  }
  state.cities = CITIES.map(c => ({ ...c }));
  state.generals = GENERALS.map(g => ({
    ...g, status: g.faction ? 'active' : 'hidden', loyalty: g.faction ? 80 + randInt(state, 0, 15) : 0, acted: false, exp: 0,
    home: g.faction, faction: g.faction,
  }));
  for (const g of state.generals) if (g.born + ADULT > state.year) { g.status = 'unborn'; g.faction = null; }
  for (const f of FACTIONS) {
    state.factions[f.id].ruler = state.generals.find(g => g.name === RULERS[f.id]).id;
    gen(state, state.factions[f.id].ruler).loyalty = 100;
  }
  // 討董聯軍：關東諸侯彼此停戰至 191 年冬
  const members = FACTIONS.map(f => f.id).filter(id => id !== 'dong');
  for (const a of members) for (const b of members) if (a !== b) {
    state.factions[a].truce[b] = state.coalition.untilTurn;
  }
  for (const a of members) { state.factions[a].relations.dong = -60; state.factions.dong.relations[a] = -60; }
  state.orders = calcOrders(state, playerFaction);
  log(state, `西元 190 年春，關東諸侯起兵討伐董卓。你成為${state.factions[playerFaction].name}，逐鹿天下的時刻到了。`, 'big');
  return state;
}

// ---------- 查詢 ----------
export const gen = (s, id) => s.generals[id - 1];
export const city = (s, id) => s.cities[id - 1];
export const fac = (s, id) => s.factions[id];
export const citiesOf = (s, fid) => s.cities.filter(c => c.owner === fid);
export const gensIn = (s, cid, fid) => s.generals.filter(g => g.city === cid && g.status === 'active' && g.faction === fid);
export const gensOf = (s, fid) => s.generals.filter(g => g.status === 'active' && g.faction === fid);
export const seasonName = s => `${s.year} 年 ${s.month + 1} 月`;
export const totalTroops = (s, fid) => citiesOf(s, fid).reduce((a, c) => a + c.troops, 0) + (s.armies || []).filter(a => a.faction === fid).reduce((x, a) => x + armyTroops(a), 0);
export const armyTroops = a => a.units.reduce((x, u) => x + u.troops, 0);
export const power = (s, fid) => totalTroops(s, fid) + citiesOf(s, fid).filter(c => c.kind === 'city').length * 3000;
export const lv = v => Math.floor(v / 100);
export const capOf = c => SIZE_INFO[c.size].cap;
export const troopCapOf = c => SIZE_INFO[c.size].troopCap;

export function log(s, text, kind = '') {
  s.log.unshift({ t: seasonName(s), text, kind });
  if (s.log.length > 120) s.log.length = 120;
}

export function calcOrders(s, fid) {
  const f = fac(s, fid);
  const ruler = gen(s, f.ruler);
  return Math.min(10, 3 + Math.floor((ruler ? ruler.cha : 50) / 40) + Math.floor(citiesOf(s, fid).filter(c => c.kind === 'city').length / 3) + (s.emperor === fid ? 1 : 0));
}

export function atPeace(s, a, b) {
  if (!a || !b || a === b) return a === b;
  const fa = fac(s, a);
  return !!fa.alliance[b] || (fa.truce[b] || 0) > s.turn;
}

export function hasTrait(s, cid, fid, trait) {
  return gensIn(s, cid, fid).some(g => g.trait === trait);
}

// ---------- 內政動作 ----------
export const ACTIONS = {
  farm:    { name: '開墾', gold: 50,  desc: '提高農田，秋收更多糧' },
  market:  { name: '商業', gold: 50,  desc: '提高市集，每月稅收增加' },
  wall:    { name: '修城', gold: 60,  desc: '加固城牆，守城時減少傷害' },
  draft:   { name: '徵兵', gold: 100, desc: '增加兵力，但會降低民心' },
  govern:  { name: '施政', gold: 0,   desc: '安撫百姓，提高民心' },
  search:  { name: '訪賢', gold: 0,   desc: '在城中尋找在野人才' },
};

function devAmount(g) { return Math.round(40 + g.pol * 0.8); }

// 回傳 { ok, msg }
export function doCityAction(s, fid, cid, gid, act) {
  const f = fac(s, fid), c = city(s, cid), g = gen(s, gid);
  const A = ACTIONS[act];
  if (!A || c.owner !== fid || g.faction !== fid || g.city !== cid || g.status !== 'active') return { ok: false, msg: '無法執行' };
  if (g.acted) return { ok: false, msg: `${g.name}本月已經行動過了` };
  if (c.kind === 'pass' && (act === 'farm' || act === 'market')) return { ok: false, msg: '關卡無法開墾或經商' };
  if (c.kind === 'port' && act === 'farm') return { ok: false, msg: '港口無法開墾' };
  if (f.gold < A.gold) return { ok: false, msg: '金不足' };
  const cap = capOf(c);
  let msg = '';
  switch (act) {
    case 'farm': case 'market': case 'wall': {
      if (c[act] >= cap) return { ok: false, msg: '已達此城上限' };
      const add = Math.min(cap - c[act], devAmount(g));
      c[act] += add;
      msg = `${g.name}在${c.name}${A.name}，${A.name === '修城' ? '城防' : A.name === '開墾' ? '農田' : '市集'} +${add}`;
      break;
    }
    case 'draft': {
      const tc = troopCapOf(c);
      if (c.troops >= tc) return { ok: false, msg: '兵力已達上限' };
      const add = Math.min(tc - c.troops, Math.round(500 + g.cha * 6 + c.order * 3));
      c.troops += add; c.order = clamp(c.order - 5, 0, 100);
      msg = `${g.name}在${c.name}徵兵，兵力 +${add}，民心 -5`;
      break;
    }
    case 'govern': {
      const add = Math.round((5 + g.pol / 12) * (g.trait === '仁德' ? 1.5 : 1));
      c.order = clamp(c.order + add, 0, 100);
      msg = `${g.name}在${c.name}施政，民心 +${add}`;
      break;
    }
    case 'search': {
      const r = searchTalent(s, fid, cid, g);
      if (!r.ok) return r;
      msg = r.msg;
      break;
    }
  }
  f.gold -= A.gold;
  g.acted = true; g.exp += 1;
  return { ok: true, msg };
}

export function recruitChance(s, fid, recruiter, target) {
  const ruler = gen(s, fac(s, fid).ruler);
  let p = 30 + recruiter.cha * 0.35 + (ruler.cha - 50) * 0.3;
  if (recruiter.trait === '仁德') p += 10;
  if (target.pers === '隱逸') p -= 25;
  if (target.pers === '貴名') p += (ruler.cha - 60) * 0.4;
  if (target.pers === '貴利') p += fac(s, fid).gold > 1000 ? 10 : -5;
  if (target.pers === '野心') p += 5;
  return clamp(Math.round(p), 5, 95);
}

function searchTalent(s, fid, cid, g) {
  const c = city(s, cid);
  const hidden = s.generals.filter(x => x.city === cid && (x.status === 'hidden' || x.status === 'free') && !(x.lock > s.year));
  if (!hidden.length) {
    return { ok: true, msg: `${g.name}在${c.name}訪賢，但此地已無賢才。` };
  }
  const target = hidden.find(x => x.status === 'free') || pick(s, hidden);
  if (target.status === 'hidden' && !chance(s, 45 + g.cha * 0.4)) {
    return { ok: true, msg: `${g.name}在${c.name}四處尋訪，沒有找到人才。` };
  }
  target.status = 'free';
  const p = recruitChance(s, fid, g, target);
  if (chance(s, p)) {
    target.status = 'active'; target.faction = fid; target.loyalty = 70 + randInt(s, 0, 15); target.acted = true;
    return { ok: true, msg: `${g.name}在${c.name}找到了${target.name}，${target.name}願意效力！`, recruited: target.id };
  }
  return { ok: true, msg: `${g.name}在${c.name}找到了${target.name}，但對方婉拒了（成功率 ${p}%）。` };
}

export function reward(s, fid, gid) {
  const f = fac(s, fid), g = gen(s, gid);
  if (f.gold < 100) return { ok: false, msg: '金不足' };
  if (g.id === f.ruler) return { ok: false, msg: '君主不需要賞賜' };
  f.gold -= 100;
  const add = g.pers === '貴利' ? 20 : 10;
  g.loyalty = clamp(g.loyalty + add, 0, 100);
  return { ok: true, msg: `賞賜${g.name}百金，忠誠 +${add}` };
}

// 移動武將與兵力到相鄰己方城池
export function moveUnits(s, fid, from, to, gids, troops) {
  const a = city(s, from), b = city(s, to);
  if (a.owner !== fid || b.owner !== fid || !ADJ[from].includes(to)) return { ok: false, msg: '只能移動到相鄰的己方城池' };
  troops = clamp(Math.floor(troops), 0, a.troops);
  if (!gids.length && !troops) return { ok: false, msg: '沒有選擇要移動的武將或兵力' };
  const tc = troopCapOf(b);
  troops = Math.min(troops, tc - b.troops);
  for (const id of gids) { const g = gen(s, id); if (g.city === from && g.faction === fid) { g.city = to; g.acted = true; } }
  a.troops -= troops; b.troops += troops;
  return { ok: true, msg: `${gids.length ? gids.map(id => gen(s, id).name).join('、') + ' ' : ''}${troops ? `率兵 ${troops} ` : ''}由${a.name}移往${b.name}` };
}

// ---------- 外交 ----------
export function giftChange(s, fid) { return 8 + Math.round(gen(s, fac(s, fid).ruler).cha / 8); }

export function changeRel(s, a, b, d) {
  const A = fac(s, a), B = fac(s, b);
  A.relations[b] = clamp((A.relations[b] || 0) + d, -100, 100);
  B.relations[a] = clamp((B.relations[a] || 0) + d, -100, 100);
}

export function diplomacy(s, fid, target, kind) {
  const f = fac(s, fid), t = fac(s, target);
  const rel = f.relations[target] || 0;
  if (!t.alive) return { ok: false, msg: '該勢力已滅亡' };
  if (kind === 'gift') {
    if (f.gold < 200) return { ok: false, msg: '金不足（需 200）' };
    f.gold -= 200; t.gold += 200;
    const d = giftChange(s, fid);
    changeRel(s, fid, target, d);
    return { ok: true, msg: `向${t.name}贈禮，關係 +${d}` };
  }
  if (kind === 'truce') {
    if (atPeace(s, fid, target)) return { ok: false, msg: '目前已是和平狀態' };
    if (rel < 0) return { ok: false, msg: `${t.name}關係太差（需 0 以上）` };
    const p = truceChance(s, fid, target);
    if (chance(s, p)) {
      f.truce[target] = s.turn + 12; t.truce[fid] = s.turn + 12;
      return { ok: true, msg: `${t.name}同意停戰一年。` };
    }
    changeRel(s, fid, target, -5);
    return { ok: true, msg: `${t.name}拒絕了停戰（成功率 ${p}%）。` };
  }
  if (kind === 'ally') {
    if (f.alliance[target]) return { ok: false, msg: '已是盟友' };
    if (rel < 50) return { ok: false, msg: `關係需要 50 以上（目前 ${rel}）` };
    const p = allyChance(s, fid, target);
    if (chance(s, p)) {
      f.alliance[target] = true; t.alliance[fid] = true;
      return { ok: true, msg: `與${t.name}締結同盟！` };
    }
    changeRel(s, fid, target, -5);
    return { ok: true, msg: `${t.name}拒絕結盟（成功率 ${p}%）。` };
  }
  if (kind === 'break') {
    if (!f.alliance[target]) return { ok: false, msg: '並非盟友' };
    delete f.alliance[target]; delete t.alliance[fid];
    for (const o of Object.values(s.factions)) if (o.id !== fid) changeRel(s, fid, o.id, -10);
    changeRel(s, fid, target, -40);
    return { ok: true, msg: `與${t.name}斷盟，天下諸侯對你的評價下降。` };
  }
  return { ok: false, msg: '?' };
}

export function truceChance(s, a, b) {
  const rel = fac(s, a).relations[b] || 0;
  return clamp(Math.round(35 + rel / 2 + (power(s, a) > power(s, b) ? 20 : -5)), 5, 95);
}
export function allyChance(s, a, b) {
  const rel = fac(s, a).relations[b] || 0;
  return clamp(Math.round(20 + (rel - 50) + (fac(s, b).aiType === '守成' ? 10 : 0)), 5, 95);
}

// 弱小玩家主動發起合縱聯軍
export function canCallCoalition(s, fid) {
  if (s.coalition) return null;
  const n = citiesOf(s, fid).length;
  const top = Object.values(s.factions).filter(f => f.alive && f.id !== fid)
    .map(f => ({ id: f.id, n: citiesOf(s, f.id).length })).sort((a, b) => b.n - a.n)[0];
  if (!top || top.n < 7 || top.n < n * 2) return null;
  return top.id;
}

export function callCoalition(s, fid) {
  const target = canCallCoalition(s, fid);
  if (!target) return { ok: false, msg: '目前沒有足以號召天下討伐的對象' };
  const f = fac(s, fid);
  if (f.gold < 300) return { ok: false, msg: '金不足（需 300）' };
  f.gold -= 300;
  const p = clamp(40 + Math.round((gen(s, f.ruler).cha - 50) * 0.6), 20, 85);
  if (!chance(s, p)) return { ok: true, msg: `諸侯觀望不前，聯軍未能成形（成功率 ${p}%）。` };
  formCoalition(s, target, 8, `討${fac(s, target).name}聯軍`);
  return { ok: true, msg: `你登高一呼，諸侯響應，組成討${fac(s, target).name}聯軍！` };
}

export function formCoalition(s, target, seasons, name) {
  s.coalition = { target, untilTurn: s.turn + seasons * 3, name };
  const members = Object.values(s.factions).filter(f => f.alive && f.id !== target).map(f => f.id);
  for (const a of members) {
    changeRel(s, a, target, -40);
    delete fac(s, a).truce[target]; delete fac(s, target).truce[a];
    delete fac(s, a).alliance[target]; delete fac(s, target).alliance[a];
    for (const b of members) if (a !== b) fac(s, a).truce[b] = Math.max(fac(s, a).truce[b] || 0, s.coalition.untilTurn);
  }
  log(s, `${name}成立！各路諸侯聯手對抗${fac(s, target).name}。`, 'big');
}

// ---------- 出征前檢查 ----------
export function attackTargets(s, fid, cid) {
  return ADJ[cid].filter(t => { const o = city(s, t).owner; return o !== fid && !atPeace(s, fid, o); });
}

// ---------- 戰後處理 ----------
// plan: { faction, from, to, units:[{genId,troops}] }, result from battle.js
export function applyBattle(s, plan, res) {
  const src = city(s, plan.from), dst = city(s, plan.to);
  const atk = plan.faction, def = dst.owner;
  const sent = plan.units.reduce((a, u) => a + u.troops, 0);
  const captives = [];
  src.troops = Math.max(0, src.troops - sent);
  if (def) { changeRel(s, atk, def, -15); }
  for (const u of plan.units) { const g = gen(s, u.genId); g.acted = true; g.exp += 2; }
  if (res.winner === 'A') {
    dst.troops = res.survA;
    // 守將處置
    const defGens = def ? gensIn(s, dst.id, def) : [];
    const escapes = def ? ADJ[dst.id].filter(id => city(s, id).owner === def) : [];
    for (const g of defGens) {
      const isRuler = fac(s, def).ruler === g.id;
      const anyOwn = citiesOf(s, def).filter(c => c.id !== dst.id);
      if (escapes.length && (isRuler || chance(s, 55))) { g.city = pick(s, escapes); }
      else if (isRuler && anyOwn.length) { g.city = anyOwn[0].id; }
      else { g.status = 'captive'; g.captor = atk; g.city = dst.id; captives.push(g.id); }
    }
    for (const u of plan.units) {
      const g = gen(s, u.genId);
      if (res.capturedA.includes(g.id)) continue;
      g.city = dst.id;
    }
    dst.owner = atk;
    dst.order = clamp(dst.order - 10, 10, 100);
    log(s, `${fac(s, atk).name}攻下了${dst.name}！`, atk === s.player || def === s.player ? 'big' : '');
    if (def) checkElimination(s, def, atk);
  } else {
    dst.troops = res.survD;
    src.troops += res.survA;
    log(s, `${fac(s, atk).name}進攻${dst.name}失利。`, atk === s.player || def === s.player ? 'big' : '');
  }
  // 戰場上被俘（單挑等）
  for (const id of res.capturedA) { const g = gen(s, id); g.status = 'captive'; g.captor = def; g.city = dst.id; if (def) captives.push(id); else g.status = 'free'; }
  for (const id of res.capturedD) { const g = gen(s, id); if (g.status === 'captive' || g.status === 'dead') continue; g.status = 'captive'; g.captor = atk; g.city = dst.id; captives.push(id); }
  const uniq = [...new Set(captives)];
  // 被俘的君主：AI 直接處理
  return uniq;
}

export function checkElimination(s, fid, by) {
  const f = fac(s, fid);
  if (citiesOf(s, fid).length) {
    // 君主被俘則由他人繼位
    const r = gen(s, f.ruler);
    if (r.status !== 'active') succession(s, fid);
    else if (!r.army && city(s, r.city).owner !== fid) r.city = citiesOf(s, fid)[0].id;
    return;
  }
  f.alive = false;
  if (s.emperor === fid) { s.emperor = by || null; if (by) log(s, `天子落入${fac(s, by).name}之手。`, 'big'); }
  // 野外部隊隨之瓦解
  for (const a of (s.armies || []).filter(x => x.faction === fid)) for (const u of a.units) {
    const g = gen(s, u.genId); g.army = null; g.city = a.at || a.from;
  }
  if (s.armies) s.armies = s.armies.filter(x => x.faction !== fid);
  for (const g of s.generals) {
    if (g.faction === fid && g.status === 'active') {
      if (g.id === f.ruler) { g.status = 'captive'; g.captor = by; continue; }
      g.status = 'free'; g.faction = null; g.city = pick(s, s.cities).id;
    }
  }
  log(s, `${f.name}勢力滅亡了。`, 'big');
  if (fid === s.player) s.over = 'lose';
}

export function succession(s, fid) {
  const f = fac(s, fid);
  const old = gen(s, f.ruler);
  const cands = gensOf(s, fid).filter(g => g.id !== f.ruler && g.name !== '貂蟬');
  const kin = cands.filter(g => old && (g.kin === old.name || (old.kin && g.kin === old.kin) || g.name === old.kin)).sort((a, b) => a.born - b.born);
  const heir = kin[0] || cands.sort((a, b) => (b.cha + b.pol) - (a.cha + a.pol))[0];
  if (!heir) { collapse(s, fid); return; }
  f.ruler = heir.id; f.name = heir.name; heir.loyalty = 100;
  log(s, `${heir.name}繼承了勢力，成為新的君主。`, 'big');
}

// 無人繼位：勢力瓦解，城池歸於中立
function collapse(s, fid) {
  const f = fac(s, fid);
  for (const c of citiesOf(s, fid)) c.owner = null;
  for (const a of (s.armies || []).filter(x => x.faction === fid)) for (const u of a.units) { const g = gen(s, u.genId); g.army = null; g.city = a.at || a.last; }
  if (s.armies) s.armies = s.armies.filter(x => x.faction !== fid);
  for (const g of s.generals) if (g.faction === fid && g.status === 'active') { g.status = 'free'; g.faction = null; }
  f.alive = false;
  if (s.emperor === fid) s.emperor = null;
  log(s, `${f.name}勢力後繼無人，瓦解了。`, 'big');
  if (fid === s.player) s.over = 'lose';
}

// 武將離開部隊（死亡、出走時）；部隊空了就退回最近的己方據點
export function leaveArmy(s, g) {
  if (!g.army) return;
  const a = (s.armies || []).find(x => x.id === g.army);
  g.army = null;
  if (!a) return;
  const u = a.units.find(x => x.genId === g.id);
  a.units = a.units.filter(x => x.genId !== g.id);
  const own = citiesOf(s, a.faction);
  const home = own.find(c => c.id === a.at) || own.find(c => ADJ[c.id].includes(a.at)) || own[0];
  if (home && u) home.troops = Math.min(troopCapOf(home), home.troops + u.troops);
  g.city = home ? home.id : (a.at || a.last);
  if (!a.units.length) {
    s.armies = s.armies.filter(x => x !== a);
    if (home) fac(s, a.faction).food += Math.max(0, a.food);
  }
}

// 武將死亡（病逝、戰死、被殺）
export function killGen(s, g, why) {
  if (!g || g.status === 'dead') return;
  const fid = g.faction;
  leaveArmy(s, g);
  const wasRuler = fid && fac(s, fid).alive && fac(s, fid).ruler === g.id;
  g.status = 'dead'; g.diedAt = s.year;
  if (why) log(s, why, wasRuler || fid === s.player ? 'big' : '');
  if (wasRuler) succession(s, fid);
}

// 每年正月：成年登場、壽終病逝
export function lifeTick(s) {
  const life = (s.opt && s.opt.life) || 'hist';
  for (const g of s.generals) {
    if (g.status === 'unborn' && g.born + ADULT <= s.year) {
      const k = g.kin && s.generals.find(x => x.name === g.kin && x.status === 'active' && x.faction);
      const home = k ? k.faction : (g.home && fac(s, g.home).alive ? g.home : null);
      if (home && citiesOf(s, home).length) {
        const kc = k && !k.army && city(s, k.city).owner === home ? k.city : null;
        g.faction = home; g.status = 'active'; g.loyalty = 85 + randInt(s, 0, 10); g.city = kc || citiesOf(s, home)[0].id;
        log(s, `${g.name}長大成人，投效${fac(s, home).name}。`, home === s.player ? 'big' : '');
      } else { g.status = 'hidden'; g.faction = null; }
    }
  }
  if (life === 'off') return;
  const ext = life === 'long' ? 10 : 0;
  for (const g of s.generals) {
    if (!['active', 'hidden', 'free'].includes(g.status)) continue;
    const d = g.died + (g.violent ? 15 : 0) + ext;
    const p = s.year < d - 1 ? 0 : s.year === d - 1 ? 15 : s.year === d ? 55 : s.year === d + 1 ? 80 : 100;
    if (p && chance(s, p)) killGen(s, g, `${g.name}病逝，享年 ${s.year - g.born} 歲。`);
  }
}

// 處置俘虜：'persuade' | 'release' | 'execute'
export function persuadeChance(s, fid, g) {
  const ruler = gen(s, fac(s, fid).ruler);
  const isRuler = Object.values(s.factions).some(f => f.ruler === g.id && f.alive);
  if (isRuler) return 0;
  let p = 35 + (ruler.cha - 50) * 0.5 - (g.loyalty - 60) * 0.5;
  if (g.pers === '忠義') p -= 20;
  if (g.pers === '野心') p += 15;
  if (g.pers === '貴名') p += (ruler.cha - 70) * 0.5;
  if (!g.faction || !fac(s, g.faction).alive) p += 25;
  return clamp(Math.round(p), 3, 95);
}

export function handleCaptive(s, fid, gid, how) {
  const g = gen(s, gid);
  const owner = g.faction;
  if (how === 'persuade') {
    const p = persuadeChance(s, fid, g);
    if (chance(s, p)) {
      g.faction = fid; g.status = 'active'; g.loyalty = 60 + randInt(s, 0, 15); g.acted = true;
      const home = city(s, g.city);
      if (home.owner !== fid) g.city = citiesOf(s, fid)[0].id;
      return { ok: true, joined: true, msg: `${g.name}歸降了！` };
    }
    how = 'release';
    const r = release(s, g);
    return { ok: true, joined: false, msg: `${g.name}拒絕投降（成功率 ${p}%），只好放了他。${r}` };
  }
  if (how === 'release') return { ok: true, msg: release(s, g) };
  if (how === 'execute') {
    g.status = 'dead';
    for (const o of Object.values(s.factions)) if (o.id !== fid && o.alive) changeRel(s, fid, o.id, -5);
    if (owner && fac(s, owner).alive) changeRel(s, fid, owner, -30);
    const f = owner && fac(s, owner);
    if (f && f.ruler === g.id) { checkRuler(s, owner); }
    return { ok: true, msg: `處斬了${g.name}。各方諸侯對你心生戒懼。` };
  }
}

function release(s, g) {
  const owner = g.faction;
  if (owner && fac(s, owner).alive && citiesOf(s, owner).length) {
    g.status = 'active'; g.city = citiesOf(s, owner)[0].id;
    changeRel(s, g.captor || s.player, owner, 10);
    g.captor = null;
    return `${g.name}回到了${fac(s, owner).name}。`;
  }
  g.status = 'free'; g.faction = null; g.captor = null;
  return `${g.name}成為在野之士。`;
}

function checkRuler(s, fid) {
  if (citiesOf(s, fid).length) succession(s, fid);
}

// AI 自動處置俘虜
export function aiHandleCaptives(s, fid, ids) {
  const out = [];
  for (const id of ids) {
    const g = gen(s, id);
    if (g.status !== 'captive') continue;
    const r = handleCaptive(s, fid, id, 'persuade');
    out.push(r.msg);
  }
  return out;
}

// ---------- 月末結算 ----------
export function endMonthEconomy(s) {
  const harvest = s.month === 8;   // 九月秋收
  for (const f of Object.values(s.factions)) {
    if (!f.alive) continue;
    let gold = 0, food = 0, upkeep = 0;
    for (const c of citiesOf(s, f.id)) {
      const of = 0.5 + c.order / 200;
      const base = c.kind === 'city' ? 40 : c.kind === 'port' ? 25 : 0;
      gold += (base + lv(c.market) * 25 + c.market * 0.05) * of * (hasTrait(s, c.id, f.id, '理財') ? 1.2 : 1) / 3;
      if (harvest && c.kind === 'city') food += (300 + lv(c.farm) * 250 + c.farm * 0.5) * of * (hasTrait(s, c.id, f.id, '勸農') ? 1.2 : 1);
      upkeep += c.troops * 0.04 / 3;
      if (c.order < 30 && chance(s, 9)) {
        const lost = Math.round(c.troops * 0.1);
        c.troops -= lost;
        if (f.id === s.player) log(s, `${c.name}民心不穩，發生騷亂，兵力 -${lost}`, 'warn');
      }
      if (c.order < 60 && s.month % 3 === 0) c.order += 1;
      if (s.month === 2 && c.kind === 'city') c.troops = Math.min(troopCapOf(c), c.troops + Math.round(c.order * 5));
    }
    gold -= gensOf(s, f.id).length * 4 / 3;
    f.gold = Math.max(0, Math.round(f.gold + gold));
    f.food = Math.round(f.food + food - upkeep);
    if (f.food < 0) {
      f.food = 0;
      for (const c of citiesOf(s, f.id)) c.troops = Math.round(c.troops * 0.96);
      if (f.id === s.player) log(s, '糧草不足，各城士兵逃散！', 'warn');
    }
    if (harvest && f.id === s.player) log(s, `秋收：獲得糧 ${Math.round(food)}`);
  }
  for (const c of s.cities) if (!c.owner) c.troops = Math.min(troopCapOf(c) / 3, c.troops + 50);
}
export const endSeasonEconomy = endMonthEconomy;

export function advanceMonth(s) {
  for (const g of s.generals) g.acted = false;
  s.turn++;
  s.month = (s.month + 1) % 12;
  if (s.month === 0) { s.year++; lifeTick(s); }
  s.season = Math.floor(s.month / 3);
  if (s.month % 3 === 0) for (const f of Object.values(s.factions)) for (const k in f.relations) {
    if (f.relations[k] > 0) f.relations[k] -= 1; else if (f.relations[k] < 0) f.relations[k] += 1;
  }
  for (const g of s.generals) {
    if (g.status !== 'active' || !g.faction || g.army) continue;
    const f = fac(s, g.faction);
    if (f.ruler === g.id) continue;
    if (g.pers === '忠義') { if (s.month % 3 === 0) g.loyalty = Math.min(100, g.loyalty + 1); continue; }
    if (g.loyalty < 40 && chance(s, 5)) {
      g.faction = null; g.status = 'free';
      if (f.id === s.player) log(s, `${g.name}對你心生不滿，離開了。`, 'warn');
    }
  }
  updateCoalition(s);
  s.orders = calcOrders(s, s.player);
  checkVictory(s);
}
export const advanceSeason = advanceMonth;

export function updateCoalition(s) {
  const total = s.cities.filter(c => c.kind === 'city').length;
  const nCity = fid => citiesOf(s, fid).filter(c => c.kind === 'city').length;
  if (s.coalition) {
    const t = s.coalition.target;
    const n = nCity(t);
    if (!fac(s, t).alive || s.turn >= s.coalition.untilTurn && n < total * 0.4) {
      log(s, `${s.coalition.name}解散了。`, 'big');
      s.coalition = null;
    }
    return;
  }
  for (const f of Object.values(s.factions)) {
    if (!f.alive) continue;
    if (nCity(f.id) >= Math.ceil(total * 0.4)) {
      formCoalition(s, f.id, 8, `討${f.name}合縱聯軍`);
      return;
    }
  }
}

export function checkVictory(s) {
  if (s.over) return;
  if (!fac(s, s.player).alive) { s.over = 'lose'; return; }
  const others = Object.values(s.factions).filter(f => f.alive && f.id !== s.player);
  if (!others.length) { s.over = 'win'; log(s, '天下一統！', 'big'); }
}

// ---------- 隨機事件（只對玩家） ----------
export const EVENTS = [
  { id: 'drought', title: '旱災', seasons: [1], text: c => `${c.name}久旱不雨，百姓苦不堪言。`,
    choices: [
      { label: '開倉賑災（金 -150，民心 +8）', run: (s, c) => { const f = fac(s, s.player); f.gold = Math.max(0, f.gold - 150); c.order = clamp(c.order + 8, 0, 100); } },
      { label: '不予理會（糧 -300，民心 -10）', run: (s, c) => { const f = fac(s, s.player); f.food = Math.max(0, f.food - 300); c.order = clamp(c.order - 10, 0, 100); } },
    ] },
  { id: 'locust', title: '蝗災', seasons: [1, 2], text: c => `${c.name}爆發蝗災，田地受損。`,
    choices: [
      { label: '動員捕蝗（金 -100）', run: (s, c) => { const f = fac(s, s.player); f.gold = Math.max(0, f.gold - 100); } },
      { label: '聽天由命（農田 -120）', run: (s, c) => { c.farm = Math.max(0, c.farm - 120); } },
    ] },
  { id: 'plague', title: '疫病', seasons: [0, 1, 2, 3], text: c => `${c.name}軍中疫病流行。`,
    choices: [
      { label: '延請名醫（金 -120）', run: (s, c) => { const f = fac(s, s.player); f.gold = Math.max(0, f.gold - 120); } },
      { label: '隔離病患（兵力 -12%）', run: (s, c) => { c.troops = Math.round(c.troops * 0.88); } },
    ] },
  { id: 'harvest', title: '豐年', seasons: [2], text: c => `${c.name}風調雨順，五穀豐登。`,
    choices: [
      { label: '開倉惠民（民心 +12）', run: (s, c) => { c.order = clamp(c.order + 12, 0, 100); } },
      { label: '收入糧倉（糧 +500）', run: (s, c) => { fac(s, s.player).food += 500; } },
    ] },
  { id: 'bandit', title: '賊亂', seasons: [0, 1, 2, 3], text: c => `${c.name}附近山賊作亂，劫掠商旅。`,
    choices: [
      { label: '出兵討伐（兵 -300，金 +120，民心 +5）', run: (s, c) => { c.troops = Math.max(0, c.troops - 300); fac(s, s.player).gold += 120; c.order = clamp(c.order + 5, 0, 100); } },
      { label: '招安收編（金 -150，兵 +600）', run: (s, c) => { const f = fac(s, s.player); f.gold = Math.max(0, f.gold - 150); c.troops = Math.min(troopCapOf(c), c.troops + 600); } },
    ] },
  { id: 'merchant', title: '富商求見', seasons: [0, 1, 2, 3], text: c => `一位富商來到${c.name}，願意資助軍資。`,
    choices: [
      { label: '接受資助（金 +250，民心 -3）', run: (s, c) => { fac(s, s.player).gold += 250; c.order = clamp(c.order - 3, 0, 100); } },
      { label: '減免商稅回報（市集 +80）', run: (s, c) => { c.market = Math.min(capOf(c), c.market + 80); } },
    ] },
];

export function rollEvent(s) {
  if (!chance(s, 10)) return null;
  const cs = citiesOf(s, s.player).filter(c => c.kind === 'city');
  if (!cs.length) return null;
  const pool = EVENTS.filter(e => e.seasons.includes(s.season));
  return { ev: pick(s, pool), city: pick(s, cs) };
}
