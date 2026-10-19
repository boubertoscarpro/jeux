// v17 « Clair comme le jour » — Le retour du seigneur (module pur) : ce qui a changé pendant l'absence, pour une courte
// scène sur le château (bâtiments terminés qui brillent, dégâts) avant le rapport détaillé. Pas de culpabilité, pas de
// « vous avez manqué » : un constat.
export const snapshotCity = (state) => ({ levels: Object.fromEntries(Object.values(state.city.buildings).map((b) => [b.id, b.level])), damaged: Object.values(state.city.buildings).filter((b) => b.damaged).map((b) => b.id), caravans: (state.stats?.caravans || 0), reports: (state.reports || []).length });
export function homecoming(before, state) {
  const built = [], damaged = [];
  for (const b of Object.values(state.city.buildings)) {
    const was = before.levels[b.id];
    if (was === undefined || b.level > was) built.push(b.id);
    if (b.damaged && !before.damaged.includes(b.id)) damaged.push(b.id);
  }
  const newReports = (state.reports || []).slice(0, Math.max(0, (state.reports || []).length - before.reports));
  const raidsWon = newReports.filter((r) => r.kind === 'defense' && r.win).length, raidsLost = newReports.filter((r) => r.kind === 'defense' && !r.win).length;
  const convoys = Math.max(0, (state.stats?.caravans || 0) - before.caravans);
  const parts = [];
  if (built.length) parts.push(`${built.length} chantier${built.length > 1 ? 's' : ''} terminé${built.length > 1 ? 's' : ''}`);
  if (raidsWon) parts.push(`${raidsWon} raid${raidsWon > 1 ? 's' : ''} repoussé${raidsWon > 1 ? 's' : ''}`);
  if (raidsLost) parts.push(`${raidsLost} raid${raidsLost > 1 ? 's' : ''} subi${raidsLost > 1 ? 's' : ''}`);
  if (damaged.length) parts.push(`${damaged.length} bâtiment${damaged.length > 1 ? 's' : ''} endommagé${damaged.length > 1 ? 's' : ''}`);
  if (convoys) parts.push(`${convoys} convoi${convoys > 1 ? 's' : ''} parti${convoys > 1 ? 's' : ''}`);
  return { built, damaged, raidsWon, raidsLost, convoys, text: parts.length ? `Pendant votre absence : ${parts.join(', ')}.` : '' };
}
