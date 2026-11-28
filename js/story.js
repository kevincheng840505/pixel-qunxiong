// 劇情事件：依《三國演義》與正史《三國志》改編。不碰畫面。
// 事件條件成立才發生；玩家勢力是主角時由玩家抉擇，其餘由電腦依史實（演義模式約九成）決定。
import * as R from './rules.js';
import { ADJ } from './rules.js';
import { autoDuel } from './battle.js';
import { cityId, EXTRA_FACTIONS } from './data.js';

export const CHAPTERS = ['', '群雄討董', '群雄逐鹿', '官渡與赤壁', '三分天下', '北伐中原', '三國歸晉'];
const SRC = { y: '演義', z: '正史', b: '演義・正史' };

// ---------- 輔助：查詢與效果 ----------
export function helpers(s) {
  const g = n => s.generals.find(x => x.name === n);
  const cid = n => cityId(n);
  const C = n => R.city(s, cid(n));
  const alive = fid => !!fid && !!s.factions[fid] && R.fac(s, fid).alive;
  const h = {
    g, C,
    live: n => { const x = g(n); return !!x && !['dead', 'unborn'].includes(x.status); },
    // 所屬勢力（現役）
    on: n => { const x = g(n); return x && x.status === 'active' && x.faction && alive(x.faction) ? x.faction : null; },
    free: n => { const x = g(n); return !!x && (x.status === 'hidden' || x.status === 'free'); },
    ruler: fid => alive(fid) ? R.gen(s, R.fac(s, fid).ruler) : null,
    isRuler: n => { const f = h.on(n); return f && R.fac(s, f).ruler === g(n).id ? f : null; },
    alive,
    owner: n => C(n).owner,
    owns: (fid, n) => !!fid && C(n).owner === fid,
    war: (a, b) => alive(a) && alive(b) && a !== b && !R.atPeace(s, a, b),
    near: (fid, n) => R.citiesOf(s, fid).some(c => c.id === cid(n) || ADJ[c.id].includes(cid(n))),
    ncity: fid => R.citiesOf(s, fid).filter(c => c.kind === 'city').length,
    flag: k => s.story.flags[k],
    set: (k, v = true) => { s.story.flags[k] = v; },
    nm: fid => alive(fid) ? R.fac(s, fid).name : '',
    // ---- 效果 ----
    join(n, fid, cn, loyalty = 75) {
      const x = g(n);
      if (!x || ['dead', 'unborn'].includes(x.status) || !alive(fid) || !R.citiesOf(s, fid).length) return false;
      if (h.isRuler(n) && x.faction !== fid) return false;
      R.leaveArmy(s, x);
      const rl = h.ruler(fid);
      let at = cn && h.owns(fid, cn) ? cid(cn) : null;
      if (at == null && rl && !rl.army && R.city(s, rl.city).owner === fid) at = rl.city;
      if (at == null) at = R.citiesOf(s, fid)[0].id;
      x.faction = fid; x.status = 'active'; x.captor = null; x.city = at; x.loyalty = Math.max(x.loyalty || 0, loyalty); x.acted = false;
      return true;
    },
    leave(n, cn) {
      const x = g(n);
      if (!x || !['active', 'captive'].includes(x.status) || h.isRuler(n)) return false;
      R.leaveArmy(s, x);
      x.faction = null; x.status = 'free'; x.captor = null;
      if (cn) x.city = cid(cn);
      return true;
    },
    // 由某人繼位（不經一般繼承規則）
    crown(fid, n) { const x = g(n); if (!alive(fid) || !x || x.status !== 'active' || x.faction !== fid) return false; const f = R.fac(s, fid); f.ruler = x.id; R.facName(s, fid); x.loyalty = 100; return true; },
    // 國號與爵位（0 州牧、1 公、2 王、3 帝）
    realm(fid, realm, rank) { if (!alive(fid)) return; const f = R.fac(s, fid); if (realm) f.realm = realm; f.rank = Math.max(f.rank || 0, rank); R.facName(s, fid); },
    rank: fid => alive(fid) ? R.fac(s, fid).rank || 0 : 0,
    // 吞併整個勢力：部將歸附、城池易手；舊君主 retire 退隱／kill 處死／join 歸附
    absorb(from, to, fate = 'retire', loyalty = 70) {
      if (!alive(from) || !alive(to) || from === to) return false;
      const rl = h.ruler(from);
      for (const x of R.gensOf(s, from)) if (x.id !== rl.id) h.join(x.name, to, null, loyalty);
      for (const c of R.citiesOf(s, from)) h.give(c.name, to);
      if (rl.status === 'captive' || rl.status === 'active' && !alive(from)) {
        if (fate === 'kill') R.killGen(s, rl, null);
        else if (fate === 'join') { rl.status = 'free'; rl.captor = null; h.join(rl.name, to, null, loyalty); }
        else { rl.status = 'hidden'; rl.faction = null; rl.captor = null; rl.lock = 9999; }
      }
      return true;
    },
    kill(n, why) { const x = g(n); if (x && !['dead', 'unborn'].includes(x.status)) R.killGen(s, x, why); },
    give(cn, fid) {
      const c = C(cn), old = c.owner;
      if (old === fid || !alive(fid)) return false;
      c.owner = fid;
      if (old) {
        const rest = R.citiesOf(s, old);
        for (const x of R.gensIn(s, c.id, old)) {
          if (rest.length) x.city = rest[0].id;
          else if (R.fac(s, old).ruler !== x.id) { x.faction = null; x.status = 'free'; }
        }
        R.checkElimination(s, old, fid);
      }
      return true;
    },
    troops: (cn, mul, add = 0) => { const c = C(cn); c.troops = Math.max(0, Math.min(R.troopCapOf(c), Math.round(c.troops * mul + add))); },
    capTroops: (fid, mul) => { for (const c of R.citiesOf(s, fid)) c.troops = Math.round(c.troops * mul); },
    gold: (fid, d) => { if (alive(fid)) R.fac(s, fid).gold = Math.max(0, R.fac(s, fid).gold + d); },
    food: (fid, d) => { if (alive(fid)) R.fac(s, fid).food = Math.max(0, R.fac(s, fid).food + d); },
    rel: (a, b, d) => { if (alive(a) && alive(b) && a !== b) R.changeRel(s, a, b, d); },
    truce: (a, b, months) => { if (!alive(a) || !alive(b) || a === b) return; const t = s.turn + months; R.fac(s, a).truce[b] = Math.max(R.fac(s, a).truce[b] || 0, t); R.fac(s, b).truce[a] = Math.max(R.fac(s, b).truce[a] || 0, t); },
    ally: (a, b) => { if (alive(a) && alive(b) && a !== b) { R.fac(s, a).alliance[b] = true; R.fac(s, b).alliance[a] = true; } },
    hostile(a, b) {
      if (!alive(a) || !alive(b) || a === b) return;
      for (const [x, y] of [[a, b], [b, a]]) { delete R.fac(s, x).truce[y]; delete R.fac(s, x).alliance[y]; }
    },
    loyal: (n, d) => { const x = g(n); if (x) x.loyalty = R.clamp((x.loyalty || 50) + d, 0, 100); },
    stat: (n, k, d) => { const x = g(n); if (x) x[k] = R.clamp(x[k] + d, 1, 100); },
    order: (cn, d) => { const c = C(cn); c.order = R.clamp(c.order + d, 0, 100); },
    // 建立新勢力：cities 只取中立城池（force 時可奪取）
    spawn(fid, rulerName, cities, gens = [], force = false) {
      const f = R.fac(s, fid), rl = g(rulerName);
      if (f.alive || !rl || ['dead', 'unborn', 'captive'].includes(rl.status) || h.isRuler(rulerName)) return false;
      const own = cities.filter(n => force || !C(n).owner);
      if (!own.length) return false;
      const def = EXTRA_FACTIONS.find(x => x.id === fid);
      f.alive = true; f.name = rulerName; f.realm = ''; f.rank = 0; f.gold = def.gold; f.food = def.food; f.truce = {}; f.alliance = {};
      for (const k in f.relations) f.relations[k] = 0;
      for (const o of Object.values(s.factions)) if (o.id !== fid) o.relations[fid] = 0;
      for (const n of own) { const c = C(n); if (c.owner) h.give(n, fid); else c.owner = fid; c.troops = Math.max(c.troops, 4000); }
      R.leaveArmy(s, rl);
      rl.faction = fid; rl.status = 'active'; rl.captor = null; rl.loyalty = 100; rl.city = cid(own[0]);
      f.ruler = rl.id;
      for (const n of gens) if (!h.isRuler(n)) h.join(n, fid, null, 80);
      return true;
    },
  };
  return h;
}

// 單挑用的臨時人物
const combo = (name, str, int) => ({ name, str, int, pseudo: true });

