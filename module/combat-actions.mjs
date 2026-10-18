/**
 * Combat (chapitre 9) : actions d'attaque, qualités d'armes, effets sur la cible,
 * actions hors arme, guérison, fatigue, joute et conséquences de la défaite.
 */
import { ASOIAF } from "./config.mjs";
import { promptTest } from "./dice.mjs";
import { addCondition, hasCondition, removeCondition } from "./conditions.mjs";

const loc = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);
export const IGNORE_AR = 99;

/* -------------------------------------------- */
/*  Qualités d'armes                            */
/* -------------------------------------------- */

/** Lit les qualités d'une arme (texte français ou anglais). */
export function parseQualities(text = "") {
  const t = String(text);
  const num = re => Number(t.match(re)?.[1] ?? 0);
  const has = re => re.test(t);
  return {
    adaptable: has(/adaptable/i),
    fast: has(/rapide|\bfast\b/i),
    slow: has(/lente|\bslow\b/i),
    fragile: has(/fragile/i),
    grab: has(/saisie|\bgrab\b/i),
    impale: has(/empalement|impale/i),
    entangling: has(/entravante|entangling/i),
    shattering: num(/(?:fracassante|shattering)\s*(\d+)/i),
    staggering: has(/étourdissante|staggering/i),
    vicious: has(/vicieuse|vicious/i),
    mounted: has(/montée|\bmounted\b/i),
    twoHanded: has(/deux mains|two-handed/i),
    unwieldy: has(/malcommode|unwieldy/i),
    reach: has(/allonge|\breach\b/i),
    offhand: num(/(?:main gauche|off-hand)\s*\+?(\d+)/i),
    longRange: has(/longue portée|long range/i),
    closeRange: has(/courte portée|close range/i),
    powerful: has(/puissante|powerful/i),
    setForCharge: has(/contre-charge|set for charge/i)
  };
}

/* -------------------------------------------- */
/*  Fenêtre d'attaque                           */
/* -------------------------------------------- */

const LESSER = "lesser";
const GREATER = "greater";
/** Actions d'attaque : type d'action et condition d'accès. */
const ATTACK_ACTIONS = {
  standard: { type: LESSER },
  charge: { type: GREATER, melee: true },
  cautious: { type: LESSER, melee: true },
  reckless: { type: GREATER, melee: true },
  twoWeapon: { type: GREATER, melee: true, offhand: true },
  divided: { type: GREATER, divided: true },
  disarm: { type: GREATER, melee: true, special: true },
  knockout: { type: LESSER, melee: true, special: true },
  maneuver: { type: LESSER, melee: true, special: true },
  pull: { type: GREATER, melee: true, special: true, pull: true }
};

/** Arme de main gauche équipée en plus de l'arme utilisée. */
function offhandWeapon(actor, weapon) {
  return actor.items.find(i => i.type === "weapon" && i.system.equipped && i.id !== weapon.id
    && parseQualities(i.system.qualities).offhand > 0) ?? null;
}

/**
 * Contexte d'attaque pour la fenêtre de jet : actions possibles et options proposées.
 */
export function attackContext(actor, weapon) {
  const q = parseQualities(weapon.system.qualities);
  const melee = weapon.system.ability === "fighting";
  const targets = [...game.user.targets].map(t => t.actor).filter(a => a?.system);
  const target = targets[0] ?? null;
  const offhand = melee ? offhandWeapon(actor, weapon) : null;
  const actions = Object.entries(ATTACK_ACTIONS).filter(([, a]) => {
    if (a.melee && !melee) return false;
    if (a.offhand && !offhand) return false;
    if (a.divided && (q.slow || targets.length < 2)) return false;
    if (a.pull && !(q.grab || weapon.system.specialty === "polearms")) return false;
    return true;
  }).map(([key, a]) => ({ key, label: `${loc(`ASOIAF.Attack.${key}`)} (${loc(`ASOIAF.Attack.${a.type}`)})` }));
  const mounted = hasCondition(actor, "mounted");
  const auto = [];
  if (target && melee && hasCondition(target, "prone")) auto.push(loc("ASOIAF.Attack.autoProne"));
  if (target?.system.helpless) auto.push(loc("ASOIAF.Attack.autoHelpless"));
  if (offhand) auto.push(fmt("ASOIAF.Attack.offhandReady", { name: offhand.name, bonus: parseQualities(offhand.system.qualities).offhand }));
  return {
    actions,
    melee,
    ranged: !melee,
    q,
    mounted,
    targetMounted: target ? hasCondition(target, "mounted") : false,
    showTwoHands: q.adaptable || q.twoHanded,
    twoHands: q.twoHanded,
    auto,
    targetCount: targets.length,
    vicious: q.vicious
  };
}

