/**
 * Données du chapitre 7 (Équipement) pour les compendiums « Équipement » et « Poisons et drogues ».
 * Seuls les chiffres viennent du livre ; les descriptions sont des résumés reformulés.
 * Poids en kg (le livre compte en livres) ; prix en dragons, cerfs et sous.
 */
import { DAY, HOUR, MINUTE, ROUND, WEEK } from "../module/poison-rules.mjs";

const lb = n => Math.round(n * 0.4536 * 10) / 10;

/** Prix (Table 7-4) et poids des armes du catalogue, par nom français. [prix, livres] */
export const WEAPON_COSTS = {
  "Hache de bataille": ["50 cerfs", 7], "Bec-de-corbin": ["60 cerfs", 6], "Hachette": ["30 cerfs", 4],
  "Hache longue": ["500 cerfs", 20], "Pioche": ["50 cerfs", 10], "Hache de bûcheron": ["40 cerfs", 6],
  "Fléau à boule": ["40 cerfs", 8], "Gourdin": ["20 cerfs", 3], "Fléau d'armes": ["100 cerfs", 12],
  "Masse": ["50 cerfs", 10], "Maillet": ["80 cerfs", 13], "Morgenstern": ["80 cerfs", 8],
  "Bâton": ["", 4], "Marteau de guerre": ["100 cerfs", 8],
  "Couteau": ["5 cerfs", 1], "Fouet": ["5 cerfs", 2],
  "Lame braavienne": ["800 cerfs", 3], "Dague main gauche": ["20 cerfs", 1], "Épée de cour": ["300 cerfs", 3],
  "Arakh": ["450 cerfs", 4], "Épée bâtarde": ["700 cerfs", 10], "Épée à deux mains": ["800 cerfs", 15], "Épée longue": ["500 cerfs", 4],
  "Hallebarde": ["100 cerfs", 11], "Outil paysan": ["10 cerfs", 9], "Hache d'armes": ["80 cerfs", 9],
  "Rondache": ["25 cerfs", 3], "Bouclier": ["30 cerfs", 5], "Grand bouclier": ["40 cerfs", 6], "Pavois": ["60 cerfs", 10],
  "Dague": ["20 cerfs", 1], "Poignard": ["20 cerfs", 1], "Stylet": ["30 cerfs", 1.5],
  "Épieu": ["40 cerfs", 9], "Fourche à grenouilles": ["25 cerfs", 3], "Pique": ["80 cerfs", 9], "Lance": ["50 cerfs", 6],
  "Lance de tournoi": ["40 cerfs", 8], "Trident": ["30 cerfs", 5], "Lance de guerre": ["60 cerfs", 10],
  "Arc recourbé": ["500 cerfs", 2], "Arc de chasse": ["100 cerfs", 3], "Arc long": ["900 cerfs", 3],
  "Arbalète légère": ["150 cerfs", 6], "Arbalète moyenne": ["400 cerfs", 8], "Arbalète lourde": ["950 cerfs", 9], "Arbalète myriote": ["2000 cerfs", 9],
  "Javelot": ["20 cerfs", 3], "Filet": ["20 cerfs", 4], "Fronde": ["", 0]
};
/** Armes de lancer : même objet que l'arme de mêlée correspondante. */
for (const [thrown, melee] of [["Fourche à grenouilles (lancer)", "Fourche à grenouilles"], ["Hachette (lancer)", "Hachette"],
  ["Couteau (lancer)", "Couteau"], ["Lance (lancer)", "Lance"], ["Trident (lancer)", "Trident"]]) WEAPON_COSTS[thrown] = WEAPON_COSTS[melee];
for (const v of Object.values(WEAPON_COSTS)) v[1] = lb(v[1]);

/** Armes exotiques (p. 134) : verredragon (Fragile) et os de dragon. */
export const EXOTIC_WEAPONS = [
  { name: "Dague en verredragon", specialty: "shortBlades", training: 0, damageAbility: "agility", damageMod: -2,
    qualities: "Défensive +1, Main gauche +1, Fragile", defensive: 1, cost: "", weight: lb(1),
    description: "Lame d'obsidienne taillée : fragile, mais les gens du Nord et les sauvageons la disent fatale aux créatures surnaturelles." },
  { name: "Pointes de flèche en verredragon (12)", equipment: true, category: "ammunition", cost: "", weight: lb(1),
    description: "Flèches à pointe d'obsidienne. Elles ont la qualité Fragile." },
  { name: "Arc recourbé en os de dragon", specialty: "bows", training: 1, damageAbility: "agility", damageMod: 2,
    qualities: "Longue portée, Puissante, Perforante 1, Deux mains", piercing: 1, cost: "", weight: lb(2),
    description: "Arc en os de dragon, noir, souple et léger : gagne Puissante, Perforante 1 et Deux mains, et +1 aux dégâts de base. Inestimable." }
];

