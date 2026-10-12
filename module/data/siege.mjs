import { ASOIAF } from "../config.mjs";

const { NumberField, SchemaField, StringField } = foundry.data.fields;

const num = (initial = 0, options = {}) => new NumberField({ required: true, integer: true, initial, ...options });
const text = () => new StringField({ required: true, blank: true, initial: "" });

/**
 * Engin de siège sur le champ de bataille : catapulte, mangonneau, scorpion, cracheur de feu,
 * trébuchet, tour de siège ou bélier couvert.
 */
export class SiegeData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      kind: new StringField({ required: true, initial: "catapultMedium", choices: Object.keys(ASOIAF.siegeEngines) }),
      ammo: text(),
      health: new SchemaField({ value: num(20, { min: 0 }), max: num(20, { min: 0 }) }),
      status: new StringField({ required: true, initial: "ready", choices: ["ready", "destroyed"] }),
      crew: text(),
      carried: text(),
      house: text(),
      lastFired: num(-1, { min: -1 }),
      burning: new SchemaField({ damage: num(0, { min: 0 }), rounds: num(0, { min: 0 }) }),
      notes: text()
    };
  }

  prepareDerivedData() {
    const def = ASOIAF.siegeEngines[this.kind];
    this.def = def;
    this.armor = { rating: def.ar };
    this.health.max = def.health;
    this.movement = def.move;
    this.range = def.range;
    this.smash = def.smash ?? 0;
    this.ammoList = Object.keys(def.damage ?? {});
    this.currentAmmo = this.ammoList.includes(this.ammo) ? this.ammo : this.ammoList[0] ?? "";
    this.damage = def.damage?.[this.currentAmmo] ?? 0;
    this.ignoresArmor = !!ASOIAF.siegeAmmo[this.currentAmmo]?.ignore;
    this.burns = ASOIAF.siegeAmmo[this.currentAmmo]?.burn ?? null;
    this.canFire = this.ammoList.length > 0;
  }

  get crewActor() {
    return this.crew ? fromUuidSync(this.crew) : null;
  }

  get carriedActor() {
    return this.carried ? fromUuidSync(this.carried) : null;
  }
}
