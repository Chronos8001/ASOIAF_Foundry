/**
 * Le Trône de Fer JdR (A Song of Ice and Fire Roleplaying) pour Foundry VTT.
 */
import { ASOIAF } from "./config.mjs";
import { CharacterData } from "./data/character.mjs";
import { HouseData } from "./data/house.mjs";
import * as ItemModels from "./data/items.mjs";
import { AsoiafActor, AsoiafCombatant } from "./documents/actor.mjs";
import { CharacterSheet } from "./sheets/character-sheet.mjs";
import { HouseSheet } from "./sheets/house-sheet.mjs";
import { AsoiafItemSheet } from "./sheets/item-sheet.mjs";
import { bindChatButtons, rollTest } from "./dice.mjs";

const DEFAULT_ICONS = {
  weapon: "icons/svg/sword.svg",
  armor: "icons/svg/shield.svg",
  equipment: "icons/svg/item-bag.svg",
  benefit: "icons/svg/sun.svg",
  drawback: "icons/svg/skull.svg",
  holding: "icons/svg/tower.svg",
  domain: "icons/svg/mountain.svg",
  unit: "icons/svg/combat.svg"
};

class AsoiafItem extends Item {
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    if (!data.img || data.img === Item.DEFAULT_ICON) this.updateSource({ img: DEFAULT_ICONS[this.type] ?? Item.DEFAULT_ICON });
  }
}

Hooks.once("init", () => {
  console.log("ASOIAF | Initialisation du système");
  CONFIG.ASOIAF = ASOIAF;
  game.asoiaf = { rollTest, config: ASOIAF };

  CONFIG.Actor.documentClass = AsoiafActor;
  CONFIG.Item.documentClass = AsoiafItem;
  CONFIG.Combatant.documentClass = AsoiafCombatant;

  CONFIG.Actor.dataModels = { character: CharacterData, npc: CharacterData, house: HouseData };
  CONFIG.Item.dataModels = {
    weapon: ItemModels.WeaponData,
    armor: ItemModels.ArmorData,
    equipment: ItemModels.EquipmentData,
    benefit: ItemModels.BenefitData,
    drawback: ItemModels.DrawbackData,
    holding: ItemModels.HoldingData,
    domain: ItemModels.DomainData,
    unit: ItemModels.UnitData
  };

  CONFIG.Actor.trackableAttributes = {
    character: { bar: ["health", "composure"], value: ["destiny.value"] },
    npc: { bar: ["health", "composure"], value: [] }
  };

  registerSheets();
  registerHandlebarsHelpers();
  const loadTemplates = foundry.applications.handlebars?.loadTemplates ?? globalThis.loadTemplates;
  loadTemplates([
    "systems/asoiaf/templates/chat/roll.hbs",
    "systems/asoiaf/templates/dialog/roll.hbs",
    "systems/asoiaf/templates/dialog/fortune.hbs",
    "systems/asoiaf/templates/actor/holding-list.hbs"
  ]);
});

/**
 * Enregistre les fiches du système et retire les fiches génériques de Foundry,
 * pour qu'elles ne puissent pas être choisies à la place des nôtres.
 */
function registerSheets() {
  const DSC = foundry.applications.apps?.DocumentSheetConfig ?? globalThis.DocumentSheetConfig;
  const CoreActorSheet = foundry.appv1?.sheets?.ActorSheet ?? globalThis.ActorSheet;
  const CoreItemSheet = foundry.appv1?.sheets?.ItemSheet ?? globalThis.ItemSheet;

  try {
    DSC.unregisterSheet(Actor, "core", CoreActorSheet);
    DSC.unregisterSheet(Item, "core", CoreItemSheet);
  } catch (err) {
    console.warn("ASOIAF | Impossible de retirer les fiches génériques", err);
  }

  DSC.registerSheet(Actor, "asoiaf", CharacterSheet, { types: ["character", "npc"], makeDefault: true, label: "ASOIAF.Sheet.character" });
  DSC.registerSheet(Actor, "asoiaf", HouseSheet, { types: ["house"], makeDefault: true, label: "ASOIAF.Sheet.house" });
  DSC.registerSheet(Item, "asoiaf", AsoiafItemSheet, { types: Object.keys(CONFIG.Item.dataModels), makeDefault: true, label: "ASOIAF.Sheet.item" });
  console.log("ASOIAF | Fiches enregistrées");
}

/** Diagnostic : signale clairement si une fiche n'est pas active. */
Hooks.once("ready", () => {
  console.log(`ASOIAF | Prêt (Foundry ${game.version})`);
  const missing = ["character", "npc", "house"].filter(type =>
    !Object.keys(CONFIG.Actor.sheetClasses?.[type] ?? {}).some(id => id.startsWith("asoiaf.")));
  if (missing.length) {
    ui.notifications.error(`Trône de Fer : fiches non enregistrées pour ${missing.join(", ")}. Ouvrez la console (F12) et cherchez « ASOIAF ».`, { permanent: true });
  }
});

function registerHandlebarsHelpers() {
  Handlebars.registerHelper("asSigned", n => (Number(n) >= 0 ? `+${n}` : `${n}`));
  Handlebars.registerHelper("asEq", (a, b) => a === b);
  Handlebars.registerHelper("asGt", (a, b) => Number(a) > Number(b));
  Handlebars.registerHelper("asRange", n => Array.from({ length: Number(n) || 0 }, (_, i) => i));
}

// Boutons des cartes de discussion (v13 : HTMLElement ; v12 : jQuery).
Hooks.on("renderChatMessageHTML", (message, html) => bindChatButtons(message, html));
Hooks.on("renderChatMessage", (message, html) => {
  if (game.release.generation >= 13) return;
  bindChatButtons(message, html[0] ?? html);
});
