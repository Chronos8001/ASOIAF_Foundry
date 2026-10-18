/**
 * Construit les compendiums (format LevelDB de Foundry) à partir de tools/qualities.mjs et tools/equipment.mjs.
 * Usage : npm install && npm run build:packs
 * Sortie : packs/benefits, packs/drawbacks, packs/equipment et packs/poisons
 * (ignorés par git, construits par le workflow de publication).
 */
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { BENEFITS, BENEFIT_CATEGORIES, DRAWBACKS, FLAWS } from "./qualities.mjs";
import { ARMOR_COSTS, EQUIPMENT, EXOTIC_WEAPONS, POISONS, WEAPON_COSTS } from "./equipment.mjs";
import { ASOIAF } from "../module/config.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "build", "packs-src");
const OUT = path.join(ROOT, "packs");

const ICONS = {
  ability: "icons/svg/book.svg",
  fate: "icons/svg/eye.svg",
  heritage: "icons/svg/aura.svg",
  martial: "icons/svg/sword.svg",
  social: "icons/svg/sun.svg",
  drawback: "icons/svg/skull.svg",
  flaw: "icons/svg/daze.svg"
};

/** Identifiant Foundry stable (16 caractères alphanumériques). */
const id = seed => createHash("sha1").update(seed).digest("hex").slice(0, 16);

const modifiers = effects => effects.map(([type, target, value, situational = false, label = "", condition = ""]) => ({
  type, target, value: String(value), situational, condition, label
}));

const description = q => `${q.d}\n\n(VO : ${q.en})`;

function folder(name, seed, sort) {
  const _id = id(`folder:${seed}`);
  return { _id, _key: `!folders!${_id}`, name, type: "Item", folder: null, sorting: "a", sort, color: null, description: "", flags: {} };
}

function item({ seed, name, type, img, folderId, system, sort }) {
  const _id = id(`${type}:${seed}`);
  return {
    _id, _key: `!items!${_id}`, name, type, img, folder: folderId, sort,
    system, effects: [], ownership: { default: 0 }, flags: {}
  };
}

async function writeDocs(dir, docs) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const doc of docs) {
    const kind = doc._key.startsWith("!folders!") ? "folder" : "item";
    await writeFile(path.join(dir, `${kind}_${doc._id}.json`), JSON.stringify(doc, null, 2));
  }
}

/* Avantages, rangés par catégorie. */
const benefitDocs = [];
const folders = {};
Object.entries(BENEFIT_CATEGORIES).forEach(([key, label], i) => {
  const f = folder(label, `benefit:${key}`, i * 100);
  folders[key] = f._id;
  benefitDocs.push(f);
});
BENEFITS.forEach((q, i) => benefitDocs.push(item({
  seed: q.en, name: q.n, type: "benefit", img: ICONS[q.c], folderId: folders[q.c], sort: i * 10,
  system: {
    description: description(q), category: BENEFIT_CATEGORIES[q.c], requirements: q.r,
    destinyCost: 1, repeatable: !!q.rep, modifiers: modifiers(q.e)
  }
})));

/* Handicaps, et défauts dans un dossier à part. */
const drawbackDocs = [];
const flawFolder = folder("Défauts", "drawback:flaws", 100);
const mainFolder = folder("Handicaps", "drawback:main", 0);
drawbackDocs.push(mainFolder, flawFolder);
DRAWBACKS.forEach((q, i) => drawbackDocs.push(item({
  seed: q.en, name: q.n, type: "drawback", img: ICONS.drawback, folderId: mainFolder._id, sort: i * 10,
  system: {
    description: description(q), category: "Handicap", requirements: q.r,
    isFlaw: q.en === "Flaw", flawAbility: "", flawDice: 1, modifiers: modifiers(q.e)
  }
})));
FLAWS.forEach(([name, en, ability], i) => drawbackDocs.push(item({
  seed: `flaw:${en}:${ability}`, name: `Défaut : ${name}`, type: "drawback", img: ICONS.flaw, folderId: flawFolder._id, sort: i * 10,
  system: {
    description: `-1D à tous les tests de cette capacité ; pour les résultats passifs et les valeurs dérivées, elle compte un rang de moins.\n\n(VO : Flaw — ${en})`,
    category: "Défaut", requirements: "", isFlaw: true, flawAbility: "", flawDice: 1,
    modifiers: modifiers([["penaltyDice", ability, 1]])
  }
})));

