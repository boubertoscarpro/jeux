# 🗺️ Cartes agrandies, navigation et soutien au projet

## Dimensions

| Carte | Avant | Maintenant |
|---|---|---|
| Royaume (nouvelle partie) | 14×10 = 140 cases | **24×16 = 384 cases** (×2,7) |
| Royaume (agrandi au maximum) | 22×14 = 308 cases | **40×24 = 960 cases** : 4 étapes de +4 colonnes et +2 rangées |
| Monde | 48×48 = 2 304 cases | **96×96 = 9 216 cases** (×4) |
| Lieux du monde | ≈ 170 | **≈ 680** |
| Cités libres | 6 | 12 |

## Royaume

La configuration est centralisée : `CITY_W`, `CITY_H`, `TOWN_X`, `TOWN_Y` et `RUBBLE_COUNT` dans `src/core/state.js`, et `DOMAIN_GROW` dans `src/systems/domain.js`. Il n'existe pas de seconde carte.

**Génération** (`generateCity`) :

- une rivière sinueuse à l'ouest et une lisière de forêt ;
- une chaîne de montagnes au nord-est et un éperon rocheux au sud-est ;
- des forêts au sud et quatre bosquets ;
- le hameau au centre, avec plus de 200 cases libres.

Chaque bonus d'adjacence (scierie et forêt, carrière et montagne, ferme et rivière) reste disponible. C'est testé sur plusieurs graines.

**Équilibrage inchangé** :

- mêmes ressources de départ, mêmes 3 bâtiments, mêmes coûts et mêmes règles de déblocage ;
- toujours **14 décombres**, pour ne pas donner plus de butin de déblaiement ;
- les agrandissements coûtent le même prix qu'avant ; leurs nouvelles bandes contiennent peu de décombres (4 % des cases).

## Monde

`WORLD_SIZE = 96` (`src/data/world.js`), généré par `generateWorld(seed, S)` (`src/systems/worldgen.js`).

### Génération

- **Densité constante** : le nombre de chaque type de lieu est proportionnel à la surface (`POI_DENSITY` × 4). Les environs de la capitale sont donc aussi riches qu'avant.
- **Ressources essentielles proches** :
  - bois, pierre, nourriture, fer et un camp de bandits sont garantis à 5 cases ;
  - une ceinture supplémentaire de bois, pierre, nourriture et fer se trouve entre 6 et 12 cases ;
  - deux cités sont à moins de 12 cases.
- **Ressources rares éloignées** : jamais plus près que 6 à 8 cases (argent, cristaux, gemmes, bosquets anciens). Les donjons sont à 12 cases ou plus.
- **Progression du danger** : le danger augmente sur `DANGER_RADIUS = 34` cases. Au-delà commencent les « terres lointaines », un peu plus rudes (danger moyen mesuré : environ 0,7 à moins de 10 cases, environ 1,6 entre 10 et 20 cases, environ 2 entre 20 et 40 cases, plus de 2,3 au-delà de 40 cases).
- **Factions** : les 5 royaumes rivaux sont placés entre 10 et 34 cases (placement garanti). Leur territoire peut s'étendre dans tout le monde.
- **Cités libres** : 12, réparties en trois couronnes (2 proches, 4 intermédiaires, 6 lointaines).
- **Biomes** : toundra au nord, terres de cendre à l'est, proportionnelles à la taille. Il y a deux fois plus de rivières.

### Distances

- Un trajet coûte toujours 18 s par case à la vitesse 1. Aller de la capitale au coin du monde prend environ 8 min pour un éclaireur et 20 min pour des lanciers. Les terres lointaines (34 cases) sont à environ 10 min.
- Les événements (boss, horde lointaine, région révélée, météorite, Cité perdue, gisements de cristaux) utilisent une échelle plafonnée (`worldScale` ≤ 48 cases). Ils apparaissent à la même distance qu'avant, pas à l'autre bout du monde.
- Les boss mondiaux restent à 6–12 cases de la capitale.

### Performances

