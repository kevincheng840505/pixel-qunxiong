// 表現層：只讀取規則層狀態並送出指令。
import * as R from './rules.js';
import * as B from './battle.js';
import * as T from './tactics.js';
import { runTactical } from './battleui.js';
import { drawInkMap, drawInkTitle } from './inkmap.js';
import { planTurn, aiProposals } from './ai.js';
import * as A from './art.js';
import { FACTIONS, TRAITS, PERSONALITIES, TERRAIN } from './data.js';

let S = null;
let sel = null;
let busy = false;

const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Math.round(n).toLocaleString('en-US');
const facName = id => (id ? R.fac(S, id).name : '中立');
const facTag = id => `<span class="tag" style="background:${A.facColor(id)};color:${id === 'gong' ? '#2b2118' : '#fff'}">${esc(facName(id))}</span>`;
const portraitImg = (g, size = 36) => `<img class="px" width="${size}" height="${size}" src="${A.portrait(g, g.faction || g.captor)}" alt="">`;
const bar = (v, max, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, v / max * 100))}%"></i></div>`;

// ---------- 共用 ----------
export function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
}

export function toast(msg, ms = 2600) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  $('toast').appendChild(t);
  setTimeout(() => t.remove(), ms);
  while ($('toast').children.length > 3) $('toast').firstChild.remove();
}

let modalHandler = null;
function openModal(html, handler) {
  $('modal-box').innerHTML = html;
  $('modal').classList.remove('hidden');
  $('modal-box').scrollTop = 0;
  modalHandler = handler;
}
function closeModal() { $('modal').classList.add('hidden'); modalHandler = null; }
$('modal-box').addEventListener('click', e => {
  const b = e.target.closest('[data-a]');
  if (!b || b.disabled) return;
  if (b.dataset.a === 'close') { closeModal(); return; }
  if (modalHandler) modalHandler(b.dataset.a, b, e);
});
$('modal-box').addEventListener('input', e => { if (modalHandler && e.target.dataset.i) modalHandler('input:' + e.target.dataset.i, e.target, e); });

// 回傳 Promise：選擇其中一個選項
function choose(title, body, options, { closable = false } = {}) {
  return new Promise(res => {
    openModal(`<h3>${title}</h3>${body}<div class="foot">${options.map((o, i) =>
      `<button class="btn ${o.cls || ''}" data-a="opt${i}" ${o.disabled ? 'disabled' : ''}>${o.label}</button>`).join('')}
      ${closable ? '<button class="btn" data-a="opt-1">取消</button>' : ''}</div>`,
    a => { if (a.startsWith('opt')) { closeModal(); res(+a.slice(3)); } });
  });
}

// ---------- 標題 ----------
let titleAnim = 0;
function animTitle(t) {
  const cv = $('title-art');
  if ($('screen-title').classList.contains('active')) drawInkTitle(cv.getContext('2d'), t);
  titleAnim = requestAnimationFrame(animTitle);
}

export function initTitle() {
  cancelAnimationFrame(titleAnim);
  titleAnim = requestAnimationFrame(animTitle);
  $('btn-continue').disabled = !localStorage.getItem('pxqx.auto');
  show('screen-title');
}

$('screen-title').addEventListener('click', e => {
  const a = e.target.closest('[data-act]')?.dataset.act;
  if (a === 'new') openSelect();
  if (a === 'continue') loadSlot('auto');
  if (a === 'load') openLoadMenu();
  if (a === 'help') openHelp();
});

function openSelect() {
  const list = $('faction-list');
  const tmp = R.newGame('cao', 1);
  list.innerHTML = FACTIONS.map(f => {
    const ruler = tmp.generals.find(g => g.id === tmp.factions[f.id].ruler);
    const nc = tmp.cities.filter(c => c.owner === f.id).length;
    const ng = tmp.generals.filter(g => g.faction === f.id).length;
    return `<div class="fcard pixbox" data-f="${f.id}" style="--fc:${f.color}">
      <img class="px" src="${A.portrait(ruler, f.id)}" alt="">
      <div><h3><span class="sw" style="background:${f.color}"></span>${f.name}<span class="diff">${f.difficulty}</span></h3>
      <p>城池 ${nc}・武將 ${ng}・金 ${f.gold}</p><p class="muted">${f.blurb}</p></div></div>`;
  }).join('');
  show('screen-select');
}
$('faction-list').addEventListener('click', e => {
  const f = e.target.closest('[data-f]')?.dataset.f;
  if (!f) return;
  S = R.newGame(f);
  sel = R.citiesOf(S, f)[0].id;
  startGame(true);
});
$('screen-select').addEventListener('click', e => { if (e.target.closest('[data-act=back]')) initTitle(); });

function startGame(intro) {
  show('screen-game');
  renderAll();
  if (intro) {
    const f = R.fac(S, S.player);
    choose(`西元 190 年・${f.name}`, `<div class="note">董卓挾天子據洛陽，關東諸侯組成<b>討董聯軍</b>。聯軍期間（至 191 年冬）諸侯彼此停戰，可專心對付董卓、攻取中立城池或發展內政。</div>
      <p>每一季你有若干<b>軍令</b>，每個指令消耗 1 點，每位武將每季只能行動一次。點選地圖上的城池開始吧！</p>`, [{ label: '出發', cls: 'red' }]);
  }
}

