# Audit v16 — « Le Château et ses Faubourgs »

**Point de départ** : la v15 « L'Atlas vivant » (carte peinte, scène, tiroirs, signes, Némésis).

**Thème de la v16** : l'immersion dans son propre château. On s'inspire de ce qui fait le charme de Goodgame Empire (un château fortifié qu'on voit, une ville sur laquelle on clique, des remparts qu'on défend) sans le copier.

**Captures « avant »** : `docs/v16/avant/`, prises avec la version compilée v15 figée, à 3 tailles (1400 × 900, 1024 × 640 et 390 × 844), via `tools/v16shots.cjs`.
- `01-royaume-debut` : nouvelle partie.
- `02-royaume-milieu` : vraie sauvegarde v15, joueur simulé « Actif », 3 jours, HdV 7, 55 bâtiments.
- `03-raid-approche` : même sauvegarde, avec un raid qui arrive dans 7 min.
- `04-royaume-fin` et `05-royaume-fin-ensemble` : vraie sauvegarde v15, joueur simulé « Très optimisé », 7 jours, HdV 15, 94 bâtiments, agrandie au domaine maximal (40 × 24).
  - Aucun joueur simulé ne construit la muraille. La sauvegarde a donc été réglée à **muraille 14 et douves 6**, pour vérifier qu'on ne les voit nulle part.

## 1. Constats vérifiés

| # | Constat annoncé | Vérification | Gravité |
|---|---|---|---|
| 1 | **Rien n'évoque un château** : un grand pré peint où flottent quelques bâtiments. | **Confirmé.** En milieu de partie (02), l'hôtel de ville, l'entrepôt et les maisons sont seuls au centre. Les 52 autres bâtiments sont à 5 à 10 cases de là, en deux grappes : le long de la rivière, et au pied des montagnes. Le placement suit seulement les bonus d'adjacence. Aucune forme de ville ni de centre. | 🔴 |
| 2 | **La muraille et les douves ne se voient nulle part.** | **Confirmé** (04, 05). Avec une muraille au niveau 14 et des douves au niveau 6, la carte du royaume est identique à une partie sans fortifications. Elles n'existent que dans la carte « Fortifications » sous la carte, et dans un pourcentage du rapport de défense. | 🔴 |
| 3 | **Le menu de gauche est lourd.** | **Confirmé.** 11 entrées + le Conseiller, **41 sous-onglets**, dont 13 peuvent être verrouillés (🔒). Sur téléphone, la barre du bas ne montre que 6 entrées sur 12 et il faut la faire défiler (01-mobile). | 🟠 |
| 4 | **La plupart des écrans correspondent à un bâtiment existant.** | **Confirmé.** Marché → Commerce ; caserne → Armée ; taverne → Héros ; forge et armurerie → Artisanat ; bibliothèque → Recherche ; maison de guilde → Guilde ; entrepôt → Bilan ; hôtel de ville → Objectifs, Conseil… Pourtant, cliquer sur la caserne ouvre seulement sa fiche d'amélioration : on ne passe pas du bâtiment à l'écran. | 🟠 |
| 5 | **Un raid qui arrive ne se voit pas sur la carte.** | **Confirmé** (03) : seul le bandeau du haut l'annonce. La muraille ne réagit pas, aucune troupe ne se montre. | 🟠 |
| 6 | **Le zoom sur une grande ville est lent** (constat nouveau). | **Mesuré** (`perf-royaume.json`, ville 40 × 24, 960 cases, 1400 × 900) : image médiane de **74,7 ms** pendant un zoom à la molette (95e centile : 190 ms) ; rendu complet de l'écran : 82 ms. **Cause** : chaque cran de molette réécrit la variable CSS `--bz` sur la fenêtre, ce qui recalcule le style des 960 cases et de leurs dessins. On est loin des 60 images/s demandées. | 🔴 |
| 7 | **Les icônes d'amélioration couvrent la vue d'ensemble** (constat nouveau). | **Confirmé** (05) : 92 pastilles « amélioration » au zoom global. Elles masquent les bâtiments eux-mêmes. | 🟡 |
| 8 | **Les décorations n'ont aucun effet** (constat nouveau). | **Confirmé** : `placeDeco` pose un emoji sur une case, sans aucun effet de jeu. | 🟡 |

## 2. Plan des zones