/**
 * Applique les choix de la fenêtre d'attaque. Renvoie les surcharges pour rollTest
 * (dés, Difficulté, dégâts, effets), ou une liste de jets pour une attaque divisée.
 */
export async function confirmAttack(actor, weapon, form, c, options) {
  const q = parseQualities(weapon.system.qualities);
  const melee = weapon.system.ability === "fighting";
  const action = form.action || "standard";
  const targets = [...game.user.targets].map(t => t.actor).filter(a => a?.system);
  const target = targets[0] ?? null;
  const effects = [];
  let damage = options.damage;
  let difficulty = form.difficulty === "" || form.difficulty === null ? null : Number(form.difficulty);
  const note = key => effects.push(loc(`ASOIAF.Attack.${key}`));

  if (form.aim) { c.bonusDice += 1; note("aimNote"); }
  if (form.surprise) { c.testDice += 1; note("surpriseNote"); }
  if (form.higherGround && melee) { c.bonusDice += 1; note("higherNote"); }
  if (form.targetSprinted) { c.penaltyDice += 1; note("sprintedNote"); }
  const mounted = !!form.mounted;
  if (melee && mounted && !form.targetMounted) { c.bonusDice += 1; note("mountedNote"); }
  if (q.mounted && !mounted) { c.penaltyDice += 2; note("mountedWeaponNote"); }
  if (q.unwieldy && mounted) { c.penaltyDice += 2; note("unwieldyNote"); }
  if (q.twoHanded && !form.twoHands) { c.penaltyDice += 2; note("oneHandNote"); }
  if (q.adaptable && form.twoHands && damage !== null) { damage += 1; note("adaptableNote"); }
  if (q.reach && form.tooClose) { c.penaltyDice += 1; note("reachNote"); }
  const distance = Number(form.distance) || 0;
  if (!melee && distance > 0) {
    const range = q.longRange ? 100 : 10;
    const extra = Math.max(0, Math.ceil((distance - range) / range));
    if (extra) { c.penaltyDice += extra; effects.push(fmt("ASOIAF.Attack.rangeNote", { n: extra })); }
  }
  // État de la cible : à terre (mêlée) ou sans défense.
  if (target && melee && hasCondition(target, "prone")) { c.testDice += 1; note("autoProne"); }
  if (target?.system.helpless) { c.testDice += 1; note("autoHelpless"); }

  const attack = {
    action, attackerUuid: actor.uuid, weaponUuid: weapon.uuid, targetUuid: target?.uuid ?? null,
    q, melee, weaponName: weapon.name
  };
  let piercing = options.piercing;

  switch (action) {
    case "charge":
      c.penaltyDice += 1;
      if (damage !== null) damage += 2;
      note("chargeNote");
      break;
    case "cautious":
      c.penaltyDice += 1;
      await addCondition(actor, "cautious", { duration: "turn" });
      note("cautiousNote");
      break;
    case "reckless":
      c.testDice += 1;
      await addCondition(actor, "reckless", { duration: "turn" });
      note("recklessNote");
      break;
    case "twoWeapon": {
      const off = offhandWeapon(actor, weapon);
      if (off) {
        const bonus = parseQualities(off.system.qualities).offhand;
        if (damage !== null) damage += bonus;
        effects.push(fmt("ASOIAF.Attack.twoWeaponNote", { name: off.name, bonus }));
        if ((off.system.defensive ?? 0) > 0) await addCondition(actor, "offhand", { duration: "turn" });
      }
      break;
    }
    case "disarm":
    case "maneuver":
      if (target?.system.passive) difficulty = target.system.passive("fighting");
      damage = null;
      note(`${action}Note`);
      break;
    case "knockout":
      if (target?.system.passive) difficulty = target.system.passive("endurance", "resilience");
      damage = null;
      note("knockoutNote");
      break;
    case "pull":
      if (target?.system.passive) difficulty = target.system.passive("animalHandling", "ride");
      damage = null;
      note("pullNote");
      break;
    case "divided": {
      // Les dés de test (et bonus) sont répartis entre les cibles ; une arme Rapide donne +1B à chaque test.
      const n = targets.length;
      return {
        rolls: targets.map((t, i) => {
          const testDice = Math.floor(c.testDice / n) + (i < c.testDice % n ? 1 : 0);
          const bonusDice = Math.min(testDice, Math.floor(c.bonusDice / n) + (i < c.bonusDice % n ? 1 : 0)) + (q.fast ? 1 : 0);
          return {
            label: `${options.label} → ${t.name}`,
            testDice, bonusDice,
            difficulty: t.system.combatDefense ?? difficulty,
            damage, piercing,
            effects: [...effects, loc("ASOIAF.Attack.dividedNote"), ...(q.fast ? [loc("ASOIAF.Attack.fastNote")] : [])],
            attack: { ...attack, targetUuid: t.uuid },
            targetUuid: t.uuid
          };
        })
      };
    }
  }
  if (distractedTarget(target)) await removeCondition(target, "distracted");
  return { damage, difficulty, effects, attack, targetUuid: target?.uuid ?? null, piercing };
}