// ---------- 主畫面 ----------
function renderAll() {
  if (!S) return;
  renderTop(); renderMap(); renderPanel();
}

function renderTop() {
  const f = R.fac(S, S.player);
  $('tb-date').textContent = R.seasonName(S);
  $('tb-fac').innerHTML = facTag(S.player) + `<span class="muted" style="color:#c8b890">${R.citiesOf(S, S.player).length} 城</span>`;
  $('tb-gold').textContent = fmt(f.gold);
  $('tb-food').textContent = fmt(f.food);
  $('tb-orders').textContent = `${S.orders}`;
  const cb = $('coalition-banner');
  if (S.coalition) {
    cb.classList.remove('hidden');
    cb.textContent = `${S.coalition.name}（目標：${facName(S.coalition.target)}）`;
  } else cb.classList.add('hidden');
}

function renderMap() {
  const ctx = $('map').getContext('2d');
  const c = sel && R.city(S, sel);
  const targets = c && c.owner === S.player ? R.attackTargets(S, S.player, c.id) : [];
  drawInkMap(ctx, S, { selected: sel, targets, routes: targets.map(t => [sel, t]) });
  $('maplabels').innerHTML = S.cities.map(c => {
    const left = c.x / A.MAP_W * 100, top = (c.y + 4.5) / A.MAP_H * 100;
    return `<button class="ctap" data-c="${c.id}" style="left:${left}%;top:${c.y / A.MAP_H * 100}%" aria-label="${c.name}"></button>
      <button class="clabel ${c.owner === S.player ? 'mine' : ''} ${sel === c.id ? 'sel' : ''}" data-c="${c.id}" style="left:${left}%;top:${top}%"><i style="background:${A.facColor(c.owner)};color:${c.owner === 'gong' ? '#2b2118' : '#fff'}">${c.owner ? A.FAC_GLYPH[c.owner] : '－'}</i>${c.name}</button>`;
  }).join('');
}
$('maplabels').addEventListener('click', e => {
  const id = +e.target.closest('[data-c]')?.dataset.c;
  if (!id || busy) return;
  sel = sel === id ? null : id;
  renderMap(); renderPanel();
});

function renderPanel() {
  const p = $('panel');
  if (!sel) { p.innerHTML = overviewHtml(); return; }
  const c = R.city(S, sel);
  const mine = c.owner === S.player;
  const gens = c.owner ? R.gensIn(S, c.id, c.owner) : [];
  const cap = R.capOf(c), tcap = R.troopCapOf(c);
  const free = mine ? S.generals.filter(g => g.city === c.id && g.status === 'free') : [];
  let html = `<div class="ph"><h2>${c.name}</h2>${facTag(c.owner)}<span class="tag" style="background:#5a4636">${c.size}城</span><span class="muted">${TERRAIN[c.terrain]}</span></div>
    <div class="stats">
      <span>兵力</span>${bar(c.troops, tcap, 'red')}<span>${fmt(c.troops)}</span>
      <span>農田</span>${bar(c.farm, cap)}<span>${c.farm}/${cap}</span>
      <span>市集</span>${bar(c.market, cap, 'gold')}<span>${c.market}/${cap}</span>
      <span>城防</span>${bar(c.wall, cap, 'blue')}<span>${c.wall}/${cap}</span>
      <span>民心</span>${bar(c.order, 100)}<span>${c.order}</span>
    </div>`;
  if (mine) {
    const dis = S.orders <= 0 ? 'disabled' : '';
    html += `<div class="actions">
      ${['farm', 'market', 'wall', 'draft', 'govern', 'search'].map(a => `<button class="btn" data-pa="${a}" ${dis}>${R.ACTIONS[a].name}</button>`).join('')}
      <button class="btn red" data-pa="attack" ${dis}>出征</button>
      <button class="btn" data-pa="move" ${dis}>移動</button>
      <button class="btn" data-pa="reward">賞賜</button>
    </div>`;
    if (S.orders <= 0) html += `<div class="note">本季軍令已用完，請按「結束本季」。</div>`;
  } else {
    const fromIds = R.ADJ[c.id].filter(id => R.city(S, id).owner === S.player);
    const peace = c.owner && R.atPeace(S, S.player, c.owner);
    if (fromIds.length) {
      html += peace ? `<div class="note">與${facName(c.owner)}${R.fac(S, S.player).alliance[c.owner] ? '同盟中' : '停戰中'}，無法出征。</div>`
        : `<div class="actions"><button class="btn red" data-pa="attackthis" ${S.orders <= 0 ? 'disabled' : ''}>出征此城</button></div>`;
    }
    if (c.owner) html += `<div class="muted" style="margin-top:6px">與我方關係：${R.fac(S, S.player).relations[c.owner] || 0}</div>`;
  }
  html += `<div class="sec">武將（${gens.length}）</div><div class="glist">${gens.map(g => genRow(g, mine)).join('') || '<span class="muted">無武將駐守</span>'}</div>`;
  if (free.length) html += `<div class="sec">在野人才</div><div class="glist">${free.map(g => genRow(g, false)).join('')}</div><div class="muted">可用「訪賢」再次登用。</div>`;
  p.innerHTML = html;
}

