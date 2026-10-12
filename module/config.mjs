/**
 * Constantes de règles du Trône de Fer JdR (SIFRP, édition Game of Thrones).
 * Les libellés d'interface passent par lang/fr.json ; les catalogues (armes,
 * armures, possessions) portent directement leur nom français car ils servent
 * à créer des objets.
 */
export const ASOIAF = {};

/* -------------------------------------------- */
/*  Capacités & spécialités                     */
/* -------------------------------------------- */

ASOIAF.abilities = {
  agility: ["acrobatics", "balance", "contortions", "dodge", "quickness"],
  animalHandling: ["charm", "drive", "ride", "train"],
  athletics: ["climb", "jump", "run", "strength", "swim", "throw"],
  awareness: ["empathy", "notice"],
  cunning: ["decipher", "logic", "memory"],
  deception: ["act", "bluff", "cheat", "disguise"],
  endurance: ["resilience", "stamina"],
  fighting: ["axes", "bludgeons", "brawling", "fencing", "longBlades", "polearms", "shields", "shortBlades", "spears"],
  healing: ["diagnose", "treatAilment", "treatInjury"],
  knowledge: ["education", "research", "streetwise"],
  language: [],
  marksmanship: ["bows", "crossbows", "siege", "thrown"],
  persuasion: ["bargain", "charm", "convince", "incite", "intimidate", "seduce", "taunt"],
  status: ["breeding", "reputation", "stewardship", "tournaments"],
  stealth: ["blendIn", "sneak"],
  survival: ["forage", "hunt", "orientation", "track"],
  thievery: ["pickLock", "sleightOfHand", "steal"],
  warfare: ["command", "strategy", "tactics"],
  will: ["courage", "coordinate", "dedication"]
};

ASOIAF.difficulties = {
  0: "automatic", 3: "easy", 6: "routine", 9: "challenging",
  12: "formidable", 15: "hard", 18: "veryHard", 21: "heroic"
};

ASOIAF.degrees = ["", "marginal", "great", "incredible", "astonishing"];

ASOIAF.ages = ["youth", "adolescent", "youngAdult", "adult", "middleAge", "old", "veryOld", "venerable"];

/* -------------------------------------------- */
/*  Armes & armures (Tables 9-2 et 9-3)         */
/* -------------------------------------------- */

/** Spécialités utilisables par une arme : clé -> capacité de test. */
ASOIAF.weaponSpecialties = {
  axes: "fighting", bludgeons: "fighting", brawling: "fighting", fencing: "fighting",
  longBlades: "fighting", polearms: "fighting", shields: "fighting", shortBlades: "fighting",
  spears: "fighting", bows: "marksmanship", crossbows: "marksmanship", siege: "marksmanship",
  thrown: "marksmanship"
};

/** [nom, spécialité, entraînement (B), capacité de dégâts, modificateur, qualités, encombrement, bonus défensif] */
const W = (name, specialty, training, damageAbility, damageMod, qualities = "", bulk = 0, defensive = 0) =>
  ({ name, specialty, training, damageAbility, damageMod, qualities, bulk, defensive });