// ---------- 事件 ----------
// who(s,h) 回傳 { fid: 抉擇的勢力, also: [其他相關勢力] } 或 null
// choices: [{ t 選項, d 效果說明, hist 史實, ok? 可選條件, p? 成功率, duel? [甲, 乙], run(s,h,c,r) → 結果文字 }]
export const STORY = [
  // ===== 第一章 群雄討董 =====
  {
    id: 'gegju', ch: 1, src: 'z', title: '州郡割據', y: [190, 191],
    who: (s, h) => ({ fid: null }),
    lines: () => [['', '董卓亂政，天下州郡各自擁兵。徐州刺史陶謙據下邳，益州牧劉焉閉關自守，西涼馬騰、韓遂雄踞武威。'], ['', '群雄並起，已非朝廷所能號令。']],
    choices: [{ t: '天下大亂', hist: true, run: (s, h) => {
      const out = [];
      if (h.spawn('tao', '陶謙', ['下邳'], ['糜竺', '陳登'])) out.push('陶謙據徐州');
      if (h.spawn('yan', '劉焉', ['成都', '梓潼', '江州'], ['張任', '黃權', '嚴顏', '張松', '法正'])) out.push('劉焉據益州');
      if (h.spawn('ma', '馬騰', ['武威'], ['韓遂', '龐德'])) { out.push('馬騰據西涼'); h.rel('ma', 'dong', 20); }
      return out.join('，') + '。';
    } }],
  },
  {
    id: 'suanzao', ch: 1, src: 'b', title: '酸棗會盟', y: [190, 190], m: [0, 2],
    who: (s, h) => s.player !== 'dong' && s.coalition && h.alive('yuans') ? { fid: s.player } : null,
    lines: (s, h) => [['', '關東諸侯歃血為盟，共討國賊。眾人推舉盟主，席間議論紛紛。'], ['曹操', '本初四世三公，門多故吏，可為盟主。'], ['袁紹', '紹雖不才，既承公等推舉，敢不從命！']],
    choices: [
      { t: '推舉袁紹為盟主', hist: true, d: '與袁紹關係 +20', run: (s, h) => { h.rel(s.player, 'yuans', 20); return '袁紹登壇為盟主，諸侯聽其號令。'; } },
      { t: '自薦為盟主', d: '看君主的德：成功則諸侯關係 +10、聯軍資助金 400；失敗與袁紹交惡', ok: (s) => s.player !== 'yuans',
        p: (s, h) => R.clamp(h.ruler(s.player).cha - 50, 5, 80),
        run: (s, h, c, r) => {
          if (r.win) { for (const f of Object.values(s.factions)) if (f.alive && f.id !== 'dong') h.rel(s.player, f.id, 10); h.gold(s.player, 400); return `諸侯服其德望，公推${h.nm(s.player)}為盟主！`; }
          h.rel(s.player, 'yuans', -25); return '諸侯面面相覷，袁紹拂袖不悅。';
        } },
    ],
  },
  {
    id: 'huaxiong', ch: 1, src: 'y', title: '溫酒斬華雄', y: [190, 191], m: [1, 11],
    who: (s, h) => h.on('華雄') === 'dong' && h.on('關羽') && h.on('關羽') !== 'dong' && s.coalition && s.coalition.target === 'dong' ? { fid: h.on('關羽'), also: ['dong'] } : null,
    lines: () => [['', '董卓大將華雄出汜水關搦戰，連斬聯軍數將，諸侯失色。'], ['關羽', '小將願往斬華雄頭，獻於帳下！'], ['曹操', '且飲此酒再去。'], ['關羽', '酒且斟下，某去便來。']],
    choices: [
      { t: '讓關羽出戰', hist: true, d: '關羽與華雄單挑：勝則華雄陣亡、虎牢關守軍大減、聯軍各家關係 +10',
        duel: (s, h) => [h.g('關羽'), h.g('華雄')],
        run: (s, h, c, r) => {
          if (r.win) { h.kill('華雄', '華雄被關羽斬於陣前。'); h.troops('虎牢關', 0.8); for (const f of Object.values(s.factions)) if (f.alive && f.id !== 'dong' && f.id !== c.fid) h.rel(c.fid, f.id, 10); h.stat('關羽', 'cha', 2); h.set('huaxiong'); return '其酒尚溫，關羽已提華雄之頭擲於地上，眾皆大驚！'; }
          return '關羽與華雄大戰不下，各自收兵。';
        } },
      { t: '不讓無名小卒出戰', d: '什麼都不會發生', run: () => '聯軍堅守營寨，華雄耀武而回。' },
    ],
  },
  {
    id: 'sanying', ch: 1, src: 'y', title: '三英戰呂布', y: [190, 191], m: [2, 11],
    who: (s, h) => {
      const f = h.on('劉備');
      return f && f !== 'dong' && h.on('關羽') === f && h.on('張飛') === f && h.on('呂布') === 'dong' && s.coalition && s.coalition.target === 'dong' && (h.flag('huaxiong') || s.month >= 4) ? { fid: f, also: ['dong'] } : null;
    },
    lines: () => [['', '呂布頭戴紫金冠，手持方天畫戟，坐下赤兔馬，在虎牢關前連敗聯軍。'], ['張飛', '三姓家奴休走！燕人張飛在此！'], ['', '關羽、劉備相繼拍馬來助，三人圍住呂布，轉燈般廝殺。']],
    choices: [
      { t: '兄弟三人齊戰呂布', hist: true, d: '劉關張合力單挑呂布：勝則虎牢關守軍與士氣大挫、三人揚名',
        duel: (s, h) => [combo('劉關張', 102, 72), h.g('呂布')],
        run: (s, h, c, r) => {
          if (r.win) { h.troops('虎牢關', 0.65); for (const n of ['劉備', '關羽', '張飛']) h.stat(n, 'cha', 2); h.set('sanying'); return '呂布架隔不住，撥馬逃回虎牢關，三英之名震動天下。'; }
          return '呂布神勇，三人久戰不下，只得收兵。';
        } },
      { t: '避其鋒芒', d: '什麼都不會發生', run: () => '聯軍閉營不出。' },
    ],
  },
  {
    id: 'qianfu', ch: 1, src: 'b', title: '火燒洛陽・遷都長安', y: [190, 191], m: [1, 11],
    who: (s, h) => h.isRuler('董卓') === 'dong' && h.owns('dong', '洛陽') && h.owns('dong', '長安') && s.coalition && s.coalition.target === 'dong' ? { fid: 'dong' } : null,
    lines: () => [['李儒', '關東兵起，洛陽難守。不如遷都長安，以避其鋒。'], ['董卓', '盡驅洛陽百姓西行，宮室盡數燒毀，休留與關東鼠輩！']],
    choices: [
      { t: '焚燒洛陽，遷都長安', hist: true, d: '洛陽農田、市集、民心大減，半數守軍移往長安；金 +900、糧 +2000',
        run: (s, h) => {
          const c = h.C('洛陽'); const mv = Math.round(c.troops * 0.5);
          c.farm = Math.round(c.farm * 0.4); c.market = Math.round(c.market * 0.3); c.order = 15; c.troops -= mv;
          h.troops('長安', 1, mv); h.gold('dong', 900); h.food('dong', 2000); h.set('qianfu');
          const dz = h.g('董卓'); if (!dz.army) dz.city = cityId('長安');
          return '洛陽烈焰沖天，數百年宮闕化為焦土，天子被挾往長安。';
        } },
      { t: '堅守洛陽', d: '什麼都不會發生', run: () => '董卓坐鎮洛陽，與聯軍對峙。' },
    ],
  },
  {
    id: 'yuxi', ch: 1, src: 'y', title: '孫堅得玉璽', y: [190, 191], m: [3, 11],
    who: (s, h) => h.flag('qianfu') && h.isRuler('孫堅') ? { fid: h.isRuler('孫堅') } : null,
    lines: () => [['', '孫堅率先攻入洛陽廢墟，夜見城南井中五色毫光。'], ['', '打撈上來，竟是傳國玉璽，上刻「受命於天，既壽永昌」。'], ['程普', '此天授主公，宜速回江東，別圖大事。']],
    choices: [
      { t: '暗藏玉璽，返回江東', hist: true, d: '獲得玉璽；與袁紹關係 -20、與劉表關係 -25', run: (s, h, c) => { h.set('yuxi', c.fid); h.rel(c.fid, 'yuans', -20); h.rel(c.fid, 'biao', -25); return '孫堅託病辭歸，袁紹密令劉表於途中截擊。'; } },
      { t: '獻給盟主袁紹', d: '與袁紹關係 +25、金 +300', run: (s, h, c) => { h.set('yuxi', 'yuans'); h.rel(c.fid, 'yuans', 25); h.gold(c.fid, 300); return '孫堅獻上玉璽，袁紹大喜。'; } },
    ],
  },
  {
    id: 'jieqiao', ch: 1, src: 'z', title: '界橋之戰', y: [191, 192],
    who: (s, h) => h.isRuler('公孫瓚') && h.isRuler('袁紹') && h.war(h.isRuler('公孫瓚'), h.isRuler('袁紹')) && h.on('麴義') === h.isRuler('袁紹') ? { fid: h.isRuler('公孫瓚'), also: [h.isRuler('袁紹')] } : null,
    lines: () => [['', '公孫瓚率白馬義從南下，與袁紹戰於界橋。'], ['麴義', '弓弩手伏於盾後，待其馬近再發！'], ['', '千弩俱發，白馬義從人馬俱倒。']],
    choices: [
      { t: '白馬義從正面衝陣', hist: true, d: '多半中伏：嚴綱戰死、各城兵力 -15%；若勝則袁紹前線兵力大減',
        p: (s, h) => 25,
        run: (s, h, c, r) => {
          const ys = h.isRuler('袁紹');
          if (r.win) { h.troops('南皮', 0.7); return '白馬義從踏破麴義陣腳，袁軍大潰！'; }
          h.kill('嚴綱', '嚴綱於界橋陣亡。'); h.capTroops(c.fid, 0.85); h.stat('麴義', 'cha', 3); h.rel(c.fid, ys, -10);
          return '麴義伏弩大破白馬義從，公孫瓚退回幽州。';
        } },
      { t: '堅守不出', d: '什麼都不會發生', run: () => '兩軍隔河對峙。' },
    ],
  },
  {
    id: 'zhaoyun', ch: 1, src: 'b', title: '趙雲辭公孫瓚', y: [191, 193],
    who: (s, h) => {
      const gf = h.on('趙雲'), lf = h.isRuler('劉備');
      if (!gf || !lf || gf === lf || h.isRuler('趙雲') || gf !== h.isRuler('公孫瓚')) return null;
      return { fid: s.player === gf ? gf : lf, also: [gf] };
    },
    lines: () => [['', '趙雲因兄喪，辭別公孫瓚還鄉。劉備握手送別，依依不捨。'], ['趙雲', '雲昔日誤認公孫瓚為英雄，今觀所為，亦袁紹等輩耳。'], ['劉備', '公且屈身事之，相見有日。']],
    choices: [
      { t: '約定後會', hist: true, d: '趙雲回鄉；日後劉備與關張重聚時，趙雲必來投奔', run: (s, h) => { h.leave('趙雲', '南皮'); h.g('趙雲').status = 'hidden'; h.set('zhaoyun'); return '趙雲灑淚而別：「雲誓不忘公之厚恩。」'; } },
      { t: '當場招攬', d: '看劉備的德：成功則趙雲立即加入，與公孫瓚關係 -30', ok: (s, h, c) => c.fid === h.isRuler('劉備'),
        p: (s, h) => R.clamp(h.g('劉備').cha - 40, 10, 70),
        run: (s, h, c, r) => {
          const gf = h.on('趙雲');
          if (r.win) { h.join('趙雲', c.fid, null, 95); h.rel(c.fid, gf, -30); return '趙雲感劉備知遇，當即拜投麾下！'; }
          h.leave('趙雲', '南皮'); h.g('趙雲').status = 'hidden'; h.set('zhaoyun'); return '趙雲婉拒：「待兄喪事畢，再來相投。」';
        } },
      { t: '挽留趙雲', d: '看君主的德：成功則趙雲留下、忠誠大增', ok: (s, h, c) => c.fid === h.on('趙雲'),
        p: (s, h, c) => R.clamp(h.ruler(c.fid).cha - 20, 10, 70),
        run: (s, h, c, r) => {
          if (r.win) { h.loyal('趙雲', 20); return '趙雲感念厚待，留了下來。'; }
          h.leave('趙雲', '南皮'); h.g('趙雲').status = 'hidden'; h.set('zhaoyun'); return '趙雲去意已決，飄然而去。';
        } },
    ],
  },
  {
    id: 'xianshan', ch: 1, src: 'z', title: '峴山之役', y: [191, 192],
    who: (s, h) => { const f = h.isRuler('孫堅'); const b = h.on('黃祖'); return f && b && h.war(f, b) && (h.near(f, '江夏') || h.near(f, '襄陽') || s.year >= 192) ? { fid: f, also: [b] } : null; },
    lines: () => [['', '孫堅奉袁術之命征討劉表，大破黃祖，進圍襄陽。'], ['黃祖', '孫堅輕敵，必追我至峴山。可伏弓弩於竹林之中。'], ['孫堅', '敗軍之將，何足懼哉！隨我追擊！']],
    choices: [
      { t: '單騎追擊黃祖', hist: true, d: '孫堅於峴山中伏身亡，由孫策繼位', run: (s, h) => { h.kill('孫堅', '孫堅於峴山中伏，身中亂箭而亡，年三十七。'); h.set('sunjian_dead'); return '江東猛虎殞落，孫策扶柩歸鄉。'; } },
      { t: '穩紮穩打，收兵回營', d: '孫堅平安；長沙兵力 -10%', run: (s, h, c) => { h.capTroops(c.fid, 0.9); return '孫堅察覺林中有伏，收兵而回。'; } },
    ],
  },
  {
    id: 'qingzhou', ch: 1, src: 'z', title: '收編青州兵', y: [192, 192], m: [3, 11],
    who: (s, h) => h.isRuler('曹操') ? { fid: h.isRuler('曹操') } : null,
    lines: () => [['', '青州黃巾三十萬眾侵入兗州。曹操追擊至濟北，賊眾乞降。'], ['荀彧', '擇其精銳，號為「青州兵」，可為主公霸業之本。']],
    choices: [
      { t: '收編精銳為青州兵', hist: true, d: '首城兵力 +5000、民心 -5', run: (s, h, c) => { const cc = R.citiesOf(s, c.fid)[0]; cc.troops = Math.min(R.troopCapOf(cc), cc.troops + 5000); cc.order = R.clamp(cc.order - 5, 0, 100); return '曹操收降卒三十餘萬，選其精銳編為青州兵，兵勢大振。'; } },
      { t: '遣散為民，屯田墾荒', d: '各城農田 +80、民心 +5', run: (s, h, c) => { for (const cc of R.citiesOf(s, c.fid)) { cc.farm = Math.min(R.capOf(cc), cc.farm + 80); cc.order = R.clamp(cc.order + 5, 0, 100); } return '降眾歸農，兗州田野漸復。'; } },
    ],
  },
  {
    id: 'lianhuan', ch: 1, src: 'y', title: '連環計', y: [191, 192], m: [3, 11],
    who: (s, h) => h.isRuler('董卓') && h.on('呂布') === h.isRuler('董卓') && h.live('王允') && h.live('貂蟬') && (h.flag('qianfu') || s.year >= 192) ? { fid: h.isRuler('董卓') } : null,
    lines: () => [['王允', '董卓、呂布皆好色之徒。今以貂蟬先許呂布，後獻董卓，使其父子反目。'], ['貂蟬', '妾許大人萬死不辭。'], ['', '鳳儀亭中，呂布見董卓擲戟相向，怒不可遏。'], ['呂布', '我與老賊，誓不兩立！']],
    choices: [
      { t: '渾然不覺', hist: true, d: '呂布刺殺董卓，率張遼、高順、貂蟬出走自立；李傕繼位', run: (s, h, c) => {
        h.crown(c.fid, '李傕');
        h.kill('董卓', '呂布於長安宮門前刺殺董卓，百姓歌舞於道。');
        for (const n of ['呂布', '張遼', '高順', '貂蟬']) h.leave(n, '上黨');
        h.spawn('lu', '呂布', ['上黨', '濮陽', '河東', '晉陽'].filter(n => !h.owner(n)).slice(0, 1), ['張遼', '高順', '貂蟬']);
        h.kill('王允', null); h.set('lianhuan');
        return '董卓伏誅；呂布不容於李傕、郭汜，率部東走。';
      } },
      { t: '識破王允之計', d: '看董卓與李儒的謀：成功則王允伏誅、呂布忠誠 -10', p: (s, h) => R.clamp(Math.max(h.g('董卓').int, h.live('李儒') && h.on('李儒') === 'dong' ? h.g('李儒').int : 0) - 40, 10, 60),
        run: (s, h, c, r) => {
          if (r.win) { h.kill('王允', '王允事泄被殺。'); h.loyal('呂布', -10); h.set('lianhuan_fail'); return '李儒察覺奸謀，王允伏誅。'; }
          return STORY.find(e => e.id === 'lianhuan').choices[0].run(s, h, c);
        } },
      { t: '將貂蟬賜給呂布', d: '呂布忠誠 +30，德 -3（李儒之計）', run: (s, h) => { h.loyal('呂布', 30); h.stat('董卓', 'cha', -3); h.leave('貂蟬'); h.g('貂蟬').status = 'dead'; h.set('lianhuan_fail'); return '董卓忍痛割愛，呂布感激涕零。王允之計落空。'; } },
    ],
  },
  {
    id: 'lijue', ch: 1, src: 'z', title: '李傕郭汜亂長安', y: [192, 193],
    who: (s, h) => h.flag('lianhuan') && h.alive('dong') && h.on('賈詡') === 'dong' ? { fid: 'dong' } : null,
    lines: () => [['賈詡', '諸君若棄眾單行，一亭長便能縛君矣。不如率眾而西，攻長安為董公報仇。'], ['', '李傕、郭汜收合散兵十餘萬，反攻長安。']],
    choices: [
      { t: '縱兵劫掠長安', hist: true, d: '金 +700；長安民心 -30；各家關係 -10', run: (s, h) => { h.gold('dong', 700); h.order('長安', -30); for (const f of Object.values(s.factions)) if (f.alive && f.id !== 'dong') h.rel('dong', f.id, -10); return '西涼兵在長安大肆劫掠，關中人相食。'; } },
      { t: '安撫百姓', d: '長安民心 +15', run: (s, h) => { h.order('長安', 15); return '李傕約束部眾，長安稍安。'; } },
    ],
  },
  {
    id: 'zhanglu', ch: 1, src: 'z', title: '張魯據漢中', y: [191, 192],
    who: (s, h) => !h.owner('漢中') && h.free('張魯') ? { fid: null } : null,
    lines: () => [['', '五斗米道張魯襲殺漢中太守，據漢中，自號「師君」，以鬼道教民。']],
    choices: [{ t: '漢中自立', hist: true, run: (s, h) => { h.spawn('zl', '張魯', ['漢中'], ['閻圃']); return '張魯雄據漢中。'; } }],
  },

  // ===== 第二章 群雄逐鹿 =====
  {
    id: 'caosong', ch: 2, src: 'z', title: '曹嵩遇害', y: [193, 194],
    who: (s, h) => { const f = h.isRuler('曹操'), t = h.on('陶謙'); return f && t && f !== t ? { fid: f, also: [t] } : null; },
    lines: () => [['', '曹操之父曹嵩避難琅琊，途經徐州，被陶謙部將張闓所殺，財物盡被劫掠。'], ['曹操', '陶謙縱兵殺吾父，此仇不共戴天！']],
    choices: [
      { t: '起兵血洗徐州', hist: true, d: '與陶謙開戰、關係 -60；曹操德 -5；首城兵力 +2000', run: (s, h, c) => { const t = h.on('陶謙'); h.hostile(c.fid, t); h.rel(c.fid, t, -60); h.stat('曹操', 'cha', -5); const cc = R.citiesOf(s, c.fid)[0]; cc.troops = Math.min(R.troopCapOf(cc), cc.troops + 2000); h.set('caosong'); return '曹軍所過之處，雞犬不留，泗水為之不流。'; } },
      { t: '克制怒火，只究元兇', d: '與陶謙關係 -20；曹操德 +3', run: (s, h, c) => { h.rel(c.fid, h.on('陶謙'), -20); h.stat('曹操', 'cha', 3); return '曹操只追究張闓一人，天下稱其明理。'; } },
    ],
  },
  {
    id: 'taoqian', ch: 2, src: 'y', title: '陶謙三讓徐州', y: [194, 195],
    who: (s, h) => { const t = h.isRuler('陶謙'), l = h.isRuler('劉備'); return t && l && t !== s.player && (h.flag('caosong') || s.year >= 194) ? { fid: l, also: [t] } : null; },
    lines: () => [['陶謙', '老夫病已危篤，非劉公不能安徐州。'], ['劉備', '備何德何能，敢當此任？'], ['', '陶謙以手指心而死。徐州百姓擁擠府前哭拜：「劉使君若不領此郡，我等皆不能安生矣！」']],
    choices: [
      { t: '接掌徐州', hist: true, d: '獲得陶謙全部城池與部將（糜竺、陳登等）', run: (s, h, c) => {
        const t = h.on('陶謙'); const cs = R.citiesOf(s, t).map(x => x.name); const gs = R.gensOf(s, t).map(x => x.name).filter(n => n !== '陶謙');
        for (const n of gs) h.join(n, c.fid, null, 80);
        h.kill('陶謙', '陶謙病逝。');
        for (const n of cs) h.give(n, c.fid);
        if (h.alive(t)) { R.fac(s, t).alive = false; }
        const lb = h.g('劉備'); if (!lb.army && cs.length) lb.city = cityId(cs[0]);
        h.stat('劉備', 'cha', 2); h.set('xuzhou', c.fid);
        return '劉備領徐州牧，糜竺、陳登等皆歸心。';
      } },
      { t: '三辭不受', d: '劉備德 +4；陶謙勢力由他人繼承', run: (s, h, c) => { h.stat('劉備', 'cha', 4); h.rel(c.fid, h.on('陶謙'), 30); h.kill('陶謙', '陶謙病逝。'); return '劉備堅辭不受，仁德之名傳遍天下。'; } },
    ],
  },
  {
    id: 'lubu_yan', ch: 2, src: 'z', title: '呂布襲兗州', y: [194, 195],
    who: (s, h) => { const f = h.isRuler('曹操'); const t = f && ['濮陽', '譙', '許昌', '小沛'].find(n => h.owns(f, n) && h.C(n).id !== h.g('曹操').city); return t && h.live('呂布') && h.on('呂布') !== f && !(h.on('呂布') && !h.isRuler('呂布')) && (h.on('陳宮') === f || h.free('陳宮')) ? { fid: f, t, also: [h.on('呂布')].filter(Boolean) } : null; },
    lines: () => [['陳宮', '曹操殘暴，吾悔從之。呂布驍勇無敵，可迎之共據兗州。'], ['', '趁曹操東征徐州，陳宮、張邈迎呂布入濮陽，兗州郡縣紛紛響應。'], ['程昱', '唯鄄城、范、東阿三城尚在，臣願死守！']],
    choices: [
      { t: '回師與呂布決戰', hist: true, d: '失去濮陽，陳宮投呂布', run: (s, h, c) => {
        let lf = h.on('呂布');
        if (!lf) { const tc = h.C(c.t), rest = R.citiesOf(s, c.fid).filter(x => x.id !== tc.id); if (!rest.length) return '呂布兵少，未能得手。'; for (const x of R.gensIn(s, tc.id, c.fid)) x.city = rest[0].id; tc.owner = null; lf = h.spawn('lu', '呂布', [c.t], ['張遼', '高順', '陳宮']) ? 'lu' : null; if (!lf) h.C(c.t).owner = c.fid; }
        else h.give(c.t, lf);
        if (lf && h.alive(lf)) { h.join('陳宮', lf, c.t, 75); h.hostile(c.fid, lf); h.rel(c.fid, lf, -50); }
        h.set('lubu_yan'); return `呂布據${c.t}，曹操與之相持百餘日，蝗災四起，各自罷兵。`;
      } },
      { t: '提防陳宮', d: '需陳宮在麾下；看曹操的謀：成功則陳宮出走、濮陽保住', ok: (s, h, c) => h.on('陳宮') === c.fid,
        p: (s, h) => R.clamp(h.g('曹操').int - 30, 10, 70),
        run: (s, h, c, r) => { if (r.win) { h.leave('陳宮', '濮陽'); return '曹操察覺陳宮異心，陳宮連夜出逃。'; } return STORY.find(e => e.id === 'lubu_yan').choices[0].run(s, h, c); } },
    ],
  },
  {
    id: 'sunce', ch: 2, src: 'b', title: '孫策平江東', y: [194, 197],
    who: (s, h) => h.isRuler('孫策') ? { fid: h.isRuler('孫策') } : null,
    lines: (s, h) => [['孫策', '父仇未報，基業未立，策日夜思之。'], ...(h.flag('yuxi') && h.flag('yuxi') === h.isRuler('孫策') ? [['朱治', '主公何不以玉璽為質，向袁術借兵？']] : []), ['', '孫策渡江，所向披靡，江東百姓呼為「孫郎」。']],
    choices: [
      { t: '渡江平定江東', hist: true, d: '取得中立的秣陵、吳、會稽；周瑜、太史慈有機會來投（神亭單挑）',
        duel: (s, h) => h.free('太史慈') ? [h.g('孫策'), h.g('太史慈')] : null,
        run: (s, h, c, r) => {
          const out = [];
          if (h.flag('yuxi') === c.fid && h.alive('yuanh')) { h.set('yuxi', 'yuanh'); h.rel(c.fid, 'yuanh', 20); const cc = R.citiesOf(s, c.fid)[0]; cc.troops = Math.min(R.troopCapOf(cc), cc.troops + 3000); out.push('以玉璽向袁術借兵三千'); }
          for (const n of ['秣陵', '吳', '會稽']) if (!h.owner(n)) { h.C(n).owner = c.fid; h.C(n).troops = Math.round(h.C(n).troops * 0.6); out.push(`取${n}`); }
          if (h.free('周瑜')) { h.join('周瑜', c.fid, null, 95); out.push('周瑜率兵來迎'); }
          if (r.win === true) { h.join('太史慈', c.fid, null, 85); out.push('神亭酣戰收服太史慈'); }
          for (const n of ['張昭', '張紘', '蔣欽', '周泰']) if (h.free(n)) { h.join(n, c.fid, null, 80); out.push(`${n}來投`); }
          h.set('jiangdong', c.fid);
          return out.join('，') + '。';
        } },
      { t: '暫守根本', d: '什麼都不會發生', run: () => '孫策按兵不動。' },
    ],
  },
  {
    id: 'xuzhou_lost', ch: 2, src: 'b', title: '張飛失徐州', y: [195, 197],
    who: (s, h) => { const l = h.isRuler('劉備'), b = h.isRuler('呂布'); return l && b && l !== b && h.owns(l, '下邳') && h.on('張飛') === l && h.near(b, '下邳') ? { fid: l, also: [b] } : null; },
    lines: () => [['', '劉備出兵拒袁術，留張飛守下邳。'], ['張飛', '今日盡醉，明日起各自戒酒！'], ['', '張飛醉後鞭打曹豹，曹豹連夜開城迎呂布。']],
    choices: [
      { t: '留張飛守城', hist: true, d: '多半失去下邳給呂布', p: () => 25,
        run: (s, h, c, r) => { if (r.win) return '張飛滴酒不沾，呂布無隙可乘。'; const b = h.isRuler('呂布'); h.give('下邳', b); h.loyal('張飛', -5); return '呂布趁夜襲取下邳，張飛殺出重圍，劉備只得轉投小沛。'; } },
      { t: '改派陳登鎮守', d: '需陳登在麾下；下邳安然無事', ok: (s, h, c) => h.on('陳登') === c.fid, run: () => '陳登治軍嚴整，呂布不敢妄動。' },
    ],
  },
  {
    id: 'yuanmen', ch: 2, src: 'b', title: '轅門射戟', y: [196, 197],
    who: (s, h) => { const b = h.isRuler('呂布'), l = h.isRuler('劉備'), y = h.isRuler('袁術'); return b && l && y && new Set([b, l, y]).size === 3 && h.war(l, y) ? { fid: b, also: [l, y] } : null; },
    lines: () => [['', '袁術遣紀靈率三萬兵攻劉備。呂布請雙方入營，在轅門外插下方天畫戟。'], ['呂布', '我一箭射中戟上小枝，兩家便各自罷兵；射不中，任你們廝殺！'], ['', '弓開如秋月行天，箭去似流星落地，正中畫戟小枝。']],
    choices: [
      { t: '射戟調解', hist: true, d: '看呂布的勇：成功則劉備與袁術停戰一年，呂布與兩家關係 +15', p: (s, h) => R.clamp(h.g('呂布').str - 10, 20, 95),
        run: (s, h, c, r) => { const [l, y] = c.also; if (r.win) { h.truce(l, y, 12); h.rel(c.fid, l, 15); h.rel(c.fid, y, 15); return '一箭正中，眾皆喝采，兩家罷兵。'; } h.rel(c.fid, y, -10); return '箭偏寸許，紀靈冷笑而去。'; } },
      { t: '坐山觀虎鬥', d: '什麼都不會發生', run: () => '呂布作壁上觀。' },
    ],
  },
  {
    id: 'tianzi', ch: 2, src: 'z', title: '挾天子以令諸侯', y: [195, 198],
    who: (s, h) => {
      if (!(h.flag('lianhuan') || s.year >= 196) || (s.emperor && s.emperor !== 'dong')) return null;
      const near = ['洛陽', '許昌', '陳留', '弘農', '宛', '虎牢關'];
      const cands = Object.values(s.factions).filter(f => f.alive && f.id !== s.emperor && !h.flag('tianzi_no_' + f.id) && near.some(n => h.owns(f.id, n)));
      if (!cands.length) return null;
      const f = cands.find(x => x.id === s.player) || cands.find(x => x.ruler === h.g('曹操').id) || cands[0];
      return { fid: f.id, also: [s.emperor] };
    },
    lines: (s, h, c) => [['', '天子在李傕、郭汜挾持下顛沛流離，終於逃回殘破的洛陽，百官披荊棘、依牆壁而居。'], [h.on('荀彧') === c.fid ? '荀彧' : '', '昔晉文公納周襄王而諸侯景從，今奉天子以從眾望，大順也。']],
    choices: [
      { t: '迎奉天子', hist: true, d: '天子歸你，軍令 +1；許昌若為中立則取得許昌；金 +300', run: (s, h, c) => { s.emperor = c.fid; h.gold(c.fid, 300); if (!h.owner('許昌')) { h.C('許昌').owner = c.fid; h.C('許昌').troops = Math.max(h.C('許昌').troops, 3000); } h.set('tianzi', c.fid); return `${h.nm(c.fid)}迎天子都許，從此挾天子以令諸侯。`; } },
      { t: '置之不理', d: '天子留在原處，別人仍可迎奉', again: true, run: (s, h, c) => { h.set('tianzi_no_' + c.fid); return '天子依舊流離。'; } },
    ],
  },
  {
    id: 'wancheng', ch: 2, src: 'b', title: '宛城之戰', y: [197, 198],
    who: (s, h) => { const f = h.isRuler('曹操'); return f && h.on('典韋') === f && h.live('張繡') && h.on('張繡') !== f && !h.isRuler('張繡') ? { fid: f, also: [h.on('張繡')].filter(Boolean) } : null; },
    lines: () => [['', '張繡舉宛城投降曹操。曹操納張濟遺孀鄒氏，張繡深以為恥。'], ['賈詡', '曹操驕而無備，今夜可襲之。'], ['', '典韋獨守寨門，身被數十創，挾兩賊而死，至死不倒。']],
    choices: [
      { t: '夜宿宛城（史實）', hist: true, d: '典韋、曹昂戰死；首城兵力 -3000；與張繡所屬勢力關係 -30', run: (s, h, c) => {
        h.kill('典韋', '典韋於宛城死戰而亡，曹操痛哭：「吾折長子、愛姪，俱無深痛；獨號泣典韋也。」'); h.kill('曹昂', '曹昂讓馬給曹操，死於亂軍之中。');
        const cc = R.citiesOf(s, c.fid)[0]; cc.troops = Math.max(0, cc.troops - 3000);
        const z = h.on('張繡'); if (z) h.rel(c.fid, z, -30);
        return '曹操僅以身免。';
      } },
      { t: '嚴守軍紀', d: '典韋無恙；在野的張繡、賈詡可能歸降', run: (s, h, c) => {
        const out = []; for (const n of ['張繡', '賈詡']) if (h.free(n)) { h.join(n, c.fid, null, 65); out.push(n); }
        return out.length ? `${out.join('、')}誠心歸附。` : '曹軍秋毫無犯，宛城平安。';
      } },
    ],
  },
  {
    id: 'yuanshu_emp', ch: 2, src: 'b', title: '袁術稱帝', y: [197, 198],
    who: (s, h) => { const f = h.isRuler('袁術'); return f && (h.flag('yuxi') === f || h.ncity(f) >= 4) ? { fid: f } : null; },
    lines: () => [['袁術', '今漢室衰微，海內鼎沸。吾家四世公輔，百姓所歸，吾欲應天順人，正位九五。'], ['閻象', '昔周文王三分天下有其二，猶服事殷。明公雖奕世克昌，未若有周之盛。']],
    choices: [
      { t: '登基稱帝', hist: true, d: '金 +600；天下諸侯關係 -40，並組成討袁術聯軍', run: (s, h, c) => { h.gold(c.fid, 600); for (const f of Object.values(s.factions)) if (f.alive && f.id !== c.fid) { h.rel(c.fid, f.id, -40); h.hostile(c.fid, f.id); } if (!s.coalition) R.formCoalition(s, c.fid, 12, '討袁術聯軍'); h.set('yuanshu_emp'); return '袁術於壽春稱帝，國號仲氏。天下共棄之。'; } },
      { t: '聽閻象之諫', d: '袁術德 +3', run: (s, h) => { h.stat('袁術', 'cha', 3); return '袁術暫息稱帝之念。'; } },
    ],
  },
  {
    id: 'baimen', ch: 2, src: 'b', title: '白門樓', captive: '呂布', from: 195,
    lines: (s, h) => [['', '呂布被困下邳，部將侯成盜赤兔馬出降，宋憲、魏續趁其睡熟將他綑綁。'], ['呂布', '縛太急，乞緩之！明公所患不過於布，今已服矣。公為大將，布副之，天下不難定也。'], ['劉備', '公不見丁建陽、董卓之事乎？']],
    choices: [
      { t: '縊殺呂布', hist: true, d: '呂布、陳宮就死；張遼、高順若被俘則張遼歸降', run: (s, h, c) => {
        h.kill('呂布', '呂布於白門樓被縊殺。');
        const out = ['一代飛將殞命白門樓'];
        if (h.g('陳宮').status === 'captive' && h.g('陳宮').captor === c.fid) { h.kill('陳宮', '陳宮從容赴死。'); out.push('陳宮不降，從容赴死'); }
        if (h.g('張遼').status === 'captive' && h.g('張遼').captor === c.fid) { h.join('張遼', c.fid, null, 85); out.push('張遼歸降'); }
        return out.join('；') + '。';
      } },
      { t: '收為部將', d: '呂布加入，但忠誠極低、德高者也難駕馭', run: (s, h, c) => { h.join('呂布', c.fid, null, 0); h.g('呂布').loyalty = 35; return '呂布叩首稱謝。只是不知此人能忠心幾時？'; } },
    ],
  },
  {
    id: 'zhujiu', ch: 2, src: 'y', title: '煮酒論英雄', y: [198, 200],
    who: (s, h) => { const c = h.isRuler('曹操'), l = h.isRuler('劉備'); return c && l && c !== l && R.atPeace(s, c, l) ? { fid: s.player === l ? l : c, also: [c, l] } : null; },
    lines: () => [['', '青梅煮酒，曹操邀劉備小亭對飲，縱論天下英雄。'], ['曹操', '今天下英雄，惟使君與操耳！'], ['', '劉備聞言，手中匙箸不覺落地。恰值天雷大作。'], ['劉備', '一震之威，乃至於此。']],
    choices: [
      { t: '以聞雷掩飾', hist: true, d: '曹操不再起疑；兩家停戰延長 6 個月', ok: (s, h, c) => c.fid === h.isRuler('劉備'), run: (s, h, c) => { h.truce(c.also[0], c.also[1], 6); return '曹操大笑：「丈夫亦畏雷乎？」遂不疑劉備。'; } },
      { t: '坦言胸中大志', d: '與曹操關係 -30', ok: (s, h, c) => c.fid === h.isRuler('劉備'), run: (s, h, c) => { h.rel(c.also[0], c.also[1], -30); return '曹操面色一沉，暗生忌憚。'; } },
      { t: '放任劉備', hist: true, d: '劉備日後離去；兩家關係 -10', ok: (s, h, c) => c.fid === h.isRuler('曹操'), run: (s, h, c) => { h.rel(c.also[0], c.also[1], -10); return '曹操一笑置之。'; } },
      { t: '趁機除之', d: '看曹操的謀：成功則劉備遇刺身亡；失敗則兩家反目', ok: (s, h, c) => c.fid === h.isRuler('曹操'), p: () => 25,
        run: (s, h, c, r) => { const [a, b] = c.also; if (r.win) { h.kill('劉備', '劉備於許都遇刺身亡。'); return '刀斧手一擁而上。'; } h.hostile(a, b); h.rel(a, b, -50); return '劉備察覺有異，連夜逃出許都。'; } },
    ],
  },
  {
    id: 'yidai', ch: 2, src: 'b', title: '衣帶詔', y: [199, 200],
    who: (s, h) => { const e = s.emperor; return e && h.isRuler('曹操') === e ? { fid: e, also: [h.isRuler('劉備')].filter(Boolean) } : null; },
    lines: () => [['', '天子不堪曹操專橫，以血書詔藏於玉帶之中，密賜車騎將軍董承。'], ['', '董承聯絡劉備、王子服、馬騰等人共謀誅曹，事泄。']],
    choices: [
      { t: '誅殺董承一黨', hist: true, d: '曹操德 -3；與劉備開戰、關係 -40', run: (s, h, c) => { h.stat('曹操', 'cha', -3); const l = h.isRuler('劉備'); if (l) { h.hostile(c.fid, l); h.rel(c.fid, l, -40); } return '董承等七百餘人被誅，董貴妃亦被縊死。'; } },
      { t: '寬恕不究', d: '曹操德 +3', run: (s, h) => { h.stat('曹操', 'cha', 3); return '曹操焚其詔書，一概不問，朝野嘆服。'; } },
    ],
  },
  {
    id: 'yijing', ch: 2, src: 'z', title: '易京之戰', y: [198, 200],
    who: (s, h) => { const g = h.isRuler('公孫瓚'), y = h.isRuler('袁紹'); return g && y && g !== s.player && h.war(g, y) && h.ncity(g) <= 2 ? { fid: y, also: [g] } : null; },
    lines: () => [['', '袁紹圍易京，掘地道直通樓下，焚燒木柱，高樓崩塌。'], ['公孫瓚', '吾昔驅叛胡於塞表，今日竟至於此！'], ['', '公孫瓚盡殺妻子，引火自焚。']],
    choices: [{ t: '攻破易京', hist: true, d: '公孫瓚自焚，幽州歸袁紹', run: (s, h, c) => { const g = h.isRuler('公孫瓚'); const cs = R.citiesOf(s, g).map(x => x.name); h.kill('公孫續', null); h.kill('公孫瓚', '公孫瓚於易京自焚而死。'); for (const n of cs) if (h.owner(n) === g || !h.alive(g)) h.give(n, c.fid); return '袁紹盡有河北四州之地。'; } }],
  },

  // ===== 第三章 官渡與赤壁 =====
  {
    id: 'tushan', ch: 3, src: 'y', title: '土山約三事', captive: '關羽', from: 196,
    lines: () => [['張遼', '兄今若死，有三罪：負桃園之誓、棄二嫂之託、捨匡扶漢室之志。'], ['關羽', '吾有三約：一降漢不降曹；二善待二嫂；三但知劉皇叔去向，不管千里萬里便當辭去。'], ['曹操', '吾為漢相，漢即吾也。此三事，吾皆從之。']],
    choices: [
      { t: '允其三事', hist: true, d: '關羽暫時加入；日後得知劉備下落即辭去', ok: (s, h) => !!h.live('劉備'), run: (s, h, c) => { h.join('關羽', c.fid, null, 60); h.set('guanyu_cao', c.fid); return '關羽暫歸，曹操三日一小宴，五日一大宴，又贈赤兔馬。'; } },
      { t: '勸其真心歸順', d: '看君主的德：成功則關羽死心塌地；失敗則釋放', p: (s, h, c) => R.clamp(h.ruler(c.fid).cha - 70, 3, 30),
        run: (s, h, c, r) => { if (r.win) { h.join('關羽', c.fid, null, 80); return '關羽感念厚恩，願意效力。'; } h.leave('關羽'); return '關羽寧死不從，只好放他離去。'; } },
    ],
  },
  {
    id: 'baima', ch: 3, src: 'b', title: '白馬斬顏良', y: [199, 201],
    who: (s, h) => { const f = h.flag('guanyu_cao'); return f && h.on('關羽') === f && h.on('顏良') && h.war(f, h.on('顏良')) ? { fid: f, also: [h.on('顏良')] } : null; },
    lines: () => [['', '顏良圍白馬，連斬宋憲、魏續，曹軍諸將莫敢當。'], ['關羽', '吾觀顏良，如插標賣首耳！'], ['', '關羽奮然上馬，倒提青龍刀，直衝顏良麾蓋。']],
    choices: [
      { t: '請關羽出戰', hist: true, d: '關羽單挑顏良：勝則顏良陣亡；之後關羽可能辭去', duel: (s, h) => [h.g('關羽'), h.g('顏良')],
        run: (s, h, c, r) => { if (r.win) { h.kill('顏良', '顏良被關羽一刀斬於馬下。'); if (h.on('文醜')) { const d = autoDuel(s, h.g('關羽'), h.g('文醜')); if (d.winner === 'a') h.kill('文醜', '文醜追擊至延津，亦被關羽所斬。'); } h.set('baima'); return '萬軍之中取上將首級，如探囊取物。'; } h.set('baima'); return '關羽與顏良戰了數十合，不分勝負。'; } },
      { t: '不用關羽', d: '關羽未立功便不會離去', run: () => '曹操另遣張遼、徐晃迎戰。' },
    ],
  },
  {
    id: 'qianli', ch: 3, src: 'y', title: '千里走單騎', y: [200, 202],
    who: (s, h) => { const f = h.flag('guanyu_cao'), l = h.isRuler('劉備'); return f && h.flag('baima') && h.on('關羽') === f && l && l !== f ? { fid: s.player === l ? l : f, also: [f, l] } : null; },
    lines: () => [['關羽', '新恩雖厚，舊義難忘。'], ['', '關羽封金掛印，留書辭曹，護送二嫂千里尋兄。'], ['', '東嶺關、洛陽、汜水關、滎陽、黃河渡口，五關六將攔路。']],
    choices: [
      { t: '放關羽離去', hist: true, d: '關羽歸劉備；曹操德 +3', ok: (s, h, c) => c.fid === c.also[0], run: (s, h, c) => { h.stat('曹操', 'cha', 3); return STORY.find(e => e.id === 'qianli').go(s, h, c); } },
      { t: '派兵攔截', d: '關羽連闖五關（連續單挑）：闖過則歸劉備；失敗則被擒回、忠誠低落', ok: (s, h, c) => c.fid === c.also[0],
        run: (s, h, c) => { const foes = R.gensOf(s, c.fid).filter(x => x.name !== '關羽' && x.id !== R.fac(s, c.fid).ruler).sort((a, b) => b.str - a.str).slice(2, 7); for (const f of foes) { const d = autoDuel(s, h.g('關羽'), f); if (d.winner !== 'a') { h.loyal('關羽', -20); return `關羽在${f.name}把守的關口被擒回。`; } } return `關羽連斬攔路諸將，${STORY.find(e => e.id === 'qianli').go(s, h, c)}`; } },
      { t: '迎接二弟', hist: true, d: '關羽歸來', ok: (s, h, c) => c.fid === c.also[1], run: (s, h, c) => STORY.find(e => e.id === 'qianli').go(s, h, c) },
    ],
    go(s, h, c) {
      const l = c.also[1];
      h.join('關羽', l, null, 100); h.set('guanyu_cao', null);
      const out = ['古城相會，兄弟重聚'];
      if (h.on('張飛') === l) h.loyal('張飛', 20);
      for (const n of ['周倉', '關平']) if (h.free(n)) { h.g(n).lock = 0; h.join(n, l, null, 95); out.push(`${n}追隨`); }
      if (h.flag('zhaoyun') && h.free('趙雲')) { h.join('趙雲', l, null, 100); out.push('趙雲依約來投'); }
      return out.join('，') + '。';
    },
  },
  {
    id: 'xuyou', ch: 3, src: 'b', title: '許攸夜奔', y: [200, 201],
    who: (s, h) => { const y = h.isRuler('袁紹'), c = h.isRuler('曹操'); return y && c && h.war(y, c) && h.on('許攸') === y && (h.near(y, '陳留') || h.near(y, '濮陽') || h.near(y, '許昌') || s.month >= 6) ? { fid: y, also: [c] } : null; },
    lines: () => [['許攸', '曹操屯軍官渡，許都空虛。若分輕騎星夜掩襲許昌，曹操可擒也。'], ['審配', '許攸家人在冀州貪贓，已被收押。'], ['袁紹', '汝與曹操有舊，莫非替他作說客？']],
    choices: [
      { t: '不用許攸之計', hist: true, d: '許攸投奔曹操，帶去烏巢屯糧的情報', run: (s, h, c) => { h.join('許攸', c.also[0], null, 60); h.set('xuyou'); return '許攸連夜投奔曹營，曹操跣足出迎：「子遠來，吾事濟矣！」'; } },
      { t: '採納許攸之計', d: '曹操各城兵力 -15%，許攸忠誠 +20', run: (s, h, c) => { h.capTroops(c.also[0], 0.85); h.loyal('許攸', 20); return '袁軍輕騎奔襲許都，曹操首尾難顧。'; } },
    ],
  },
  {
    id: 'wuchao', ch: 3, src: 'b', title: '火燒烏巢', y: [200, 201],
    who: (s, h) => { const c = h.isRuler('曹操'), y = h.isRuler('袁紹'); return h.flag('xuyou') && c && y && h.war(c, y) ? { fid: c, also: [y] } : null; },
    lines: () => [['', '曹操親率五千步騎，打著袁軍旗號，夜襲烏巢。'], ['', '淳于瓊大醉未醒，萬車糧草盡化灰燼。'], ['郭圖', '張郃、高覽聞曹軍得勝，心懷喜悅。']],
    choices: [
      { t: '親率輕騎襲烏巢', hist: true, d: '袁紹糧草 -70%、各城兵力 -25%；張郃、高覽投曹；田豐被殺', run: (s, h, c) => {
        const y = c.also[0]; h.food(y, -Math.round(R.fac(s, y).food * 0.7)); h.capTroops(y, 0.75);
        for (const n of ['張郃', '高覽']) if (h.on(n) === y) h.join(n, c.fid, null, 70);
        if (h.on('田豐') === y) h.kill('田豐', '袁紹羞見田豐，將他賜死獄中。');
        h.set('guandu'); return '袁軍大潰，袁紹僅率八百騎渡河北逃。官渡一戰，北方大勢已定。';
      } },
      { t: '疑許攸有詐', d: '什麼都不會發生', run: () => '曹操按兵不動，錯失良機。' },
    ],
  },
  {
    id: 'xiaobawang', ch: 3, src: 'z', title: '小霸王之死', y: [200, 201],
    who: (s, h) => { const f = h.isRuler('孫策'); return f && h.on('孫權') === f ? { fid: f } : null; },
    lines: () => [['', '孫策好單騎出獵，於丹徒山中遭許貢門客伏擊，箭中面頰。'], ['孫策', '舉江東之眾，決機於兩陣之間，與天下爭衡，卿不如我；舉賢任能，各盡其力以保江東，我不如卿。'], ['孫權', '兄長……']],
    choices: [
      { t: '照常出獵', hist: true, d: '孫策傷重身亡，孫權繼位', run: (s, h, c) => { h.crown(c.fid, '孫權'); h.kill('孫策', '孫策傷重身亡，年僅二十六。'); return '「內事不決問張昭，外事不決問周瑜。」孫權繼位。'; } },
      { t: '聽虞翻勸諫，帶足護衛', d: '孫策平安', run: () => '刺客見護衛嚴密，不敢動手。' },
    ],
  },
  {
    id: 'yuanshao_d', ch: 3, src: 'z', title: '袁氏兄弟相爭', y: [201, 203],
    who: (s, h) => { const y = h.isRuler('袁紹'); return y && h.flag('guandu') && h.on('袁尚') === y && h.on('袁譚') === y ? { fid: y } : null; },
    lines: () => [['', '官渡兵敗後，袁紹憂憤成疾，嘔血而亡。'], ['審配', '主公生前屬意三公子袁尚。'], ['郭圖', '長子袁譚當立！']],
    choices: [
      { t: '立袁尚為嗣', hist: true, d: '袁尚繼位；袁譚帶走南皮等城自立', run: (s, h, c) => { h.crown(c.fid, '袁尚'); h.kill('袁紹', '袁紹嘔血而亡，袁尚繼位。'); const cs = R.citiesOf(s, c.fid).filter(x => x.kind === 'city' && x.name !== '鄴'); if (cs.length) h.spawn('tan', '袁譚', cs.slice(0, Math.ceil(cs.length / 2)).map(x => x.name), ['郭圖'], true); if (h.alive('tan')) { h.hostile(c.fid, 'tan'); h.rel(c.fid, 'tan', -50); } return '兄弟反目，河北一分為二。'; } },
      { t: '召二子共治', d: '看君主的德：成功則不分裂', p: (s, h) => R.clamp(h.g('袁紹').cha - 40, 10, 60),
        run: (s, h, c, r) => { if (r.win) { h.kill('袁紹', '袁紹病逝。'); return '袁氏兄弟暫且和睦。'; } return STORY.find(e => e.id === 'yuanshao_d').choices[0].run(s, h, c); } },
    ],
  },
  {
    id: 'guojia', ch: 3, src: 'b', title: '郭嘉遺計定遼東', y: [206, 208],
    who: (s, h) => { const f = h.on('郭嘉'); return f && h.isRuler('曹操') === f ? { fid: f } : null; },
    lines: () => [['', '曹操北征烏桓，郭嘉水土不服，病重不起。'], ['郭嘉', '袁氏兄弟若投遼東，明公只需按兵不動，公孫康必斬二袁之首來獻。'], ['曹操', '哀哉奉孝！痛哉奉孝！惜哉奉孝！']],
    choices: [{ t: '依計行事', hist: true, d: '郭嘉病逝；袁尚、袁譚若勢窮（兩城以下）則被斬', run: (s, h, c) => { h.kill('郭嘉', '郭嘉病逝，年三十八。'); const out = ['郭嘉病逝']; for (const n of ['袁尚', '袁譚']) { const f = h.isRuler(n); if (f && f !== s.player && h.ncity(f) <= 2) { h.kill(n, `${n}逃往遼東，被公孫康所斬。`); out.push(`${n}首級送到`); } } return out.join('，') + '。'; } }],
  },
  {
    id: 'tanxi', ch: 3, src: 'y', title: '躍馬過檀溪', y: [201, 207],
    who: (s, h) => { const l = h.isRuler('劉備'), b = h.isRuler('劉表'); return l && b && l !== b && R.atPeace(s, l, b) && h.on('蔡瑁') === b ? { fid: l, also: [b] } : null; },
    lines: () => [['', '蔡瑁設宴襄陽，暗伏刀斧手欲害劉備。伊籍密告，劉備從西門逃走，前有檀溪攔路。'], ['劉備', '的盧，的盧！今日妨吾！'], ['', '那馬忽從水中湧身而起，一躍三丈，飛上西岸。'], ['', '劉備迷途中遇水鏡先生司馬徽：「臥龍、鳳雛，兩人得一，可安天下。」']],
    choices: [
      { t: '隱忍不發', hist: true, d: '劉備得知臥龍、鳳雛之名', run: (s, h) => { h.set('wolong'); return '劉備心中記下「臥龍、鳳雛」四字。'; } },
      { t: '向劉表揭發蔡瑁', d: '與劉表關係 -15；蔡瑁忠誠 -20；仍得知臥龍之名', run: (s, h, c) => { h.rel(c.fid, c.also[0], -15); h.loyal('蔡瑁', -20); h.set('wolong'); return '劉表半信半疑，蔡瑁懷恨在心。'; } },
    ],
  },
  {
    id: 'xushu', ch: 3, src: 'y', title: '徐庶走馬薦諸葛', y: [205, 208],
    who: (s, h) => { const l = h.isRuler('劉備'), c = h.isRuler('曹操'); return l && c && l !== c && h.on('徐庶') === l ? { fid: l, also: [c] } : null; },
    lines: () => [['程昱', '徐庶至孝，若得其母手書，必來相投。'], ['徐庶', '老母被曹操所囚，庶方寸已亂，不得不去。'], ['徐庶', '此間有一奇士，隆中諸葛孔明，號臥龍先生。使君宜親往求之。']],
    choices: [
      { t: '忍痛送別徐庶', hist: true, d: '徐庶投曹（終身不設一謀：謀 -20）；得知諸葛亮所在', run: (s, h, c) => { h.join('徐庶', c.also[0], null, 30); h.stat('徐庶', 'int', -20); h.set('wolong'); h.set('xushu'); return '劉備送徐庶出城，命人砍倒樹林：「恨其阻吾望元直也。」'; } },
      { t: '設法救出徐母', d: '金 -300；看我方最高謀：成功則徐庶留下', ok: (s, h, c) => R.fac(s, c.fid).gold >= 300,
        p: (s, h, c) => R.clamp(Math.max(...R.gensOf(s, c.fid).map(x => x.int)) - 30, 10, 70),
        run: (s, h, c, r) => { h.gold(c.fid, -300); h.set('wolong'); if (r.win) { h.loyal('徐庶', 25); return '密使救出徐母，徐庶感激涕零，並薦諸葛亮。'; } return STORY.find(e => e.id === 'xushu').choices[0].run(s, h, c); } },
    ],
  },
  {
    id: 'sangu', ch: 3, src: 'b', title: '三顧茅廬', y: [206, 209],
    who: (s, h) => { const l = h.isRuler('劉備'); return l && h.free('諸葛亮') && (h.flag('wolong') || s.year >= 207) ? { fid: l } : null; },
    lines: () => [['', '劉備冒風雪三訪隆中。一顧不遇，二顧又不遇，三顧時孔明晝寢未醒，劉備拱立階下。'], ['諸葛亮', '大夢誰先覺？平生我自知。草堂春睡足，窗外日遲遲。'], ['諸葛亮', '將軍欲成霸業，北讓曹操佔天時，南讓孫權佔地利，將軍可佔人和。先取荊州為家，後取西川建基業，以成鼎足之勢。'], ['劉備', '孤之有孔明，猶魚之有水也。']],
    choices: [
      { t: '三顧茅廬，以誠相待', hist: true, d: '諸葛亮加入（忠誠 100）；劉備德 +2', run: (s, h, c) => { h.g('諸葛亮').lock = 0; h.join('諸葛亮', c.fid, null, 100); h.stat('劉備', 'cha', 2); h.set('sangu'); return '臥龍出山，隆中一對，天下三分。'; } },
      { t: '遣使召來', d: '成功率極低', p: () => 8, run: (s, h, c, r) => { if (r.win) { h.g('諸葛亮').lock = 0; h.join('諸葛亮', c.fid, null, 70); return '諸葛亮竟應召而來。'; } return '使者空手而回：「先生雲遊未歸。」'; } },
    ],
  },
  {
    id: 'ganning', ch: 3, src: 'z', title: '甘寧歸吳・孫權破黃祖', y: [203, 208],
    who: (s, h) => { const f = h.isRuler('孫權'), b = h.on('黃祖'); return f && b && f !== b && h.near(f, '江夏') && h.owns(b, '江夏') ? { fid: f, also: [b] } : null; },
    lines: () => [['甘寧', '黃祖年老昏聵，不足為慮。破黃祖，則可西據楚關，漸規巴蜀。'], ['', '孫權大舉西征，甘寧為先鋒，破黃祖蒙衝，斬黃祖於江夏。']],
    choices: [
      { t: '西征江夏', hist: true, d: '黃祖被斬，奪取江夏；在野的甘寧加入', run: (s, h, c) => { if (h.free('甘寧')) h.join('甘寧', c.fid, null, 80); const b = c.also[0]; h.kill('黃祖', '黃祖兵敗被斬。'); h.hostile(c.fid, b); h.give('江夏', c.fid); h.C('江夏').troops = Math.round(h.C('江夏').troops * 0.5); return '孫權報了殺父之仇，江夏歸吳。'; } },
      { t: '暫緩用兵', d: '什麼都不會發生', run: () => '孫權按兵不動。' },
    ],
  },
  {
    id: 'liubiao', ch: 3, src: 'z', title: '劉表病逝・劉琮降曹', y: [207, 209],
    who: (s, h) => { const b = h.isRuler('劉表'); if (!b || s.year < 208) return null; const c = h.isRuler('曹操'); return { fid: b, also: [c && c !== b ? c : null] }; },
    lines: () => [['', '曹操親率大軍南下，劉表憂懼成疾，背疽發作而死。'], ['蔡瑁', '曹公奉天子之命，兵臨城下，不如舉州歸降。'], ['劉琦', '父親基業，豈可拱手讓人！']],
    choices: [
      { t: '立劉琮並舉州降曹', hist: true, d: '電腦專用：荊州城池與將領歸曹操；劉琦保江夏', ok: (s, h, c) => c.fid !== s.player && c.also[0] && R.power(s, c.also[0]) > R.power(s, c.fid) && Object.keys(ADJ).some(id => R.city(s, +id).owner === c.also[0] && ADJ[id].some(n => R.city(s, n).owner === c.fid)), run: (s, h, c) => {
        const cao = c.also[0]; h.crown(c.fid, '劉琦'); h.kill('劉表', '劉表病逝。');
        const keep = h.owns(c.fid, '江夏') ? '江夏' : null;
        for (const x of R.citiesOf(s, c.fid).filter(x => x.name !== keep)) h.give(x.name, cao);
        for (const n of ['蔡瑁', '張允', '蒯越', '蒯良', '文聘', '劉琮', '王粲']) if (h.on(n) === c.fid || h.free(n)) h.join(n, cao, '襄陽', 70);
        h.set('jingzhou_cao', cao); return '劉琮出降，曹操不費一兵一卒得荊州水軍八萬。';
      } },
      { t: '立劉琦，死守荊州', d: '劉表病逝，劉琦繼位；蔡瑁忠誠 -30', run: (s, h, c) => { h.crown(c.fid, '劉琦'); h.kill('劉表', '劉表病逝。'); h.loyal('蔡瑁', -30); h.loyal('張允', -20); return '劉琦繼位，誓守荊襄。'; } },
      { t: '立劉琮，死守荊州', d: '劉表病逝，劉琮繼位', run: (s, h, c) => { h.crown(c.fid, '劉琮'); h.kill('劉表', '劉表病逝。'); return '劉琮繼位，蔡瑁掌兵。'; } },
    ],
  },
  {
    id: 'changban', ch: 3, src: 'b', title: '長坂坡', y: [208, 209],
    who: (s, h) => { const l = h.isRuler('劉備'), c = h.isRuler('曹操'); return l && c && h.flag('jingzhou_cao') === c && h.on('趙雲') === l && ['江陵', '江夏', '襄陽', '上庸', '武陵', '長沙', '宛'].some(n => h.near(l, n)) && h.war(l, c) ? { fid: l, also: [c] } : null; },
    lines: (s, h) => [['', '劉備攜民渡江，日行十餘里，被曹操五千虎豹騎追及於當陽長坂。'], ['趙雲', '主母與小主人失散，雲誓死尋回！'], ['', '趙雲懷抱阿斗，於曹軍陣中七進七出，砍倒大旗兩面，奪槊三條，殺曹營名將五十餘員。'], ['張飛', '燕人張翼德在此！誰敢與我決一死戰？']],
    choices: [
      { t: '趙雲殺回救主', hist: true, d: '趙雲單挑曹軍大將：勝則救出阿斗、趙雲張飛揚名；敗則劉禪下落不明',
        duel: (s, h, c) => { const foe = R.gensOf(s, c.also[0]).filter(x => x.id !== R.fac(s, c.also[0]).ruler).sort((a, b) => b.str - a.str)[0]; return foe ? [h.g('趙雲'), foe] : null; },
        run: (s, h, c, r) => { h.capTroops(c.fid, 0.85); if (r.win !== false) { h.loyal('趙雲', 30); h.stat('趙雲', 'cha', 3); if (h.on('張飛') === c.fid) h.stat('張飛', 'cha', 2); h.set('adou'); return '趙雲懷抱阿斗殺出重圍；張飛據水斷橋，一聲大喝，嚇退曹軍。'; } const ad = h.g('劉禪'); if (ad && ad.status === 'unborn') ad.home = null; return '趙雲負傷而回，阿斗下落不明。'; } },
      { t: '棄民輕騎疾走', d: '兵力損失較少，但劉備德 -6', run: (s, h, c) => { h.capTroops(c.fid, 0.95); h.stat('劉備', 'cha', -6); return '劉備棄百姓而走，荊州人心離散。'; } },
    ],
  },
  {
    id: 'shezhan', ch: 3, src: 'y', title: '舌戰群儒・孫劉結盟', y: [208, 209],
    who: (s, h) => { const w = h.isRuler('孫權') || (h.alive('sun') ? 'sun' : null), l = h.isRuler('劉備'), c = h.isRuler('曹操'); return w && l && c && new Set([w, l, c]).size === 3 && (h.flag('jingzhou_cao') === c || R.power(s, c) > 1.3 * (R.power(s, w) + R.power(s, l))) ? { fid: s.player === l ? l : w, also: [w, l, c] } : null; },
    lines: (s, h, c) => [['', '曹操致書孫權：「今治水軍八十萬眾，方與將軍會獵於吳。」東吳文臣多主降。'], [h.on('諸葛亮') === c.also[1] ? '諸葛亮' : '魯肅', '眾人皆可降曹，惟將軍不可。'], [h.on('周瑜') === c.also[0] ? '周瑜' : '', '操雖託名漢相，其實漢賊也。願得精兵數萬，為將軍破之！'], ['', '孫權拔劍砍下奏案一角：「諸官將有再言降操者，與此案同！」']],
    choices: [
      { t: '聯劉抗曹', hist: true, d: '孫劉結盟，與曹操開戰', ok: (s, h, c) => c.fid === c.also[0], run: (s, h, c) => STORY.find(e => e.id === 'shezhan').go(s, h, c) },
      { t: '舉眾降曹', d: '與曹操停戰兩年；孫權德 -5', ok: (s, h, c) => c.fid === c.also[0], run: (s, h, c) => { h.truce(c.fid, c.also[2], 24); h.stat('孫權', 'cha', -5); return '孫權遣使請降，江東文武黯然。'; } },
      { t: '出使東吳遊說', hist: true, d: '看使者的謀（有諸葛亮則必成）：成功則孫劉結盟', ok: (s, h, c) => c.fid === c.also[1],
        p: (s, h, c) => h.on('諸葛亮') === c.fid ? 100 : R.clamp(Math.max(...R.gensOf(s, c.fid).map(x => x.int)) - 20, 10, 80),
        run: (s, h, c, r) => r.win ? STORY.find(e => e.id === 'shezhan').go(s, h, c) : '孫權猶豫不決，使者無功而返。' },
    ],
    go(s, h, c) { const [w, l, cao] = c.also; h.ally(w, l); h.rel(w, l, 40); h.hostile(w, cao); h.hostile(l, cao); h.set('sunliu'); return '孫劉兩家結為同盟，周瑜督三萬水軍溯江而上。'; },
  },
  {
    id: 'chibi', ch: 3, src: 'b', title: '赤壁之戰', y: [208, 209],
    who: (s, h) => { const w = h.isRuler('孫權') || (h.alive('sun') ? 'sun' : null), l = h.isRuler('劉備'), c = h.isRuler('曹操'); if (!h.flag('sunliu') || !w || !c || !(h.owns(c, '襄陽') || h.owns(c, '江陵') || ['江夏', '江陵', '柴桑', '夏口'].some(n => h.near(c, n)))) return null; const allies = [w, l].filter(x => x && h.alive(x)); return { fid: allies.includes(s.player) ? s.player : c, also: [c, ...allies] }; },
    lines: (s, h, c) => {
      const L = [['', '曹操八十三萬大軍順江東下，戰船首尾相連，屯於赤壁北岸烏林。']];
      if (h.live('諸葛亮') && c.also.includes(h.on('諸葛亮'))) L.push(['諸葛亮', '大霧漫江，借曹丞相十萬枝箭一用。'], ['諸葛亮', '萬事俱備，只欠東風。亮雖不才，能借三日三夜東南大風。']);
      if (h.live('黃蓋') && c.also.includes(h.on('黃蓋'))) L.push(['黃蓋', '某受孫氏厚恩，雖肝腦塗地亦無怨悔。願受杖刑，詐降曹操。']);
      if (h.live('龐統') && !h.on('龐統')) L.push(['龐統', '北軍不習水戰，丞相何不以鐵索連舟，則大江之上如履平地。']);
      L.push(['', '是夜東南風大起，黃蓋二十艘火船直衝曹營，火趁風威，風助火勢，烈焰張天。']);
      return L;
    },
    rate(s, h, c) {
      let p = 35; const al = c.also.slice(1);
      for (const n of ['周瑜', '諸葛亮', '黃蓋']) if (al.includes(h.on(n))) p += 15;
      if (h.live('龐統') && !h.on('龐統') || al.includes(h.on('龐統'))) p += 10;
      if (h.on('蔡瑁') === c.also[0] && h.on('張允') === c.also[0]) p -= 10;
      return R.clamp(p, 10, 95);
    },
    choices: [
      { t: '鐵索連環，橫江而陣', hist: true, d: '依計連船：聯軍火攻成功率高', ok: (s, h, c) => c.fid === c.also[0], p: (s, h, c) => STORY.find(e => e.id === 'chibi').rate(s, h, c), run: (s, h, c, r) => STORY.find(e => e.id === 'chibi').go(s, h, c, r) },
      { t: '拒絕連環，分寨而守', d: '聯軍火攻成功率大減', ok: (s, h, c) => c.fid === c.also[0], p: (s, h, c) => STORY.find(e => e.id === 'chibi').rate(s, h, c) - 35, run: (s, h, c, r) => STORY.find(e => e.id === 'chibi').go(s, h, c, r) },
      { t: '火攻曹營', hist: true, d: '依諸葛亮、周瑜、黃蓋、龐統在否決定成功率', ok: (s, h, c) => c.fid !== c.also[0], p: (s, h, c) => STORY.find(e => e.id === 'chibi').rate(s, h, c), run: (s, h, c, r) => STORY.find(e => e.id === 'chibi').go(s, h, c, r) },
    ],
    go(s, h, c, r) {
      const [cao, w, l] = c.also;
      if (!r.win) { h.capTroops(w, 0.85); return '風向不順，火船未能近前，聯軍折損而回。曹操鞭指江南，氣勢更盛。'; }
      h.food(cao, -Math.round(R.fac(s, cao).food * 0.4));
      for (const n of ['江陵', '襄陽']) if (h.owns(cao, n)) h.troops(n, 0.35);
      h.capTroops(cao, 0.8);
      if (h.owns(cao, '江陵')) h.give('江陵', w);
      for (const n of ['蔡瑁', '張允']) if (h.on(n) === cao) h.kill(n, null);
      h.set('chibi');
      let tail = '';
      if (l && h.on('關羽') === l) tail = '曹操敗走華容道，關羽念及舊恩，橫刀立馬，終究放他過去。';
      if (h.live('龐統') && h.free('龐統')) h.g('龐統').lock = 0;
      return `曹軍大敗，燒死溺死者不計其數，周瑜取江陵。${tail}`;
    },
  },
  {
    id: 'jingnan', ch: 3, src: 'b', title: '劉備取荊南四郡', y: [208, 210],
    who: (s, h) => { const l = h.isRuler('劉備'); return l && h.flag('chibi') && ['武陵', '長沙', '桂陽', '零陵'].some(n => !h.owner(n)) ? { fid: l } : null; },
    lines: () => [['諸葛亮', '武陵、長沙、桂陽、零陵四郡，可乘赤壁之勝一舉取之。'], ['', '關羽戰黃忠於長沙，黃忠馬失前蹄，關羽不殺；次日黃忠虛拽弓弦，一箭射中關羽盔纓。'], ['', '魏延殺韓玄，獻長沙城，與黃忠一同歸降。']],
    choices: [{ t: '南征四郡', hist: true, d: '取得中立的荊南城池；在野的黃忠、魏延、霍峻、蔣琬加入', run: (s, h, c) => {
      const out = [];
      for (const n of ['武陵', '長沙', '桂陽', '零陵']) if (!h.owner(n)) { h.C(n).owner = c.fid; out.push(n); }
      for (const n of ['黃忠', '魏延', '霍峻', '蔣琬', '馬良']) if (h.free(n)) { h.join(n, c.fid, null, 80); out.push(n); }
      return out.length ? `取得：${out.join('、')}。` : '四郡已有其主，劉備無功而返。';
    } }],
  },

  // ===== 第四章 三分天下 =====
  {
    id: 'jiejing', ch: 4, src: 'b', title: '借荊州', y: [209, 210],
    who: (s, h) => { const w = h.isRuler('孫權'), l = h.isRuler('劉備'); return w && l && w !== l && h.flag('chibi') && h.owns(w, '江陵') && R.atPeace(s, w, l) ? { fid: s.player === l ? l : w, also: [w, l] } : null; },
    lines: () => [['魯肅', '劉備新得荊南四郡，地狹不足以安眾。不如借南郡與之，使其為我屏障，共拒曹操。'], ['周瑜', '劉備以梟雄之姿，又有關張熊虎之將，必非久屈為人用者。'], ['', '孫權從魯肅之議，將江陵借與劉備，約定日後歸還。']],
    choices: [
      { t: '借江陵予劉備', hist: true, d: '江陵交給劉備；兩家同盟、關係 +20；日後東吳必來討還', ok: (s, h, c) => c.fid === c.also[0], run: (s, h, c) => STORY.find(e => e.id === 'jiejing').go(s, h, c) },
      { t: '拒絕出借', d: '與劉備關係 -20', ok: (s, h, c) => c.fid === c.also[0], run: (s, h, c) => { h.rel(c.also[0], c.also[1], -20); return '孫權不肯借地，劉備怏怏而回。'; } },
      { t: '向孫權借荊州', hist: true, d: '有魯肅在東吳則容易成功：得到江陵', ok: (s, h, c) => c.fid === c.also[1],
        p: (s, h, c) => h.on('魯肅') === c.also[0] ? 85 : 35, run: (s, h, c, r) => r.win ? STORY.find(e => e.id === 'jiejing').go(s, h, c) : '孫權推說周瑜不允，使者空手而回。' },
      { t: '不借地', d: '什麼都不會發生', ok: (s, h, c) => c.fid === c.also[1], run: () => '劉備專心經營荊南四郡。' },
    ],
    go(s, h, c) { const [w, l] = c.also; h.give('江陵', l); h.ally(w, l); h.rel(w, l, 20); h.set('jingzhou_loan', l); return '劉備借得江陵，從此有了立足之地。「劉備借荊州，有借無還。」'; },
  },
  {
    id: 'zhaoqin', ch: 4, src: 'y', title: '甘露寺招親', y: [209, 210],
    who: (s, h) => { const w = h.isRuler('孫權'), l = h.isRuler('劉備'); return w && l && w !== l && R.atPeace(s, w, l) && h.on('孫尚香') === w ? { fid: s.player === l ? l : w, also: [w, l] } : null; },
    lines: () => [['周瑜', '主公之妹剛勇，可以招親為名，誘劉備過江，囚之以換荊州。'], ['', '劉備帶趙雲過江，諸葛亮授以三個錦囊。吳國太在甘露寺相婿，見劉備龍鳳之姿，大喜。'], ['孫尚香', '我兄長既許了這門親事，誰敢在此動刀兵！'], ['', '周瑜嘆道：「賠了夫人又折兵！」']],
    choices: [
      { t: '假戲真做，嫁妹聯姻', hist: true, d: '孫尚香嫁給劉備（加入劉備）；兩家同盟、關係 +25', ok: (s, h, c) => c.fid === c.also[0], run: (s, h, c) => STORY.find(e => e.id === 'zhaoqin').go(s, h, c) },
      { t: '扣留劉備為人質', d: '成功則劉備割一城求歸；兩家反目', ok: (s, h, c) => c.fid === c.also[0], p: (s, h, c) => h.on('趙雲') === c.also[1] ? 20 : 50,
        run: (s, h, c, r) => {
          const [w, l] = c.also; h.hostile(w, l); h.rel(w, l, -50);
          if (r.win) { const t = R.citiesOf(s, l).find(x => R.citiesOf(s, w).some(y => ADJ[y.id].includes(x.id))); if (t && R.citiesOf(s, l).length > 1) { h.give(t.name, w); return `劉備被困江東，只得割讓${t.name}才得歸去。`; } return '劉備被困數月，終究脫身。'; }
          return '趙雲依錦囊之計，護著劉備殺出江東。';
        } },
      { t: '過江招親', hist: true, d: '趙雲護駕、錦囊妙計：孫尚香加入，兩家同盟', ok: (s, h, c) => c.fid === c.also[1], run: (s, h, c) => STORY.find(e => e.id === 'zhaoqin').go(s, h, c) },
      { t: '婉拒親事', d: '與孫權關係 -10', ok: (s, h, c) => c.fid === c.also[1], run: (s, h, c) => { h.rel(c.also[0], c.also[1], -10); return '劉備以年老推辭，孫權面上無光。'; } },
    ],
    go(s, h, c) { const [w, l] = c.also; h.join('孫尚香', l, null, 70); h.ally(w, l); h.rel(w, l, 25); h.set('zhaoqin'); return '劉備迎娶孫夫人，攜妻返回荊州，孫劉之盟更加穩固。'; },
  },
  {
    id: 'zhouyu', ch: 4, src: 'b', title: '三氣周瑜', y: [209, 211],
    who: (s, h) => { const w = h.on('周瑜'), l = h.isRuler('劉備'); return w && l && w !== l && w === h.isRuler('孫權') && (h.flag('jingzhou_loan') || h.flag('chibi')) ? { fid: w, also: [l] } : null; },
    lines: (s, h, c) => [['周瑜', '劉備不肯還荊州，我以取西川為名，假途伐虢，順勢奪了荊州。'], [h.on('諸葛亮') === c.also[0] ? '諸葛亮' : '', '此計瞞得過他人，瞞不過我。'], ['', '周瑜中計，箭瘡迸裂，墜於馬下。'], ['周瑜', '既生瑜，何生亮！']],
    choices: [
      { t: '假途伐虢', hist: true, d: '周瑜病逝，魯肅接任；龐統出仕劉備', run: (s, h, c) => {
        const l = c.also[0]; h.kill('周瑜', '周瑜病逝於巴丘，年三十六。'); h.rel(c.fid, l, -10); h.set('zhouyu_dead');
        const out = ['周瑜病逝，臨終薦魯肅自代'];
        if (h.live('龐統') && h.free('龐統')) { h.g('龐統').lock = 0; h.join('龐統', l, null, 85); out.push('龐統由魯肅、諸葛亮舉薦，投入劉備帳下'); }
        return out.join('；') + '。';
      } },
      { t: '安心養傷，不與劉備爭', d: '周瑜暫保性命；與劉備關係 +10', run: (s, h, c) => { h.rel(c.fid, c.also[0], 10); return '周瑜閉門養傷，江東與荊州相安無事。'; } },
    ],
  },
  {
    id: 'tongguan', ch: 4, src: 'b', title: '潼關之戰・割鬚棄袍', y: [211, 212],
    who: (s, h) => { const c = h.isRuler('曹操'), m = h.on('馬超'); return c && m && c !== m && h.war(c, m) && ['潼關', '長安', '天水', '安定', '散關'].some(n => h.near(c, n) && h.near(m, n)) ? { fid: s.player === m ? m : c, also: [c, m] } : null; },
    lines: () => [['馬超', '曹賊殺我父，此仇不共戴天！'], ['', '西涼兵殺奔潼關，曹軍大亂。馬超在亂軍中大叫：「穿紅袍的是曹操！」'], ['', '曹操急脫紅袍；又叫「長鬚的是曹操」，曹操用劍割斷長鬚，狼狽而逃。'], ['賈詡', '馬超、韓遂合兵，不可力敵。丞相與韓遂陣前敘舊，再寄一封塗改過的書信，二人必相猜忌。']],
    choices: [
      { t: '賈詡離間之計', hist: true, d: '看我方最高謀：成功則韓遂歸降，馬超失去潼關、長安，兵力大減', ok: (s, h, c) => c.fid === c.also[0],
        p: (s, h, c) => R.clamp(Math.max(...R.gensOf(s, c.fid).map(x => x.int)) - 15, 20, 85), run: (s, h, c, r) => STORY.find(e => e.id === 'tongguan').go(s, h, c, r) },
      { t: '許褚裸衣鬥馬超', d: '許褚與馬超單挑：勝則西涼軍兵力大減', ok: (s, h, c) => c.fid === c.also[0] && h.on('許褚') === c.fid,
        duel: (s, h) => [h.g('許褚'), h.g('馬超')],
        run: (s, h, c, r) => { if (r.win) { h.capTroops(c.also[1], 0.8); return '許褚赤膊上陣，殺得西涼兵膽寒。'; } h.capTroops(c.fid, 0.9); return '許褚與馬超大戰二百餘合，不分勝負。'; } },
      { t: '起兵為父報仇', hist: true, d: '多半中離間計：韓遂反目，失去潼關、長安', ok: (s, h, c) => c.fid === c.also[1], p: () => 30,
        run: (s, h, c, r) => { if (r.win) { h.capTroops(c.also[0], 0.8); h.stat('曹操', 'cha', -2); return '西涼鐵騎大破曹軍，曹操割鬚棄袍而逃。'; } return STORY.find(e => e.id === 'tongguan').go(s, h, c, { win: true }); } },
      { t: '堅守關隘', d: '什麼都不會發生', ok: (s, h, c) => c.fid === c.also[1], run: () => '馬超閉關不出，曹軍無功而返。' },
    ],
    go(s, h, c, r) {
      const [cao, m] = c.also;
      if (!r.win) { h.capTroops(cao, 0.85); return '韓遂識破離間之計，曹軍損兵折將。'; }
      const out = ['馬超、韓遂互相猜疑，西涼軍大敗'];
      if (h.on('韓遂') === m && !h.isRuler('韓遂')) { h.join('韓遂', cao, null, 55); out.push('韓遂歸降'); }
      for (const n of ['潼關', '長安']) if (h.owns(m, n) && R.citiesOf(s, m).length > 1) { h.give(n, cao); out.push(`曹操取${n}`); }
      h.capTroops(m, 0.7); h.set('tongguan');
      return out.join('，') + '。';
    },
  },
  {
    id: 'ruchuan', ch: 4, src: 'b', title: '劉備入川', y: [211, 212],
    who: (s, h) => { const z = h.isRuler('劉璋'), l = h.isRuler('劉備'); return z && l && z !== l && ['永安', '江州', '梓潼', '漢中', '上庸', '夷陵關'].some(n => h.near(l, n)) && (h.on('法正') === z || h.on('張松') === z || h.free('法正')) ? { fid: s.player === l ? l : z, also: [z, l] } : null; },
    lines: () => [['張松', '益州天府之土，劉季玉闇弱，不能任賢。此西川四十一州地理圖，獻與明公。'], ['法正', '張魯在北，曹操覬覦。主公何不迎劉皇叔入川，以拒張魯？'], ['黃權', '劉備有梟雄之名，請入蜀中，是迎虎入門也！'], ['', '劉璋不聽，迎劉備至葭萌關。']],
    choices: [
      { t: '迎劉備入川拒張魯', hist: true, d: '劉備得梓潼為據點、法正投劉備；兩家停戰一年', ok: (s, h, c) => c.fid === c.also[0], run: (s, h, c) => STORY.find(e => e.id === 'ruchuan').go(s, h, c) },
      { t: '聽黃權之諫，閉關拒之', d: '法正、張松忠誠 -20', ok: (s, h, c) => c.fid === c.also[0], run: (s, h) => { h.loyal('法正', -20); h.loyal('張松', -20); return '劉璋閉關自守，張松、法正大失所望。'; } },
      { t: '應邀入川', hist: true, d: '得梓潼為據點、法正來投，日後可圖西川', ok: (s, h, c) => c.fid === c.also[1], run: (s, h, c) => STORY.find(e => e.id === 'ruchuan').go(s, h, c) },
      { t: '同宗之誼，婉拒', d: '劉備德 +3', ok: (s, h, c) => c.fid === c.also[1], run: (s, h) => { h.stat('劉備', 'cha', 3); return '劉備不忍奪同宗基業。'; } },
    ],
    go(s, h, c) {
      const [z, l] = c.also; h.truce(z, l, 12); h.rel(z, l, 20);
      const out = ['劉備率軍入川，屯於葭萌'];
      if (h.owns(z, '梓潼') && R.citiesOf(s, z).length > 1) { h.give('梓潼', l); out.push('劉璋撥梓潼供其駐軍'); }
      if (h.on('法正') === z || h.free('法正')) { h.join('法正', l, null, 85); out.push('法正暗投劉備'); }
      if (h.on('張松') === z) { h.kill('張松', '張松密謀泄露，被劉璋所斬。'); out.push('張松事泄被殺'); }
      h.set('ruchuan', l); return out.join('，') + '。';
    },
  },
  {
    id: 'luofeng', ch: 4, src: 'b', title: '落鳳坡', y: [212, 214],
    who: (s, h) => { const l = h.isRuler('劉備'), z = h.isRuler('劉璋'); return l && z && h.flag('ruchuan') === l && h.on('龐統') === l ? { fid: l, also: [z] } : null; },
    lines: () => [['龐統', '主公取大路，統取小路，同取雒城。'], ['劉備', '吾所乘白馬極是馴熟，軍師可騎。'], ['', '小路山勢狹窄。龐統問此地何名，答曰「落鳳坡」。'], ['龐統', '吾道號鳳雛，此處名落鳳坡，不利於吾！'], ['', '張任伏兵見白馬，只道是劉備，萬弩齊發。']],
    choices: [
      { t: '照走小路', hist: true, d: '龐統中伏身亡；劉備與劉璋開戰', run: (s, h, c) => { h.kill('龐統', '龐統於落鳳坡中箭身亡，年三十六。'); h.hostile(c.fid, c.also[0]); h.rel(c.fid, c.also[0], -40); h.set('luofeng'); return '鳳雛殞命，劉備放聲大哭，急召諸葛亮入川。'; } },
      { t: '聽勸改走大路', d: '看龐統的謀：成功則龐統平安', p: (s, h) => R.clamp(h.g('龐統').int - 50, 10, 60),
        run: (s, h, c, r) => { if (!r.win) return STORY.find(e => e.id === 'luofeng').choices[0].run(s, h, c); h.hostile(c.fid, c.also[0]); h.set('luofeng'); return '龐統察覺山勢險惡，改走大路，張任伏兵撲空。'; } },
    ],
  },
  {
    id: 'chengdu', ch: 4, src: 'b', title: '取西川・馬超歸降', y: [213, 215],
    who: (s, h) => { const l = h.isRuler('劉備'), z = h.isRuler('劉璋'); return l && z && l !== z && (h.flag('luofeng') || h.flag('ruchuan') === l) && h.war(l, z) && (h.near(l, '成都') || h.owns(l, '梓潼')) ? { fid: s.player === z ? z : l, also: [l, z] } : null; },
    lines: () => [['', '諸葛亮與張飛、趙雲分兵入川。張飛於巴郡義釋嚴顏，所過關隘，盡皆歸順。'], ['', '馬超自張魯處來投，兵臨成都城下，城中震怖。'], ['劉璋', '父子在州二十餘年，無恩德以加百姓。百姓攻戰三年，肌膏草野者，以璋故也，何心能安！'], ['', '劉璋開城出降，劉備遂領益州牧。']],
    choices: [
      { t: '兵圍成都，招降劉璋', hist: true, d: '劉璋全部城池與部將歸你（張任不屈被斬）；馬超、馬岱若在野或在張魯處則來投', ok: (s, h, c) => c.fid === c.also[0], run: (s, h, c) => STORY.find(e => e.id === 'chengdu').go(s, h, c) },
      { t: '暫緩進兵', d: '什麼都不會發生', ok: (s, h, c) => c.fid === c.also[0], run: () => '劉備屯兵不進，與劉璋相持。' },
      { t: '開城出降', hist: true, d: '劉璋勢力併入劉備（遊戲結束）', ok: (s, h, c) => c.fid === c.also[1], run: (s, h, c) => STORY.find(e => e.id === 'chengdu').go(s, h, c) },
      { t: '死守成都', d: '劉備各城兵力 -15%', ok: (s, h, c) => c.fid === c.also[1], run: (s, h, c) => { h.capTroops(c.also[0], 0.85); return '成都軍民死守，劉備久攻不下。'; } },
    ],
    go(s, h, c) {
      const [l, z] = c.also; const out = ['劉璋出降，劉備盡得西川'];
      if (h.on('張任') === z) { h.kill('張任', '張任寧死不降，被斬於金雁橋。'); out.push('張任不屈而死'); }
      h.absorb(z, l, 'retire', 70);
      for (const n of ['馬超', '馬岱']) { const f = h.on(n); if (h.free(n) || (f && f !== l && !h.isRuler(n) && (f === 'zl' || f === 'ma'))) { h.join(n, l, null, 80); out.push(`${n}來投`); } }
      h.set('chengdu', l); return out.join('，') + '。';
    },
  },
  {
    id: 'weiwang', ch: 4, src: 'z', title: '曹操進位魏王', y: [213, 216],
    who: (s, h) => { const c = h.isRuler('曹操'); return c && s.emperor === c && R.fac(s, c).realm !== '魏' && h.ncity(c) >= 8 ? { fid: c } : null; },
    lines: () => [['董昭', '明公功高天下，宜進爵國公，加九錫以彰其德。'], ['荀彧', '曹公本興義兵以匡朝寧國，秉忠貞之誠，守退讓之實。君子愛人以德，不宜如此。'], ['', '荀彧憂憤而卒。曹操受封魏公，加九錫，三年後進位魏王，設天子旌旗。']],
    choices: [
      { t: '受九錫，進位魏王', hist: true, d: '國號「魏」、爵位升為王（軍令 +1）；各家關係 -10', run: (s, h, c) => {
        h.realm(c.fid, '魏', 2); for (const f of Object.values(s.factions)) if (f.alive && f.id !== c.fid) h.rel(c.fid, f.id, -10);
        if (h.on('荀彧') === c.fid) h.kill('荀彧', '荀彧憂憤而卒，年五十。');
        h.set('weiwang'); return '曹操進位魏王，冕十二旒，乘金根車，與天子無異。';
      } },
      { t: '固辭不受', d: '曹操德 +5', run: (s, h) => { h.stat('曹操', 'cha', 5); return '曹操上表辭讓：「設使國家無有孤，不知當幾人稱帝，幾人稱王。」'; } },
    ],
  },
  {
    id: 'xiaoyao', ch: 4, src: 'z', title: '威震逍遙津', y: [214, 216],
    who: (s, h) => { const w = h.isRuler('孫權'), c = h.on('張遼'); return w && c && w !== c && h.war(w, c) && (h.owns(c, '合肥') && h.near(w, '合肥')) ? { fid: s.player === c ? c : w, also: [w, c] } : null; },
    lines: () => [['', '孫權親率十萬大軍圍合肥，城中守軍僅七千。'], ['張遼', '待其未合，折其盛勢，以安眾心，然後可守也。'], ['', '張遼募敢死之士八百人，被甲持戟，先登陷陣，直衝孫權麾下。'], ['', '孫權驚走，乘駿馬躍過逍遙津斷橋，方才得脫。江東小兒聞「張遼來了」，夜不敢啼。']],
    choices: [
      { t: '十萬大軍圍合肥', hist: true, d: '多半被張遼八百騎擊破：各城兵力 -20%；張遼揚名', ok: (s, h, c) => c.fid === c.also[0], p: () => 25,
        run: (s, h, c, r) => r.win ? STORY.find(e => e.id === 'xiaoyao').go(s, h, c, false) : STORY.find(e => e.id === 'xiaoyao').go(s, h, c, true) },
      { t: '派呂蒙、甘寧分兵牽制', d: '看我方最高勇：成功則合肥守軍大減', ok: (s, h, c) => c.fid === c.also[0], p: (s, h, c) => R.clamp(Math.max(...R.gensOf(s, c.fid).map(x => x.str)) - 45, 15, 55),
        run: (s, h, c, r) => r.win ? STORY.find(e => e.id === 'xiaoyao').go(s, h, c, false) : STORY.find(e => e.id === 'xiaoyao').go(s, h, c, true) },
      { t: '張遼率八百死士突陣', hist: true, d: '看張遼的勇：成功則孫權大敗', ok: (s, h, c) => c.fid === c.also[1], p: (s, h) => R.clamp(h.g('張遼').str - 15, 30, 85),
        run: (s, h, c, r) => STORY.find(e => e.id === 'xiaoyao').go(s, h, c, r.win) },
      { t: '閉城固守', d: '什麼都不會發生', ok: (s, h, c) => c.fid === c.also[1], run: () => '合肥堅守不出，孫權久攻不下而退。' },
    ],
    go(s, h, c, zhangWin) {
      const [w, cz] = c.also;
      if (!zhangWin) { h.troops('合肥', 0.5); return '吳軍攻勢如潮，合肥守軍死傷慘重。'; }
      h.capTroops(w, 0.8); h.stat('孫權', 'cha', -2); h.stat('張遼', 'cha', 3); h.set('xiaoyao');
      return '張遼八百破十萬，威震逍遙津，孫權狼狽而逃。';
    },
  },
  {
    id: 'zhanglu_jiang', ch: 4, src: 'z', title: '張魯降曹', y: [215, 216],
    who: (s, h) => { const c = h.isRuler('曹操'), z = h.isRuler('張魯'); return c && z && c !== z && (h.near(c, '漢中') || h.near(c, '陽平關') || h.near(c, '散關')) ? { fid: s.player === z ? z : c, also: [c, z] } : null; },
    lines: () => [['', '曹操親征漢中，攻破陽平關。'], ['張魯', '本欲歸命國家，而意未達。今之走，避銳鋒，非有惡意。寶貨倉庫，國家之有。'], ['', '張魯封存府庫，退入巴中，後率家屬出降。曹操拜張魯為鎮南將軍，封閬中侯。']],
    choices: [
      { t: '進兵漢中，招降張魯', hist: true, d: '張魯全部城池與部將歸曹操；夏侯淵鎮守漢中', ok: (s, h, c) => c.fid === c.also[0], run: (s, h, c) => STORY.find(e => e.id === 'zhanglu_jiang').go(s, h, c) },
      { t: '暫不用兵', d: '什麼都不會發生', ok: (s, h, c) => c.fid === c.also[0], run: () => '曹操按兵不動。' },
      { t: '封存府庫，舉眾歸降', hist: true, d: '勢力併入曹操（遊戲結束）', ok: (s, h, c) => c.fid === c.also[1], run: (s, h, c) => STORY.find(e => e.id === 'zhanglu_jiang').go(s, h, c) },
      { t: '據陽平關死守', d: '曹操各城兵力 -10%', ok: (s, h, c) => c.fid === c.also[1], run: (s, h, c) => { h.capTroops(c.also[0], 0.9); return '漢中軍民據險死守，曹軍糧盡而退。'; } },
    ],
    go(s, h, c) {
      const [cz, z] = c.also; h.absorb(z, cz, 'join', 70);
      const x = h.g('夏侯淵'); if (x && h.on('夏侯淵') === cz && !x.army && h.owns(cz, '漢中')) x.city = cityId('漢中');
      return '張魯出降，漢中歸曹。曹操留夏侯淵、張郃鎮守漢中。';
    },
  },
  {
    id: 'shizi', ch: 4, src: 'z', title: '曹丕曹植爭嗣', y: [216, 219],
    who: (s, h) => { const c = h.isRuler('曹操'); return c && h.on('曹丕') === c && h.on('曹植') === c ? { fid: c } : null; },
    lines: () => [['', '曹植才華橫溢，「天下才共一石，曹子建獨得八斗」，深得曹操喜愛。'], ['賈詡', '思袁本初、劉景升父子也。'], ['', '曹操大笑，遂定嗣位。']],
    choices: [
      { t: '立曹丕為世子', hist: true, d: '曹操死後由曹丕繼位；曹植忠誠 -10', run: (s, h, c) => { R.fac(s, c.fid).heir = '曹丕'; h.loyal('曹植', -10); return '曹丕被立為魏王世子。'; } },
      { t: '立曹植為世子', d: '曹操死後由曹植繼位；曹丕忠誠 -30', run: (s, h, c) => { R.fac(s, c.fid).heir = '曹植'; h.loyal('曹丕', -30); if (h.on('司馬懿') === c.fid) h.loyal('司馬懿', -10); return '曹植被立為世子，曹丕一黨怏怏不樂。'; } },
    ],
  },
  {
    id: 'dingjun', ch: 4, src: 'b', title: '定軍山', y: [218, 219],
    who: (s, h) => { const l = h.isRuler('劉備'), c = h.on('夏侯淵'); return l && c && l !== c && h.war(l, c) && h.on('黃忠') === l && (h.owns(c, '漢中') || h.owns(c, '陽平關')) && (h.near(l, '漢中') || h.near(l, '陽平關')) ? { fid: s.player === c ? c : l, also: [l, c] } : null; },
    lines: () => [['法正', '夏侯淵為人輕躁，恃勇少謀。可使黃忠據定軍山對面高處，待其疲憊，一鼓擒之。'], ['黃忠', '老夫雖年近七旬，兩臂尚開三石之弓！'], ['', '黃忠居高臨下，推鋒必進，金鼓振天，歡聲動谷。']],
    choices: [
      { t: '黃忠斬夏侯淵', hist: true, d: '黃忠與夏侯淵單挑：勝則夏侯淵陣亡、奪取漢中與陽平關', ok: (s, h, c) => c.fid === c.also[0], duel: (s, h) => [h.g('黃忠'), h.g('夏侯淵')],
        run: (s, h, c, r) => STORY.find(e => e.id === 'dingjun').go(s, h, c, r.win) },
      { t: '穩守待機', d: '什麼都不會發生', ok: (s, h, c) => c.fid === c.also[0], run: () => '劉備按兵不動。' },
      { t: '夏侯淵出營搶修鹿角', hist: true, d: '夏侯淵與黃忠單挑：敗則夏侯淵陣亡、失去漢中', ok: (s, h, c) => c.fid === c.also[1], duel: (s, h) => [h.g('夏侯淵'), h.g('黃忠')],
        run: (s, h, c, r) => STORY.find(e => e.id === 'dingjun').go(s, h, c, !r.win) },
      { t: '堅守營寨', d: '劉備各城兵力 -10%', ok: (s, h, c) => c.fid === c.also[1], run: (s, h, c) => { h.capTroops(c.also[0], 0.9); return '夏侯淵深溝高壘，劉軍無隙可乘。'; } },
    ],
    go(s, h, c, liuWin) {
      const [l, cz] = c.also;
      if (!liuWin) { h.capTroops(l, 0.85); return '夏侯淵擊退黃忠，漢中依舊在曹軍手中。'; }
      h.kill('夏侯淵', '夏侯淵於定軍山被黃忠斬殺。'); h.stat('黃忠', 'cha', 3);
      const out = ['黃忠陣斬夏侯淵'];
      for (const n of ['陽平關', '漢中']) if (h.owns(cz, n) && R.citiesOf(s, cz).length > 1) { h.give(n, l); h.troops(n, 0.5); out.push(`取${n}`); }
      h.set('dingjun'); return out.join('，') + '。曹操嘆漢中為「雞肋」，引兵而還。';
    },
  },
  {
    id: 'hzwang', ch: 4, src: 'z', title: '劉備進位漢中王', y: [219, 220],
    who: (s, h) => { const l = h.isRuler('劉備'); return l && R.fac(s, l).realm !== '蜀' && (h.owns(l, '漢中') || h.ncity(l) >= 8) ? { fid: l } : null; },
    lines: () => [['', '群臣上表，推劉備為漢中王。劉備設壇場於沔陽，陳兵列眾，拜受璽綬。'], ['劉備', '備以具臣之才，荷上將之任，敢不竭力！']],
    choices: [
      { t: '進位漢中王', hist: true, d: '國號「蜀」、爵位升為王（軍令 +1）；與曹操關係 -20', run: (s, h, c) => { h.realm(c.fid, '蜀', 2); const cz = h.isRuler('曹操'); if (cz) h.rel(c.fid, cz, -20); h.set('hanzhong_king', c.fid); return '劉備進位漢中王，立劉禪為王太子，拜魏延為漢中太守。'; } },
      { t: '不受王號', d: '劉備德 +3', run: (s, h) => { h.stat('劉備', 'cha', 3); return '劉備謙辭，仍以左將軍自居。'; } },
    ],
  },
  {
    id: 'qijun', ch: 4, src: 'b', title: '水淹七軍・刮骨療毒', y: [219, 220],
    who: (s, h) => {
      const l = h.on('關羽'); if (!l || l !== h.isRuler('劉備')) return null;
      if (!['江陵', '襄陽', '江夏', '上庸', '江津'].some(n => h.owns(l, n))) return null;
      const tgt = h.owns(l, '襄陽') ? '宛' : '襄陽', c = h.owner(tgt);
      return c && h.war(l, c) && h.near(l, tgt) ? { fid: s.player === c ? c : l, also: [l, c], tgt } : null;
    },
    lines: (s, h, c) => [['', `關羽北伐，圍曹仁於樊城。秋八月，大雨連綿十餘日，漢水暴漲。`], ['龐德', '我受魏王厚恩，今日當以死報之！吾抬櫬而來，不殺關某，必為其所殺。'], ['', '關羽決堤放水，七軍盡沒。于禁乞降，龐德立而不跪，被斬。'], ...(h.live('華佗') ? [['華佗', '此乃弩箭所傷，箭頭有藥，毒已入骨。當刮去骨上箭毒。']] : []), ['', '關羽飲酒食肉，談笑弈棋，全無痛苦之色。威震華夏。']],
    choices: [
      { t: '決堤水淹七軍', hist: true, d: '敵城守軍大減、于禁歸降、龐德被斬；關羽揚名', ok: (s, h, c) => c.fid === c.also[0], run: (s, h, c) => STORY.find(e => e.id === 'qijun').go(s, h, c) },
      { t: '按兵不動', d: '什麼都不會發生', ok: (s, h, c) => c.fid === c.also[0], run: () => '關羽未敢輕進。' },
      { t: '派于禁、龐德救援', hist: true, d: '多半遭水淹：守軍大減、于禁降、龐德死', ok: (s, h, c) => c.fid === c.also[1], run: (s, h, c) => STORY.find(e => e.id === 'qijun').go(s, h, c) },
      { t: '移營高處', d: '看我方最高謀：成功則避過水淹', ok: (s, h, c) => c.fid === c.also[1], p: (s, h, c) => R.clamp(Math.max(...R.gensOf(s, c.fid).map(x => x.int)) - 30, 10, 70),
        run: (s, h, c, r) => r.win ? '魏軍移營高處，水淹之計落空。' : STORY.find(e => e.id === 'qijun').go(s, h, c) },
    ],
    go(s, h, c) {
      const [l, cz] = c.also; h.troops(c.tgt, 0.4); h.capTroops(cz, 0.9); h.stat('關羽', 'cha', 3);
      const out = [`${c.tgt}守軍死傷大半`];
      if (h.on('于禁') === cz) { h.join('于禁', l, null, 40); out.push('于禁乞降'); }
      if (h.on('龐德') === cz) { h.kill('龐德', '龐德不屈，被關羽所斬。'); out.push('龐德不屈而死'); }
      if (!h.live('華佗')) h.stat('關羽', 'str', -2);
      h.set('qijun', l); return out.join('，') + '。關羽威震華夏，曹操議遷都以避其鋒。';
    },
  },
  {
    id: 'maicheng', ch: 4, src: 'b', title: '白衣渡江・敗走麥城', y: [219, 220],
    who: (s, h) => { const l = h.on('關羽'), w = h.on('呂蒙'); return l && w && l !== w && h.flag('qijun') === l && h.owns(l, '江陵') && (h.near(w, '江陵') || h.near(w, '江津')) ? { fid: s.player === l ? l : w, also: [w, l] } : null; },
    lines: () => [['呂蒙', '關羽北伐，必留重兵守江陵。蒙稱病還建業，彼必撤兵北上。'], ['陸遜', '將軍威名遠播，遜一介書生，願聽將軍節制。'], ['', '呂蒙命精兵伏於船中，搖櫓者皆穿白衣作商賈打扮，晝夜兼行，盡收沿江烽火台。糜芳、傅士仁開城出降。'], ['關羽', '玉可碎而不可改其白，竹可焚而不可毀其節。'], ['', '關羽敗走麥城，於臨沮被潘璋部將馬忠所擒。']],
    choices: [
      { t: '白衣渡江，襲取江陵', hist: true, d: '奪取劉備在荊州的城池；關羽、關平、周倉遇害；與劉備反目', ok: (s, h, c) => c.fid === c.also[0], run: (s, h, c) => STORY.find(e => e.id === 'maicheng').go(s, h, c, 'kill') },
      { t: '顧全孫劉之盟', d: '與劉備關係 +10', ok: (s, h, c) => c.fid === c.also[0], run: (s, h, c) => { h.rel(c.also[0], c.also[1], 10); return '孫權按兵不動，孫劉同盟得以維持。'; } },
      { t: '關羽回救江陵', hist: true, d: '失去荊州諸城，關羽父子遇害', ok: (s, h, c) => c.fid === c.also[1], run: (s, h, c) => STORY.find(e => e.id === 'maicheng').go(s, h, c, 'kill') },
      { t: '棄城立退，保全關羽', d: '失去荊州諸城，但關羽、關平平安退回', ok: (s, h, c) => c.fid === c.also[1], run: (s, h, c) => STORY.find(e => e.id === 'maicheng').go(s, h, c, 'save') },
      { t: '預留重兵防備江陵', d: '看關羽的謀：成功則呂蒙無功而返', ok: (s, h, c) => c.fid === c.also[1], p: (s, h) => R.clamp(h.g('關羽').int - 15, 20, 70),
        run: (s, h, c, r) => { if (!r.win) return STORY.find(e => e.id === 'maicheng').go(s, h, c, 'kill'); h.hostile(c.also[0], c.also[1]); h.capTroops(c.also[0], 0.85); h.set('maicheng_fail'); return '烽火台及時示警，呂蒙偷襲不成，孫劉從此反目。'; } },
    ],
    go(s, h, c, how) {
      const [w, l] = c.also; h.hostile(w, l); h.rel(w, l, -80);
      const jz = ['江陵', '江津', '武陵', '長沙', '零陵', '桂陽', '江夏', '襄陽', '夷陵關'];
      const lost = jz.filter(n => h.owns(l, n));
      if (lost.length >= R.citiesOf(s, l).length) lost.pop();
      for (const n of lost) h.give(n, w);
      if (how === 'kill') {
        h.kill('關羽', '關羽於臨沮被擒，不屈遇害，年六十。'); h.kill('關平', '關平與父同死。'); h.kill('周倉', '周倉聞關羽死訊，自刎於麥城。');
        h.set('guanyu_dead', w); return `東吳盡取${lost.join('、') || '荊州'}。關羽父子殉難，首級被送往洛陽。`;
      }
      h.set('guanyu_saved'); return `關羽棄守${lost.join('、') || '荊州'}，率殘部退回。荊州盡歸東吳。`;
    },
  },
  {
    id: 'caocao_d', ch: 4, src: 'z', title: '曹操病逝', y: [219, 220], m: [9, 11],
    who: (s, h) => { const c = h.isRuler('曹操'); return c ? { fid: c } : null; },
    lines: () => [['', '曹操頭風發作，自知不起，召曹洪、陳群、賈詡、司馬懿等入宮。'], ['曹操', '吾縱橫天下三十餘年，群雄皆滅，止有江東孫權、西蜀劉備未曾剿除。'], ['曹操', '天下尚未安定，未得遵古也。葬畢，皆除服。斂以時服，無藏金玉珍寶。']],
    choices: [{ t: '交代後事', hist: true, d: '曹操病逝，由世子繼位', run: (s, h, c) => {
      const f = R.fac(s, c.fid), heir = f.heir && h.on(f.heir) === c.fid ? f.heir : h.on('曹丕') === c.fid ? '曹丕' : null;
      if (heir) h.crown(c.fid, heir);
      h.kill('曹操', '曹操病逝於洛陽，年六十六。');
      return `一代梟雄曹操去世，${h.ruler(c.fid) ? h.ruler(c.fid).name : '世子'}繼位。`;
    } }],
  },
  {
    id: 'cuanhan', ch: 4, src: 'z', title: '曹丕篡漢', y: [220, 221],
    who: (s, h) => { const f = h.on('曹丕'); return f && h.isRuler('曹丕') === f && s.emperor === f ? { fid: f } : null; },
    lines: () => [['華歆', '漢室氣數已盡，魏王宜應天順人，受禪即位。'], ['', '漢獻帝築受禪台，奉璽綬禪位於曹丕。曹丕登壇受禪，改元黃初，國號大魏。'], ['曹丕', '舜、禹之事，吾知之矣。']],
    choices: [
      { t: '受禪稱帝', hist: true, d: '國號「魏」、稱帝（軍令 +2）；天子廢為山陽公；各家關係 -20', run: (s, h, c) => { h.realm(c.fid, '魏', 3); s.emperor = null; for (const f of Object.values(s.factions)) if (f.alive && f.id !== c.fid) h.rel(c.fid, f.id, -20); h.set('wei_emp', c.fid); return '曹丕受禪稱帝，漢獻帝被廢為山陽公。延續四百年的漢朝至此終結。'; } },
      { t: '仍奉漢室', d: '曹丕德 +5；天子留在你手中', run: (s, h, c) => { h.stat('曹丕', 'cha', 5); return '曹丕效周文王故事，終身不篡。'; } },
    ],
  },
  {
    id: 'shudi', ch: 4, src: 'b', title: '劉備稱帝', y: [220, 222],
    who: (s, h) => { const l = h.isRuler('劉備'); return l && h.rank(l) < 3 && (h.flag('wei_emp') || !s.emperor) && (R.fac(s, l).realm === '蜀' || h.ncity(l) >= 8) ? { fid: l } : null; },
    lines: () => [['', '曹丕篡漢的消息傳到成都，傳言漢帝已遇害。劉備發喪制服，追諡孝愍皇帝。'], ['諸葛亮', '曹丕篡漢，湮滅劉氏，天下無主。大王劉氏苗族，紹世而起，今即帝位，乃其宜也。'], ['', '劉備於成都武擔山之南即皇帝位，國號仍為漢，改元章武。']],
    choices: [
      { t: '即皇帝位', hist: true, d: '稱帝（軍令 +2）；國號「蜀」；各家關係 -10', run: (s, h, c) => { h.realm(c.fid, '蜀', 3); for (const f of Object.values(s.factions)) if (f.alive && f.id !== c.fid) h.rel(c.fid, f.id, -10); h.set('shu_emp', c.fid); return '劉備即皇帝位，史稱蜀漢。'; } },
      { t: '不稱帝號', d: '劉備德 +4', run: (s, h) => { h.stat('劉備', 'cha', 4); return '劉備不忍稱尊，仍為漢中王。'; } },
    ],
  },
  {
    id: 'wuwang', ch: 4, src: 'z', title: '孫權稱吳王', y: [221, 222],
    who: (s, h) => { const w = h.isRuler('孫權'); return w && R.fac(s, w).realm !== '吳' && (h.flag('wei_emp') || h.ncity(w) >= 8) ? { fid: w } : null; },
    lines: () => [['', '孫權遣使向魏稱臣，曹丕封孫權為吳王，加九錫。'], ['顧雍', '大王宜自稱上將軍、九州伯，不當受魏封爵。'], ['孫權', '昔沛公亦受項羽封為漢王，此蓋時宜耳，復何損邪？']],
    choices: [
      { t: '受魏冊封為吳王', hist: true, d: '國號「吳」、爵位升為王（軍令 +1）；與魏停戰一年', run: (s, h, c) => { h.realm(c.fid, '吳', 2); const wf = h.flag('wei_emp'); if (wf && h.alive(wf)) { h.truce(c.fid, wf, 12); h.rel(c.fid, wf, 20); } return '孫權受封吳王，以緩魏國之兵，專心西拒劉備。'; } },
      { t: '自立為吳王', d: '國號「吳」、爵位升為王；與魏關係 -20', run: (s, h, c) => { h.realm(c.fid, '吳', 2); const wf = h.flag('wei_emp'); if (wf && h.alive(wf)) h.rel(c.fid, wf, -20); return '孫權不受魏封，自立為吳王。'; } },
    ],
  },
  {
    id: 'zhangfei', ch: 4, src: 'b', title: '張飛遇害', y: [221, 222],
    who: (s, h) => { const l = h.on('張飛'); return l && h.isRuler('劉備') === l && h.flag('guanyu_dead') ? { fid: l } : null; },
    lines: () => [['張飛', '限三日內置辦白旗白甲，三軍掛孝伐吳！違者斬！'], ['', '部將范疆、張達以期限太緊求寬，被張飛綁在樹上，各鞭五十。'], ['', '是夜二人懷刃入帳，見張飛鬚豎目張，不敢動手；聽得鼻息如雷，方才上前。']],
    choices: [
      { t: '催督伐吳甚急', hist: true, d: '張飛被部將刺殺', run: (s, h) => { h.kill('張飛', '張飛於閬中帳中被范疆、張達所殺，二人攜首級投奔東吳。'); h.set('zhangfei_dead'); return '劉備聞張飛營中有表至，嘆道：「噫！飛死矣。」'; } },
      { t: '劉備親自勸戒', d: '看劉備的德：成功則張飛平安', p: (s, h) => R.clamp(h.g('劉備').cha - 30, 20, 80),
        run: (s, h, c, r) => r.win ? '劉備勸張飛：「卿刑殺既過差，又日鞭撾健兒，而令在左右，此取禍之道也。」張飛稍加收斂。' : STORY.find(e => e.id === 'zhangfei').choices[0].run(s, h, c) },
    ],
  },
  {
    id: 'yiling', ch: 4, src: 'b', title: '夷陵之戰・火燒連營', y: [221, 223],
    who: (s, h) => { const l = h.isRuler('劉備'), w = h.flag('guanyu_dead'); return l && w && h.alive(w) && l !== w && ['江陵', '夷陵關', '江津', '永安'].some(n => h.near(l, n) && h.near(w, n)) ? { fid: s.player === w ? w : l, also: [l, w] } : null; },
    lines: (s, h, c) => [['劉備', '朕不為弟報仇，雖有萬里江山，何足為貴！'], ['趙雲', '國賊是曹操，非孫權也。願陛下以天下為重。'], ['', '劉備不聽，親率大軍東征，沿江連營七百里。'], [h.on('陸遜') === c.also[1] ? '陸遜' : '', '劉備連營七百里，依林傍溪，皆是草木。今東南風起，正可用火攻。'], ['', '吳軍持茅草各一把，順風舉火，蜀軍四十餘營盡被燒毀。']],
    choices: [
      { t: '東征報仇：依林連營', hist: true, d: '多半被火攻大敗：兵力大減、黃權降魏、馬良戰死', ok: (s, h, c) => c.fid === c.also[0],
        p: (s, h, c) => h.on('陸遜') === c.also[1] ? 15 : 50, run: (s, h, c, r) => STORY.find(e => e.id === 'yiling').go(s, h, c, r.win) },
      { t: '東征報仇：分營立寨', d: '避開林木紮營，勝算較高', ok: (s, h, c) => c.fid === c.also[0],
        p: (s, h, c) => h.on('陸遜') === c.also[1] ? 40 : 65, run: (s, h, c, r) => STORY.find(e => e.id === 'yiling').go(s, h, c, r.win) },
      { t: '聽趙雲之諫，不出兵', d: '劉備德 +3；與東吳關係 +20', ok: (s, h, c) => c.fid === c.also[0], run: (s, h, c) => { h.stat('劉備', 'cha', 3); h.rel(c.also[0], c.also[1], 20); h.set('yiling_no'); return '劉備強忍悲痛，按兵不動。'; } },
      { t: '拜陸遜為大都督', hist: true, d: '陸遜火燒連營：成功則劉備大敗；失敗則江陵被奪', ok: (s, h, c) => c.fid === c.also[1],
        p: (s, h, c) => h.on('陸遜') === c.fid ? 85 : 50, run: (s, h, c, r) => STORY.find(e => e.id === 'yiling').go(s, h, c, !r.win) },
      { t: '割地求和', d: '江陵交還劉備，與劉備停戰兩年', ok: (s, h, c) => c.fid === c.also[1] && h.owns(c.fid, '江陵') && R.citiesOf(s, c.fid).length > 1,
        run: (s, h, c) => { h.give('江陵', c.also[0]); h.truce(c.also[0], c.fid, 24); h.rel(c.also[0], c.fid, 30); return '孫權遣使送還江陵，並送還孫夫人，劉備罷兵。'; } },
    ],
    go(s, h, c, liuWin) {
      const [l, w] = c.also; h.hostile(l, w);
      if (liuWin) { h.capTroops(w, 0.8); if (h.owns(w, '江陵') && R.citiesOf(s, w).length > 1) h.give('江陵', l); h.set('yiling_win'); return '蜀軍擊破吳軍，奪回江陵，為關羽報了大仇。'; }
      h.capTroops(l, 0.6); const out = ['劉備大敗，退守白帝城'];
      if (h.on('黃權') === l) { const wei = h.flag('wei_emp'); if (wei && h.alive(wei)) { h.join('黃權', wei, null, 70); out.push('黃權歸路斷絕，降魏'); } }
      if (h.on('馬良') === l) { h.kill('馬良', '馬良於夷陵戰死。'); out.push('馬良戰死'); }
      if (h.owns(l, '永安')) { const lb = h.g('劉備'); if (!lb.army) lb.city = cityId('永安'); }
      h.set('yiling'); return out.join('，') + '。陸遜一戰成名。';
    },
  },
  {
    id: 'baidi', ch: 4, src: 'b', title: '白帝託孤', y: [222, 223],
    who: (s, h) => { const l = h.isRuler('劉備'); return l && (h.flag('yiling') || s.year * 12 + s.month >= 222 * 12 + 9) && h.on('諸葛亮') === l ? { fid: l } : null; },
    lines: () => [['', '劉備病重於永安宮，召諸葛亮於成都。'], ['劉備', '君才十倍曹丕，必能安國，終定大事。若嗣子可輔，輔之；如其不才，君可自取。'], ['諸葛亮', '臣敢竭股肱之力，效忠貞之節，繼之以死！'], ['劉備', '勿以惡小而為之，勿以善小而不為。']],
    choices: [
      { t: '託孤於諸葛亮', hist: true, d: '劉備病逝，劉禪繼位，諸葛亮輔政（忠誠 100）', run: (s, h, c) => {
        if (h.on('劉禪') === c.fid) h.crown(c.fid, '劉禪');
        h.kill('劉備', '劉備病逝於白帝城永安宮，年六十三。'); h.loyal('諸葛亮', 100); h.set('baidi', c.fid);
        return `昭烈帝駕崩，${h.ruler(c.fid) ? h.ruler(c.fid).name : '太子'}繼位，政事無巨細，咸決於諸葛亮。`;
      } },
      { t: '「君可自取」：傳位諸葛亮', d: '劉備病逝，由諸葛亮繼位', run: (s, h, c) => { h.crown(c.fid, '諸葛亮'); h.kill('劉備', '劉備病逝於白帝城永安宮。'); if (h.on('劉禪') === c.fid) h.loyal('劉禪', -30); h.set('baidi', c.fid); return '諸葛亮涕泣受命，繼承大業。'; } },
    ],
  },

  // ===== 第五章 北伐中原 =====
  {
    id: 'nanman', ch: 5, src: 'z', title: '南中叛亂', y: [223, 225],
    who: (s, h) => !h.alive('meng') && h.live('孟獲') && !h.on('孟獲') && ['建寧', '越巂', '永昌'].some(n => h.owner(n) !== s.player) ? { fid: null } : null,
    lines: () => [['', '劉備新喪，南中豪帥雍闓殺太守叛亂，蠻王孟獲聚眾響應，越巂、建寧、永昌皆反。']],
    choices: [{ t: '南中自立', hist: true, run: (s, h) => { h.g('孟獲').lock = 0; const cs = ['建寧', '越巂', '永昌'].filter(n => h.owner(n) !== s.player && (!h.owner(n) || R.citiesOf(s, h.owner(n)).length > 1)); return h.spawn('meng', '孟獲', cs, ['祝融'], true) ? '孟獲稱雄南中。' : '南中豪帥各自為政。'; } }],
  },
  {
    id: 'qiqin', ch: 5, src: 'b', title: '七擒孟獲', y: [225, 227],
    who: (s, h) => { const p = h.isRuler('孟獲'), z = h.on('諸葛亮'); return p && z && p !== z && ['越巂', '建寧', '永昌'].some(n => h.near(z, n)) ? { fid: s.player === p ? p : z, also: [z, p] } : null; },
    lines: () => [['馬謖', '用兵之道，攻心為上，攻城為下；心戰為上，兵戰為下。願丞相但服其心足矣。'], ['', '諸葛亮渡瀘水南征，擒孟獲而縱之，如是者七。'], ['孟獲', '丞相天威，南人不復反矣！']],
    choices: [
      { t: '攻心為上，七擒七縱', hist: true, d: '看諸葛亮的謀：成功則南中永久歸順，孟獲、祝融加入；失敗則瘴氣折損兵力', ok: (s, h, c) => c.fid === c.also[0],
        p: (s, h) => R.clamp(h.g('諸葛亮').int - 20, 20, 85), run: (s, h, c, r) => STORY.find(e => e.id === 'qiqin').go(s, h, c, r.win ? 'heart' : 'fail') },
      { t: '以力征服', d: '成功則奪得南中但民心低落、孟獲被斬', ok: (s, h, c) => c.fid === c.also[0], p: () => 55,
        run: (s, h, c, r) => STORY.find(e => e.id === 'qiqin').go(s, h, c, r.win ? 'force' : 'fail') },
      { t: '誓死不服', hist: true, d: '多半被七擒七縱而心服歸順（勢力併入對方）', ok: (s, h, c) => c.fid === c.also[1], p: (s, h) => R.clamp(110 - h.g('諸葛亮').int, 10, 50),
        run: (s, h, c, r) => STORY.find(e => e.id === 'qiqin').go(s, h, c, r.win ? 'fail' : 'heart') },
      { t: '舉族歸順', d: '勢力併入對方（遊戲結束）', ok: (s, h, c) => c.fid === c.also[1], run: (s, h, c) => STORY.find(e => e.id === 'qiqin').go(s, h, c, 'heart') },
    ],
    go(s, h, c, how) {
      const [z, p] = c.also;
      if (how === 'fail') { h.capTroops(z, 0.85); return '瀘水瘴氣瀰漫，蜀軍染病者眾，無功而返。'; }
      const cs = R.citiesOf(s, p).map(x => x.name);
      if (how === 'heart') {
        h.absorb(p, z, 'join', 95); for (const n of cs) h.order(n, 40); h.set('nanzhong', z);
        return '孟獲心服，南中平定。諸葛亮即其渠帥而用之，不留兵、不運糧，綱紀粗定，夷漢粗安。';
      }
      h.absorb(p, z, 'kill', 50); for (const n of cs) h.C(n).order = 20; h.set('nanzhong', z);
      return '蜀軍強行平定南中，孟獲被斬，蠻人怨聲載道。';
    },
  },
  {
    id: 'chushi', ch: 5, src: 'b', title: '出師表', y: [226, 228],
    who: (s, h) => { const z = h.on('諸葛亮'); if (!z || !(h.flag('nanzhong') === z || s.year >= 227)) return null; const f = ['天水', '散關', '長安', '陽平關', '安定'].map(n => h.owner(n)).find(o => o && h.war(z, o)); return f ? { fid: z, also: [f] } : null; },
    lines: () => [['諸葛亮', '先帝創業未半而中道崩殂。今天下三分，益州疲弊，此誠危急存亡之秋也。'], ['諸葛亮', '臣本布衣，躬耕於南陽，苟全性命於亂世，不求聞達於諸侯。先帝不以臣卑鄙，猥自枉屈，三顧臣於草廬之中。'], ['諸葛亮', '今南方已定，兵甲已足，當獎率三軍，北定中原，庶竭駑鈍，攘除奸凶，興復漢室，還於舊都。'], ['', '臨表涕零，不知所言。']],
    choices: [
      { t: '上出師表，北伐中原', hist: true, d: '各城民心 +5；漢中兵力 +4000；諸葛亮德 +2', run: (s, h, c) => { for (const cc of R.citiesOf(s, c.fid)) cc.order = R.clamp(cc.order + 5, 0, 100); if (h.owns(c.fid, '漢中')) h.troops('漢中', 1, 4000); h.stat('諸葛亮', 'cha', 2); h.hostile(c.fid, c.also[0]); h.set('chushi', c.fid); return '諸葛亮率大軍屯於漢中，北伐中原。'; } },
      { t: '休養生息', d: '各城農田 +60', run: (s, h, c) => { for (const cc of R.citiesOf(s, c.fid)) cc.farm = Math.min(R.capOf(cc), cc.farm + 60); return '蜀中閉關息民，務農殖穀。'; } },
    ],
  },
  {
    id: 'jiangwei', ch: 5, src: 'b', title: '姜維歸漢', y: [227, 229],
    who: (s, h) => { const z = h.flag('chushi'); if (!z || h.on('諸葛亮') !== z || !h.live('姜維') || h.isRuler('姜維')) return null; const f = h.on('姜維'); return (h.free('姜維') || (f && f !== z)) && ['天水', '散關', '陽平關', '漢中'].some(n => h.near(z, n)) ? { fid: z, also: [f].filter(Boolean) } : null; },
    lines: () => [['', '諸葛亮兵出祁山，天水郡中郎將姜維識破其計，反將趙雲困住。'], ['諸葛亮', '吾自出茅廬以來，遍求賢者，欲傳授平生之學，恨未得其人。今遇伯約，吾願足矣。'], ['', '諸葛亮使反間計，令姜維進退無路。姜維下馬拜降。']],
    choices: [
      { t: '巧計收姜維', hist: true, d: '看諸葛亮的謀：成功則姜維加入（忠誠 95）', p: (s, h) => R.clamp(h.g('諸葛亮').int - 20, 20, 90),
        run: (s, h, c, r) => { if (!r.win) return '姜維奉母出走，不知所蹤。'; h.g('姜維').lock = 0; h.join('姜維', c.fid, null, 95); h.set('jiangwei'); return '諸葛亮得姜維，傳以兵法。'; } },
      { t: '強攻天水', d: '天水守軍大減', run: (s, h) => { if (h.owner('天水')) h.troops('天水', 0.6); return '蜀軍猛攻天水，姜維隨太守退走。'; } },
    ],
  },
  {
    id: 'jieting', ch: 5, src: 'b', title: '街亭失守・揮淚斬馬謖', y: [228, 229],
    who: (s, h) => { const z = h.flag('chushi'); if (!z || h.on('諸葛亮') !== z || h.on('馬謖') !== z) return null; const f = h.on('張郃') || h.on('司馬懿'); return f && f !== z && h.war(z, f) ? { fid: z, also: [f] } : null; },
    lines: () => [['馬謖', '某自幼熟讀兵書，頗知兵法。豈一街亭不能守耶？願立軍令狀。'], ['王平', '當道下寨，築起城垣，賊兵縱有十萬，不能偷過。'], ['馬謖', '居高臨下，勢如劈竹。此山乃絕地，置之死地而後生！'], ['', '張郃斷其汲道，蜀軍不戰自亂，街亭失守。']],
    choices: [
      { t: '命馬謖守街亭', hist: true, d: '多半失守：兵力 -20%，揮淚斬馬謖', p: () => 20,
        run: (s, h, c, r) => { if (r.win) { h.capTroops(c.also[0], 0.85); h.stat('馬謖', 'cha', 3); return '馬謖死守街亭，張郃無功而返。'; } h.capTroops(c.fid, 0.8); h.kill('馬謖', '諸葛亮揮淚斬馬謖，自貶三等。'); h.set('jieting'); return '街亭失守，北伐大計功虧一簣。'; } },
      { t: '改派王平、魏延鎮守', d: '需王平或魏延在麾下：勝算較高', ok: (s, h, c) => h.on('王平') === c.fid || h.on('魏延') === c.fid, p: () => 60,
        run: (s, h, c, r) => { if (r.win) { h.capTroops(c.also[0], 0.85); return '街亭穩如泰山，魏軍無隙可乘。'; } h.capTroops(c.fid, 0.85); h.set('jieting'); return '張郃兵多，街亭終究失守。'; } },
    ],
  },
  {
    id: 'kongcheng', ch: 5, src: 'y', title: '空城計', y: [228, 229],
    who: (s, h) => { const z = h.on('諸葛亮'), f = h.on('司馬懿'); return h.flag('jieting') && z && f && z !== f && h.war(z, f) ? { fid: s.player === f ? f : z, also: [z, f] } : null; },
    lines: () => [['', '司馬懿引十五萬大軍蜂擁而來，西城中只有二千五百軍士。'], ['諸葛亮', '大開四門，每門用二十軍士扮作百姓，灑掃街道。'], ['', '諸葛亮披鶴氅，戴綸巾，攜琴一張，於城上敵樓前憑欄而坐，焚香操琴。'], ['司馬懿', '亮平生謹慎，不曾弄險。今大開城門，必有埋伏。'], ['諸葛亮', '吾非行險，蓋因不得已而用之。']],
    choices: [
      { t: '大開城門，焚香操琴', hist: true, d: '諸葛亮與司馬懿鬥智：成功則司馬懿退兵；失敗則兵力大減', ok: (s, h, c) => c.fid === c.also[0],
        p: (s, h) => R.clamp(h.g('諸葛亮').int - h.g('司馬懿').int + 70, 20, 95), run: (s, h, c, r) => STORY.find(e => e.id === 'kongcheng').go(s, h, c, r.win) },
      { t: '棄城而走', d: '兵力 -10%', ok: (s, h, c) => c.fid === c.also[0], run: (s, h, c) => { h.capTroops(c.fid, 0.9); return '諸葛亮棄西城而走，退回漢中。'; } },
      { t: '恐有埋伏，退兵', hist: true, d: '諸葛亮安然脫身', ok: (s, h, c) => c.fid === c.also[1], run: (s, h, c) => STORY.find(e => e.id === 'kongcheng').go(s, h, c, true) },
      { t: '派兵入城一探', d: '看司馬懿的謀：成功則蜀軍兵力大減', ok: (s, h, c) => c.fid === c.also[1], p: () => 40,
        run: (s, h, c, r) => STORY.find(e => e.id === 'kongcheng').go(s, h, c, !r.win) },
    ],
    go(s, h, c, zhugeWin) {
      const [z, f] = c.also;
      if (zhugeWin) { h.stat('諸葛亮', 'cha', 3); h.set('kongcheng'); return '司馬懿疑有伏兵，倉皇退走。諸葛亮撫掌大笑。'; }
      h.capTroops(z, 0.75); h.stat('司馬懿', 'cha', 2); return '司馬懿識破空城，蜀軍死傷慘重，諸葛亮僅以身免。';
    },
  },
  {
    id: 'wudi', ch: 5, src: 'z', title: '孫權稱帝', y: [229, 230],
    who: (s, h) => { const w = h.isRuler('孫權'); return w && h.rank(w) < 3 && (R.fac(s, w).realm === '吳' || h.ncity(w) >= 8) ? { fid: w } : null; },
    lines: () => [['', '夏口、武昌並言黃龍、鳳凰見。孫權於武昌南郊即皇帝位，改元黃龍，秋遷都建業。'], ['孫權', '周公瑾不在，孤豈能至此？']],
    choices: [
      { t: '即皇帝位，遷都建業', hist: true, d: '國號「吳」、稱帝（軍令 +2）；與蜀並尊二帝、關係 +20', run: (s, h, c) => { h.realm(c.fid, '吳', 3); const sh = h.flag('shu_emp'); if (sh && h.alive(sh) && sh !== c.fid) { h.rel(c.fid, sh, 20); h.ally(c.fid, sh); } h.set('wu_emp', c.fid); return '孫權稱帝，三國鼎立之局正式形成。吳蜀約定中分天下。'; } },
      { t: '仍稱吳王', d: '孫權德 +2', run: (s, h) => { h.stat('孫權', 'cha', 2); return '孫權暫不稱帝。'; } },
    ],
  },
  {
    id: 'wuzhang', ch: 5, src: 'b', title: '星落五丈原', y: [233, 235], m: [6, 11],
    who: (s, h) => { const z = h.on('諸葛亮'); return z && (h.flag('chushi') === z || s.year >= 234) ? { fid: z, also: [h.on('司馬懿')].filter(x => x && x !== z) } : null; },
    lines: () => [['', '諸葛亮屯兵五丈原，與司馬懿相持百餘日。司馬懿堅守不出，諸葛亮遺以巾幗婦人之服。'], ['司馬懿', '食少事煩，其能久乎？'], ['', '諸葛亮積勞成疾，夜觀天象，見將星搖搖欲墜。'], ['諸葛亮', '再不能臨陣討賊矣！悠悠蒼天，曷此其極！']],
    choices: [
      { t: '安排後事', hist: true, d: '諸葛亮病逝；「死諸葛走生仲達」：與司馬懿所在勢力停戰一年；姜維忠誠 100', run: (s, h, c) => STORY.find(e => e.id === 'wuzhang').go(s, h, c) },
      { t: '七星燈祈禳延壽', d: '成功率極低：成功則壽命延長 12 年', p: () => 8,
        run: (s, h, c, r) => { if (r.win) { h.g('諸葛亮').died += 12; return '主燈七日不滅，諸葛亮病體漸癒！'; } return '魏延急入帳報事，腳步踏滅主燈。諸葛亮棄劍嘆曰：「死生有命，不可得而禳也！」' + STORY.find(e => e.id === 'wuzhang').go(s, h, c); } },
    ],
    go(s, h, c) {
      h.kill('諸葛亮', '諸葛亮病逝於五丈原軍中，年五十四。'); h.loyal('姜維', 100);
      const f = c.also[0]; if (f && h.alive(f)) h.truce(c.fid, f, 12);
      h.set('wuzhang'); return '蜀軍依遺計，推出木像，司馬懿疑有詐，退走五十里。「死諸葛走生仲達」。';
    },
  },

  // ===== 第六章 三國歸晉 =====
  {
    id: 'mingdi', ch: 6, src: 'z', title: '魏明帝託孤', y: [238, 239],
    who: (s, h) => { const f = h.isRuler('曹叡'); return f && h.on('曹爽') === f && h.on('司馬懿') === f ? { fid: f } : null; },
    lines: () => [['', '魏明帝曹叡病重，太子年幼，召曹爽、司馬懿入宮託孤。'], ['曹叡', '死乃復可忍，朕忍死待君，君其與爽輔少子。']],
    choices: [
      { t: '託孤曹爽、司馬懿', hist: true, d: '曹叡病逝，曹爽輔政（成為君主）', run: (s, h, c) => { h.crown(c.fid, '曹爽'); h.kill('曹叡', '魏明帝曹叡駕崩，年三十六。'); h.set('tuogu'); return '曹爽與司馬懿共同輔政，曹爽專權，司馬懿稱病不出。'; } },
      { t: '獨任司馬懿', d: '曹叡病逝，司馬懿輔政（成為君主）', run: (s, h, c) => { h.crown(c.fid, '司馬懿'); h.kill('曹叡', '魏明帝曹叡駕崩。'); h.set('gaoping', c.fid); return '司馬懿獨掌魏國大權。'; } },
    ],
  },
  {
    id: 'gaoping', ch: 6, src: 'z', title: '高平陵之變', y: [247, 250],
    who: (s, h) => { const f = h.on('司馬懿'); return f && h.isRuler('曹爽') === f ? { fid: f } : null; },
    lines: () => [['', '司馬懿裝病多年，曹爽不以為意。正月，曹爽奉少帝出城謁高平陵。'], ['司馬懿', '閉城門，據武庫，屯兵洛水浮橋！'], ['桓範', '大將軍何不挾天子至許昌，調四方兵討之？'], ['曹爽', '我不失作富家翁。']],
    choices: [
      { t: '曹爽交出兵權', hist: true, d: '曹爽被誅，司馬懿掌權（成為君主）', run: (s, h, c) => { h.crown(c.fid, '司馬懿'); h.kill('曹爽', '曹爽兄弟被夷三族。'); h.set('gaoping', c.fid); return '司馬氏從此掌握魏國大權，曹氏宗室日益衰微。'; } },
      { t: '挾天子至許昌討司馬懿', d: '成功則司馬懿被罷黜；失敗則同史實', p: () => 35,
        run: (s, h, c, r) => { if (!r.win) return STORY.find(e => e.id === 'gaoping').choices[0].run(s, h, c); h.leave('司馬懿'); h.g('司馬懿').status = 'hidden'; h.g('司馬懿').lock = 9999; h.loyal('司馬師', -30); h.loyal('司馬昭', -30); return '曹爽聽從桓範之計，司馬懿事敗被罷，閉門不出。'; } },
    ],
  },
  {
    id: 'beifa', ch: 6, src: 'b', title: '姜維九伐中原', y: [249, 262],
    who: (s, h) => { const z = h.on('姜維'); if (!z || h.live('諸葛亮') && h.on('諸葛亮') === z) return null; const f = ['天水', '散關', '長安', '陽平關', '安定'].map(n => h.owner(n)).find(o => o && o !== z && h.war(z, o)); return f ? { fid: z, also: [f] } : null; },
    lines: () => [['費禕', '吾等不如丞相亦已遠矣，丞相猶不能定中夏，況吾等乎？'], ['姜維', '丞相六出祁山，壯志未酬。維受丞相厚恩，敢不繼其遺志！'], ['', '姜維連年出兵，與鄧艾、郭淮大戰於洮西、段谷，互有勝負。']],
    choices: [
      { t: '繼承遺志，連年北伐', hist: true, d: '金 -400、糧 -2000；雙方各城兵力 -10%', run: (s, h, c) => { h.gold(c.fid, -400); h.food(c.fid, -2000); h.capTroops(c.fid, 0.9); h.capTroops(c.also[0], 0.9); h.hostile(c.fid, c.also[0]); h.set('beifa'); return '姜維九伐中原，雖有洮西大捷，蜀中國力日漸疲弊。'; } },
      { t: '屯田沓中，休養生息', d: '各城農田 +60', run: (s, h, c) => { for (const cc of R.citiesOf(s, c.fid)) cc.farm = Math.min(R.capOf(cc), cc.farm + 60); return '姜維屯田沓中，以避朝中黃皓之禍。'; } },
    ],
  },
  {
    id: 'yinping', ch: 6, src: 'b', title: '偷渡陰平・蜀漢滅亡', y: [262, 264],
    who: (s, h) => { const sh = h.isRuler('劉禪'), f = h.on('鄧艾'); return sh && f && sh !== f && h.war(sh, f) && h.owns(sh, '成都') && ['劍閣', '梓潼', '漢中', '陽平關', '江州'].some(n => h.near(f, n)) ? { fid: s.player === f ? f : sh, also: [sh, f] } : null; },
    lines: () => [['', '姜維退守劍閣，鍾會十萬大軍不能前進。'], ['鄧艾', '今從陰平由邪徑出漢德陽亭，出劍閣西百里，去成都三百餘里，奇兵衝其腹心。'], ['', '鄧艾行無人之地七百餘里，鑿山通道，造作橋閣。至摩天嶺，以氈自裹，推轉而下。'], ['譙周', '自古以來，無寄他國為天子者。不如降魏，必裂土以封陛下。'], ['劉禪', '此間樂，不思蜀。']],
    choices: [
      { t: '聽譙周之議，開城出降', hist: true, d: '蜀漢滅亡，全部城池與部將歸魏（遊戲結束）', ok: (s, h, c) => c.fid === c.also[0], run: (s, h, c) => STORY.find(e => e.id === 'yinping').go(s, h, c) },
      { t: '背城一戰', d: '成功則鄧艾孤軍覆沒；失敗則亡國', ok: (s, h, c) => c.fid === c.also[0], p: () => 40,
        run: (s, h, c, r) => { if (!r.win) return STORY.find(e => e.id === 'yinping').go(s, h, c); h.capTroops(c.also[1], 0.8); h.kill('鄧艾', '鄧艾孤軍深入，兵敗綿竹而死。'); return '蜀軍背城死戰，鄧艾全軍覆沒！'; } },
      { t: '偷渡陰平', hist: true, d: '成功則蜀漢滅亡，全部城池與部將歸你', ok: (s, h, c) => c.fid === c.also[1], p: () => 70,
        run: (s, h, c, r) => { if (r.win) return STORY.find(e => e.id === 'yinping').go(s, h, c); h.capTroops(c.fid, 0.85); return '陰平道路斷絕，鄧艾無功而返。'; } },
      { t: '強攻劍閣', d: '成功率低', ok: (s, h, c) => c.fid === c.also[1], p: () => 25,
        run: (s, h, c, r) => { if (r.win) return STORY.find(e => e.id === 'yinping').go(s, h, c); h.capTroops(c.fid, 0.85); return '姜維死守劍閣，魏軍久攻不下。'; } },
    ],
    go(s, h, c) {
      const [sh, f] = c.also; h.absorb(sh, f, 'retire', 60); h.set('shu_fallen', f);
      return '劉禪面縛出降，蜀漢滅亡，共歷二帝四十三年。劉禪被封為安樂公，遷往洛陽。';
    },
  },
  {
    id: 'zhonghui', ch: 6, src: 'z', title: '鍾會之亂', y: [263, 265],
    who: (s, h) => { const f = h.flag('shu_fallen'); return f && h.on('鍾會') === f && !h.isRuler('鍾會') && h.owns(f, '成都') ? { fid: f } : null; },
    lines: () => [['姜維', '聞君自淮南以來，算無遺策。今功成名立，何不泛舟絕跡，以全身遠禍？'], ['鍾會', '我欲據蜀以成劉備之業，有何不可？'], ['', '鍾會、姜維誣陷鄧艾謀反，囚之於檻車。正月十五，鍾會矯詔起兵。']],
    choices: [
      { t: '鍾會矯詔起兵', hist: true, d: '鍾會多半事敗：鍾會、姜維、鄧艾皆死；成功則鍾會據益州自立', p: () => 20, run: (s, h, c, r) => {
        if (!r.win) { h.kill('鍾會', '亂兵攻入，鍾會被殺，年四十。'); h.kill('姜維', '姜維事敗，自刎而死，年六十三。'); h.kill('鄧艾', '衛瓘遣兵追殺鄧艾於綿竹。'); h.set('zhonghui_dead'); return '鍾會之亂旋即平定，一代名將鄧艾、姜維、鍾會同日殞命。'; }
        const cs = ['成都', '梓潼', '江州', '越巂', '建寧', '永昌', '劍閣'].filter(n => h.owns(c.fid, n));
        h.leave('鍾會'); h.leave('姜維');
        if (!h.spawn('zhong', '鍾會', cs, ['姜維'], true)) { h.join('鍾會', c.fid); h.join('姜維', c.fid); return '鍾會起兵失敗。'; }
        h.hostile('zhong', c.fid); h.rel('zhong', c.fid, -60); h.kill('鄧艾', '鄧艾被鍾會所殺。'); return '鍾會據成都自立，姜維為其謀主，欲復興蜀漢。';
      } },
      { t: '先發制人，收捕鍾會', d: '鍾會、姜維被殺；鄧艾無恙', run: (s, h) => { h.kill('鍾會', '鍾會謀反事泄被誅。'); h.kill('姜維', '姜維與鍾會同死。'); return '監軍衛瓘先發制人，蜀地平靜。'; } },
    ],
  },
  {
    id: 'jin', ch: 6, src: 'z', title: '司馬炎代魏建晉', y: [264, 266],
    who: (s, h) => { const f = h.on('司馬炎'); if (!f) return null; const r = h.ruler(f); return r && r.name.startsWith('司馬') && R.fac(s, f).realm !== '晉' ? { fid: f } : null; },
    lines: () => [['', '司馬昭病逝，其子司馬炎繼為晉王。'], ['賈充', '魏室氣數已盡，晉王宜效漢魏故事，受禪即位。'], ['', '魏元帝曹奐禪位於司馬炎，司馬炎即皇帝位，國號晉，改元泰始。']],
    choices: [
      { t: '受禪建晉', hist: true, d: '國號「晉」、稱帝（軍令 +2）；司馬炎為君主', run: (s, h, c) => { h.crown(c.fid, '司馬炎'); h.realm(c.fid, '晉', 3); s.emperor = null; h.set('jin', c.fid); return '司馬炎代魏稱帝，國號晉。曹魏立國四十六年而亡。'; } },
      { t: '仍為魏臣', d: '司馬炎德 +5', run: (s, h) => { h.stat('司馬炎', 'cha', 5); return '司馬炎效法周文王，終身為魏臣。'; } },
    ],
  },
  {
    id: 'yanglu', ch: 6, src: 'b', title: '羊陸之交', y: [269, 274],
    who: (s, h) => { const j = h.on('羊祜'), w = h.on('陸抗'); return j && w && j !== w && R.citiesOf(s, j).some(x => R.citiesOf(s, w).some(y => ADJ[x.id].includes(y.id))) ? { fid: s.player === w ? w : j, also: [j, w] } : null; },
    lines: () => [['', '羊祜鎮守襄陽，陸抗鎮守江陵，兩軍對壘。'], ['羊祜', '陸抗病了，以此藥贈之。'], ['陸抗', '羊叔子豈酖人者！'], ['', '陸抗服藥即癒，又遣使送酒給羊祜，羊祜飲之不疑。兩人各保境息民，不以小利相侵。']],
    choices: [
      { t: '互贈藥酒，以德相待', hist: true, d: '兩國停戰兩年；羊祜、陸抗德 +3', run: (s, h, c) => { const [j, w] = c.also; h.truce(j, w, 24); h.rel(j, w, 20); h.stat('羊祜', 'cha', 3); h.stat('陸抗', 'cha', 3); h.set('yanglu'); return '羊祜、陸抗以德相待，邊境安寧。'; } },
      { t: '趁對方病重進兵', d: '成功則奪取對方一座接壤城池；失敗則兵力 -10%', p: () => 40, run: (s, h, c, r) => {
        const [j, w] = c.also; const foe = c.fid === j ? w : j; h.hostile(j, w);
        if (!r.win) { h.capTroops(c.fid, 0.9); return '對方早有防備，偷襲不成。'; }
        const t = R.citiesOf(s, foe).find(x => R.citiesOf(s, c.fid).some(y => ADJ[y.id].includes(x.id)));
        if (t && R.citiesOf(s, foe).length > 1) { h.give(t.name, c.fid); return `乘虛奪取${t.name}。`; }
        return '敵軍堅守，無隙可乘。';
      } },
    ],
  },
  {
    id: 'wuwang_end', ch: 6, src: 'b', title: '王濬樓船・三分歸一統', y: [279, 281],
    who: (s, h) => { const j = h.flag('jin') || h.isRuler('司馬炎'), w0 = h.isRuler('孫皓') || (h.alive('sun') && R.fac(s, 'sun').realm === '吳' ? 'sun' : null), w = w0 && !['蜀', '魏', '晉'].includes(R.fac(s, w0).realm) ? w0 : null; return j && w && h.alive(j) && j !== w && !h.live('陸抗') && h.war(j, w) && R.citiesOf(s, j).some(x => R.citiesOf(s, w).some(y => ADJ[x.id].includes(y.id))) ? { fid: s.player === w ? w : j, also: [j, w] } : null; },
    lines: () => [['杜預', '自閏月以來，賊但敕嚴，下無兵上。今兵威已振，譬如破竹，數節之後，皆迎刃而解。'], ['', '王濬自益州造大船，連舫百二十步，順江而下。吳人以鐵鎖橫江，王濬以火炬燒熔鐵鎖。'], ['', '王濬樓船下益州，金陵王氣黯然收。千尋鐵鎖沉江底，一片降幡出石頭。'], ['', '孫皓面縛輿櫬，詣軍門出降。']],
    choices: [
      { t: '王濬樓船順江東下', hist: true, d: '成功則東吳滅亡，全部城池與部將歸你', ok: (s, h, c) => c.fid === c.also[0], p: (s, h, c) => ['成都', '江州', '永安'].some(n => h.owns(c.fid, n)) ? 85 : 55,
        run: (s, h, c, r) => { if (r.win) return STORY.find(e => e.id === 'wuwang_end').go(s, h, c); h.capTroops(c.fid, 0.85); return '吳軍據江死守，晉軍無功而返。'; } },
      { t: '面縛出降', hist: true, d: '東吳滅亡（遊戲結束）', ok: (s, h, c) => c.fid === c.also[1], run: (s, h, c) => STORY.find(e => e.id === 'wuwang_end').go(s, h, c) },
      { t: '鐵鎖橫江，死守建業', d: '成功則晉軍大挫；失敗則亡國', ok: (s, h, c) => c.fid === c.also[1], p: () => 35,
        run: (s, h, c, r) => { if (!r.win) return STORY.find(e => e.id === 'wuwang_end').go(s, h, c); h.capTroops(c.also[0], 0.8); return '吳軍死守長江天塹，晉軍樓船折損大半。'; } },
    ],
    go(s, h, c) {
      const [j, w] = c.also; const wn = h.ruler(w).name; h.absorb(w, j, 'retire', 60); h.set('sanguo_end', j);
      const left = Object.values(s.factions).filter(f => f.alive).length;
      return `${wn}出降，東吳滅亡。${left === 1 ? '自黃巾之亂以來近百年，天下重歸一統。' : ''}「話說天下大勢，分久必合，合久必分。」`;
    },
  },
];

