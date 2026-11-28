// 起始劇本：依各年代大事件設定勢力、領地、武將與兵力。不碰畫面。
// 190 年為基本劇本（data.js 的原始資料）；其他年份在基本劇本上覆寫。
import * as R from './rules.js';
import { FACTIONS, ALL_FACTIONS, cityId } from './data.js';
import { STORY } from './story.js';

const BASE = Object.fromEntries(FACTIONS.map(f => [f.id, { difficulty: f.difficulty, blurb: f.blurb }]));

// factions[fid]：ruler 君主；cities { 城名: 兵力 }（第一座為君主所在）；gens 武將（「名@城」指定駐地，否則在首城）
// at：在野武將改放到某城；past：開局前已發生的事件（y[1] 早於起始年者自動略過）
export const SCENARIOS = [
  {
    id: '190', year: 190, month: 0, title: '群雄討董', event: '反董卓聯盟',
    desc: '董卓廢少帝、焚洛陽，關東諸侯共推袁紹為盟主，起兵討伐。',
    intro: '董卓挾天子據洛陽，關東諸侯組成<b>討董聯軍</b>。聯軍期間（至 191 年底）諸侯彼此停戰，可專心對付董卓、攻取中立據點或發展內政。',
  },
  {
    id: '194', year: 194, month: 0, title: '徐州之爭', event: '曹操東征・呂布襲兗州',
    desc: '董卓已死，李傕、郭汜挾持天子。曹操為報父仇東征徐州，陶謙病篤，呂布在一旁虎視眈眈。',
    intro: '董卓已死，天子落入李傕、郭汜之手。曹操之父在徐州遇害，曹操誓報此仇；陶謙年老病重，正尋託付徐州之人；漂泊無依的呂布與陳宮暗中聯絡。江東則有孫策寄身袁術麾下，等待渡江的時機。',
    emperor: 'dong',
    flags: { qianfu: true, lianhuan: true, caosong: true, yuxi: 'sun', zhaoyun: true, sunjian_dead: true },
    past: ['caosong'],
    factions: {
      cao: { ruler: '曹操', gold: 900, food: 4000, difficulty: '普通', blurb: '新得兗州，收編青州兵三十萬。父仇未報，與陶謙勢不兩立。',
        cities: { 陳留: 13000, 濮陽: 8000, 譙: 5000, 倉亭津: 2000 },
        gens: ['夏侯惇', '夏侯淵', '曹仁', '曹洪', '典韋', '荀彧', '樂進', '李典', '程昱', '陳宮@濮陽', '于禁', '滿寵', '曹昂'] },
      tao: { ruler: '陶謙', gold: 900, food: 4500, difficulty: '困難', blurb: '徐州牧，年老多病。曹操大軍壓境，急需援手。',
        cities: { 下邳: 9000, 小沛: 4000, 廣陵: 5000 },
        gens: ['糜竺', '陳登@廣陵', '臧霸@小沛'] },
      liu: { ruler: '劉備', gold: 500, food: 2000, difficulty: '困難', blurb: '平原相，兵微將寡。徐州告急，正是仁義揚名之時。',
        cities: { 平原: 6000 },
        gens: ['關羽', '張飛', '簡雍', '孫乾', '關平'] },
      yuans: { ruler: '袁紹', gold: 1600, food: 7000, difficulty: '簡單', blurb: '冀州牧，與公孫瓚爭奪河北，兵精糧足。',
        cities: { 鄴: 18000, 南皮: 10000, 晉陽: 6000, 井陘關: 4000, 白馬津: 3000 },
        gens: ['顏良', '文醜@南皮', '田豐', '沮授', '審配@南皮', '張郃', '高覽@南皮', '麴義', '逢紀', '郭圖@晉陽', '許攸', '袁譚@南皮', '袁尚'] },
      gong: { ruler: '公孫瓚', gold: 900, food: 3500, difficulty: '普通', blurb: '界橋一敗後退守幽州，白馬義從仍是天下強騎。',
        cities: { 薊: 14000, 北平: 8000 },
        gens: ['田楷@北平', '單經@北平', '公孫續', '關靖'] },
      yuanh: { ruler: '袁術', gold: 1400, food: 6500, difficulty: '簡單', blurb: '盤據淮南，坐擁壽春富庶之地，覬覦帝位。',
        cities: { 壽春: 12000, 汝南: 8000, 合肥: 4000, 濡須口: 2500 },
        gens: ['紀靈', '張勳', '橋蕤@汝南', '閻象', '楊弘', '雷薄@汝南', '陳蘭@合肥'] },
      sun: { ruler: '孫策', gold: 400, food: 1800, difficulty: '困難', blurb: '孫堅之子，年方二十，寄身袁術。手握玉璽，志在江東。',
        cities: { 廬江: 5000 },
        gens: ['程普', '黃蓋', '韓當', '朱治'] },
      biao: { ruler: '劉表', gold: 1400, food: 6500, difficulty: '普通', blurb: '坐保荊襄九郡，殺孫堅後與江東結下深仇。',
        cities: { 襄陽: 14000, 江陵: 8000, 江夏: 7000, 長沙: 6000, 武陵: 3000, 零陵: 3000, 桂陽: 3000, 江津: 2000, 夏口: 2500, 巴丘: 1500, 夷陵關: 3000 },
        gens: ['蔡瑁', '蒯良', '蒯越', '黃祖@江夏', '文聘@江陵', '黃忠@長沙', '張允@江夏', '劉琦'] },
      dong: { ruler: '李傕', gold: 1200, food: 5000, difficulty: '普通', blurb: '董卓舊部，挾持天子據長安，與郭汜明爭暗鬥。',
        cities: { 長安: 14000, 弘農: 5000, 潼關: 6000, 武關: 3000, 散關: 2500 },
        gens: ['郭汜', '樊稠@弘農', '張濟@弘農', '張繡@武關', '賈詡'] },
      ma: { ruler: '馬騰', gold: 700, food: 3500, difficulty: '普通', blurb: '雄踞西涼，羌胡畏服，鐵騎驍勇。',
        cities: { 武威: 6000, 天水: 5000, 安定: 4000 },
        gens: ['馬超', '韓遂', '龐德@天水'] },
      yan: { ruler: '劉焉', gold: 1200, food: 6000, difficulty: '簡單', blurb: '益州牧，閉關自守天府之國。年事已高。',
        cities: { 成都: 10000, 梓潼: 4000, 江州: 5000, 永安: 3000, 劍閣: 4000 },
        gens: ['劉璋', '張任', '黃權@梓潼', '嚴顏@江州', '張松', '法正'] },
      zl: { ruler: '張魯', gold: 600, food: 3000, difficulty: '普通', blurb: '五斗米道師君，據漢中以鬼道教民。',
        cities: { 漢中: 6000, 陽平關: 3000 },
        gens: ['閻圃'] },
    },
    at: { 呂布: '上黨', 張遼: '上黨', 高順: '上黨', 貂蟬: '上黨', 趙雲: '南皮' },
    troops: { 洛陽: 1500, 虎牢關: 2000 },
    relations: [['cao', 'tao', -60], ['cao', 'yuans', 40], ['liu', 'gong', 60], ['liu', 'tao', 30], ['yuans', 'gong', -50], ['yuans', 'yuanh', -30],
      ['sun', 'yuanh', 50], ['biao', 'sun', -40], ['biao', 'yuanh', -20], ['cao', 'yuanh', -40], ['dong', 'ma', 10], ['yan', 'zl', -20]],
  },
  {
    id: '200', year: 200, month: 1, title: '官渡之戰', event: '袁曹決戰・千里走單騎',
    desc: '曹操挾天子據許都，袁紹盡有河北四州，兩強決戰於官渡。關羽暫棲曹營，劉備投奔袁紹後轉戰汝南。',
    intro: '袁紹盡有冀、青、幽、并四州，率十萬大軍南下；曹操奉天子都許，兵力遠遜。劉備兵敗徐州，關羽為護二嫂暫棲曹營，約定一知兄長下落便辭去。江東小霸王孫策正欲北襲許都。',
    emperor: 'cao',
    flags: { qianfu: true, lianhuan: true, caosong: true, tianzi: 'cao', jiangdong: 'sun', yuxi: 'cao', lubu_yan: true, xuzhou: 'liu', yuanshu_emp: true, zhaoyun: true, sunjian_dead: true, guanyu_cao: 'cao' },
    past: ['zhujiu', 'yidai', 'yijing', 'tushan', 'baimen'],
    factions: {
      cao: { ruler: '曹操', gold: 2000, food: 9000, difficulty: '困難', blurb: '奉天子以令不臣，四面受敵，糧草吃緊，只能以寡擊眾。',
        cities: { 許昌: 18000, 陳留: 12000, 濮陽: 10000, 白馬津: 6000, 譙: 5000, 小沛: 7000, 下邳: 10000, 廣陵: 6000, 壽春: 7000, 合肥: 4000, 宛: 8000, 洛陽: 8000, 虎牢關: 6000, 孟津: 3000, 弘農: 5000, 長安: 8000, 潼關: 5000, 武關: 3000, 河東: 5000 },
        gens: ['夏侯惇@濮陽', '夏侯淵@陳留', '曹仁', '曹洪', '荀彧', '樂進@白馬津', '李典@陳留', '程昱@濮陽', '于禁@白馬津', '滿寵', '郭嘉', '荀攸', '許褚', '張遼@白馬津', '徐晃@陳留',
          '臧霸@下邳', '陳登@廣陵', '賈詡@宛', '張繡@宛', '關羽@白馬津', '王朗'] },
      yuans: { ruler: '袁紹', gold: 2500, food: 12000, difficulty: '簡單', blurb: '四世三公，帶甲十萬，謀臣如雨、猛將如雲，只差一個決斷。',
        cities: { 鄴: 22000, 倉亭津: 8000, 南皮: 12000, 平原: 10000, 北海: 7000, 東萊港: 2000, 薊: 12000, 北平: 8000, 晉陽: 8000, 上黨: 6000, 井陘關: 5000 },
        gens: ['顏良@倉亭津', '文醜@倉亭津', '田豐', '沮授', '審配', '張郃', '高覽', '逢紀', '郭圖', '許攸', '袁譚@平原', '袁尚'] },
      liu: { ruler: '劉備', gold: 500, food: 2000, difficulty: '困難', blurb: '兵敗徐州，暫依袁紹，與汝南黃巾合兵。結義兄弟散落四方。',
        cities: { 汝南: 6000 },
        gens: ['張飛', '趙雲', '簡雍', '孫乾', '糜竺', '關平', '陳到'] },
      sun: { ruler: '孫策', gold: 1300, food: 6000, difficulty: '普通', blurb: '平定江東六郡，英氣蓋世，正欲趁袁曹相爭北襲許都。',
        cities: { 吳: 12000, 會稽: 8000, 秣陵: 8000, 京口: 4000, 廬江: 6000, 豫章: 6000, 柴桑: 4000, 句章港: 2000, 濡須口: 3000 },
        gens: ['孫權', '周瑜@柴桑', '程普@廬江', '黃蓋@柴桑', '韓當', '朱治', '張昭', '張紘', '太史慈@豫章', '蔣欽', '周泰', '呂蒙@廬江', '魯肅', '虞翻@會稽', '顧雍@會稽'] },
      biao: { ruler: '劉表', gold: 1800, food: 8000, difficulty: '簡單', blurb: '荊州沃野千里，帶甲十餘萬，卻坐觀成敗。',
        cities: { 襄陽: 16000, 新野: 4000, 江陵: 10000, 江夏: 8000, 長沙: 7000, 武陵: 4000, 零陵: 4000, 桂陽: 4000, 江津: 2500, 夏口: 3000, 巴丘: 2000, 夷陵關: 3000 },
        gens: ['蔡瑁', '蒯良', '蒯越', '黃祖@江夏', '文聘@江陵', '黃忠@長沙', '張允@江夏', '劉琦'] },
      yan: { ruler: '劉璋', gold: 1500, food: 7000, difficulty: '普通', blurb: '繼父劉焉為益州牧，性情寬柔，與張魯不和。',
        cities: { 成都: 12000, 梓潼: 5000, 江州: 7000, 永安: 4000, 劍閣: 5000 },
        gens: ['張任', '黃權@梓潼', '嚴顏@江州', '張松', '法正'] },
      zl: { ruler: '張魯', gold: 700, food: 3500, difficulty: '普通', blurb: '殺劉璋之母弟，與益州結仇，據漢中自守。',
        cities: { 漢中: 8000, 陽平關: 5000 },
        gens: ['閻圃'] },
      ma: { ruler: '馬騰', gold: 900, food: 4000, difficulty: '普通', blurb: '名義上歸附朝廷，與韓遂時戰時和。',
        cities: { 武威: 7000, 天水: 6000, 安定: 5000, 散關: 3000 },
        gens: ['馬超', '韓遂', '龐德@天水'] },
    },
    at: { 甘寧: '江夏', 陸遜: '吳' },
    relations: [['cao', 'yuans', -60], ['liu', 'yuans', 50], ['liu', 'cao', -60], ['biao', 'yuans', 30], ['biao', 'sun', -50], ['ma', 'cao', 20], ['yan', 'zl', -60], ['sun', 'cao', -10]],
    alliances: [['liu', 'yuans']],
    truces: [['cao', 'ma', 12], ['cao', 'biao', 6]],
  },
  {
    id: '207', year: 207, month: 0, title: '三顧茅廬', event: '臥龍出山・赤壁前夕',
    desc: '曹操掃平河北，一統北方；劉備寄居新野，求賢若渴；孫權坐鎮江東，劍指黃祖。',
    intro: '官渡之後，曹操盡滅袁氏，北方一統，下一步就是南下荊州。劉備寄身劉表，屯兵新野，年近半百仍一事無成，聽聞隆中有臥龍先生。孫權繼承父兄基業，與殺父仇人黃祖對峙江夏。天下大勢，將在赤壁一戰底定。',
    emperor: 'cao',
    flags: { qianfu: true, lianhuan: true, caosong: true, tianzi: 'cao', jiangdong: 'sun', yuxi: 'cao', lubu_yan: true, xuzhou: 'liu', yuanshu_emp: true, zhaoyun: true, sunjian_dead: true, baima: true, xuyou: true, guandu: true, wolong: true },
    past: ['tanxi', 'tushan', 'baimen'],
    factions: {
      cao: { ruler: '曹操', gold: 4000, food: 20000, difficulty: '簡單', blurb: '統一北方，挾天子、擁百萬之眾，天下已得其半。',
        cities: { 鄴: 25000, 許昌: 18000, 陳留: 12000, 濮陽: 10000, 白馬津: 4000, 倉亭津: 4000, 南皮: 12000, 平原: 9000, 北海: 7000, 東萊港: 2000, 薊: 12000, 北平: 8000, 晉陽: 9000, 上黨: 6000, 井陘關: 5000,
          譙: 6000, 小沛: 6000, 下邳: 10000, 廣陵: 7000, 壽春: 10000, 合肥: 8000, 汝南: 9000, 宛: 14000, 洛陽: 12000, 虎牢關: 6000, 孟津: 3000, 弘農: 6000, 長安: 12000, 潼關: 7000, 武關: 4000, 河東: 6000 },
        gens: ['夏侯惇@許昌', '夏侯淵@長安', '曹仁@宛', '曹洪@許昌', '荀彧@許昌', '樂進@宛', '李典@合肥', '程昱@濮陽', '于禁@宛', '滿寵@汝南', '郭嘉', '荀攸', '許褚', '張遼@合肥', '徐晃@洛陽',
          '張郃', '高覽@南皮', '臧霸@下邳', '賈詡@許昌', '張繡@宛', '王朗@許昌', '曹丕'] },
      liu: { ruler: '劉備', gold: 400, food: 1500, difficulty: '困難', blurb: '寄居新野，關張趙俱在，卻苦無良謀。髀肉復生，壯志未酬。',
        cities: { 新野: 6000 },
        gens: ['關羽', '張飛', '趙雲', '簡雍', '孫乾', '糜竺', '關平', '周倉', '陳到', '徐庶'] },
      sun: { ruler: '孫權', gold: 2000, food: 9000, difficulty: '普通', blurb: '坐領江東六郡，周瑜、魯肅輔佐，欲西取江夏、報殺父之仇。',
        cities: { 吳: 14000, 柴桑: 9000, 會稽: 9000, 秣陵: 10000, 京口: 6000, 廬江: 7000, 豫章: 7000, 句章港: 2500, 濡須口: 4000 },
        gens: ['周瑜@柴桑', '程普@柴桑', '黃蓋@柴桑', '韓當@廬江', '朱治', '張昭', '張紘@秣陵', '魯肅@柴桑', '呂蒙@柴桑', '蔣欽@廬江', '周泰@濡須口', '陸遜@會稽', '虞翻@會稽', '顧雍', '凌統@柴桑'] },
      biao: { ruler: '劉表', gold: 2200, food: 10000, difficulty: '普通', blurb: '年老多病，劉琦、劉琮二子爭嗣，蔡瑁掌兵權。',
        cities: { 襄陽: 18000, 江陵: 12000, 江夏: 9000, 長沙: 7000, 武陵: 4000, 零陵: 4000, 桂陽: 4000, 江津: 3000, 夏口: 4000, 巴丘: 2500, 夷陵關: 3500 },
        gens: ['蔡瑁', '蒯良', '蒯越', '黃祖@江夏', '文聘@江陵', '黃忠@長沙', '張允@江夏', '劉琦', '劉琮'] },
      yan: { ruler: '劉璋', gold: 1600, food: 8000, difficulty: '普通', blurb: '坐擁天府之國，闇弱無威，張松、法正暗懷異志。',
        cities: { 成都: 13000, 梓潼: 6000, 江州: 8000, 永安: 4000, 劍閣: 6000 },
        gens: ['張任', '黃權@梓潼', '嚴顏@江州', '張松', '法正'] },
      zl: { ruler: '張魯', gold: 800, food: 4000, difficulty: '困難', blurb: '雄據漢中近三十年，北有曹操，南有劉璋。',
        cities: { 漢中: 9000, 陽平關: 6000 },
        gens: ['閻圃'] },
      ma: { ruler: '馬騰', gold: 1000, food: 4500, difficulty: '困難', blurb: '曹操徵召入朝在即，馬超、韓遂各擁兵馬。',
        cities: { 武威: 8000, 天水: 7000, 安定: 6000, 散關: 3000 },
        gens: ['馬超@天水', '韓遂', '龐德@天水'] },
    },
    at: { 甘寧: '江夏', 魏延: '長沙', 李嚴: '江陵' },
    relations: [['cao', 'liu', -60], ['liu', 'biao', 60], ['sun', 'biao', -60], ['cao', 'ma', 20], ['yan', 'zl', -60], ['cao', 'biao', -30], ['cao', 'sun', -10]],
    alliances: [['liu', 'biao']],
    truces: [['cao', 'ma', 12]],
  },
];

