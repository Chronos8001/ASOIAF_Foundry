# Le Trône de Fer JdR — système Foundry VTT

Système **non officiel** pour *A Song of Ice and Fire Roleplaying* (SIFRP, édition *Game of Thrones*, Green Ronin), en français.
Compatible Foundry VTT **v12 et v13**, et The Forge.

> Ce dépôt ne contient aucun texte du livre : seulement les valeurs chiffrées nécessaires aux calculs (tables d'armes, d'armures, de ressources…).

## Installation

### Sur The Forge
1. Publier une version : `git tag vX.Y.Z && git push origin vX.Y.Z`. Le workflow crée la release et y joint `system.json` et `asoiaf.zip`.
2. Dans Forge : **Game Systems → Install System → Manifest URL**, puis coller :
   `https://github.com/Chronos8001/ASOIAF_Foundry/releases/latest/download/system.json`

### En local
Copier le contenu du dépôt dans `Data/systems/asoiaf/`. Le nom du dossier doit être exactement `asoiaf`.

## Contenu

### Fiche de personnage (et PNJ)
- **19 capacités et leurs spécialités**, éditables directement. Un clic sur une capacité ou une spécialité lance le test.
- **Moteur de dés SIFRP** :
  - on lance les dés de test et les dés bonus, puis on garde les meilleurs ;
  - les dés de pénalité retirent ensuite les plus faibles ;
  - la carte affiche la difficulté, les degrés de réussite (1 à 4) ou l'échec (de justesse ou critique).
- **Pénalités automatiques** dans chaque test :
  - blessures légères : −1 par blessure ;
  - blessures graves : −1D par blessure ;
  - défauts : −1D sur la capacité visée ;
  - pénalité d'armure : sur les tests d'Agilité ;
  - frustration : −1D sur la Duperie et la Persuasion.
- **Valeurs dérivées** : Défense de combat (avec armure et bouclier), Défense d'intrigue, Santé, Sang-froid, VA, déplacement, sprint et encombrement.
- **Combat** :
  - attaque d'arme avec entraînement requis et dégâts = capacité ± modificateur, multipliés par les degrés ;
  - qualités *Puissante* et *Perforante* prises en compte ;
  - bouton « Appliquer aux cibles » : retire la VA et met à jour la Santé ;
  - boutons pour encaisser une blessure légère ou grave ;
  - initiative calculée sur l'Agilité (Rapidité).
- **Arsenal du livre** : 58 armes et 15 armures à ajouter en un clic.
- Destinée (avantages et handicaps), monnaie, biographie (but, motivation, vertu, vice…).
- Lien vers la Maison : glisser une Maison sur la fiche. Le Statut maximal est alors vérifié.

### Fiche de Maison
- **Les 7 ressources** (Défense, Influence, Terres, Loi, Population, Puissance, Richesse), chacune avec :
  - une barre de progression et la description du palier atteint ;
  - les points investis et les points libres.
- **Création guidée** (chapitre 6) :
  - royaume (3d6) ;
  - ressources (7d6, ou 5d6 pour un banneret, plus les modificateurs de royaume) ;
  - bonus des joueurs (+1d6) ;
  - première fondation et nombre d'événements ;
  - événements historiques (3d6) appliqués automatiquement, y compris « Infrastructures » avec choix des ressources.
- **Possessions** :
  - catalogue du livre : châteaux et tours, héritiers, mestre, septuaire, bois sacré, port, mine… ;
  - temps de construction et mois restants ;
  - domaines (terrain et caractéristiques, coût calculé) ;
  - unités (entraînement et types, coût et Discipline calculés, coût en Richesse des mercenaires, en Population des levées) ;
  - bannerets : glisser une autre Maison sur la fiche (20, 10 puis 5 de Puissance).
- **Maisonnée** : glisser des personnages, attribuer les rôles (seigneur, intendant, mestre…).
- **Fortunes** :
  - jet de l'intendant : Statut + Intendance, +1 dé de test par banneret ;
  - modificateurs de Loi, de Population et des possessions (y compris les formules comme `2d6-6`) ;
  - option de dépenser de l'Influence (5 points = +1d6) ;
  - résultat lu sur la table 6-18, puis consigné au journal.