ASOIAF.weapons = [
  W("Hache de bataille", "axes", 0, "athletics", 0, "Adaptable"),
  W("Bec-de-corbin", "axes", 0, "athletics", -1, "Fracassante 1"),
  W("Hachette", "axes", 0, "athletics", -1, "Défensive +1, Main gauche +1", 0, 1),
  W("Hache longue", "axes", 1, "athletics", 3, "Encombrante 1, Puissante, Allonge, Deux mains, Vicieuse", 1),
  W("Pioche", "axes", 0, "athletics", 1, "Puissante, Lente, Deux mains"),
  W("Hache de bûcheron", "axes", 0, "athletics", 1, "Deux mains"),
  W("Fléau à boule", "bludgeons", 1, "athletics", 0, "Puissante, Fracassante 1"),
  W("Gourdin", "bludgeons", 0, "athletics", -1, "Main gauche +1"),
  W("Fléau d'armes", "bludgeons", 2, "athletics", 3, "Puissante, Fracassante 1, Deux mains"),
  W("Masse", "bludgeons", 0, "athletics", 0, ""),
  W("Maillet", "bludgeons", 0, "athletics", 1, "Encombrante 1, Fracassante 1, Lente, Étourdissante, Deux mains", 1),
  W("Morgenstern", "bludgeons", 0, "athletics", 0, "Fracassante 1, Vicieuse"),
  W("Bâton", "bludgeons", 0, "athletics", 0, "Rapide, Deux mains"),
  W("Marteau de guerre", "bludgeons", 0, "athletics", 0, "Encombrante 1, Puissante, Fracassante 2, Lente, Deux mains", 1),
  W("Poing", "brawling", 0, "athletics", -3, "Saisie, Main gauche +1"),
  W("Gantelet", "brawling", 0, "athletics", -2, "Saisie, Main gauche +1"),
  W("Arme improvisée", "brawling", 0, "athletics", -1, "Lente"),
  W("Couteau", "brawling", 0, "athletics", -2, "Rapide, Main gauche +1"),
  W("Fouet", "brawling", 2, "agility", -1, "Entravante, Allonge"),
  W("Lame braavienne", "fencing", 1, "agility", 0, "Défensive +1, Rapide", 0, 1),
  W("Dague main gauche", "fencing", 1, "agility", -1, "Défensive +2, Main gauche +1", 0, 2),
  W("Épée de cour", "fencing", 0, "agility", -1, "Rapide"),
  W("Arakh", "longBlades", 1, "athletics", 0, "Adaptable, Rapide"),
  W("Épée bâtarde", "longBlades", 1, "athletics", 1, "Adaptable"),
  W("Épée à deux mains", "longBlades", 0, "athletics", 3, "Puissante, Lente, Deux mains, Malcommode, Vicieuse"),
  W("Épée longue", "longBlades", 0, "athletics", 1, ""),
  W("Hallebarde", "polearms", 1, "athletics", 3, "Encombrante 1, Puissante, Deux mains", 1),
  W("Outil paysan", "polearms", 0, "athletics", 2, "Fragile, Deux mains, Malcommode"),
  W("Hache d'armes", "polearms", 1, "athletics", 3, "Encombrante 1, Puissante, Allonge, Deux mains, Malcommode", 1),
  W("Rondache", "shields", 0, "athletics", -2, "Défensive +1, Main gauche +1", 0, 1),
  W("Bouclier", "shields", 0, "athletics", -2, "Défensive +2", 0, 2),
  W("Grand bouclier", "shields", 1, "athletics", -2, "Encombrante 1, Défensive +4", 1, 4),
  W("Pavois", "shields", 2, "athletics", -2, "Encombrante 2, Défensive +6", 2, 6),
  W("Dague", "shortBlades", 0, "agility", -2, "Défensive +1, Main gauche +1", 0, 1),
  W("Poignard", "shortBlades", 0, "agility", -2, "Main gauche +2"),
  W("Stylet", "shortBlades", 1, "agility", 0, "Perforante 2"),
  W("Épieu", "spears", 1, "athletics", 1, "Empalement, Puissante, Lente, Deux mains"),
  W("Fourche à grenouilles", "spears", 1, "agility", 1, "Adaptable"),
  W("Pique", "spears", 0, "athletics", 2, "Empalement, Contre-charge, Lente, Deux mains, Malcommode"),
  W("Lance", "spears", 0, "athletics", 0, "Rapide"),
  W("Lance de tournoi", "spears", 1, "animalHandling", 3, "Encombrante 1, Fragile, Montée, Puissante, Allonge, Lente", 1),
  W("Trident", "spears", 0, "athletics", 0, "Adaptable, Lente"),
  W("Lance de guerre", "spears", 1, "animalHandling", 4, "Encombrante 2, Empalement, Montée, Puissante, Lente, Vicieuse", 2),
  W("Arc recourbé", "bows", 1, "agility", 1, "Longue portée, Puissante, Deux mains"),
  W("Arc de chasse", "bows", 0, "agility", 0, "Longue portée, Deux mains"),
  W("Arc long", "bows", 1, "agility", 2, "Longue portée, Perforante 1, Deux mains, Malcommode"),
  W("Arbalète lourde", "crossbows", 0, "agility", 2, "Longue portée, Perforante 2, Rechargement (majeure), Lente, Deux mains, Vicieuse"),
  W("Arbalète légère", "crossbows", 0, "agility", 1, "Longue portée, Rechargement (mineure), Lente"),
  W("Arbalète moyenne", "crossbows", 0, "agility", 1, "Longue portée, Perforante 1, Rechargement (mineure), Lente, Deux mains"),
  W("Arbalète myriote", "crossbows", 1, "agility", 1, "Rapide, Longue portée, Perforante 1, Rechargement (mineure), Deux mains"),
  W("Fourche à grenouilles (lancer)", "thrown", 1, "agility", 1, "Courte portée"),
  W("Hachette (lancer)", "thrown", 0, "athletics", 0, "Courte portée"),
  W("Javelot", "thrown", 0, "athletics", 0, "Courte portée"),
  W("Couteau (lancer)", "thrown", 0, "agility", -1, "Courte portée, Rapide"),
  W("Filet", "thrown", 1, "none", 0, "Courte portée, Entravante"),
  W("Fronde", "thrown", 0, "athletics", -1, "Longue portée"),
  W("Lance (lancer)", "thrown", 0, "athletics", 0, "Courte portée"),
  W("Trident (lancer)", "thrown", 0, "athletics", 0, "Courte portée")
];