/** Une cible distraite cesse de l'être dès qu'on l'attaque. */
function distractedTarget(target) {
  return target?.isOwner && hasCondition(target, "distracted");
}

/* -------------------------------------------- */
/*  Après le jet : effets proposés              */
/* -------------------------------------------- */

/** Coups critiques et maladresses (règles optionnelles des réglages du monde). */
export function criticalResult(attack, outcome, total, difficulty, dice) {
  if (!attack || !outcome) return null;
  if (outcome.success && game.settings.get("asoiaf", "criticals") && difficulty > 0 && total >= 2 * difficulty) {
    const sixes = dice.filter(d => d.status === "kept" && d.value === 6).length;
    const key = ASOIAF.criticals[Math.min(sixes, ASOIAF.criticals.length - 1)];
    return key ? { type: "critical", key, sixes } : null;
  }
  if (!outcome.success && game.settings.get("asoiaf", "fumbles") && dice.length && dice.every(d => d.value === 1)) {
    const key = ASOIAF.fumbles[Math.min(dice.length, ASOIAF.fumbles.length - 1)];
    return { type: "fumble", key, ones: dice.length };
  }
  return null;
}

/** Bonus de dégâts de base d'un critique. */
export function criticalDamage(crit) {
  if (crit?.type !== "critical") return 0;
  return { solid: 2, powerful: 4 }[crit.key] ?? 0;
}

/**
 * Boutons d'effets d'une attaque réussie (ou ratée) sur la carte.
 * Chaque bouton porte une clé traitée par applyCombatEffect.
 */
export function attackButtons(attack, outcome, total, crit) {
  const buttons = [];
  if (!attack || !outcome) return buttons;
  const add = (effect, extra = {}) => buttons.push({ effect, label: loc(`ASOIAF.Attack.btn_${effect}`), ...extra });
  const deg = outcome.degrees;
  const target = attack.targetUuid ? fromUuidSync(attack.targetUuid) : null;
  if (!outcome.success) {
    if (attack.action === "disarm" && outcome.critical) add("selfDisarmed");
    return buttons;
  }
  switch (attack.action) {
    case "disarm": if (deg >= 2) add("disarm"); return buttons;
    case "knockout": add(deg >= 2 ? "knockOut" : "stun"); return buttons;
    case "maneuver": add("maneuver"); return buttons;
    case "pull": add("pull"); return buttons;
  }
  const q = attack.q;
  if (q.entangling) add("entangle");
  if (q.grab && (!target?.system.passive || total >= target.system.passive("athletics", "strength"))) add("grab");
  if (q.impale && deg >= 3) add("impale");
  if (q.shattering && deg >= 2) add("shatter", { value: q.shattering });
  if (q.staggering && deg >= 2) add("stagger");
  if (q.fragile && deg >= 2) add("breakWeapon");
  if (crit?.type === "critical") {
    if (["bloody"].includes(crit.key)) add("bloody");
    if (["crippling"].includes(crit.key)) add("crippling");
    if (["killing", "terrible", "impressive", "horrible"].includes(crit.key)) add("kill");
  }
  return buttons;
}

/** Acteur cible d'un bouton : celui de l'attaque, sinon la cible actuelle. */
function buttonTarget(attack) {
  if (attack?.targetUuid) return fromUuidSync(attack.targetUuid);
  return [...game.user.targets][0]?.actor ?? null;
}

/** Blessure légère infligée (critique sanglant) : grave si les légères sont pleines, mort ensuite. */
async function inflictInjury(actor, wound = false) {
  const s = actor.system;
  const end = s.abilities.endurance.value;
  if (!wound && s.injuries < end) return actor.update({ "system.injuries": s.injuries + 1 });
  if (s.wounds < end) {
    await actor.update({ "system.wounds": s.wounds + 1 });
    if (s.wounds + 1 >= end) await killActor(actor);
    return;
  }
  return killActor(actor);
}

