// 戰術戰場介面：點選部隊、移動、攻擊、計策、單挑，以及敵軍回合動畫。
import * as T from './tactics.js';
import * as I from './inkart.js';
import { createDuel, duelHint, duelRound, autoDuel, DUEL_MOVES } from './battle.js';

let E = null;   // 介面環境（由 ui.js 傳入）
let V = null;   // 目前戰鬥的介面狀態
const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, V && V.fast ? ms / 4 : ms));

export function runTactical(env, plan, mySide) {
  E = env;
  return new Promise(resolve => {
    const b = T.createTactical(E.S, plan);
    V = { b, mySide, resolve, sel: null, mode: null, target: null, pos: {}, flash: new Set(), arrows: [], anim: false, undo: null, fast: false, auto: false, duelAsked: false };
    const cv = $('bf');
    cv.width = I.BW * I.SCALE; cv.height = I.BH * I.SCALE;
    $('bfwrap').style.aspectRatio = `${I.BW} / ${I.BH}`;
    $('bt-title').innerHTML = b.field ? `${b.water ? '水戰' : '野戰'}・${E.esc(E.facName(plan.faction))} 對 ${E.esc(E.facName(b.def))}・${E.esc(b.cityName)}` : `${E.esc(E.facName(plan.faction))} 攻 ${E.esc(E.facName(b.def))}・${E.esc(b.cityName)}`;
    E.show('screen-battle');
    loop();
    render();
    if (b.over) { finish(); return; }
    banner(b.field ? '兩軍交鋒' : mySide === 'A' ? '攻城開始' : '守城迎敵');
    if (b.side !== mySide) setTimeout(enemyPhase, 900);
    else setTimeout(() => scrollToUnits(), 50);
  });
}

// ---------- 繪製迴圈 ----------
function loop() {
  if (!V) return;
  const ctx = $('bf').getContext('2d');
  const b = V.b;
  let reach = null, attack = null, tactic = null;
  const u = selUnit();
  if (u && u.side === V.mySide && b.side === V.mySide && !V.anim && !b.over) {
    if (V.mode && V.mode !== 'move') tactic = new Set(T.tacticTargets(b, u, V.mode).map(t => T.key(t.q, t.r)));
    else {
      if (!u.moved) reach = new Set([...T.reachable(b, u).keys()].filter(k => k !== T.key(u.q, u.r)));
      if (!u.acted) attack = new Set(T.attackTargets(b, u).map(t => T.key(t.q, t.r)));
    }
  }
  I.drawTactical(ctx, b, {
    sel: V.sel, reach, attack, tactic, target: V.target, pos: V.pos, flash: V.flash, arrows: V.arrows,
    t: performance.now(), side: V.mySide, imgFor: x => (x.genId ? I.imgOf(E.portraitSrc(E.R.gen(E.S, x.genId)), null) : null),
  });
  requestAnimationFrame(loop);
}

const selUnit = () => V.sel && V.b.units.find(u => u.id === V.sel && !u.dead);
const myTurn = () => V && !V.b.over && V.b.side === V.mySide && !V.anim && !V.auto;

function hexPct(q, r) { const c = I.hexCenter(q, r); return { x: c.x / I.BW * 100, y: c.y / I.BH * 100 }; }
function floatAt(q, r, text, cls = '') {
  const p = hexPct(q, r);
  const d = document.createElement('div');
  d.className = 'dmg ' + cls; d.textContent = text;
  d.style.left = `calc(${p.x}% - 14px)`; d.style.top = `calc(${p.y}% - 20px)`;
  $('bf-overlay').appendChild(d);
  setTimeout(() => d.remove(), 1000);
}
function banner(text) {
  $('bf-overlay').querySelectorAll('.banner').forEach(x => x.remove());
  const d = document.createElement('div');
  d.className = 'banner'; d.textContent = text;
  $('bf-overlay').appendChild(d);
  setTimeout(() => d.remove(), 1250);
}
function scrollToUnits(u) {
  const sc = $('bfscroll');
  if (!sc || sc.scrollWidth <= sc.clientWidth) return;
  const t = u || T.alive(V.b, V.mySide)[0];
  if (!t) return;
  const x = I.hexCenter(t.q, t.r).x / I.BW * sc.scrollWidth;
  sc.scrollTo({ left: Math.max(0, x - sc.clientWidth / 2), behavior: 'smooth' });
}

