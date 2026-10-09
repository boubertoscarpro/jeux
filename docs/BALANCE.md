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

## Résultats sur 7 jours (moyenne de 2 parties, royaume 24×16 et monde 96×96)

| Profil | HdV | Chapitres finis | Niveaux de bâtiments | Technos | Victoires | Défaites | Cases explorées | Territoires | Contrats | Or/h | Nourriture nette/h | Famine (h) | Heures au plafond | Raids perdus | Sauvegarde |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Occasionnel | 8 | 2 | 35 | 0 | 0,5 | 0,5 | 4 | 0 | 0 | 656 | +558 | 0 | 17,5 | 30 | 240 Ko |
| Actif | 11 | 6,5 | 226 | 26 | 11 | 18,5 | 58 | 4 | 32,5 | 2 383 | +7 673 | 0 | 82 | 35 | 275 Ko |
| Très optimisé | 15 | 7 | 720 | 41 | 120 | 34 | 197 | 8 | 106 | 8 994 | +110 139 | 0 | 124 | 22,5 | 310 Ko |
| Économie | 11 | 4,5 | 227 | 26 | 4,5 | 9 | 44 | 4 | 29 | 2 883 | +9 119 | 0 | 40 | 38,5 | 272 Ko |
| Armée | 11 | 7 | 227 | 26 | 44,5 | 48 | 31 | 4 | 21,5 | 3 322 | +6 635 | 0 | 85 | 33,5 | 292 Ko |
| Exploration | 9 | 6 | 220 | 26 | 2 | 11 | 160 | 4 | 16 | 2 744 | +7 036 | 0,5 | 85,5 | 34,5 | 262 Ko |

Aucune valeur invalide (NaN, ressource négative).

- Le bot suit désormais le parcours guidé (missions de construction, entraînement, ambassadeur, caravane, expédition) et réclame ses récompenses.
- Le passage aux cartes agrandies ne change pas le rythme de progression (mêmes hôtels de ville, mêmes niveaux de bâtiments qu'avec le monde 48×48). Les sauvegardes passent d'environ 180 Ko à environ 275 Ko.
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
- Correction : quand le royaume ne possède **aucun** producteur de base (scierie, carrière, ferme) **et ne peut pas en payer un**, le premier exemplaire est offert. C'est affiché « 🎁 Offert (secours) » dans le menu de construction. Dans tous les autres cas, le prix normal s'applique : aucun cadeau en début de partie.
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
| Sans spécialisation | 4.5 / 7 / 10.5 | 39.5 / 94.5 / 225 | 3.5 / 11 / 26 | 7 | 2 / 4.5 / 14.5 | 5.5 / 24 / 59.5 | 1 / 8.5 / 5 | 2719 | 6885 | 0 | 35 |
| Royaume des Moissons | 5 / 8 / 11 | 42 / 98 / 227 | 4 / 11 / 26 | 6.5 | 1 / 4 / 11.5 | 9 / 21.5 / 59.5 | 21 / 24 / 23 | 3085 | 6646 | 0 | 33 |
| Royaume de Fer | 5 / 7 / 11 | 41.5 / 95 / 227 | 4 / 11 / 26 | 7 | 3 / 7 / 16 | 9 / 28 / 60.5 | 2 / 25.5 / 12 | 2137 | 5198 | 0 | 34 |
| Royaume des Marchands | 5 / 8.5 / 11 | 40.5 / 98.5 / 226 | 3 / 11 / 26 | 7 | 2.5 / 6.5 / 17.5 | 6 / 21.5 / 59.5 | 1.5 / 10.5 / 3.5 | 3162 | 7106 | 0 | 36 |
| Royaume des Érudits | 5 / 7.5 / 11 | 40.5 / 96 / 226.5 | 2 / 11 / 26 | 7 | 1.5 / 2 / 14 | 7 / 22.5 / 54 | 1 / 4 / 27 | 2362 | 6929 | 0 | 35 |
| Royaume des Pionniers | 5 / 8 / 11 | 41 / 98 / 227 | 3.5 / 11 / 26 | 7 | 1.5 / 3.5 / 9.5 | 10 / 27 / 62.5 | 23.5 / 4.5 / 16 | 2368 | 4961 | 1 | 35 |
| Royaume des Bastions | 5 / 8.5 / 11 | 42 / 100.5 / 228 | 3.5 / 11 / 26 | 6.5 | 2 / 6.5 / 13.5 | 12 / 28.5 / 59 | 1.5 / 45 / 22.5 | 2247 | 4651 | 0 | 35 |
| Royaume des Ombres | 5 / 7.5 / 11 | 40.5 / 96 / 226.5 | 3.5 / 11 / 26 | 6.5 | 1.5 / 4.5 / 9 | 8 / 23.5 / 61 | 3 / 12 / 15 | 2185 | 8295 | 0 | 34 |
| Royaume des Anciens | 5 / 8 / 11 | 41.5 / 98 / 226.5 | 4.5 / 11 / 26 | 7 | 1 / 5 / 17.5 | 7 / 20 / 54 | 1.5 / 19 / 11.5 | 2449 | 10526 | 0 | 33 |

Lecture :

- **Aucune spécialisation ne domine ni n'est obligatoire.** Toutes atteignent l'hôtel de ville 10,5 à 11 et environ 227 niveaux de bâtiments en 7 jours, et terminent 6,5 à 7 chapitres sur 8 (le chapitre 8 demande un héros intendant et une défense que le bot ne gère pas).
- **Ce qui ressort malgré la variance** :
  - Moissons : une armée nombreuse en ville dès le début et maintenue (21 à 24 unités aux trois relevés), grâce aux réserves de nourriture.
  - Pionniers : le plus de cases explorées au jour 7 (62,5), mais une nourriture nette parmi les plus basses (−10 % de nourriture).
  - Les autres écarts (victoires, or/h) sont du même ordre que l'écart entre deux parties de la même spécialisation.
- **Les maluses restent gérables** : au plus 1 h de famine, et entre 33 et 36 raids perdus sur 7 jours pour toutes (ce chiffre vient surtout du bot, qui envoie toute son armée en campagne).
- **Limite** : le bot joue de la même façon quelle que soit la spécialisation (il n'explore pas davantage en Pionniers, ne fait pas plus de diplomatie en Ombres). Le tableau mesure donc surtout l'absence de déséquilibre, pas le plein potentiel de chaque style. Les bonus eux-mêmes sont vérifiés formule par formule dans `tests/kingdoms.test.js`.

## Limites de la simulation

- Les bots jouent mal la guerre (ils envoient toute l'armée), ne font pas de diplomatie et ne participent pas aux événements. Leurs défaites et raids perdus sont donc **pessimistes**.
- 7 jours ne couvrent pas la fin de partie (dynasties successives, collections complètes).
