/**
 * Construit les compendiums (format LevelDB de Foundry) à partir de tools/qualities.mjs.
 * Usage : npm install && npm run build:packs
 * Sortie : packs/benefits et packs/drawbacks (ignorés par git, construits par le workflow de publication).
 */
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { BENEFITS, BENEFIT_CATEGORIES, DRAWBACKS, FLAWS } from "./qualities.mjs";

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

for (const [name, docs] of [["benefits", benefitDocs], ["drawbacks", drawbackDocs]]) {
  const src = path.join(SRC, name);
  await writeDocs(src, docs);
  await rm(path.join(OUT, name), { recursive: true, force: true });
  await compilePack(src, path.join(OUT, name), { log: false });
  console.log(`${name} : ${docs.filter(d => d._key.startsWith("!items!")).length} qualités`);
}
