// 無畫面模擬：所有勢力交給 AI，檢查規則不變量與平衡。用法：node tests/sim.mjs [局數] [月數]
import * as R from '../js/rules.js';
import * as T from '../js/tactics.js';
import { aiMilitary, planTurn } from '../js/ai.js';
import { marchMonth } from '../js/army.js';
import { storyMonth, aiCaptive, STORY } from '../js/story.js';
const fired = {};
const runStory = s => { for (const e of storyMonth(s, true)) fired[e.ev.id] = (fired[e.ev.id] || 0) + 1; };

const games = +process.argv[2] || 4, months = +process.argv[3] || 120;
const wins = {}; let battles = 0, atkWins = 0, fields = 0, totalLen = 0, unfinished = 0;

function check(s) {
  for (const f of Object.values(s.factions)) {
    if (f.alive && R.gen(s, f.ruler).status !== 'active') throw new Error(`ruler not active ${f.id} ${R.gen(s, f.ruler).name} ${R.gen(s, f.ruler).status}`);
  }
  for (const g of s.generals) {
    if (g.status !== 'active') continue;
    if (g.army) {
      const a = s.armies.find(x => x.id === g.army);
      if (!a || !a.units.some(u => u.genId === g.id) || a.faction !== g.faction) throw new Error(`gen ${g.name} lost army ${g.army}`);
    } else if (!g.faction || g.city == null || R.city(s, g.city).owner !== g.faction) throw new Error(`gen ${g.name} in wrong city ${g.city && R.city(s, g.city).name} owner ${g.city && R.city(s, g.city).owner} vs ${g.faction}`);
  }
  for (const a of s.armies) {
    if (!a.units.length) throw new Error('empty army');
    for (const u of a.units) { const g = R.gen(s, u.genId); if (g.army !== a.id || g.status !== 'active') throw new Error(`army ${a.id} has bad gen ${g.name} ${g.status} ${g.army}`); }
    if (!R.fac(s, a.faction).alive) throw new Error('dead faction army');
  }
  for (const c of s.cities) if (c.troops < 0 || Number.isNaN(c.troops)) throw new Error('bad troops ' + c.name);
}

const hooks = s => ({
  battle: async (kind, plan) => {
    const b = T.createTactical(s, plan);
    const r = T.autoBattle(s, b);
    battles++; if (kind === 'field') fields++;
    if (r.winner === 'A') atkWins++;
    return r;
  },
  captives: async ids => {
    for (const id of ids) {
      const g = R.gen(s, id);
      if (g.status !== 'captive') continue;
      if (g.captor && R.fac(s, g.captor).alive) { if (!aiCaptive(s, g.captor, id)) R.aiHandleCaptives(s, g.captor, [id]); }
      else { g.status = 'free'; g.faction = null; }
    }
  },
});

for (let i = 0; i < games; i++) {
  const s = R.newGame('cao', 1000 + i * 7919);
  let t = 0;
  runStory(s);
  for (; t < months && !s.over; t++) {
    for (const f of Object.values(s.factions)) if (f.alive) aiMilitary(s, f.id);
    check(s);
    await marchMonth(s, hooks(s));
    for (const f of Object.values(s.factions)) if (f.alive && s.armies) for (const a of s.armies.filter(x => x.faction === f.id)) {}
    R.endMonthEconomy(s);
    R.advanceMonth(s);
    runStory(s); check(s);
    if (s.over === 'lose') s.over = null;
    const alive = Object.values(s.factions).filter(f => f.alive);
    if (alive.length === 1) s.over = alive[0].id;
    check(s);
  }
  const counts = Object.values(s.factions).filter(f => f.alive).map(f => `${f.name}:${R.citiesOf(s, f.id).length}`).join(' ');
  const neutral = s.cities.filter(c => !c.owner).length;
  console.log(`#${i} ${t}月 ${s.year}年 ${s.over ? '統一:' + s.over : ''} ${counts} 中立:${neutral} 部隊:${s.armies.length}`);
  if (s.over) { wins[s.over] = (wins[s.over] || 0) + 1; totalLen += t; } else unfinished++;
}
console.log('勝者', wins, '未結束', unfinished);
console.log('戰鬥', battles, '野戰', fields, '攻方勝率', (atkWins / Math.max(1, battles) * 100).toFixed(1) + '%');
console.log('劇情觸發', STORY.map(e => `${e.title}:${fired[e.id] || 0}`).join(' '));