// ---------- 介面 ----------
function render() {
  if (!V) return;
  const b = V.b, S = E.S;
  const phase = b.over ? '戰鬥結束' : b.side === V.mySide ? '我軍行動' : '敵軍行動';
  $('bt-round').textContent = `第 ${Math.min(b.turn, b.maxTurns)} / ${b.maxTurns} 回合・${phase}`;
  const tot = T.totals(b);
  const myT = V.mySide === 'A' ? tot.A : tot.D, enT = V.mySide === 'A' ? tot.D : tot.A;
  const u = selUnit();
  let html = `<div class="bt-sum"><span>我軍 <b>${E.fmt(myT)}</b></span><span class="vsdot">對</span><span>敵軍 <b>${E.fmt(enT)}</b></span></div>`;
  if (u) {
    const g = u.genId ? E.R.gen(S, u.genId) : null;
    const ty = T.TYPES[u.type], tt = T.TERRAIN[T.tileAt(b, u.q, u.r).t];
    const mine = u.side === V.mySide;
    html += `<div class="uinfo ${mine ? '' : 'enemy'}">
      ${g ? E.portraitImg(g, 52) : `<div class="noface">${ty.glyph}</div>`}
      <div class="ud"><div class="un"><b>${E.esc(u.name)}</b><span class="seal sm">${ty.glyph}</span><span class="muted">${ty.name}・${tt.name}${u.trait ? '・' + E.esc(u.trait) : ''}</span></div>
      <div class="ubars"><span>兵</span>${E.bar(u.troops, u.max, 'red')}<em>${E.fmt(u.troops)}</em>
      <span>氣</span>${E.bar(u.energy, 100, 'blue')}<em>${u.energy}</em></div>
      <div class="muted">勇 ${u.str}・謀 ${u.int}・移動 ${ty.mv}${ty.range > 1 ? '・射程 ' + ty.range : ''}${u.conf ? '・<b style="color:#7a4aa0">混亂中</b>' : ''}</div></div></div>`;
    if (mine && myTurn()) {
      if (V.target) {
        const t = targetObj(u, V.target);
        if (t) {
          const d = T.previewDamage(b, u, t);
          const cd = t.kind === 'unit' && T.dist(u, t) === 1 && t.unit.type !== 'siege' && !t.unit.conf ? Math.round(T.previewDamage(b, t.unit, { kind: 'unit', unit: u }) * 0.5) : 0;
          html += `<div class="note">攻擊${t.kind === 'gate' ? '城門' : E.esc(t.unit.name) + '隊'}：預估造成 <b>${E.fmt(d)}</b>${cd ? `，反擊約 ${E.fmt(cd)}` : ''}<br><span class="muted">再點一次目標或按「攻擊」確認</span></div>`;
        }
      } else if (V.mode && V.mode !== 'move') html += `<div class="note">選擇${T.TACTICS[V.mode].name}目標（紫色格）</div>`;
      else if (!u.acted) html += `<div class="muted hint">${u.moved ? '已移動，可攻擊或施計' : '藍格可移動、紅格可攻擊'}</div>`;
      const tacOk = !u.acted && !u.conf && Object.keys(T.TACTICS).some(k => T.tacticTargets(b, u, k).length);
      const duelOk = T.duelCandidates(b, u).length > 0;
      html += `<div class="ubtns">
        ${V.target ? `<button class="btn red" data-b="confirm">攻擊</button>` : ''}
        ${V.mode && V.mode !== 'move' ? `<button class="btn" data-b="cancelmode">取消計策</button>` : `<button class="btn" data-b="tactic" ${tacOk ? '' : 'disabled'}>計策</button>`}
        <button class="btn" data-b="duel" ${duelOk ? '' : 'disabled'}>單挑</button>
        <button class="btn" data-b="wait" ${u.acted ? 'disabled' : ''}>待機</button>
        ${V.undo && u.moved && !u.acted ? `<button class="btn" data-b="undo">復原</button>` : ''}
      </div>`;
    }
  } else if (!b.over) {
    html += `<div class="muted hint">${b.side === V.mySide ? (b.field ? '點選我方部隊下令。擊潰全部敵軍即勝；' + b.maxTurns + ' 回合內未分勝負則各自收兵。' : '點選我方部隊下令。攻方須攻破城門、佔領本陣；守方須撐過 ' + b.maxTurns + ' 回合或擊潰敵軍。') : '敵軍行動中……'}</div>`;
  }
  $('bt-info').innerHTML = html;
  $('bt-log').innerHTML = b.log.slice(-10).reverse().map(t => `<div>${E.esc(t)}</div>`).join('');
  const dis = myTurn() ? '' : 'disabled';
  $('bt-cmds').innerHTML = b.over ? `<button class="btn red big" data-b="finish">查看戰果</button>`
    : `<button class="btn red big" data-b="end" ${dis}>結束回合 ▶</button>
       <button class="btn" data-b="delegate" ${dis}>委任剩餘</button>
       <button class="btn ${V.auto ? 'sel' : ''}" data-b="auto" ${V.anim && !V.auto ? 'disabled' : ''}>${V.auto ? '停止自動' : '全軍自動'}</button>
       <button class="btn" data-b="retreat" ${dis}>撤退</button>`;
}