async function killActor(actor) {
  await actor.update({ "system.health.value": 0 });
  try { await actor.toggleStatusEffect?.("dead", { active: true, overlay: true }); } catch {}
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${fmt("ASOIAF.Chat.dead", { name: actor.name })}</strong></p>` });
}

async function note(actor, key, data = {}) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${fmt(key, { name: actor?.name, ...data })}</p>` });
}

/** Bouton d'effet d'une carte d'attaque. */
export async function applyCombatEffect(message, effect, button) {
  const attack = message.getFlag("asoiaf", "attack");
  const attacker = attack ? fromUuidSync(attack.attackerUuid) : null;
  const weapon = attack?.weaponUuid ? fromUuidSync(attack.weaponUuid) : null;
  const selfEffects = ["selfDisarmed", "breakWeapon", "impale"];
  const actor = selfEffects.includes(effect) ? attacker : buttonTarget(attack);
  if (!actor) return ui.notifications.warn(loc("ASOIAF.Chat.noTarget"));
  if (!actor.isOwner) return ui.notifications.warn(loc("ASOIAF.Warn.notOwner"));

  switch (effect) {
    case "disarm":
    case "selfDisarmed": {
      const weapons = actor.items.filter(i => i.type === "weapon" && i.system.equipped && i.system.specialty !== "shields");
      for (const w of weapons) await w.update({ "system.equipped": false });
      await addCondition(actor, "disarmed");
      return note(actor, "ASOIAF.Attack.disarmed", { weapon: weapons.map(w => w.name).join(", ") || "—" });
    }
    case "stun": {
      const r = await new Roll("1d6").evaluate();
      await addCondition(actor, "stunned", { duration: "rounds", rounds: r.total });
      return note(actor, "ASOIAF.Attack.stunned", { rounds: r.total });
    }
    case "knockOut": {
      const r = await new Roll("1d6").evaluate();
      await addCondition(actor, "unconscious", { duration: "rounds", rounds: r.total * 10 });
      return note(actor, "ASOIAF.Attack.knockedOut", { minutes: r.total });
    }
    case "maneuver":
      await addCondition(actor, "maneuvered", { duration: "rounds", rounds: 1 });
      return note(actor, "ASOIAF.Attack.maneuvered", { degrees: Number(button.dataset.degrees) || 1 });
    case "pull":
      await removeCondition(actor, "mounted");
      await addCondition(actor, "prone");
      return note(actor, "ASOIAF.Attack.pulled");
    case "entangle":
      await addCondition(actor, "entangled");
      return note(actor, "ASOIAF.Attack.entangled");
    case "grab":
      await addCondition(actor, "grabbed");
      return note(actor, "ASOIAF.Attack.grabbed");
    case "impale": {
      // L'attaquant doit garder son arme : Athlétisme Exigeant (9).
      const test = actor.system.getTestData("athletics", "strength");
      const result = await promptTest({ actor, label: loc("ASOIAF.Attack.impaleTest"), ...test, difficulty: 9 });
      const target = attack.targetUuid ? fromUuidSync(attack.targetUuid) : null;
      if (result?.outcome?.success) {
        if (target?.isOwner) await addCondition(target, "impaled");
        return note(actor, "ASOIAF.Attack.impaled", { target: target?.name ?? "" });
      }
      if (weapon) await weapon.update({ "system.equipped": false });
      return note(actor, "ASOIAF.Attack.impaleLost", { weapon: weapon?.name ?? "" });
    }
    case "shatter": return shatter(actor, Number(button.dataset.value) || 1);
    case "stagger": {
      const total = Number(button.dataset.damage) || 0;
      if (total > 0) await actor.applyDamage(total, Number(button.dataset.piercing) || 0, { vicious: attack.q?.vicious });
      await addCondition(actor, "staggered", { duration: "turnEnd" });
      return note(actor, "ASOIAF.Attack.staggered");
    }
    case "breakWeapon":
      if (weapon) await weapon.update({ name: `${weapon.name} (${loc("ASOIAF.Attack.broken")})`, "system.equipped": false });
      return note(actor, "ASOIAF.Attack.weaponBroke", { weapon: weapon?.name ?? "" });
    case "prone":
      await addCondition(actor, "prone");
      return note(actor, "ASOIAF.Attack.knockedDown");
    case "distract":
      await addCondition(actor, "distracted", { duration: "turnEnd" });
      return note(actor, "ASOIAF.Attack.distracted");
    case "bloody": return inflictInjury(actor, false);
    case "crippling": return inflictInjury(actor, true);
    case "kill": return killActor(actor);
  }
}