function genRow(g, showDone, extra = '') {
  const isRuler = g.faction && R.fac(S, g.faction).ruler === g.id;
  return `<div class="grow ${extra}" data-g="${g.id}">${portraitImg(g)}<div><div class="nm">${isRuler ? '👑' : ''}${esc(g.name)}</div>
    <div class="st"><span>勇${g.str}</span><span>謀${g.int}</span><span>治${g.pol}</span><span>德${g.cha}</span></div></div>
    ${showDone ? `<span class="done">${g.acted ? '已行動' : '待命'}</span>` : ''}</div>`;
}

function overviewHtml() {
  const f = R.fac(S, S.player);
  const cs = R.citiesOf(S, S.player);
  return `<div class="ph"><h2>${esc(f.name)}軍</h2>${facTag(S.player)}</div>
    <div class="stats"><span>城池</span><span>${cs.length} / ${S.cities.length}</span><span></span>
    <span>總兵力</span><span>${fmt(R.totalTroops(S, S.player))}</span><span></span>
    <span>武將</span><span>${R.gensOf(S, S.player).length}</span><span></span>
    <span>軍令</span><span>${S.orders} / ${R.calcOrders(S, S.player)}</span><span></span></div>
    <div class="sec">我方城池</div><div class="glist">${cs.map(c => `<div class="grow" data-cc="${c.id}"><b>${c.name}</b>
      <span>兵 ${fmt(c.troops)}</span><span>民心 ${c.order}</span><span class="done">${R.gensIn(S, c.id, S.player).filter(g => !g.acted).length} 人待命</span></div>`).join('')}</div>
    <div class="note">點地圖上的城池查看詳情與下達指令。秋季收糧，冬季出征士氣較低。</div>`;
}

$('panel').addEventListener('click', e => {
  if (busy) return;
  const cc = e.target.closest('[data-cc]');
  if (cc) { sel = +cc.dataset.cc; renderMap(); renderPanel(); return; }
  const a = e.target.closest('[data-pa]')?.dataset.pa;
  if (a) { panelAction(a); return; }
  const g = e.target.closest('[data-g]');
  if (g) openGeneral(+g.dataset.g);
});

function needOrder() {
  if (S.orders <= 0) { toast('軍令不足'); return false; }
  return true;
}

function panelAction(a) {
  const c = R.city(S, sel);
  if (a === 'attack') { if (needOrder()) openAttack(c.id, null); return; }
  if (a === 'attackthis') {
    if (!needOrder()) return;
    const from = R.ADJ[c.id].map(id => R.city(S, id)).filter(x => x.owner === S.player).sort((x, y) => y.troops - x.troops)[0];
    openAttack(from.id, c.id); return;
  }
  if (a === 'move') { if (needOrder()) openMove(c.id); return; }
  if (a === 'reward') { openReward(c.id); return; }
  if (!needOrder()) return;
  pickGeneral(c.id, a);
}

const ACT_STAT = { farm: 'pol', market: 'pol', wall: 'pol', draft: 'cha', govern: 'pol', search: 'cha' };
const STAT_NAME = { str: '勇', int: '謀', pol: '治', cha: '德' };

function pickGeneral(cid, act) {
  const c = R.city(S, cid);
  const A_ = R.ACTIONS[act];
  const st = ACT_STAT[act];
  const gens = R.gensIn(S, cid, S.player).sort((x, y) => y[st] - x[st]);
  openModal(`<button class="btn small close-x" data-a="close">✕</button><h3>${A_.name}・${c.name}</h3>
    <div class="note">${A_.desc}${A_.gold ? `（花費金 ${A_.gold}）` : ''}。依「${STAT_NAME[st]}」決定效果，請選擇負責的武將：</div>
    <div class="glist">${gens.map(g => genRow(g, true, g.acted ? 'dis' : '')).join('')}</div>`,
  (a, el) => {
    const gid = +el.closest('[data-g]')?.dataset.g;
    if (!gid) return;
    const r = R.doCityAction(S, S.player, cid, gid, act);
    if (!r.ok) { toast(r.msg); return; }
    S.orders--;
    closeModal(); toast(r.msg, 3500); R.log(S, r.msg);
    renderAll();
  });
  $('modal-box').querySelectorAll('.grow').forEach(el => el.setAttribute('data-a', 'g'));
}

function openReward(cid) {
  const gens = R.gensIn(S, cid, S.player).filter(g => g.id !== R.fac(S, S.player).ruler);
  openModal(`<button class="btn small close-x" data-a="close">✕</button><h3>賞賜（金 100，不耗軍令）</h3>
    <div class="glist">${gens.map(g => `<div class="grow" data-a="g" data-g="${g.id}">${portraitImg(g)}<b>${esc(g.name)}</b><span>忠誠 ${g.loyalty}</span><span class="muted">${g.pers}</span></div>`).join('') || '<span class="muted">此城沒有可賞賜的武將</span>'}</div>`,
  (a, el) => {
    const gid = +el.dataset.g; if (!gid) return;
    const r = R.reward(S, S.player, gid);
    toast(r.msg); openReward(cid); renderTop();
  });
}

