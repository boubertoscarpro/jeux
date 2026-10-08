// Réputations et records personnels
export const REPUTATIONS = {
  merchant:   { name: 'Marchand', icon: '💰', desc: 'Commerce, caravanes, contrats honorés' },
  warrior:    { name: 'Guerrier', icon: '⚔️', desc: 'Victoires, sites nettoyés, guerres' },
  explorer:   { name: 'Explorateur', icon: '🧭', desc: 'Découvertes et expéditions lointaines' },
  diplomat:   { name: 'Diplomate', icon: '🕊️', desc: 'Traités, ambassades, paix' },
  lord:       { name: 'Seigneur', icon: '🏰', desc: 'Constructions et développement du domaine' },
  benefactor: { name: 'Bienfaiteur', icon: '🤲', desc: 'Aide aux villages, accueil des réfugiés' },
  tyrant:     { name: 'Tyran', icon: '🩸', desc: 'Tributs forcés, pillages, trahisons' },
};
const TIERS = [[600, 'Légendaire'], [300, 'Illustre'], [120, 'Reconnu'], [40, 'Connu']];
export const repTier = (v) => (TIERS.find(([t]) => v >= t) || [0, 'Inconnu'])[1];

export function bumpRep(state, axis, n) {
  const r = (state.reputation ||= {});
  r[axis] = Math.max(0, Math.min(1000, (r[axis] || 0) + n));
}

// Effets des réputations sur le royaume
export function repMods(state) {
  const r = state.reputation || {};
  const m = {};
  const v = (k) => r[k] || 0;
  m['market.fee'] = -Math.min(0.03, v('merchant') * 0.00005);
  m['caravan.gain'] = Math.min(0.15, v('merchant') * 0.0002);
  m['combat.morale'] = Math.min(12, v('warrior') / 40);
  m['loot.rare'] = Math.min(0.04, v('explorer') * 0.00006);
  m['build.speed'] = Math.min(0.1, v('lord') * 0.00015);
  m['worker.immigration'] = Math.min(1, v('benefactor') / 300);
  m['worker.morale'] = Math.min(10, v('benefactor') / 40) - Math.min(15, v('tyrant') / 30);
  return m;
}

export function recordMax(state, key, value, label, now = Date.now()) {
  const rec = (state.records ||= {});
  if (!rec[key] || value > rec[key].value) rec[key] = { value, label, t: now };
}