- La génération prend environ 6 ms. Une sauvegarde neuve pèse environ 130 Ko, et environ 275 Ko après 7 jours de jeu.
- Le canvas ne dessine que les cases visibles. En vue d'ensemble, les lieux mineurs deviennent des points colorés (les cités, royaumes, boss et la capitale gardent leur icône).
- Les déplacements sont redessinés une fois par image (`requestAnimationFrame`). Un rendu complet prend environ 1 ms (mesuré dans Chromium).
- Le fond de la mini-carte est mis en cache et recalculé seulement quand le brouillard change.

## Zoom et déplacement

| | Royaume | Monde |
|---|---|---|
| Molette | zoom centré sur le curseur | zoom centré sur le curseur |
| Glisser (souris ou doigt) | déplacement | déplacement |
| Pincement (tactile) | zoom | zoom |
| ＋ / － | zoom au centre | zoom au centre |
| ⤢ | vue d'ensemble du royaume | vue d'ensemble du monde |
| Recentrer | 🏛️ hôtel de ville, zoom par défaut | 🏰 capitale, zoom par défaut |
| Limites | 0,3× à 2× | monde entier visible à 3× |
| Extras | — | 🗺️ mini-carte (clic ou glisser pour s'y rendre), filtres (Ressources, Menaces, Donjons & ruines, Cités & royaumes), menu « 📍 Aller à… » (lieux découverts, du plus proche au plus lointain), noms des cités et royaumes en zoom rapproché |

- **Bornes** : la caméra ne sort jamais de la carte. Une carte plus petite que la fenêtre est centrée.
- **Glisser n'est pas cliquer** : au-delà de 5 px, c'est un déplacement, et la case sous le curseur n'est pas sélectionnée.
- **Sélection exacte** :
  - Royaume : la grille HTML est transformée en CSS, donc les cases restent de vrais boutons, sélectionnables sans décalage à tous les niveaux de zoom.
  - Monde : la case est calculée à partir de la caméra.
- **Taille des cases** : sur le royaume, elles mesurent 46 px au zoom par défaut, au lieu de rétrécir pour tout faire tenir.
- **Molette** : elle ne zoome que lorsque le curseur est sur une carte. Ailleurs, la page défile normalement. Les panneaux et fenêtres ne sont pas affectés par le zoom.

## Anciennes parties (sauvegarde v8)

Migration v7 → v8 (`src/core/save.js`) : **rien n'est déplacé ni supprimé**.

**Royaume** : la grille s'étend vers l'est et le sud jusqu'à 24×16, plus 4×2 par agrandissement déjà acheté.

- Les anciennes cases et les bâtiments gardent leurs coordonnées.
- La rivière se prolonge vers le sud.
- Aucun décombre n'est ajouté.

**Monde** : il s'étend de 48×48 à 96×96, vers l'est et le sud.

- La capitale, le terrain, le brouillard, les sites, les territoires et les factions restent identiques.
- Les nouvelles régions, encore inexplorées, reprennent le terrain et les lieux d'un monde généré avec la même graine. Leur danger est recalculé depuis la capitale : elles sont plus dangereuses, car plus lointaines.
- Une cité n'est ajoutée que si son nom n'existe pas déjà.

Tout est vérifié par `tests/maps.test.js`, y compris un double chargement.

## Soutien au projet

L'écran de démarrage (création du royaume) contient l'encart **« Soutenez le développement de Cendrelande »**, avec le texte demandé et le bouton **❤️ Soutenir le projet**.

- Le lien est `https://paypal.me/Oscarwildrift`, ouvert dans un nouvel onglet avec `target="_blank" rel="noopener noreferrer"`. La page du jeu reste ouverte, et le nouvel onglet n'a pas accès à la partie.
- C'est un simple lien. Le jeu ne contient aucun paiement, aucun champ bancaire, aucune récompense liée à un don, et il ne sait pas si un don a été fait. Rien n'est bloqué.
- L'encart est placé sous le choix des spécialisations. Le bouton pour commencer la partie reste toujours visible (bas de fenêtre fixe), et on peut jouer sans jamais toucher à l'encart.