// ---------- 移動 ----------
function openMove(from) {
  const dests = R.ADJ[from].filter(id => R.city(S, id).owner === S.player);
  const c = R.city(S, from);
  if (!dests.length) { toast('沒有相鄰的己方城池'); return; }
  const st = { to: dests[0], gids: new Set(), troops: 0 };
  const draw = () => {
    const gens = R.gensIn(S, from, S.player);
    openModal(`<button class="btn small close-x" data-a="close">✕</button><h3>移動・從${c.name}出發</h3>
      <div class="row">目的地：${dests.map(id => `<button class="btn small ${st.to === id ? 'sel' : ''}" data-a="to" data-v="${id}">${R.city(S, id).name}</button>`).join('')}</div>
      <div class="sec">武將（可複選）</div><div class="glist">${gens.map(g => `<div data-a="g" data-g="${g.id}">${genRow(g, true, (st.gids.has(g.id) ? 'sel ' : '') + (g.acted ? 'dis' : ''))}</div>`).join('')}</div>
      <div class="sec">兵力：<b id="mv-t">${fmt(st.troops)}</b> / ${fmt(c.troops)}</div>
      <input type="range" min="0" max="${c.troops}" step="100" value="${st.troops}" data-i="troops" style="width:100%">
      <div class="foot"><button class="btn red" data-a="go">移動（軍令 1）</button></div>`,
    (a, el) => {
      if (a === 'to') { st.to = +el.dataset.v; draw(); }
      else if (a === 'g') { const id = +el.dataset.g; if (R.gen(S, id).acted) return; st.gids.has(id) ? st.gids.delete(id) : st.gids.add(id); draw(); }
      else if (a === 'input:troops') { st.troops = +el.value; $('mv-t').textContent = fmt(st.troops); }
      else if (a === 'go') {
        const r = R.moveUnits(S, S.player, from, st.to, [...st.gids], st.troops);
        if (!r.ok) { toast(r.msg); return; }
        S.orders--; closeModal(); toast(r.msg); R.log(S, r.msg); renderAll();
      }
    });
  };
  draw();
}

// ---------- 出征設定 ----------
function openAttack(from, to) {
  const src = R.city(S, from);
  const targets = R.attackTargets(S, S.player, from);
  if (!targets.length) { toast('附近沒有可以進攻的城池'); return; }
  if (to == null) {
    openModal(`<button class="btn small close-x" data-a="close">✕</button><h3>出征・選擇目標</h3><div class="glist">${targets.map(id => {
      const t = R.city(S, id);
      return `<div class="grow" data-a="t" data-v="${id}"><b>${t.name}</b>${facTag(t.owner)}<span>兵 ${fmt(t.troops)}</span><span>城防 ${t.wall}</span></div>`;
    }).join('')}</div>`, (a, el) => { if (a === 't') openAttack(from, +el.dataset.v); });
    return;
  }
  const tgt = R.city(S, to);
  const avail = R.gensIn(S, from, S.player).filter(g => !g.acted);
  if (!avail.length) { toast(`${src.name}沒有可以出征的武將`); return; }
  const cfg = new Map();
  const autoAdd = g => {
    cfg.set(g.id, { type: B.prefType(S, g), troops: 0 });
    rebalance();
  };
  const rebalance = () => {
    const n = cfg.size; if (!n) return;
    const per = Math.floor(src.troops * 0.8 / n / 100) * 100;
    for (const v of cfg.values()) v.troops = per;
  };
  avail.sort((a, b) => b.str - a.str).slice(0, Math.min(3, avail.length)).forEach(autoAdd);
  const defGens = tgt.owner ? R.gensIn(S, tgt.id, tgt.owner) : [];
  const draw = () => {
    const total = [...cfg.values()].reduce((a, v) => a + v.troops, 0);
    const food = Math.round(total / 10);
    openModal(`<button class="btn small close-x" data-a="close">✕</button><h3>出征：${src.name} → ${tgt.name}</h3>
      <div class="note">守軍 ${fmt(tgt.troops)}・城防 ${tgt.wall}・守將 ${defGens.length ? defGens.map(g => esc(g.name)).join('、') : '無（守備隊）'}<br>
      <span class="muted">槍剋騎、騎剋弓、弓剋槍。衝車專破城門。攻方須在 ${T.MAX_TURNS} 回合內攻破城門、佔領本陣。</span></div>
      <div class="sec">選擇武將（最多 5 位）</div>
      <div class="glist">${avail.map(g => {
        const c = cfg.get(g.id);
        if (!c) return `<div class="grow" data-a="add" data-g="${g.id}">${portraitImg(g, 32)}<b>${esc(g.name)}</b><span>勇${g.str} 謀${g.int}</span><span class="muted">${g.trait}</span><span class="done">＋ 加入</span></div>`;
        return `<div class="unitcfg">${portraitImg(g, 40)}<div>
          <div class="row" style="margin:0"><b>${esc(g.name)}</b><span class="muted">勇${g.str} 謀${g.int} ${g.trait}</span><button class="btn small" data-a="rm" data-g="${g.id}">移除</button></div>
          <div class="row" style="margin:2px 0"><span class="seg">${Object.entries(T.TYPES).map(([k, t]) => `<button class="btn ${c.type === k ? 'sel' : ''}" data-a="type" data-g="${g.id}" data-v="${k}">${t.name}</button>`).join('')}</span></div>
          <div class="row" style="margin:0"><input type="range" min="0" max="${src.troops}" step="100" value="${c.troops}" data-i="tr${g.id}" style="flex:1"><b id="tr${g.id}">${fmt(c.troops)}</b></div>
        </div></div>`;
      }).join('')}</div>
      <div class="note">出征兵力 <b id="tot">${fmt(total)}</b> / 城內 ${fmt(src.troops)}・軍糧 <b id="food">${fmt(food)}</b>（現有 ${fmt(R.fac(S, S.player).food)}）${S.season === 3 ? '<br>⚠ 冬季行軍，士氣較低' : ''}</div>
      <div class="foot"><button class="btn red big" data-a="go">出陣！</button></div>`,
    (a, el) => {
      const gid = +el.dataset.g;
      if (a === 'add') { if (cfg.size >= 5) { toast('最多 5 位武將'); return; } autoAdd(R.gen(S, gid)); draw(); }
      else if (a === 'rm') { cfg.delete(gid); rebalance(); draw(); }
      else if (a === 'type') { cfg.get(gid).type = el.dataset.v; draw(); }
      else if (a.startsWith('input:tr')) {
        const id = +a.slice(8); const c = cfg.get(id);
        const others = [...cfg.entries()].filter(([k]) => k !== id).reduce((s, [, v]) => s + v.troops, 0);
        c.troops = Math.min(+el.value, src.troops - others);
        el.value = c.troops; $('tr' + id).textContent = fmt(c.troops);
        const tot = [...cfg.values()].reduce((s, v) => s + v.troops, 0);
        $('tot').textContent = fmt(tot); $('food').textContent = fmt(tot / 10);
      } else if (a === 'go') {
        const units = [...cfg.entries()].filter(([, v]) => v.troops > 0).map(([genId, v]) => ({ genId, ...v }));
        const tot = units.reduce((s, u) => s + u.troops, 0);
        if (!units.length || tot < 100) { toast('請分配兵力'); return; }
        const f = R.fac(S, S.player);
        if (f.food < tot / 10) { toast('軍糧不足'); return; }
        f.food -= Math.round(tot / 10);
        S.orders--;
        closeModal();
        doPlayerAttack({ faction: S.player, from, to, units });
      }
    });
  };
  draw();
}