// ---------- 引擎 ----------
const byId = Object.fromEntries(STORY.map(e => [e.id, e]));
export const storyById = id => byId[id];

function inWindow(s, ev) {
  if (!ev.y) return false;
  const t = s.year * 12 + s.month, ext = s.opt.story === 'yanyi' ? 2 : 0;
  const [m0, m1] = ev.m || [0, 11];
  return t >= ev.y[0] * 12 + m0 && t <= (ev.y[1] + ext) * 12 + m1;
}

export function choicesFor(s, ev, c) {
  const h = helpers(s);
  return ev.choices.map((ch, i) => ({ ch, i, ok: !ch.ok || ch.ok(s, h, c) })).filter(x => x.ok);
}

export function chanceOf(s, ev, c, ch) { return ch.p ? R.clamp(Math.round(ch.p(s, helpers(s), c)), 0, 100) : null; }
export function duelOf(s, ev, c, ch) { return ch.duel ? ch.duel(s, helpers(s), c) : null; }

function aiPick(s, ev, c) {
  const list = choicesFor(s, ev, c);
  const hist = list.filter(x => x.ch.hist);
  const pHist = s.opt.story === 'yanyi' ? 90 : 60;
  if (hist.length && (list.length === hist.length || R.chance(s, pHist))) return hist[0].i;
  const other = list.filter(x => !x.ch.hist);
  return (other.length ? R.pick(s, other) : list[0]).i;
}

