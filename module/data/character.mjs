import { ASOIAF } from "../config.mjs";
import { collectModifiers, derivedEffects, testEffects, weaponEffect } from "../effects.mjs";

/** Contexte d'effet d'une arme : capacité, spécialité et arme. */
export function weaponContext(weapon) {
  return { ability: weapon.system.ability, specialty: weapon.system.specialty, weapon };
}

const { NumberField, SchemaField, StringField } = foundry.data.fields;

const rank = (initial = 2) => new NumberField({ required: true, integer: true, min: 0, max: 10, initial });
const counter = (initial = 0) => new NumberField({ required: true, integer: true, min: 0, initial });
const text = () => new StringField({ required: true, blank: true, initial: "" });

/** Données d'un personnage (PJ ou PNJ). */
export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const abilities = {};
    for (const [key, specialties] of Object.entries(ASOIAF.abilities)) {
      const spec = {};
      for (const s of specialties) spec[s] = rank(0);
      abilities[key] = new SchemaField({ value: rank(2), specialties: new SchemaField(spec) });
    }

    return {
      abilities: new SchemaField(abilities),
      health: new SchemaField({ value: counter(6), max: counter(6) }),
      composure: new SchemaField({ value: counter(6), max: counter(6) }),
      injuries: counter(),
      wounds: counter(),
      frustration: counter(),
      destiny: new SchemaField({ value: counter(0), burned: counter(0) }),
      xp: new SchemaField({ total: counter(0), spent: counter(0) }),
      glory: counter(),
      coin: new SchemaField({ dragons: counter(), stags: counter(), pennies: counter() }),
      house: text(),
      position: text(),
      age: new StringField({ required: true, initial: "youngAdult", choices: ASOIAF.ages }),
      languages: text(),
      details: new SchemaField({
        concept: text(), goal: text(), motivation: text(), virtue: text(), vice: text(),
        background: text(), appearance: text(), notes: text()
      })
    };
  }

  prepareDerivedData() {
    const a = this.abilities;
    const items = this.parent.items;

    // Modificateurs des qualités (avantages et handicaps).
    this.modifiers = collectModifiers(items);

    const armor = items.find(i => i.type === "armor" && i.system.equipped);
    const equippedWeapons = items.filter(i => i.type === "weapon" && i.system.equipped);
    const state = {
      armorBulk: armor?.system.bulk ?? 0,
      equippedSpecialties: equippedWeapons.map(w => w.system.specialty)
    };
    const derived = derivedEffects(this.modifiers, a, state);
    this.derivedBonus = derived;

    this.armor = {
      rating: Math.max(0, (armor?.system.rating ?? 0) + (armor ? derived.armorRating : 0)),
      penalty: armor?.system.penalty ?? 0,
      name: armor?.name ?? ""
    };

    // Bonus défensif : celui de la meilleure arme équipée, avec les qualités qui la visent.
    // Une qualité ne peut au plus que doubler le bonus d'origine (Maîtrise du bouclier).
    const defensive = Math.max(0, ...equippedWeapons.map(w => {
      const base = w.system.defensive ?? 0;
      let extra = weaponEffect(this.modifiers, "defensive", a, weaponContext(w));
      if (base > 0) extra = Math.min(extra, base);
      return base + extra;
    }));
    const armorBulk = armor ? Math.max(0, armor.system.bulk + derived.bulk) : 0;
    const bulk = items.reduce((t, i) => t + (i !== armor && i.system.equipped && i.system.bulk || 0), armorBulk);

    this.combatDefense = a.agility.value + a.athletics.value + a.awareness.value + this.armor.penalty + defensive
      + derived.combatDefense;
    this.defensiveBonus = defensive;
    this.intrigueDefense = a.awareness.value + a.cunning.value + a.status.value + derived.intrigueDefense;
    this.health.max = Math.max(1, a.endurance.value * 3 + derived.health);
    this.composure.max = Math.max(1, a.will.value * 3 + derived.composure);
    this.bulk = bulk;

    // Déplacement (Table 9-1) : +1 m par 2B de Course, -1 par 2 points d'encombrement.
    const run = a.athletics.specialties.run;
    let move = 4 + Math.floor(run / 2) + derived.movement;
    if (a.athletics.value <= 1 && run === 0) move -= 1;
    this.movement = Math.max(1, move - Math.floor(bulk / 2));
    this.sprint = Math.max(4, Math.max(1, move) * (4 + derived.sprintMult) - bulk);

    // Défauts saisis à l'ancienne (champ « défaut sur la capacité ») : -1D par défaut.
    this.flaws = {};
    for (const d of items) {
      if (d.type === "drawback" && d.system.flawAbility) {
        this.flaws[d.system.flawAbility] = (this.flaws[d.system.flawAbility] ?? 0) + d.system.flawDice;
      }
    }

    this.destiny.invested = items.filter(i => i.type === "benefit").reduce((t, b) => t + b.system.destinyCost, 0);
    this.xp.available = this.xp.total - this.xp.spent;
  }

  /** Maison liée (résolue à la demande : elle peut ne pas être prête pendant la préparation). */
  get houseActor() {
    if (!this.house) return null;
    const house = fromUuidSync(this.house);
    return house?.type === "house" ? house : null;
  }

  /**
   * Données d'un test : dés de test, dés bonus, pénalités, modificateur, relances, conversions,
   * et effets situationnels proposés dans la fenêtre de jet.
   * @param {object} [ctx]  { weapon, initiative }
   */
  getTestData(ability, specialty = null, ctx = {}) {
    const a = this.abilities[ability];
    const context = { ability, specialty, ...ctx };
    const { permanent, situational } = testEffects(this.modifiers ?? [], this.abilities, context);

    let penaltyDice = this.wounds + (this.flaws[ability] ?? 0) + permanent.penaltyDice
      + (["deception", "persuasion"].includes(ability) ? this.frustration : 0);
    let modifier = -this.injuries + permanent.modifier;
    if (ability === "agility") modifier += this.armor.penalty;
    return {
      testDice: a.value + permanent.testDice,
      bonusDice: (specialty ? a.specialties[specialty] : 0) + permanent.bonusDice,
      penaltyDice: Math.max(0, penaltyDice),
      modifier,
      convert: permanent.convert,
      convertHalf: permanent.convertHalf,
      reroll1: permanent.reroll1,
      reroll6: permanent.reroll6,
      damageBonus: permanent.damage,
      damageAfter: permanent.damageAfter,
      situational
    };
  }
}
