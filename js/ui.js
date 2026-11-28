// 表現層：只讀取規則層狀態並送出指令。
import * as R from './rules.js';
import * as B from './battle.js';
import * as T from './tactics.js';
import { runTactical } from './battleui.js';
import { drawInkMap, drawInkTitle, clampView } from './inkmap.js';
import { aiMilitary, aiProposals } from './ai.js';
import * as AR from './army.js';
import { TERRAINS, WEATHER, routeOf } from './terrain.js';
import * as A from './art.js';
import { FACTIONS, TRAITS, PERSONALITIES, TERRAIN, KIND_NAME, MAP_W, MAP_H } from './data.js';

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

function startGame(intro) {
  show('screen-game');
  selArmy = null; pickMode = null; follow = null; fx = []; disp.clear(); marchStep = -1;
  sizeMap();
  const home = R.city(S, sel || R.citiesOf(S, S.player)[0].id);
  centerOn(home.x, home.y, zMin() * 1.8);
  renderAll();
  if (intro) {
    const f = R.fac(S, S.player);
    choose(`西元 190 年・${f.name}`, `<div class="note">董卓挾天子據洛陽，關東諸侯組成<b>討董聯軍</b>。聯軍期間（至 191 年底）諸侯彼此停戰，可專心對付董卓、攻取中立據點或發展內政。</div>
      <p>一個月一回合。點選城池下達內政，或按<b>出陣</b>讓武將帶兵離城，在地圖上指定目的地。部隊會在每月結束時沿道路前進，經過港口可走水路。</p>
      <p class="muted">拖曳地圖移動視角，滾輪或雙指縮放。左上「軍情」看天下兵馬動向，右上可「跟拍」部隊、切換晝夜。</p>`, [{ label: '出發', cls: 'red' }]);
  }
}

// ---------- 主畫面 ----------
function renderAll() {
  if (!S) return;
  renderTop(); renderMap(); renderPanel(); renderIntel(); renderTimeline();
}

function renderTop() {
  const f = R.fac(S, S.player);
  $('tb-date').textContent = R.seasonName(S);
  $('tb-fac').innerHTML = facTag(S.player) + `<span class="muted" style="color:#c8b890">${R.citiesOf(S, S.player).length} 據點</span>`;
  tweenNum($('tb-gold'), f.gold);
  tweenNum($('tb-food'), f.food);
  $('tb-orders').textContent = `${S.orders}`;
  const cb = $('coalition-banner');
  if (S.coalition) {
    cb.classList.remove('hidden');
    cb.textContent = `${S.coalition.name}（目標：${facName(S.coalition.target)}）`;
  } else cb.classList.add('hidden');
}

// 數字滾動：資源變化時像儀表一樣跳動並閃色
function tweenNum(el, v) {
  if (el._v === undefined || !S) { el._v = v; el.textContent = fmt(v); return; }
  if (el._to === v) return;
  const from = el._v, t0 = performance.now(), up = v > (el._to ?? from);
  el._to = v;
  el.classList.remove('up', 'down'); void el.offsetWidth; el.classList.add(up ? 'up' : 'down');
  const step = t => {
    if (el._to !== v) return;
    const k = Math.min(1, (t - t0) / 650), e = 1 - (1 - k) ** 3;
    el._v = from + (v - from) * e; el.textContent = fmt(el._v);
    if (k < 1) requestAnimationFrame(step); else el._v = v;
  };
  requestAnimationFrame(step);
}

// ---------- 地圖視角 ----------
const V = { x: 0, y: 0, z: 2 };
let CW = 1, CH = 1, DPR = 1;
let selArmy = null;
let pickMode = null;     // { set:Set, title, onPick(id), onCancel() }
const zMin = () => Math.max(CW / MAP_W, CH / MAP_H);

function sizeMap() {
  const w = $('mapwrap'), cv = $('map');
  DPR = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.max(1, w.clientWidth), ch = Math.max(1, w.clientHeight);
  if (cw !== CW || ch !== CH || cv.width !== Math.round(cw * DPR)) {
    const cx = V.x + CW / 2 / V.z, cy = V.y + CH / 2 / V.z;
    CW = cw; CH = ch;
    cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
    centerOn(cx, cy);
  }
}
function centerOn(x, y, z) {
  if (z) V.z = z;
  clampView(V, CW, CH);
  V.x = x - CW / 2 / V.z; V.y = y - CH / 2 / V.z;
  clampView(V, CW, CH);
}
function zoomAt(sx, sy, f) {
  const lx = V.x + sx / V.z, ly = V.y + sy / V.z;
  V.z *= f; clampView(V, CW, CH);
  V.x = lx - sx / V.z; V.y = ly - sy / V.z;
  clampView(V, CW, CH);
  drawMap();
}

// 地圖持續運作：每影格重畫（約 30fps），部隊位置平滑過渡，鏡頭可跟拍
let labelsDirty = true;
function renderMap() { labelsDirty = true; }

const disp = new Map();          // 部隊顯示位置（平滑過渡）
let hoverCity = null, hoverArmy = null;
let follow = null;               // 跟拍中的部隊 id
let night = localStorage.getItem('pxqx.night') === '1';
let marchStep = -1;              // 行軍動畫進度（第幾日，0–30），-1 表示未在行軍
let fx = [];                     // 戰火標記
let lastT = 0;

function loop(t) {
  requestAnimationFrame(loop);
  if (!S || !$('screen-game').classList.contains('active') || document.hidden) { lastT = t; return; }
  const dt = Math.min(100, t - lastT);
  if (dt < 30) return;
  lastT = t;
  const moving = stepDisp(dt);
  if (follow != null) followCam(dt);
  drawCanvas(t);
  if (labelsDirty || moving || follow != null) { labelsDirty = false; drawLabels(); }
}
requestAnimationFrame(loop);

function stepDisp(dt) {
  let moving = false;
  const k = 1 - Math.exp(-dt / 120);
  const alive = new Set();
  for (const a of S.armies) {
    alive.add(a.id);
    const p = AR.armyXY(S, a);
    const d = disp.get(a.id);
    if (!d) { disp.set(a.id, { x: p.x, y: p.y }); continue; }
    const dist = Math.hypot(p.x - d.x, p.y - d.y);
    if (dist > 70 || dist < 0.02) { d.x = p.x; d.y = p.y; continue; }
    d.x += (p.x - d.x) * k; d.y += (p.y - d.y) * k; moving = true;
  }
  for (const id of disp.keys()) if (!alive.has(id)) disp.delete(id);
  return moving;
}

// 部隊剩餘路線的地形分段（從目前位置起）
function armyTerrainSegs(a) {
  if (!a.edge) return AR.routeSegments(a.at, a.path);
  const r = routeOf(a.edge.from, a.edge.to), A = R.city(S, a.edge.from), B = R.city(S, a.edge.to);
  const at = u => [A.x + (B.x - A.x) * u / r.len, A.y + (B.y - A.y) * u / r.len];
  const out = [];
  for (const sg of r.segs) {
    if (sg.b <= a.edge.prog) continue;
    const [x1, y1] = at(Math.max(sg.a, a.edge.prog)), [x2, y2] = at(sg.b);
    out.push({ x1, y1, x2, y2, t: sg.t });
  }
  for (const c of r.cross) if (c.at > a.edge.prog) { const [x1, y1] = at(c.at); out.push({ x1, y1, cross: c }); }
  return out.concat(AR.routeSegments(a.edge.to, a.path.slice(1)));
}

const isThreat = a => a.faction !== S.player && a.path.length > 0 && R.city(S, a.dest).owner === S.player && !R.atPeace(S, S.player, a.faction);

function armyViews() {
  return S.armies.map(a => {
    const p = AR.armyXY(S, a);
    const d = disp.get(a.id) || p;
    const path = a.path.length ? [[d.x, d.y], ...a.path.map(id => { const c = R.city(S, id); return [c.x, c.y]; })] : null;
    const terr = (selArmy === a.id || follow === a.id) && a.path.length ? armyTerrainSegs(a) : null;
    return {
      id: a.id, x: d.x, y: d.y, fid: a.faction, name: AR.leaderOf(S, a).name, troops: R.armyTroops(a), sel: selArmy === a.id || follow === a.id,
      hover: hoverArmy === a.id, path, terr, water: p.water, mine: a.faction === S.player, threat: isThreat(a), moving: !!a.edge || marchStep >= 0 && a.path.length > 0,
    };
  });
}

