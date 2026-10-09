# 🔎 Audit technique et de gameplay — Cendrelande

Cet audit couvre :

- les sources (`src/`) ;
- les données de jeu ;
- les systèmes ;
- l'interface ;
- la sauvegarde ;
- les tests ;
- la version compilée.

Chaque problème **confirmé** a été reproduit par un script ou un test avant correction. Chaque correction a un **test de non-régression** :

| Fichier de tests | Domaine |
|---|---|
| `tests/regressions.test.js` | Économie, combat, monde, prestige |
| `tests/save.test.js` | Sauvegarde et hors-ligne |
| `tests/mechanics.test.js` | Nouvelles mécaniques |

**Point de départ** : 51 tests verts, aucune erreur de console sur 235 actions d'interface cliquées automatiquement.
**Arrivée** : voir la fin du document.

Légende : 🔴 critique · 🟠 majeur · 🟡 mineur · ⚖️ équilibrage · ✅ corrigé.

## 1. Bugs confirmés

### Économie, production, commerce

| | Problème | Correction |
|---|---|---|
| 🔴✅ | Un Ordre du royaume « vendre l'or au-dessus de N » mettait l'or à `NaN`. Le trésor retombait ensuite à 0, à chaque déclenchement. | `sell`/`buy` refusent les ressources non échangeables. Le constructeur d'ordres ne propose que les ressources du marché. |
| 🟠✅ | Acheter alors que l'entrepôt est plein faisait payer le prix fort pour rien (et l'ordre « acheter du charbon » vidait le trésor). | L'achat est limité à la place libre, et refusé si l'entrepôt est plein. |
| 🟠✅ | Une chaîne juste sous la capacité ou le quota consommait toutes ses matières premières pour un produit écrêté : 1 521 bois brûlés pour 1 charbon. | La production est limitée à ce que l'entrepôt ou le quota peut recevoir. |
| 🟠✅ | Boucle « acheter au marché → caravane » : +53 % par trajet, puisque l'achat lui-même faisait monter le prix de revente. | Les cités paient au **prix de référence**, avec saturation si l'on livre trop souvent. La part achetée récemment au marché est payée sans prime. |
| ⚖️✅ | Contrats : +62 à 70 k or par jour en revendant des marchandises achetées au marché. | Les cités exigent des marchandises **produites par le royaume** (origine suivie, elle s'estompe en quelques heures). Prime réduite. |
| ⚖️✅ | Ressources rares achetables à bas prix, ce qui rendait le marchand ambulant inutile. | Les ressources rares sont introuvables à l'achat sur le marché. |
| 🟠✅ | Une fortification pouvait être payée deux fois (deux chantiers en file). | Refus si elle est déjà en construction. |
| 🟠✅ | Un contremaître pouvait diriger plusieurs expéditions ou travailler dans un secteur. | Contrôles ajoutés. |
| 🟡✅ | Arrondi favorable : vendre unité par unité rapportait presque 2× plus. | Vente arrondie vers le bas, achat vers le haut. |
| 🟡✅ | Un bâtiment simple mis en pause produisait encore. Un contrat expiré restait honorable. `pay` pouvait laisser −1e-6. | Corrigés. |
| 🟡✅ | Descriptions trompeuses : « défense automatique » (jamais implémentée), « routes permanentes » au palier 6, Herboristerie, Maître d'atelier. | Textes alignés sur le comportement réel. Le Maître d'atelier couvre aussi charpentes et charbon. |

### Combat, héros, monde

| | Problème | Correction |
|---|---|---|
| 🔴✅ | Affixes d'objets uniques inconnus (`siege.power`, `class.cavalry.atk`, `city.def`, `caravan.gain`) : bonus jamais appliqués, et l'affichage de l'inventaire **plantait** (`itemScore`). | Affixes déclarés. Les effets « royaume » d'un objet équipé s'appliquent. Affichage protégé. |
| 🔴✅ | Refouiller une case déjà explorée donnait des récompenses infinies : 266 trajets en 1 h ont rapporté +7 120 or, 20 sites permanents et des troupes gratuites. | Une case fouillée ne rapporte plus rien pendant 24 h. |
| 🔴✅ | La Cité perdue était farmable : +5 Éclats et un artefact **à chaque** purge, y compris l'Œil de l'Ancien, exclusif à la Roue. | Trésor du trône unique. Liste fermée d'artefacts de donjon. Exclusivités jamais tirées au hasard. Doublon converti en fragment de relique. |
| 🟠✅ | Prestige : les objets et héros exclusifs étaient perdus, mais restaient marqués « possédés », donc impossibles à réobtenir. | Marques effacées au prestige. |
| 🟠✅ | Prestige : les Éclats Anciens et les exploits étaient perdus. Les exploits étaient ensuite **rejouables** (Éclats gratuits à chaque dynastie). | Éclats, fragments, garanties et exploits conservés. |
| 🟡✅ | Prestige : artefacts conservés comptés à chaque dynastie, talents conservés au-delà des points disponibles. | Seuls les artefacts de la dynastie comptent. Les rangs de talent sont rendus et les doctrines conservées. |
| 🟠✅ | L'aperçu du boss mondial surestimait l'ennemi : danger 6 affiché, 0 en combat réel. | Aperçu identique au combat. |
| 🟠✅ | Les royaumes rivaux étaient pillables à la chaîne et ne se renforçaient pas (le gain était écrasé). | 6 h de délai après un sac. La faction se renforce réellement. |
| 🟡✅ | Bonus de moral caché des colosses (+25 % d'attaque). | Supprimé. |
| 🟡✅ | Le butin d'une armée anéantie était livré instantanément. | Le butin est perdu. |
| 🟡✅ | Les donjons étaient attaquables comme de simples camps (objet épique garanti). | Seule l'expédition de donjon est possible. |
| 🟡✅ | Relations de faction non bornées (−215 possible). | Bornées à ±100. |
| 🟡✅ | Puissance ennemie sous-estimée par `armyPower`. | Même formule pour tous. |

### Sauvegarde, temps, hors-ligne

| | Problème | Correction |
|---|---|---|
| 🔴✅ | Une sauvegarde illisible était **remplacée sans prévenir** par une nouvelle partie. | Écran de récupération : copie de secours, téléchargement de la sauvegarde endommagée, nouvelle partie seulement sur confirmation. La copie endommagée est conservée. |
| 🔴✅ | Un import mal formé (tableaux remplacés par des objets) était accepté. Il plantait au démarrage (écran vide à chaque rechargement) et la copie de secours était écrasée par la version cassée. | Types conformés à un état neuf. Démarrage impossible → écran de récupération. La copie de secours ne provient que d'une partie qui a tourné sans erreur. |
| 🟠✅ | Horloge reculée : toute la simulation restait figée jusqu'à ce que l'heure rattrape. | Recalage immédiat, avec un message. |
| 🟠✅ | Une échéance invalide (`undefined`) rendait le temps `NaN`, mettait la nourriture à 0 et gelait la partie pour toujours. | Échéances invalides ignorées par le moteur et retirées au chargement. |
| 🟠✅ | La copie de secours occupait la moitié du quota : la sauvegarde principale échouait alors qu'elle aurait tenu seule. | Si le stockage est plein, la copie est libérée et l'écriture réessayée. Erreur explicite sinon. |
| 🟠✅ | Inventaire illimité : +32 Ko de sauvegarde par jour. | Plafond de 300 objets. Les plus faibles non verrouillés sont recyclés (matériaux rendus). |
| 🟡✅ | Absence de plus de 12 h : seules les constructions étaient recalées. Marches, caravanes, raids et décisions se résolvaient « dans le passé ignoré ». | Toutes les échéances sont recalées. Le plafond de 12 h est conservé. |
| 🟡✅ | La saison ne se terminait jamais. | Renouvellement automatique (paliers à nouveau disponibles). |
| 🟡✅ | Nombres en texte mis à zéro. « Nouvelle partie » laissait les copies. Le marchand mystère restait achetable après son départ. | Corrigés. |
| ✅ | Double réclamation de récompense. | **Aucune** confirmée : toutes les réclamations sont idempotentes, et un garde anti double-clic (350 ms) a été ajouté. |

### Honnêteté (règle « pas de faux multijoueur »)

| | Problème | Correction |
|---|---|---|
| 🟠✅ | Fil « Sur le serveur » inventant des gains de jackpot d'autres joueurs (preuve sociale factice). | **Supprimé**. Le jackpot déclenche désormais un vrai événement local : Fête ancestrale et Grande Foire. |
| 🟡✅ | « Classement », « stock serveur » et « boss du serveur » laissaient croire à d'autres joueurs. | Présentés comme ce qu'ils sont : des **rivaux IA simulés localement** (le jeu est solo et hors ligne). |

### Performances

| | Problème | Correction |
|---|---|---|
| 🟠✅ | Coût quadratique dans l'évaluation de l'économie (`buildingAt` appelé 8 fois par voisin et par bâtiment ; réseau routier recalculé pour chaque bâtiment). Une simulation de 7 jours prenait 14 minutes. | Index de voisinage par appel, réseau routier calculé une fois par passe. Environ 3× plus rapide, et le coût ne s'emballe plus avec la taille de la ville. |

## 2. Équilibrage vérifié par simulation

### Combat

Matrice de 10 compositions à coût égal, sur 3 terrains, 60 combats par case. Script : `/tmp` d'audit, puis `tests/regressions.test.js`.

**Avant** : les archers battaient tout sur tous les terrains, et la cavalerie (censée les contrer) perdait 100 % du temps.

**Changements** :

- la volée d'ouverture devient une première frappe partielle (×0,6) ;
- les tireurs combattent mal au corps à corps (×0,6) ;
- la cavalerie charge au premier assaut (×1,5) ;
- archers plus chers ;
- unités d'élite renforcées (chevaliers, infanterie lourde, cavalerie lourde).

**Après**, l'ordre dépend du terrain : aucune composition ne domine partout.

| Terrain | Gagnants |
|---|---|
| Plaine | Armées mixtes et cavalerie |
| Forêt | Infanterie |
| Collines | Tireurs |

En PvE, toutes les compositions battent les camps de leur niveau.

### Éclats Anciens

Simulation Monte-Carlo, détails dans `docs/ECONOMY.md`. Les profils occasionnel, actif et hardcore restent dans les fourchettes visées, et c'est vérifié par un test.

### Progression par profil (7 jours, moteur réel)

`node tools/profileSim.js 7 2`. Les résultats et leur lecture se trouvent dans `docs/BALANCE.md`.

## 3. Améliorations et nouvelles mécaniques

| Domaine | Ajout |
|---|---|
| Bilan économique (Production → Bilan) | Production et consommation réelles par heure, prévision de pénurie, chaînes bloquées avec leur raison, entretien par unité, pertes sur 7 jours par cause |
| Tableau des objectifs (Royaume → Objectifs) | Court, moyen et long terme, calculés depuis l'état réel, avec prérequis, récompenses et lien vers l'écran concerné ; sagas en cours |
| Territoires spécialisés | 2 à 3 voies de développement par terrain, niveaux 1 à 5, garnison obligatoire, entretien, menaces régionales et pillage. Les bonus de terrain ne s'appliquent que si l'avant-poste est tenu |
| Contrats | 7 catégories (commerce, urgence, artisanat, exploration, militaire, diplomatie, guilde), difficulté, bonus de rapidité, progression mesurée depuis la publication |
| Sagas des Terres Brisées | 6 chaînes narratives à plusieurs étapes et choix politiques : famine, traité douteux, noble revendicateur, ruine oubliée, appel du général, relique disputée |
| Événements enrichis | Stratégie quotidienne (Razzia, Diplomatie, Prudence), 3 missions du jour, boss en 3 phases (enragé, puis carapace contre laquelle le siège compte), défi héroïque, récompense de participation, nouvel événement « Le Convoi des Sept Marchands » |
| Reliques | Catégories (économie, armée, exploration, diplomatie, intendance, anciennes). Progression alternative par fragments de relique, pour ne jamais rester bloqué par le hasard |
| Défense | Un raid perdu incendie 1 à 2 bâtiments (réparables). Le rapport de défense détaille la préparation |
| Sauvegarde | Migrations versionnées (v6), message de migration, copie de secours, export en fichier `.json`, import de fichier, validation et réparation |
| Interface | Confirmations stylées pour les actions irréversibles (prestige avec la liste « conservé / réinitialisé », abandon de territoire, dissolution d'équipe, import), anti double-clic, messages d'échec explicites, filtres et tri de l'inventaire, tutoriel contextuel |

## 4. Limites connues et pistes non traitées

- **Pas de serveur** : guilde, tableau d'honneur, stocks partagés et boss communs sont simulés localement par des IA, et présentés comme tels. Un vrai multijoueur demanderait un serveur, absent du projet.
- L'artisanat avancé (recettes découvertes, affixes au choix, ateliers spécialisés) et une IA diplomatique plus poussée (tributs exigés, crises, médiations) restent des pistes. Les sagas couvrent une partie des crises diplomatiques.
- La sauvegarde reste locale au navigateur. L'export en fichier est la seule sauvegarde hors navigateur.
