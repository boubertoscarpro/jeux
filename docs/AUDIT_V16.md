# Audit v16 — « Le Château »

**Point de départ** : la v15 « L'Atlas vivant ».

**Thème de la v16** : tout le jeu se centralise sur le royaume. Le château et sa ville deviennent l'écran principal et le point d'accès à toutes les fonctions.
- On s'inspire de l'organisation et de l'ergonomie de Goodgame Empire : château fortifié visible, bâtiments cliquables, fenêtres par-dessus la ville, affichage fixe et léger dans les coins.
- On ne reprend ni ses graphismes, ni ses noms, ni ses mécaniques payantes.

**Historique.** Une première passe de la v16 (zones, muraille et douves dessinées, raids par zone, flancs, anneau, menu réduit) a déjà été fusionnée. Cette version la reprend et l'achève par la refonte complète de l'interface et par les avant-postes en mini-châteaux. Les captures « avant » restent celles de la **v15**, prises avec sa version compilée figée.

**Captures « avant »** : `docs/v16/avant/`, à 3 tailles (1400 × 900, 1024 × 640, 390 × 844), via `tools/v16shots.cjs`.

| Capture | Contenu |
|---|---|
| `01-royaume-debut` | Nouvelle partie |
| `02-royaume-milieu` | Vraie sauvegarde v15, joueur simulé « Actif », 3 jours, HdV 7 |
| `03-raid-approche` | Même sauvegarde, avec un raid à 7 min |
| `04-royaume-fin`, `05-royaume-fin-ensemble` | Joueur simulé « Très optimisé », 7 jours, HdV 15, 94 bâtiments, domaine maximal (40 × 24), muraille 14 et douves 6 réglées pour vérifier qu'elles ne se voient pas |
| `06-monde`, `07-armee`, `08-marche`, `09-avant-postes` | Écrans de la même partie de fin |

## 1. Constats vérifiés

| # | Constat | Vérification | Gravité |
|---|---|---|---|
| 1 | **L'interface est organisée comme un site web.** | **Confirmé** (07, 08, 09). Menu latéral de 11 entrées et Conseiller ; une barre de sous-onglets en haut de chaque écran ; 41 écrans, dont 13 qui peuvent porter un cadenas. Ouvrir l'Armée ou le Marché remplace la carte du royaume par une page pleine largeur, avec une colonne de droite de 300 px (décisions, chantiers, files, marches, chapitre). On quitte le royaume. | 🔴 |
| 2 | **Rien n'évoque un château.** | **Confirmé** (02, 04, 05). Un pré peint, des bâtiments dispersés en deux grappes (rivière, montagnes), l'hôtel de ville seul au centre. | 🔴 |
| 3 | **La muraille et les douves ne se voient pas.** | **Confirmé** (04, 05). Avec une muraille au niveau 14 et des douves au niveau 6, la carte est identique à une partie sans fortifications. | 🔴 |
| 4 | **On n'accède jamais à un écran par son bâtiment.** | **Confirmé.** Cliquer sur la caserne ouvre sa fiche d'amélioration, pas l'Armée. Le marché n'ouvre pas le Marché. | 🟠 |
| 5 | **Le haut de l'écran est chargé.** | **Confirmé** (toutes les captures) : 2 à 3 lignes (marque, 7 ressources, 6 puces, 4 puces d'état). Sur téléphone, il prend 150 px, et la barre du bas montre 6 entrées sur 12 (09-mobile). | 🟠 |
| 6 | **Un raid qui arrive ne se voit pas sur la carte.** | **Confirmé** (03). | 🟠 |
| 7 | **Les avant-postes sont des lignes de tableau.** | **Confirmé** (09). Une spécialisation, un niveau de 1 à 5, une garnison : on les gère dans un tableau, sans rien à bâtir ni à voir. La sauvegarde de fin en compte 8, tous au niveau 5 : plus rien à développer. | 🟠 |
| 8 | **Le zoom sur une grande ville est lent**, du moins en apparence. | **Mesuré** dans Chromium sans GPU : 45 à 75 ms entre deux images. Le **travail du fil principal** n'est que de 8,5 à 10,2 ms : le reste est la composition logicielle, que chaque animation déclenche. | 🟡 |