/** [nom, VA (protection), pénalité, encombrement] */
ASOIAF.armors = [
  ["Vêtements", 0, 0, 0], ["Robes, habits", 1, 0, 1], ["Matelassée", 1, 0, 0],
  ["Cuir souple", 2, -1, 0], ["Cuir bouilli", 3, -2, 0], ["Os ou bois", 4, -3, 1],
  ["Anneaux", 4, -2, 1], ["Peaux", 5, -3, 3], ["Maille", 5, -3, 2], ["Cuirasse", 5, -2, 3],
  ["Écailles", 6, -3, 2], ["Lamelles", 7, -3, 3], ["Brigandine", 8, -4, 3],
  ["Demi-plate", 9, -5, 3], ["Plate complète", 10, -6, 3]
].map(([name, rating, penalty, bulk]) => ({ name, rating, penalty, bulk }));

/* -------------------------------------------- */
/*  Maison & Terres (Chapitre 6)                */
/* -------------------------------------------- */

ASOIAF.resources = ["defense", "influence", "lands", "law", "population", "power", "wealth"];

/** Modificateurs de royaume (Table 6-2), dans l'ordre de ASOIAF.resources. */
ASOIAF.realms = {
  kingsLanding: { roll: [3, 3], mods: [5, -5, -5, 20, 5, -5, -5] },
  dragonstone: { roll: [4, 4], mods: [20, -5, -5, 5, 0, 0, -5] },
  north: { roll: [5, 6], mods: [5, 10, 20, -10, -5, -5, -5] },
  ironIslands: { roll: [7, 7], mods: [10, -5, -5, 0, 0, 10, 0] },
  riverlands: { roll: [8, 9], mods: [-5, -5, 5, 0, 10, 0, 5] },
  mountainsOfTheMoon: { roll: [10, 11], mods: [20, 10, -5, -10, -5, 0, 0] },
  westerlands: { roll: [12, 13], mods: [-5, 10, -5, -5, -5, 0, 20] },
  reach: { roll: [14, 15], mods: [-5, 10, 0, -5, 5, 0, 5] },
  stormlands: { roll: [16, 17], mods: [5, 0, -5, 10, -5, 5, 0] },
  dorne: { roll: [18, 18], mods: [0, -5, 10, -5, 0, 10, 0] }
};

/** Première fondation (Table 6-3) : formule du nombre d'événements historiques. */
ASOIAF.foundings = {
  ancient: "1d6+3", veryOld: "1d6+2", old: "1d6+1",
  established: "1d6", recent: "1d6-1", new: "1d6-2"
};