function drawCanvas(t = performance.now()) {
  sizeMap();
  fx = fx.filter(f => !f.fade || t - f.fade < 700);
  drawInkMap($('map').getContext('2d'), S, V, {
    dpr: DPR, selected: sel, pick: pickMode ? pickMode.set : null, armies: armyViews(), t, night, fx,
    hover: hoverCity,
  });
}

function drawMap() {
  if (!S) return;
  drawCanvas();
  drawLabels();
}

function drawLabels() {
  const armies = armyViews();
  const minor = V.z >= zMin() * 1.7;
  let html = '';
  for (const c of S.cities) {
    const picked = pickMode && pickMode.set.has(c.id);
    if (c.kind !== 'city' && !minor && c.id !== sel && !picked) continue;
    const px = (c.x - V.x) * V.z, py = (c.y + (c.kind === 'city' ? 4 : 3.6) - V.y) * V.z;
    if (px < -50 || py < -20 || px > CW + 50 || py > CH + 10) continue;
    html += `<div class="clabel k-${c.kind} ${c.owner === S.player ? 'mine' : ''} ${sel === c.id ? 'sel' : ''} ${picked ? 'pick' : ''}" style="left:${px.toFixed(1)}px;top:${py.toFixed(1)}px">${c.kind === 'city' ? `<i style="background:${A.facColor(c.owner)};color:${c.owner === 'gong' ? '#2b2118' : '#fff'}">${c.owner ? A.FAC_GLYPH[c.owner] : '－'}</i>` : ''}${c.name}</div>`;
  }
  for (const a of armies) {
    const px = (a.x - V.x) * V.z, py = (a.y - 6.5 - V.y) * V.z;
    if (px < -50 || py < -20 || px > CW + 50 || py > CH + 10 || V.z < zMin() * 1.3) continue;
    html += `<div class="alabel ${a.fid === S.player ? 'mine' : ''}" style="left:${px.toFixed(1)}px;top:${py.toFixed(1)}px">${esc(a.name)} ${fmt(a.troops)}</div>`;
  }
  $('maplabels').innerHTML = html;
  const pb = $('pickbar');
  if (pickMode) { pb.classList.remove('hidden'); $('pick-title').textContent = pickMode.title; } else pb.classList.add('hidden');
  const fb = $('followbar'), fa = follow != null && AR.armyOf(S, follow);
  if (fa && !pickMode) {
    fb.classList.remove('hidden');
    $('follow-title').textContent = `跟拍・${AR.leaderOf(S, fa).name}軍${fa.path.length ? `　往${R.city(S, fa.dest).name}` : ''}`;
  } else fb.classList.add('hidden');
  $('mapwrap').querySelector('[data-mz="follow"]').classList.toggle('sel', follow != null);
  $('mapwrap').querySelector('[data-mz="night"]').textContent = night ? '☀' : '☾';
}

// ---------- 跟拍 ----------
// 剩餘月數
function etaMonths(a) {
  if (!a.path.length) return 0;
  // 依路段地形、編制與行軍方式估算（不含天候）
  return Math.max(0.03, AR.etaDays(S, a) / AR.DAYS);
}
// 下一支「即將交戰」的部隊：優先我軍與來犯敵軍，其次全天下最快抵達敵城者
function nextFollow(exclude) {
  const cand = S.armies.filter(a => a.path.length && a.id !== exclude);
  if (!cand.length) return S.armies.find(a => a.id !== exclude) || null;
  const score = a => {
    const dc = R.city(S, a.dest);
    const battle = dc.owner !== a.faction && !(dc.owner && R.atPeace(S, a.faction, dc.owner));
    return etaMonths(a) - (a.faction === S.player || isThreat(a) ? 3 : 0) - (battle ? 1.5 : 0);
  };
  return cand.sort((a, b) => score(a) - score(b))[0];
}
function setFollow(id, quiet) {
  follow = id;
  if (id != null) { selArmy = id; sel = null; renderPanel(); if (!quiet) toast(`鏡頭跟隨${AR.leaderOf(S, AR.armyOf(S, id)).name}軍`); }
  labelsDirty = true;
}
function followCam(dt) {
  let a = AR.armyOf(S, follow);
  if (!a) {
    const n = nextFollow(follow);
    if (!n) { follow = null; labelsDirty = true; return; }
    setFollow(n.id, marchStep >= 0); a = n;
  }
  const d = disp.get(a.id) || AR.armyXY(S, a);
  if (V.z < zMin() * 2.2) V.z += (zMin() * 2.4 - V.z) * (1 - Math.exp(-dt / 400));
  const tx = d.x - CW / 2 / V.z, ty = d.y - CH / 2 / V.z, k = 1 - Math.exp(-dt / 220);
  V.x += (tx - V.x) * k; V.y += (ty - V.y) * k;
  clampView(V, CW, CH);
}

// 指標操作：拖曳、雙指縮放、點選
const ptrs = new Map();
let drag = null, pinch = null;
const wrapXY = e => { const r = $('mapwrap').getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
$('mapwrap').addEventListener('pointerdown', e => {
  if (e.target.closest('.mapui') || !S) return;
  $('mapwrap').setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, wrapXY(e));
  if (ptrs.size === 1) drag = { p: wrapXY(e), vx: V.x, vy: V.y, moved: false };
  else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z: V.z, lx: V.x + (a[0] + b[0]) / 2 / V.z, ly: V.y + (a[1] + b[1]) / 2 / V.z };
    if (drag) drag.moved = true;
  }
});
$('mapwrap').addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) { if (e.pointerType === 'mouse' && S) hoverAt(e); return; }
  ptrs.set(e.pointerId, wrapXY(e));
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    V.z = pinch.z * d / pinch.d; clampView(V, CW, CH);
    V.x = pinch.lx - mx / V.z; V.y = pinch.ly - my / V.z; clampView(V, CW, CH);
    renderMap();
  } else if (drag) {
    const [x, y] = wrapXY(e);
    const dx = x - drag.p[0], dy = y - drag.p[1];
    if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; if (follow != null) { follow = null; labelsDirty = true; } }
    if (drag.moved) { V.x = drag.vx - dx / V.z; V.y = drag.vy - dy / V.z; clampView(V, CW, CH); renderMap(); }
  }
});
const ptrEnd = e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (ptrs.size === 1) { const p = [...ptrs.values()][0]; drag = { p, vx: V.x, vy: V.y, moved: true }; return; }
  if (ptrs.size === 0) {
    if (drag && !drag.moved && e.type === 'pointerup') mapTap(...wrapXY(e));
    drag = null;
  }
};
$('mapwrap').addEventListener('pointerup', ptrEnd);
$('mapwrap').addEventListener('pointerleave', () => { hoverCity = hoverArmy = null; $('maptip').classList.add('hidden'); });