## 2. Maquettes de l'écran

Les maquettes indiquent la place de chaque élément de l'affichage fixe :
- [`maquette-chateau-bureau.svg`](v16/maquette-chateau-bureau.svg) (1400 × 900) ;
- [`maquette-monde-bureau.svg`](v16/maquette-monde-bureau.svg) ;
- [`maquette-chateau-telephone.svg`](v16/maquette-chateau-telephone.svg) (390 × 844) ;
- [`maquette-monde-telephone.svg`](v16/maquette-monde-telephone.svg).

| Zone | Bureau (1400 × 900) | 1024 × 640 | Téléphone (390 × 844) |
|---|---|---|---|
| Haut gauche | Médaillon aux armoiries (profil), royaume, HdV et barre vers le prochain palier, puissance ; dessous : sélecteur de domaine | Médaillon, royaume, HdV (sans puissance) ; sélecteur | Armoiries seules ; sélecteur sous elles |
| Haut centre | Bois, pierre, fer, nourriture, or : icône, quantité, jauge de l'entrepôt ; « + » déplie le reste | Quantités sans taux | 3 ressources (bois, pierre, nourriture) et « + » |
| Haut droite | Saison, météo et heure du jeu ; Éclats et tickets ; cloche ; réglages ; plein écran | Icônes seules | Dans le tiroir « Activités » |
| Bord droit | Médaillons des activités limitées (événement, Roue, saison, défi du jour, crise, présage), 6 au plus, puis « plus » | Idem | Bouton flottant « Activités » qui ouvre un tiroir |
| Bord gauche | Quêtes (badge), 2 ou 3 objectifs suivis avec « Y aller », portrait du conseiller, cartes d'alerte (raid, crise, décisions) ; repliable en icônes | Repliée par défaut | Bouton flottant « Quêtes » qui ouvre un tiroir |
| Bas gauche | Fil du royaume : 3 faits, qui s'effacent ; clic : Scriptorium. Sur le monde : mini-carte, et le fil devient une icône | Idem | Masqué (le Scriptorium le garde) |
| Bas centre | Chantiers x/y, Marches x/y : barre, temps, Accélérer ; un emplacement libre ouvre Construire ou l'Armée | Compact | Une ligne au-dessus de la barre du bas |
| Bas droite | Construire, Armée, Guilde, Rapports, Lieux ; puis le **Globe « Monde »**, plus grand, dans le coin. Sur le monde, il devient **« Château »**, au même endroit. Zoom discret au-dessus. | Idem | Barre du bas : Construire, Armée, Rapports, Lieux, Globe |

**Règle de placement sans chevauchement.**
- Le haut et le bas sont chacun **une seule rangée flexible** : gauche, centre (qui se réduit et défile), droite.
- Les colonnes gauche et droite occupent l'espace **entre** ces deux rangées, avec une hauteur bornée.
- `npm run layout` vérifie à 6 tailles, de 360 à 1920 px, qu'aucun élément de l'affichage fixe ne chevauche un autre et que rien ne déborde.

**Fenêtres.**
- Une fenêtre centrée, en parchemin : titre avec le lieu et son niveau, onglets des écrans du lieu, bouton Améliorer du lieu, croix de fermeture.
- La carte reste visible et floutée derrière, et n'est pas redessinée.
- Une seule fenêtre à la fois. Un lien vers un autre lieu remplace la fenêtre, avec un bouton Retour.
- Elles passent en plein écran sur téléphone.

**Badges cohérents** : un point = nouveauté ; un chiffre = quantité ; « ! » = urgence.

**Raccourcis** : M (château ↔ monde), B (Construire), A (Armée), Q (Quêtes), R (Rapports), L (Lieux), Échap (fermer). Tous les boutons ont une infobulle et un `aria-label`.

## 3. Table complète des lieux et des écrans

La table est dans `src/data/places.js`. Un test vérifie que **chaque écran a un lieu**, et que chacun est aussi dans Lieux.