/** Fracassante : réduit d'abord le bonus défensif d'une arme équipée, sinon la VA de l'armure (détruite à 0). */
async function shatter(actor, amount) {
  const shield = actor.items.find(i => i.type === "weapon" && i.system.equipped && i.system.defensive > 0);
  const armor = actor.items.find(i => i.type === "armor" && i.system.equipped);
  const item = shield ?? armor;
  if (!item) return note(actor, "ASOIAF.Attack.nothingToShatter");
  const key = shield ? "system.defensive" : "system.rating";
  const value = Math.max(0, (shield ? item.system.defensive : item.system.rating) - amount);
  if (value <= 0) {
    await item.update({ [key]: 0, "system.equipped": false, name: `${item.name} (${loc("ASOIAF.Attack.destroyed")})` });
    return note(actor, "ASOIAF.Attack.shatteredDestroyed", { item: item.name });
  }
  await item.update({ [key]: value });
  return note(actor, "ASOIAF.Attack.shattered", { item: item.name, value });
}

/* -------------------------------------------- */
/*  Défaite                                     */
/* -------------------------------------------- */

/** Boutons de conséquences d'une défaite (Santé à 0). */
export function defeatButtons(vicious) {
  const keys = vicious ? ["death"] : ["death", "maim", "unconscious", "ransom"];
  return `${vicious ? `<p class="warning">${loc("ASOIAF.Defeat.vicious")}</p>` : ""}
    <div class="buttons-row defeat-buttons">${keys.map(k =>
    `<button type="button" data-action="defeat" data-kind="${k}">${loc(`ASOIAF.Defeat.${k}`)}</button>`).join("")}</div>`;
}

/** Conséquence de la défaite choisie par le vainqueur. */
export async function applyDefeat(message, kind) {
  const hit = message.getFlag("asoiaf", "damage");
  const actor = hit ? fromUuidSync(hit.actorUuid) : null;
  if (!actor) return;
  if (!actor.isOwner) return ui.notifications.warn(loc("ASOIAF.Warn.notOwner"));
  switch (kind) {
    case "death": return killActor(actor);
    case "unconscious": {
      const r = await new Roll("2d6").evaluate();
      await addCondition(actor, "unconscious");
      return note(actor, "ASOIAF.Defeat.unconsciousText", { hours: r.total });
    }
    case "maim": {
      const options = Object.keys(ASOIAF.abilities).map(a => `<option value="${a}">${loc(`ASOIAF.Ability.${a}`)}</option>`).join("");
      const ability = await foundry.applications.api.DialogV2.prompt({
        window: { title: loc("ASOIAF.Defeat.maim") },
        content: `<div class="asoiaf-dialog"><p>${loc("ASOIAF.Defeat.maimText")}</p><select name="ability">${options}</select></div>`,
        ok: { callback: (e, b) => b.form.elements.ability.value },
        rejectClose: false
      });
      if (!ability) return;
      const path = `system.abilities.${ability}.value`;
      await actor.update({ [path]: Math.max(1, actor.system.abilities[ability].value - 1) });
      return note(actor, "ASOIAF.Defeat.maimed", { ability: loc(`ASOIAF.Ability.${ability}`) });
    }
    case "ransom": return note(actor, "ASOIAF.Defeat.ransomText");
  }
}

/* -------------------------------------------- */
/*  Actions hors arme                           */
/* -------------------------------------------- */

const firstTarget = () => [...game.user.targets][0]?.actor ?? null;