/** Prix et poids des armures (Table 7-5), par nom français. */
export const ARMOR_COSTS = {
  "Vêtements": ["", 0], "Robes, habits": ["3 cerfs", 20], "Matelassée": ["200 cerfs", 10], "Cuir souple": ["300 cerfs", 15],
  "Cuir bouilli": ["400 cerfs", 18], "Os ou bois": ["300 cerfs", 25], "Anneaux": ["600 cerfs", 20], "Peaux": ["400 cerfs", 25],
  "Maille": ["500 cerfs", 40], "Cuirasse": ["800 cerfs", 25], "Écailles": ["600 cerfs", 30], "Lamelles": ["1000 cerfs", 50],
  "Brigandine": ["1200 cerfs", 50], "Demi-plate": ["2000 cerfs", 40], "Plate complète": ["3000 cerfs", 50]
};
for (const v of Object.values(ARMOR_COSTS)) v[1] = lb(v[1]);

/** Équipement, par catégorie : [nom, prix, livres, description]. */
const G = (name, cost, pounds, description = "") => ({ name, cost, weight: lb(pounds), description });

export const EQUIPMENT = {
  gear: [
    G("Sac à dos", "1 cerf", 2),
    G("Bougies (paire)", "2 sous", 0.5, "Éclairent un petit rayon (1,5 m) pendant une heure."),
    G("Longue-vue (« œil myriote »)", "300 cerfs", 2, "Tube de bois ou de cuir garni de deux lentilles : permet de voir au loin."),
    G("Flasque", "2 cerfs", 1, "Récipient bouché de céramique, de verre ou de métal."),
    G("Briquet (silex et acier)", "2 sous", 0.5),
    G("Encre noire (fiole)", "20 sous", 0.2, "Les autres couleurs coûtent plus cher."),
    G("Pitons de fer", "4 sous", 1, "Pointes à œillet enfoncées dans la roche, la glace ou un mur pour y passer une corde."),
    G("Lampe à huile", "10 sous", 1, "Éclaire 4,5 m pendant environ 6 heures par pinte d'huile ; l'huile se renverse facilement."),
    G("Lanterne", "2 cerfs", 2, "Comme une lampe mais protégée par du verre ; éclaire environ 9 m pendant 6 heures."),
    G("Lentille myriote", "20 cerfs", 0.2, "Grossit les petits objets ; peut allumer un feu au soleil."),
    G("Huile (pinte)", "8 sous", 1, "Pour lampes et lanternes : environ 6 heures."),
    G("Bourse de ceinture", "8 sous", 0.5),
    G("Corde de chanvre", "10 sous", 10),
    G("Sachet parfumé", "1 cerf", 0.1, "Petite bourse de senteurs, parfois cousue dans une manche."),
    G("Parfums et onguents", "1 cerf", 0.2, "Eau de rose, citron, jasmin… un luxe de gens bien nés."),
    G("Tente de soldat", "5 cerfs", 10, "Pour un homme et ses armes ; à deux, on s'y serre."),
    G("Pavillon", "30 cerfs", 60, "Grande tente à mât central pour un chevalier et sa suite, souvent aux couleurs de la maison."),
    G("Torche", "1 sou", 1, "Éclaire environ 6 m pendant une heure."),
    G("Outre", "8 sous", 1),
    G("Pierre à aiguiser", "3 sous", 1),
    G("Trousse de mestre", "50–500 cerfs", 5, "Bandages, herbes, onguents, potions, petits couteaux, fil et aiguille pour soigner.")
  ],
  ammunition: [
    G("Flèches (12)", "10 cerfs", 1),
    G("Carreaux d'arbalète (12)", "10 cerfs", 1),
    G("Balles de fronde (12)", "", 1)
  ],
  tools: [
    G("Outils d'artisan (ordinaires)", "10–200 cerfs", 10, "Forgeron, charpentier, maçon, orfèvre… chaque métier a ses outils."),
    G("Outils d'artisan (de maître)", "100–1000 cerfs", 10, "Jeu d'outils finement ouvragés."),
    G("Outils de serrurier", "10–200 cerfs", 2, "Passe-partout, crochets, pince, petite scie : pour poser ou forcer serrures et fers.")
  ],
  clothing: [
    G("Tenue d'artisan", "1–5 cerfs", 3, "Chemise, pantalon ou jupe, chaussures de cuir, tablier à poches."),
    G("Tenue de courtisan", "10–100 cerfs", 4, "Soies et satins taillés à la dernière mode, fourrures, bijoux."),
    G("Tenue d'artiste", "4 cerfs", 3, "Habits voyants de chanteur ou de mime, parfois bariolés."),
    G("Robe de religieux", "2 cerfs", 3, "Robe simple ; la plupart portent un cristal à sept faces."),
    G("Robe de mestre", "4 cerfs", 3, "Robe aux manches pleines de poches."),
    G("Tenue de noble", "100–1000 cerfs", 5, "Les plus belles étoffes, brodées, fourrées, aux couleurs de la maison."),
    G("Tenue du Nord", "4 cerfs", 8, "Manteau de laine, bonnet fourré, cape de fourrure, bottes fourrées."),
    G("Tenue de paysan", "1 cerf", 3, "Laine grossière et lin."),
    G("Tenue de voyage", "3 cerfs", 5, "Bonnes bottes, cape à capuchon, gants, écharpe de laine.")
  ],
  instrument: [
    G("Tambour", "20 sous", 3), G("Violon", "10 cerfs", 2), G("Flûte", "10 cerfs", 0.5),
    G("Harpe", "18 cerfs", 5), G("Cor", "3 cerfs", 2), G("Pipeau", "3 cerfs", 0.5)
  ],
  food: [
    G("Repas simple (auberge)", "", 0, "Porridge, ragoût, légumes de saison, pain. Les prix varient beaucoup selon la saison et la guerre."),
    G("Coucher près de l'âtre", "", 0, "Quelques sous par personne ; l'écurie est moins chère."),
    G("Chambre privée (nuit)", "1–2 cerfs", 0),
    G("Fourrage (par jour)", "1 sou", 10),
    G("Écurie (par jour)", "1 sou", 0)
  ],
  mount: [
    G("Coursier", "600 cerfs", 0, "Cheval de guerre plus léger qu'un destrier : rapide et robuste, monture préférée au combat."),
    G("Destrier", "1000 cerfs", 0, "Grand cheval de guerre fougueux, très bien dressé : le plus précieux."),
    G("Garron", "40 cerfs", 0, "Petit cheval hirsute au pied sûr des montagnes ; prisé par la Garde de Nuit."),
    G("Mule", "12 cerfs", 0, "La meilleure bête de somme : robuste, sûre et peu craintive."),
    G("Palefroi", "150 cerfs", 0, "Cheval de selle docile, prisé des dames ; impropre à la guerre."),
    G("Poney", "50 cerfs", 0, "Monture des enfants, ou bête de somme."),
    G("Roncin", "50 cerfs", 0, "Cheval sans pedigree mais capable : monture des chevaliers errants et des écuyers."),
    G("Coursier des sables", "1200 cerfs", 0, "Cheval dornien rapide et endurant, trop menu pour porter une armure."),
    G("Cheval de trait", "50 cerfs", 0, "Gros cheval de labour."),
    G("Fontes (paire)", "1 cerf", 4, "Sacoches de selle.")
  ],
  barding: [
    G("Barde de cuir", "1100 cerfs", 60), G("Barde d'anneaux", "2400 cerfs", 80), G("Barde d'écailles", "2400 cerfs", 120),
    G("Barde de mailles", "3200 cerfs", 160), G("Barde de brigandine", "4800 cerfs", 200), G("Barde de plates", "12000 cerfs", 200)
  ].map(b => ({ ...b, description: "Armure de cheval (Table 7-6). Pour un poney ou un garron : moitié prix et moitié poids. À retirer chaque nuit." })),
  vehicle: [G("Traîneau", "5 cerfs", 0), G("Chariot", "20 cerfs", 0), G("Charrette", "8 cerfs", 0)],
  tradeGood: [
    G("Aurochs", "13 cerfs", 0), G("Pain (grosse miche)", "1 sou", 1), G("Poulet", "4 sous", 0),
    G("Cannelle ou clous de girofle (livre)", "2 cerfs", 1), G("Vache", "9 cerfs", 0), G("Chien (chiot)", "3 cerfs", 0),
    G("Chien dressé", "11 cerfs", 0), G("Œufs (douzaine)", "1 sou", 1), G("Gingembre ou poivre (livre)", "10 cerfs", 1),
    G("Chèvre", "1 cerf", 0), G("Lin (livre)", "1 cerf", 1), G("Bœuf", "13 cerfs", 0), G("Cochon (le meilleur du marché)", "2 cerfs", 0),
    G("Safran (livre)", "1 dragon", 1), G("Sel (livre)", "3 cerfs", 1), G("Mouton", "48 sous", 0),
    G("Soie (livre)", "20 cerfs", 1), G("Feuilles de thé (livre)", "4 sous", 1)
  ]
};

