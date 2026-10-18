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
      status: new StringField({ required: true, initial: "ready", choices: ["ready", "disorganized", "routed", "destroyed", "surrendered"] }),
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
      burning: new SchemaField({ damage: num(0, { min: 0 }), rounds: num(0, { min: 0 }) }),
      // Bataille (chapitre 10) : armée, champ de bataille, formation, ordres en attente.
      army: text(),
      terrain: new StringField({ required: true, initial: "open", choices: Object.keys(ASOIAF.battleTerrain) }),
      road: new BooleanField({ initial: false }),
      fortification: new StringField({ required: true, initial: "none", choices: Object.keys(ASOIAF.battleFortifications) }),
      fortificationMod: num(0),
      formation: new StringField({ required: true, initial: "none", choices: Object.keys(ASOIAF.formations) }),
      concealed: new BooleanField({ initial: false }),
      activated: new BooleanField({ initial: false }),
      readied: text(),
      setForCharge: new BooleanField({ initial: false }),
      probing: new BooleanField({ initial: false }),
      sapping: new BooleanField({ initial: false }),
      suppressed: num(0, { min: 0 }),
      enveloping: text()
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
    // Règle maison : elle peut être négative (une très bonne unité facilite les ordres).
    const training = ASOIAF.unitTraining[this.training];
    const formation = ASOIAF.formations[this.formation] ?? ASOIAF.formations.none;
    this.formationData = formation;
    this.discipline = training.discipline + this.disciplineMod
      + selected.reduce((t, k) => t + ASOIAF.unitTypes[k].discipline, 0)
      + 3 * this.disorganizations
      - (this.attached ? 3 : 0)
      + (this.gear.wildfire ? ASOIAF.unitGear.wildfire.discipline : 0)
      + (formation.discipline ?? 0);
    // Difficulté pour donner un ordre : Discipline, plus un tir de barrage subi ce round.
    this.orderDifficulty = this.discipline + this.suppressed;

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
    this.canAttack = !Object.entries(ASOIAF.unitGear).some(([k, g]) => g.noAttack && this.gear[k]) && !formation.noAttack;

    // Expérience : 20 XP par rang au-dessus de 2 dans les capacités clés.
    this.keyAbilities = [...new Set(selected.flatMap(k => ASOIAF.unitTypes[k].abilities))];
    this.xpTotal = training.xp;
    this.xpSpent = this.keyAbilities.reduce((t, k) => t + Math.max(0, a[k].value - 2) * 20, 0);

    // Champ de bataille : fortification (toujours), couvert du terrain (unité en défense), formation.
    const terrain = ASOIAF.battleTerrain[this.terrain] ?? {};
    this.terrainData = terrain;
    this.fortificationDefense = Math.max(0, (ASOIAF.battleFortifications[this.fortification]?.defense ?? 0) + this.fortificationMod);
    this.defending = this.defendResult > 0 || this.standingOrder === "defend";
    this.coverDefense = this.defending ? (terrain.cover ?? 0) : 0;
    const battleDefense = this.fortificationDefense + this.coverDefense + (formation.defense ?? 0)
      + (this.probing ? 2 : 0) - (this.sapping ? 5 : 0);

    // Défense contre les unités (Combat), contre le Tir, et contre les personnages (+20).
    this.defense = a.agility.value + a.athletics.value + a.awareness.value + this.armor.penalty + this.defenseMod
      + shelterDefense + gearDefense;
    const base = (this.defendResult > 0 ? this.defendResult + shelterDefense + gearDefense : this.defense) + battleDefense;
    this.currentDefense = base + (formation.meleeDefense ?? 0);
    this.shootDefense = base + (formation.shootDefense ?? 0) + (this.gear.mantlet ? ASOIAF.unitGear.mantlet.shootDefense : 0);
    this.combatDefense = this.currentDefense + 20;
    this.health.max = a.endurance.value * 3;

    // Déplacement : 40 m (infanterie), 80 m (cavalerie), 60 m (navires, sans course), -10 par point d'encombrement.
    const naval = selected.includes("warships");
    const baseMove = naval ? 60 : selected.includes("cavalry") ? 80 : 40;
    let move = Math.max(10, baseMove - 10 * this.armor.bulk);
    if (this.gear.mantlet) move = Math.max(10, move + ASOIAF.unitGear.mantlet.move);
    // Tortue, tour de siège et bélier couvert avancent à 10 m par round.
    if (this.gear.turtle || this.shelterActor) move = 10;
    // Terrain lent (-10 m par cran ; une route en retire un), formation, obscurité.
    let slow = (terrain.slow ?? 0) + (formation.slow ?? 0) + (sceneBattlefield().dark ? 1 : 0);
    if (this.road) slow = Math.max(0, slow - 1);
    move = Math.max(10, move - 10 * slow);
    if (formation.noMove) move = 0;
    this.movement = move;
    this.sprint = naval || this.gear.turtle || this.shelterActor || formation.noMove ? move : move * 4;
    this.noCavalry = !!terrain.noCavalry && !this.road && selected.includes("cavalry");
    this.penaltyDice = this.disorganizations;
  }

  #damage([ability, mod]) {
    return { ability, mod, value: Math.max(1, (this.abilities[ability]?.value ?? 2) + mod) };
  }

  /**
   * Données d'un test d'unité (même forme que pour un personnage), avec le champ de bataille :
   * visibilité et météo de la scène, formation en colonne, dés bonus du terrain pour le défenseur.
   */
  getTestData(ability) {
    const attacking = ["fighting", "marksmanship"].includes(ability);
    const field = sceneBattlefield();
    let penaltyDice = this.penaltyDice + (field.dice[ability] ?? 0);
    if (ability === "fighting") penaltyDice += this.formationData?.fightPenalty ?? 0;
    const army = this.armyActor;
    const bonusDice = attacking && army?.system.side === "defender"
      ? Math.min(this.terrainData?.bonusDice ?? 0, this.abilities[ability].value) : 0;
    return {
      testDice: this.abilities[ability].value + (attacking && this.attached ? 1 : 0),
      bonusDice,
      penaltyDice,
      modifier: attacking ? field.modifier : 0,
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

  /** L'armée de l'unité (si elle en a une). */
  get armyActor() {
    try {
      const army = this.army ? fromUuidSync(this.army) : null;
      return army?.type === "army" ? army : null;
    } catch {
      return null;
    }
  }
}

/** Conditions du champ de bataille de la scène affichée : visibilité et météo. */
export function sceneBattlefield() {
  const scene = globalThis.game?.scenes?.viewed ?? globalThis.game?.scenes?.active;
  const flag = scene?.getFlag?.("asoiaf", "battlefield") ?? {};
  const weather = ASOIAF.battleWeather[flag.weather] ?? ASOIAF.battleWeather.clear;
  const visibilityKey = weather.dark ? "dark" : flag.visibility ?? "clear";
  const visibility = ASOIAF.battleVisibility[visibilityKey] ?? ASOIAF.battleVisibility.clear;
  return {
    visibility: visibilityKey,
    weather: flag.weather ?? "clear",
    dice: visibility.dice ?? {},
    dark: !!visibility.slow,
    modifier: weather.modifier ?? 0
  };
}
