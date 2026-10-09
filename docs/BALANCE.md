# ⚖️ Équilibrage par simulation

Toutes les valeurs ci-dessous viennent de simulations qui utilisent **le vrai moteur du jeu** : mêmes formules, mêmes tirages, même sauvegarde. Ce ne sont pas des estimations.

| Commande | Ce qu'elle mesure |
|---|---|
| `node tools/profileSim.js 7 2` | Progression de 6 profils sur 7 jours de jeu (2 parties par profil) |
| `node tools/economySim.js 90 40` | Économie des Éclats Anciens sur 90 jours (voir [ECONOMY.md](ECONOMY.md)) |
| Matrice de combat de l'audit | 10 compositions à coût égal, sur 3 terrains (voir [AUDIT.md](AUDIT.md)) |

## Profils simulés

Chaque profil est un « bot » qui joue selon un rythme et des priorités.

| Profil | Rythme | Priorités |
|---|---|---|
| Occasionnel | 2 sessions par jour (8 h et 20 h) | Économie de base, planifie ses chantiers |
| Actif | Toutes les 30 min, de 8 h à 23 h | Équilibré |
| Très optimisé | Toutes les 10 min, de 7 h à minuit | Hôtel de ville d'abord, tout le reste ensuite |
| Économie | Actif | Production, contrats, vente des surplus ; peu d'armée |
| Armée | Actif | Formation et attaques |
| Exploration | Actif | Éclaireurs, territoires |

## Résultats sur 7 jours (moyenne de 2 parties)

| Profil | HdV | Chapitres finis | Niveaux de bâtiments | Technos | Victoires | Défaites | Cases explorées | Territoires | Contrats | Or/h | Nourriture nette/h | Famine (h) | Heures au plafond | Raids perdus | Sauvegarde |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Occasionnel | 8,5 | 2 | 36,5 | 0 | 1 | 1 | 4 | 0 | 0 | 832 | +804 | 9 | 17,5 | 28 | 144 Ko |
| Actif | 11 | 6 | 227 | 26 | 11,5 | 19,5 | 63,5 | 4 | 33 | 2 612 | +5 626 | 0,5 | 77 | 36 | 184 Ko |
| Très optimisé | 15 | 7 | 720 | 41 | 114 | 35 | 224 | 8 | 100 | 13 528 | +114 402 | 0 | 126 | 24 | 216 Ko |
| Économie | 11 | 6 | 227 | 26 | 5 | 8 | 38 | 4 | 30 | 3 394 | +8 040 | 0,5 | 37,5 | 36 | 180 Ko |
| Armée | 11 | 6,5 | 227 | 26 | 53 | 43 | 34 | 4 | 20 | 2 344 | +6 205 | 0 | 91,5 | 31 | 200 Ko |
| Exploration | 9 | 4,5 | 220 | 26 | 0,5 | 10,5 | 162 | 4 | 10 | 2 804 | +9 392 | 0,5 | 86,5 | 37,5 | 170 Ko |

Aucune valeur invalide (NaN, ressource négative).

- Le bot suit désormais le parcours guidé (missions de construction, entraînement, ambassadeur, caravane, expédition) et réclame ses récompenses.
- La famine du joueur occasionnel (9 h sur 168) survient au tout début, avant sa première ferme.
- « Chapitres finis » : le joueur occasionnel en termine 2 ; il bute sur les éclaireurs, car le bot n'en forme presque pas.

## Déséquilibres démontrés et corrigés

**1. Le joueur occasionnel restait bloqué.**

