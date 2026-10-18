// v16 « Le Château » — Présages (grand observatoire) : almanach des présages et fil des répercussions en cours.
import { almanacCard, crisesCard } from '../repercussions.js';
import { repActions } from '../repercussions.js';

export default {
  id: 'omens', title: 'Présages', icon: '🔮',
  badge: (app) => (app.state.omens?.list || []).filter((o) => !o.resolved && o.kind === 'catastrophe').length,
  render(app) {
    const s = app.state;
    return `${almanacCard(s) || '<div class="card"><h2>🔮 Almanach des présages</h2><p class="muted">Les astrologues lisent le ciel à partir de l’hôtel de ville niveau 2 : les premiers présages arriveront bientôt.</p></div>'}${crisesCard(s)}`;
  },
  actions: { ...repActions },
};
