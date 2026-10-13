import { ASOIAF } from "../config.mjs";

const { BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;

const num = (initial = 0, options = {}) => new NumberField({ required: true, integer: true, initial, ...options });
const text = () => new StringField({ required: true, blank: true, initial: "" });

/**
 * Unité militaire sur le champ de bataille (100 hommes, 20 cavaliers ou 5 navires).
 * Échelle : une case = 10 mètres.
 */
export class UnitActorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const abilities = {};
    for (const key of Object.keys(ASOIAF.abilities)) abilities[key] = new SchemaField({ value: num(2, { min: 0, max: 10 }) });
    const types = {};
    for (const t of Object.keys(ASOIAF.unitTypes)) types[t] = new BooleanField({ initial: false });

    return {
      abilities: new SchemaField(abilities),
      training: new StringField({ required: true, initial: "trained", choices: ASOIAF.trainingOrder }),
      types: new SchemaField(types),
      equipment: new StringField({ required: true, blank: true, initial: "" }),
      equipmentFight: new StringField({ required: true, blank: true, initial: "" }),
      equipmentShoot: new StringField({ required: true, blank: true, initial: "" }),
      upgrades: new SchemaField({
        armor: new BooleanField({ initial: false }),
        fighting: new BooleanField({ initial: false }),
        marksmanship: new BooleanField({ initial: false })
      }),
      health: new SchemaField({ value: num(6, { min: 0 }), max: num(6, { min: 0 }) }),
      status: new StringField({ required: true, initial: "ready", choices: ["ready", "disorganized", "routed", "destroyed"] }),
      disorganizations: num(0, { min: 0 }),
      tookDamage: new BooleanField({ initial: false }),
      disciplineMod: num(0),
      defenseMod: num(0),
      defendResult: num(0, { min: 0 }),
      ordersThisRound: num(0, { min: 0 }),
      standingOrder: text(),
      commander: text(),
      attached: text(),
      house: text(),
      source: text(),
      notes: text(),
      gear: new SchemaField({
        ram: new BooleanField({ initial: false }),
        mantlet: new BooleanField({ initial: false }),
        ladders: new BooleanField({ initial: false }),
        turtle: new BooleanField({ initial: false }),
        wildfire: new BooleanField({ initial: false })
      }),
      shelter: text(),
      burning: new SchemaField({ damage: num(0, { min: 0 }), rounds: num(0, { min: 0 }) })
    };
  }

  prepareDerivedData() {
    const a = this.abilities;
    const selected = Object.entries(this.types).filter(([, v]) => v).map(([k]) => k);
    this.typeList = selected;

    // Équipement : armure, corps à corps et distance peuvent venir de types différents.
    // Par défaut, celui de l'armure (ou du premier type) ; pour la distance, le premier type qui tire.
    const pick = key => selected.includes(key) ? key : null;
    const eqKey = pick(this.equipment) ?? selected[0];
    const packOf = key => ASOIAF.unitEquipment[key] ?? ASOIAF.unitEquipment.infantry;
    const fightKey = pick(this.equipmentFight) ?? eqKey;
    const shootKey = pick(this.equipmentShoot)
      ?? [eqKey, ...selected].find(k => ASOIAF.unitEquipment[k]?.base.shoot) ?? null;
    const pack = packOf(eqKey);
    const armor = this.upgrades.armor ? pack.upgrade : pack.base;
    this.equipmentKey = eqKey ?? "";
    this.equipmentFightKey = fightKey ?? "";
    this.equipmentShootKey = shootKey ?? "";
    this.armor = { rating: armor.ar, penalty: armor.penalty, bulk: armor.bulk };
    this.shields = !!pack.shields;
    const fightPack = packOf(fightKey);
    this.fightDamage = this.#damage(this.upgrades.fighting ? fightPack.upgrade.fight : fightPack.base.fight);
    const shootPack = shootKey ? packOf(shootKey) : null;
    const shoot = shootPack ? (this.upgrades.marksmanship ? shootPack.upgrade.shoot : shootPack.base.shoot) : null;
    this.shootDamage = shoot ? this.#damage(shoot) : null;
    this.shootRange = shoot ? ASOIAF.unitRanges[shoot[2]] : 0;
    this.shootRangeKey = shoot?.[2] ?? "";

    // Discipline : entraînement + types, +3 par désorganisation, -3 si un personnage est rattaché.
    const training = ASOIAF.unitTraining[this.training];
    this.discipline = Math.max(0, training.discipline + this.disciplineMod
      + selected.reduce((t, k) => t + ASOIAF.unitTypes[k].discipline, 0)
      + 3 * this.disorganizations
      - (this.attached ? 3 : 0)
      + (this.gear.wildfire ? ASOIAF.unitGear.wildfire.discipline : 0));

    // Équipements spéciaux et abri (tour de siège, bélier couvert).
    let shelter = null;
    try {
      shelter = this.shelter ? fromUuidSync(this.shelter) : null;
    } catch {
      // Les acteurs ne sont pas encore tous chargés : l'abri sera pris en compte au prochain calcul.
    }
    this.shelterActor = shelter?.type === "siege" && shelter.system.status !== "destroyed" ? shelter : null;
    const shelterDefense = this.shelterActor ? (ASOIAF.siegeEngines[this.shelterActor.system.kind]?.shelterDefense ?? 0) : 0;
    const gearDefense = this.gear.turtle ? ASOIAF.unitGear.turtle.defense : 0;
    this.canAttack = !Object.entries(ASOIAF.unitGear).some(([k, g]) => g.noAttack && this.gear[k]);

    // Expérience : 20 XP par rang au-dessus de 2 dans les capacités clés.
    this.keyAbilities = [...new Set(selected.flatMap(k => ASOIAF.unitTypes[k].abilities))];
    this.xpTotal = training.xp;
    this.xpSpent = this.keyAbilities.reduce((t, k) => t + Math.max(0, a[k].value - 2) * 20, 0);

    // Défense contre les unités, et contre les personnages (+20).
    this.defense = a.agility.value + a.athletics.value + a.awareness.value + this.armor.penalty + this.defenseMod
      + shelterDefense + gearDefense;
    this.currentDefense = this.defendResult > 0 ? this.defendResult + shelterDefense + gearDefense : this.defense;
    this.shootDefense = this.currentDefense + (this.gear.mantlet ? ASOIAF.unitGear.mantlet.shootDefense : 0);
    this.combatDefense = this.currentDefense + 20;
    this.health.max = a.endurance.value * 3;

    // Déplacement : 40 m (infanterie), 80 m (cavalerie), 60 m (navires, sans course), -10 par point d'encombrement.
    const naval = selected.includes("warships");
    const baseMove = naval ? 60 : selected.includes("cavalry") ? 80 : 40;
    let move = Math.max(10, baseMove - 10 * this.armor.bulk);
    if (this.gear.mantlet) move = Math.max(10, move + ASOIAF.unitGear.mantlet.move);
    // Tortue, tour de siège et bélier couvert avancent à 10 m par round.
    if (this.gear.turtle || this.shelterActor) move = 10;
    this.movement = move;
    this.sprint = naval || this.gear.turtle || this.shelterActor ? move : move * 4;
    this.penaltyDice = this.disorganizations;
  }

  #damage([ability, mod]) {
    return { ability, mod, value: Math.max(1, (this.abilities[ability]?.value ?? 2) + mod) };
  }

  /** Données d'un test d'unité (même forme que pour un personnage). */
  getTestData(ability) {
    const attacking = ["fighting", "marksmanship"].includes(ability);
    return {
      testDice: this.abilities[ability].value + (attacking && this.attached ? 1 : 0),
      bonusDice: 0,
      penaltyDice: this.penaltyDice,
      modifier: 0,
      convert: 0,
      convertHalf: false,
      reroll1: 0,
      reroll6: false,
      damageBonus: 0,
      damageAfter: 0,
      situational: []
    };
  }

  /** Le commandant attitré (si défini). */
  get commanderActor() {
    return this.commander ? fromUuidSync(this.commander) : null;
  }

  get attachedActor() {
    return this.attached ? fromUuidSync(this.attached) : null;
  }
}
