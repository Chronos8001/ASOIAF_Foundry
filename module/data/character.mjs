import { ASOIAF } from "../config.mjs";
import { collectModifiers, derivedEffects, testEffects, weaponEffect } from "../effects.mjs";
import { conditionValue, hasCondition } from "../conditions.mjs";

/** Contexte d'effet d'une arme : capacité, spécialité et arme. */
export function weaponContext(weapon) {
  return { ability: weapon.system.ability, specialty: weapon.system.specialty, weapon };
}

const { BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;

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
      // Fatigue (combat avancé) : -1 à tous les résultats par point, au plus le rang d'Endurance.
      fatigue: counter(),
      size: new StringField({ required: true, initial: "medium", choices: ["small", "medium", "large"] }),
      // Intrigue en cours (chapitre 8) : disposition envers l'adversaire, technique, effets des actions.
      intrigue: new SchemaField({
        disposition: new StringField({ required: true, initial: "indifferent", choices: ASOIAF.dispositionOrder }),
        technique: new StringField({ required: true, initial: "convince", choices: Object.keys(ASOIAF.techniques) }),
        deceit: new BooleanField({ initial: false }),
        objective: new StringField({ required: true, blank: true, initial: "", choices: ["", ...ASOIAF.objectives] }),
        locationBonus: counter(),
        withdraw: counter(),
        withdrawLeft: counter(),
        fastTalkedLeft: counter(),
        consider: counter(),
        readTarget: new BooleanField({ initial: false }),
        assist: counter(),
        shieldUsed: new BooleanField({ initial: false }),
        influenced: new BooleanField({ initial: false }),
        victory: new NumberField({ required: true, integer: true, initial: 0 }),
        victoryGoal: counter()
      }),
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

    // États de combat (chapitre 9).
    const actor = this.parent;
    const has = key => hasCondition(actor, key);
    this.ignoreArmorPenalty = has("fatigueArmor");
    const usedDefensive = has("offhand") ? 0 : defensive;
    let cd = a.agility.value + a.athletics.value + a.awareness.value + (this.ignoreArmorPenalty ? 0 : this.armor.penalty)
      + usedDefensive + derived.combatDefense;
    cd += { small: 2, medium: 0, large: -2 }[this.size] ?? 0;
    if (has("cover")) cd += conditionValue(actor, "cover", 5) || 5;
    if (has("cautious")) cd += 3;
    if (has("reckless")) cd -= 5;
    if (has("stunned")) cd -= 5;
    if (has("distracted")) cd -= a.awareness.value;
    if (has("helpless") || has("pinned") || has("unconscious")) cd -= a.agility.value;
    if (has("grabbed")) cd = Math.max(1, cd - 5);
    // Esquive : le résultat du test remplace la Défense de combat jusqu'au prochain tour.
    if (has("dodging")) cd = conditionValue(actor, "dodging", cd);
    this.combatDefense = cd;
    this.helpless = has("helpless") || has("pinned") || has("unconscious");
    this.defensiveBonus = usedDefensive;

    // Défense d'intrigue : lieu, baratin (perd la Ruse), retranchement (résultat de Volonté).
    const intr = this.intrigue;
    let id = a.awareness.value + a.cunning.value + a.status.value + derived.intrigueDefense + intr.locationBonus;
    if (intr.fastTalkedLeft > 0) id -= a.cunning.value;
    if (intr.withdrawLeft > 0 && intr.withdraw > 0) id = intr.withdraw;
    this.intrigueDefense = id;
    this.disposition = ASOIAF.dispositions[intr.disposition] ?? ASOIAF.dispositions.indifferent;
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

    // Poisons et drogues : le lait de pavot réduit de moitié les pénalités de blessures.
    this.halvePain = items.some(i => i.type === "poison" && i.system.active
      && i.system.state?.penalties?.some(p => p.kind === "halveInjuries"));
    // Poids transporté (kg) : objets physiques, sans les poisons qui affectent le personnage.
    this.carriedWeight = Math.round(10 * items.reduce((t, i) => {
      if (i.system.weight === undefined || (i.type === "poison" && i.system.active)) return t;
      return t + (i.system.weight || 0) * (i.system.quantity ?? 1);
    }, 0)) / 10;

    this.destiny.invested = items.filter(i => i.type === "benefit").reduce((t, b) => t + b.system.destinyCost, 0);
    this.xp.available = this.xp.total - this.xp.spent;
  }

  /**
   * Valeur passive (p. 30 et 69) : rang × 4, plus les dés bonus d'une spécialité ;
   * un défaut compte comme un rang de moins.
   */
  passive(ability, specialty = null) {
    const a = this.abilities[ability];
    if (!a) return 0;
    const rank = Math.max(0, a.value - (this.flaws?.[ability] ? 1 : 0));
    return rank * 4 + (specialty ? a.specialties[specialty] ?? 0 : 0);
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

    const actor = this.parent;
    let wounds = this.halvePain ? Math.floor(this.wounds / 2) : this.wounds;
    let injuries = this.halvePain ? Math.floor(this.injuries / 2) : this.injuries;
    // Fatigue acceptée : ignorer une blessure grave, ou toutes les blessures légères, jusqu'au prochain tour.
    if (hasCondition(actor, "fatigueWound")) wounds = Math.max(0, wounds - 1);
    if (hasCondition(actor, "fatigueInjuries")) injuries = 0;
    let penaltyDice = wounds + (this.flaws[ability] ?? 0) + permanent.penaltyDice
      + (["deception", "persuasion"].includes(ability) ? this.frustration : 0);
    let modifier = -injuries + permanent.modifier - this.fatigue;
    if (ability === "agility" && !this.ignoreArmorPenalty) modifier += this.armor.penalty;
    if (hasCondition(actor, "maneuvered")) penaltyDice += 1;
    if (hasCondition(actor, "entangled")) modifier -= 5;
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