/* Équipement (chapitre 7) : armes, armures, puis une catégorie par dossier. */
const equipmentDocs = [];
const EQUIPMENT_FOLDERS = {
  melee: "Armes de mêlée", ranged: "Armes à distance", shields: "Boucliers", armor: "Armures",
  gear: "Équipement personnel", ammunition: "Munitions", tools: "Outils", clothing: "Vêtements",
  instrument: "Instruments de musique", food: "Nourriture et gîte", mount: "Montures", barding: "Bardes",
  vehicle: "Véhicules", tradeGood: "Marchandises"
};
const EQUIPMENT_ICONS = {
  gear: "icons/svg/item-bag.svg", ammunition: "icons/svg/target.svg", tools: "icons/svg/chest.svg",
  clothing: "icons/svg/mystery-man.svg", instrument: "icons/svg/sound.svg", food: "icons/svg/house.svg",
  mount: "icons/svg/pawprint.svg", barding: "icons/svg/shield.svg", vehicle: "icons/svg/item-bag.svg", tradeGood: "icons/svg/coins.svg"
};
const eqFolders = {};
Object.entries(EQUIPMENT_FOLDERS).forEach(([key, label], i) => {
  const f = folder(label, `equipment:${key}`, i * 100);
  eqFolders[key] = f._id;
  equipmentDocs.push(f);
});
const physical = (cost = "", weight = 0, description = "") => ({ description, quantity: 1, cost, bulk: 0, weight, equipped: false });
const weaponFolder = w => w.specialty === "shields" ? "shields" : ASOIAF.weaponSpecialties[w.specialty] === "marksmanship" ? "ranged" : "melee";
[...ASOIAF.weapons, ...EXOTIC_WEAPONS.filter(w => !w.equipment)].forEach((w, i) => {
  const [cost, weight] = WEAPON_COSTS[w.name] ?? [w.cost ?? "", w.weight ?? 0];
  equipmentDocs.push(item({
    seed: `weapon:${w.name}`, name: w.name, type: "weapon", img: w.specialty === "shields" ? "icons/svg/shield.svg" : "icons/svg/sword.svg",
    folderId: eqFolders[weaponFolder(w)], sort: i * 10,
    system: {
      ...physical(cost, weight, w.description ?? ""), bulk: w.bulk ?? 0,
      specialty: w.specialty, training: w.training, damageAbility: w.damageAbility, damageMod: w.damageMod,
      qualities: w.qualities, defensive: w.defensive ?? 0,
      piercing: w.piercing ?? Number(w.qualities.match(/Perforante\s*(\d+)/)?.[1] ?? 0), grade: "common"
    }
  }));
});
ASOIAF.armors.forEach((a, i) => {
  const [cost, weight] = ARMOR_COSTS[a.name] ?? ["", 0];
  equipmentDocs.push(item({
    seed: `armor:${a.name}`, name: a.name, type: "armor", img: "icons/svg/shield.svg", folderId: eqFolders.armor, sort: i * 10,
    system: { ...physical(cost, weight), rating: a.rating, penalty: a.penalty, bulk: a.bulk }
  }));
});
const goods = Object.entries(EQUIPMENT).flatMap(([category, list]) => list.map(g => ({ ...g, category })));
for (const w of EXOTIC_WEAPONS.filter(w => w.equipment)) goods.push(w);
goods.forEach((g, i) => equipmentDocs.push(item({
  seed: `equipment:${g.category}:${g.name}`, name: g.name, type: "equipment", img: EQUIPMENT_ICONS[g.category] ?? "icons/svg/item-bag.svg",
  folderId: eqFolders[g.category], sort: i * 10,
  system: { ...physical(g.cost, g.weight, g.description), category: g.category }
})));

/* Poisons et drogues : poisons, remèdes et drogues, alcool. */
const poisonDocs = [];
const poisonFolders = {
  poison: folder("Poisons", "poisons:poison", 0),
  remedy: folder("Remèdes et drogues", "poisons:remedy", 100),
  alcohol: folder("Alcool", "poisons:alcohol", 200)
};
poisonDocs.push(...Object.values(poisonFolders));
const REMEDIES = ["Firemilk", "Milk of the Poppy", "Milk of the Poppy, Large Dose", "Myrish Fire", "Sweetsleep, Grains",
  "Sweetsleep, Pinch", "Wasting Potion", "Pennyroyal, Mild", "Tansy, Mild"];
POISONS.forEach((q, i) => {
  const group = q.alcohol ? "alcohol" : REMEDIES.includes(q.en) ? "remedy" : "poison";
  poisonDocs.push(item({
    seed: `poison:${q.en}`, name: q.n, type: "poison", img: q.alcohol ? "icons/svg/barrel.svg" : "icons/svg/poison.svg",
    folderId: poisonFolders[group]._id, sort: i * 10,
    system: {
      ...physical(q.cost, 0, description(q)),
      delivery: q.delivery, virulence: q.virulence, diagnosis: q.diagnosis, resistBonus: q.resistBonus ?? 0,
      cureDegrees: q.cureDegrees ?? 0, alcohol: q.alcohol ?? "", stages: q.stages, thresholds: q.thresholds,
      recovery: q.recovery, active: false, state: {}
    }
  }));
});

for (const [name, docs] of [["benefits", benefitDocs], ["drawbacks", drawbackDocs], ["equipment", equipmentDocs], ["poisons", poisonDocs]]) {
  const src = path.join(SRC, name);
  await writeDocs(src, docs);
  await rm(path.join(OUT, name), { recursive: true, force: true });
  await compilePack(src, path.join(OUT, name), { log: false });
  console.log(`${name} : ${docs.filter(d => d._key.startsWith("!items!")).length} objets`);
}