**Principe.** Le royaume s'organise en anneaux autour de l'**enceinte**, un rectangle de cases centré sur l'hôtel de ville.
- **La muraille court sur le bord des cases** : elle n'occupe aucune case et ne déplace aucun bâtiment.
- **Les douves longent la muraille à l'extérieur.**

```
 campagne   campagne   campagne   campagne   campagne   campagne   campagne
 campagne ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ campagne
 campagne   faubourgs (2 cases au-delà des douves)      campagne
 campagne │  ≈≈≈≈≈≈≈≈≈≈≈≈ douves ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈  │ campagne
 campagne   ≈ ▲━━━━━━━━━━━ muraille ━━━━━━━━━━━▲ ≈    campagne
 campagne │ ≈ ┃  cour du donjon (intra-muros)    ┃ ≈ │ campagne
 campagne   ≈ ┃  hôtel de ville · donjon          ┃ ≈    campagne
 campagne │ ≈ ┃  bibliothèque · laboratoire       ┃ ≈ │ campagne
 campagne   ≈ ┃  forge · armurerie · intendance   ┃ ≈    campagne
 campagne │ ≈ ▲━━━━━━━━━━ porte ▣ ━━━━━━━━━━━━━▲ ≈ │ campagne
 campagne   ≈≈≈≈≈≈≈≈≈≈≈ pont-levis ═ ≈≈≈≈≈≈≈≈≈≈≈≈    campagne
 campagne │  marché · taverne · maisons · ateliers  │ campagne
 campagne └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ campagne
   fermes, scieries, carrières, mines, pâturages… (bords de carte, selon le terrain)
```

### Les zones

| Zone | Où | Ce qu'on y trouve |
|---|---|---|
| **Cour du donjon** | Cases à l'intérieur du rectangle | Hôtel de ville, donjon, bâtiments savants et militaires |
| **Muraille** | Bord du rectangle | Tours aux angles et tous les 4 segments ; porte au milieu du côté sud |
| **Douves** | Bande d'eau au pied de la muraille, à l'extérieur, dès le niveau 1 | Pont-levis devant la porte |
| **Faubourgs** | Cases à 1 ou 2 cases de l'enceinte | Commerce, auberges, maisons, ateliers |
| **Campagne** | Tout le reste | Champs, bois, carrières, mines |

### Apparence de la muraille selon son niveau

| Niveau | Apparence |
|---|---|
| 0 | Piquets : « enceinte projetée » |
| 1–4 | Palissade de bois |
| 5–9 | Mur de pierre |
| 10–17 | Remparts à tours |
| 18–25 | Forteresse : tours doubles, bannières |

- **Douves** : la largeur dessinée vaut 6 + 2 × niveau px, sur une case de 64 px.

### Taille de l'enceinte

- **Nouvelle partie** : 5 × 5 cases, centrées sur l'hôtel de ville.
- **Taille maximale**, liée au domaine : (7 + 2 × domaine) × (7 + domaine) cases.
  - Domaine 0 : 7 × 7.
  - Domaine 4 : 15 × 11.

## 3. Règles chiffrées (proposées, puis appliquées en v16)

### 3.1 Où l'on peut bâtir

| Règle | Bâtiments |
|---|---|
| **Intra-muros seulement** | Donjon, bibliothèque, laboratoire, forge, armurerie, intendance militaire |
| **Campagne seulement** | Ferme, élevage, verger, scierie, carrière, mine, charbonnière, pavillon de chasse |
| **Hors les murs** (faubourgs ou campagne) | Tannerie (odeurs), pêcherie, port fluvial, herboristerie |
| **Partout**, avec un effet selon la zone | Tous les autres (voir ci-dessous) |

**Effets selon la zone** : ils s'ajoutent au bonus de production du bâtiment, comme l'adjacence.

| Bâtiment | Cour du donjon | Faubourgs | Campagne |
|---|---|---|---|
| Maisons | −10 % (ruelles étroites) | +5 % | 0 |
| Marché, taverne, maison de guilde | −10 % (loin des passants) | +10 % | 0 |
| Entrepôt | protection contre le pillage +5 points (au plus +10) | 0 | 0 |
| Caserne, écurie | vitesse de formation +5 % | 0 | 0 |
| Tour de garde | 0 | préavis des raids +10 % | préavis des raids +10 % |