function targetObj(u, k) {
  const [q, r] = k.split(',').map(Number);
  return T.attackTargets(V.b, u).find(t => t.q === q && t.r === r);
}

// ---------- 點擊 ----------
function onCanvas(e) {
  if (!V || !myTurn()) { if (V && !V.anim) inspect(e); return; }
  const rect = $('bf').getBoundingClientRect();
  const h = I.pixelToHex((e.clientX - rect.left) / rect.width * I.BW, (e.clientY - rect.top) / rect.height * I.BH);
  if (!h) return;
  const b = V.b, k = T.key(h.q, h.r);
  const u = selUnit();
  const occ = T.unitAt(b, h.q, h.r);
  // 計策目標
  if (u && V.mode && V.mode !== 'move') {
    if (T.tacticTargets(b, u, V.mode).some(t => t.q === h.q && t.r === h.r)) { castTactic(u, V.mode, h); return; }
    V.mode = null; render(); return;
  }
  // 攻擊目標
  if (u && u.side === V.mySide && !u.acted && targetObj(u, k)) {
    if (V.target === k) { doAttack(u, k); return; }
    V.target = k; render(); return;
  }
  V.target = null;
  if (occ) { V.sel = occ.id; V.mode = null; if (occ.side === V.mySide && occ !== u) V.undo = null; render(); return; }
  if (u && u.side === V.mySide && !u.moved && T.reachable(b, u).has(k)) { doMove(u, h.q, h.r); return; }
  V.sel = null; render();
}
function inspect(e) {
  const rect = $('bf').getBoundingClientRect();
  const h = I.pixelToHex((e.clientX - rect.left) / rect.width * I.BW, (e.clientY - rect.top) / rect.height * I.BH);
  const occ = h && T.unitAt(V.b, h.q, h.r);
  if (occ) { V.sel = occ.id; render(); }
}

async function doMove(u, q, r) {
  const from = { q: u.q, r: u.r };
  const path = T.doMove(V.b, u, q, r);
  if (!path) return;
  V.undo = { id: u.id, ...from };
  V.anim = true; render();
  await animPath(u, path);
  V.anim = false;
  if (V.b.over) { render(); finish(); return; }
  render();
}

async function doAttack(u, k) {
  const t = targetObj(u, k);
  V.target = null; V.undo = null;
  const ev = T.doAttack(E.S, V.b, u, t);
  await play(ev);
  afterAction(u);
}

async function castTactic(u, kind, h) {
  V.mode = null; V.undo = null;
  const ev = T.doTactic(E.S, V.b, u, kind, h);
  await play(ev);
  afterAction(u);
}

function afterAction(u) {
  if (V.b.over) { render(); finish(); return; }
  // 自動選下一支未行動部隊
  const next = T.alive(V.b, V.mySide).find(x => !x.acted && !x.conf);
  V.sel = next ? next.id : null;
  render();
  if (!next && !V.b.over) {
    const end = $('bt-cmds').querySelector('[data-b=end]');
    if (end) end.classList.add('pulse');
  }
}

$('bf').addEventListener('click', onCanvas);

