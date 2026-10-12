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

  const Actors = foundry.documents?.collections?.Actors ?? globalThis.Actors;
  const Items = foundry.documents?.collections?.Items ?? globalThis.Items;
  Actors.registerSheet("asoiaf", CharacterSheet, { types: ["character", "npc"], makeDefault: true, label: "ASOIAF.Sheet.character" });
  Actors.registerSheet("asoiaf", HouseSheet, { types: ["house"], makeDefault: true, label: "ASOIAF.Sheet.house" });
  Items.registerSheet("asoiaf", AsoiafItemSheet, { makeDefault: true, label: "ASOIAF.Sheet.item" });

  registerHandlebarsHelpers();
  const loadTemplates = foundry.applications.handlebars?.loadTemplates ?? globalThis.loadTemplates;
  loadTemplates([
    "systems/asoiaf/templates/chat/roll.hbs",
    "systems/asoiaf/templates/dialog/roll.hbs",
    "systems/asoiaf/templates/dialog/fortune.hbs",
    "systems/asoiaf/templates/actor/holding-list.hbs"
  ]);
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
