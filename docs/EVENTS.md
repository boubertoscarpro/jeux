# 🎪 Événements temporaires

Un grand événement de **72 h** s'enchaîne environ tous les 3 jours. Participer n'est jamais obligatoire. Les récompenses (exclusivités, Éclats Anciens, fragments) sont faites pour donner envie de jouer, sans pénaliser ceux qui sautent un événement.

## Architecture

| Fichier | Rôle |
|---|---|
| `src/data/liveEvents.js` | Configuration déclarative des 10 événements, des surprises, des offres de la Grande Foire, du marchand mystère et des énigmes |
| `src/data/liveConfig.js` | Réglages globaux (durées, prix, ennemis, fréquences…), surchargeables depuis l'outil d'administration |
| `src/systems/liveEvents.js` | Moteur générique : calendrier, rotation, cartes, marches, combats, boutiques, objectifs, passe, classement, guilde, surprises, notifications, bilan |
| `src/systems/liveMods.js` | Modificateurs de l'événement en cours (par exemple l'hiver des Géants ou la taxe réduite de la Foire) |
| `src/ui/views/events.js`, `eventShop.js`, `calendar.js`, `admin.js` | Interface (groupe 🎪 Événements) |

**Ajouter un événement** revient à ajouter une entrée à `LIVE_EVENTS`, sans toucher au moteur :

```
Event { name, icon, color, tags, weight, duration,
        story, faction, currency { key, name, icon, convert },
        enemies { typeDeCible: { unité: effectif } },
        map { w, h, terrain, fog?, targets [{ type, count, tiers }] },
        objectives [{ id, label, stat, target, reward }],
        bosses [{ name, unit, tiers [{ hp, reward }] }], coop?,
        shop { merchant, fixed, rotating, picks }, guild,
        mods?, special { caravans | ships | hearth | riddles | tracking | zones | veins | lava | waves | siege } }
```

Les cibles déjà disponibles sont : camp, port, chambre forte, crypte, meute, région, forteresse, boss, caravane, navire, trésor, village, brasier, énigme, piste, antre, filon, évent et citadelle.

## Calendrier et rotation

- Le calendrier prévoit toujours les **4 prochains événements**, affichés avec un compte à rebours.
- Le tirage est **pondéré** (`weight`) avec trois règles :
  - aucun retour avant 4 autres événements ;
  - deux événements qui partagent un thème (`tags`) ne s'enchaînent pas ;
  - certaines paires sont déclarées incompatibles (par exemple Volcan ↔ Dragon).

  L'ordre n'est donc jamais deux fois le même (vérifié par les tests).
- L'administration peut retirer un événement, changer son poids, régénérer le calendrier, ou lancer/terminer un événement immédiatement.

## Les 10 événements

