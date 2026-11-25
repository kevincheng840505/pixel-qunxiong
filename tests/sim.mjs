// 無畫面模擬：所有勢力（含玩家）都交給 AI，檢查規則不會壞掉並觀察平衡。
// 用法：node tests/sim.mjs [局數] [季數]
import * as R from '../js/rules.js';
import * as T from '../js/tactics.js';
import { planTurn } from '../js/ai.js';

const games = +(process.argv[2] || 20), seasons = +(process.argv[3] || 160);
const wins = {}; let battles = 0, atkWins = 0, totalLen = 0, unfinished = 0;

function check(s) {
  for (const c of s.cities) {
    if (!(c.troops >= 0) || !Number.isFinite(c.troops)) throw new Error(`bad troops ${c.name} ${c.troops}`);
    if (c.owner && !s.factions[c.owner].alive) throw new Error(`dead owner ${c.name}`);
  }
  for (const f of Object.values(s.factions)) {
    if (!Number.isFinite(f.gold) || !Number.isFinite(f.food)) throw new Error('bad res ' + f.id);
    if (f.alive && R.gen(s, f.ruler).status !== 'active') throw new Error(`ruler not active ${f.id} ${R.gen(s, f.ruler).name} ${R.gen(s, f.ruler).status}`);
  }
  for (const g of s.generals) {
    if (g.status === 'active' && (!g.faction || R.city(s, g.city).owner !== g.faction)) throw new Error(`gen ${g.name} in wrong city ${R.city(s, g.city).name} owner ${R.city(s, g.city).owner} vs ${g.faction}`);
  }
}

for (let i = 0; i < games; i++) {
  const s = R.newGame('cao', 1000 + i * 7919);
  let t = 0;
  for (; t < seasons && !s.over; t++) {
    for (const f of Object.values(s.factions)) {
      if (!f.alive) continue;
      const plans = planTurn(s, f.id);
      for (const p of plans) {
        if (!f.alive) break;
        const dst = R.city(s, p.to);
        if (dst.owner === p.faction || R.atPeace(s, p.faction, dst.owner)) { continue; }
        const b = T.createTactical(s, p);
        const res = T.autoBattle(s, b);
        battles++; if (res.winner === 'A') atkWins++;
        const caps = R.applyBattle(s, p, res);
        const captor = res.winner === 'A' ? p.faction : dst.owner;
        if (captor && R.fac(s, captor).alive) R.aiHandleCaptives(s, captor, caps);
        else for (const id of caps) { const g = R.gen(s, id); if (g.status === 'captive') { g.status = 'free'; g.faction = null; } }
        check(s);
      }
    }
    R.endSeasonEconomy(s);
    R.advanceSeason(s);
    // 模擬中玩家不會滅亡就結束
    if (s.over === 'lose') s.over = null;
    const alive = Object.values(s.factions).filter(f => f.alive);
    if (alive.length === 1) { s.over = alive[0].id; }
    check(s);
  }
  const counts = Object.values(s.factions).filter(f => f.alive).map(f => `${f.name}:${R.citiesOf(s, f.id).length}`).join(' ');
  const neutral = s.cities.filter(c => !c.owner).length;
  console.log(`#${i} ${t}季 ${s.year}年 ${s.over ? '統一:' + s.over : ''} ${counts} 中立:${neutral}`);
  if (s.over) { wins[s.over] = (wins[s.over] || 0) + 1; totalLen += t; } else unfinished++;
}
console.log('勝者', wins, '未結束', unfinished, '平均季數', (totalLen / Math.max(1, games - unfinished)).toFixed(1));
console.log('戰鬥', battles, '攻方勝率', (atkWins / battles * 100).toFixed(1) + '%');
