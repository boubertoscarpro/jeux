// v20 « Ma forteresse » — Titres de noblesse (module pur). L'honneur est une somme lue dans les statistiques existantes
// (pas une monnaie, rien ne se dépense) : victoires, raids repoussés, places prises, campagnes, grands projets. Chaque
// titre apporte un avantage petit et borné, et change l'apparence du château (bannières, toits dorés).
export const TITLES = [
  { key: 'squire', name: 'Écuyer', honor: 0 },
  { key: 'knight', name: 'Chevalier', honor: 100 },
  { key: 'baronet', name: 'Baronnet', honor: 300 },
  { key: 'baron', name: 'Baron', honor: 700 },
  { key: 'viscount', name: 'Vicomte', honor: 1400 },
  { key: 'count', name: 'Comte', honor: 2500 },
  { key: 'marquis', name: 'Marquis', honor: 4000 },
  { key: 'duke', name: 'Duc', honor: 6000 },
];
export const HONOR = { battle: 2, raid: 10, siege: 20, hardClear: 5, campaign: 40, project: 50 };
export const TITLE_PERK = { prod: 0.01, morale: 2 }; // par rang au-dessus d'Écuyer (Duc : +7 % et +14)
export function honorOf(state) {
  const st = state.stats || {};
  const parts = [
    ['Victoires', (st.battlesWon || 0) * HONOR.battle],
    ['Raids repoussés', (st.raidsRepelled || 0) * HONOR.raid],
    ['Places fortes prises (royaumes, Brèche)', ((st.siegesWon || 0) + (st.breachWins || 0)) * HONOR.siege],
    ['Sites difficiles nettoyés', (st.hardClears || 0) * HONOR.hardClear],
    ['Campagnes victorieuses', (st.campaignsWon || 0) * HONOR.campaign],
    ['Grands projets achevés', Object.keys(state.projects?.done || {}).length * HONOR.project],
  ].filter(([, v]) => v > 0);
  return { total: parts.reduce((a, [, v]) => a + v, 0), parts };
}
export function titleOf(state) {
  const h = honorOf(state).total;
  let rank = 0;
  TITLES.forEach((t, i) => { if (h >= t.honor) rank = i; });
  const cur = TITLES[rank], next = TITLES[rank + 1] || null;
  const progress = next ? (h - cur.honor) / (next.honor - cur.honor) : 1;
  return { rank, ...cur, honorNow: h, next, progress: Math.max(0, Math.min(1, progress)) };
}
export function nobilityMods(state) {
  const r = titleOf(state).rank;
  return r ? { 'prod.all': TITLE_PERK.prod * r, 'combat.morale': TITLE_PERK.morale * r } : {};
}
export const titlePerkText = (rank) => (rank ? `production +${rank} %, moral au combat +${rank * TITLE_PERK.morale}` : 'aucun avantage encore');
