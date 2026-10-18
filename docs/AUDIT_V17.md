# Audit v17 — « Clair comme le jour »

**Point de départ** : la v16 « Le Château » (château au centre, affichage fixe dans les coins, globe en bas à droite, fenêtres par-dessus la carte). Cette organisation est conservée ; la v17 la rend claire.

**Captures « avant »** : `docs/v17/avant/`, prises avec la version compilée v16 figée, par `tools/v17shots.cjs` (mêmes scènes que `docs/v16/apres/`, à 3 tailles : 1400 × 900, 1024 × 640, 390 × 844), plus la fenêtre des réglages (`11-reglages-*`). La v16 n'a pas de mode d'accessibilité à capturer : seuls « Animations » (auto, réduites, complètes), « Qualité graphique », « Économie d'énergie » et « Densité » existent.

**Mesures de départ** (fichiers dans `docs/v17/avant/`) :

| Mesure | Outil | v16 |
|---|---|---|
| Éléments textuels visibles sur la carte, fin de partie, vue normale | `tools/v17measure.cjs` | **165** (1400 × 900), 63 (1024 × 640), 38 (390 × 844) |
| Marques de la carte (noms, écussons, flèches, bulles, signaux, étiquettes de zone) qui se chevauchent | idem | début 15 / 9 / 1 ; milieu 62 / 13 / 5 ; **fin 172 / 56 / 15** (grand / moyen / téléphone) |
| Marques de la carte cachées sous l'affichage fixe | idem | fin 71 / 46 / 17 |
| Part de l'écran non couverte par l'affichage fixe | idem | 81,5 % (1400 × 900), 68,8 % (1024 × 640), 80,3 % (390 × 844) |
| Couleurs de texte sous WCAG AA (toutes les feuilles, cascade comprise) | `tools/contrast.mjs` | **24** sur 238 |
| Badges sur les vraies sauvegardes (cloche + Rapports) | lecture des sauvegardes | milieu 11 + 43 ; **fin 24 + 60** |
| Badges après 1 h de jeu, tout étant lu au départ (moyenne de 4 graines) | `tools/v17notifs.mjs` | milieu 4 ; fin 1 |
| Touches pour atteindre un lieu-bâtiment au clavier (fin de partie) | `tools/v17keys.cjs` | **219 en moyenne**, 459 au pire (chaque case de 960 est un arrêt de tabulation) |

## 1. Constats vérifiés

Les dix constats de la commande sont confirmés sur les captures et par les mesures ; cinq s'y ajoutent.