La caserne garde son effet v12 « près du donjon » (formation +10 %, défense +3 %), qui récompense déjà la cour.

### 3.2 Périmètre

- **Périmètre** = 2 × (largeur + hauteur) segments de muraille.
- **Facteur de muraille** = `1 + 0,0125 × (20 − périmètre)`, borné entre 0,8 et 1,1. Il multiplie le bonus de muraille actuel, dans le même calcul que l'effet `wall.pct` qui existe déjà.
- L'enceinte de départ (5 × 5) est **neutre**. Une partie existante n'est donc pas renforcée à son insu.

| Enceinte | Périmètre | Facteur |
|---|---|---|
| 4 × 4 | 16 | × 1,05 |
| 5 × 5 | 20 | × 1,00 |
| 6 × 6 | 24 | × 0,95 |
| 7 × 7 | 28 | × 0,90 |
| 15 × 11 | 52 | × 0,80 (plancher) |

**Agrandir d'un côté** :
- une rangée ou une colonne en plus ;
- coût : 150 pierre, 60 bois et 20 or **par nouveau segment de muraille** (2 segments à chaque fois), multiplié par (1 + 0,15 × niveau de la muraille) ;
- c'est donc le vrai choix entre une ville compacte et bien défendue et une ville étendue mais exposée.

**Réduire** est gratuit, si aucun bâtiment « intra-muros seulement » ne se retrouve dehors.

**Ce qui ne change pas** : les chiffres de base restent ceux de `wall` (8 % par niveau) et de `moat` (4 % + défense 2 % par niveau). Aucune seconde muraille n'est ajoutée.

### 3.3 Raids par zone

- **Raid repoussé** : aucun bâtiment n'est touché. La muraille prend 5 % de dégâts.
- **Raid perdu** :
  - les pillards **frappent d'abord hors les murs** : le bâtiment incendié (même chance qu'avant, une fois sur deux) est tiré parmi les faubourgs et la campagne ;
  - **la muraille tient** si elle a au moins le niveau 1 et que la brèche échoue ;
  - chance de brèche : 0,65 − 0,025 × muraille − 0,03 × douves, bornée entre 0,15 et 0,65 ;
  - en cas de brèche, la cour peut être touchée aussi, sauf l'hôtel de ville ;
  - si la muraille tient et qu'un entrepôt est intra-muros, le pillage passe de 30 % à 22 % de ce qui dépasse la part protégée ;
  - la muraille prend 15 % de dégâts, ou 30 % en cas de brèche.
- **Dégâts de la muraille** :
  - ils réduisent le bonus de muraille de 25 % × dégâts, soit au plus −25 % ;
  - les maçons réparent 10 % par heure, gratuitement ;
  - on peut réparer tout de suite pour de la pierre.
  - Ils se voient sur la carte : brèches, puis échafaudages.

### 3.4 Feu et eau (v14)

- **Le feu ne traverse pas les douves** : avec des douves au niveau 1 ou plus, un incendie ne passe pas d'un bâtiment intra-muros à un bâtiment extra-muros voisin, ni l'inverse.
- **La crue peut faire déborder les douves**, qui sont alimentées par la rivière.
  - Chance de débordement : 0,6 − 0,06 × niveau des douves. Elle est nulle au niveau 10 : de larges douves à vannes absorbent la crue.
  - En cas de débordement, les bâtiments qui bordent la muraille, dedans comme dehors, rejoignent la zone inondable pour cette crue.

## 4. Choix d'interface

### 4.1 La ville devient le menu

**Menu en anneau.** Un clic sur un bâtiment ouvre, autour de lui, 4 boutons :
- **Ouvrir** : l'écran du bâtiment ;
- **Améliorer** ;
- **Accélérer** : passe-temps, si un chantier est en cours ;
- **Infos** : sa fiche, dans le tiroir.

Ce sont de vrais boutons, atteignables au clavier. Échap ferme l'anneau.

**Correspondances.**

| Bâtiment | Écrans |
|---|---|
| Hôtel de ville | Objectifs, Défis, Priorité royale, Conseil, Grands projets |
| Donjon | Armée, Campagnes |
| Caserne, écurie | Armée, Campagnes |
| Marché | Marché, Convois, Joaillier |
| Port | Convois |
| Taverne | Héros |
| Forge, armurerie | Artisanat |
| Bibliothèque, laboratoire | Recherche, Talents, Héritage |
| Maison de guilde | Guilde |
| Entrepôt | Bilan, Intendance, Ouvriers, Expéditions, Chaînes |
| Tour de garde | Journal (rapports et menaces) |
| Grand observatoire | Objectifs (almanach des présages) |
| Sanctuaire | Roue, Éclats Anciens |
| Monument | Héritage |