/** Événements historiques (Table 6-4), résultat 3d6 -> effets par ressource. */
ASOIAF.historicalEvents = {
  doom: { roll: 3, mods: ["-2d6", "-2d6", "-2d6", "-2d6", "-2d6", "-2d6", "-2d6"] },
  defeat: { roll: 4, mods: ["-1d6", "-1d6", "-1d6", "", "-1d6", "-1d6", "-1d6"] },
  catastrophe: { roll: 5, mods: ["", "", "", "-1d6", "-1d6", "-1d6", "-1d6"] },
  madness: { roll: 6, mods: ["6-2d6", "6-2d6", "6-2d6", "6-2d6", "6-2d6", "6-2d6", "6-2d6"] },
  invasion: { roll: 7, mods: ["", "", "", "-2d6", "-1d6", "-1d6", "-1d6"] },
  scandal: { roll: 8, mods: ["", "-1d6", "-1d6", "", "", "-1d6", ""] },
  treachery: { roll: 9, mods: ["", "-1d6", "", "-1d6", "", "1d6", ""] },
  decline: { roll: 10, mods: ["", "-1d6", "-1d6", "", "", "-1d6", "-1d6"] },
  infrastructure: { roll: 11, mods: null, choose: 2 },
  ascent: { roll: 12, mods: ["", "1d6", "1d6", "", "", "1d6", "1d6"] },
  favor: { roll: 13, mods: ["", "1d6", "1d6", "1d6", "", "1d6", ""] },
  victory: { roll: 14, mods: ["1d6", "1d6", "", "", "", "1d6", ""] },
  villain: { roll: 15, mods: ["", "1d6", "", "-1d6", "-1d6", "1d6", ""] },
  glory: { roll: 16, mods: ["1d6", "1d6", "", "1d6", "", "1d6", ""] },
  conquest: { roll: 17, mods: ["-1d6", "1d6", "1d6", "-1d6", "1d6", "", "1d6"] },
  windfall: { roll: 18, mods: ["1d6", "2d6", "1d6", "1d6", "1d6", "2d6", "2d6"] }
};

/** Statut maximal du seigneur selon l'Influence (Table 6-5). */
ASOIAF.influenceStatus = [[10, 2], [20, 3], [40, 4], [50, 5], [60, 6], [70, 7], [Infinity, 8]];

/** Modificateurs de Fortune selon la Loi et la Population. [plafond, modificateur] */
ASOIAF.lawFortune = [[0, -20], [10, -10], [20, -5], [30, -2], [40, -1], [50, 0], [60, 1], [70, 2], [Infinity, 5]];
ASOIAF.populationFortune = [[0, -10], [10, -5], [20, 0], [30, 1], [40, 3], [50, 1], [60, 0], [70, -5], [Infinity, -10]];

/** Fortunes de la Maison (Table 6-18) : [résultat max, fortune]. */
ASOIAF.houseFortunes = [
  [2, "disaster"], [3, "curse"], [4, "decline"], [5, "disaster"], [6, "growth"], [7, "decline"],
  [8, "growth"], [9, "curse"], [10, "decline"], [11, "growth"], [12, "boon"], [13, "decline"],
  [14, "blessing"], [15, "growth"], [16, "curse"], [17, "decline"], [18, "blessing"], [19, "curse"],
  [20, "blessing"], [22, "growth"], [23, "curse"], [25, "growth"], [27, "blessing"], [28, "boon"],
  [29, "curse"], [30, "blessing"], [34, "growth"], [35, "blessing"], [36, "boon"], [41, "growth"],
  [Infinity, "boon"]
];

/** Gestion des ressources (Table 6-19) : source -> cibles, taux normal, taux précipité. */
ASOIAF.resourceExchange = {
  influence: { to: ["law"], rate: 1, rushed: 2 },
  lands: { to: ["defense"], rate: 1, rushed: 2 },
  population: { to: ["power"], rate: 1, rushed: 2 },
  power: { to: ["influence", "law", "population"], rate: 1, rushed: 2 },
  wealth: { to: ["defense", "influence", "lands", "law", "population", "power"], rate: 2, rushed: 3 }
};

/** Bandes de description des ressources : 0, 1-10, 11-20 ... 61-70, 71+. */
ASOIAF.resourceBand = value => {
  if (value <= 0) return 0;
  return Math.min(Math.ceil(value / 10), 7);
};

/* Possessions : catalogue pour la création rapide. */
ASOIAF.holdingCatalog = {
  defense: [
    { name: "Château supérieur", cost: 50, time: "144+10d6", defenseBonus: 12 },
    { name: "Château", cost: 40, time: "96+10d6", defenseBonus: 8 },
    { name: "Petit château", cost: 30, time: "72+10d6", defenseBonus: 6 },
    { name: "Fort (hall)", cost: 20, time: "60+10d6", defenseBonus: 4 },
    { name: "Tour", cost: 10, time: "36+10d6", defenseBonus: 3 }
  ],
  influence: [
    { name: "Héritier (premier-né)", cost: 20, heirStatus: 1 },
    { name: "Second enfant / première fille", cost: 10, heirStatus: 2 },
    { name: "Autre enfant", cost: 5, heirStatus: 3 }
  ],
  wealth: [
    { name: "Artisan", cost: 10, time: "2d6", fortune: "", requirement: "Fort ou plus grand", type: "artisan" },
    { name: "Bois sacré", cost: 5, time: "24+2d6", fortune: "2d6-6", requirement: "Royaume : le Nord" },
    { name: "Port", cost: 10, time: "3d6", fortune: "5", requirement: "Côte" },
    { name: "Septuaire", cost: 15, time: "12+2d6", fortune: "3", requirement: "Fort ou petite ville" },
    { name: "Guildes", cost: 15, time: "2d6", fortune: "", requirement: "Petite ville ou plus" },
    { name: "Mestre", cost: 10, time: "1d6", fortune: "3", requirement: "Influence 20+" },
    { name: "Marché", cost: 10, time: "1d6", fortune: "", requirement: "Petite ville ou plus" },
    { name: "Mine", cost: 10, time: "24+2d6", fortune: "5", requirement: "Collines ou montagnes" }
  ]
};

