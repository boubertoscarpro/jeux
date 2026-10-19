// v17 « Clair comme le jour » — Tenues de fête du château (module pur), liées à l'état réel : la saison, l'événement
// en cours, une victoire récente. Purement décoratif : jamais au-dessus des marques, coupé par la réduction des
// animations pour ce qui bouge.
import { calendar } from './chronicle.js';
import { LIVE_EVENTS } from '../data/liveEvents.js';

export const DRESSES = {
  spring: { name: 'Fleurs du printemps', colors: ['#f2a7c3', '#fff3a8', '#b7e3a0'] },
  summer: { name: 'Bannières d’été', colors: ['#e2b84a', '#3f78a6', '#f3e6c4'] },
  autumn: { name: 'Fête des moissons', colors: ['#d9822b', '#b5442b', '#e8c25a'] },
  winter: { name: 'Lanternes d’hiver', colors: ['#fff3c4', '#9fc3e6', '#e8eef5'] },
  event: { name: 'Pavois de l’événement', colors: ['#c9a54a', '#7a5aa6', '#f3e6c4'] },
  victory: { name: 'Pavois de victoire', colors: ['#e2b84a', '#f3e6c4', '#b3261e'] },
};
export function festiveDress(state, now = Date.now()) {
  const recentWin = (state.reports || []).find((r) => r.kind === 'defense' && r.win && now - r.t < 6 * 3600e3);
  if (recentWin) return { key: 'victory', ...DRESSES.victory, reason: 'raid repoussé' };
  const L = state.live?.current;
  if (L && LIVE_EVENTS[L.key] && L.end > now) return { key: 'event', ...DRESSES.event, reason: LIVE_EVENTS[L.key].name };
  const s = calendar(state, now).season;
  return { key: s.key, ...DRESSES[s.key], reason: s.name };
}