// 滑鼠停留：據點發光、顯示小卡
function nearAt(sx, sy) {
  const lx = V.x + sx / V.z, ly = V.y + sy / V.z;
  let best = null, bd = 18;
  for (const a of armyViews()) { const d = Math.hypot((a.x + 0.6 - lx) * V.z, (a.y - 2 - ly) * V.z); if (d < bd) { bd = d; best = { army: a.id }; } }
  if (best) return best;
  bd = 22;
  for (const c of S.cities) { const d = Math.hypot((c.x - lx) * V.z, (c.y - ly) * V.z); if (d < bd) { bd = d; best = { city: c.id }; } }
  return best;
}
function hoverAt(e) {
  const tip = $('maptip');
  if (e.target.closest('.mapui')) { tip.classList.add('hidden'); hoverCity = hoverArmy = null; return; }
  const [sx, sy] = wrapXY(e);
  const h = nearAt(sx, sy);
  hoverCity = h && h.city || null; hoverArmy = h && h.army || null;
  $('mapwrap').classList.toggle('hovering', !!h);
  if (!h) { tip.classList.add('hidden'); return; }
  let html;
  if (h.army) {
    const a = AR.armyOf(S, h.army), ld = AR.leaderOf(S, a), st = armyStatus(a);
    html = `<b>${esc(ld.name)}軍</b> ${facTag(a.faction)}<div>兵 ${fmt(R.armyTroops(a))}・${a.units.length} 將</div>
      <div><span class="st st-${st.k}">${st.t}</span> ${a.path.length ? `往${R.city(S, a.dest).name}・約 ${Math.ceil(etaMonths(a))} 個月` : '待命中'}</div>`;
  } else {
    const c = R.city(S, h.city), gs = c.owner ? R.gensIn(S, c.id, c.owner).length : 0, ars = armiesAt(c.id).length;
    html = `<b>${c.name}</b> ${facTag(c.owner)}<div>${KIND_TAG(c)}・${TERRAIN[c.terrain]}</div><div>兵 ${fmt(c.troops)}・城防 ${c.wall}・武將 ${gs}${ars ? `・部隊 ${ars}` : ''}</div>`;
  }
  tip.innerHTML = html;
  tip.classList.remove('hidden');
  const w = tip.offsetWidth, hh = tip.offsetHeight;
  tip.style.left = Math.min(CW - w - 6, sx + 14) + 'px';
  tip.style.top = (sy + 14 + hh > CH - 34 ? sy - hh - 10 : sy + 14) + 'px';
}
$('mapwrap').addEventListener('pointercancel', ptrEnd);
$('mapwrap').addEventListener('wheel', e => { if (!S) return; e.preventDefault(); zoomAt(...wrapXY(e), Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
window.addEventListener('resize', () => { if (S && $('screen-game').classList.contains('active')) { drawMap(); renderIntel(); } });

$('mapwrap').addEventListener('click', e => {
  const b = e.target.closest('[data-mz]');
  if (!b || !S) return;
  const k = b.dataset.mz;
  if (k === 'in') zoomAt(CW / 2, CH / 2, 1.4);
  else if (k === 'out') zoomAt(CW / 2, CH / 2, 1 / 1.4);
  else if (k === 'home') { const c = R.city(S, sel || (R.citiesOf(S, S.player)[0] || {}).id || 1); centerOn(c.x, c.y); drawMap(); }
  else if (k === 'cancel' && pickMode) { const pm = pickMode; pickMode = null; drawMap(); if (pm.onCancel) pm.onCancel(); }
  else if (k === 'follow') {
    if (follow != null) { follow = null; labelsDirty = true; return; }
    const n = (selArmy && AR.armyOf(S, selArmy)) || nextFollow();
    if (!n) { toast('目前地圖上沒有部隊'); return; }
    setFollow(n.id);
  } else if (k === 'unfollow') { follow = null; labelsDirty = true; }
  else if (k === 'night') {
    night = !night; localStorage.setItem('pxqx.night', night ? '1' : '0'); labelsDirty = true;
    toast(night ? '入夜・城郭燈火通明' : '天明');
  } else if (k === 'intel') {
    intelOpen = !intelOpen; renderIntel();
  }
});

function mapTap(sx, sy) {
  if (busy) return;
  const lx = V.x + sx / V.z, ly = V.y + sy / V.z;
  const near = (list, fx, fy, r) => {
    let best = null, bd = r;
    for (const o of list) { const d = Math.hypot((fx(o) - lx) * V.z, (fy(o) - ly) * V.z); if (d < bd) { bd = d; best = o; } }
    return best;
  };
  if (pickMode) {
    const c = near(S.cities.filter(c => pickMode.set.has(c.id)), c => c.x, c => c.y, 26);
    if (c) { const pm = pickMode; pickMode = null; drawMap(); pm.onPick(c.id); }
    return;
  }
  const av = near(armyViews(), a => a.x + 0.6, a => a.y - 2, 18);
  if (av) { selArmy = selArmy === av.id ? null : av.id; if (selArmy) sel = null; if (follow != null && selArmy) follow = selArmy; renderMap(); renderPanel(); renderIntel(); return; }
  const c = near(S.cities, c => c.x, c => c.y, 22);
  selArmy = null;
  sel = c ? (sel === c.id ? null : c.id) : null;
  renderMap(); renderPanel();
}

function enterPick(title, set, onPick, onCancel) {
  if (!set.size) { toast('沒有可以前往的地點'); if (onCancel) onCancel(); return; }
  pickMode = { title, set, onPick, onCancel };
  drawMap();
}

// ---------- 軍情看板（地圖左上） ----------
let intelOpen = window.innerWidth >= 700;
const ST_ORDER = { threat: 0, mine: 1, other: 2 };
function armyStatus(a) {
  const dc = R.city(S, a.dest);
  if (!a.path.length) return { k: 'idle', t: '駐留' };
  if (isThreat(a)) return { k: 'threat', t: '來犯' };
  if (a.edge && AR.armyXY(S, a).water) return { k: 'water', t: '渡江' };
  if (!a.edge && a.at === a.origin && a.last === a.origin) return { k: 'muster', t: '出陣' };
  if (dc.owner === a.faction) return { k: 'back', t: '回師' };
  if (!dc.owner || !R.atPeace(S, a.faction, dc.owner)) return { k: 'attack', t: '進攻' };
  return { k: 'march', t: '行軍' };
}
function renderIntel() {
  if (!S) return;
  const box = $('intel');
  const threats = S.armies.filter(isThreat).length;
  $('intel-btn').innerHTML = `軍情${threats ? `<em>${threats}</em>` : ''}`;
  $('intel-btn').classList.toggle('sel', intelOpen);
  box.classList.toggle('hidden', !intelOpen);
  if (!intelOpen) return;
  const list = S.armies.map(a => ({ a, g: isThreat(a) ? 'threat' : a.faction === S.player ? 'mine' : 'other' }))
    .sort((x, y) => ST_ORDER[x.g] - ST_ORDER[y.g] || etaMonths(x.a) - etaMonths(y.a));
  const alive = Object.values(S.factions).filter(f => f.alive);
  const total = S.cities.length;
  const share = alive.map(f => ({ f, n: R.citiesOf(S, f.id).length })).sort((a, b) => b.n - a.n);
  const neutral = S.cities.filter(c => !c.owner).length;
  const mine = list.filter(x => x.g === 'mine').length;
  box.innerHTML = `<div class="ih"><b>天下大勢</b><span class="muted">${R.seasonName(S)}</span></div>
    <div class="share">${share.map(({ f, n }) => `<i style="flex:${n};background:${A.facColor(f.id)}" title="${esc(f.name)} ${n}"></i>`).join('')}<i style="flex:${neutral};background:#b8ab8c" title="中立 ${neutral}"></i></div>
    <div class="slegend">${share.slice(0, 4).map(({ f, n }) => `<span><i style="background:${A.facColor(f.id)}"></i>${esc(f.name)} ${Math.round(n / total * 100)}%</span>`).join('')}</div>
    <div class="ih"><b>軍情看板</b><span class="muted">我軍 ${mine}・來犯 ${threats}・天下 ${list.length}</span></div>
    <div class="ilist">${list.length ? list.map(({ a, g }) => {
      const ld = AR.leaderOf(S, a), st = armyStatus(a), eta = etaMonths(a);
      const from = a.edge ? R.city(S, a.edge.from).name : R.city(S, a.at).name;
      return `<div class="irow ${g} ${selArmy === a.id ? 'on' : ''}" data-ar="${a.id}"><i class="fg" style="background:${A.facColor(a.faction)};color:${a.faction === 'gong' ? '#2b2118' : '#fff'}">${A.FAC_GLYPH[a.faction] || '－'}</i>
        <span class="nm">${esc(ld.name)}</span><span class="rt">${from}${a.path.length ? `→${R.city(S, a.dest).name}` : ''}</span>
        <span class="st st-${st.k}">${st.t}</span><span class="eta">${a.path.length ? `${Math.ceil(eta)}月` : ''}</span><span class="tr">${fmt(R.armyTroops(a))}</span></div>`;
    }).join('') : '<div class="muted" style="padding:4px">天下暫無兵馬調動</div>'}</div>`;
}
$('intel').addEventListener('click', e => {
  const r = e.target.closest('[data-ar]');
  if (!r || !S) return;
  const a = AR.armyOf(S, +r.dataset.ar); if (!a) return;
  selArmy = a.id; sel = null;
  if (follow != null) follow = a.id; else { const p = disp.get(a.id) || AR.armyXY(S, a); centerOn(p.x, p.y); }
  renderMap(); renderPanel(); renderIntel();
  if (window.innerWidth < 700) { intelOpen = false; renderIntel(); }
});

// ---------- 時間軸（地圖下方） ----------
const MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '臘'];
function hist(turn) { S.hist = S.hist || {}; return S.hist[turn] = S.hist[turn] || { b: 0, c: 0 }; }
function renderTimeline() {
  if (!S) return;
  const y0 = S.turn - S.month;
  const me = R.fac(S, S.player);
  const marks = {};
  const add = (turn, m) => { if (turn >= y0 && turn < y0 + 12) (marks[turn - y0] = marks[turn - y0] || []).push(m); };
  add(y0 + 8, { k: 'harvest', t: '秋收' });
  if (S.coalition) add(S.coalition.untilTurn, { k: 'coal', t: `${S.coalition.name}期滿` });
  for (const [fid, until] of Object.entries(me.truce || {})) if (until > S.turn && S.factions[fid] && S.factions[fid].alive) add(until, { k: 'truce', t: `與${facName(fid)}停戰期滿` });
  let html = `<span class="ty">${S.year}</span>`;
  for (let m = 0; m < 12; m++) {
    const turn = y0 + m, h = (S.hist || {})[turn], mk = marks[m] || [];
    const cls = m < S.month ? 'past' : m === S.month ? 'now' : 'fut';
    const tip = [...mk.map(x => x.t), h && h.b ? `戰事 ${h.b}` : '', h && h.c ? `易主 ${h.c}` : ''].filter(Boolean).join('、');
    html += `<div class="tm ${cls}" data-tm="${m}" title="${MONTHS[m]}月${tip ? '：' + tip : ''}">
      ${m === S.month && marchStep >= 0 ? `<i class="prog" style="width:${marchStep / AR.DAYS * 100}%"></i>` : ''}
      <span>${MONTHS[m]}</span>${h && h.b ? `<b class="bt">${h.b}</b>` : ''}${mk.map(x => `<u class="mk ${x.k}"></u>`).join('')}</div>`;
  }
  $('timeline').innerHTML = html;
}
$('timeline').addEventListener('click', e => {
  const c = e.target.closest('[data-tm]');
  if (!c || !S || busy) return;
  const m = +c.dataset.tm, label = `${S.year} 年 ${m + 1} 月`;
  const lines = S.log.filter(l => l.t === label);
  const y0 = S.turn - S.month, me = R.fac(S, S.player), up = [];
  if (m === 8) up.push('九月秋收：各城依農田收穫糧食');
  if (S.coalition && S.coalition.untilTurn === y0 + m) up.push(`${S.coalition.name}約期屆滿`);
  for (const [fid, until] of Object.entries(me.truce || {})) if (until === y0 + m && until > S.turn && S.factions[fid].alive) up.push(`與${facName(fid)}的停戰到期`);
  openModal(`<button class="btn small close-x" data-a="close">✕</button><h3>${S.year} 年 ${MONTHS[m]}月</h3>
    ${up.map(t => `<div class="note">${esc(t)}</div>`).join('')}
    ${lines.length ? lines.map(l => `<div class="logline ${l.kind}">${esc(l.text)}</div>`).join('') : `<div class="muted">${m > S.month ? '尚未到來' : '這個月沒有重大消息'}</div>`}`);
});

// ---------- 面板 ----------
const KIND_TAG = c => c.kind === 'city' ? `${c.size}城` : KIND_NAME[c.kind];
function armiesAt(id) { return S.armies.filter(a => !a.edge && a.at === id); }

let panelKey = '';
function renderPanel() {
  const p = $('panel');
  if (selArmy && !AR.armyOf(S, selArmy)) selArmy = null;
  const key = `${sel}|${selArmy}`;
  if (key !== panelKey) { panelKey = key; requestAnimationFrame(() => { p.scrollTop = 0; }); }
  if (selArmy) { p.innerHTML = armyHtml(AR.armyOf(S, selArmy)); return; }
  if (!sel) { p.innerHTML = overviewHtml(); return; }
  const c = R.city(S, sel);
  const mine = c.owner === S.player;
  const gens = c.owner ? R.gensIn(S, c.id, c.owner) : [];
  const cap = R.capOf(c), tcap = R.troopCapOf(c);
  const free = mine ? S.generals.filter(g => g.city === c.id && g.status === 'free') : [];
  let html = `<div class="ph"><h2>${c.name}</h2>${facTag(c.owner)}<span class="tag" style="background:#5a4636">${KIND_TAG(c)}</span><span class="muted">${TERRAIN[c.terrain]}</span></div>
    <div class="stats">
      <span>兵力</span>${bar(c.troops, tcap, 'red')}<span>${fmt(c.troops)}</span>
      ${c.kind === 'city' ? `<span>農田</span>${bar(c.farm, cap)}<span>${c.farm}/${cap}</span>` : ''}
      ${c.kind !== 'pass' ? `<span>市集</span>${bar(c.market, cap, 'gold')}<span>${c.market}/${cap}</span>` : ''}
      <span>城防</span>${bar(c.wall, cap, 'blue')}<span>${c.wall}/${cap}</span>
      <span>民心</span>${bar(c.order, 100)}<span>${c.order}</span>
    </div>`;
  if (c.kind === 'pass') html += `<div class="muted">關卡易守難攻，無法開墾與經商。</div>`;
  if (c.kind === 'port') html += `<div class="muted">港口可經水路與其他港口往來，部隊乘船行進較快。</div>`;
  if (mine) {
    const dis = S.orders <= 0 ? 'disabled' : '';
    const ok = { farm: c.kind === 'city', market: c.kind !== 'pass' };
    html += `<div class="actions">
      <button class="btn red" data-pa="muster" ${dis}>出陣</button>
      ${['farm', 'market', 'wall', 'draft', 'govern', 'search'].map(a => `<button class="btn" data-pa="${a}" ${dis || (ok[a] === false ? 'disabled' : '')}>${R.ACTIONS[a].name}</button>`).join('')}
      <button class="btn" data-pa="reward">賞賜</button>
    </div>`;
    if (S.orders <= 0) html += `<div class="note">本月軍令已用完，請按「結束本月」。</div>`;
  } else {
    const peace = c.owner && R.atPeace(S, S.player, c.owner);
    if (peace) html += `<div class="note">與${facName(c.owner)}${R.fac(S, S.player).alliance[c.owner] ? '同盟中' : '停戰中'}，無法出征。</div>`;
    else if (bestSource(c.id)) html += `<div class="actions"><button class="btn red" data-pa="attackthis" ${S.orders <= 0 ? 'disabled' : ''}>出征此地</button></div>`;
    if (c.owner) html += `<div class="muted" style="margin-top:6px">與我方關係：${R.fac(S, S.player).relations[c.owner] || 0}</div>`;
  }
  const here = armiesAt(c.id);
  if (here.length) html += `<div class="sec">駐留部隊</div><div class="glist">${here.map(armyRow).join('')}</div>`;
  html += `<div class="sec">武將（${gens.length}）</div><div class="glist">${gens.map(g => genRow(g, mine)).join('') || '<span class="muted">無武將駐守</span>'}</div>`;
  if (free.length) html += `<div class="sec">在野人才</div><div class="glist">${free.map(g => genRow(g, false)).join('')}</div><div class="muted">可用「訪賢」再次登用。</div>`;
  p.innerHTML = html;
}

function armyRow(a) {
  const ld = AR.leaderOf(S, a);
  const where = a.edge ? `${R.city(S, a.edge.from).name}→${R.city(S, a.edge.to).name}` : R.city(S, a.at).name;
  return `<div class="grow" data-ar="${a.id}">${portraitImg(ld, 32)}<div><div class="nm">${esc(ld.name)}軍</div><div class="st"><span>${facName(a.faction)}</span><span>兵 ${fmt(R.armyTroops(a))}</span></div></div>
    <span class="muted">${where}${a.path.length ? `<br>往 ${R.city(S, a.dest).name}` : ''}</span></div>`;
}

function genRow(g, showDone, extra = '') {
  const isRuler = g.faction && R.fac(S, g.faction).ruler === g.id;
  return `<div class="grow ${extra}" data-g="${g.id}">${portraitImg(g)}<div><div class="nm">${isRuler ? '👑' : ''}${esc(g.name)}</div>
    <div class="st"><span>勇${g.str}</span><span>謀${g.int}</span><span>治${g.pol}</span><span>德${g.cha}</span></div></div>
    ${showDone ? `<span class="done">${g.army ? '出陣中' : g.acted ? '已行動' : '待命'}</span>` : ''}</div>`;
}
const genWhere = g => g.army ? `${AR.leaderOf(S, AR.armyOf(S, g.army)).name}軍` : g.city ? R.city(S, g.city).name : '－';

function overviewHtml() {
  const f = R.fac(S, S.player);
  const cs = R.citiesOf(S, S.player);
  const ars = AR.armiesOf(S, S.player);
  const foes = S.armies.filter(a => a.faction !== S.player && !R.atPeace(S, S.player, a.faction) && R.city(S, a.dest).owner === S.player);
  return `<div class="ph"><h2>${esc(f.name)}軍</h2>${facTag(S.player)}</div>
    <div class="stats"><span>據點</span><span>${cs.length} / ${S.cities.length}</span><span></span>
    <span>總兵力</span><span>${fmt(R.totalTroops(S, S.player))}</span><span></span>
    <span>武將</span><span>${R.gensOf(S, S.player).length}</span><span></span>
    <span>軍令</span><span>${S.orders} / ${R.calcOrders(S, S.player)}</span><span></span></div>
    ${foes.length ? `<div class="sec" style="color:var(--cinnabar)">⚠ 來犯敵軍</div><div class="glist">${foes.map(armyRow).join('')}</div>` : ''}
    ${ars.length ? `<div class="sec">出陣部隊</div><div class="glist">${ars.map(armyRow).join('')}</div>` : ''}
    <div class="sec">我方據點</div><div class="glist">${cs.map(c => `<div class="grow" data-cc="${c.id}"><b>${c.name}</b><span class="muted">${KIND_TAG(c)}</span>
      <span>兵 ${fmt(c.troops)}</span><span class="done">${R.gensIn(S, c.id, S.player).filter(g => !g.acted).length} 人待命</span></div>`).join('')}</div>
    <div class="sec">時令</div><div class="stats">
      <span>季節</span><span>${['春', '夏', '秋', '冬'][S.season]}${S.season === 3 ? '・行軍減速兩成' : ''}</span><span></span>
      <span>秋收</span><span>${S.month === 8 ? '本月' : `${(8 - S.month + 12) % 12} 個月後`}</span><span></span>
      <span>軍糧</span><span>出陣部隊每月耗 ${fmt(ars.reduce((t, a) => t + R.armyTroops(a) * AR.FOOD_RATE, 0))}</span><span></span></div>
    <div class="note">點地圖上的據點或部隊查看詳情。右上角可<b>跟拍</b>部隊、切換<b>晝夜</b>；地圖下方時間軸可查看各月大事。</div>`;
}

function armyHtml(a) {
  const mine = a.faction === S.player;
  const ld = AR.leaderOf(S, a);
  const tot = R.armyTroops(a);
  const from = a.edge ? a.edge.to : a.at;
  const days = AR.etaDays(S, a);
  const foodM = tot ? a.food / (tot * AR.FOOD_RATE) : 99;
  const td = a.today, fat = Math.round(a.fat || 0), mode = AR.MODES[a.mode || 'normal'];
  const wNow = WEATHER[AR.armyWeather(S, a, 0)];
  const where = a.edge ? `${R.city(S, a.edge.from).name} 往 ${R.city(S, a.edge.to).name} 途中` : `駐留${R.city(S, a.at).name}`;
  let html = `<div class="ph"><h2>${esc(ld.name)}軍</h2>${facTag(a.faction)}</div>
    <div class="stats"><span>位置</span><span>${where}</span><span></span>
    <span>目的地</span><span>${a.path.length ? `${R.city(S, a.dest).name}（約 ${Math.max(1, Math.ceil(days))} 日）` : '待命'}</span><span></span>
    <span>兵力</span><span>${fmt(tot)}</span><span></span>
    <span>行軍</span><span>${mode.name}・日行約 ${Math.round(AR.armyPace(a))} 里（平地）</span><span></span>
    <span>疲勞</span>${bar(fat, 100, fat >= 70 ? 'red' : fat >= 40 ? 'gold' : '')}<span>${fat}</span>
    <span>天候</span><span>${wNow.icon} ${wNow.name}${td ? `・上月末${td.rest ? '休整' : `日行 ${td.li} 里`}${td.t ? `（${TERRAINS[td.t].name}）` : ''}` : ''}</span><span></span>
    ${mine ? `<span>糧草</span><span>${fmt(a.food)}（約 ${Math.floor(foodM)} 個月）</span><span></span>` : ''}</div>
    ${a.path.length ? terrainBar(a.edge ? a.edge.from : a.at, a.path) : ''}`;
  if (mine) {
    const atOwn = !a.edge && R.city(S, a.at).owner === S.player;
    html += `<div class="actions">
      <button class="btn red" data-pa="reroute">改變目的地</button>
      ${a.path.length ? `<button class="btn" data-pa="halt">${a.edge ? '在下一據點停下' : '原地待命'}</button>` : ''}
      ${atOwn ? `<button class="btn" data-pa="enter">入城</button>` : `<button class="btn" data-pa="recall">撤回</button>`}
    </div>
    <div class="row"><span class="muted">行軍方式</span><span class="seg">${Object.entries(AR.MODES).map(([k, m]) => `<button class="btn small ${(a.mode || 'normal') === k ? 'sel' : ''}" data-pa="mode:${k}" title="${m.desc}">${m.name}</button>`).join('')}</span></div>
    <div class="muted">${mode.desc}。疲勞越高，戰鬥時攻擊越弱、受創越重。</div>`;
    if (fat >= 70) html += `<div class="note">⚠ 士卒疲憊，建議改為緩行或入城休整再戰。</div>`;
    if (foodM < 2) html += `<div class="note">⚠ 糧草即將耗盡，斷糧後士兵每月逃散一成半。</div>`;
  }
  html += `<div class="sec">武將</div><div class="glist">${a.units.map(u => {
    const g = R.gen(S, u.genId);
    return `<div class="grow" data-g="${g.id}">${portraitImg(g)}<div><div class="nm">${esc(g.name)}</div><div class="st"><span>勇${g.str}</span><span>謀${g.int}</span></div></div><span class="muted">${T.TYPES[u.type].name}</span><b>${fmt(u.troops)}</b></div>`;
  }).join('')}</div>`;
  return html;
}

$('panel').addEventListener('click', e => {
  if (busy) return;
  const ar = e.target.closest('[data-ar]');
  if (ar) { selArmy = +ar.dataset.ar; sel = null; const a = AR.armyOf(S, selArmy); const p = AR.armyXY(S, a); centerOn(p.x, p.y); renderMap(); renderPanel(); return; }
  const cc = e.target.closest('[data-cc]');
  if (cc) { sel = +cc.dataset.cc; selArmy = null; const c = R.city(S, sel); centerOn(c.x, c.y); renderMap(); renderPanel(); return; }
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
  if (selArmy) { armyAction(a, AR.armyOf(S, selArmy)); return; }
  const c = R.city(S, sel);
  if (a === 'muster') { if (needOrder()) openMuster(c.id, null); return; }
  if (a === 'attackthis') {
    if (!needOrder()) return;
    const src = bestSource(c.id);
    if (!src) { toast('附近沒有可以出陣的據點'); return; }
    openMuster(src, c.id); return;
  }
  if (a === 'reward') { openReward(c.id); return; }
  if (!needOrder()) return;
  pickGeneral(c.id, a);
}

// 能最快抵達目標、且有待命武將與兵力的己方據點
function bestSource(to) {
  let best = null, bm = Infinity;
  for (const c of R.citiesOf(S, S.player)) {
    if (c.troops < 500 || !R.gensIn(S, c.id, S.player).some(g => !g.acted)) continue;
    const p = AR.findPath(S, S.player, c.id, to);
    if (!p) continue;
    const m = AR.pathMonths(S, S.player, c.id, p);
    if (m < bm) { bm = m; best = c.id; }
  }
  return best;
}

function reachableFrom(fromIds, fid = S.player) {
  const set = new Set();
  for (const c of S.cities) {
    if (fromIds.includes(c.id)) continue;
    if (fromIds.some(f => AR.findPath(S, fid, f, c.id))) set.add(c.id);
  }
  return set;
}

function armyAction(act, a) {
  if (!a) return;
  if (act.startsWith('mode:')) { a.mode = act.slice(5); toast(`改為${AR.MODES[a.mode].name}`); renderAll(); return; }
  if (act === 'reroute') {
    const ends = a.edge ? [a.edge.from, a.edge.to] : [a.at];
    const set = new Set(reachableFrom(ends));
    if (a.edge) ends.forEach(id => set.add(id));
    enterPick(`${AR.leaderOf(S, a).name}軍：選擇新的目的地`, set, id => {
      const r = AR.reroute(S, a, id);
      toast(r.msg); renderAll();
    }, () => renderAll());
  } else if (act === 'halt') {
    if (a.edge) { a.path = [a.edge.to]; a.dest = a.edge.to; } else { a.path = []; a.dest = a.at; }
    toast('部隊將停下待命'); renderAll();
  } else if (act === 'enter') {
    const r = AR.disband(S, a); toast(r.msg);
    if (r.ok) { sel = a.at; selArmy = null; }
    renderAll();
  } else if (act === 'recall') {
    const own = R.citiesOf(S, S.player).map(c => c.id);
    let best = null, bm = Infinity;
    for (const id of own) {
      const ends = a.edge ? [a.edge.from, a.edge.to] : [a.at];
      for (const f of ends) { const p = AR.findPath(S, S.player, f, id); if (p) { const m = AR.pathMonths(S, S.player, f, p); if (m < bm) { bm = m; best = id; } } }
    }
    if (best == null) { toast('找不到可以撤回的據點'); return; }
    const r = AR.reroute(S, a, best); toast(r.ok ? `撤回${R.city(S, best).name}` : r.msg); renderAll();
  }
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

// ---------- 出陣設定 ----------
// 路線地形條：各地形里數比例＋渡河
function terrainBar(from, path) {
  if (!path || !path.length) return '';
  const { li, rivers } = AR.routeSummary(from, path);
  const tot = Object.values(li).reduce((a, x) => a + x, 0) || 1;
  const order = ['plain', 'hill', 'forest', 'marsh', 'mountain', 'plank', 'water'];
  const parts = order.filter(k => li[k] > 0);
  return `<div class="tbar">${parts.map(k => `<i style="flex:${li[k]};background:${TERRAINS[k].color}" title="${TERRAINS[k].name}"></i>`).join('')}</div>
    <div class="tlegend">${parts.map(k => `<span><u style="background:${TERRAINS[k].color}"></u>${TERRAINS[k].name} ${fmt(li[k])} 里</span>`).join('')}
    ${rivers.length ? `<span>渡河：${rivers.map(r => `${r.river}${r.ford ? '（渡口）' : ''}`).join('、')}</span>` : ''}<span class="muted">共 ${fmt(tot)} 里</span></div>`;
}

function openMuster(from, dest) {
  const src = R.city(S, from);
  const avail = R.gensIn(S, from, S.player).filter(g => !g.acted);
  if (!avail.length) { toast(`${src.name}沒有待命的武將`); return; }
  if (src.troops < 100) { toast(`${src.name}兵力不足`); return; }
  const st = { dest, cfg: new Map(), food: 0, foodManual: false, mode: 'normal' };
  const total = () => [...st.cfg.values()].reduce((a, v) => a + v.troops, 0);
  const path = () => (st.dest ? AR.findPath(S, S.player, from, st.dest) : null);
  const unitsNow = () => [...st.cfg.entries()].map(([genId, v]) => ({ genId, ...v }));
  const days = () => { const p = path(); return p ? AR.pathDays(S, S.player, from, p, unitsNow().filter(u => u.troops > 0), st.mode) : 0; };
  const months = () => days() / AR.DAYS;
  const autoFood = () => { if (!st.foodManual) st.food = Math.min(R.fac(S, S.player).food, Math.ceil(total() * AR.FOOD_RATE * (Math.ceil(months()) + 3) / 10) * 10); };
  const rebalance = () => {
    const n = st.cfg.size; if (!n) return;
    const per = Math.floor(src.troops * 0.8 / n / 100) * 100;
    for (const v of st.cfg.values()) v.troops = per;
  };
  const add = g => { st.cfg.set(g.id, { type: B.prefType(S, g), troops: 0 }); rebalance(); };
  avail.sort((a, b) => b.str - a.str).slice(0, Math.min(3, avail.length)).forEach(add);
  autoFood();
  const draw = () => {
    const t = R.city(S, st.dest || from);
    const m = months();
    const destHtml = st.dest
      ? `<b>${t.name}</b>${t.owner === S.player ? '' : facTag(t.owner)}<span class="muted">約 ${Math.max(1, Math.ceil(days()))} 日${t.owner && t.owner !== S.player ? `・守軍 ${fmt(t.troops)}・城防 ${t.wall}` : !t.owner ? `・守軍 ${fmt(t.troops)}` : ''}</span>`
      : '<span class="muted">尚未選擇</span>';
    const f = R.fac(S, S.player);
    openModal(`<button class="btn small close-x" data-a="close">✕</button><h3>出陣・${src.name}</h3>
      <div class="row">目的地：${destHtml}<button class="btn small" data-a="dest">${st.dest ? '更改' : '在地圖上選擇'}</button></div>
      ${st.dest ? terrainBar(from, path()) : ''}
      <div class="row"><span>行軍方式</span><span class="seg">${Object.entries(AR.MODES).map(([k, md]) => `<button class="btn small ${st.mode === k ? 'sel' : ''}" data-a="mode" data-v="${k}">${md.name}</button>`).join('')}</span></div>
      <div class="muted">${AR.MODES[st.mode].desc}。日行約 ${Math.round(AR.basePace(unitsNow().filter(u => u.troops > 0)) * AR.MODES[st.mode].mul)} 里（平地；衝車、輜重最慢，全騎兵最快；兩萬人以上縱隊拉長變慢）。</div>
      <div class="muted">抵達敵方或中立據點時攻城；路上遇到敵軍會打野戰。目的地是己方據點則抵達後入城。</div>
      <div class="sec">武將（最多 5 位）</div>
      <div class="glist">${avail.map(g => {
        const c = st.cfg.get(g.id);
        if (!c) return `<div class="grow" data-a="add" data-g="${g.id}">${portraitImg(g, 32)}<b>${esc(g.name)}</b><span>勇${g.str} 謀${g.int}</span><span class="muted">${g.trait}</span><span class="done">＋ 加入</span></div>`;
        return `<div class="unitcfg">${portraitImg(g, 40)}<div>
          <div class="row" style="margin:0"><b>${esc(g.name)}</b><span class="muted">勇${g.str} 謀${g.int} ${g.trait}</span><button class="btn small" data-a="rm" data-g="${g.id}">移除</button></div>
          <div class="row" style="margin:2px 0"><span class="seg">${Object.entries(T.TYPES).map(([k, ty]) => `<button class="btn ${c.type === k ? 'sel' : ''}" data-a="type" data-g="${g.id}" data-v="${k}">${ty.name}</button>`).join('')}</span></div>
          <div class="row" style="margin:0"><input type="range" min="0" max="${src.troops}" step="100" value="${c.troops}" data-i="tr${g.id}" style="flex:1"><b id="tr${g.id}">${fmt(c.troops)}</b></div>
        </div></div>`;
      }).join('')}</div>
      <div class="note">出陣兵力 <b id="tot">${fmt(total())}</b> / 城內 ${fmt(src.troops)}<br>
        攜帶糧草 <b id="food">${fmt(st.food)}</b>（每月耗 <span id="fpm">${fmt(total() * AR.FOOD_RATE)}</span>，現有 ${fmt(f.food)}）
        <input type="range" min="0" max="${f.food}" step="10" value="${st.food}" data-i="food" style="width:100%">
        ${S.season === 3 ? '<br>⚠ 冬季北方與山區常下雪，行軍緩慢、易生凍傷' : S.month >= 4 && S.month <= 8 ? '<br>⚠ 夏秋之際南方有瘴癘' : ''}</div>
      <div class="foot"><button class="btn red big" data-a="go" ${st.dest ? '' : 'disabled'}>出陣！（軍令 1）</button></div>`,
    (a, el) => {
      const gid = +el.dataset.g;
      if (a === 'add') { if (st.cfg.size >= 5) { toast('最多 5 位武將'); return; } add(R.gen(S, gid)); autoFood(); draw(); }
      else if (a === 'rm') { st.cfg.delete(gid); rebalance(); autoFood(); draw(); }
      else if (a === 'type') { st.cfg.get(gid).type = el.dataset.v; autoFood(); draw(); }
      else if (a === 'mode') { st.mode = el.dataset.v; autoFood(); draw(); }
      else if (a === 'dest') {
        closeModal();
        const set = reachableFrom([from]);
        enterPick(`${src.name}出陣：點選目的地`, set, id => { st.dest = id; autoFood(); draw(); }, draw);
      } else if (a === 'input:food') { st.food = +el.value; st.foodManual = true; $('food').textContent = fmt(st.food); }
      else if (a.startsWith('input:tr')) {
        const id = +a.slice(8); const c = st.cfg.get(id);
        const others = [...st.cfg.entries()].filter(([k]) => k !== id).reduce((x, [, v]) => x + v.troops, 0);
        c.troops = Math.min(+el.value, src.troops - others);
        el.value = c.troops; $('tr' + id).textContent = fmt(c.troops);
        autoFood();
        $('tot').textContent = fmt(total()); $('food').textContent = fmt(st.food); $('fpm').textContent = fmt(total() * AR.FOOD_RATE);
        const fr = $('modal-box').querySelector('[data-i=food]'); if (fr) fr.value = st.food;
      } else if (a === 'go') {
        if (!needOrder()) return;
        const units = [...st.cfg.entries()].filter(([, v]) => v.troops > 0).map(([genId, v]) => ({ genId, ...v }));
        if (!units.length || total() < 100) { toast('請分配兵力'); return; }
        const r = AR.muster(S, S.player, from, units, st.food, st.dest, st.mode);
        if (!r.ok) { toast(r.msg); return; }
        S.orders--;
        closeModal(); toast(r.msg, 3500); R.log(S, r.msg);
        selArmy = r.army.id; sel = null;
        renderAll();
      }
    });
  };
  if (!st.dest) { draw(); return; }
  draw();
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

// ---------- 行軍中的戰鬥 ----------
const unitsDesc = units => units.map(u => `${esc(R.gen(S, u.genId).name)}（${T.TYPES[u.type].name} ${fmt(u.troops)}）`).join('、');

function addFx(x, y, kind) { fx.push({ x, y, kind, t0: performance.now() }); }
async function battleHook(kind, plan, ctx) {
  const atk = plan.faction;
  const node = kind === 'siege' ? R.city(S, plan.to) : null;
  { const p = node || AR.armyXY(S, ctx.a); addFx(p.x, p.y, kind); hist(S.turn).b++; }
  const def = kind === 'siege' ? node.owner : plan.defFaction;
  const side = atk === S.player ? 'A' : def === S.player ? 'D' : null;
  if (!side) return T.autoBattle(S, T.createTactical(S, plan));
  // 鏡頭移到戰場
  if (node) { sel = node.id; selArmy = null; centerOn(node.x, node.y); }
  else { const p = AR.armyXY(S, ctx.a); selArmy = ctx.a.faction === S.player ? ctx.a.id : ctx.d.id; sel = null; centerOn(p.x, p.y); }
  renderAll();
  let title, body;
  const atkTot = plan.units.reduce((a, u) => a + u.troops, 0);
  if (kind === 'siege') {
    const dg = def ? R.gensIn(S, node.id, def) : [];
    title = side === 'A' ? `兵臨${node.name}` : `⚠ 敵軍來襲・${node.name}`;
    body = `<p>${facTag(atk)} 軍抵達${KIND_TAG(node)}<b>${node.name}</b>${def ? `（${facName(def)}）` : '（中立）'}。</p>
      <p>攻方：${unitsDesc(plan.units)}・共 ${fmt(atkTot)}${plan.fat >= 30 ? `・疲勞 ${Math.round(plan.fat)}` : ''}<br>守方：守軍 ${fmt(node.troops)}・城防 ${node.wall}・守將 ${dg.length ? dg.map(g => esc(g.name)).join('、') : '無'}</p>`;
  } else {
    const defTot = plan.defUnits.reduce((a, u) => a + u.troops, 0);
    title = plan.water ? '江上遭遇敵軍' : '遭遇敵軍';
    body = `<p>${facTag(atk)} 軍與 ${facTag(def)} 軍在${esc(plan.name)}相遇，展開${plan.water ? '水戰' : '野戰'}！</p>
      <p>${facName(atk)}：${unitsDesc(plan.units)}・共 ${fmt(atkTot)}${plan.fat >= 30 ? `・疲勞 ${Math.round(plan.fat)}` : ''}<br>${facName(def)}：${unitsDesc(plan.defUnits)}・共 ${fmt(defTot)}${plan.defFat >= 30 ? `・疲勞 ${Math.round(plan.defFat)}` : ''}</p>
      ${plan.day != null ? `<p class="muted">${R.seasonName(S)}第 ${plan.day + 1} 日</p>` : ''}`;
  }
  const k = await choose(title, body, [{ label: '親自指揮', cls: 'red' }, { label: '自動交戰' }]);
  let res;
  if (k === 0) { res = await runBattle(plan, side); show('screen-game'); }
  else {
    res = T.autoBattle(S, T.createTactical(S, plan));
    const won = res.winner === side;
    toast(res.draw ? '勝負未分，雙方收兵' : won ? '我軍獲勝！' : '我軍敗退……', 3500);
  }
  renderAll();
  return res;
}

async function captivesHook(ids) {
  const mine = ids.filter(id => R.gen(S, id).captor === S.player);
  if (mine.length) await handleCaptives(mine);
  for (const id of ids) {
    const g = R.gen(S, id);
    if (g.status !== 'captive' || g.captor === S.player) continue;
    if (g.captor && R.fac(S, g.captor).alive) R.aiHandleCaptives(S, g.captor, [id]);
    else { g.status = 'free'; g.faction = null; }
  }
}

// ---------- 月末 ----------
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
  if (pickMode) { pickMode = null; drawMap(); }
  if (S.orders > 0) {
    const k = await choose('結束本月？', `<p>還有 ${S.orders} 點軍令沒有使用。</p>`, [{ label: '結束本月', cls: 'red' }], { closable: true });
    if (k !== 0) return;
  }
  busy = true;
  $('btn-end').disabled = true;
  document.body.classList.add('marching');
  const marker = S.log[0];
  const order = Object.keys(S.factions).filter(id => id !== S.player).sort(() => R.rand(S) - 0.5);
  for (const fid of order) {
    if (!R.fac(S, fid).alive || S.over) continue;
    aiMilitary(S, fid);
  }
  renderAll();
  const now0 = performance.now();
  for (const f of fx) f.fade = now0;
  if (S.armies.length) {
    marchStep = 0; renderTimeline();
    const ev = await AR.marchMonth(S, {
      battle: battleHook,
      captives: captivesHook,
      frame: async step => { marchStep = step + 1; labelsDirty = true; renderTop(); renderTimeline(); renderIntel(); await wait(38); },
    });
    for (const e of ev) if (e.kind === 'capture') { const c = R.city(S, e.node); addFx(c.x, c.y, 'capture'); hist(S.turn).c++; }
    await wait(250);
  }
  marchStep = -1;
  document.body.classList.remove('marching');
  if (!S.over) { R.endMonthEconomy(S); R.advanceMonth(S); }
  renderAll();
  if (S.over) { busy = false; $('btn-end').disabled = false; gameOver(); return; }
  // 月報
  const news = [];
  for (const l of S.log) { if (l === marker) break; news.push(l); }
  const imp = news.filter(l => l.kind === 'big' || l.kind === 'warn');
  if (imp.length) {
    await choose(`${R.seasonName(S)}・軍報`, `<div>${imp.slice(0, 14).map(l => `<div class="logline ${l.kind}">${esc(l.text)}</div>`).join('')}</div>
      ${news.length > imp.length ? `<div class="muted">其他消息 ${news.length - imp.length} 則，可在「紀錄」查看。</div>` : ''}`, [{ label: '確定', cls: 'red' }]);
  }
  // 事件
  const ev = R.rollEvent(S);
  if (ev) {
    sel = ev.city.id; selArmy = null; renderAll();
    const k = await choose(`事件：${ev.ev.title}`, `<div class="note">${esc(ev.ev.text(ev.city))}</div>`, ev.ev.choices.map(c => ({ label: c.label })));
    ev.ev.choices[k].run(S, ev.city);
    R.log(S, `${ev.city.name}${ev.ev.title}：${ev.ev.choices[k].label}`);
  }
  for (const pr of aiProposals(S)) {
    const f = R.fac(S, pr.from);
    const k = await choose('使者來訪', `<p>${esc(f.name)}遣使前來，提議${pr.kind === 'truce' ? '停戰一年' : '締結同盟'}。</p>`, [{ label: '接受', cls: 'red' }, { label: '婉拒' }]);
    if (k === 0) {
      if (pr.kind === 'truce') { f.truce[S.player] = S.turn + 12; R.fac(S, S.player).truce[f.id] = S.turn + 12; }
      else { f.alliance[S.player] = true; R.fac(S, S.player).alliance[f.id] = true; }
      R.log(S, `與${f.name}${pr.kind === 'truce' ? '停戰' : '結盟'}。`);
    } else R.changeRel(S, f.id, S.player, -5);
  }
  saveSlot('auto', true);
  busy = false;
  $('btn-end').disabled = false;
  renderAll();
}

// ---------- 戰鬥畫面 ----------
function runBattle(plan, mySide) {
  return runTactical({
    S, R, A, esc, fmt, bar, show, toast, choose, openModal, closeModal, facName, portraitImg,
    portraitSrc: g => A.portrait(g, g.faction || g.captor),
  }, plan, mySide);
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
      <div class="muted">${genWhere(g)}<br>忠${g.loyalty}</div><span class="done">${g.army ? '出陣中' : g.acted ? '已行動' : '待命'}</span></div>`).join('')}</div>`,
  (a, el) => { if (a === 'g') openGeneral(+el.dataset.g, true); });
}

function openGeneral(id, back) {
  const g = R.gen(S, id);
  const isRuler = g.faction && R.fac(S, g.faction).ruler === g.id;
  openModal(`<button class="btn small close-x" data-a="${back ? 'back' : 'close'}">✕</button>
    <div class="captive">${portraitImg(g, 96)}<div><h3>${isRuler ? '👑' : ''}${esc(g.name)}</h3>${g.faction ? facTag(g.faction) : '<span class="tag" style="background:#8a7a5a">在野</span>'}
    <div class="muted">${genWhere(g)}${g.faction === S.player ? `・忠誠 ${g.loyalty}` : ''}</div></div></div>
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
function truceEnd(turn) { return `${190 + Math.floor(turn / 12)} 年 ${turn % 12 + 1} 月`; }

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
    if (!d.state.armies) { toast('舊版本的存檔無法在新版讀取'); return; }
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
    <h4>地圖</h4><p>天下有 44 座<b>城池</b>、9 處<b>關卡</b>、10 座<b>港口</b>，以道路（虛線）和水路（藍點線）相連。拖曳移動地圖，滾輪或雙指縮放，右下角按鈕也可縮放。
    關卡位於險要處，城防高、不能開墾經商；港口之間可走水路，速度較快。</p>
    <h4>軍情看板、時間軸、跟拍</h4><p>左上「軍情」列出天下所有部隊的狀態與預計抵達月數，紅色「來犯」是正朝我方據點前進的敵軍，點一列即可定位。發光流動的線是各部隊的行軍路線（橘色為我軍、紅色為來犯）。
    地圖下方時間軸顯示今年各月：金色為本月，紅數字為該月戰事數，黃點為秋收、紅點為聯軍期滿、藍點為停戰期滿，點月份可看當月大事。右上「跟拍」讓鏡頭跟著下一支即將交戰的部隊，☾／☀ 切換晝夜。</p>
    <h4>回合與軍令</h4><p>一個月一回合。每月有若干<b>軍令</b>（君主德越高、城池越多就越多），內政、出陣、外交每個指令花 1 點。每位武將每月只能行動一次。</p>
    <h4>出陣與行軍</h4><ul><li>在己方據點按<b>出陣</b>，選最多 5 位武將、兵種與兵力，攜帶糧草，再到地圖上點選目的地（紅圈為可抵達的地點），出陣畫面會顯示路線經過的地形與預計天數。</li>
    <li>按「結束本月」後，所有勢力的部隊同時沿道路前進。部隊只能穿過己方或和平勢力的據點，遇到敵方或中立據點就停下攻城。</li>
    <li>敵我部隊在路上相遇會打<b>野戰</b>（水路上是水戰），沒有城牆，12 回合內分勝負。</li>
    <li>點地圖上的部隊旗幟可以改變目的地、停下或撤回。抵達己方據點會自動入城。</li>
    <li>部隊每月消耗糧草，糧盡士兵會逃散。冬季行軍較慢。</li></ul>
    <h4>行軍的細節</h4><ul>
    <li><b>逐日行軍</b>：每月 30 天逐日計算。步兵常行日行 30 里；全騎兵 50 里；帶衝車 22 里；兩萬人以上縱隊拉長變慢。</li>
    <li><b>地形</b>：平原 ×1、丘陵 ×0.75、林地 ×0.7、沼澤 ×0.5、山地 ×0.45、棧道 ×0.3。官道 ×1.2，山徑 ×0.7。選取部隊時路線會依地形上色。</li>
    <li><b>渡河</b>：有渡口半天，無渡口 1～2 天；大雨漲水時無渡口的河過不去。水路順流（往東）快、逆流慢。</li>
    <li><b>天候</b>：北方與山區冬天下雪，江南春夏多雨；雨雪都會拖慢行軍，大雪還會凍傷士卒。南方夏秋有瘴癘。</li>
    <li><b>行軍方式</b>：常行每五日休整一日；倍道日夜兼程、速度約兩倍，但疲勞大增並有士兵掉隊；緩行較慢但能恢復疲勞。</li>
    <li><b>疲勞</b>：疲勞高時攻擊減弱、受創加重、計策氣力減少。長途奔襲後最好先休整再攻城。</li>
    <li><b>補給</b>：秋天可就地徵糧，耗糧較少；離己方據點越遠（超過兩站）耗糧越多。</li></ul>
    <h4>內政</h4><ul><li>開墾：提高農田，秋季收穫更多糧。</li><li>商業：提高市集，每季稅收增加。</li><li>修城：守城時減少傷害。</li>
    <li>徵兵：增加兵力，但降低民心。</li><li>施政：提高民心；民心影響收入，過低會發生騷亂。</li><li>訪賢：在城中尋找在野人才。</li></ul>
    <p>每月收稅，九月秋收。士兵每月消耗糧食，糧食不足時士兵會逃散。</p>
    <h4>攻城戰（六角格戰場）</h4><p>戰場左側為攻方陣地，右側是城牆、城門與本陣。
    雙方輪流行動，每回合每支部隊可<b>移動一次，再攻擊、施計、單挑或待機</b>。點我方部隊後，藍格可移動、紅格可攻擊（點兩次確認）。</p>
    <ul><li><b>攻方</b>須在 20 回合內攻破城門、佔領本陣，或擊潰所有守軍。</li><li><b>守方</b>撐過 20 回合，或擊退所有攻方部隊即獲勝。</li>
    <li>兵種：槍兵（穩健）、騎兵（移動遠，衝鋒有加成）、弓兵（射程 2，站在城牆或丘陵上射程 +1）、衝車（專破城門）。</li>
    <li>相剋：<b>槍剋騎、騎剋弓、弓剋槍</b>。林地與丘陵易守、河川難行；敵軍身旁會阻擋移動，多部隊包夾傷害更高。</li>
    <li>計策消耗氣力：火計（林地更易成功）、混亂（敵軍停擺一回合）、鼓舞、落石（須在丘陵或城牆上）。成功率看雙方智謀。</li></ul>
    <h4>單挑</h4><p>與相鄰敵將單挑。攻剋奇、奇剋守、守剋攻，勇武較高的一方能看穿對手的架勢。敗者部隊大亂，甚至可能被生擒。</p>
    <h4>外交與合縱聯軍</h4><p>贈禮提高關係，關係夠高可停戰、結盟。當某勢力佔有約 4 成城池，其他諸侯會組成<b>合縱聯軍</b>共同討伐。
    弱小時你也可以主動號召聯軍。</p>
    <h4>存檔</h4><p>每月結束自動存檔，資料保存在瀏覽器中。</p></div>`);
}

// 測試用：網址加上 ?debug 時開放內部狀態
if (location.search.includes('debug')) window.__qx = { get S() { return S; }, V, runBattle, renderAll, R, T, AR, get follow() { return follow; }, get fx() { return fx; } };
