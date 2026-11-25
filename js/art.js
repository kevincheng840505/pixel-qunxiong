// 共用美術工具：勢力配色與武將畫像。
import { FACTIONS, NEUTRAL_COLOR, MAP_W, MAP_H } from './data.js';
import { drawPortrait } from './portrait.js';
export { MAP_W, MAP_H };

export const facColor = id => (FACTIONS.find(f => f.id === id) || {}).color || NEUTRAL_COLOR;
export const facDark = id => (FACTIONS.find(f => f.id === id) || {}).dark || '#5a5246';
export const FAC_GLYPH = { cao: '曹', liu: '劉', sun: '孫', yuans: '袁', yuanh: '術', dong: '董', gong: '瓚', biao: '表' };

// ---------- 武將頭像（48×48） ----------
const portraitCache = new Map();
export function portrait(g, factionId) {
  const key = `${g.id}:${factionId || ''}`;
  if (portraitCache.has(key)) return portraitCache.get(key);
  const url = drawPortrait(g, facColor(factionId), facDark(factionId)).toDataURL();
  portraitCache.set(key, url);
  return url;
}
