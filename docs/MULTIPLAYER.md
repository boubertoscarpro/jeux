# Préparation à un éventuel multijoueur

> **Le jeu reste 100 % solo.** Aucun serveur, aucune connexion entre joueurs, aucun échange ni combat en ligne
> n'existe. Les « royaumes rivaux », la guilde et le tableau d'honneur sont simulés localement. Ce document liste
> seulement les fondations posées pour qu'une évolution future ne soit pas plus difficile.

## Identifiants stables (v9)

Tout est identifié par un **identifiant unique**, jamais par un nom affiché (deux joueurs peuvent nommer leur
château « Château de Cendrelande ») :

| Donnée | Identifiant | Où |
|---|---|---|
| Joueur | `identity.playerId` (`pl_…`) | `state.identity` |
| Royaume | `identity.kingdomId` (`kd_…`) | `state.identity` |
| Château principal | `identity.castleId` (`cs_…`), nom `identity.castleName` | `state.identity` |
| Bâtiment | `city.buildings[id].id` (`b_…`) | `state.city.buildings` |
| Avant-poste | `territories[x,y].id` (`op_…`), nom `name` | `state.territories` (indexé par position, identifié par `id`) |
| Mission dynamique | `missions.active[].id` (`ms_…`) | `state.missions` |

`ensureIdentity()` (`src/systems/identity.js`) complète l'identité de toute partie (nouvelle, migrée, importée) sans
jamais écraser l'existant. Les références internes (missions, événements) visent un avant-poste par son `id`, pas
par son nom : renommer ne casse rien, perdre l'avant-poste rend la mission « impossible » avec une explication.

## Appartenance des données

- **Joueur** : `identity.playerId`, préférences (`meta.advice`, `meta.tipsOff`, `meta.showUpgrades`).
- **Royaume** : `meta.kingdomName`, `kingdom` (spécialisation), ressources, technologies, armée, héros, quêtes,
  missions, réputation, relations avec les factions.
- **Château principal** : `identity.castleId/castleName`, `city` (grille, bâtiments, fortifications).
- **Avant-postes** : `territories` (chacun : `id`, `name`, position, terrain, spécialité, niveau, garnison).
- **Monde** : `world` (terrain, brouillard, lieux). Aujourd'hui propre à chaque partie (générée depuis la graine) ;
  un monde partagé devrait en sortir pour vivre côté serveur.

## Règles centralisées

Les actions importantes passent par une seule fonction de validation, utilisée à la fois par l'interface et par
la logique (un serveur pourrait l'appeler telle quelle) :

- `upgradeCheck()` / `startUpgrade()` (`systems/construction.js`) : améliorations ; l'icône « améliorable » et le
  compteur utilisent exactement la même règle.
- `outpostUpgradeCheck()` / `upgradeOutpost()` (`systems/territory.js`).
- `sanitizeName()` (`systems/identity.js`) : tous les noms (royaume, château, avant-postes) — espaces, longueur,
  caractères de contrôle et chevrons retirés ; l'affichage échappe en plus tout le HTML.
- Missions (`systems/missions.js`) et quêtes (`systems/questlines.js`) : progression calculée depuis l'état,
  récompenses versées une seule fois.

## Séparation données / règles / rendu

- `src/data` : tables (bâtiments, quêtes, événements…), sans logique d'interface.
- `src/systems` : règles pures, sans DOM, testées par `npm test`.
- `src/ui` : rendu uniquement (`art.js` et `worldArt.js` pour les illustrations ; aucune règle de jeu).

## Ce qu'il resterait à faire pour un vrai multijoueur

1. Un serveur faisant autorité qui exécute `src/systems` et stocke l'état par `playerId`/`kingdomId`.
2. Un monde partagé (aujourd'hui dans chaque sauvegarde) et des royaumes rivaux réels au lieu des IA locales.
3. Des comptes et une authentification ; l'unicité des noms visibles par d'autres joueurs (aujourd'hui, seuls les
   noms des avant-postes d'un même royaume doivent être distincts).
4. Remplacer `Date.now()` local par l'horloge du serveur (la progression hors ligne est aujourd'hui simulée).
