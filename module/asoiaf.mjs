/**
 * Le Trône de Fer JdR (A Song of Ice and Fire Roleplaying) pour Foundry VTT.
 */
import { ASOIAF } from "./config.mjs";
import { CharacterData } from "./data/character.mjs";
import { HouseData } from "./data/house.mjs";
import { UnitActorData } from "./data/unit.mjs";
import { SiegeData } from "./data/siege.mjs";
import * as ItemModels from "./data/items.mjs";
import { AsoiafActor, AsoiafCombatant } from "./documents/actor.mjs";
import { CharacterSheet } from "./sheets/character-sheet.mjs";
import { HouseSheet } from "./sheets/house-sheet.mjs";
import { AsoiafItemSheet } from "./sheets/item-sheet.mjs";
import { UnitSheet } from "./sheets/unit-sheet.mjs";
import { SiegeSheet } from "./sheets/siege-sheet.mjs";
import { burnTick } from "./siege.mjs";
import { repairMottos, syncArms } from "./house.mjs";
import { registerStatusEffects, resetRound } from "./warfare.mjs";
import { bindChatButtons, rollTest } from "./dice.mjs";

const DEFAULT_ICONS = {
  weapon: "icons/svg/sword.svg",
  armor: "icons/svg/shield.svg",
  equipment: "icons/svg/item-bag.svg",
  benefit: "icons/svg/sun.svg",
  drawback: "icons/svg/skull.svg",
  holding: "icons/svg/tower.svg",
  domain: "icons/svg/mountain.svg",
  unit: "icons/svg/combat.svg",
  artisan: "icons/svg/anchor.svg"
};

class AsoiafItem extends Item {
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    if (!data.img || data.img === Item.DEFAULT_ICON) this.updateSource({ img: DEFAULT_ICONS[this.type] ?? Item.DEFAULT_ICON });
  }

  /** Un artisan prêté ou déplacé arrive sur son nouveau territoire avec un budget de 0. */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    const loan = foundry.utils.getProperty(changes, "system.loan");
    if (this.type === "artisan" && loan !== undefined && loan !== this.system.loan) {
      foundry.utils.setProperty(changes, "system.budget", 0);
    }
  }
}

Hooks.once("init", () => {
  console.log("ASOIAF | Initialisation du système");
  CONFIG.ASOIAF = ASOIAF;
  game.asoiaf = { rollTest, config: ASOIAF };

  CONFIG.Actor.documentClass = AsoiafActor;
  CONFIG.Item.documentClass = AsoiafItem;
  CONFIG.Combatant.documentClass = AsoiafCombatant;

  CONFIG.Actor.dataModels = { character: CharacterData, npc: CharacterData, house: HouseData, unit: UnitActorData, siege: SiegeData };
  registerStatusEffects();
  CONFIG.Item.dataModels = {
    weapon: ItemModels.WeaponData,
    armor: ItemModels.ArmorData,
    equipment: ItemModels.EquipmentData,
    benefit: ItemModels.BenefitData,
    drawback: ItemModels.DrawbackData,
    holding: ItemModels.HoldingData,
    domain: ItemModels.DomainData,
    unit: ItemModels.UnitData,
    artisan: ItemModels.ArtisanData
  };

  CONFIG.Actor.trackableAttributes = {
    character: { bar: ["health", "composure"], value: ["destiny.value"] },
    npc: { bar: ["health", "composure"], value: [] },
    unit: { bar: ["health"], value: ["disorganizations"] },
    siege: { bar: ["health"], value: [] }
  };

  registerSheets();
  registerHandlebarsHelpers();
  const loadTpl = foundry.applications.handlebars?.loadTemplates ?? loadTemplates;
  loadTpl([
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
  const DSC = foundry.applications.apps?.DocumentSheetConfig ?? DocumentSheetConfig;
  const CoreActorSheet = foundry.appv1?.sheets?.ActorSheet ?? ActorSheet;
  const CoreItemSheet = foundry.appv1?.sheets?.ItemSheet ?? ItemSheet;

  try {
    DSC.unregisterSheet(Actor, "core", CoreActorSheet);
    DSC.unregisterSheet(Item, "core", CoreItemSheet);
  } catch (err) {
    console.warn("ASOIAF | Impossible de retirer les fiches génériques", err);
  }

  DSC.registerSheet(Actor, "asoiaf", CharacterSheet, { types: ["character", "npc"], makeDefault: true, label: "ASOIAF.Sheet.character" });
  DSC.registerSheet(Actor, "asoiaf", HouseSheet, { types: ["house"], makeDefault: true, label: "ASOIAF.Sheet.house" });
  DSC.registerSheet(Actor, "asoiaf", UnitSheet, { types: ["unit"], makeDefault: true, label: "ASOIAF.Sheet.unit" });
  DSC.registerSheet(Actor, "asoiaf", SiegeSheet, { types: ["siege"], makeDefault: true, label: "ASOIAF.Sheet.siege" });
  DSC.registerSheet(Item, "asoiaf", AsoiafItemSheet, { types: Object.keys(CONFIG.Item.dataModels), makeDefault: true, label: "ASOIAF.Sheet.item" });
  console.log("ASOIAF | Fiches enregistrées");
}

/** Diagnostic : signale clairement si une fiche n'est pas active. */
Hooks.once("ready", () => {
  console.log(`ASOIAF | Prêt (Foundry ${game.version})`);
  const missing = ["character", "npc", "house", "unit", "siege"].filter(type =>
    !Object.keys(CONFIG.Actor.sheetClasses?.[type] ?? {}).some(id => id.startsWith("asoiaf.")));
  if (missing.length) {
    ui.notifications.error(`Trône de Fer : fiches non enregistrées pour ${missing.join(", ")}. Ouvrez la console (F12) et cherchez « ASOIAF ».`, { permanent: true });
  }
  if (game.user.isGM) repairMottos().catch(err => console.error("ASOIAF | Réparation des devises impossible", err));
  if (game.user.isGM) syncArms().catch(err => console.error("ASOIAF | Synchronisation des blasons impossible", err));
});

function registerHandlebarsHelpers() {
  Handlebars.registerHelper("asSigned", n => (Number(n) >= 0 ? `+${n}` : `${n}`));
  Handlebars.registerHelper("asEq", (a, b) => a === b);
  Handlebars.registerHelper("asGt", (a, b) => Number(a) > Number(b));
  Handlebars.registerHelper("asRange", n => Array.from({ length: Number(n) || 0 }, (_, i) => i));
}

// Boutons des cartes de discussion (v13 : HTMLElement ; v12 : jQuery).
// Nouveau round de combat : les unités présentes repartent à zéro ordre donné (MJ uniquement).
// Chaque nouveau round : les incendies brûlent, puis le compteur d'ordres repart à zéro.
Hooks.on("updateCombat", async (combat, changes) => {
  if (!game.user.isGM || !("round" in changes)) return;
  const actors = combat.combatants.map(c => c.actor).filter(a => ["unit", "siege"].includes(a?.type));
  await burnTick(actors);
  await resetRound(actors.filter(a => a.type === "unit"));
});

Hooks.on("renderChatMessageHTML", (message, html) => bindChatButtons(message, html));
Hooks.on("renderChatMessage", (message, html) => {
  if (game.release.generation >= 13) return;
  bindChatButtons(message, html[0] ?? html);
});
