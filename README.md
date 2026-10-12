# Le Trône de Fer JdR — système Foundry VTT

Système **non officiel** pour *A Song of Ice and Fire Roleplaying* (SIFRP, édition *Game of Thrones*, Green Ronin), en français.
Compatible Foundry VTT **v12 et v13**, et The Forge.

> Ce dépôt ne contient aucun texte du livre : seulement les valeurs chiffrées nécessaires aux calculs (tables d'armes, d'armures, de ressources…).

## Installation

### Sur The Forge
1. Publier une *release* GitHub (voir plus bas). Le workflow joint automatiquement `system.json` et `asoiaf.zip`.
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

## Points de règles à noter
- Les détails d'une Fortune (quelles ressources montent ou baissent) restent au choix du Narrateur. La carte de discussion rappelle l'amplitude prévue par les règles.
