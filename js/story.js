// 劇情事件：依《三國演義》與正史《三國志》改編。不碰畫面。
// 事件條件成立才發生；玩家勢力是主角時由玩家抉擇，其餘由電腦依史實（演義模式約九成）決定。
import * as R from './rules.js';
import { ADJ } from './rules.js';
import { autoDuel } from './battle.js';
import { cityId, EXTRA_FACTIONS } from './data.js';

export const CHAPTERS = ['', '群雄討董', '群雄逐鹿', '官渡與赤壁'];
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
    crown(fid, n) { const x = g(n); if (!alive(fid) || !x || x.status !== 'active' || x.faction !== fid) return false; const f = R.fac(s, fid); f.ruler = x.id; f.name = x.name; x.loyalty = 100; return true; },
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
      f.alive = true; f.name = rulerName; f.gold = def.gold; f.food = def.food; f.truce = {}; f.alliance = {};
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
      const cands = Object.values(s.factions).filter(f => f.alive && f.id !== s.emperor && near.some(n => h.owns(f.id, n)));
      if (!cands.length) return null;
      const f = cands.find(x => x.id === s.player) || cands.find(x => x.ruler === h.g('曹操').id) || cands[0];
      return { fid: f.id, also: [s.emperor] };
    },
    lines: (s, h, c) => [['', '天子在李傕、郭汜挾持下顛沛流離，終於逃回殘破的洛陽，百官披荊棘、依牆壁而居。'], [h.on('荀彧') === c.fid ? '荀彧' : '', '昔晉文公納周襄王而諸侯景從，今奉天子以從眾望，大順也。']],
    choices: [
      { t: '迎奉天子', hist: true, d: '天子歸你，軍令 +1；許昌若為中立則取得許昌；金 +300', run: (s, h, c) => { s.emperor = c.fid; h.gold(c.fid, 300); if (!h.owner('許昌')) { h.C('許昌').owner = c.fid; h.C('許昌').troops = Math.max(h.C('許昌').troops, 3000); } h.set('tianzi', c.fid); return `${h.nm(c.fid)}迎天子都許，從此挾天子以令諸侯。`; } },
      { t: '置之不理', d: '天子留在原處，別人仍可迎奉', run: () => '天子依舊流離。' },
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
  s.story.done[ev.id] = true;
  s.story.rec.unshift({ id: ev.id, t: R.seasonName(s), c: ch.t, txt, hist: !!ch.hist });
  const mine = c.fid === s.player || (c.also || []).includes(s.player);
  R.log(s, `【${ev.title}】${txt}`, mine ? 'big' : 'story');
  return { txt, win: r.win };
}

// 每月檢查：回傳要給玩家看的事件 [{ ev, c, kind: 'choose' | 'watch' | 'news', res? }]
export function storyMonth(s, allAI = false) {
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