$('screen-battle').addEventListener('click', async e => {
  const el = e.target.closest('[data-b]');
  if (!el || !V || el.disabled) return;
  const act = el.dataset.b, b = V.b, u = selUnit();
  if (act === 'finish') { finish(true); return; }
  if (act === 'auto') {
    V.auto = !V.auto; V.fast = V.auto; render();
    if (V.auto && b.side === V.mySide && !V.anim) { await delegate(); if (V && !V.b.over) await endMyPhase(); }
    return;
  }
  if (!myTurn()) return;
  if (act === 'confirm' && u && V.target) doAttack(u, V.target);
  else if (act === 'cancelmode') { V.mode = null; render(); }
  else if (act === 'wait' && u) { u.moved = true; u.acted = true; V.undo = null; afterAction(u); }
  else if (act === 'undo' && u && V.undo && V.undo.id === u.id) {
    u.q = V.undo.q; u.r = V.undo.r; u.moved = false; u.steps = 0; V.undo = null; render();
  } else if (act === 'tactic' && u) pickTactic(u);
  else if (act === 'duel' && u) startDuel(u);
  else if (act === 'end') endMyPhase();
  else if (act === 'delegate') { await delegate(); }
  else if (act === 'retreat') {
    const k = await E.choose('撤退', '<p>確定要撤退嗎？此戰將判定為敗北。</p>', [{ label: '撤退', cls: 'red' }], { closable: true });
    if (k === 0) { T.retreat(b, V.mySide); render(); finish(); }
  }
});

async function pickTactic(u) {
  const b = V.b;
  const opts = Object.entries(T.TACTICS).map(([k, t]) => {
    const tg = T.tacticTargets(b, u, k);
    return { k, t, ok: tg.length > 0, tg };
  });
  const k = await E.choose('計策', `<p>${E.esc(u.name)}　謀 ${u.int}・氣力 ${u.energy}</p>
    <div class="tacs">${opts.map(o => `<div class="${o.ok ? '' : 'dis'}"><b>${o.t.name}</b>（氣 ${o.t.cost}${o.t.range ? '・距離 ' + o.t.range : ''}）<span class="muted">${o.t.desc}</span></div>`).join('')}</div>`,
  opts.map(o => ({ label: o.t.name, disabled: !o.ok })), { closable: true });
  if (k < 0 || k == null) return;
  const o = opts[k];
  if (o.k === 'rouse' || o.k === 'rocks') { castTactic(u, o.k, o.tg[0]); return; }
  V.mode = o.k; V.target = null; render();
  const p = o.tg.map(t => T.tacticChance(b, u, o.k, t));
  E.toast(`點選紫色格施放${o.t.name}（成功率約 ${Math.min(...p)}～${Math.max(...p)}%）`);
}

async function startDuel(u) {
  const b = V.b;
  const cands = T.duelCandidates(b, u);
  let foe = cands[0];
  if (cands.length > 1) {
    const k = await E.choose('單挑', '<p>要向誰挑戰？</p>', cands.map(c => ({ label: `${c.name}（勇${c.str}）` })), { closable: true });
    if (k < 0 || k == null) return;
    foe = cands[k];
  }
  if (!T.acceptsDuel(E.S, u, foe)) {
    u.acted = true; u.moved = true; V.undo = null;
    foe.energy = Math.max(0, foe.energy - 20); foe.troops = Math.max(1, Math.round(foe.troops * 0.96));
    b.log.push(`${foe.name}不敢應戰，部隊士氣動搖！`);
    floatAt(foe.q, foe.r, '怯戰', 'fail');
    afterAction(u); return;
  }
  await playDuel(u, foe);
  afterAction(u);
}