async function doPlayerAttack(plan) {
  busy = true;
  const res = await runBattle(plan, 'A');
  const def = R.city(S, plan.to).owner;
  const caps = R.applyBattle(S, plan, res);
  show('screen-game');
  renderAll();
  if (res.winner === 'A') await handleCaptives(caps.filter(id => R.gen(S, id).captor === S.player));
  else if (def) R.aiHandleCaptives(S, def, caps);
  else for (const id of caps) { const g = R.gen(S, id); g.status = 'free'; g.faction = null; }
  if (res.winner === 'A') sel = plan.to;
  R.checkVictory(S);
  busy = false;
  renderAll();
  if (S.over) gameOver();
}

async function handleCaptives(ids) {
  for (const id of ids) {
    const g = R.gen(S, id);
    if (g.status !== 'captive') continue;
    const p = R.persuadeChance(S, S.player, g);
    const isRuler = Object.values(S.factions).some(f => f.alive && f.ruler === g.id);
    const k = await choose('處置俘虜', `<div class="captive">${portraitImg(g, 64)}<div><b style="font-size:18px">${esc(g.name)}</b>
      ${g.faction ? facTag(g.faction) : ''}<div>勇${g.str} 謀${g.int} 治${g.pol} 德${g.cha}</div><div class="muted">${g.trait}・${g.pers}</div></div></div>
      ${isRuler ? '<div class="note">對方是一方君主，不會投降。</div>' : `<div class="note">勸降成功率約 ${p}%</div>`}`,
    [{ label: '勸降', cls: 'gold', disabled: isRuler }, { label: '釋放' }, { label: '處斬', cls: 'red' }]);
    const r = R.handleCaptive(S, S.player, id, ['persuade', 'release', 'execute'][k]);
    toast(r.msg, 3500); R.log(S, r.msg);
  }
}

// ---------- 戰鬥畫面 ----------
function runBattle(plan, mySide) {
  return runTactical({
    S, R, A, esc, fmt, bar, show, toast, choose, openModal, closeModal, facName, portraitImg,
    portraitSrc: g => A.portrait(g, g.faction || g.captor),
  }, plan, mySide);
}

// ---------- 季末 ----------
$('bottombar').addEventListener('click', e => {
  const a = e.target.closest('[data-act]')?.dataset.act;
  if (!a || busy) return;
  if (a === 'endturn') endTurn();
  if (a === 'generals') openGenerals();
  if (a === 'diplomacy') openDiplomacy();
  if (a === 'log') openLog();
});
$('btn-menu').addEventListener('click', () => { if (!busy) openMenu(); });