// 套用抉擇；r.win 未給時自動擲骰或自動單挑
export function resolve(s, ev, c, k, r = {}) {
  const h = helpers(s);
  const ch = ev.choices[k];
  if (r.win == null && ch.p) r.win = R.chance(s, chanceOf(s, ev, c, ch));
  if (r.win == null && ch.duel) { const d = duelOf(s, ev, c, ch); if (d) r.win = autoDuel(s, d[0], d[1]).winner === 'a'; }
  const txt = ch.run(s, h, c, r) || '';
  if (ch.again) { delete s.story.done[ev.id]; R.log(s, `【${ev.title}】${txt}`, 'story'); return { txt, win: r.win }; }
  s.story.done[ev.id] = true;
  s.story.rec.unshift({ id: ev.id, t: R.seasonName(s), c: ch.t, txt, hist: !!ch.hist });
  const mine = c.fid === s.player || (c.also || []).includes(s.player);
  R.log(s, `【${ev.title}】${txt}`, mine ? 'big' : 'story');
  return { txt, win: r.win };
}

// 每月檢查：回傳要給玩家看的事件 [{ ev, c, kind: 'choose' | 'watch' | 'news', res? }]
// 依地盤晉爵：7 城為公、12 城為王（劇情另有國號與稱帝）
function rankTick(s) {
  for (const f of Object.values(s.factions)) {
    if (!f.alive) continue;
    const n = R.citiesOf(s, f.id).filter(c => c.kind === 'city').length, rk = f.rank || 0;
    const to = n >= 12 && rk < 2 ? 2 : n >= 7 && rk < 1 ? 1 : 0;
    if (!to) continue;
    f.rank = to; R.facName(s, f.id);
    R.log(s, `${f.name}晉爵為${R.rankTitle(s, f.id)}。`, f.id === s.player ? 'big' : '');
  }
}