| Lieu | Écrans | Disponibilité |
|---|---|---|
| Hôtel de ville | Objectifs, Priorité royale, Conseil, Grands projets | Dès le départ |
| Donjon | Salle du trésor, Talents & dynastie, Héritage | Bâtiment (HdV 3) ; avant : terrain vague qui ouvre déjà ces écrans |
| Caserne, écurie | Armée | Bâtiments existants |
| Intendance militaire | Campagnes | Bâtiment existant (le « quartier-maître ») |
| Tour de garde | **Défense** (nouvel écran : menaces, raids en approche, flancs, outils, muraille, rapports de défense) | Bâtiment existant |
| Taverne | Héros | — |
| Forge, armurerie | Artisanat | — |
| Bibliothèque | Recherche, Codex | — |
| Marché | Marché, Convois & contrats, Joaillier | — |
| Entrepôt | Bilan, Chaînes, Ouvriers, Intendance | Dès le départ |
| Maison de guilde | Guilde | — |
| Sanctuaire des Cristaux | Roue des Anciens, Éclats Anciens | Merveille ; avant : terrain vague qui ouvre déjà ces écrans |
| Grand Observatoire | **Présages** (nouvel écran : almanach et fil des répercussions), Calendrier | Merveille ; idem |
| **Ambassade** (nouveau lieu) | Factions & diplomatie | Posée dès le départ |
| **Cabinet du cartographe** (nouveau lieu) | Expéditions, Fouilles, Légendes | Posé quand l'une des trois s'ouvre |
| **Place du héraut** (nouveau lieu) | Événement, Boutique d'événement, Saison & boutique | Posée dès le départ |
| **Lice des tournois** (nouveau lieu) | Défis | Posée quand les défis s'ouvrent |
| **Scriptorium** (nouveau lieu) | Journal, Accomplissements, Histoire, Statistiques | Posé dès le départ |
| Globe (affichage fixe) | Carte, Territoires | — |
| Médaillon (affichage fixe) | **Profil** (nouvel écran : armoiries, identité, statistiques, jalons) | — |
| Réglages ⚙ (affichage fixe) | **Réglages** (nouvel écran : affichage, sauvegarde), Admin | Admin : outils de développement, comme avant |

**Règles des nouveaux lieux.**
- Ce sont des points d'accès : aucune production, aucun effet, 1 seul niveau.
- Ils sont posés **gratuitement** sur une case libre des faubourgs, à l'ouverture de leur fonction : c'est le « coût symbolique ». Ils se déplacent comme les autres bâtiments.
- Ils ne comptent pas dans les niveaux de bâtiments (score, jalons).

**Terrain vague.** Un lieu pas encore disponible apparaît comme un terrain vague avec un panneau : ce qu'il débloquera, et comment. Ses écrans déjà accessibles s'ouvrent depuis le panneau. **Aucun cadenas ne reste.**

## 3 bis. Les avant-postes : des mini-châteaux

**Chaque avant-poste a sa ville** : une petite carte visitable depuis le sélecteur de domaine.
- 6 × 5 cases au départ, puis 3 agrandissements coûteux (7 × 6, 8 × 7, 9 × 8), aux niveaux 2, 3 et 4 de l'avant-poste.
- Une enceinte, une muraille (0 à 10) et des douves (0 à 5), dessinées comme au château.
- Sa garnison, et son hôtel de ville secondaire : le **niveau de l'avant-poste**, de 1 à 5, comme avant.

**Bâtiments d'avant-poste** (niveau au plus égal à celui de l'avant-poste ; 2 + niveau emplacements) :

| Bâtiment | Vocation | Effet par niveau (sur cet avant-poste) |
|---|---|---|
| Champs | Agricole | Nourriture et grain produits +8 % |
| Grenier | Agricole | Entretien en nourriture −8 % (au plus −40 %) : il soutient la garnison |
| Atelier | Industrielle | Bois, pierre, fer, charbon et minerai produits +8 % |
| Dépôt | Industrielle | Toute la production de l'avant-poste +4 % |
| Camp d'entraînement | Militaire | Chaque soldat compte pour 1 + 0,1 dans la garnison requise ; défense contre les menaces +8 % |
| Tour de guet | Militaire | Défense de la ville du royaume +0,4 % (au plus +4 % pour tous les avant-postes) |
| Comptoir | Commerciale | Or +6 par heure ; gains des caravanes +0,3 % |
| Chapelle | Savoir et stabilité | Stabilité cible de la province +3 |

