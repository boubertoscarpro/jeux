# Audit v19 — « L'Art du siège »

**Point de départ** : la v18 « L'Armurerie ». Un combat passe par un seul moteur, `simulateBattle` (`src/systems/combat.js`). Il oppose deux piles d'unités : une volée, puis des mêlées, avec moral et déroute. Le défenseur reçoit un bonus de fortification `fort`, que réduisent les unités de siège de l'attaquant (`wallBreak`).

**Scénarios de mesure** :
- `save-milieu` : un bourg sans muraille de pierre ;
- le même bourg avec une muraille niv. 6 (« fortifié ») ;
- `save-fin` : la capitale, muraille 14, douves 6, hôtel de ville 15.

Les garnisons valent 0,5 ×, 0,8 ×, 1,2 × et 1,8 × le plancher de puissance des raids (250 × niveau de l'hôtel de ville). Les mesures sont faites avec `tools/siegeSim.mjs` sur la version v18 figée.

**Captures « avant »** : `docs/v19/avant/`, faites avec `tools/v19shots.cjs --before` sur la version compilée v18, en 3 tailles :
- 01 : écran Défense ;
- 02 : les remparts ;
- 03 : fenêtre d'attaque d'une place ;
- 04 : rapport de raid.

## 1. État des lieux (v18)

### 1.1 Combat et places fortes

| Place | Comment elle se défend en v18 | Ce que l'attaquant peut y faire |
|---|---|---|
| Château du joueur | `wall.bonus × (1 + wall.pct)` : muraille (0,08 × niveau étendu) et douves (0,04 × niveau), multiplié par le facteur d'enceinte et réduit par les dégâts | Les raids choisissent un flanc (le plus faible une fois sur deux) |
| Royaumes rivaux (et leurs factions) | `poi.wall`, un seul bonus | Des béliers (unités, −1,2 % chacun), des catapultes et des trébuchets (−0,6 % et −1 %) |
| Forteresses de la Brèche | `fort` selon le palier | Idem |
| Opérations de campagne (fort frontalier, capitale) | `fort` 0,25 et 0,35 | Idem, sans fenêtre de préparation |
| Avant-postes | Muraille et douves de la ville (v16b) : elles réduisent seulement la fréquence des menaces | — |
| Camps (bandits, bêtes) | Aucun bonus | — |

### 1.2 Défense par flancs (v16, rendue lisible en v17)

- **Répartition** : trois flancs et une cour (25 % chacun par défaut). La part effective d'un flanc attaqué vaut sa part plus la moitié de la cour. Elle donne un bonus de **±15 %** autour d'une répartition neutre (0,375).
- **Outils** : 3 outils (pierres, poix, archers), un par flanc, **+4 %** chacun, payés à chaque usage selon l'hôtel de ville. Ils se débloquent aux murailles 1, 5 et 10.
- **Tour de garde** : la composition à partir du niveau 3, le flanc visé à partir du niveau 5.
- **Raid** : un seul combat, `simulateBattle`, avec le bonus du flanc. La brèche, qui livre l'intérieur, a une probabilité `breachChance` (15 à 40 % selon la muraille et les douves).

### 1.3 Constats vérifiés

1. **La répartition n'est qu'un curseur de ±15 %.** Aucune décision n'a de contre. Mettre plus d'hommes sur le flanc annoncé est toujours juste, et mettre 25 % partout coûte au plus 15 % : il n'y a jamais de vrai dilemme.
2. **Les outils sont des bonus plats.** Pierres, poix et archers font tous +4 %. Ils ne répondent à rien et rien ne leur répond. Ils sont payés à chaque raid, même quand le raid frappe ailleurs.
3. **Le bélier est une unité.** Il entre dans la pile du combat, meurt avec elle et retire 1,2 % de muraille par tête, sans plafond ni contre. Cent béliers effacent une muraille à +120 %.
4. **Les ennemis n'assiègent pas.** Aucun raid n'apporte d'engin, et rien ne change d'un raid à l'autre.
5. **Aucune préparation d'attaque.** Contre une place, la fenêtre d'envoi donne un aperçu de combat simple, sans flancs ni engins. On ne sait pas ce qui défend la place.
6. **Le rapport ne dit presque rien.** Il indique le flanc attaqué et s'il y a eu brèche, sans dire pourquoi.
7. **La muraille d'un avant-poste ne protège pas au combat.** Elle réduit seulement la fréquence des menaces.
8. **Le camp sans enceinte n'est pas distingué.** Envoyer des béliers contre des bandits est permis, et ne sert à rien.

### 1.4 Mesures de départ (raids contre le château, joueur qui ne règle rien)

`node tools/siegeSim.mjs <v18> --n 150` (150 raids par case ; `docs/v19/avant/sieges.json`) :

| Place | Garnison 0,5 × | 0,8 × | 1,2 × | 1,8 × |
|---|---|---|---|---|
| Bourg (sans muraille) | 0 % (brèche 100 %) | 95 % (5 %) | 100 % | 100 % |
| Bourg fortifié (muraille 6) | 0 % (49 %) | 100 % | 100 % | 100 % |
| Capitale (muraille 14, douves 6) | 25 % (17 %) | 57 % (9 %) | 87 % (2 %) | 100 % |

Ce sont les taux de victoire de la défense ; la part de raids qui ont fait brèche est entre parenthèses. **Ces chiffres sont la référence à ne pas dégrader** pour un joueur qui ne s'occupe de rien.

## 2. Ce que la v19 propose

### 2.1 Protections

Chaque place fortifiée a trois protections :
- la **muraille**, qui protège les flancs ;
- la **porte**, qui protège le front ;
- les **douves**, qui protègent partout.

**Château du joueur.** La protection totale reste l'ancien bonus F = `wall.bonus × (1 + wall.pct)`.
- Douves = 0,04 × niveau des douves × (1 + `wall.pct`).
- Muraille = F − douves.
- Porte = muraille. La porte suit la muraille : il n'y a pas de bâtiment « porte » à bâtir. La herse renforcée (un engin de défense) l'améliore.

Sans engin, chaque flanc vaut donc exactement l'ancien bonus : un joueur qui ne fait rien ne perd rien.

**Places adverses.** Le bonus connu est réparti de la même façon (`targetProtections`).

**Avant-postes.** Une protection modeste au combat : +3 % par niveau de muraille et +2 % par niveau de douves, sur un seul front.

**Camps.** Aucune protection, et l'interface le dit : « Camp sans enceinte : pas de siège ».

### 2.2 Engins

| Engin | Camp | Coût (l’unité) | Durée | Flancs | Effet (dégressif, plafonné) | Contre | Contré par | Déblocage |
|---|---|---|---|---|---|---|---|---|
| 🪜 Échelles | attaque | 60 bois, 4 cuir | 40 s | gauche, droit | muraille −50 % max (k 10) | — | Pierres et rochers | atelier de siège niv. 1 |
| 🐏 Bélier | attaque | 120 bois, 30 fer, 2 charpente | 80 s | front | porte (herse comprise) −50 % max (k 8) | — | Poix bouillante | atelier de siège niv. 1 |
| 🛡️ Mantelets | attaque | 80 bois, 10 cuir | 50 s | tous | neutralise pierres, poix, crochets (≤ 60 %) ; attaque des défenseurs −10 % max | Pierres, poix, crochets | Archères renforcées | atelier de siège niv. 3 |
| 🪵 Fascines | attaque | 90 bois, 30 nourriture | 45 s | tous | douves −60 % max (k 8) | — | Pieux et chausse-trapes | atelier de siège niv. 5 |
| 🔥 Flèches incendiaires | attaque | 30 bois, 20 charbon, 5 tissu | 35 s | tous | neutralise pieux et herse (≤ 60 %) | Pieux, herse | Archères renforcées | atelier de siège niv. 7 |
| 🗼 Tour de siège | attaque | 400 bois, 40 acier, 30 cuir, 6 charpente | 300 s | gauche, droit | toutes les protections −18 % max (k 2) ; neutralise les archères (≤ 50 %) ; attaque +2 % max | Archères renforcées | Crochets et filets | atelier de siège niv. 10 |
| 🪨 Pierres et rochers | défense | 80 pierre | 25 s | tous | annule ≤ 80 % des échelles (k 8) ; défense +3 % max | Échelles | Mantelets | muraille niv. 1 |
| 🫕 Poix bouillante | défense | 25 charbon, 40 bois | 35 s | tous | annule ≤ 80 % du bélier (k 6) ; infanterie adverse −10 % max (au front) | Bélier | Mantelets | muraille niv. 1 |
| 🏹 Archères renforcées | défense | 60 bois, 40 pierre | 40 s | tous | annule ≤ 80 % des mantelets et des flèches incendiaires (k 8) ; attaque +5 % max | Mantelets, flèches incendiaires | Tour de siège | muraille niv. 3 |
| 🔱 Pieux et chausse-trapes | défense | 50 bois, 10 fer | 30 s | tous | annule ≤ 80 % des fascines (k 8) ; cavalerie adverse −20 % max | Fascines | Flèches incendiaires | muraille niv. 5 |
| ⛓️ Herse renforcée | défense | 120 fer, 15 acier | 120 s | front | porte +25 % max (k 3) | — | Bélier, flèches incendiaires | muraille niv. 8 |
| 🪝 Crochets et filets | défense | 40 fer, 10 tissu | 45 s | tous | annule ≤ 80 % de la tour (k 1,2) | Tour de siège | Mantelets | muraille niv. 10 |

Ce tableau est généré depuis `src/data/siege.js`. Les valeurs sont celles de la version livrée, après l'équilibrage du § 5 de `docs/V19.md`.

**Les trois anciens outils deviennent des engins** : pierres → pierres et rochers, poix → poix bouillante, archers → archères renforcées. Ils ont désormais un rôle précis et un contre.

**Les catapultes et trébuchets restent des unités d'artillerie.** Ils combattent pendant la volée. En plus, chaque pièce détruit des engins de défense sur son flanc : 0,05 par catapulte, 0,1 par trébuchet.

### 2.3 Règles chiffrées

- **Effet dégressif** : `effet(n) = plafond × (1 − e^(−n / k))`. Avec k = 8, le 1er engin rapporte 12 % du plafond, le 8e 4,9 %, le 20e 1,1 %.
- **Contres** : un engin de défense annule au plus 80 % de l'effet de l'engin qu'il contre (`COUNTER_CAP`), de façon dégressive lui aussi. Un engin d'attaque qui neutralise des engins de défense en annule au plus 60 % (`NEUTRALIZE_CAP`), la tour 50 %. L'ordre est le suivant : d'abord la neutralisation des engins de défense, puis le contre des engins d'attaque par ce qui reste.
- **Limites** :
  - attaque : au plus 5 + 2 × niveau de l'atelier de siège engins par flanc et par vague ;
  - défense : au plus 5 + 2 × niveau de muraille engins par flanc ;
  - arsenal : 20 + 10 × niveau, d'un côté et de l'autre, production comprise ;
  - vagues : 1, plus 1 avec l'atelier niv. 5, plus 1 avec la recherche « Poliorcétique », plus 1 avec un commandant niv. 15 ou la recherche « Contrepoids » (4 au plus).
- **Bataille** :
  - les flancs non attaqués envoient 80 % de leurs hommes aux flancs attaqués, et la cour y envoie toute sa réserve ;
  - sur chaque flanc, les vagues engagent leurs engins l'une après l'autre ; la réduction des protections se cumule, et les engins de défense s'usent de moitié à chaque vague ;
  - puis toutes les troupes du flanc donnent l'assaut ensemble, en un combat `simulateBattle` ;
  - un flanc percé envoie ses survivants dans la cour, et les défenseurs des flancs tenus s'y replient ;
  - le combat de la cour se livre sans protection, avec +5 %, +12 % ou +20 % d'attaque pour 1, 2 ou 3 flancs percés.
- **Déterminisme** : toute la bataille est tirée d'une graine (`rng.seeded`). Même entrée et même graine donnent la même bataille.
- **Consommation** :
  - engins d'attaque : 40 % sont récupérés sur un flanc percé ; tout est perdu sur un flanc tenu ;
  - engins de défense : la moitié est consommée sur un flanc qui tient, tout sur un flanc percé ; rien sur un flanc calme.

### 2.4 Plan de migration

| Ancien état (v18) | v19 | Valeur |
|---|---|---|
| `army.ram` (unités bélier) | `siege.arsenal.attack.ram` | 1 pour 1 ; même coût de fabrication qu'avant |
| `castle.tools` (outil posé sur un flanc, +4 %) | 5 engins du même type, en stock et posés sur le même flanc | 5 engins ≈ +4 % ou plus, avec un contre |
| `castle.flanks` (répartition) | inchangé, lu par la bataille v19 | conservé |
| Bélier en cours de formation | rejoint l'arsenal à la fin de sa formation | conservé |

La migration est faite au chargement, une seule fois (`ensureSiege`, drapeau `siege.migrated`), sans changer le format de sauvegarde. Le bélier ne se forme plus comme unité : il se fabrique à l'arsenal.

### 2.5 Décisions laissées à la mise en œuvre

| Question | Décision |
|---|---|
| Faut-il un atelier de défense ? | Il est une extension de la muraille (les hourds) : son niveau est celui de la muraille. Pas de bâtiment de plus à entretenir. |
| La porte a-t-elle un niveau ? | Elle suit la muraille ; la herse renforcée est l'engin qui la renforce. |
| Les raids attaquent-ils en plusieurs vagues ? | Non, une seule vague, car des vagues successives les affaiblissent (§ 5 de `docs/V19.md`). Leur part d'engins est prise sur leur puissance. |
| Que devient la brèche ? | La cour tombe dès qu'un flanc cède. L'intérieur n'est livré qu'à une percée sur deux flancs, ou avec l'ancienne chance de brèche. |