| Événement | Monnaie | Mécanique propre |
|---|---|---|
| 🏹 Cavaliers des Steppes | 🐎 Médailles des Steppes | Camps I à VII, caravanes en mouvement (attaquer, escorter, commercer, espionner), forteresse, Khan rangs I à IV |
| 🏴‍☠️ Corsaires du Sud | ⚓ Pièces des Corsaires | Ports pillables ou commerce maritime, navires mobiles (+30 % à l'abordage avec un Port), trésors |
| ❄️ Hiver des Géants | 🧊 Éclats de givre | Survie (entretien +20 %, nourriture −15 %). Les Brasiers donnent de la chaleur, qui multiplie les gains |
| 🏛️ Ruines Anciennes | 🏺 Fragments Anciens | Carte dans le brouillard à explorer, énigmes (une mauvaise réponse scelle la salle 1 h), chambres fortes |
| 🐉 Chasse au Dragon | 🐉 Écailles de Dragon | Traque en 3 pistes, puis boss **coopératif du serveur** (60 M PV) avec paliers de récompense globaux |
| ⚔️ Guerre des Royaumes | 🚩 Bannières | Régions conquises tenues en garnison : revenu horaire, contre-attaques toutes les 2 h |
| ⛏️ Ruée vers l'Or | 🪙 Pépites | Filons qui s'épuisent ; des prospecteurs rivaux en revendiquent un chaque heure |
| 🌋 Colère du Volcan | 🔥 Braises | La lave se déplace chaque heure ; un évent cerné fait des pertes. Rare chance d'Éclat |
| 👻 Nuit des Morts | 👻 Âmes errantes | Vague contre **votre ville** toutes les 6 h ; chaque crypte purgée l'affaiblit de 4 % ; Feux sacrés (+20 % de défense) |
| 🏰 Siège des Anciens | 🏯 Sceaux | Garnison dans la Citadelle, assaut toutes les 4 h aux côtés du serveur, grande récompense si elle tient |

Chaque événement a aussi :

- des **objectifs** ;
- une **passe gratuite** à 20 niveaux, sans option payante ;
- un **boss à paliers** (sauf la Chasse au Dragon, coopérative) ;
- un **objectif de guilde collectif** ;
- un **classement** de 200 seigneurs simulés.

## Monnaies

- Chaque monnaie ne s'obtient **que pendant son événement**.
- À la fin, les objectifs et niveaux de passe non réclamés sont versés automatiquement. La monnaie restante est ensuite **convertie** en une ressource de base à un taux volontairement faible : il vaut mieux la dépenser.
- **Automatisation** : les équipes d'expédition au travail rapportent un petit revenu passif (0,35/min par équipe), **plafonné à 400 par jour**. Les meilleures récompenses (boss, camps VII, classement) demandent de jouer activement.

## Boutiques

- **Fixe** : ressources, soldats, coffres, équipement épique, fragments. On y trouve aussi **1 Éclat Ancien** (12 000 de monnaie, stock 3 par joueur et **5 pour tout le serveur**). Les autres seigneurs « achètent » aussi : premier arrivé, premier servi.
- **Exclusifs** (stock 1) : objet unique, héros spécial et décoration propres à l'événement.
- **Rotation** : 4 objets tirés à chaque occurrence parmi un catalogue propre à l'événement.
- **Marchand mystère** : 3 à 5 objets renouvelés chaque jour. Parfois un objet rare (un Éclat à 14 000).

## Événements surprises

| Surprise | Durée | Effet |
|---|---|---|
| ☄️ Pluie de Météores | 6 h | Filon légendaire temporaire sur la carte du monde. Un Éclat est parfois pris dans la roche : il revient au premier récolteur |
| 🐲 Dragon errant | 2 h | Boss mondial (incompatible avec la Chasse au Dragon) |
| 🎪 Grande Foire | 24 h, annoncée, hebdomadaire | Taxe du marché −50 % et 6 échanges avantageux |
| 🌑 Éclipse | 4 h | +10 % de butin rare, +3 % de détection d'Éclats (incompatible avec la Nuit des Morts) |

## Notifications

Une cloche 🔔 dans le bandeau signale :

- le début d'un événement, et le suivant une heure à l'avance ;
- la fin proche (6 h avant) ;
- l'apparition d'un boss ;
- l'arrivée du marchand mystère, avec la mention d'un objet rare ;
- les vagues imminentes ;
- les paliers coopératifs atteints ;
- les régions perdues ;
- les énigmes à résoudre.

## Bilan de fin

Une fenêtre récapitule l'événement : rang final, camps vaincus, monnaie gagnée, rangs de boss, conversion, récompenses de fin et meilleur gain. L'historique est conservé dans le Calendrier.

## Équilibrage observé (bot, 72 h, Hôtel de ville 8)

| Style de jeu | Monnaie gagnée | Rang /200 |
|---|---|---|
| Passif (automatisation seule) | ≤ 1 200 | ~150 |
| Joueur régulier (quelques marches par jour) | 6 000 à 10 000 | 80 à 110 |
| Bot très actif (5 troupes en permanence) | 15 000 à 32 000 | 5 à 45 |

Les exclusifs coûtent entre 6 000 et 15 000. Un joueur régulier peut donc s'offrir une exclusivité par événement, et un joueur très actif presque tout le catalogue.

## Administration

L'onglet **Admin** s'ouvre avec `?dev` dans l'adresse, ou depuis le bas du Calendrier. Il permet de :

- régler toutes les valeurs numériques : durées, prix, gains, ennemis, PV des boss, fréquence des surprises, taille du classement, réapparition, marches, plafond d'automatisation ;
- modifier les poids et l'activation de chaque événement ;
- lancer, terminer ou régénérer le calendrier ;
- déclencher une surprise ;
- donner de la monnaie ;
- suivre l'économie des Éclats (voir [ECONOMY.md](ECONOMY.md)).