- Avant : Hôtel de ville 1 après 7 jours, ressources au plafond 139 h sur 168, donc presque toute la production perdue.
- Cause : un seul chantier à la fois et deux sessions par jour.
- Correction : **chantiers planifiés** (jusqu'à 3). Ils démarrent seuls dès qu'une place se libère et sont payés au démarrage seulement.
- Après : Hôtel de ville 8 et 80 h au plafond. Les joueurs actifs n'y gagnent rien de plus, puisque leur file est déjà occupée.

**2. Conséquence d'un siège perdu trop lourde.**

- Les royaumes peu armés perdent environ 4 raids par jour.
- Brûler 1 à 2 bâtiments à chaque fois créait une spirale (réparations en boucle).
- Correction : un seul bâtiment, une fois sur deux, entrepôts épargnés.

**3. Performances.**

- Une évaluation de l'économie au coût quadratique rendait les longues parties de plus en plus lentes : 14 minutes pour cette simulation.
- Corrigé : environ 3× plus rapide, et le coût ne s'emballe plus.

**Économie, commerce et combat.** Les autres déséquilibres corrigés sont listés dans [AUDIT.md](AUDIT.md) : boucles marché → caravane, contrats, chaînes qui gaspillent, archers dominants, exploration infinie, Cité perdue.

**4. Blocage définitif possible en tout début de partie** (révélé par la simulation du parcours guidé).

- Un royaume qui dépense toute sa pierre avant de bâtir une carrière ne pouvait plus jamais en construire, puisque la carrière coûte de la pierre. Même chose pour le bois et la scierie.
- Correction : le **premier exemplaire** d'un producteur de base (scierie, carrière, ferme) est offert quand le royaume n'en possède aucun. C'est affiché « 🎁 Offert » dans le menu de construction.
- Pas d'abus possible : la démolition ne rembourse rien, et l'annulation rembourse 80 % de ce qui a été payé (donc rien).
- Le cas est couvert par un test de non-régression.

## Points observés, laissés en l'état (et pourquoi)

**Raids fréquents contre les royaumes sans défense** (~2 à 5 par jour).

- C'est voulu : un royaume peut s'en protéger par l'armée, la muraille et la tour de garde, ou par la **diplomatie** (traités, alliances, tributs : aucun raid).
- Les bots n'utilisent pas la diplomatie et envoient toute leur armée en campagne : ils exagèrent donc le problème.
- Le conseil contextuel « Un raid approche » explique les options.

**Ressources souvent au plafond chez les joueurs actifs** (75 à 90 h sur 168).

- L'onglet **Bilan** signale désormais l'entrepôt plein et la production perdue.
- Le profil « Économie », qui vend ses surplus, descend à 38 h.
- Les bots améliorent rarement l'entrepôt. Augmenter la capacité de base retirerait une décision de gestion intéressante.
- À revoir si des retours de joueurs le confirment.

**Le joueur très optimisé atteint l'Hôtel de ville 15 (prestige) en 7 jours.**

- C'est avec une action toutes les 10 minutes, 17 h par jour : un rythme extrême.
- Les profils actifs atteignent le niveau 9 à 11.
- La dynastie est conçue comme un objectif de plusieurs semaines pour un joueur normal, et rien n'oblige à la fonder.
- Ralentir tout le monde pour freiner ce cas pénaliserait les autres profils, ce qui va contre la consigne « ne pas rendre le jeu inutilement lent ».

**Gains d'Éclats Anciens par profil** (0,3 / 2,3 / 5,6 par jour) : conformes aux cibles et vérifiés par `tests/shards.test.js`.

## Spécialisations de royaume (début, milieu et fin de partie)

`node tools/profileSim.js --kingdoms 7 2` : profil « Actif », 2 parties par spécialisation. Le bot suit le parcours guidé (il réclame les récompenses, fait l'exercice d'entraînement, envoie un ambassadeur, une caravane et une expédition quand le chapitre le demande). Les valeurs « a / b / c » sont relevées à 1, 3 et 7 jours.

| Spécialisation | HdV | Niv. bâtiments | Technos | Chapitres finis | Victoires | Cases explorées | Armée | Or/h (fin) | Nourriture nette/h (fin) | Famine (h) | Raids perdus |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sans spécialisation | 5 / 7.5 / 11 | 41.5 / 96.5 / 226.5 | 4 / 11 / 26 | 6 | 2 / 3.5 / 9.5 | 6.5 / 27 / 60 | 1.5 / 15 / 12 | 3467 | 6657 | 1 | 37 |
| Royaume des Moissons | 6 / 8.5 / 11 | 44.5 / 99.5 / 227 | 2 / 11 / 26 | 7 | 0.5 / 1.5 / 8.5 | 8 / 26 / 57 | 1 / 4.5 / 23.5 | 2893 | 6615 | 0 | 34 |
| Royaume de Fer | 5.5 / 8.5 / 11 | 43.5 / 99.5 / 227 | 4 / 11 / 26 | 6.5 | 1.5 / 5 / 20 | 5 / 24 / 60.5 | 1.5 / 8 / 13.5 | 2572 | 7445 | 0 | 34 |
| Royaume des Marchands | 5 / 8.5 / 11 | 41 / 99.5 / 227 | 4 / 11 / 26 | 6 | 2 / 3.5 / 7.5 | 6.5 / 25.5 / 67 | 1.5 / 6.5 / 6.5 | 3057 | 6702 | 1 | 36 |
| Royaume des Érudits | 5.5 / 8 / 11 | 42 / 98 / 227 | 3.5 / 11 / 26 | 7 | 0.5 / 4 / 12 | 6.5 / 18.5 / 59 | 0.5 / 10 / 21 | 2741 | 6614 | 1 | 35 |
| Royaume des Pionniers | 5 / 8 / 11 | 40.5 / 98 / 227 | 1.5 / 11 / 26 | 7 | 0.5 / 2.5 / 12 | 7.5 / 26 / 58.5 | 9 / 11.5 / 23 | 2541 | 4819 | 0 | 33 |
| Royaume des Bastions | 5.5 / 8 / 11 | 44 / 99 / 227.5 | 4.5 / 11 / 26 | 6 | 2 / 4 / 14 | 4.5 / 17 / 54.5 | 1 / 4.5 / 5 | 2740 | 6365 | 0 | 37 |
| Royaume des Ombres | 5 / 8 / 11 | 40.5 / 98 / 227 | 2 / 11 / 26 | 7 | 0.5 / 2 / 8.5 | 8 / 25 / 58 | 3 / 9 / 5.5 | 2219 | 6609 | 0 | 37 |
| Royaume des Anciens | 5.5 / 8 / 11 | 43.5 / 98 / 227 | 4.5 / 11 / 26 | 7 | 1.5 / 4 / 15.5 | 8 / 19 / 53 | 1 / 11 / 19.5 | 2366 | 4164 | 0 | 35 |

Lecture :

- **Aucune spécialisation ne domine ni n'est obligatoire.** Toutes atteignent l'hôtel de ville 11 et 227 niveaux de bâtiments en 7 jours, et terminent 6 à 7 chapitres sur 8 (le chapitre 8 demande un héros intendant et une défense que le bot ne gère pas).
- **Les écarts vont dans le sens annoncé** :
  - Moissons : le départ le plus rapide (HdV 6 au jour 1) grâce aux réserves de nourriture.
  - Fer : le plus de victoires (20 contre 9,5 sans spécialisation).
  - Pionniers et Anciens : nourriture nette la plus basse (−10 % et −7 % de nourriture).
  - Ombres : or/h le plus bas (−5 % de toute production).
  - Les écarts restent de l'ordre de la variance entre parties. Aucun choix ne ferme de porte.
- **Les maluses restent gérables** : au plus 1 h de famine, et entre 33 et 37 raids perdus sur 7 jours pour toutes (ce chiffre vient surtout du bot, qui envoie toute son armée en campagne).
- **Limite** : le bot joue de la même façon quelle que soit la spécialisation (il n'explore pas davantage en Pionniers, ne fait pas plus de diplomatie en Ombres). Le tableau mesure donc surtout l'absence de déséquilibre, pas le plein potentiel de chaque style. Les bonus eux-mêmes sont vérifiés formule par formule dans `tests/kingdoms.test.js`.

## Limites de la simulation

- Les bots jouent mal la guerre (ils envoient toute l'armée), ne font pas de diplomatie et ne participent pas aux événements. Leurs défaites et raids perdus sont donc **pessimistes**.
- 7 jours ne couvrent pas la fin de partie (dynasties successives, collections complètes).
