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
- **Arsenal du livre** : 58 armes et 15 armures à ajouter en un clic (ou depuis le compendium « Équipement », avec prix et poids).
- Destinée (avantages et handicaps), monnaie, biographie (but, motivation, vertu, vice…).
- Lien vers la Maison : glisser une Maison sur la fiche. Le Statut maximal est alors vérifié.

### Combat (chapitre 9)
- **Fenêtre d'attaque** : quand on lance une arme, on choisit l'action.
  - Attaque normale, charge (−1D, dégâts +2), attaque prudente (−1D, Défense +3) ou téméraire (+1D, Défense −5).
  - Attaque à deux armes : le bonus de main gauche s'ajoute aux dégâts, et le bonus défensif est perdu jusqu'au prochain tour.
  - Attaque divisée : il faut plusieurs cibles. Les dés sont répartis entre elles, avec +1B par cible pour une arme Rapide, et c'est impossible avec une arme Lente.
  - Désarmer, assommer, manœuvrer, désarçonner : la Difficulté devient la valeur passive de la cible (rang × 4 + spécialité).
- **Situations à cocher** : viser (+1B), surprise (+1D), terrain dominant (+1B), cible qui a sprinté (−1D), à cheval (+1B contre un piéton), arme tenue à deux mains, cible trop proche pour une arme d'Allonge, distance pour les armes à distance. Une cible à terre ou sans défense donne +1D automatiquement.
- **Qualités d'armes** appliquées au jet :
  - Adaptable, Deux mains, Montée, Malcommode, Allonge, portées, Rapide et Lente ;
  - sur la carte, un bouton applique l'effet à la cible : Entravante, Saisie (contre l'Athlétisme passif), Empalement (3 degrés), Fracassante (2 degrés : bouclier puis armure), Étourdissante (sacrifier un degré) et Fragile (l'arme se brise) ;
  - Vicieuse : la défaite est la mort.
- **États** :
  - liste : à terre, étourdi, entravé, saisi, immobilisé, sans défense, couvert (+5/+10), esquive, prudent, téméraire, distrait, manœuvré, chancelant, empalé, désarmé, à cheval ;
  - ce sont des statuts du jeton, réglables aussi depuis le menu du jeton ;
  - ils modifient la Défense de combat et les tests, et expirent seuls avec le suivi de combat (au prochain tour, en fin de tour ou après quelques rounds).
- **Actions** (onglet Combat) : esquiver, renverser, distraire, reprendre son souffle, se relever, se libérer d'une entrave, reprendre ses esprits, retirer une arme plantée.
- **Taille** : petite (Défense +2) ou grande (Défense −2).
- **Défaite** : à 0 de Santé, la carte propose la conséquence (mort, mutilation avec −1 rang dans une capacité choisie, inconscience de 2d6 heures, rançon).
- **Guérison** :
  - blessures légères (test quotidien) et graves (test hebdomadaire), Difficulté selon l'activité ;
  - un soigneur (jeton sélectionné) teste Soins à la place ;
  - un échec critique aggrave la blessure.
- **Fatigue** : accepter un point (−1 à tous les tests) pour ignorer la pénalité d'armure, une blessure grave ou les blessures légères jusqu'au prochain tour. Le repos de 4 heures en retire un.
- **Joute** :
  - une passe contre le chevalier ciblé, avec la manœuvre choisie (agressive, arc-boutée, défensive, haut en selle, les yeux fixés) ;
  - dégâts de la lance de tournoi selon la Table 9-4 ;
  - la cible encaisse puis tente de rester en selle ; si elle est désarçonnée, la chute ignore la VA.
- **Règles optionnelles** (réglages du monde) : coups critiques (Table 9-5) et maladresses (Table 9-6).

### Intrigue (chapitre 8)
- **Position** (onglet Intrigue) :
  - disposition envers l'adversaire (Table 8-1), qui donne la Disposition (DR) et le modificateur de Persuasion ou de Duperie ;
  - technique (Table 8-3), objectif, tromperie (Duperie au lieu de Persuasion, avec la meilleure spécialité) ;
  - lieu (+3, +6 ou +12 à la Défense d'intrigue) ;
  - points de victoire pour les intrigues complexes.
- **Influencer** :
  - test contre la Défense d'intrigue de la cible ; Influence = rang de la technique × degrés ;
  - la cible soustrait sa Disposition, puis choisit d'accepter de la frustration (chaque point absorbe son rang de Volonté) ou de perdre du Sang-froid ;
  - à 0 de Sang-froid, ou avec plus de frustration que de Volonté, elle est vaincue ;
  - la carte rappelle les conséquences de la technique et décale la disposition (Charmer, Séduire, Intimider, Provoquer) ; Marchander calcule le rabais.
- **Actions** : soutenir, réfléchir (+2B), baratiner, manipuler (imposer la technique), apaiser, jauger (disposition et technique de la cible, +1D), bouclier de réputation, se retrancher, reconnaissance (option), céder, quitter.
- **Suivi de combat** : « Engager une intrigue » crée une rencontre avec les jetons ciblés.
  - L'initiative se fait au Statut (Réputation), et chaque round est un nouvel échange.
  - À la fin de la rencontre, Sang-froid et frustration reviennent.

### Inventaire (compendium « Équipement »)
- **Contenu** (chapitre 7) : 60 armes (dont dague en verredragon et arc en os de dragon), 15 armures, et l'équipement rangé par dossier : équipement personnel, munitions, outils, vêtements, instruments, nourriture et gîte, montures, bardes, véhicules, marchandises. Chaque objet porte son prix et son poids (en kg).
- **Acheter** : glissez un objet du compendium sur la fiche. Une fenêtre propose de l'acheter ou de l'ajouter gratuitement.
  - Le prix est retiré de la bourse : les sous d'abord, puis les cerfs, puis les dragons. La monnaie est rendue.
  - Pour un prix variable (« 50–500 cerfs »), on saisit le prix convenu avec le Narrateur.
  - Les objets identiques s'empilent (quantité).
- **Onglet Inventaire** : armes et armures, équipement par catégorie, doses de poisons, valeur de la bourse et poids transporté.
- **Qualité des armes** (Table 7-3), appliquée au jet : médiocre −1D ; supérieure +1 au résultat ; extraordinaire (acier valyrien) +1 au résultat et +1 aux dégâts.

### Poisons et drogues (compendium « Poisons et drogues »)
- **Contenu** : les 21 poisons et remèdes du livre (sang et venin de basilic, lait de pavot, larmes de Lys, l'Étrangleur, doux-sommeil, sang de veuve, aconit…) et l'alcool (bière, vin, spiritueux).
- **Administrer** : dans l'inventaire, l'icône de seringue utilise une dose.
  - Sur soi.
  - Sur une cible : ciblez son jeton d'abord. Si vous ne possédez pas la victime, une carte secrète demande au MJ d'appliquer le poison.
  - Pour enduire une arme (poison de contact) : la prochaine attaque réussie propose « Empoisonner la cible ».
- **Attaques automatiques** : Virulence d6 contre l'Endurance passive (rang × 4), ou la Volonté pour les poisons de l'esprit.
  - Les degrés de réussite fixent les effets, qui se cumulent : dés de pénalité, malus, Santé, blessures graves, inconscience…
  - La Fréquence et la Toxicité sont suivies seules : les phases « à chaque round » avancent avec le suivi de combat, les autres avec le temps du monde (quand le MJ avance l'heure).
  - Boutons « Attaque suivante » et « Tout résoudre » pour jouer sans gérer le temps.
- **Sur la fiche** : les poisons en cours apparaissent dans l'onglet Combat. Leurs pénalités s'appliquent à tous les tests concernés. Le jeton reçoit les statuts empoisonné, inconscient ou mort.
- **Mort** : elle est signalée quand les dés de pénalité atteignent le rang de la capacité visée.
- **Soins** :
  - « Diagnostiquer » : Soins (Diagnostic) contre la Difficulté du poison ;
  - « Traiter » : le résultat du soigneur remplace la valeur passive de la victime s'il est meilleur ;
  - le sang de veuve se guérit avec 3 degrés.
- **Récupération**, selon le poison :
  - les effets disparaissent après une durée ou au réveil ;
  - ou la victime perd un dé par heure, jour ou semaine ;
  - ou elle fait un test d'Endurance hebdomadaire ;
  - ou les effets sont permanents. « Brûler un point de Destinée » arrête le poison, et certains poisons guérissent alors en quelques jours.
- **Alcool** : chaque verre compte. Au-delà du rang d'Endurance (les spiritueux comptent double), l'alcool devient un poison. La victime s'écroule quand les pénalités égalent son Endurance, et meurt au triple.
- **Créer un poison** : la fiche d'objet résume les phases. L'édition avancée (JSON) permet d'écrire ses propres poisons et maladies.

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

Les compendiums (qualités, équipement, poisons) sont construits par le workflow de publication. En local : `npm install` puis `npm run build:packs`.

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

### Armées et commandement (chapitre 10)
- **Fiche d'Armée** (nouvel acteur) : on crée une armée par camp et on y glisse :
  - la Maison et le camp (attaquant ou défenseur) ;
  - le **commandant**, qui donne autant d'ordres par round que son rang d'Art de la guerre ;
  - les **sous-commandants**, un pour deux unités, avec un ordre chacun ;
  - les **héros**, un par rang de Statut du commandant ;
  - les **unités**.
- **Ordres du round** : la fiche compte les ordres donnés et restants par chef. Ils reviennent quand le round du suivi de combat avance (ou avec « Nouveau round »).
- **Activation** : une unité n'agit qu'après son premier ordre réussi.
- **Initiative** : test d'Art de la guerre du commandant, refait automatiquement à chaque round de bataille.
- **Commandement perdu** : toutes les unités sont désorganisées et l'armée ne donne plus qu'un ordre par round. « Prendre le commandement » permet à un personnage de Statut 2 ou plus de le reprendre.
- **Événements** :
  - chute du commandant ou d'un héros : les unités voisines testent leur Volonté (12 ou 9), et un échec les fait reculer d'un état ;
  - reddition générale : un test par unité, réussite = elle se rend, échec = déroute ;
  - attaquer un parlementaire : la Maison perd 1d6 d'Influence.
- **Ordres** (fenêtre groupée, Difficulté calculée seule : Discipline, +3 par ordre déjà donné, difficulté de l'ordre, tir de barrage subi) :
  - **de base** : attaquer, charger, défendre, repli combatif, se déplacer, réorganiser, rallier, se regrouper, se tenir prêt, battre en retraite, se rendre ;
  - **avancés** : embuscade, percée, encerclement, repousser, marteau et enclume, tenaille, attaque prudente, reformer, attaque divisée, saper, terre brûlée, tir de barrage, piétiner, escalader les murs, se préparer à la charge ;
  - **orientation** : demi-tour, pivoter ;
  - **formations** : ligne de bataille, damier, colonne, cohue, phalange, mur de boucliers, carré, tortue, coin, avec leurs effets sur la Défense (contre le Combat ou contre le Tir), la Discipline, le déplacement et les attaques ;
  - **échecs critiques** : un repli raté désorganise, une retraite ratée tourne à la déroute, une reddition refusée met l'unité en déroute ; une unité en déroute devient une cohue.
- **Attaques d'unités** : flanc (+1B), arrière (+1D), cible encerclée, riposte contre une unité de flanc ; la formation en carré annule ces bonus.
  - Le mur de boucliers annule le bonus de charge. Le coin donne +1D en charge, le damier +1D contre une cohue.
  - Une unité dissimulée gagne +1D à sa première attaque. La contre-charge double les dégâts de base.
  - Le tir de barrage rend la cible plus dure à commander.
- **Champ de bataille** :
  - par unité : terrain de la Table 10-3 (couvert pour les unités en défense, dés bonus du défenseur en colline ou montagne, terrain lent, cavalerie interdite), route, fortification (château +12/+8/+6, fort +4, tour +3, fortification de campagne +1 ou +2) ;
  - par scène : visibilité et météo (pénombre, obscurité, forte pluie, neige).
- **Fiche d'unité** : armée, champ de bataille, et boutons « Se dissimuler », « Déclencher » (ordre « se tenir prêt »), « Contre-charge » et « Pertes infligées » (un personnage qui affronte l'unité par groupes de 10 hommes).
- **Engins de siège** : par round, une armée tire au plus autant d'engins que l'Art de la guerre de son commandant.
- **Bilan de la bataille** (onglet Bilan) :
  - Gloire selon les unités vaincues et l'infériorité numérique (Table 10-5), 1 Gloire pour le vaincu ;
  - Loi, place forte prise et domaine saisi (changent de Maison), Population, pillage, rançons des captifs (1 Richesse par rang de Statut) ;
  - puis table des survivants pour toutes les unités des deux armées.

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