**Terrains vagues.** Un bâtiment de cette liste qui n'est pas encore construit apparaît comme un **terrain vague avec un panneau** : son nom, ce qu'il ouvre, et sa condition (« HdV 4 »).
- L'emplacement est une case libre de sa zone, choisie de façon stable.
- Un clic propose de le bâtir là, ou d'ouvrir ses écrans s'ils sont déjà accessibles.
- **Aucun écran n'est verrouillé par la v16** : chaque écran garde ses propres conditions. Le panneau ne fait que montrer la progression.

**Menu de gauche : 5 entrées.**
- Château (la ville) ;
- Monde ;
- Chronique ;
- Événements ;
- Conseiller.

Les autres groupes passent par la ville. Leurs pastilles s'additionnent sur « Château ». Dans un écran ouvert depuis un bâtiment, un fil d'Ariane « Château › Marché » permet de revenir.

**Accès rapide et accessibilité.** La fenêtre **Lieux** est ouverte par :
- le bouton « Lieux » de la carte ;
- la touche `/` ou `Ctrl + K`, depuis n'importe quel écran.

Elle offre :
- une recherche dans tous les écrans et bâtiments ;
- une navigation au clavier : flèches et Entrée ;
- pour chaque bâtiment, « Voir sur la carte » : zoom automatique sur le bâtiment, avec son anneau ouvert.

**Téléphone** :
- cases de 64 px multipliées par le zoom, qui ne descend pas sous 0,8 à l'ouverture, soit au moins 51 px à toucher ;
- la fenêtre Lieux sert de liste ;
- l'anneau se place à l'intérieur de l'écran.

### 4.2 Innovations « château » retenues

| Idée | Retenue ? | Pourquoi |
|---|---|---|
| **Défense par flancs** (flanc gauche, front, flanc droit, cour ; pierres, poix, archers sur les tours) | Oui | Elle s'intègre au combat de raid existant par un seul modificateur borné (±15 %, outils +12 % au plus). La répartition par défaut (25 % partout) est neutre : aucune partie existante n'est rééquilibrée de force. |
| **Raid qu'on voit venir** | Oui | La colonne ennemie au bord de la carte, avec son compte à rebours. Pont-levis levé, gardes aux créneaux, puis brèches et réparations. Tout est lu dans `state.raids` et l'état de la muraille. |
| **Silhouette selon l'hôtel de ville** (hameau → capitale) | Oui | 5 paliers, avec un moment marquant (chronique et annonce) à chaque passage. |
| **Décorations utiles** | Oui, bornée | Faubourgs, à côté de maisons, d'un marché ou d'une taverne : moral des ouvriers +2 (au plus 4 décorations, soit +8). Cour : moral au combat de la garnison +1 (au plus +3). Campagne : rien, personne ne la voit. |
| **Vie de château liée à l'état** | Oui, légère | Gardes sur la muraille selon la garnison, torches la nuit, fumée de la forge quand elle travaille, foule au marché selon les caravanes, charrettes à la porte selon les convois. |
| Gouverneur et commandant visibles | Non | Le poste de « gouverneur » existe, mais pas celui de commandant des remparts : il faudrait en créer un. Reporté. |
| Avant-postes visitables | Non | Il faudrait une seconde carte de ville. Le coût est disproportionné pour cette version. Reporté. |

### 4.3 Performance

Le zoom à 75 ms par image est corrigé avant d'ajouter quoi que ce soit :
- la mise à jour de la caméra est regroupée sur une seule image (`requestAnimationFrame`) ;
- `--bz` n'est réécrit que par paliers de 0,1 ;
- le contenu transformé est mis sur sa propre couche (`will-change: transform`) ;
- muraille, douves et vie du château forment **un seul SVG** par couche (sous et sur la grille), sans élément par case.

**Objectif** : image médiane ≤ 16,7 ms au zoom, sur la ville 40 × 24.

La mise en œuvre et les mesures sont dans [`V16.md`](V16.md).
