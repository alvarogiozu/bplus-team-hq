export const HQ_THEMES = {
  coral:  { name: 'Coral',     title: '#cf7358', titleSoft: '#f7e9e3', accent: '#2e88aa', accentEdge: '#216b87', accentSoft: '#e2eef3' },
  berry:  { name: 'Frambuesa', title: '#b4637a', titleSoft: '#f6e8ec', accent: '#575279', accentEdge: '#3f3b5c', accentSoft: '#e9e6f0' },
  olive:  { name: 'Oliva',     title: '#6d833a', titleSoft: '#eef1e3', accent: '#bd6c56', accentEdge: '#9d5541', accentSoft: '#f7e9e3' },
  azure:  { name: 'Azul',      title: '#2e88aa', titleSoft: '#e2eef3', accent: '#cf7358', accentEdge: '#9d5541', accentSoft: '#f7e9e3' },
  amber:  { name: 'Ambar',     title: '#c8831e', titleSoft: '#fbf0dc', accent: '#4a6fa5', accentEdge: '#38547e', accentSoft: '#e6ebf3' },
  purple: { name: 'Morado',    title: '#a573a5', titleSoft: '#f2e8f2', accent: '#73a58a', accentEdge: '#5c8871', accentSoft: '#e6f0ea' },
}

export const HQ_PALETTE = ['#2a82ad','#b4637a','#8aa54a','#eaa545','#a573a5','#bd6c56','#659ca5','#4a6fa5','#73a58a','#b97084','#cf7358','#575279']

export const HQ_RANKS = ['Chispa','Aprendiz','Constructor','Artesano','Maestro','Leyenda']

export function hqLevelOf(xp) { return Math.floor(Math.sqrt(xp / 60)) + 1 }
export function hqXpForLevel(lv) { return Math.pow(lv - 1, 2) * 60 }
export function hqRankOf(lv) { return HQ_RANKS[Math.min(HQ_RANKS.length - 1, Math.floor((lv - 1) / 3))] }