/** Bannerets : 20 pour le premier, 10 pour le second, 5 ensuite. */
ASOIAF.bannerCost = index => (index === 0 ? 20 : index === 1 ? 10 : 5);

/** Domaines (Tables 6-6 et 6-7). */
ASOIAF.terrains = { hills: 7, mountains: 9, plains: 5, wetlands: 3 };
ASOIAF.features = {
  coast: 3, hamlet: 10, smallTown: 20, largeTown: 30, smallCity: 40, largeCity: 50,
  grassland: 1, island: 10, road: 5, ruin: 3, stream: 1, river: 3, pond: 5, lake: 7,
  lightWoods: 3, denseWoods: 5
};

/** Unités (Table 6-8). */
ASOIAF.unitTraining = {
  green: { cost: 1, discipline: 9, xp: 20 },
  trained: { cost: 3, discipline: 6, xp: 60 },
  veteran: { cost: 5, discipline: 3, xp: 100 },
  elite: { cost: 7, discipline: 0, xp: 140 }
};
ASOIAF.unitTypes = {
  archers: { cost: 3, discipline: 3, abilities: ["agility", "awareness", "marksmanship"] },
  cavalry: { cost: 5, discipline: -3, abilities: ["agility", "animalHandling", "fighting"] },
  criminals: { cost: 1, discipline: 6, abilities: ["endurance", "fighting", "stealth"] },
  crusaders: { cost: 4, discipline: 0, abilities: ["athletics", "endurance", "fighting"] },
  engineers: { cost: 2, discipline: 3, abilities: ["endurance", "fighting", "warfare"] },
  garrison: { cost: 2, discipline: -3, abilities: ["awareness", "endurance", "fighting"] },
  guerillas: { cost: 2, discipline: 3, abilities: ["athletics", "marksmanship", "stealth"] },
  infantry: { cost: 4, discipline: 0, abilities: ["athletics", "endurance", "fighting"] },
  mercenaries: { cost: 1, discipline: 3, abilities: ["athletics", "endurance", "fighting"] },
  levies: { cost: 0, discipline: 6, abilities: ["animalHandling", "awareness", "survival"] },
  personalGuard: { cost: 6, discipline: -6, abilities: ["athletics", "endurance", "fighting"] },
  raiders: { cost: 3, discipline: 3, abilities: ["agility", "endurance", "fighting"] },
  sailors: { cost: 4, discipline: 0, abilities: ["agility", "awareness", "fighting"] },
  scouts: { cost: 2, discipline: 3, abilities: ["awareness", "endurance", "stealth"] },
  special: { cost: 4, discipline: 0, abilities: [] },
  support: { cost: 2, discipline: 3, abilities: ["animalHandling", "endurance", "healing"] },
  warships: { cost: 7, discipline: 0, abilities: ["awareness", "fighting", "marksmanship"] }
};
/** Coût en Richesse des mercenaires par niveau d'entraînement. */
ASOIAF.mercenaryWealth = { green: 1, trained: 3, veteran: 6, elite: 9 };

ASOIAF.houseRoles = [
  "lord", "lady", "heir", "child", "castellan", "steward", "maester", "septon",
  "masterAtArms", "masterOfHorse", "masterOfTheHunt", "kennelmaster", "knight", "ward", "retainer"
];

/**
 * Artisans (règle maison) : jet de métier mensuel à Difficulté 9 ;
 * réussite = degrés + 5 points de budget (max 10) ; 1 XP par degré.
 */