/* -------------------------------------------- */
/*  Poisons et drogues (p. 134-138)             */
/* -------------------------------------------- */

const E = (kind, target, formula, opts = {}) => ({
  kind, target, formula: String(formula), permanent: false, once: false, always: false, situational: false, label: "", ...opts
});
const NO_EFFECT = E("note", "", "", {});
const stage = (opts) => ({
  label: "", interval: HOUR, firstDelay: 0, toxicity: 1, defense: "endurance", auto: false, requires: -1, effects: [],
  followAbility: "", followDifficulty: 0, followLabel: "", followFail: NO_EFFECT, ...opts
});
const death = (...abilities) => abilities.map(ability => ({ ability, multiplier: 1, result: "death", hours: "" }));
const recovery = (opts) => ({ mode: "fade", interval: DAY, amount: 1, difficulty: 0, fadeAfter: 0, fadeOnWake: false, destinyDelay: "", ...opts });
const P = "permanent";

/**
 * [nom, VO, prix, mode, virulence, diagnostic, description, { stages, thresholds, recovery, … }]
 */
export const POISONS = [
  { n: "Sang de basilic", en: "Basilisk Blood", cost: "5–10 dragons", delivery: "ingested", virulence: 6, diagnosis: 12,
    d: "Pâte de sang de lézard de Yi Ti, ajoutée comme une épice : rend fou. Toutes les 5 minutes (3 fois) : −1D en Ruse, +1D par 2 degrés. Tant qu'il agit, un test de Volonté Exigeant (9) évite d'attaquer la créature la plus proche. Mort si les dés de pénalité égalent la Ruse. Séquelles permanentes, sauf en brûlant un point de Destinée (guéri en 1d6 jours).",
    stages: [stage({ interval: 5 * MINUTE, toxicity: 3, effects: [E("penaltyDice", "cunning", "1+floor(@deg/2)", { [P]: true })],
      followAbility: "will", followDifficulty: 9, followLabel: "Volonté contre la folie",
      followFail: E("note", "", "", { label: "La victime attaque la créature la plus proche (seule, elle se lacère : 1 blessure légère par minute)." }) })],
    thresholds: death("cunning"), recovery: recovery({ mode: "permanent", destinyDelay: "1d6" }) },

  { n: "Venin de basilic", en: "Basilisk Venom", cost: "5–10 dragons", delivery: "contact", virulence: 5, diagnosis: 9,
    d: "Venin de crochets de basilic : convulsions, cou et visage engourdis. Chaque round (2 fois) : 1 blessure grave par degré. Blessée, la victime perd la parole et doit réussir un test d'Endurance Redoutable (12) ou subir −1D en Endurance (permanent, sauf en brûlant un point de Destinée : guéri en 2d6 jours).",
    stages: [stage({ interval: ROUND, toxicity: 2, effects: [E("wounds", "", "@deg"), E("note", "", "", { label: "La victime ne peut plus parler." })],
      followAbility: "endurance", followDifficulty: 12, followLabel: "Endurance contre la paralysie",
      followFail: E("penaltyDice", "endurance", "1", { [P]: true }) })],
    thresholds: [], recovery: recovery({ mode: "permanent", destinyDelay: "2d6" }) },

  { n: "Lait de feu", en: "Firemilk", cost: "25 cerfs", delivery: "contact", virulence: 3, diagnosis: 3,
    d: "Onguent rouge pâle versé sur les plaies pour les nettoyer : brûle et affaiblit, mais prévient l'infection. Chaque round (2 fois) : −1 aux résultats d'Athlétisme par degré, mais +1D (et +1B par degré supplémentaire) aux tests d'Endurance et de Soins pour guérir blessures légères et graves. Disparaît après 24 heures.",
    stages: [stage({ interval: ROUND, toxicity: 2, effects: [
      E("modifier", "athletics", "-@deg"),
      E("testDice", "endurance,healing", "1", { once: true, situational: true, label: "Guérir une blessure" }),
      E("bonusDice", "endurance,healing", "@deg-1", { situational: true, label: "Guérir une blessure" })] })],
    thresholds: [], recovery: recovery({ fadeAfter: DAY }) },

  { n: "Chapeau-gris", en: "Greycap", cost: "25 cerfs", delivery: "ingested,inhaled", virulence: 5, diagnosis: 9,
    d: "Champignon séché et réduit en poudre : agit lentement, puis douleurs atroces, fièvre, organes qui lâchent. Toutes les 6 heures (2 fois) : −1D en Athlétisme, +1D par 2 degrés. Chaque jour (2 fois) : −2D en Ruse et −1D en Endurance par degré. Mort si les pénalités égalent l'une de ces capacités. Ensuite, la Ruse revient au rythme d'un dé par jour ; Athlétisme et Endurance sont permanents, sauf en brûlant un point de Destinée (1d6 jours).",
    stages: [
      stage({ label: "Douleurs", interval: 6 * HOUR, firstDelay: 6 * HOUR, toxicity: 2, effects: [E("penaltyDice", "athletics", "1+floor(@deg/2)", { [P]: true })] }),
      stage({ label: "Fièvre", interval: DAY, firstDelay: DAY, toxicity: 2, effects: [E("penaltyDice", "cunning", "2"), E("penaltyDice", "endurance", "@deg", { [P]: true })] })],
    thresholds: death("athletics", "cunning", "endurance"), recovery: recovery({ mode: "periodic", interval: DAY, destinyDelay: "1d6" }) },

  { n: "Lait de pavot", en: "Milk of the Poppy", cost: "200 cerfs", delivery: "ingested", virulence: 4, diagnosis: 3,
    d: "Sève de pavot : calme la douleur, endort, crée une dépendance. Dès la prise, les pénalités de blessures légères et graves sont réduites de moitié (8 heures). Si le poison l'emporte (une attaque), la victime s'endort 6 heures + 1 par degré.",
    stages: [
      stage({ label: "Soulagement", auto: true, effects: [E("halveInjuries", "", "")] }),
      stage({ label: "Sommeil", interval: MINUTE, toxicity: 1, effects: [E("unconscious", "", "6+@deg")] })],
    thresholds: [], recovery: recovery({ fadeAfter: 8 * HOUR }) },

  { n: "Lait de pavot (forte dose)", en: "Milk of the Poppy, Large Dose", cost: "500 cerfs", delivery: "ingested", virulence: 6, diagnosis: 3,
    d: "Forte dose : pénalités de blessures réduites de moitié, mais −3 à tous les résultats. Si le poison l'emporte, sommeil de 12 heures + 1 par degré. Effets dissipés après 8 heures.",
    stages: [
      stage({ label: "Soulagement", auto: true, effects: [E("halveInjuries", "", ""), E("modifier", "all", "-3")] }),
      stage({ label: "Sommeil", interval: MINUTE, toxicity: 1, effects: [E("unconscious", "", "12+@deg")] })],
    thresholds: [], recovery: recovery({ fadeAfter: 8 * HOUR }) },

  { n: "Feu myrien", en: "Myrish Fire", cost: "100 cerfs", delivery: "contact", virulence: 4, diagnosis: 6,
    d: "Onguent qui brûle affreusement mais empêche les chairs de pourrir. Chaque round (2 fois) : −1 aux résultats d'Agilité par degré, mais +1D (+1B par degré supplémentaire) aux tests d'Endurance pour guérir. Disparaît après 24 heures.",
    stages: [stage({ interval: ROUND, toxicity: 2, effects: [
      E("modifier", "agility", "-@deg"),
      E("testDice", "endurance", "1", { once: true, situational: true, label: "Guérir une blessure" }),
      E("bonusDice", "endurance", "@deg-1", { situational: true, label: "Guérir une blessure" })] })],
    thresholds: [], recovery: recovery({ fadeAfter: DAY }) },

  { n: "Belladone", en: "Nightshade", cost: "100 cerfs", delivery: "ingested", virulence: 4, diagnosis: 6,
    d: "Baies noires luisantes : nausées, vertiges, hallucinations. Chaque minute (2 fois, contre la Volonté) : −1D en Ruse, +1D par 2 degrés. Chaque heure (2 fois) : −2D en Endurance, +1D par degré supplémentaire. Mort si les pénalités égalent l'une de ces capacités. Ensuite, chaque semaine, un test d'Endurance Exigeant (9) retire un dé par degré.",
    stages: [
      stage({ label: "Esprit", interval: MINUTE, toxicity: 2, defense: "will", effects: [E("penaltyDice", "cunning", "1+floor(@deg/2)")] }),
      stage({ label: "Corps", interval: HOUR, firstDelay: HOUR, toxicity: 2, effects: [E("penaltyDice", "endurance", "1+@deg")] })],
    thresholds: death("cunning", "endurance"), recovery: recovery({ mode: "test", interval: WEEK, difficulty: 9 }) },

  { n: "Menthe pouliot (dose légère)", en: "Pennyroyal, Mild", cost: "5 cerfs", delivery: "ingested", virulence: 3, diagnosis: 6,
    d: "Herbe aromatique des tisanes contre le rhume, et du thé de lune. Chaque heure (2 fois) : −1 aux résultats d'Agilité, d'Athlétisme et de Vigilance par degré. Disparaît après 24 heures.",
    stages: [stage({ interval: HOUR, toxicity: 2, effects: [E("modifier", "agility,athletics,awareness", "-@deg")] })],
    thresholds: [], recovery: recovery({ fadeAfter: DAY }) },

  { n: "Menthe pouliot (dose forte)", en: "Pennyroyal, Strong", cost: "10 cerfs", delivery: "ingested", virulence: 5, diagnosis: 6,
    d: "Dose forte, qui peut faire perdre un enfant. Toutes les 2 heures (2 fois) : −1 aux résultats d'Agilité, d'Athlétisme et de Vigilance par degré, et −2 en Santé (−1 de plus par 2 degrés). Disparaît après 24 heures.",
    stages: [stage({ interval: 2 * HOUR, toxicity: 2, effects: [
      E("modifier", "agility,athletics,awareness", "-@deg"), E("health", "", "-(2+floor(@deg/2))")] })],
    thresholds: [], recovery: recovery({ fadeAfter: DAY }) },

  { n: "L'Étrangleur", en: "Strangler", cost: "150 dragons", delivery: "ingested", virulence: 7, diagnosis: 15,
    d: "Cristaux violets des îles de la mer de Jade, qui fondent dans tout liquide et ferment la gorge. Chaque round (4 fois) : −2D à tous les tests, +1D par degré supplémentaire. Mort si les pénalités égalent l'Endurance. Le survivant perd un dé par semaine d'alitement ; le plus souvent, seul un point de Destinée brûlé sauve la victime.",
    stages: [stage({ interval: ROUND, toxicity: 4, effects: [E("penaltyDice", "all", "1+@deg")] })],
    thresholds: death("endurance"), recovery: recovery({ mode: "periodic", interval: WEEK }) },

  { n: "Doux-sommeil (quelques grains)", en: "Sweetsleep, Grains", cost: "", delivery: "ingested", virulence: 4, diagnosis: 3,
    d: "Quelques grains calment un cœur affolé ou les tremblements : −1 aux résultats de Ruse par degré, mais +2 au Sang-froid. (Durée non précisée par le livre : une heure ici.)",
    stages: [stage({ interval: 5 * MINUTE, toxicity: 1, effects: [E("modifier", "cunning", "-@deg"), E("composure", "", "2", { once: true })] })],
    thresholds: [], recovery: recovery({ fadeAfter: HOUR }) },

  { n: "Doux-sommeil (une pincée)", en: "Sweetsleep, Pinch", cost: "120 cerfs", delivery: "ingested", virulence: 5, diagnosis: 3,
    d: "Une pincée donne un sommeil sans rêves. Chaque round (2 fois) : −1D en Ruse, +1D par 2 degrés. Toutes les 5 minutes (2 fois) : inconscience de 3 heures + 1 par degré. Les pénalités disparaissent au réveil.",
    stages: [
      stage({ label: "Torpeur", interval: ROUND, toxicity: 2, effects: [E("penaltyDice", "cunning", "1+floor(@deg/2)")] }),
      stage({ label: "Sommeil", interval: 5 * MINUTE, firstDelay: 5 * MINUTE, toxicity: 2, effects: [E("unconscious", "", "3+@deg")] })],
    thresholds: [], recovery: recovery({ fadeOnWake: true, fadeAfter: 8 * HOUR }) },

  { n: "Doux-sommeil (trois pincées)", en: "Sweetsleep, 3 Pinches", cost: "360 cerfs", delivery: "ingested", virulence: 6, diagnosis: 3,
    d: "Trois pincées donnent le sommeil éternel. Chaque round (3 fois) : −2D en Ruse et en Endurance, +1D par degré supplémentaire, et inconscience de 24 heures (+10 par degré supplémentaire). Mort si les pénalités d'Endurance égalent son rang. Les pénalités disparaissent au réveil.",
    stages: [stage({ interval: ROUND, toxicity: 3, effects: [E("penaltyDice", "cunning,endurance", "1+@deg"), E("unconscious", "", "24+10*(@deg-1)")] })],
    thresholds: death("endurance"), recovery: recovery({ fadeOnWake: true, fadeAfter: DAY }) },

  { n: "Tanaisie (dose légère)", en: "Tansy, Mild", cost: "5 cerfs", delivery: "ingested", virulence: 3, diagnosis: 3,
    d: "Herbe à fleurs jaunes des tisanes contre les maux de ventre, et du thé de lune. Toutes les 30 minutes (1 fois) : +1 aux résultats d'Endurance, mais −1D en Athlétisme par degré. Disparaît après 1 heure.",
    stages: [stage({ interval: 30 * MINUTE, toxicity: 1, effects: [E("modifier", "endurance", "1", { once: true }), E("penaltyDice", "athletics", "@deg")] })],
    thresholds: [], recovery: recovery({ fadeAfter: HOUR }) },

  { n: "Tanaisie (dose forte)", en: "Tansy, Strong", cost: "15 cerfs", delivery: "ingested", virulence: 5, diagnosis: 3,
    d: "Dose forte : −2D en Athlétisme et −1D en Endurance, plus −1D en Endurance par degré. Mort si les pénalités d'Endurance égalent son rang. Disparaît après 1 heure.",
    stages: [stage({ interval: 30 * MINUTE, toxicity: 1, effects: [E("penaltyDice", "athletics", "2"), E("penaltyDice", "endurance", "1+@deg")] })],
    thresholds: death("endurance"), recovery: recovery({ fadeAfter: HOUR }) },

  { n: "Larmes de Lys", en: "Tears of Lys", cost: "100 dragons", delivery: "ingested", virulence: 6, diagnosis: 18,
    d: "Liquide incolore, inodore et doux comme l'eau : ronge les entrailles et tue en quelques jours sans laisser de trace. Chaque heure (6 fois) : −2D en Athlétisme, +1D par 2 degrés. Chaque jour (6 fois) : −1D en Agilité, Athlétisme et Endurance, +1D à chacune par degré. Mort si les pénalités d'Endurance égalent son rang. Presque toujours fatal ; effets permanents, sauf en brûlant un point de Destinée (guéri en 3d6 jours).",
    stages: [
      stage({ label: "Entrailles", interval: HOUR, toxicity: 6, effects: [E("penaltyDice", "athletics", "2+floor(@deg/2)", { [P]: true })] }),
      stage({ label: "Dépérissement", interval: DAY, firstDelay: DAY, toxicity: 6, effects: [E("penaltyDice", "agility,athletics,endurance", "1+@deg", { [P]: true })] })],
    thresholds: death("endurance"), recovery: recovery({ mode: "permanent", destinyDelay: "3d6" }) },

  { n: "Potion de purge", en: "Wasting Potion", cost: "50 cerfs", delivery: "ingested", virulence: 4, diagnosis: 6, resistBonus: 5,
    d: "Jus de poivre et moutarde jaune, pour expulser un poison ou purger le mauvais sang. Tant qu'elle agit : +5 à la valeur passive d'Endurance contre les poisons et maladies. Chaque round (2 fois), si elle l'emporte : −1D en Athlétisme et en Endurance. Disparaît après un jour.",
    stages: [stage({ interval: ROUND, toxicity: 2, effects: [E("penaltyDice", "athletics,endurance", "1")] })],
    thresholds: [], recovery: recovery({ fadeAfter: DAY }) },

  { n: "Sang de veuve", en: "Widow's Blood", cost: "1000 cerfs", delivery: "ingested", virulence: 5, diagnosis: 9, cureDegrees: 3,
    d: "Paralyse intestins et vessie : la victime se noie lentement dans ses propres poisons. Une seule attaque ; si elle réussit, −1D en Endurance chaque jour jusqu'à la mort (pénalités = Endurance). Un soigneur qui l'a diagnostiqué fait un test de Soins Exigeant (9) : une réussite arrête le mal un jour, trois degrés le guérissent. Guéri, la victime perd un dé de pénalité par jour.",
    stages: [
      stage({ label: "Attaque", interval: HOUR, toxicity: 1, effects: [E("note", "", "", { label: "Le poison s'installe dans le corps." })] }),
      stage({ label: "Dépérissement", interval: DAY, firstDelay: DAY, toxicity: 999, auto: true, requires: 0, effects: [E("penaltyDice", "endurance", "1")] })],
    thresholds: death("endurance"), recovery: recovery({ mode: "periodic", interval: DAY }) },

  { n: "Aconit tue-loup (contact)", en: "Wolfsbane (contact)", cost: "100 cerfs", delivery: "contact", virulence: 3, diagnosis: 6,
    d: "Plante parente du bouton d'or : au toucher, elle brûle et démange. Chaque round (4 fois) : −1D en Agilité et en Endurance par degré. Mort si les pénalités d'Endurance égalent son rang. Ensuite, un dé de moins chaque jour.",
    stages: [stage({ interval: ROUND, toxicity: 4, effects: [E("penaltyDice", "agility,endurance", "@deg")] })],
    thresholds: death("endurance"), recovery: recovery({ mode: "periodic", interval: DAY }) },

  { n: "Aconit tue-loup (ingéré)", en: "Wolfsbane (ingested)", cost: "100 cerfs", delivery: "ingested", virulence: 5, diagnosis: 6,
    d: "Avalé : brûlures, engourdissement, vomissements, puis le pouls et le souffle ralentissent. Chaque round (4 fois) : −2D en Athlétisme, +1D par degré supplémentaire. Chaque heure (4 fois) : −2D en Endurance, +1D par degré supplémentaire. Mort si les pénalités d'Endurance égalent son rang. Ensuite, un dé de moins chaque semaine.",
    stages: [
      stage({ label: "Brûlure", interval: ROUND, toxicity: 4, effects: [E("penaltyDice", "athletics", "1+@deg")] }),
      stage({ label: "Asphyxie", interval: HOUR, firstDelay: HOUR, toxicity: 4, effects: [E("penaltyDice", "endurance", "1+@deg")] })],
    thresholds: death("endurance"), recovery: recovery({ mode: "periodic", interval: WEEK }) },

  /* Alcool : un poison au-delà de la limite (rang d'Endurance en chopes ou coupes, moitié en spiritueux). */
  ...[["Bière ou ale (chope)", "Ale or beer", "beer", "1 sou"], ["Vin (coupe)", "Wine", "wine", "2 sous"], ["Spiritueux (verre)", "Spirits", "spirits", "4 sous"]]
    .map(([n, en, alcohol, cost]) => ({
      n, en, cost, delivery: "ingested", virulence: 0, diagnosis: 0, alcohol,
      d: "Sans danger avec modération. Un personnage boit sans risque autant de chopes ou de coupes que son rang d'Endurance, ou moitié moins de spiritueux ; au-delà, chaque verre ajoute 1 à la Virulence. L'alcool agit 5 minutes après le dernier verre, puis chaque heure : −1D à tous les tests par degré, et +3 aux tests d'Endurance et de Volonté à la première attaque. Pénalités = Endurance : la victime s'écroule 1d6 heures ; le triple : elle meurt. Ensuite, un dé de moins par heure. Toxicité : 2 (bière), 3 (vin), 4 (spiritueux).",
      stages: [stage({ label: "Ivresse", interval: HOUR, firstDelay: 5 * MINUTE, toxicity: { beer: 2, wine: 3, spirits: 4 }[alcohol], effects: [
        E("penaltyDice", "all", "@deg"), E("modifier", "endurance,will", "3", { once: true, always: true, label: "Courage de l'ivrogne" })] })],
      thresholds: [{ ability: "endurance", multiplier: 1, result: "unconscious", hours: "1d6" }, { ability: "endurance", multiplier: 3, result: "death", hours: "" }],
      recovery: recovery({ mode: "periodic", interval: HOUR })
    }))
];