1. **Carte surchargée** — confirmé : 165 textes et 172 chevauchements en fin de partie (1400 × 900). Chaque bâtiment porte en permanence son nom, son écusson de niveau, une flèche verte (même quand on ne peut pas payer : la flèche « bloquée » existe aussi), parfois une flamme, une bulle, un signal.
2. **Organisation à l'envers** — confirmé : la cour de la sauvegarde de fin contient l'hôtel de ville, l'entrepôt et des maisons ; bibliothèque, forge, armurerie (prévues intra-muros) sont restées dehors, car la migration v16 n'a rien déplacé. 71 marques de la carte sont sous l'affichage fixe.
3. **Bâtiments petits et identiques** — confirmé : une ferme niveau 1 et une ferme niveau 6 ne diffèrent que par le chiffre.
4. **Zones peu lisibles** — confirmé : rectangles en pointillés et texte ; « Enceinte projetée » chevauche les plaques ; « Faubourgs » sous le blason.
5. **Affichage fixe qui mange la carte** — confirmé et nuancé par la mesure : 81,5 % de l'écran libre en grand écran, mais **68,8 % en 1024 × 640** (colonne des quêtes de 250 px, médaillons, fil). Sur téléphone, 80 % de l'écran est hors affichage fixe, mais la carte se cadre mal : le château est souvent sous la barre du bas.
6. **Météo par-dessus l'interface** — confirmé : la couche météo est au-dessus des étiquettes de la carte (la pluie barre les noms) ; elle reste sous les panneaux de l'affichage fixe, mais pas sous les plaques et bulles de la carte.
7. **Badges inflationnistes** — confirmé : 24 notifications et 60 rapports non lus sur la sauvegarde de fin, dont 35 victoires et 25 explorations sans enjeu. Le badge ne signale plus rien.
8. **Fenêtres** — confirmé : « Marché niv. 6 » dans l'en-tête puis « Marché niv. 6 » en tête de la carte du contenu ; les tendances du marché ne se lisent qu'au rouge et vert de la courbe (le pourcentage est signé, mais petit).
9. **Textes absurdes** — confirmé : `systems/advisor.js` annonce « sera épuisé dans 0 s » pour un stock déjà vide ; libellés tronqués (« Pavillon de c… ») sans infobulle sur la carte.
10. **Contrastes** — mesuré : 24 couleurs de texte sous le seuil ; les plus graves : `.t-up.ready` (1,6:1), `.br-tier.on`, `.op-t` ; le rouge `--blood` (#cc5a4c) n'atteint que 3,7:1 sur les fonds sombres, et il sert partout (`.bad`, `.down`, `.danger`, taux négatifs).

**Constats ajoutés**
11. **Clavier** : chacune des 960 cases de la carte est un arrêt de tabulation ; atteindre la bibliothèque demande des centaines de Tab. Les flèches ne font rien.
12. **Lecteur d'écran** : la carte du monde est un canevas sans alternative ; la carte du royaume annonce bien chaque case, mais 960 boutons dont 860 vides noient l'information.
13. **Annonces** : aucune région `aria-live` pour les raids, crises et chantiers terminés.
14. **Cibles tactiles** : sur téléphone, les flèches d'amélioration (22 px) et les écussons sont trop petits.
15. **« Pourquoi ? »** : production, défense et stabilité sont des chiffres sans explication à l'endroit où on les lit.

## 2. Priorités

1. **Lisibilité de la carte** (constats 1 à 6) : niveaux de détail selon le zoom, aucun nom permanent, un seul signal par bâtiment, flèches seulement si payable, sols de zone, enceinte fantôme, météo sous les marques, cadrage dans la zone sûre, réorganisation facultative.
2. **Affichage et fenêtres** (5, 7, 8, 9) : quêtes en colonne étroite, fil de 2 lignes, tri des notifications, titre unique et résumé, tendances doublées de formes et de mots, textes corrigés, échelle typographique.
3. **Accessibilité** (10 à 15) : test de contrastes, réglages regroupés (texte, contraste élevé, trois modes daltoniens, police, animations, météo et nuit, durée des messages), clavier (une seule tabulation pour la carte, flèches de bâtiment en bâtiment), alternative textuelle, annonces, cibles de 44 px, mode simplifié, « Pourquoi ? ».
4. **Innovations**.

## 3. Choix des innovations

| Idée | Retenue | Raison |
|---|---|---|
| Calques d'information (production, stabilité, incendie, défense, placement) | **Oui** | Sert directement la lisibilité : on comprend sa ville sans ouvrir de fenêtre ; ne change pas l'équilibre. |
| Mode édition du château (glisser-déposer, plans de ville, aperçu) | **Oui, en partie** | Plans de ville enregistrables et rappelables avec aperçu des effets ; ils servent aussi la réorganisation facultative. Le glisser-déposer reste « Déplacer puis toucher une case » (déjà accessible au clavier et au toucher) : un vrai glisser-déposer ne serait ni accessible ni fiable au toucher sur une carte qui se déplace au doigt. |
| Écran de défense des remparts | **Oui** | La muraille vue de face avec ses trois flancs et la cour, curseurs de répartition et outils dessus ; le rapport de raid reprend le schéma flanc par flanc. S'appuie sur les flancs v16, sans nouvelle règle de combat. |
| Ateliers de siège et de défense | **Non** | Nouveau circuit de production et nouveaux effets de combat : fort risque pour l'équilibre (les outils de défense v16 sont déjà bornés à +12 %) et une ressource de plus à gérer, contraire à l'objectif de clarté. Écarté, raison notée dans V17.md. |
| Frise du temps | **Oui** | Une barre fine et repliable des prochaines heures (chantiers, raids, présages, expéditions, fins d'événements). Lisibilité pure, aucune pression : elle montre ce qui vient, sans rappel ni alarme. |
| Quête guidée (flèche qui pulse) | **Oui** | Prolonge « Y aller » de la v16 ; ne bloque jamais. |
| Tenues de fête du château | **Oui, sobre** | Bannières et guirlandes selon la saison et l'événement en cours ; jamais au-dessus des marques, coupées par la réduction des animations. |
| Retour du seigneur | **Oui, court** | Au retour, les bâtiments terminés pendant l'absence brillent quelques secondes et un résumé d'une ligne précède le rapport. Pas de scène bloquante. |

## 4. Règles numérotées (cibles de la v17)

1. **Niveaux de détail** : vue d'ensemble (zoom < 0,55) : silhouettes, zones nommées, alertes seulement ; vue normale : silhouettes et écusson de niveau ; vue rapprochée (zoom ≥ 1,15) : noms. Survol, toucher et focus clavier montrent toujours le nom.
2. **Un signal par bâtiment**, par priorité : danger (feu, inondation, raid ciblé) > récompense à réclamer > problème (manque, pause, dégâts) > amélioration payable maintenant.
3. **Aucun chevauchement** entre marques de la carte, aux trois tailles, en début, milieu et fin de partie (test `tools/v17measure.cjs --strict`).
4. **Au moins 60 % de textes en moins** en vue normale, fin de partie.
5. **Zone sûre** : le cadrage par défaut et « Y aller » placent le sujet hors de l'affichage fixe.
6. **Contrastes** : zéro couleur de texte sous WCAG AA, dans chaque mode (normal, contraste élevé, daltoniens).
7. **Badges** : plafonnés à « 9+ », comptent l'utile (urgent, à réclamer, défaite), regroupent le reste.
8. **Téléphone** : la carte utile occupe au moins 70 % de la hauteur.
9. **Clavier** : la carte est un seul arrêt de tabulation ; les flèches vont de bâtiment en bâtiment ; Entrée ouvre l'anneau ; les fenêtres gardent le focus et le rendent en se fermant.
10. **Cibles tactiles** : 44 × 44 px au moins sur téléphone.
11. **Aucune fonction perdue** : le test d'accès à chaque écran de la v16 reste vert.
12. **Aucune régression de performance** pendant le glisser.