ASOIAF.artisan = {
  difficulty: 9,
  maxBudget: 10,
  successBonus: 5,
  leadXpBonus: 2,
  rankXp: 30,
  productionXp: 50,
  resourceCost: 2,
  dragonCost: 500,
  borrowedWealth: -2,
  lentWealth: 1
};

/* -------------------------------------------- */
/*  Guerre (Chapitre 10)                        */
/* -------------------------------------------- */

/**
 * Équipement des unités (Tables 10-1 et 10-2) : [VA, pénalité, encombrement, dégâts de Combat, dégâts de Tir].
 * Dégâts : [capacité, modificateur] ; tir : [capacité, modificateur, portée] ou null.
 */
const EQ = (ar, penalty, bulk, fight, shoot = null) => ({ ar, penalty, bulk, fight, shoot });
ASOIAF.unitEquipment = {
  archers: { base: EQ(2, -1, 0, ["athletics", -1], ["agility", 2, "long"]), upgrade: EQ(3, -2, 0, ["athletics", 0], ["agility", 3, "long"]) },
  cavalry: { base: EQ(5, -3, 2, ["animalHandling", 3]), upgrade: EQ(9, -5, 3, ["animalHandling", 5]), shields: true },
  criminals: { base: EQ(1, 0, 0, ["athletics", 1]), upgrade: EQ(4, -2, 1, ["athletics", 2]) },
  crusaders: { base: EQ(3, -2, 0, ["athletics", 1]), upgrade: EQ(4, -2, 1, ["athletics", 2]), shields: true },
  engineers: { base: EQ(2, -1, 0, ["athletics", -1]), upgrade: EQ(5, -3, 2, ["athletics", 0]) },
  garrison: { base: EQ(3, -2, 0, ["athletics", 1]), upgrade: EQ(5, -3, 2, ["athletics", 2]) },
  guerillas: { base: EQ(1, 0, 0, ["athletics", 0], ["agility", 1, "close"]), upgrade: EQ(3, -2, 0, ["athletics", 1], ["agility", 2, "close"]) },
  infantry: { base: EQ(3, -2, 0, ["athletics", 1]), upgrade: EQ(4, -2, 1, ["athletics", 2]), shields: true },
  mercenaries: { base: EQ(4, -2, 1, ["athletics", 1]), upgrade: EQ(5, -3, 2, ["athletics", 3]), shields: true },
  levies: { base: EQ(0, 0, 0, ["athletics", -1], ["athletics", -1, "close"]), upgrade: EQ(2, -1, 0, ["athletics", 0], ["athletics", 0, "close"]) },
  personalGuard: { base: EQ(6, -3, 2, ["athletics", 1]), upgrade: EQ(10, -6, 3, ["athletics", 2]), shields: true },
  raiders: { base: EQ(2, -1, 0, ["athletics", 1]), upgrade: EQ(5, -2, 2, ["athletics", 2]) },
  sailors: { base: EQ(0, 0, 0, ["athletics", 1]), upgrade: EQ(2, -1, 0, ["athletics", 2]) },
  scouts: { base: EQ(2, -1, 0, ["athletics", 0], ["agility", 0, "long"]), upgrade: EQ(3, -2, 0, ["athletics", 1], ["agility", 1, "long"]) },
  special: { base: EQ(2, -1, 0, ["athletics", 0], ["agility", 0, "both"]), upgrade: EQ(6, -3, 2, ["athletics", 1], ["agility", 1, "both"]) },
  support: { base: EQ(0, 0, 0, ["athletics", -1]), upgrade: EQ(2, -1, 0, ["athletics", 0]) },
  warships: { base: EQ(5, 0, 0, ["athletics", 1], ["agility", 1, "long"]), upgrade: EQ(10, 0, 0, ["athletics", 4], ["agility", 3, "long"]) }
};

/** Portées de tir des unités, en mètres (le livre compte en yards ; 1 case = 10). */
ASOIAF.unitRanges = { close: 20, long: 200, both: 200 };

/** Ordres de bataille. persistent : devient un ordre permanent. */
ASOIAF.unitOrders = {
  attack: { persistent: true, attack: true },
  charge: { persistent: true, attack: true, penaltyDice: 1, damage: 2 },
  defend: { persistent: true },
  withdraw: { persistent: true, attack: true, penaltyDice: 1 },
  move: { persistent: false },
  organize: { persistent: false },
  rally: { persistent: false },
  regroup: { persistent: false },
  ready: { persistent: true },
  retreat: { persistent: true },
  surrender: { persistent: false }
};

