import { AsoiafActorSheet } from "./base-sheet.mjs";
import { ASOIAF } from "../config.mjs";
import { describe, needsChoice } from "../effects.mjs";
import { acquireItem, PHYSICAL_TYPES } from "../inventory.mjs";
import * as Poisons from "../poisons.mjs";
import { formatCoins, purseValue } from "../poison-rules.mjs";

/** Libellé lisible d'une cible d'effet. */
function targetLabel(target) {
  const loc = k => game.i18n.localize(k);
  if (target === "all") return loc("ASOIAF.Modifier.allTests");
  if (target === "initiative") return loc("ASOIAF.Modifier.initiative");
  if (target.startsWith("weapon:")) return target.slice(7);
  if (CONFIG.ASOIAF.abilities[target.split(".")[0]]) {
    const [a, sp] = target.split(".");
    return sp ? loc(`ASOIAF.Specialty.${sp}`) : loc(`ASOIAF.Ability.${a}`);
  }
  return loc(`ASOIAF.Modifier.derived_${target}`);
}

const HOUSE_ITEM_TYPES = ["holding", "domain", "unit", "artisan"];

export class CharacterSheet extends AsoiafActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["character"],
    position: { width: 820, height: 860 },
    actions: {
      rollAbility: CharacterSheet.#onRollAbility,
      rollWeapon: CharacterSheet.#onRollWeapon,
      injury: CharacterSheet.#onInjury,
      wound: CharacterSheet.#onWound,
      recover: CharacterSheet.#onRecover,
      setCount: CharacterSheet.#onSetCount,
      unlinkHouse: CharacterSheet.#onUnlinkHouse,
      addFromCatalog: CharacterSheet.#onAddFromCatalog,
      administer: CharacterSheet.#onPoison(Poisons.administer, false),
      poisonNext: CharacterSheet.#onPoison(Poisons.nextAttack),
      poisonResolve: CharacterSheet.#onPoison(Poisons.resolveAll),
      poisonDiagnose: CharacterSheet.#onPoison(Poisons.diagnose),
      poisonTreat: CharacterSheet.#onPoison(Poisons.treat),
      poisonRecover: CharacterSheet.#onPoison(Poisons.recover),
      poisonDestiny: CharacterSheet.#onPoison(Poisons.burnDestiny),
      removeCoating: CharacterSheet.#onRemoveCoating
    }
  };

  static PARTS = {
    sheet: { template: "systems/asoiaf/templates/actor/character-sheet.hbs", scrollable: [".sheet-body"] }
  };

  static SHEET_TABS = ["abilities", "combat", "intrigue", "destiny", "gear", "bio"];

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const s = this.actor.system;
    const loc = k => game.i18n.localize(k);

    context.abilities = Object.entries(ASOIAF.abilities).map(([key, specs]) => {
      const a = s.abilities[key];
      return {
        key,
        label: loc(`ASOIAF.Ability.${key}`),
        value: a.value,
        flaws: s.flaws[key] ?? 0,
        specialties: specs.map(sp => ({
          key: sp,
          label: loc(`ASOIAF.Specialty.${sp}`),
          value: a.specialties[sp],
          over: a.specialties[sp] > a.value
        }))
      };
    }).sort((x, y) => x.label.localeCompare(y.label, game.i18n.lang));

    context.weapons = this._items("weapon").map(w => ({
      item: w,
      id: w.id,
      damage: w.system.baseDamage(this.actor),
      specialtyLabel: loc(`ASOIAF.Specialty.${w.system.specialty}`),
      grade: w.system.grade !== "common" ? loc(`ASOIAF.Grade.${w.system.grade}`) : null,
      coating: w.getFlag("asoiaf", "coating")?.name ?? null,
      trainingWarning: w.system.training > (s.abilities[w.system.ability]?.specialties[w.system.specialty] ?? 0)
    }));
    context.armors = this._items("armor");
    context.equipment = this._items("equipment");
    context.inventory = ASOIAF.equipmentCategories.map(key => ({
      key, label: loc(`ASOIAF.EquipmentCategory.${key}`), items: context.equipment.filter(i => i.system.category === key)
    })).filter(g => g.items.length);
    context.arms = [...this._items("weapon"), ...context.armors];
    const poisons = this._items("poison");
    context.poisons = poisons.filter(p => !p.system.active).map(p => ({
      item: p, id: p.id, delivery: String(p.system.delivery).split(",").map(d => loc(`ASOIAF.Poison.delivery_${d.trim()}`)).join(", ")
    }));
    context.afflictions = poisons.filter(p => p.system.active).map(p => Poisons.afflictionContext(p));
    context.purse = formatCoins(purseValue(s.coin));
    const quality = q => ({
      id: q.id, img: q.img, name: q.name, system: q.system,
      pending: needsChoice(q),
      effects: (q.system.modifiers ?? []).filter(m => m.target && !m.target.startsWith("?"))
        .map(m => `${m.situational ? "◇ " : ""}${describe(m, s.abilities)} ${targetLabel(m.target)}`).join(" · ")
    });
    context.benefits = this._items("benefit").map(quality);
    context.drawbacks = this._items("drawback").map(quality);

    const house = s.houseActor;
    context.house = house ? { uuid: house.uuid, name: house.name, img: house.img, maxStatus: house.system.maxStatus } : null;
    context.statusWarning = house && s.abilities.status.value > house.system.maxStatus;

    context.ageOptions = Object.fromEntries(ASOIAF.ages.map(a => [a, `ASOIAF.Age.${a}`]));
    context.abilityOptions = Object.fromEntries(Object.keys(ASOIAF.abilities).map(a => [a, `ASOIAF.Ability.${a}`]));
    context.weaponCatalog = ASOIAF.weapons.map((w, i) => ({ index: i, name: w.name }));
    context.armorCatalog = ASOIAF.armors.map((a, i) => ({ index: i, name: `${a.name} (VA ${a.rating})` }));
    context.healthPct = s.health.max ? Math.round(100 * s.health.value / s.health.max) : 0;
    context.composurePct = s.composure.max ? Math.round(100 * s.composure.value / s.composure.max) : 0;
    context.penalties = {
      injuries: s.injuries, wounds: s.wounds, frustration: s.frustration, armor: s.armor.penalty
    };
    context.injurySlots = Array.from({ length: s.abilities.endurance.value }, (_, i) => ({ filled: i < s.injuries }));
    context.woundSlots = Array.from({ length: s.abilities.endurance.value }, (_, i) => ({ filled: i < s.wounds }));
    context.frustrationSlots = Array.from({ length: s.abilities.will.value }, (_, i) => ({ filled: i < s.frustration }));
    return context;
  }

  _acceptsItemType(type) {
    return !HOUSE_ITEM_TYPES.includes(type);
  }

  async _onDropData(event, data) {
    if (data.type === "Actor") {
      const actor = await fromUuid(data.uuid);
      if (actor?.type === "house") return this.actor.update({ "system.house": actor.uuid });
      return;
    }
    // Objets physiques : achat proposé, objets identiques empilés.
    if (data.type === "Item") {
      const item = await Item.implementation.fromDropData(data);
      if (item && item.parent !== this.actor && PHYSICAL_TYPES.includes(item.type)) return acquireItem(this.actor, item);
    }
    return super._onDropData(event, data);
  }

  /** Actions sur un poison de la fiche (dose de l'inventaire ou empoisonnement en cours). */
  static #onPoison(fn, owned = true) {
    return function (event, target) {
      const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
      if (!item || (owned && !item.system.active)) return;
      return fn(this.actor, item);
    };
  }

  static #onRemoveCoating(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    return item?.unsetFlag("asoiaf", "coating");
  }

  static #onRollAbility(event, target) {
    return this.actor.rollAbility(target.dataset.ability, target.dataset.specialty || null);
  }

  static #onRollWeapon(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (item) return this.actor.rollWeapon(item);
  }

  static #onInjury() {
    return this.actor.takeInjury();
  }

  static #onWound() {
    return this.actor.takeWound();
  }

  static #onRecover(event, target) {
    return this.actor.recover(target.dataset.kind);
  }

  /** Clic sur une pastille : remplie -> on retire jusqu'à elle ; vide -> on remplit jusqu'à elle. */
  static #onSetCount(event, target) {
    const index = Number(target.dataset.index);
    const value = target.classList.contains("filled") ? index : index + 1;
    return this.actor.update({ [target.dataset.field]: value });
  }

  static #onUnlinkHouse() {
    return this.actor.update({ "system.house": "" });
  }

  /** Ajoute une arme ou une armure du livre via la liste déroulante. */
  static async #onAddFromCatalog(event, target) {
    const kind = target.dataset.kind;
    const select = this.element.querySelector(`select[data-catalog=${kind}]`);
    const entry = (kind === "weapon" ? ASOIAF.weapons : ASOIAF.armors)[Number(select?.value)];
    if (!entry) return;
    const { name, ...system } = entry;
    return this.actor.createEmbeddedDocuments("Item", [{ name, type: kind, system }]);
  }
}