/** Carte de test + bouton qui applique un état à la cible. */
async function opposedAction(actor, { ability, specialty = null, label, difficulty, effect, situational = [], degrees = 1 }) {
  const target = firstTarget();
  const test = actor.system.getTestData(ability, specialty);
  const result = await promptTest({
    actor, label: target ? `${label} → ${target.name}` : label, ...test,
    situational: [...test.situational, ...situational], difficulty
  });
  if (!result?.outcome?.success || result.outcome.degrees < degrees) return result;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="asoiaf-chat"><button type="button" data-action="combat-effect" data-effect="${effect}" data-degrees="${result.outcome.degrees}">
      ${loc(`ASOIAF.Attack.btn_${effect}`)}${target ? ` (${target.name})` : ""}</button></div>`,
    flags: { asoiaf: { attack: { attackerUuid: actor.uuid, targetUuid: target?.uuid ?? null, q: {} } } }
  });
  return result;
}

/** Esquiver : test d'Agilité (Boucliers si l'on porte un bouclier) + bonus défensif = Défense jusqu'au prochain tour. */
export async function dodge(actor) {
  const test = actor.system.getTestData("agility");
  const shield = actor.items.some(i => i.type === "weapon" && i.system.equipped && i.system.specialty === "shields");
  if (shield) test.bonusDice += actor.system.abilities.fighting.specialties.shields;
  test.modifier += actor.system.defensiveBonus;
  const result = await promptTest({ actor, label: loc("ASOIAF.Action.dodge"), ...test });
  if (!result) return;
  await addCondition(actor, "dodging", { value: result.total, duration: "turn" });
  return note(actor, "ASOIAF.Action.dodged", { value: result.total });
}

/** Renverser : Athlétisme contre l'Agilité passive de la cible (+2 avec un déplacement). */
export function knockdown(actor) {
  const target = firstTarget();
  return opposedAction(actor, {
    ability: "athletics", specialty: "strength", label: loc("ASOIAF.Action.knockdown"),
    difficulty: target?.system.passive?.("agility") ?? null, effect: "prone",
    situational: [{ key: "move", source: "", label: loc("ASOIAF.Action.withMove"), summary: "+2",
      contrib: { testDice: 0, bonusDice: 0, penaltyDice: 0, modifier: 2, convert: 0, convertHalf: false, reroll1: 0, reroll6: false, damage: 0, damageAfter: 0 } }]
  });
}

/** Distraire : Ruse contre la Volonté passive ; la cible perd sa Vigilance de sa Défense. */
export function distract(actor) {
  const target = firstTarget();
  return opposedAction(actor, {
    ability: "cunning", label: loc("ASOIAF.Action.distract"),
    difficulty: target?.system.passive?.("will") ?? null, effect: "distract"
  });
}

/** Reprendre son souffle : Endurance Automatique (0), 1 point de dégâts récupéré par degré. */
export async function catchBreath(actor) {
  const test = actor.system.getTestData("endurance");
  const result = await promptTest({ actor, label: loc("ASOIAF.Action.catchBreath"), ...test, difficulty: 0 });
  if (!result?.outcome?.success) return;
  const s = actor.system.health;
  await actor.update({ "system.health.value": Math.min(s.max, s.value + result.outcome.degrees) });
  return note(actor, "ASOIAF.Action.breathCaught", { n: result.outcome.degrees });
}

/** Se libérer (entravé) : Athlétisme (Force) ou Agilité (Contorsions) Exigeant (9). Se réveiller (étourdi) : Endurance Redoutable (12). */
export async function freeSelf(actor, kind) {
  const def = {
    entangled: { ability: "athletics", specialty: "strength", difficulty: 9 },
    entangledAgility: { ability: "agility", specialty: "contortions", difficulty: 9, condition: "entangled" },
    stunned: { ability: "endurance", specialty: "resilience", difficulty: 12 },
    impaled: { ability: "athletics", specialty: "strength", difficulty: 9 }
  }[kind];
  if (!def) return;
  const condition = def.condition ?? kind;
  const test = actor.system.getTestData(def.ability, def.specialty);
  const result = await promptTest({ actor, label: loc(`ASOIAF.Action.free_${condition}`), ...test, difficulty: def.difficulty });
  if (!result?.outcome?.success) return;
  await removeCondition(actor, condition);
  if (condition === "stunned") await removeCondition(actor, "unconscious");
  // Arracher une arme plantée : 1 blessure légère (grave si les légères sont pleines).
  if (condition === "impaled") await inflictInjury(actor);
  return note(actor, "ASOIAF.Action.freed", { condition: loc(`ASOIAF.Condition.${condition}`) });
}

/** Se relever (action mineure, majeure si VA de base 6 ou plus). */
export async function standUp(actor) {
  await removeCondition(actor, "prone");
  const heavy = (actor.items.find(i => i.type === "armor" && i.system.equipped)?.system.rating ?? 0) >= 6;
  return note(actor, heavy ? "ASOIAF.Action.standUpHeavy" : "ASOIAF.Action.standUpDone");
}

/* -------------------------------------------- */
/*  Fatigue                                     */
/* -------------------------------------------- */

/** Accepter un point de fatigue pour ignorer un effet jusqu'au prochain tour. */
export async function takeFatigue(actor) {
  const s = actor.system;
  if (s.fatigue >= s.abilities.endurance.value) return ui.notifications.warn(loc("ASOIAF.Fatigue.max"));
  const uses = ["fatigueArmor", "fatigueWound", "fatigueInjuries", "lesser"];
  const use = await foundry.applications.api.DialogV2.prompt({
    window: { title: loc("ASOIAF.Fatigue.take") },
    content: `<div class="asoiaf-dialog"><p>${loc("ASOIAF.Fatigue.hint")}</p>
      <select name="use">${uses.map(u => `<option value="${u}">${loc(`ASOIAF.Fatigue.${u}`)}</option>`).join("")}</select></div>`,
    ok: { callback: (e, b) => b.form.elements.use.value },
    rejectClose: false
  });
  if (!use) return;
  await actor.update({ "system.fatigue": s.fatigue + 1 });
  if (use !== "lesser") await addCondition(actor, use, { duration: "turn" });
  return note(actor, "ASOIAF.Fatigue.taken", { use: loc(`ASOIAF.Fatigue.${use}`) });
}

/** Quatre heures de repos : un point de fatigue en moins. */
export async function rest(actor) {
  if (actor.system.fatigue <= 0) return;
  await actor.update({ "system.fatigue": actor.system.fatigue - 1 });
  return note(actor, "ASOIAF.Fatigue.rested");
}

/* -------------------------------------------- */
/*  Guérison (p. 166-167)                       */
/* -------------------------------------------- */

/**
 * Test de récupération : blessures légères (chaque jour) ou graves (chaque semaine),
 * Difficulté selon l'activité. Un soigneur (jeton sélectionné) peut tester Soins à la place.
 */
export async function recoverWounds(actor) {
  const s = actor.system;
  if (!s.injuries && !s.wounds) return ui.notifications.info(loc("ASOIAF.Recovery.nothing"));
  const healer = canvas?.tokens?.controlled?.map(t => t.actor).find(a => a?.system?.abilities && a.uuid !== actor.uuid) ?? null;
  const kinds = [s.injuries ? "injury" : null, s.wounds ? "wound" : null].filter(Boolean);
  const choice = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${loc("ASOIAF.Recovery.title")} — ${actor.name}` },
    content: `<div class="asoiaf-dialog">
      <div class="form-group"><label>${loc("ASOIAF.Recovery.kind")}</label><select name="kind">${kinds.map(k =>
        `<option value="${k}">${loc(`ASOIAF.Recovery.${k}`)}</option>`).join("")}</select></div>
      <div class="form-group"><label>${loc("ASOIAF.Recovery.activity")}</label><select name="activity">${["light", "moderate", "strenuous"].map(k =>
        `<option value="${k}">${loc(`ASOIAF.Recovery.${k}`)}</option>`).join("")}</select></div>
      <p class="hint">${healer ? fmt("ASOIAF.Recovery.healer", { name: healer.name }) : loc("ASOIAF.Recovery.noHealer")}</p></div>`,
    ok: { callback: (e, b) => ({ kind: b.form.elements.kind.value, activity: b.form.elements.activity.value }) },
    rejectClose: false
  });
  if (!choice) return;
  const difficulty = ASOIAF.recovery[choice.kind][choice.activity];
  const roller = healer ?? actor;
  const test = healer ? healer.system.getTestData("healing", "treatInjury") : actor.system.getTestData("endurance", "resilience");
  const result = await promptTest({ actor: roller, label: `${loc(`ASOIAF.Recovery.${choice.kind}`)} — ${actor.name}`, ...test, difficulty });
  if (!result?.outcome) return;
  const o = result.outcome;
  const fresh = actor.system;
  const end = fresh.abilities.endurance.value;
  if (o.success) {
    if (choice.kind === "injury") {
      const n = Math.min(fresh.injuries, o.degrees);
      await actor.update({ "system.injuries": fresh.injuries - n });
      return note(actor, "ASOIAF.Recovery.healedInjuries", { n });
    }
    const n = Math.min(fresh.wounds, 1 + Math.floor((o.degrees - 1) / 2));
    await actor.update({ "system.wounds": fresh.wounds - n });
    return note(actor, "ASOIAF.Recovery.healedWounds", { n });
  }
  // Échec critique sans soigneur : la blessure s'aggrave (une grave de trop : mort).
  if (o.critical && !healer) {
    if (choice.kind === "injury") return inflictInjury(actor, fresh.injuries >= end);
    return inflictInjury(actor, true);
  }
  return note(actor, "ASOIAF.Recovery.noProgress");
}

