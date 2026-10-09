// Paramètres réglables des événements temporaires (surchargés par l'outil d'administration : state.admin.events)
export const LIVE_CONFIG = {
  gapHours: 0,            // pause entre deux événements majeurs
  durationMult: 1,        // multiplicateur de durée
  priceMult: 1,           // prix des boutiques
  currencyMult: 1,        // gains de monnaie
  enemyMult: 1,           // effectifs ennemis
  bossHpMult: 1,          // PV des boss
  surpriseMult: 1,        // fréquence des événements surprises
  lbSize: 200,            // joueurs dans le classement
  respawnMin: 50,         // réapparition des camps (minutes)
  maxMarches: 3,          // marches d'événement simultanées (+1 tous les 4 niveaux d'Hôtel de ville)
  autoCapPerDay: 400,     // plafond quotidien de monnaie gagnée par l'automatisation
  autoPerMin: 0.35,       // monnaie / minute / équipe d'expédition au travail
  memory: 4,              // un événement ne revient pas avant N autres
  globalStockSpeed: 1,    // vitesse d'achat simulée des autres joueurs (stocks serveur)
  weights: {},            // poids de rotation par événement
  disabled: [],           // événements retirés de la rotation
  incompatible: [['volcano', 'dragonHunt'], ['giants', 'volcano'], ['siege', 'deadNight']],
};
