// 工筆武將像：細墨線勾勒、礦物色平塗，絹本底色。全部以程式繪製。
// 座標以 100×100 為單位，輸出 PX×PX。
const PX = 160;

function hash(a, b, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { const x = hex(a), y = hex(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`; }

const LINE = '#3a2418';      // 勾勒用的赭墨
const INK = '#1a1410';

export function drawPortrait(g, col, dark) {
  const cv = document.createElement('canvas');
  cv.width = PX; cv.height = PX;
  const c = cv.getContext('2d');
  c.scale(PX / 100, PX / 100);
  c.lineCap = 'round'; c.lineJoin = 'round';
  const r = k => hash(g.id, k, 131);
  const look = g.look || '';
  const old = look.includes('o'), young = look.includes('y');
  const helm = look.includes('h'), scholar = look.includes('s');
  const armored = helm || g.str >= 82;
  const fierce = g.str >= 85, wise = g.int >= 85;

  // ---------- 絹本底 ----------
  const bg = c.createRadialGradient(50, 40, 5, 50, 50, 75);
  bg.addColorStop(0, '#f1e6cc'); bg.addColorStop(1, '#cdb88e');
  c.fillStyle = bg; c.fillRect(0, 0, 100, 100);
  c.strokeStyle = 'rgba(120,90,50,.06)'; c.lineWidth = 0.3;
  for (let i = 0; i < 100; i += 1.6) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 100); c.stroke(); }
  // 背光暈：勢力色淡染
  const halo = c.createRadialGradient(50, 40, 4, 50, 40, 42);
  halo.addColorStop(0, mix(col, '#f4ead2', 0.55).replace('rgb', 'rgba').replace(')', ',.55)'));
  halo.addColorStop(1, 'rgba(240,230,210,0)');
  c.fillStyle = halo; c.fillRect(0, 0, 100, 100);

  // ---------- 膚色 ----------
  const skins = [['#f3d9b8', '#d9b08a'], ['#eccaa2', '#cf9f78'], ['#e2b98e', '#c08a62'], ['#d6a679', '#b07a52']];
  let [skin, skinS] = skins[Math.floor(r(1) * skins.length)];
  if (look.includes('r')) [skin, skinS] = ['#b5503e', '#8a3426'];
  const hairC = old ? '#d8d4cc' : INK;

  const cx = 50;
  const faceW = 15.5 + r(2) * 2 + (g.str > 88 ? 1.5 : 0);   // 半寬
  const faceTop = 26, faceBot = 66 - (young ? 2 : 0);
  const jaw = 0.55 + (g.str > 85 ? 0.2 : 0) + r(3) * 0.1;      // 下顎寬度比例

  // ---------- 身軀 ----------
  const robe = mix(col, '#efe4c8', 0.18), robeD = mix(dark, '#3a2418', 0.2);
  if (armored) {
    // 披風
    c.fillStyle = robe;
    c.beginPath(); c.moveTo(4, 100); c.quadraticCurveTo(10, 74, 30, 70); c.lineTo(70, 70); c.quadraticCurveTo(90, 74, 96, 100); c.closePath(); c.fill();
    // 鎧甲身
    const steel = c.createLinearGradient(20, 70, 80, 100);
    steel.addColorStop(0, '#8a8c90'); steel.addColorStop(0.5, '#5e6066'); steel.addColorStop(1, '#3e4046');
    c.fillStyle = steel;
    c.beginPath(); c.moveTo(16, 100); c.quadraticCurveTo(20, 80, 34, 74); c.lineTo(66, 74); c.quadraticCurveTo(80, 80, 84, 100); c.closePath(); c.fill();
    // 魚鱗甲紋
    c.strokeStyle = 'rgba(20,16,12,.55)'; c.lineWidth = 0.45;
    for (let y = 78; y < 100; y += 3.2) for (let x = 18 + ((y / 3.2) % 2) * 2; x < 84; x += 4) {
      if (Math.abs(x - 50) < 9 && y < 92) continue;
      c.beginPath(); c.arc(x, y, 2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    }
    // 肩吞（獸首護肩）
    for (const s of [-1, 1]) {
      c.fillStyle = '#b08a3a';
      c.beginPath(); c.ellipse(cx + s * 30, 81, 11, 7, s * -0.35, 0, Math.PI * 2); c.fill();
      c.strokeStyle = LINE; c.lineWidth = 0.7; c.stroke();
      c.strokeStyle = 'rgba(60,30,10,.7)'; c.lineWidth = 0.5;
      c.beginPath(); c.arc(cx + s * 30, 81, 4, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(cx + s * 24, 78); c.quadraticCurveTo(cx + s * 30, 75, cx + s * 37, 79); c.stroke();
    }
    // 護心鏡
    const mir = c.createRadialGradient(cx - 1, 87, 0.5, cx, 88, 7);
    mir.addColorStop(0, '#fbf0c8'); mir.addColorStop(0.6, '#c9a24a'); mir.addColorStop(1, '#7a5a20');
    c.fillStyle = mir; c.beginPath(); c.arc(cx, 88, 6.5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = LINE; c.lineWidth = 0.7; c.stroke();
    // 領巾
    c.fillStyle = robe;
    c.beginPath(); c.moveTo(38, 72); c.quadraticCurveTo(50, 80, 62, 72); c.lineTo(60, 76); c.quadraticCurveTo(50, 83, 40, 76); c.closePath(); c.fill();
    c.strokeStyle = LINE; c.lineWidth = 0.6; c.stroke();
  } else {
    // 交領袍服
    c.fillStyle = robe;
    c.beginPath(); c.moveTo(6, 100); c.quadraticCurveTo(12, 76, 34, 71); c.lineTo(66, 71); c.quadraticCurveTo(88, 76, 94, 100); c.closePath(); c.fill();
    c.strokeStyle = LINE; c.lineWidth = 0.7; c.stroke();
    // 衣褶
    c.strokeStyle = robeD; c.lineWidth = 0.5;
    for (const [x1, x2] of [[18, 22], [26, 28], [74, 72], [82, 78]]) { c.beginPath(); c.moveTo(x1, 84); c.quadraticCurveTo(x2, 92, x1 + 1, 100); c.stroke(); }
    // 白中衣交領
    c.fillStyle = '#f6efe0';
    c.beginPath(); c.moveTo(41, 71); c.lineTo(58, 100); c.lineTo(51, 100); c.lineTo(36, 74); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(59, 71); c.lineTo(46, 92); c.lineTo(42, 88); c.lineTo(54, 72); c.closePath(); c.fill();
    c.strokeStyle = LINE; c.lineWidth = 0.6;
    c.beginPath(); c.moveTo(41, 71); c.lineTo(58, 100); c.moveTo(36, 74); c.lineTo(51, 100); c.moveTo(59, 71); c.lineTo(46, 92); c.stroke();
    // 領緣（深色鑲邊）
    c.strokeStyle = robeD; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(38, 72.5); c.lineTo(54.5, 100); c.stroke();
  }

  // ---------- 頸 ----------
  c.fillStyle = skinS;
  c.beginPath(); c.moveTo(cx - 7, 60); c.lineTo(cx - 7.5, 73); c.quadraticCurveTo(cx, 76, cx + 7.5, 73); c.lineTo(cx + 7, 60); c.closePath(); c.fill();

  // ---------- 耳 ----------
  for (const s of [-1, 1]) {
    c.fillStyle = skin;
    c.beginPath(); c.ellipse(cx + s * (faceW + 0.5), 45, 2.6, 5, s * 0.15, 0, Math.PI * 2); c.fill();
    c.strokeStyle = LINE; c.lineWidth = 0.55; c.stroke();
    c.beginPath(); c.arc(cx + s * (faceW + 0.7), 45, 1.2, -1.2, 1.2); c.stroke();
  }

  // ---------- 臉 ----------
  const face = () => {
    c.beginPath();
    c.moveTo(cx - faceW, faceTop + 8);
    c.quadraticCurveTo(cx - faceW, faceTop - 1, cx, faceTop - 1.5);
    c.quadraticCurveTo(cx + faceW, faceTop - 1, cx + faceW, faceTop + 8);
    c.bezierCurveTo(cx + faceW + 0.5, faceTop + 24, cx + faceW * jaw + 3, faceBot - 4, cx, faceBot);
    c.bezierCurveTo(cx - faceW * jaw - 3, faceBot - 4, cx - faceW - 0.5, faceTop + 24, cx - faceW, faceTop + 8);
    c.closePath();
  };
  const fg = c.createRadialGradient(cx - 3, 42, 3, cx, 46, faceW + 8);
  fg.addColorStop(0, mix(skin, '#ffffff', 0.12)); fg.addColorStop(0.75, skin); fg.addColorStop(1, skinS);
  face(); c.fillStyle = fg; c.fill();
  c.strokeStyle = LINE; c.lineWidth = 0.75; c.stroke();
  // 腮紅（工筆暈染）
  for (const s of [-1, 1]) {
    const rg = c.createRadialGradient(cx + s * 9, 52, 0, cx + s * 9, 52, 6);
    rg.addColorStop(0, look.includes('r') ? 'rgba(120,20,10,.25)' : 'rgba(200,90,70,.18)'); rg.addColorStop(1, 'rgba(200,90,70,0)');
    c.fillStyle = rg; c.fillRect(cx + s * 9 - 6, 46, 12, 12);
  }

  // ---------- 五官 ----------
  const ey = 45 + r(4) * 1.5;
  const eyeX = 6.6 + r(5) * 1.4;
  // 眉
  const browC = old ? '#a8a49c' : INK;
  for (const s of [-1, 1]) {
    c.fillStyle = browC;
    const x0 = cx + s * 2.8, x1 = cx + s * (eyeX + 6.5);
    const lift = fierce ? 4.2 : wise ? 1.2 : 2.2, thick = fierce ? 1.9 : wise ? 0.9 : 1.3;
    c.beginPath();
    c.moveTo(x0, ey - 4.5);
    c.quadraticCurveTo((x0 + x1) / 2, ey - 6 - lift * 0.6, x1, ey - 4.5 - lift * (fierce ? 0.9 : 0.25));
    c.quadraticCurveTo((x0 + x1) / 2, ey - 6 - lift * 0.6 + thick, x0, ey - 4.5 + thick);
    c.closePath(); c.fill();
    if (wise || old) { // 長眉尾
      c.strokeStyle = browC; c.lineWidth = 0.4;
      c.beginPath(); c.moveTo(x1, ey - 4.5 - lift * 0.25); c.quadraticCurveTo(x1 + s * 1.5, ey - 3.5, x1 + s * 2, ey - 1.5); c.stroke();
    }
  }
  // 眼
  for (const s of [-1, 1]) {
    const ex = cx + s * eyeX, w = 4.3, h = fierce ? 1.9 : 1.6;
    c.fillStyle = '#fbf6ea';
    c.beginPath(); c.moveTo(ex - w, ey); c.quadraticCurveTo(ex, ey - h * 1.6, ex + w, ey - (fierce ? s * 0.8 : (r(11) - 0.5) * s * 1.2)); c.quadraticCurveTo(ex, ey + h, ex - w, ey); c.fill();
    c.fillStyle = INK; c.beginPath(); c.arc(ex - s * 0.4, ey - 0.3, 1.45, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(ex - s * 0.4 - 0.5, ey - 0.8, 0.35, 0, Math.PI * 2); c.fill();
    c.strokeStyle = INK; c.lineWidth = 0.85;
    c.beginPath(); c.moveTo(ex - w, ey); c.quadraticCurveTo(ex, ey - h * 1.6, ex + w, ey - (fierce ? s * 0.8 : (r(11) - 0.5) * s * 1.2)); c.stroke();
    c.strokeStyle = LINE; c.lineWidth = 0.4;
    c.beginPath(); c.moveTo(ex - w + 1, ey + 0.4); c.quadraticCurveTo(ex, ey + h, ex + w - 0.5, ey + 0.1); c.stroke();
    if (wise || old) { c.beginPath(); c.moveTo(ex - w + 1.2, ey - h * 1.6 - 0.8); c.quadraticCurveTo(ex, ey - h * 2.4, ex + w - 1, ey - h * 1.3 - 0.8); c.stroke(); }
    if (old) { c.beginPath(); c.moveTo(ex + s * (w + 0.3), ey + 0.5); c.lineTo(ex + s * (w + 2), ey + 1.8); c.stroke(); }
  }
  // 鼻
  c.strokeStyle = LINE; c.lineWidth = 0.6;
  c.beginPath(); c.moveTo(cx - 1.4, ey + 1); c.quadraticCurveTo(cx - 2.2, ey + 7, cx - 1.6, ey + 9); c.stroke();
  c.beginPath(); c.moveTo(cx - 3.4, ey + 9.6); c.quadraticCurveTo(cx - 1.5, ey + 11, cx, ey + 10.4); c.quadraticCurveTo(cx + 1.5, ey + 11, cx + 3.4, ey + 9.6); c.stroke();
  // 口
  const my = ey + 14.5;
  c.fillStyle = look.includes('r') ? '#6a1a10' : '#b05a48';
  c.beginPath(); c.moveTo(cx - 3.8, my); c.quadraticCurveTo(cx, my - 0.9, cx + 3.8, my); c.quadraticCurveTo(cx, my + 1.8, cx - 3.8, my); c.fill();
  c.strokeStyle = LINE; c.lineWidth = 0.55;
  c.beginPath(); c.moveTo(cx - 3.8, my); c.quadraticCurveTo(cx, my + (fierce ? -0.5 : 0.4), cx + 3.8, my); c.stroke();
  if (old) { c.lineWidth = 0.4; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * 4.8, ey + 8); c.quadraticCurveTo(cx + s * 6.4, my - 1, cx + s * 5.4, my + 3); c.stroke(); } }

  // ---------- 鬍鬚 ----------
  const strands = (x0, y0, x1, y1, n, spread, wob, w) => {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1), sx = x0 + (t - 0.5) * spread, ex = x1 + (t - 0.5) * spread * 0.6;
      c.strokeStyle = old ? `rgba(220,216,206,${0.75 + hash(g.id, i, 9) * 0.25})` : `rgba(20,14,10,${0.55 + hash(g.id, i, 9) * 0.4})`;
      c.lineWidth = w;
      c.beginPath(); c.moveTo(sx, y0);
      c.bezierCurveTo(sx + wob * (hash(g.id, i, 3) - 0.5), (y0 * 2 + y1) / 3, ex + wob * (hash(g.id, i, 4) - 0.5), (y0 + y1 * 2) / 3, ex, y1 + hash(g.id, i, 5) * 3);
      c.stroke();
    }
  };
  if (!young) {
    if (look.includes('l')) {
      // 長髯：底染 + 絲絲勾線
      c.fillStyle = old ? 'rgba(210,206,196,.85)' : 'rgba(26,20,16,.82)';
      c.beginPath(); c.moveTo(cx - 9, my + 1); c.quadraticCurveTo(cx - 10, my + 14, cx - 3, 97); c.lineTo(cx + 3, 97); c.quadraticCurveTo(cx + 10, my + 14, cx + 9, my + 1);
      c.quadraticCurveTo(cx, my + 4, cx - 9, my + 1); c.fill();
      strands(cx, my + 2, cx, 97, 22, 15, 4, 0.35);
      // 八字鬚
      for (const s of [-1, 1]) strands(cx + s * 2.5, my - 1.4, cx + s * 11, my + 6, 5, 2, 1.5, 0.45);
    } else if (look.includes('b')) {
      // 虬髯：環頰短硬鬚
      c.fillStyle = old ? 'rgba(200,196,186,.7)' : 'rgba(26,20,16,.75)';
      c.beginPath(); c.moveTo(cx - faceW + 0.5, ey + 3);
      c.bezierCurveTo(cx - faceW - 1, my + 10, cx - 6, faceBot + 9, cx, faceBot + 10);
      c.bezierCurveTo(cx + 6, faceBot + 9, cx + faceW + 1, my + 10, cx + faceW - 0.5, ey + 3);
      c.lineTo(cx + faceW - 3, ey + 6); c.quadraticCurveTo(cx + 6, my - 3, cx, my - 2.5); c.quadraticCurveTo(cx - 6, my - 3, cx - faceW + 3, ey + 6);
      c.closePath(); c.fill();
      c.strokeStyle = old ? '#e8e4dc' : INK; c.lineWidth = 0.5;
      for (let i = 0; i < 34; i++) {
        const a = Math.PI * (0.05 + 0.9 * i / 33), rr = faceW - 1;
        const x = cx + Math.cos(a) * rr, y = ey + 8 + Math.sin(a) * (faceBot - ey - 4);
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 3.2 + (hash(g.id, i, 2) - 0.5) * 2, y + Math.sin(a) * 3.2); c.stroke();
      }
      // 口部留白
      c.fillStyle = look.includes('r') ? '#6a1a10' : '#9a4a3a';
      c.beginPath(); c.ellipse(cx, my + 0.3, 3, 1, 0, 0, Math.PI * 2); c.fill();
    } else if (r(6) > 0.25) {
      for (const s of [-1, 1]) strands(cx + s * 2, my - 1.6, cx + s * 7.5, my + 2.5, 4, 1.5, 1, 0.45);
      if (r(7) > 0.35) strands(cx, my + 3.5, cx, my + 10 + r(8) * 6, 6, 3, 1.5, 0.4);
    }
  }

  // ---------- 頭部 ----------
  if (helm) {
    const HP = [['#b8bcc4', '#7a7e88', '#4a4e56'], ['#e8cf8a', '#b08a3a', '#6a4a18'], ['#5a5450', '#2e2a28', '#141210'], ['#c8b8a0', '#8a7058', '#4a3828']];
    const hp = HP[Math.floor(r(10) * HP.length)];
    const hg = c.createLinearGradient(cx - 18, 10, cx + 18, 30);
    hg.addColorStop(0, hp[0]); hg.addColorStop(0.5, hp[1]); hg.addColorStop(1, hp[2]);
    // 頓項（護頸）
    c.fillStyle = '#5a5e66';
    c.beginPath(); c.moveTo(cx - faceW - 4, 30); c.lineTo(cx - faceW - 5, 58); c.lineTo(cx - faceW + 1, 60); c.lineTo(cx - faceW + 1, 32); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(cx + faceW + 4, 30); c.lineTo(cx + faceW + 5, 58); c.lineTo(cx + faceW - 1, 60); c.lineTo(cx + faceW - 1, 32); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(20,16,12,.5)'; c.lineWidth = 0.4;
    for (let y = 34; y < 58; y += 3) for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * (faceW - 1), y); c.lineTo(cx + s * (faceW + 4.5), y + 0.6); c.stroke(); }
    // 盔
    c.fillStyle = hg;
    c.beginPath(); c.moveTo(cx - faceW - 4, 32); c.quadraticCurveTo(cx - faceW - 3, 8, cx, 7); c.quadraticCurveTo(cx + faceW + 3, 8, cx + faceW + 4, 32);
    c.quadraticCurveTo(cx, 27, cx - faceW - 4, 32); c.fill();
    c.strokeStyle = LINE; c.lineWidth = 0.8; c.stroke();
    // 眉庇與額飾
    c.fillStyle = '#c9a24a';
    c.beginPath(); c.moveTo(cx - faceW - 4, 32); c.quadraticCurveTo(cx, 26, cx + faceW + 4, 32); c.lineTo(cx + faceW + 3, 34); c.quadraticCurveTo(cx, 29, cx - faceW - 3, 34); c.closePath(); c.fill();
    c.strokeStyle = LINE; c.lineWidth = 0.6; c.stroke();
    c.fillStyle = '#d8b858'; c.beginPath(); c.moveTo(cx, 16); c.lineTo(cx - 4, 27); c.lineTo(cx + 4, 27); c.closePath(); c.fill(); c.stroke();
    // 盔脊
    c.strokeStyle = 'rgba(250,250,255,.55)'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(cx - 6, 11); c.quadraticCurveTo(cx - 12, 16, cx - 14, 26); c.stroke();
    // 盔纓
    c.fillStyle = '#c9a24a'; c.fillRect(cx - 1, 1.5, 2, 6);
    if (r(12) > 0.55) { // 紅纓
      c.fillStyle = '#b3261e';
      c.beginPath(); c.moveTo(cx - 5, 7); c.quadraticCurveTo(cx - 6, -1, cx, -1); c.quadraticCurveTo(cx + 6, -1, cx + 5, 7); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(90,10,6,.6)'; c.lineWidth = 0.35;
      for (let i = -4; i <= 4; i += 1.3) { c.beginPath(); c.moveTo(cx + i, 7); c.quadraticCurveTo(cx + i * 0.6, 2, cx + i * 0.3, -0.5); c.stroke(); }
    } else {
    c.fillStyle = col;
    c.beginPath(); c.moveTo(cx, 3); c.bezierCurveTo(cx + 8, -2, cx + 15, 4, cx + 20, 10); c.bezierCurveTo(cx + 12, 8, cx + 6, 7, cx, 6); c.fill();
    c.strokeStyle = mix(col, '#000000', 0.35); c.lineWidth = 0.35;
    for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(cx + 1, 4 + i * 0.4); c.quadraticCurveTo(cx + 9, 1 + i, cx + 18, 9 + i * 0.3); c.stroke(); }
    }
  } else {
    // 髮
    c.fillStyle = hairC;
    c.beginPath(); c.moveTo(cx - faceW - 0.5, 40);
    c.quadraticCurveTo(cx - faceW - 2, 18, cx, 17); c.quadraticCurveTo(cx + faceW + 2, 18, cx + faceW + 0.5, 40);
    c.lineTo(cx + faceW - 1.5, 33); c.quadraticCurveTo(cx + 6, 25.5, cx, 26); c.quadraticCurveTo(cx - 6, 25.5, cx - faceW + 1.5, 33); c.closePath(); c.fill();
    c.strokeStyle = old ? 'rgba(150,146,138,.7)' : 'rgba(90,80,70,.6)'; c.lineWidth = 0.3;
    for (let i = 0; i < 12; i++) { const x = cx - 12 + i * 2.2; c.beginPath(); c.moveTo(x, 26.5); c.quadraticCurveTo(x * 0.6 + cx * 0.4, 20, cx, 17.5); c.stroke(); }
    if (scholar) {
      // 進賢冠（黑紗）
      c.fillStyle = 'rgba(20,16,14,.92)';
      c.beginPath(); c.moveTo(cx - 10, 21); c.lineTo(cx - 8, 6); c.quadraticCurveTo(cx, 3, cx + 9, 7); c.lineTo(cx + 10, 21); c.quadraticCurveTo(cx, 18, cx - 10, 21); c.fill();
      c.strokeStyle = 'rgba(200,190,170,.35)'; c.lineWidth = 0.3;
      for (let x = cx - 8; x <= cx + 8; x += 1.6) { c.beginPath(); c.moveTo(x, 20); c.lineTo(x + 0.3, 6); c.stroke(); }
      c.strokeStyle = INK; c.lineWidth = 0.9;
      c.beginPath(); c.moveTo(cx - 12, 22); c.quadraticCurveTo(cx, 18.5, cx + 12, 22); c.stroke();
      // 簪
      c.strokeStyle = '#c9a24a'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(cx - 16, 14); c.lineTo(cx + 16, 12); c.stroke();
      c.fillStyle = '#c9a24a'; c.beginPath(); c.arc(cx + 16.5, 12, 1.2, 0, Math.PI * 2); c.fill();
    } else {
      // 髮髻 + 幘巾
      c.fillStyle = hairC;
      c.beginPath(); c.ellipse(cx, 13.5, 6, 5.5, 0, 0, Math.PI * 2); c.fill();
      const band = young ? col : '#8e2a1c';
      c.fillStyle = band;
      c.beginPath(); c.moveTo(cx - faceW - 1, 27); c.quadraticCurveTo(cx, 19, cx + faceW + 1, 27); c.lineTo(cx + faceW + 1, 30); c.quadraticCurveTo(cx, 22, cx - faceW - 1, 30); c.closePath(); c.fill();
      c.strokeStyle = LINE; c.lineWidth = 0.5; c.stroke();
      c.fillStyle = '#c9a24a'; c.fillRect(cx - 1.6, 8, 3.2, 2);
      if (young) { // 飄帶
        c.strokeStyle = band; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(cx + faceW, 28); c.bezierCurveTo(cx + faceW + 6, 30, cx + faceW + 4, 40, cx + faceW + 9, 46); c.stroke();
      }
    }
    // 鬢角
    c.fillStyle = hairC;
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * (faceW - 0.5), 33); c.lineTo(cx + s * (faceW + 0.4), 46); c.lineTo(cx + s * (faceW - 1.6), 44); c.closePath(); c.fill(); }
  }

  // ---------- 落款印 ----------
  c.fillStyle = 'rgba(179,38,30,.88)';
  c.fillRect(84, 84, 13, 13);
  c.strokeStyle = 'rgba(250,235,210,.7)'; c.lineWidth = 0.5; c.strokeRect(85, 85, 11, 11);
  c.fillStyle = '#f8ecd4'; c.font = '900 9px "Noto Serif TC", "Songti TC", serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(g.name[0], 90.5, 91);
  // 名將：金框
  if (Math.max(g.str, g.int, g.pol, g.cha) >= 95) {
    c.strokeStyle = 'rgba(201,162,74,.9)'; c.lineWidth = 1.2; c.strokeRect(1.2, 1.2, 97.6, 97.6);
  }
  return cv;
}