export const scenarioById = id => SCENARIOS.find(x => x.id === id) || SCENARIOS[0];

// 選擇君主畫面用：劇本中的勢力一覽
export function scenarioFactions(sid) {
  const sc = scenarioById(sid);
  const ids = sc.factions ? Object.keys(sc.factions) : FACTIONS.map(f => f.id);
  return ids.map(id => {
    const def = ALL_FACTIONS.find(f => f.id === id), o = (sc.factions || {})[id] || {};
    return { ...def, ...BASE[id], ...(o.difficulty ? { difficulty: o.difficulty } : {}), ...(o.blurb ? { blurb: o.blurb } : {}), gold: o.gold || def.gold };
  });
}

const split = n => { const i = n.indexOf('@'); return i < 0 ? [n, null] : [n.slice(0, i), n.slice(i + 1)]; };

export function newScenarioGame(sid, player, seed, opt = {}) {
  const sc = scenarioById(sid);
  const s = R.newGame(player, seed, opt);
  s.scenario = sc.id;
  if (sc.factions) applyScenario(s, sc, player);
  return s;
}

function applyScenario(s, sc, player) {
  s.player = player;
  s.year = sc.year; s.month = sc.month; s.season = Math.floor(sc.month / 3);
  s.coalition = null; s.emperor = sc.emperor || null; s.log = [];
  // 勢力
  for (const f of Object.values(s.factions)) {
    f.alive = false; f.truce = {}; f.alliance = {};
    for (const k in f.relations) f.relations[k] = 0;
    const def = ALL_FACTIONS.find(x => x.id === f.id);
    f.name = def.name; f.gold = def.gold; f.food = def.food;
  }
  // 城池：先全部中立（兵力取原始資料），再分配
  for (const c of s.cities) c.owner = null;
  for (const [n, t] of Object.entries(sc.troops || {})) R.city(s, cityId(n)).troops = t;
  // 武將：依年代判定未成年、已故、在野
  for (const g of s.generals) {
    g.army = null; g.captor = null; g.acted = false;
    if (g.born + R.ADULT > sc.year) { g.status = 'unborn'; g.faction = null; }
    else if (g.died < sc.year) { g.status = 'dead'; g.faction = null; g.diedAt = g.died; }
    else { g.status = 'hidden'; g.faction = null; g.loyalty = 0; }
  }
  for (const [n, cn] of Object.entries(sc.at || {})) { const g = s.generals.find(x => x.name === n); if (g) g.city = cityId(cn); }
  for (const [fid, o] of Object.entries(sc.factions)) {
    const f = R.fac(s, fid);
    const names = Object.keys(o.cities);
    for (const n of names) { const c = R.city(s, cityId(n)); c.owner = fid; c.troops = Math.min(R.troopCapOf(c), o.cities[n]); }
    const home = cityId(names[0]);
    const place = (name, at, loyalty) => {
      const g = s.generals.find(x => x.name === name);
      if (!g) throw new Error(`劇本 ${sc.id}：找不到武將 ${name}`);
      if (g.status === 'dead' || g.status === 'unborn') throw new Error(`劇本 ${sc.id}：${name}在 ${sc.year} 年不在世（${g.born}～${g.died}）`);
      const cid = at ? cityId(at) : home;
      if (R.city(s, cid).owner !== fid) throw new Error(`劇本 ${sc.id}：${name}駐地${at}不屬於 ${fid}`);
      g.status = 'active'; g.faction = fid; g.city = cid; g.loyalty = loyalty;
      return g;
    };
    const rl = place(o.ruler, null, 100);
    f.alive = true; f.ruler = rl.id; f.name = rl.name;
    if (o.gold != null) f.gold = o.gold;
    if (o.food != null) f.food = o.food;
    for (const n of o.gens || []) { const [name, at] = split(n); place(name, at, 80 + R.randInt(s, 0, 15)); }
  }
  // 外交
  for (const [a, b, v] of sc.relations || []) { R.fac(s, a).relations[b] = v; R.fac(s, b).relations[a] = v; }
  for (const [a, b] of sc.alliances || []) { R.fac(s, a).alliance[b] = true; R.fac(s, b).alliance[a] = true; }
  for (const [a, b, m] of sc.truces || []) { R.fac(s, a).truce[b] = m; R.fac(s, b).truce[a] = m; }
  // 劇情：開局前的事件視為已發生
  s.story = { done: {}, flags: { ...(sc.flags || {}) }, rec: [], pre: {} };
  for (const ev of STORY) {
    if ((ev.y && ev.y[1] < sc.year) || (sc.past || []).includes(ev.id)) { s.story.done[ev.id] = true; s.story.pre[ev.id] = true; }
  }
  s.orders = R.calcOrders(s, player);
  R.log(s, `西元 ${sc.year} 年，${sc.title}。你成為${R.fac(s, player).name}，逐鹿天下的時刻到了。`, 'big');
}