- **Vocation.** La catégorie qui cumule le plus de niveaux de bâtiments, à partir de 3, devient la vocation de l'avant-poste (« Avant-poste agricole »…) : ses bâtiments de cette catégorie gagnent +25 %. On l'oriente par ses constructions, sans choix imposé.
- **Muraille et douves de l'avant-poste.** Chance qu'une menace frappe ×(1 − 0,05 × muraille − 0,04 × douves), au plus −60 %.
- **Bornes.** La production d'un avant-poste ne gagne jamais plus de +50 % par ses bâtiments.
- **Coûts.** Payés depuis les stocks du royaume ; un chantier à la fois par avant-poste.
- **Migration.** Les avant-postes existants reçoivent leur ville vide, avec l'hôtel de ville secondaire au centre. Rien ne leur est retiré.

## 4. Plan des zones (le château)

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

## 5. Règles chiffrées des zones

### 5.1 Où l'on peut bâtir

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

### 5.2 Périmètre

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

### 5.3 Raids par zone

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

### 5.4 Feu et eau (v14)

- **Le feu ne traverse pas les douves** : avec des douves au niveau 1 ou plus, un incendie ne passe pas d'un bâtiment intra-muros à un bâtiment extra-muros voisin, ni l'inverse.
- **La crue peut faire déborder les douves**, qui sont alimentées par la rivière.
  - Chance de débordement : 0,6 − 0,06 × niveau des douves. Elle est nulle au niveau 10 : de larges douves à vannes absorbent la crue.
  - En cas de débordement, les bâtiments qui bordent la muraille, dedans comme dehors, rejoignent la zone inondable pour cette crue.

## 6. Choix d'interface de la première passe (conservés)

### 6.1 La ville devient le menu

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

### 6.2 Innovations « château » retenues

| Idée | Retenue ? | Pourquoi |
|---|---|---|
| **Défense par flancs** (flanc gauche, front, flanc droit, cour ; pierres, poix, archers sur les tours) | Oui | Elle s'intègre au combat de raid existant par un seul modificateur borné (±15 %, outils +12 % au plus). La répartition par défaut (25 % partout) est neutre : aucune partie existante n'est rééquilibrée de force. |
| **Raid qu'on voit venir** | Oui | La colonne ennemie au bord de la carte, avec son compte à rebours. Pont-levis levé, gardes aux créneaux, puis brèches et réparations. Tout est lu dans `state.raids` et l'état de la muraille. |
| **Silhouette selon l'hôtel de ville** (hameau → capitale) | Oui | 5 paliers, avec un moment marquant (chronique et annonce) à chaque passage. |
| **Décorations utiles** | Oui, bornée | Faubourgs, à côté de maisons, d'un marché ou d'une taverne : moral des ouvriers +2 (au plus 4 décorations, soit +8). Cour : moral au combat de la garnison +1 (au plus +3). Campagne : rien, personne ne la voit. |
| **Vie de château liée à l'état** | Oui, légère | Gardes sur la muraille selon la garnison, torches la nuit, fumée de la forge quand elle travaille, foule au marché selon les caravanes, charrettes à la porte selon les convois. |
| Gouverneur et commandant visibles | Non | Le poste de « gouverneur » existe, mais pas celui de commandant des remparts : il faudrait en créer un. Reporté. |
| Avant-postes visitables | Non | Il faudrait une seconde carte de ville. Le coût est disproportionné pour cette version. Reporté. |

### 6.3 Performance

Le zoom à 75 ms par image est corrigé avant d'ajouter quoi que ce soit :
- la mise à jour de la caméra est regroupée sur une seule image (`requestAnimationFrame`) ;
- `--bz` n'est réécrit que par paliers de 0,1 ;
- le contenu transformé est mis sur sa propre couche (`will-change: transform`) ;
- muraille, douves et vie du château forment **un seul SVG** par couche (sous et sur la grille), sans élément par case.

**Objectif** : image médiane ≤ 16,7 ms au zoom, sur la ville 40 × 24.

La mise en œuvre et les mesures sont dans [`V16.md`](V16.md).
