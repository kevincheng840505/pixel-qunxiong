// 史實沙盤：從 209 年赤壁戰後的局勢開始，檢查第四～六章劇情能否依序觸發、規則不變量是否成立。
// 用法：node tests/story2.mjs [局數] [war]   （帶 war 時電腦會出兵打仗）
import * as R from '../js/rules.js';
import * as T from '../js/tactics.js';
import { aiMilitary } from '../js/ai.js';
import { marchMonth } from '../js/army.js';
import { storyMonth, aiCaptive, STORY, helpers, choicesFor, resolve } from '../js/story.js';
import { setup } from './hist209.mjs';

const games = +process.argv[2] || 6, war = process.argv.includes('war'), all = process.argv.includes('all');
let tried = 0;
const fired = {};

function check(s) {
  for (const f of Object.values(s.factions)) if (f.alive && R.gen(s, f.ruler).status !== 'active') throw new Error(`ruler not active ${f.id} ${R.gen(s, f.ruler).name}`);
  for (const g of s.generals) {
    if (g.status !== 'active') continue;
    if (g.army) { const a = s.armies.find(x => x.id === g.army); if (!a || a.faction !== g.faction) throw new Error('army ' + g.name); }
    else if (!g.faction || R.city(s, g.city).owner !== g.faction) throw new Error(`gen ${g.name} in wrong city`);
  }
  for (const c of s.cities) if (c.troops < 0 || Number.isNaN(c.troops)) throw new Error('bad troops ' + c.name);
}

const hooks = s => ({
  battle: async (kind, plan) => T.autoBattle(s, T.createTactical(s, plan)),
  captives: async ids => { for (const id of ids) { const g = R.gen(s, id); if (g.status !== 'captive') continue; if (g.captor && R.fac(s, g.captor).alive) { if (!aiCaptive(s, g.captor, id)) R.aiHandleCaptives(s, g.captor, [id]); } else { g.status = 'free'; g.faction = null; } } },
});

for (let i = 0; i < games; i++) {
  const s = setup(4242 + i * 7919);
  check(s);
  const order = [];
  while (s.year < 282) {
    if (war) { for (const f of Object.values(s.factions)) if (f.alive) aiMilitary(s, f.id); await marchMonth(s, hooks(s)); }
    R.endMonthEconomy(s); R.advanceMonth(s);
    if (i === 0 && s.month === 0 && process.argv.includes("v")) console.log(s.year, Object.values(s.factions).filter(f => f.alive).map(f => f.name).join(" "));
    const before = all ? structuredClone(s) : null;
    const evs = storyMonth(s, true);
    // all：把每個觸發事件的每個選項、成功與失敗都試一次
    if (all) for (const e of evs) {
      const c0 = e.ev.who(before, helpers(before)); if (!c0) continue;
      for (const { i: k } of choicesFor(before, e.ev, c0)) for (const win of [true, false]) {
        const s3 = structuredClone(before); s3.player = c0.fid || s3.player;
        const c = e.ev.who(s3, helpers(s3)); if (!c) continue;
        try { resolve(s3, e.ev, c, k, { win }); check(s3); tried++; } catch (err) { console.log('FAIL', e.ev.id, k, win, err.stack); process.exit(1); }
      }
    }
    for (const e of evs) { fired[e.ev.id] = (fired[e.ev.id] || 0) + 1; if (i === 0) order.push(`${s.year}.${s.month + 1} ${e.ev.title}：${e.ev.choices[e.k].t}${e.res.win === false ? '（失敗）' : ''}`); }
    check(s);
    s.over = null;
  }
  if (i === 0) console.log(order.join('\n'));
  console.log(`#${i}`, Object.values(s.factions).filter(f => f.alive).map(f => `${f.name}(${R.rankTitle(s, f.id)}):${R.citiesOf(s, f.id).length}`).join(' '));
}
const late = STORY.filter(e => e.ch >= 4);
console.log('第四～六章觸發', late.map(e => `${e.title}:${fired[e.id] || 0}`).join(' '));
console.log('從未觸發', late.filter(e => !fired[e.id]).map(e => e.title).join('、') || '（無）');
if (all) console.log('逐一測試選項', tried, '次');