async function endTurn() {
  if (S.orders > 0) {
    const k = await choose('結束本季？', `<p>還有 ${S.orders} 點軍令沒有使用。</p>`, [{ label: '結束本季', cls: 'red' }], { closable: true });
    if (k !== 0) return;
  }
  busy = true;
  $('btn-end').disabled = true;
  const marker = S.log[0];
  const order = Object.keys(S.factions).filter(id => id !== S.player).sort(() => R.rand(S) - 0.5);
  for (const fid of order) {
    if (!R.fac(S, fid).alive || S.over) continue;
    const plans = planTurn(S, fid);
    for (const p of plans) {
      if (!R.fac(S, fid).alive || S.over) break;
      const dst = R.city(S, p.to);
      if (dst.owner === fid || R.atPeace(S, fid, dst.owner) || R.city(S, p.from).owner !== fid) continue;
      let res;
      if (dst.owner === S.player) {
        const atkGens = p.units.map(u => R.gen(S, u.genId).name).join('、');
        const tot = p.units.reduce((a, u) => a + u.troops, 0);
        sel = dst.id; renderAll();
        const k = await choose('⚠ 敵軍來襲！', `<p><b>${esc(R.fac(S, fid).name)}</b>軍由${R.city(S, p.from).name}進攻我方<b>${dst.name}</b>！</p>
          <p>敵將：${esc(atkGens)}・兵力 ${fmt(tot)}<br>我方守軍 ${fmt(dst.troops)}・守將 ${R.gensIn(S, dst.id, S.player).length} 人</p>`,
        [{ label: '親自指揮', cls: 'red' }, { label: '自動交戰' }]);
        if (k === 0) { res = await runBattle(p, 'D'); show('screen-game'); }
        else { const b = T.createTactical(S, p); res = T.autoBattle(S, b); toast(res.winner === 'D' ? `${dst.name}守住了！` : `${dst.name}失守……`, 3500); }
        const caps = R.applyBattle(S, p, res);
        if (res.winner === 'D') await handleCaptives(caps.filter(id => R.gen(S, id).captor === S.player));
        else R.aiHandleCaptives(S, fid, caps);
        renderAll();
      } else {
        const b = T.createTactical(S, p);
        res = T.autoBattle(S, b);
        const caps = R.applyBattle(S, p, res);
        const captor = res.winner === 'A' ? fid : dst.owner;
        if (captor && R.fac(S, captor).alive) R.aiHandleCaptives(S, captor, caps);
        else for (const id of caps) { const g = R.gen(S, id); if (g.status === 'captive') { g.status = 'free'; g.faction = null; } }
      }
    }
  }
  R.endSeasonEconomy(S);
  R.advanceSeason(S);
  renderAll();
  if (S.over) { busy = false; $('btn-end').disabled = false; gameOver(); return; }
  // 季報
  const news = [];
  for (const l of S.log) { if (l === marker) break; news.push(l); }
  if (news.length) {
    await choose(`${R.seasonName(S)}・季報`, `<div>${news.slice(0, 14).map(l => `<div class="logline ${l.kind}">${esc(l.text)}</div>`).join('')}</div>`, [{ label: '確定', cls: 'red' }]);
  }
  // 事件
  const ev = R.rollEvent(S);
  if (ev) {
    const k = await choose(`事件：${ev.ev.title}`, `<div class="note">${esc(ev.ev.text(ev.city))}</div>`, ev.ev.choices.map(c => ({ label: c.label })));
    ev.ev.choices[k].run(S, ev.city);
    R.log(S, `${ev.city.name}${ev.ev.title}：${ev.ev.choices[k].label}`);
  }
  for (const pr of aiProposals(S)) {
    const f = R.fac(S, pr.from);
    const k = await choose('使者來訪', `<p>${esc(f.name)}遣使前來，提議${pr.kind === 'truce' ? '停戰一年' : '締結同盟'}。</p>`, [{ label: '接受', cls: 'red' }, { label: '婉拒' }]);
    if (k === 0) {
      if (pr.kind === 'truce') { f.truce[S.player] = S.turn + 4; R.fac(S, S.player).truce[f.id] = S.turn + 4; }
      else { f.alliance[S.player] = true; R.fac(S, S.player).alliance[f.id] = true; }
      R.log(S, `與${f.name}${pr.kind === 'truce' ? '停戰' : '結盟'}。`);
    } else R.changeRel(S, f.id, S.player, -5);
  }
  saveSlot('auto', true);
  busy = false;
  $('btn-end').disabled = false;
  renderAll();
}

function gameOver() {
  const win = S.over === 'win';
  localStorage.removeItem('pxqx.auto');
  choose(win ? '天下一統！' : '勢力覆滅', win
    ? `<p>${R.seasonName(S)}，${esc(R.fac(S, S.player).name)}平定群雄，一統天下！</p>`
    : `<p>${R.seasonName(S)}，你的勢力失去了最後一座城池……</p>`, [{ label: '回到標題', cls: 'red' }]).then(() => initTitle());
}

// ---------- 武將一覽 ----------
function openGenerals() {
  const gens = R.gensOf(S, S.player).sort((a, b) => b.str + b.int - a.str - a.int);
  openModal(`<button class="btn small close-x" data-a="close">✕</button><h3>我方武將（${gens.length}）</h3>
    <div class="glist">${gens.map(g => `<div class="grow" data-a="g" data-g="${g.id}">${portraitImg(g)}<div><div class="nm">${esc(g.name)}</div>
      <div class="st"><span>勇${g.str}</span><span>謀${g.int}</span><span>治${g.pol}</span><span>德${g.cha}</span></div></div>
      <div class="muted">${R.city(S, g.city).name}<br>忠${g.loyalty}</div><span class="done">${g.acted ? '已行動' : '待命'}</span></div>`).join('')}</div>`,
  (a, el) => { if (a === 'g') openGeneral(+el.dataset.g, true); });
}