function playDuel(mine, foe) {
  return new Promise(res => {
    const S = E.S, b = V.b;
    const gA = E.R.gen(S, mine.genId), gD = E.R.gen(S, foe.genId);
    const duel = createDuel(S, mine, foe);
    const hint = duelHint(S, duel);
    const draw = () => {
      E.openModal(`<div class="duel"><h3>單挑！</h3>
        <div class="vs"><div>${E.portraitImg(gA, 96)}<div><b>${E.esc(gA.name)}</b> 勇${gA.str}</div><div class="hp">${E.bar(duel.hpA, 100, 'red')}</div></div>
        <b class="vsx">對</b>
        <div>${E.portraitImg(gD, 96)}<div><b>${E.esc(gD.name)}</b> 勇${gD.str}</div><div class="hp">${E.bar(duel.hpD, 100, 'red')}</div></div></div>
        <div class="note">${duel.last ? E.esc(duel.last.txt) : '攻剋奇、奇剋守、守剋攻。勇武較高者能看穿對手的架勢。'}${hint && !duel.over ? `<br><b>${E.esc(hint)}</b>` : ''}</div>
        ${duel.over ? `<p><b>${duel.winner === 'a' ? `${E.esc(gA.name)}獲勝！` : duel.winner === 'd' ? `${E.esc(gD.name)}獲勝……` : '不分勝負'}</b></p>
          <div class="foot" style="justify-content:center"><button class="btn red" data-a="end">繼續作戰</button></div>`
        : `<div class="moves row" style="justify-content:center">${Object.entries(DUEL_MOVES).map(([k, n]) => `<button class="btn" data-a="${k}">${n}</button>`).join('')}</div>
           <div class="muted">第 ${duel.round + 1} / 6 合</div>`}</div>`,
      a => {
        if (a === 'end') {
          E.closeModal();
          const ko = (duel.winner === 'a' ? duel.hpD : duel.hpA) <= 0;
          const ev = T.applyDuel(S, b, mine, foe, duel.winner, ko);
          play(ev).then(() => { render(); res(); if (b.over) finish(); });
          return;
        }
        if (DUEL_MOVES[a] && !duel.over) { duelRound(S, duel, a); draw(); }
      });
    };
    draw();
  });
}

// ---------- 回合流程 ----------
async function delegate() {
  const b = V.b;
  V.sel = null; V.target = null; V.mode = null; V.undo = null;
  V.anim = true; render();
  for (const u of T.aiOrder(b, V.mySide)) {
    if (!V || b.over) break;
    await play(T.aiUnit(E.S, b, u), true);
  }
  V.anim = false; render();
  if (b.over) finish();
}

async function endMyPhase() {
  const b = V.b;
  V.sel = null; V.target = null; V.mode = null; V.undo = null;
  const ev = T.endPhase(E.S, b);
  render();
  await play(ev);
  if (b.over) { render(); finish(); return; }
  await enemyPhase();
}

async function enemyPhase() {
  if (!V) return;
  const b = V.b;
  V.anim = true; render();
  banner('敵軍行動'); await wait(700);
  for (const u of T.aiOrder(b, b.side)) {
    if (!V || b.over) break;
    if (await maybeChallenge(u)) continue;
    await play(T.aiUnit(E.S, b, u), true);
  }
  if (b.over) { V.anim = false; render(); finish(); return; }
  const ev = T.endPhase(E.S, b);
  await play(ev);
  V.anim = false;
  if (b.over) { render(); finish(); return; }
  if (V.auto) { render(); await delegate(); if (V && !V.b.over) await endMyPhase(); return; }
  banner(`第 ${b.turn} 回合・我軍`);
  const first = T.alive(b, V.mySide).find(x => !x.conf);
  V.sel = first ? first.id : null;
  render();
}

// 敵將叫陣
async function maybeChallenge(u) {
  const b = V.b;
  if (V.duelAsked || V.auto || !u.genId || u.conf) return false;
  const mine = T.duelCandidates(b, u).find(m => m.str + 8 <= u.str);
  if (!mine || !E.R.chance(E.S, 35)) return false;
  V.duelAsked = true;
  const k = await E.choose('敵將叫陣！', `<p><b>${E.esc(u.name)}</b>（勇 ${u.str}）在陣前叫陣，要與<b>${E.esc(mine.name)}</b>（勇 ${mine.str}）單挑！</p>`,
    [{ label: '應戰', cls: 'red' }, { label: '拒絕（部隊動搖）' }]);
  if (k === 0) {
    const duel = await new Promise(res => {
      // 玩家在單挑中操作自己的武將，因此以我方為 a
      playDuel(mine, u).then(() => res(true));
    });
    u.acted = true; u.moved = true;
    return duel;
  }
  mine.energy = Math.max(0, mine.energy - 20); mine.troops = Math.max(1, Math.round(mine.troops * 0.96));
  b.log.push(`${mine.name}拒絕單挑，部隊動搖。`);
  floatAt(mine.q, mine.r, '動搖', 'fail');
  render();
  return false;
}