/* -------------------------------------------- */
/*  Joute (p. 167-169)                          */
/* -------------------------------------------- */

/**
 * Une passe de joute contre la cible : Combat (Lances) −1D contre son Dressage passif (Monte),
 * dégâts de la lance de tournoi (Dressage +3, Puissante, +2 de charge).
 */
export async function joust(actor) {
  const target = firstTarget();
  if (!target?.system?.abilities) return ui.notifications.warn(loc("ASOIAF.Chat.noTarget"));
  const choice = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${loc("ASOIAF.Joust.title")} → ${target.name}` },
    content: `<div class="asoiaf-dialog">
      <div class="form-group"><label>${loc("ASOIAF.Joust.maneuver")}</label><select name="maneuver">${Object.keys(ASOIAF.joustManeuvers).map(k =>
        `<option value="${k}">${loc(`ASOIAF.Joust.${k}`)}</option>`).join("")}</select></div>
      <div class="form-group"><label>${loc("ASOIAF.Joust.amount")}</label><select name="amount"><option value="1">1</option><option value="2">2</option></select></div>
      <p class="hint">${loc("ASOIAF.Joust.hint")}</p></div>`,
    ok: { callback: (e, b) => ({ maneuver: b.form.elements.maneuver.value, amount: Number(b.form.elements.amount.value) }) },
    rejectClose: false
  });
  if (!choice) return;
  await actor.setFlag("asoiaf", "joust", choice);
  const m = ASOIAF.joustManeuvers[choice.maneuver];
  const theirs = target.getFlag("asoiaf", "joust") ?? { maneuver: "none", amount: 1 };
  const tm = ASOIAF.joustManeuvers[theirs.maneuver] ?? ASOIAF.joustManeuvers.none;
  const amount = m.fixed ? 1 : choice.amount;
  const test = actor.system.getTestData("fighting", "spears");
  const a = actor.system.abilities;
  const base = a.animalHandling.value + 3 + a.athletics.specialties.strength + 2 + (tm.fixed ? 1 : 0);
  const difficulty = target.system.passive("animalHandling", "ride") + tm.passive * (tm.fixed ? 1 : theirs.amount);
  const result = await promptTest({
    actor, label: `${loc("ASOIAF.Joust.title")} → ${target.name}`, ...test,
    penaltyDice: test.penaltyDice + 1, modifier: test.modifier + m.fight * amount, difficulty,
    effects: [fmt("ASOIAF.Joust.pass", { maneuver: loc(`ASOIAF.Joust.${choice.maneuver}`), base })]
  });
  if (!result?.outcome) return;
  const o = result.outcome;
  let text;
  let button = "";
  if (!o.success) text = loc(o.critical ? "ASOIAF.Joust.miss" : "ASOIAF.Joust.shatterNoEffect");
  else {
    const saddle = ASOIAF.joustSaddle[Math.min(4, o.degrees)];
    text = fmt("ASOIAF.Joust.hit", { damage: base * o.degrees, saddle });
    button = `<button type="button" data-action="joust-hit" data-damage="${base * o.degrees}" data-base="${base}" data-saddle="${saddle}">
      ${fmt("ASOIAF.Joust.resolve", { name: target.name })}</button>`;
  }
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="asoiaf-chat"><p>${text}</p>${button}</div>`,
    flags: { asoiaf: { joust: { targetUuid: target.uuid } } }
  });
}