function openGeneral(id, back) {
  const g = R.gen(S, id);
  const isRuler = g.faction && R.fac(S, g.faction).ruler === g.id;
  openModal(`<button class="btn small close-x" data-a="${back ? 'back' : 'close'}">✕</button>
    <div class="captive">${portraitImg(g, 96)}<div><h3>${isRuler ? '👑' : ''}${esc(g.name)}</h3>${g.faction ? facTag(g.faction) : '<span class="tag" style="background:#8a7a5a">在野</span>'}
    <div class="muted">${R.city(S, g.city).name}${g.faction === S.player ? `・忠誠 ${g.loyalty}` : ''}</div></div></div>
    <div class="stats"><span>勇</span>${bar(g.str, 100, 'red')}<span>${g.str}</span><span>謀</span>${bar(g.int, 100, 'blue')}<span>${g.int}</span>
    <span>治</span>${bar(g.pol, 100)}<span>${g.pol}</span><span>德</span>${bar(g.cha, 100, 'gold')}<span>${g.cha}</span></div>
    <div class="note"><b>天賦・${g.trait}</b>：${TRAITS[g.trait].desc}<br><b>性格・${g.pers}</b>：${PERSONALITIES[g.pers]}</div>`,
  a => { if (a === 'back') openGenerals(); });
}

// ---------- 外交 ----------
function openDiplomacy() {
  const me = R.fac(S, S.player);
  const others = Object.values(S.factions).filter(f => f.alive && f.id !== S.player);
  const coal = R.canCallCoalition(S, S.player);
  openModal(`<button class="btn small close-x" data-a="close">✕</button><h3>外交（每項 1 軍令，剩 ${S.orders}）</h3>
    <div class="muted">贈禮 200 金提高關係；關係 0 以上可議停戰、50 以上可結盟。</div>
    ${others.map(f => {
      const rel = me.relations[f.id] || 0;
      const st = me.alliance[f.id] ? '同盟' : (me.truce[f.id] || 0) > S.turn ? `停戰至 ${truceEnd(me.truce[f.id])}` : '敵對';
      const dis = S.orders <= 0 ? 'disabled' : '';
      return `<div class="note"><div class="row" style="margin:0">${facTag(f.id)}<span>${R.citiesOf(S, f.id).length} 城・兵 ${fmt(R.totalTroops(S, f.id))}</span><span class="muted">${f.aiType}</span><b style="margin-left:auto">${st}</b></div>
        <div class="row" style="margin:4px 0 0"><span>關係 ${rel}</span><div style="flex:1">${bar(rel + 100, 200, rel >= 0 ? '' : 'red')}</div></div>
        <div class="row" style="margin:2px 0 0">
          <button class="btn small" data-a="gift" data-f="${f.id}" ${dis}>贈禮</button>
          <button class="btn small" data-a="truce" data-f="${f.id}" ${dis || (rel < 0 || R.atPeace(S, S.player, f.id) ? 'disabled' : '')}>停戰 ${rel >= 0 ? R.truceChance(S, S.player, f.id) + '%' : ''}</button>
          <button class="btn small" data-a="ally" data-f="${f.id}" ${dis || (rel < 50 || me.alliance[f.id] ? 'disabled' : '')}>結盟 ${rel >= 50 ? R.allyChance(S, S.player, f.id) + '%' : ''}</button>
          ${me.alliance[f.id] ? `<button class="btn small red" data-a="break" data-f="${f.id}">斷盟</button>` : ''}
        </div></div>`;
    }).join('')}
    ${coal ? `<div class="note"><b>合縱聯軍</b>：${esc(R.fac(S, coal).name)}勢力過大，可號召諸侯共同討伐（金 300，軍令 1）。<br>
      <button class="btn red small" data-a="coal" ${S.orders <= 0 ? 'disabled' : ''}>發起聯軍</button></div>` : ''}`,
  (a, el) => {
    if (a === 'coal') {
      const r = R.callCoalition(S, S.player);
      toast(r.msg, 3500); if (r.ok) { S.orders--; R.log(S, r.msg); }
      renderAll(); openDiplomacy(); return;
    }
    const f = el.dataset.f; if (!f) return;
    if (a !== 'break' && S.orders <= 0) { toast('軍令不足'); return; }
    const r = R.diplomacy(S, S.player, f, a);
    toast(r.msg, 3500);
    if (r.ok) { if (a !== 'break') S.orders--; R.log(S, r.msg); }
    renderAll(); openDiplomacy();
  });
}
function truceEnd(turn) { const y = 190 + Math.floor(turn / 4); return `${y} 年${['春', '夏', '秋', '冬'][turn % 4]}`; }

// ---------- 紀錄 ----------
function openLog() {
  openModal(`<button class="btn small close-x" data-a="close">✕</button><h3>天下大事</h3>
    ${S.log.slice(0, 80).map(l => `<div class="logline ${l.kind}"><span class="t">${l.t}</span>${esc(l.text)}</div>`).join('')}`);
}

