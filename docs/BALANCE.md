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

| Profil | HdV | Niveaux de bâtiments | Technos | Victoires | Défaites | Cases explorées | Territoires | Contrats | Or/h | Nourriture nette/h | Heures au plafond de stockage | Raids perdus | Sauvegarde |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Occasionnel | 8 | 36 | 0 | 1 | 2 | 4 | 0 | 0 | 672 | +681 | 80 | 14 | 129 Ko |
| Actif | 11 | 227 | 26 | 13 | 21 | 57 | 4 | 31 | 2 641 | +6 539 | 79 | 35 | 176 Ko |
| Très optimisé | 15 | 724 | 41 | 119 | 33 | 208 | 8 | 95 | 14 037 | +95 044 | 129 | 20 | 216 Ko |
| Économie | 11 | 227 | 26 | 1 | 8 | 46 | 4 | 38 | 2 916 | +9 569 | 38 | 35 | 172 Ko |
| Armée | 11 | 227 | 26 | 41 | 48 | 23 | 4 | 18 | 3 483 | +7 699 | 74 | 32 | 193 Ko |
| Exploration | 9 | 221 | 26 | 2 | 14 | 157 | 4 | 0 | 2 880 | +8 680 | 86 | 35 | 166 Ko |

Aucun profil n'a connu de famine, ni de valeur invalide (NaN, ressource négative).

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



Lecture :

- **Aucune spécialisation ne domine ni n'est obligatoire.** Toutes atteignent l'hôtel de ville 11 et environ 227 niveaux de bâtiments en 7 jours, et terminent 6 à 7 chapitres sur 8 (le chapitre 8 demande un héros intendant et une défense que le bot ne gère pas).
- **Les écarts vont dans le sens annoncé** :
  - Moissons : armée la plus nombreuse au début (20 unités au jour 1 grâce aux réserves de nourriture) et or/h le plus élevé.
  - La nourriture nette de fin dépend surtout de la taille de l'armée entretenue à cet instant. Les Anciens (8 567/h) avaient une petite armée.
  - Fer : le plus de victoires (15,5 contre 9).
  - Anciens : début le plus lent (HdV 4 au jour 1), rattrapé ensuite.
  - Ombres : nourriture nette la plus basse (−5 % de production).
  - Érudits : HdV 5,5 au jour 1 grâce à leur pierre de départ.
- **Les maluses restent gérables** : aucune famine, et entre 32 et 37 raids perdus sur 7 jours pour toutes (ce chiffre vient surtout du bot, qui envoie toute son armée en campagne).
- **Limite** : le bot joue de la même façon quelle que soit la spécialisation (il n'explore pas davantage en Pionniers, ne fait pas plus de diplomatie en Ombres). Le tableau mesure donc surtout l'absence de déséquilibre, pas le plein potentiel de chaque style. Les bonus eux-mêmes sont vérifiés formule par formule dans `tests/kingdoms.test.js`.

## Limites de la simulation

- Les bots jouent mal la guerre (ils envoient toute l'armée), ne font pas de diplomatie et ne participent pas aux événements. Leurs défaites et raids perdus sont donc **pessimistes**.
- 7 jours ne couvrent pas la fin de partie (dynasties successives, collections complètes).
