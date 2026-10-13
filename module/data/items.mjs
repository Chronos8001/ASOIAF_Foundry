import { ASOIAF } from "../config.mjs";

const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;

const num = (initial = 0, options = {}) => new NumberField({ required: true, integer: true, initial, ...options });
const text = () => new StringField({ required: true, blank: true, initial: "" });

class BaseItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return { description: text() };
  }
}

class PhysicalItemData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      quantity: num(1, { min: 0 }),
      cost: text(),
      bulk: num(0, { min: 0 }),
      equipped: new BooleanField({ initial: false })
    };
  }
}

export class WeaponData extends PhysicalItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      specialty: new StringField({ required: true, initial: "longBlades", choices: Object.keys(ASOIAF.weaponSpecialties) }),
      training: num(0, { min: 0 }),
      damageAbility: new StringField({ required: true, initial: "athletics" }),
      damageMod: num(0),
      qualities: text(),
      defensive: num(0, { min: 0 }),
      piercing: num(0, { min: 0 }),
      grade: new StringField({ required: true, initial: "common", choices: ["poor", "common", "superior", "extraordinary"] })
    };
  }

  get ability() {
    return ASOIAF.weaponSpecialties[this.specialty];
  }

  /** Dégâts de base selon la capacité du porteur. */
  baseDamage(actor) {
    if (this.damageAbility === "none" || !actor?.system.abilities) return 0;
    const value = actor.system.abilities[this.damageAbility]?.value ?? 0;
    return Math.max(1, value + this.damageMod);
  }
}

export class ArmorData extends PhysicalItemData {
  static defineSchema() {
    return { ...super.defineSchema(), rating: num(0, { min: 0 }), penalty: num(0, { max: 0 }) };
  }
}

export class EquipmentData extends PhysicalItemData {}

/** Modificateurs mécaniques d'une qualité (voir module/effects.mjs). */
const modifiersField = () => new ArrayField(new SchemaField({
  type: new StringField({ required: true, initial: "modifier" }),
  target: new StringField({ required: true, blank: true, initial: "" }),
  value: new StringField({ required: true, blank: true, initial: "1" }),
  situational: new BooleanField({ initial: false }),
  condition: new StringField({ required: true, blank: true, initial: "" }),
  label: new StringField({ required: true, blank: true, initial: "" })
}));

export class BenefitData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      category: text(),
      requirements: text(),
      destinyCost: num(1, { min: 0 }),
      repeatable: new BooleanField({ initial: false }),
      modifiers: modifiersField()
    };
  }
}

export class DrawbackData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      isFlaw: new BooleanField({ initial: false }),
      flawAbility: new StringField({ required: true, blank: true, initial: "" }),
      flawDice: num(1, { min: 0 }),
      category: text(),
      requirements: text(),
      modifiers: modifiersField()
    };
  }
}

/* -------------------------------------------- */
/*  Possessions de Maison                       */
/* -------------------------------------------- */

/** Possession générique (défense, héritier, richesse, banneret). */
export class HoldingData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      resource: new StringField({ required: true, initial: "wealth", choices: ASOIAF.resources }),
      kind: new StringField({ required: true, initial: "", blank: true }),
      investment: num(0, { min: 0 }),
      time: text(),
      monthsRemaining: num(0, { min: 0 }),
      fortune: text(),
      defenseBonus: num(0, { min: 0 }),
      requirement: text(),
      linked: text()
    };
  }

  get complete() {
    return this.monthsRemaining <= 0;
  }
}

/** Domaine : un terrain + des caractéristiques. Le coût se calcule. */
export class DomainData extends BaseItemData {
  static defineSchema() {
    const features = {};
    for (const f of Object.keys(ASOIAF.features)) features[f] = num(0, { min: 0 });
    return {
      ...super.defineSchema(),
      terrain: new StringField({ required: true, initial: "plains", choices: Object.keys(ASOIAF.terrains) }),
      features: new SchemaField(features)
    };
  }

  get resource() {
    return "lands";
  }

  prepareDerivedData() {
    let cost = ASOIAF.terrains[this.terrain] ?? 0;
    for (const [f, count] of Object.entries(this.features)) cost += (ASOIAF.features[f] ?? 0) * count;
    this.investment = cost;
  }
}

/** Unité militaire : entraînement + types. */
export class UnitData extends BaseItemData {
  static defineSchema() {
    const types = {};
    for (const t of Object.keys(ASOIAF.unitTypes)) types[t] = new BooleanField({ initial: false });
    return {
      ...super.defineSchema(),
      training: new StringField({ required: true, initial: "green", choices: Object.keys(ASOIAF.unitTraining) }),
      types: new SchemaField(types),
      abilities: text(),
      disciplineMod: num(0),
      discount: num(0, { min: 0 }),
      status: new StringField({ required: true, initial: "ready", choices: ["ready", "disorganized", "routed", "destroyed"] })
    };
  }

  get resource() {
    return "power";
  }

  prepareDerivedData() {
    const training = ASOIAF.unitTraining[this.training];
    const selected = Object.entries(this.types).filter(([, v]) => v).map(([k]) => k);
    this.typeList = selected;
    // Formation par un artisan (règle maison) : réduction libre du coût en Puissance.
    this.investment = Math.max(0, training.cost + selected.reduce((t, k) => t + ASOIAF.unitTypes[k].cost, 0) - this.discount);
    this.discipline = Math.max(0, training.discipline + this.disciplineMod
      + selected.reduce((t, k) => t + ASOIAF.unitTypes[k].discipline, 0));
    this.experience = training.xp;
    this.keyAbilities = [...new Set(selected.flatMap(k => ASOIAF.unitTypes[k].abilities))];
    this.wealthCost = this.types.mercenaries ? ASOIAF.mercenaryWealth[this.training] : 0;
    this.populationCost = this.types.levies ? 2 : 0;
  }
}

/**
 * Artisan de la Maison (règle maison) : budget, jets mensuels de métier, expérience.
 */
export class ArtisanData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      trade: text(),
      ability: new StringField({ required: true, initial: "knowledge", choices: Object.keys(ASOIAF.abilities) }),
      rank: num(5, { min: 1, max: 10 }),
      bonusDice: num(0, { min: 0 }),
      modifier: num(0),
      budget: num(0, { min: 0, max: ASOIAF.artisan.maxBudget }),
      xp: num(0, { min: 0 }),
      penalty: num(0, { min: 0 }),
      startedMonth: num(0, { min: 0 }),
      leadExtraMonth: num(0, { min: 0 }),
      rolledMonth: num(0, { min: 0 }),
      productions: text(),
      project: text(),
      investment: num(10, { min: 0 }),
      fortune: text(),
      loan: new StringField({ required: true, initial: "home", choices: ["home", "lent", "borrowed"] }),
      loanFree: new BooleanField({ initial: false })
    };
  }

  get resource() {
    return "wealth";
  }
}