// ---------- 事件動畫 ----------
async function animPath(u, path) {
  for (let i = 1; i < path.length; i++) {
    const a = I.hexCenter(path[i - 1].q, path[i - 1].r), c = I.hexCenter(path[i].q, path[i].r);
    const steps = V.fast ? 2 : 5;
    for (let s = 1; s <= steps; s++) { V.pos[u.id] = { x: a.x + (c.x - a.x) * s / steps, y: a.y + (c.y - a.y) * s / steps }; await wait(22); }
  }
  delete V.pos[u.id];
}

async function play(ev, enemy = false) {
  if (!ev || !ev.length || !V) { render(); return; }
  const b = V.b;
  const U = id => b.units.find(x => x.id === id);
  for (const e of ev) {
    if (!V) return;
    if (e.kind === 'move') { await animPath(U(e.id), e.path); render(); }
    else if (e.kind === 'atk') {
      const u = U(e.id), a = I.hexCenter(u.q, u.r), t = I.hexCenter(e.q, e.r);
      if (e.ranged || u.type === 'bow') {
        for (let p = 0; p <= 1.3; p += 0.1) { V.arrows = [{ x1: a.x, y1: a.y, x2: t.x, y2: t.y, p }]; await wait(24); }
        V.arrows = [];
      } else {
        for (const k of [0.15, 0.3, 0.42, 0.3, 0.15, 0]) { V.pos[u.id] = { x: a.x + (t.x - a.x) * k, y: a.y + (t.y - a.y) * k }; await wait(28); }
        delete V.pos[u.id];
      }
    } else if (e.kind === 'hit') {
      const u = U(e.id);
      V.flash.add(e.id); floatAt(u.q, u.r, `-${E.fmt(e.dmg)}`);
      await wait(160); V.flash.delete(e.id);
    } else if (e.kind === 'counter') { const u = U(e.id); floatAt(u.q, u.r, '反擊', 'info'); await wait(120); }
    else if (e.kind === 'gate') { floatAt(e.q, e.r, `-${E.fmt(e.dmg)}`); await wait(200); }
    else if (e.kind === 'gatebreak') { banner('城門已破！'); await wait(800); }
    else if (e.kind === 'rout') { const u = U(e.id); floatAt(u.q, u.r, '潰散', 'fail'); await wait(300); }
    else if (e.kind === 'tactic') { banner(`${U(e.id).name}・${e.name}`); await wait(650); }
    else if (e.kind === 'fail') { floatAt(e.q, e.r, '識破', 'fail'); await wait(300); }
    else if (e.kind === 'conf') { const u = U(e.id); floatAt(u.q, u.r, '混亂', 'info'); await wait(250); }
    else if (e.kind === 'buff') { const u = U(e.id); floatAt(u.q, u.r, '士氣↑', 'info'); await wait(120); }
    else if (e.kind === 'confused') { const u = U(e.id); floatAt(u.q, u.r, '混亂中', 'info'); await wait(250); }
    render();
  }
  if (enemy) await wait(120);
  render();
}

// ---------- 結束 ----------
function finish(go) {
  const b = V.b;
  render();
  if (!go) return;
  const won = b.winner === V.mySide;
  const t = T.totals(b);
  const myStart = V.mySide === 'A' ? b.startA : b.startD, enStart = V.mySide === 'A' ? b.startD : b.startA;
  const myNow = V.mySide === 'A' ? t.A : t.D, enNow = V.mySide === 'A' ? t.D : t.A;
  E.choose(b.draw ? '勝負未分' : won ? '大捷！' : '敗北……', `<p>${E.esc(b.log[b.log.length - 1])}</p>
    <table class="dtable"><tr><th></th><th>出戰</th><th>剩餘</th></tr>
    <tr><td>我軍</td><td>${E.fmt(myStart)}</td><td>${E.fmt(myNow)}</td></tr><tr><td>敵軍</td><td>${E.fmt(enStart)}</td><td>${E.fmt(enNow)}</td></tr></table>`,
  [{ label: '確定', cls: 'red' }]).then(() => {
    const r = T.result(E.S, b);
    const done = V.resolve; V = null; done(r);
  });
}

// AI 對 AI 或自動交戰
export function autoTactical(S, plan) {
  const b = T.createTactical(S, plan);
  return T.autoBattle(S, b);
}
export { autoDuel };