// ---------- 存讀檔 ----------
function saveSlot(slot, silent) {
  try {
    localStorage.setItem(`pxqx.${slot}`, JSON.stringify({ meta: { date: R.seasonName(S), fac: R.fac(S, S.player).name, at: Date.now() }, state: S }));
    if (!silent) toast('已存檔');
  } catch (e) { toast('存檔失敗：' + e.message); }
}
function slotMeta(slot) {
  try { const d = JSON.parse(localStorage.getItem(`pxqx.${slot}`)); return d && d.meta; } catch { return null; }
}
function loadSlot(slot) {
  try {
    const d = JSON.parse(localStorage.getItem(`pxqx.${slot}`));
    if (!d) { toast('沒有存檔'); return; }
    S = d.state; sel = null; closeModal(); startGame(false); toast(`讀取：${d.meta.fac}・${d.meta.date}`);
  } catch (e) { toast('讀檔失敗'); }
}
const slotLabel = s => { const m = slotMeta(s); return m ? `${m.fac}・${m.date}` : '（空）'; };

function openLoadMenu() {
  openModal(`<button class="btn small close-x" data-a="close">✕</button><h3>讀取存檔</h3>
    ${['auto', 1, 2, 3].map(s => `<div class="row"><button class="btn" data-a="load" data-s="${s}" ${slotMeta(s) ? '' : 'disabled'}>${s === 'auto' ? '自動存檔' : '檔案 ' + s}</button><span>${slotLabel(s)}</span></div>`).join('')}`,
  (a, el) => { if (a === 'load') loadSlot(el.dataset.s); });
}

function openMenu() {
  openModal(`<button class="btn small close-x" data-a="close">✕</button><h3>選單</h3>
    <div class="sec">存檔</div>${[1, 2, 3].map(s => `<div class="row"><button class="btn" data-a="save" data-s="${s}">存到檔案 ${s}</button><span>${slotLabel(s)}</span></div>`).join('')}
    <div class="sec">其他</div><div class="row"><button class="btn" data-a="loadm">讀取存檔</button><button class="btn" data-a="help">玩法說明</button><button class="btn red" data-a="title">回到標題</button></div>`,
  (a, el) => {
    if (a === 'save') { saveSlot(el.dataset.s); openMenu(); }
    if (a === 'loadm') openLoadMenu();
    if (a === 'help') openHelp();
    if (a === 'title') { closeModal(); initTitle(); }
  });
}

function openHelp() {
  openModal(`<button class="btn small close-x" data-a="close">✕</button><div class="help"><h3>玩法說明</h3>
    <p>扮演一方君主，經營城池、招攬武將、合縱連橫，消滅所有其他勢力即可統一天下。</p>
    <h4>回合與軍令</h4><p>一季一回合，四季一年。每季有若干<b>軍令</b>（君主德越高、城池越多就越多），內政、出征、移動、外交每個指令花 1 點。每位武將每季只能行動一次。</p>
    <h4>內政</h4><ul><li>開墾：提高農田，秋季收穫更多糧。</li><li>商業：提高市集，每季稅收增加。</li><li>修城：守城時減少傷害。</li>
    <li>徵兵：增加兵力，但降低民心。</li><li>施政：提高民心；民心影響收入，過低會發生騷亂。</li><li>訪賢：在城中尋找在野人才。</li></ul>
    <p>士兵每季消耗糧食，糧食不足時士兵會逃散。</p>
    <h4>攻城戰（六角格戰場）</h4><p>出征最多帶 5 位武將，每位選擇兵種與兵力。戰場左側為攻方陣地，右側是城牆、城門與本陣。
    雙方輪流行動，每回合每支部隊可<b>移動一次，再攻擊、施計、單挑或待機</b>。點我方部隊後，藍格可移動、紅格可攻擊（點兩次確認）。</p>
    <ul><li><b>攻方</b>須在 20 回合內攻破城門、佔領本陣，或擊潰所有守軍。</li><li><b>守方</b>撐過 20 回合，或擊退所有攻方部隊即獲勝。</li>
    <li>兵種：槍兵（穩健）、騎兵（移動遠，衝鋒有加成）、弓兵（射程 2，站在城牆或丘陵上射程 +1）、衝車（專破城門）。</li>
    <li>相剋：<b>槍剋騎、騎剋弓、弓剋槍</b>。林地與丘陵易守、河川難行；敵軍身旁會阻擋移動，多部隊包夾傷害更高。</li>
    <li>計策消耗氣力：火計（林地更易成功）、混亂（敵軍停擺一回合）、鼓舞、落石（須在丘陵或城牆上）。成功率看雙方智謀。</li></ul>
    <h4>單挑</h4><p>與相鄰敵將單挑。攻剋奇、奇剋守、守剋攻，勇武較高的一方能看穿對手的架勢。敗者部隊大亂，甚至可能被生擒。</p>
    <h4>外交與合縱聯軍</h4><p>贈禮提高關係，關係夠高可停戰、結盟。當某勢力佔有約 4 成城池，其他諸侯會組成<b>合縱聯軍</b>共同討伐。
    弱小時你也可以主動號召聯軍。</p>
    <h4>存檔</h4><p>每季結束自動存檔，資料保存在瀏覽器中。</p></div>`);
}

// 測試用：網址加上 ?debug 時開放內部狀態
if (location.search.includes('debug')) window.__qx = { get S() { return S; }, runBattle, renderAll, R, T };
