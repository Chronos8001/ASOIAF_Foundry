import { ASOIAF } from "../config.mjs";

const { ArrayField, BooleanField, NumberField, ObjectField, SchemaField, StringField } = foundry.data.fields;

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
      weight: new NumberField({ required: true, initial: 0, min: 0 }),
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

  /** Dégâts de base selon la capacité du porteur (+1 pour une arme extraordinaire, Table 7-3). */
  baseDamage(actor) {
    if (this.damageAbility === "none" || !actor?.system.abilities) return 0;
    const value = actor.system.abilities[this.damageAbility]?.value ?? 0;
    return Math.max(1, value + this.damageMod + (this.grade === "extraordinary" ? 1 : 0));
  }
}

export class ArmorData extends PhysicalItemData {
  static defineSchema() {
    return { ...super.defineSchema(), rating: num(0, { min: 0 }), penalty: num(0, { max: 0 }) };
  }
}

export class EquipmentData extends PhysicalItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      category: new StringField({ required: true, initial: "gear", choices: ASOIAF.equipmentCategories })
    };
  }
}

/** Effet d'un poison (voir module/poison-rules.mjs). */
const poisonEffectField = () => new SchemaField({
  kind: new StringField({ required: true, initial: "penaltyDice" }),
  target: text(),
  formula: new StringField({ required: true, blank: true, initial: "@deg" }),
  permanent: new BooleanField({ initial: false }),
  once: new BooleanField({ initial: false }),
  always: new BooleanField({ initial: false }),
  situational: new BooleanField({ initial: false }),
  label: text()
});

/**
 * Poison ou drogue (chapitre 7). Dans l'inventaire, ce sont des doses ; sur une victime
 * (active), l'objet porte aussi l'état de l'empoisonnement (attaques restantes, pénalités cumulées).
 */
export class PoisonData extends PhysicalItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      delivery: new StringField({ required: true, initial: "ingested" }),
      virulence: num(4, { min: 0 }),
      diagnosis: num(9, { min: 0 }),
      resistBonus: num(0),
      cureDegrees: num(0, { min: 0 }),
      alcohol: new StringField({ required: true, blank: true, initial: "", choices: ["", "beer", "wine", "spirits"] }),
      stages: new ArrayField(new SchemaField({
        label: text(),
        interval: num(3600, { min: 0 }),
        firstDelay: num(0, { min: 0 }),
        toxicity: num(1, { min: 0 }),
        defense: new StringField({ required: true, initial: "endurance" }),
        auto: new BooleanField({ initial: false }),
        requires: num(-1, { min: -1 }),
        effects: new ArrayField(poisonEffectField()),
        followAbility: text(),
        followDifficulty: num(0, { min: 0 }),
        followLabel: text(),
        followFail: poisonEffectField()
      })),
      thresholds: new ArrayField(new SchemaField({
        ability: new StringField({ required: true, initial: "endurance" }),
        multiplier: num(1, { min: 1 }),
        result: new StringField({ required: true, initial: "death", choices: ["death", "unconscious"] }),
        hours: text()
      })),
      recovery: new SchemaField({
        mode: new StringField({ required: true, initial: "fade", choices: ["fade", "periodic", "test", "permanent"] }),
        interval: num(86400, { min: 0 }),
        amount: num(1, { min: 0 }),
        difficulty: num(0, { min: 0 }),
        fadeAfter: num(0, { min: 0 }),
        fadeOnWake: new BooleanField({ initial: false }),
        destinyDelay: text()
      }),
      active: new BooleanField({ initial: false }),
      state: new ObjectField({ required: true, initial: {} })
    };
  }
}

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
    // Règle maison : la Discipline peut être négative (une très bonne unité facilite les ordres).
    this.discipline = training.discipline + this.disciplineMod
      + selected.reduce((t, k) => t + ASOIAF.unitTypes[k].discipline, 0);
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