/** La cible encaisse le coup de lance puis tente de rester en selle ; désarçonnée, elle subit la chute (sans VA). */
export async function joustHit(message, button) {
  const flag = message.getFlag("asoiaf", "joust");
  const target = flag ? fromUuidSync(flag.targetUuid) : null;
  if (!target) return;
  if (!target.isOwner) return ui.notifications.warn(loc("ASOIAF.Warn.notOwner"));
  await target.applyDamage(Number(button.dataset.damage) || 0, 0);
  const mine = target.getFlag("asoiaf", "joust") ?? { maneuver: "none", amount: 1 };
  const m = ASOIAF.joustManeuvers[mine.maneuver] ?? ASOIAF.joustManeuvers.none;
  const test = target.system.getTestData("animalHandling", "ride");
  const result = await promptTest({
    actor: target, label: loc("ASOIAF.Joust.stay"), ...test,
    modifier: test.modifier + m.saddle * (mine.amount || 1), difficulty: Number(button.dataset.saddle) || 9
  });
  if (!result?.outcome || result.outcome.success) return;
  await target.applyDamage(Number(button.dataset.base) || 0, IGNORE_AR);
  await addCondition(target, "prone");
  return note(target, "ASOIAF.Joust.unhorsed");
}

/* -------------------------------------------- */
/*  Boutons des cartes                          */
/* -------------------------------------------- */

export function bindCombatButtons(message, html) {
  const on = (action, fn) => html.querySelectorAll(`[data-action='${action}']`).forEach(btn =>
    btn.addEventListener("click", event => {
      event.preventDefault();
      return fn(btn);
    }));
  on("combat-effect", btn => applyCombatEffect(message, btn.dataset.effect, btn));
  on("defeat", btn => applyDefeat(message, btn.dataset.kind));
  on("joust-hit", btn => joustHit(message, btn));
}

/** Valeur de couvert à poser depuis la fiche : 0 (retirer), 5 ou 10. */
export async function setCover(actor, value) {
  if (!value) return removeCondition(actor, "cover");
  return addCondition(actor, "cover", { value });
}
