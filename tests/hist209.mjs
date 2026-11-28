// 史實沙盤局勢：209 年赤壁戰後（曹、孫、劉、劉璋、張魯、馬超六家）。供 tests/story2.mjs 與截圖使用。
import * as R from '../js/rules.js';
import { STORY } from '../js/story.js';
import { cityId } from '../js/data.js';

const OWN = {
  cao: '薊 北平 南皮 鄴 晉陽 上黨 河東 平原 北海 濮陽 陳留 洛陽 弘農 長安 宛 許昌 汝南 譙 小沛 下邳 廣陵 壽春 襄陽 虎牢關 潼關 武關 井陘關 孟津 白馬津 倉亭津 東萊港 合肥',
  ma: '武威 天水 安定 散關', zl: '漢中 陽平關', yan: '成都 梓潼 江州 永安 劍閣',
  liu: '武陵 長沙 零陵 桂陽 江津 巴丘',
  sun: '江陵 江夏 夏口 柴桑 豫章 秣陵 吳 會稽 廬江 濡須口 京口 句章港 夷陵關',
};
const GENS = {
  cao: '曹操 夏侯惇 夏侯淵 曹仁 曹洪 荀彧 樂進 李典 張遼 許褚 徐晃 張郃 于禁 程昱 賈詡 荀攸 司馬懿 曹丕 曹植 曹真 滿寵 陳群 郭淮 文聘 蒯越 臧霸 徐庶 劉琮 王朗 高覽 曹叡 曹爽 司馬師 司馬昭 司馬炎 鄧艾 鍾會 羊祜 杜預 王濬 夏侯霸',
  liu: '劉備 關羽 張飛 趙雲 諸葛亮 簡雍 孫乾 糜竺 關平 周倉 黃忠 魏延 馬良 霍峻 蔣琬 陳到 馬謖 廖化 劉禪 關興 張苞 費禕 王平',
  sun: '孫權 周瑜 魯肅 程普 黃蓋 韓當 張昭 張紘 呂蒙 甘寧 凌統 周泰 蔣欽 陸遜 顧雍 虞翻 朱治 諸葛瑾 徐盛 朱然 潘璋 孫尚香 丁奉 陸抗 孫休 孫皓',
  yan: '劉璋 張任 黃權 嚴顏 張松 法正 李嚴 譙周', zl: '張魯 閻圃', ma: '馬超 韓遂 龐德 馬岱 馬騰',
};
const RULER = { cao: '曹操', liu: '劉備', sun: '孫權', yan: '劉璋', zl: '張魯', ma: '馬超' };
const DONE_BEFORE = 'jingnan';   // 第三章最後一個事件

export function setup(seed, player = 'cao') {
  const s = R.newGame(player, seed);
  s.year = 209; s.month = 0; s.turn = 19 * 12; s.coalition = null; s.emperor = 'cao';
  for (const ev of STORY) { s.story.done[ev.id] = true; if (ev.id === DONE_BEFORE) break; }
  Object.assign(s.story.flags, { chibi: true, sunliu: true, jingzhou_cao: 'cao', wolong: true, sangu: true, guandu: true });
  const home = {};
  for (const [f, list] of Object.entries(GENS)) for (const n of list.split(' ')) home[n] = f;
  for (const g of s.generals) {
    g.army = null; g.captor = null;
    if (g.born + R.ADULT > s.year) { g.status = 'unborn'; g.faction = null; g.home = home[g.name] || g.home; continue; }
    if (g.died < s.year && !home[g.name]) { g.status = 'dead'; g.faction = null; continue; }
    if (home[g.name]) { g.status = 'active'; g.faction = home[g.name]; g.loyalty = 85; g.lock = 0; }
    else { g.status = 'hidden'; g.faction = null; }
  }
  for (const c of s.cities) c.owner = null;
  for (const f of Object.values(s.factions)) { f.alive = false; f.truce = {}; f.alliance = {}; }
  for (const [f, list] of Object.entries(OWN)) for (const n of list.split(' ')) s.cities[cityId(n) - 1].owner = f;
  for (const [f, n] of Object.entries(RULER)) {
    const fac = s.factions[f]; fac.alive = true; fac.ruler = s.generals.find(g => g.name === n).id; R.facName(s, f);
    if (!fac.gold) { fac.gold = 1000; fac.food = 5000; }
  }
  for (const g of s.generals) if (g.status === 'active') {
    const own = R.citiesOf(s, g.faction);
    if (R.city(s, g.city).owner !== g.faction) g.city = own[Math.floor(R.rand(s) * own.length)].id;
  }
  const ally = (a, b) => { s.factions[a].alliance[b] = true; s.factions[b].alliance[a] = true; };
  ally('sun', 'liu');
  s.factions.cao.rank = 1;
  s.orders = R.calcOrders(s, player); s.log = [];
  return s;
}