/** Dégâts subis par un personnage rattaché selon ce qui arrive à son unité. */
ASOIAF.attachedDamage = { damaged: 1, disorganized: 2, routed: 5, destroyed: 10 };

/**
 * Survivants (Table 10-6) : résultat du d6 (≤0 à 6) -> variation d'entraînement, ou "destroyed".
 * On retire 1 au d6 par désorganisation au-delà de la première.
 */
ASOIAF.unitSurvivors = {
  none: [-2, -1, 0, 0, 0, 1, 2],
  damaged: [-2, -1, 0, 0, 0, 0, 1],
  disorganized: [-3, -3, -2, -1, 0, 0, 0],
  routed: ["destroyed", "destroyed", -3, -2, -1, 0, 0],
  destroyed: ["destroyed", "destroyed", "destroyed", -3, -2, -1, 0]
};
ASOIAF.trainingOrder = ["green", "trained", "veteran", "elite"];

/**
 * Engins de siège (chapitre 10). Portées et déplacements en mètres (le livre compte en yards).
 * damage : dégâts par munition ; ignore : munitions qui ignorent la VA ; burn : munitions incendiaires.
 * smash : Athlétisme effectif contre murailles et portes.
 */
ASOIAF.siegeEngines = {
  catapultSmall: { cost: { wealth: 1 }, health: 10, ar: 5, move: 0, range: 300, smash: 5, damage: { stone: 3, pitch: 3, wildfire: 7 } },
  catapultMedium: { cost: { wealth: 2 }, health: 20, ar: 5, move: 0, range: 400, smash: 7, damage: { stone: 5, pitch: 5, wildfire: 7 } },
  catapultLarge: { cost: { wealth: 4 }, health: 40, ar: 5, move: 0, range: 500, smash: 9, damage: { stone: 7, pitch: 7, wildfire: 7 } },
  mangonel: { cost: { wealth: 3 }, health: 20, ar: 3, move: 10, range: 200, smash: 10, damage: { stone: 6, pitch: 6 }, vsUnitPenalty: 1 },
  scorpion: { cost: { wealth: 1 }, health: 10, ar: 1, move: 10, range: 500, damage: { bolt: 3 }, vsCharacter: { penalty: 1, damage: 10 } },
  spitfire: { cost: { wealth: 2 }, health: 20, ar: 2, move: 10, range: 200, damage: { oil: 3, wildfire: 7 } },
  trebuchet: { cost: { wealth: 4 }, health: 40, ar: 4, move: 0, range: 500, smash: 12, damage: { stone: 7 } },
  siegeTower: { cost: { wealth: 2 }, health: 20, ar: 8, move: 10, range: 0, carries: true, shelterDefense: 5 },
  coveredRam: { cost: { lands: 2 }, health: 20, ar: 8, move: 10, range: 0, smash: 8, crew: true, shelterDefense: 5 }
};
/** Munitions qui ignorent la VA, et munitions incendiaires (feu grégeois : 2d6 rounds). */
ASOIAF.siegeAmmo = {
  stone: { ignore: false }, bolt: { ignore: true }, pitch: { ignore: true, cost: { wealth: 0.5 } }, oil: { ignore: true },
  wildfire: { ignore: true, burn: "2d6", cost: { wealth: 5 } }
};

/** Équipements spéciaux des unités : coût et effets. */
ASOIAF.unitGear = {
  ram: { cost: { lands: 1 }, noAttack: true },
  mantlet: { cost: { wealth: 1 }, move: -10, shootDefense: 5 },
  ladders: { cost: { wealth: 0.5 }, noAttack: true },
  turtle: { cost: { wealth: 1 }, setMove: 10, defense: 10, noAttack: true },
  wildfire: { cost: { wealth: 5 }, discipline: 3 }
};

/** Huile et eau bouillantes (½ Richesse par utilisation) : dégâts qui ignorent la VA. */
ASOIAF.boiling = { water: 5, oil: 10 };

/** Feu grégeois : dégâts par round, durée de l'incendie, contagion d'une unité en déroute. */
ASOIAF.wildfire = { damage: 7, rounds: "2d6", spreadDamage: 3, spreadRounds: "1d6" };


/** Utilitaire : trouve la valeur associée au premier palier >= value. */
ASOIAF.lookup = (table, value) => table.find(([max]) => value <= max)[1];
