# Cendrelande — Document de conception (prototype v0.1)

## 1. Concept général

Il y a trois générations, **la Fracture** a brisé l'ancien Empire de l'Aube : des cristaux
sont tombés du ciel, les forêts se sont ensauvagées et les mines se sont peuplées de
créatures. Le joueur hérite d'un **hameau presque abandonné** au bord d'une rivière,
entouré de décombres. Son but : reconstruire, explorer les Terres Brisées, retrouver
le savoir perdu et bâtir un royaume capable de rivaliser avec les seigneurs voisins.

Identité propre (≠ Goodgame Empire) :
- **Placement stratégique** : la ville est une grille de terrain (rivière, forêt,
  montagne, décombres). Les bâtiments gagnent des bonus selon leurs voisins.
- **Chaînes de production** : blé → farine → pain ; fer + charbon → acier ;
  peaux → cuir ; laine → tissu ; herbes → potions.
- **Farming à risque** : chaque site de la carte a un niveau de danger. Plus il est
  dangereux, plus il rapporte (et peut contenir des ressources rares).
- **Exploration narrative** : les éclaireurs découvrent des lieux qui proposent des
  choix (entrer, envoyer des éclaireurs, revenir avec une armée).
- **Héros RPG** : 6 classes, 5 raretés, 4 caractéristiques, 7 emplacements
  d'équipement. Un héros est soit **intendant** (bonus de production), soit
  **commandant** (bonus de combat/récolte/exploration).
- **Combat tactique** : terrain, météo, composition, contres, moral, formation,
  commandant, équipement et ravitaillement (pain).
- **Monde vivant** : événements dynamiques, sites qui s'épuisent et se régénèrent,
  boss mondiaux, royaumes rivaux (PvP simulé), saisons.
- **Anti pay-to-win** : la boutique ne vend que des cosmétiques (bannières, titres),
  achetables avec des insignes gagnés en jouant.

## 2. Mécaniques principales

| Système | Prototype v0.1 |
|---|---|
| Ressources | 5 de base, 10 avancées, 5 intermédiaires (blé, farine, pain, peaux, laine) |
| Bâtiments | ~30 types, grille 14×10, bonus d'adjacence, file de construction |
| Production | Passive + chaînes de transformation automatiques |
| Recherche | 7 branches, ~45 technologies, maîtrises limitées (spécialisation) |
| Armée | 14 unités, contres, formation, entretien en nourriture |
| Combat | Simulation par rounds avec rapport détaillé |
| Carte | 48×48 générée procéduralement, brouillard, sites, villes, royaumes |
| Exploration | Éclaireurs, événements à choix, découvertes |
| Farming actif | Marches de récolte, sites épuisables, embuscades |
| Héros | Recrutement en taverne, XP, compétences, affectations |
| Équipement | Génération aléatoire, forge, amélioration, recyclage |
| Commerce | Prix dynamiques, achats/ventes, caravanes vers les villes neutres |
| Guilde | Guildes simulées, dons, niveaux, objectifs collectifs |
| Territoires | Avant-postes donnant des bonus selon le terrain |
| Boss mondiaux | Apparition périodique, dégâts partagés, récompenses par contribution |
| Événements | Horde de bandits, hiver rude, marchand mystérieux, guerre… |
| Saison | Points de saison, paliers de récompenses cosmétiques |
| Objectifs | Tutoriel guidé + jalons infinis |
| Sauvegarde | localStorage + progression hors-ligne (12 h max) + export/import |

## 3. Boucle de gameplay

```
Récolter → Produire → Construire → Explorer → Farmer → Améliorer héros
   ↑                                                          ↓
Revenir améliorer ← Conquérir territoires ← Zones dangereuses ← Forger / Armée
```

- **Session courte (10 min)** : récupérer la production, lancer constructions et
  recherches, envoyer des marches de récolte.
- **Session moyenne (30–60 min)** : explorer, nettoyer des sites dangereux,
  commercer, forger.
- **Session longue** : optimiser le placement, les chaînes, les héros, préparer
  un boss ou une attaque de royaume.

## 4. Architecture technique

- **JavaScript natif (modules ES)**, aucun framework, aucune étape de build.
- **Moteur pur** (`src/core`, `src/systems`) : fonctions qui transforment l'état,
  sans DOM → testable sous Node (`npm test`).
- **Données déclaratives** (`src/data`) : tout l'équilibrage est dans des tables.
- **Système de modificateurs** central (`systems/modifiers.js`) : technologies, héros,
  équipement, événements, territoires, buffs → clés comme `prod.wood`, `combat.atk`.
- **Temps réel par horodatage** : chaque file stocke `start/end`, le moteur avance
  par étapes jusqu'à `now` (ce qui gère la progression hors-ligne).
- **UI** (`src/ui`) : un rendu par vue, rafraîchi lors d'événements ; les comptes à
  rebours sont mis à jour chaque seconde sans re-rendre la vue.

## 5. Structure des fichiers

```
index.html            point d'entrée
css/style.css         thème
src/main.js           démarrage
src/core/             rng, utilitaires, bus d'événements, état, sauvegarde, moteur
src/data/             ressources, bâtiments, unités, héros, objets, technologies,
                      monde, exploration, événements, quêtes, guildes, saison
src/systems/          modificateurs, économie, construction, armée, combat, héros,
                      objets, artisanat, recherche, monde, marches, marché,
                      guilde, événements, quêtes, rivaux
src/ui/               application, composants, vues (ville, carte, héros…)
tests/                tests du moteur (node --test)
```