export function storyMonth(s, allAI = false) {
  if (s.month === 0) rankTick(s);
  if (!s.story || !s.opt || s.opt.story === 'off') return [];
  const out = [];
  for (const ev of STORY) {
    if (s.story.done[ev.id] || !inWindow(s, ev)) continue;
    const h = helpers(s);
    const c = ev.who(s, h);
    if (!c) continue;
    if (!choicesFor(s, ev, c).length) continue;
    if (!allAI && c.fid === s.player) { out.push({ ev, c, kind: 'choose' }); s.story.done[ev.id] = true; }
    else {
      const k = aiPick(s, ev, c);
      const res = resolve(s, ev, c, k);
      out.push({ ev, c, k, res, kind: !allAI && (c.also || []).includes(s.player) ? 'watch' : 'news' });
    }
    if (out.length >= 4) break;
  }
  return out;
}

// 俘虜特殊劇情（白門樓、土山約三事）
export function captiveEvent(s, fid, gid) {
  if (!s.story || !s.opt || s.opt.story === 'off') return null;
  const g = R.gen(s, gid);
  const ev = STORY.find(e => e.captive === g.name && !s.story.done[e.id] && s.year >= (e.from || 0));
  if (!ev) return null;
  if (ev.id === 'tushan' && !(R.fac(s, fid).ruler === s.generals.find(x => x.name === '曹操').id && helpers(s).isRuler('劉備'))) return null;
  return { ev, c: { fid } };
}

// 電腦俘獲特殊人物時自動處理；回傳是否已處理
export function aiCaptive(s, fid, gid) {
  const e = captiveEvent(s, fid, gid);
  if (!e) return false;
  resolve(s, e.ev, e.c, aiPick(s, e.ev, e.c));
  return true;
}
