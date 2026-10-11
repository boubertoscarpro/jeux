# Audit v10 — refonte visuelle, longévité et profondeur

Audit réalisé avant la mise à jour v10, sur la version fusionnée de l’étape 6 (158 tests verts, test d’interface sans
erreur sur 36 écrans). Méthode :

- lecture du code (`src/data`, `src/systems`, `src/ui`), des documents (`README`, `docs/*.md`) et des tests ;
- captures d’écran de la version compilée en 1400 × 900 et en 1024 × 640 ;
- simulations existantes (`tools/profileSim.js`).

## 1. État réel des fonctionnalités

| Domaine | État | Remarques |
|---|---|---|
| Royaume, bâtiments, routes, agrandissement | Terminé | Grille 24×16 → 40×24, SVG par bâtiment, 4 paliers visuels (niveaux 1, 5, 10, 15). |
| Monde 96×96, factions IA, diplomatie, espionnage | Terminé | Canvas, frontières, brouillard, mini-carte, filtres. |
| Avant-postes, stabilité, logistique, campagnes | Terminé | Étapes 4 à 6. |
| Héros, forge, plans, laboratoire | Terminé | |
| Saisons | **Terminé, déjà mécanique** | 4 saisons de 3 h : modificateurs de production, d’entretien, de déplacement, prix du marché, météo, catastrophes. **Manque** : annonce de la saison suivante, effet sur les campagnes militaires, moyens d’adaptation. |
| Sagas (histoires à étapes) | **Partiel** | 6 sagas, chacune jouée **une seule fois** (après, plus rien). La cité et les factions sont tirées **au hasard**, sans regarder l’état du monde (une saga d’alliance peut viser une faction en guerre). Aucune conséquence sur le monde lui-même. |
| Mémoire des factions | **Partiel** | La relation dérive vers une base (personnalité + réputation) de 4 % toutes les 10 min : une trahison est oubliée en quelques heures. Aucune explication de la rancune, aucune option de désescalade autre que l’ambassadeur. |
| Expéditions | Terminé (ouvriers) | Expéditions automatiques de récolte. **Aucune expédition rare à plusieurs étapes** avec décisions. |
| Défis | **Absent** | Il existe des exploits uniques (Éclats) et des missions du jour, mais aucun défi optionnel, à paliers, renouvelable. |
| Monument du royaume | **Absent** | Les grands projets sont sur la carte du monde. Les monuments ancestraux (étape 6) ne servent qu’à la dynastie suivante. |
| Fin de partie | **Partiel** | Prestige à l’HDV 15, traditions, objectifs à long terme dans « Objectifs ». Aucune vue d’ensemble Maîtrise / Découverte / Héritage. |
| Multijoueur | Documenté seulement | Volontairement non simulé (`docs/MULTIPLAYER.md`). |

## 2. Défauts d’interface constatés

| Gravité | Défaut |
|---|---|
| 🔴 | **En 1024 px de large, la barre de ressources s’empile verticalement** : la barre du haut occupe 275 px et cache la moitié de l’écran. |
| 🟠 | Identité visuelle générique : panneaux gris-bleu uniformes, peu de hiérarchie, aucune matière (pierre, parchemin, bronze). Les fenêtres et les cartes se ressemblent toutes. |
| 🟠 | Les icônes de ressources et de navigation sont des emojis : rendu différent selon le système, style incohérent avec les bâtiments SVG. |
| 🟠 | Ressources : la capacité de stockage n’est visible qu’en infobulle ; aucune jauge, l’état « plein » est à peine marqué, la pénurie (production négative) n’est pas signalée. |
| 🟠 | 19 bâtiments sur 37 n’ont pas de dessin propre : atelier générique avec une enseigne en emoji. |
| 🟡 | Aucune animation sur la carte du royaume (fumée, moulin, drapeaux) ; cases libres très uniformes. |
| 🟡 | Boutons : variantes (`primary`, `ghost`, `danger`, `mini`, `small`) aux styles hétérogènes, pas d’état « sélectionné » commun. |
| 🟡 | Aucun réglage pour réduire les animations ; `prefers-reduced-motion` non respecté. |
| 🟡 | Le « tableau de bord » d’Objectifs juxtapose 4 colonnes ; les menaces (raids, décisions en attente) et la prochaine grande récompense n’y figurent pas. Le conseiller de la colonne de droite répète une partie des conseils. |
| 🟡 | Aucune vue de la progression globale (systèmes débloqués, conditions des suivants). |
| 🟡 | Peu de retours marquants sur les grandes réussites (bâtiment terminé, découverte rare, victoire) : seulement des toasts identiques. |
| 🟡 | Carte du monde : les caravanes ne sont pas dessinées ; le bord du brouillard est une coupure nette. |

## 3. Risques pour la durée de vie

- **Contenu narratif épuisable** : 6 sagas jouées une fois, puis plus aucune histoire.
- **Mémoire diplomatique trop courte** : les décisions n’ont pas de conséquences différées.
- **Après la campagne principale** : objectifs à long terme peu nombreux (prestige, artefacts) et peu visibles.
- **Points d’héritage** : les bonus dynastiques sont plafonnés (`DYNASTY_PERKS.max`), ce qui évite l’inflation ;
  à conserver.
- **Équilibrage connu** (voir `docs/BALANCE.md`) : saturation des stocks réduite par la vente du surplus, raids ≈ 2
  par jour, ralentissement de l’HDV à partir du niveau 9. Rien de nouveau à corriger en priorité ; les nouveaux
  systèmes ne doivent pas ajouter de ressources en masse.

## 4. Plan d’action priorisé

1. **Interface** : système de conception (couleurs pierre, ivoire, bronze ; surfaces ; boutons ; espacements),
   correction de la barre du haut en petite résolution, jauges de stockage et pénuries, icônes SVG homogènes
   (ressources, navigation), réglage « réduire les animations », retours visuels des grandes réussites.
2. **Carte du royaume** : dessins dédiés pour les 17 bâtiments sans illustration, paliers visuels plus marqués,
   animations légères (fumée, moulin, drapeaux) désactivables, cases libres plus vivantes.
3. **Carte du monde** : caravanes dessinées, bord du brouillard adouci, lieux rares signalés.
4. **Tableau de bord stratégique** et **vue de progression** (débloqué / à découvrir / conditions), **vue de fin de
   partie** (Maîtrise, Découverte, Héritage).
5. **Mécaniques**, en réutilisant l’existant :
   - **Chroniques du monde** : le moteur de sagas devient dépendant de l’état réel du monde, les histoires sont
     rejouables (avec délai), ont plusieurs issues et modifient le monde ;
   - **Rivalités persistantes** : mémoire des factions (griefs et faveurs qui s’estompent lentement), ambitions
     affichées, options de désescalade ;
   - **Défis de maîtrise** : paliers bronze, argent, or, durée limitée, historique, récompenses cosmétiques et titres ;
   - **Monument dynastique** : un édifice en 5 étapes sur la carte du royaume, avec une orientation au choix ;
   - **Expéditions légendaires** : préparation, itinéraire, événements avec choix, défi final, sort de la découverte ;
   - **Saisons** : annonce de la saison suivante, effet sur les campagnes, adaptation.
6. Tests, migrations de sauvegarde, simulations, documentation.

Les concepts qui recoupent l’existant sont **étendus**, pas dupliqués : sagas → chroniques, factions → rivalités,
monuments ancestraux et archives → monument dynastique, saisons existantes → annonces et effets.