- **Gestion mensuelle** :
  - passage au mois suivant (les chantiers avancent) ;
  - rappel de la Fortune obligatoire au moins un mois sur trois ;
  - action « Gérer les ressources » (taux normal et précipité, table 6-19) ;
  - dépense de la Gloire du groupe.
- **Blason** : image de l'écu, devise et description héraldique.

### Qualités (compendiums « Avantages » et « Handicaps et défauts »)
- **Contenu** : 118 avantages rangés par catégorie (Capacité, Destin, Héritage, Martial, Social), 35 handicaps et 19 défauts. Chaque qualité a un résumé reformulé (le livre reste la référence), ses prérequis et son nom anglais pour retrouver la page.
- **Utilisation** : glisser une qualité du compendium sur la fiche. Ses effets s'appliquent seuls :
  - dés de test, dés bonus et dés de pénalité ;
  - bonus au résultat ;
  - conversion de dés bonus en dés de test ;
  - relances des 1 ou des 6 ;
  - dégâts, perforation et bonus défensif des armes ;
  - Santé, Sang-froid, Défenses, VA, déplacement ;
  - jet de Fortune de l'intendant.
- **Effets situationnels** (« contre un animal », « en joute »…) : ils apparaissent comme cases à cocher dans la fenêtre de jet.
- **Qualités à choix** (Talentueux, Expertise, Charismatique, Maîtrise d'arme, Défaut au choix…) : elles portent un badge « à configurer ». Ouvrez-les et choisissez la cible de l'effet.
- **Éditeur d'effets** : chaque qualité peut être modifiée, et on peut en créer de nouvelles. L'aide est intégrée à la fiche d'objet.

Les compendiums sont construits par le workflow de publication. En local : `npm install` puis `npm run build:packs`.

### Batailles (chapitre 10) : unités sur la carte
- **Déployer** : dans l'onglet Possessions de la Maison, l'icône de pion à côté d'une unité crée un acteur **Unité**. Il reprend l'entraînement, les types et le lien vers la Maison. Glissez-le ensuite sur la carte de bataille (1 case = 10 mètres). Le jeton affiche la barre de Santé et l'état de l'unité (désorganisée, en déroute, détruite).
- **Fiche d'unité** :
  - Défense = Agilité + Athlétisme + Vigilance + pénalité d'armure ; un personnage seul doit battre cette Défense +20 ;
  - VA, encombrement, dégâts de corps à corps et de tir selon les tables 10-1 et 10-2, avec les améliorations d'équipement ;
  - Discipline, déplacement (40 m, cavalerie 80 m, navires 60 m) et course ;
  - Santé = Endurance × 3 ; expérience de l'entraînement (20 XP par rang).
- **Commandant et héros** : glissez un personnage dans « Commandant » (son Art de la guerre sert aux ordres et à l'initiative) ou dans « Personnage rattaché » (Discipline -3, +1D en Combat et en Tir, il encaisse des dégâts quand l'unité est touchée).
- **Ordres** : « Donner un ordre » lance l'Art de la guerre (Commandement) du commandant contre la Discipline, +3 par ordre déjà donné au même round.
  - En cas d'échec, l'unité suit son ordre permanent ; sur un échec critique, elle ne fait rien.
  - Ordres disponibles : Attaquer, Charger (-1D, +2 dégâts), Défendre (test d'Agilité, +1D avec boucliers), Repli combatif, Se déplacer, Réorganiser, Rallier, Se regrouper, Se tenir prêt, Battre en retraite, Se rendre.
- **Attaques** : ciblez le jeton ennemi.
  - La Difficulté se remplit seule : Défense de l'unité, ou Défense de combat du personnage (l'unité gagne alors +2D).
  - « Appliquer aux cibles » gère la VA et le moral : Santé à 0 → désorganisée (-1D, Discipline +3, cumulatif) ; touchée en étant désorganisée → déroute ; touchée en déroute, ou plus du double de sa Santé en un coup → détruite.
- **Rounds** : le compteur d'ordres se remet à zéro quand le round du suivi de combat avance. L'initiative d'une unité est l'Art de la guerre (Stratégie) de son commandant.
- **Fin de bataille** : table des survivants (10-6). L'entraînement monte ou baisse, et il est reporté sur l'unité de la Maison. Une unité perdue retire sa Puissance investie.

### Sièges : engins et équipement spécial
- **Engins de siège** (nouvel acteur) : catapultes (3 tailles), mangonneau, scorpion, cracheur de feu, trébuchet, tour de siège et bélier couvert.
  - Pour en construire un : onglet Possessions de la Maison, liste « Engins de siège ». Le coût en Richesse ou en Terres est proposé à la Maison.
  - Les servants : glissez une unité d'ingénieurs sur la fiche de l'engin. « Tirer » teste son Art de la guerre contre la Défense de la cible (Défense contre le Tir pour une unité), dégâts × degrés.
  - Règles propres à chaque engin : un tir tous les deux rounds, -1D du mangonneau contre les unités, scorpion contre un personnage (-1D, 10 dégâts), « Battre la muraille » avec l'Athlétisme de l'engin.
- **Munitions** : pierres, poix ou huile (ignorent la VA), feu grégeois (ignore la VA et enflamme la cible pendant 2d6 rounds). La poix et le feu grégeois se paient en Richesse.
- **Tour de siège** : glissez l'unité qui monte dedans. Elle gagne +5 en Défense et avance de 10 m. Arrivée au mur, elle passe sans escalade. Si la tour est détruite, l'unité périt.
- **Bélier couvert** : ses servants gagnent +5 en Défense ; il bat les portes avec Athlétisme 8.
- **Équipement spécial des unités** (coût proposé à la Maison) :
  - bélier : +2D pour enfoncer, pas d'attaque ;
  - mantelets : +5 en Défense contre le Tir, -10 m ;
  - échelles : +1D pour escalader, pas d'attaque ;
  - tortue : +10 en Défense, 10 m, pas d'attaque ;
  - feu grégeois : Discipline +3, une seule attaque possible, s'embrase 1 fois sur 6 si l'unité est touchée.
- **Défenseurs** : « Huile ou eau bouillante » (½ Richesse) produit une carte de dégâts qui ignore la VA (5 ou 10).
- **Incendies** : à chaque nouveau round du suivi de combat, les unités et les engins en feu subissent leurs dégâts automatiquement.

### Artisans (règle maison)
Onglet **Artisans** de la fiche de Maison. Pour en créer un : bouton dédié, ou « Artisan » dans les possessions de Richesse.
- **Au départ** : rang 5 dans la compétence de métier, budget max 10, Richesse investie (perdue au décès).
- **Début de mois** : « Se mettre au travail » dépense 1 point de budget (un seul par mois).
- **Fin de mois** : jet de métier contre Difficulté 9.
  - Réussite : +degrés +5 au budget, et +1 XP par degré.
  - Échec : le point est perdu.
  - Échec critique : en plus, −1D au prochain jet.
  - Un bouton signale un travail interrompu (attaque) : le mois et le point sont perdus.
- **Projet commun** (au moins deux artisans au travail) :
  - le chef de projet peut dépenser un 2e point ;
  - +1B par artisan au-delà du chef ;
  - seuls les bonus du chef s'appliquent ;
  - tous gagnent l'XP, le chef +2 XP si le projet réussit.
- **Budget** :
  - pour l'obtenir : 2 points de ressource, ou 500 dragons d'or prélevés sur un membre de la maisonnée ;
  - pour le dépenser : on indique le bénéfice obtenu, et la dépense est consignée dans le chat.
- **Progression** : 30 XP pour +1D, 50 XP pour une nouvelle production ou spécialité.
- **Prêt ou accueil** : le budget repasse à 0. Chaque mois, la maison qui accueille perd 2 de Richesse et celle qui prête gagne 1, sauf prêt gracieux. Le prélèvement se fait au passage au mois suivant.

## Points de règles à noter
- Les détails d'une Fortune (quelles ressources montent ou baissent) restent au choix du Narrateur. La carte de discussion rappelle l'amplitude prévue par les règles.
