/**
 * Guerre (chapitre 10) : ordres, attaques d'unités, dégâts et moral, fin de bataille.
 *
 * Un ordre se donne par un test d'Art de la guerre (Commandement) du commandant contre la
 * Discipline de l'unité (+3 par ordre déjà donné à cette unité ce round). En cas de réussite,
 * l'unité exécute l'ordre ; sinon elle suit son ordre permanent (rien sur un échec critique).
 */
import { ASOIAF } from "./config.mjs";
import { promptTest, readForm, rollTest } from "./dice.mjs";
import { throwWildfire, wildfireEruption } from "./siege.mjs";

const loc = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);
const DialogV2 = foundry.applications.api.DialogV2;

const STATUS_EFFECTS = {
  disorganized: "asoiaf-disorganized",
  routed: "asoiaf-routed",
  destroyed: "asoiaf-destroyed"
};

/** Effets de statut affichés sur les jetons (enregistrés dans CONFIG.statusEffects). */
export function registerStatusEffects() {
  CONFIG.statusEffects.push(
    { id: STATUS_EFFECTS.disorganized, name: "ASOIAF.Unit.status_disorganized", img: "icons/svg/daze.svg" },
    { id: STATUS_EFFECTS.routed, name: "ASOIAF.Unit.status_routed", img: "icons/svg/falling.svg" },
    { id: STATUS_EFFECTS.destroyed, name: "ASOIAF.Unit.status_destroyed", img: "icons/svg/skull.svg" }
  );
}

async function chat(unit, body) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: unit }),
    content: `<div class="asoiaf-chat unit-card"><h3>${unit.name}</h3>${body}</div>`
  });
}

/** Change l'état d'une unité et synchronise les icônes de ses jetons. */
export async function setStatus(unit, status, extra = {}) {
  await unit.update({ "system.status": status, ...extra });
  for (const [key, id] of Object.entries(STATUS_EFFECTS)) {
    const active = key === status;
    try {
      await unit.toggleStatusEffect?.(id, { active, overlay: key === "destroyed" });
    } catch (err) {
      console.warn("ASOIAF | Effet de statut", err);
    }
  }
}

/** Dégâts infligés à un personnage rattaché à l'unité (ignorent la VA). */
async function hurtAttached(unit, event) {
  const hero = unit.system.attachedActor;
  const damage = ASOIAF.attachedDamage[event];
  if (!hero?.system?.health || !damage) return;
  const value = Math.max(0, hero.system.health.value - damage);
  if (hero.isOwner) await hero.update({ "system.health.value": value });
  await chat(unit, `<p>${fmt("ASOIAF.Unit.attachedHurt", { name: hero.name, damage, value, max: hero.system.health.max })}</p>`);
}

/**
 * Dégâts reçus par une unité : VA déduite, puis désorganisation, déroute ou destruction.
 * - Santé à 0 : désorganisée (-1D, Discipline +3, cumulatif ; détruite si les pénalités atteignent l'Endurance).
 * - Touchée en étant désorganisée : en déroute. Touchée en déroute : détruite.
 * - Plus du double de sa Santé maximale en un coup : détruite.
 */
export async function applyUnitDamage(unit, amount, piercing = 0) {
  const s = unit.system;
  if (s.status === "destroyed") return;
  const ar = Math.max(0, s.armor.rating - piercing);
  const taken = Math.max(0, amount - ar);
  const lines = [fmt("ASOIAF.Unit.damageTaken", { name: unit.name, taken, ar })];

  if (taken <= 0) return chat(unit, `<p>${lines[0]}</p>`);

  let event = "damaged";
  if (taken > 2 * s.health.max || s.status === "routed") {
    await setStatus(unit, "destroyed", { "system.health.value": 0, "system.tookDamage": true });
    event = "destroyed";
  } else if (s.status === "disorganized") {
    await setStatus(unit, "routed", { "system.health.value": 0, "system.tookDamage": true });
    event = "routed";
  } else {
    const value = s.health.value - taken;
    if (value > 0) {
      await unit.update({ "system.health.value": value, "system.tookDamage": true });
    } else {
      const disorganizations = s.disorganizations + 1;
      const destroyed = disorganizations >= s.abilities.endurance.value;
      await setStatus(unit, destroyed ? "destroyed" : "disorganized", {
        "system.health.value": 0, "system.disorganizations": disorganizations, "system.tookDamage": true
      });
      event = destroyed ? "destroyed" : "disorganized";
    }
  }
  if (event !== "damaged") lines.push(`<strong>${loc(`ASOIAF.Unit.event_${event}`)}</strong>`);
  await chat(unit, `<p>${lines.join("<br>")}</p>`);
  await hurtAttached(unit, event);
  if (event !== "destroyed") await wildfireEruption(unit);
}

/* -------------------------------------------- */
/*  Ordres                                      */
/* -------------------------------------------- */

/** Commandants possibles : personnages présents sur la scène, plus le commandant attitré. */
function commanderChoices(unit) {
  const actors = new Map();
  const add = a => {
    if (a?.system?.abilities?.warfare && a.type !== "unit") actors.set(a.uuid, a);
  };
  add(unit.system.commanderActor);
  for (const t of canvas.tokens?.placeables ?? []) add(t.actor);
  for (const a of game.actors) if (a.isOwner && a.type === "character") add(a);
  return [...actors.values()];
}

/** Fenêtre « Donner un ordre ». */
export async function issueOrder(unit) {
  const s = unit.system;
  if (s.status === "destroyed") return ui.notifications.warn(loc("ASOIAF.Unit.warnDestroyed"));
  const commanders = commanderChoices(unit);
  const difficulty = s.discipline + 3 * s.ordersThisRound;
  const selected = s.standingOrder || "attack";
  const orders = Object.keys(ASOIAF.unitOrders)
    .map(o => `<option value="${o}" ${o === selected ? "selected" : ""}>${loc(`ASOIAF.Order.${o}`)}</option>`).join("");
  const options = commanders.map(a => `<option value="${a.uuid}" ${a.uuid === s.commander ? "selected" : ""}>${a.name}
    (${loc("ASOIAF.Ability.warfare")} ${a.system.abilities.warfare.value})</option>`).join("");

  const data = await DialogV2.prompt({
    window: { title: `${loc("ASOIAF.Unit.issueOrder")} — ${unit.name}` },
    position: { width: 440 },
    content: `
      <div class="form-group"><label>${loc("ASOIAF.Unit.order")}</label><select name="order">${orders}</select></div>
      <p class="hint order-hint">${loc(`ASOIAF.OrderHint.${selected}`)}</p>
      <div class="form-group"><label>${loc("ASOIAF.Unit.commander")}</label>
        <select name="commander"><option value="">${loc("ASOIAF.Unit.noCommander")}</option>${options}</select></div>
      <div class="form-group"><label>${loc("ASOIAF.Unit.discipline")}</label>
        <input type="number" name="difficulty" value="${difficulty}"></div>
      <label class="checkbox"><input type="checkbox" name="standing"> ${loc("ASOIAF.Unit.standingCheckbox")}</label>
      <p class="hint">${loc("ASOIAF.Unit.orderHint")}</p>`,
    ok: { label: loc("ASOIAF.Unit.give"), icon: "fa-solid fa-flag", callback: (e, button) => readForm(button.form) },
    // Description de l'ordre choisi, mise à jour à chaque changement.
    render: (event, dialog) => {
      const html = dialog instanceof HTMLElement ? dialog : dialog.element;
      const select = html.querySelector("select[name='order']");
      const hint = html.querySelector(".order-hint");
      select?.addEventListener("change", () => hint.textContent = loc(`ASOIAF.OrderHint.${select.value}`));
    },
    rejectClose: false
  });
  if (!data) return;

  // Ordre permanent : pas de test de commandement.
  if (data.standing) return executeOrder(unit, data.order, { degrees: 1 });

  const commander = data.commander ? fromUuidSync(data.commander) : null;
  const t = commander?.system?.getTestData?.("warfare", "command") ?? { testDice: 2, bonusDice: 0, penaltyDice: 0, modifier: 0 };
  const { outcome } = await rollTest({
    ...t,
    actor: commander,
    speaker: commander ? ChatMessage.getSpeaker({ actor: commander }) : ChatMessage.getSpeaker({ actor: unit }),
    label: `${loc(`ASOIAF.Order.${data.order}`)} → ${unit.name}`,
    difficulty: Number(data.difficulty)
  });
  await unit.update({ "system.ordersThisRound": s.ordersThisRound + 1 });

  if (outcome?.success) return executeOrder(unit, data.order, { degrees: outcome.degrees });
  if (outcome?.critical || !s.standingOrder) {
    return chat(unit, `<p class="warning">${loc(outcome?.critical ? "ASOIAF.Unit.orderCritical" : "ASOIAF.Unit.orderIgnored")}</p>`);
  }
  await chat(unit, `<p>${fmt("ASOIAF.Unit.followsStanding", { order: loc(`ASOIAF.Order.${s.standingOrder}`) })}</p>`);
  return executeOrder(unit, s.standingOrder, { degrees: 1, standing: true });
}

/** Exécute un ordre réussi (ou un ordre permanent). */
export async function executeOrder(unit, order, { degrees = 1, standing = false } = {}) {
  const def = ASOIAF.unitOrders[order];
  const s = unit.system;
  if (def?.persistent && !standing) await unit.update({ "system.standingOrder": order });

  switch (order) {
    case "attack":
    case "charge":
    case "withdraw":
      return unitAttack(unit, order);
    case "defend":
      return unitDefend(unit);
    case "move":
      return chat(unit, `<p>${fmt("ASOIAF.Unit.moves", { move: s.movement, sprint: s.sprint })}</p>`);
    case "organize":
      if (s.status !== "disorganized") return chat(unit, `<p>${loc("ASOIAF.Unit.nothingToOrganize")}</p>`);
      await setStatus(unit, "ready", { "system.health.value": s.health.max });
      return chat(unit, `<p>${loc("ASOIAF.Unit.organized")}</p>`);
    case "rally":
      if (s.status !== "routed") return chat(unit, `<p>${loc("ASOIAF.Unit.nothingToRally")}</p>`);
      await setStatus(unit, "disorganized");
      return chat(unit, `<p>${loc("ASOIAF.Unit.rallied")}</p>`);
    case "regroup": {
      const value = Math.min(s.health.max, s.health.value + degrees);
      await unit.update({ "system.health.value": value });
      return chat(unit, `<p>${fmt("ASOIAF.Unit.regrouped", { healed: value - s.health.value, value, max: s.health.max })}</p>`);
    }
    case "surrender":
      return chat(unit, `<p class="warning">${loc("ASOIAF.Unit.surrendered")}</p>`);
    default:
      return chat(unit, `<p>${loc(`ASOIAF.Order.${order}`)} : ${loc(`ASOIAF.OrderHint.${order}`)}</p>`);
  }
}

/** Ordre Défendre : un test d'Agilité remplace la Défense pour le round (+1D avec boucliers). */
async function unitDefend(unit) {
  const s = unit.system;
  const t = s.getTestData("agility");
  if (s.shields) t.testDice += 1;
  const result = await rollTest({ ...t, actor: unit, label: `${loc("ASOIAF.Order.defend")} — ${unit.name}` });
  await unit.update({ "system.defendResult": Math.max(1, result.total) });
  return chat(unit, `<p>${fmt("ASOIAF.Unit.defending", { defense: Math.max(1, result.total) })}</p>`);
}

/**
 * Attaque d'une unité contre la cible désignée (jeton ciblé).
 * Contre une unité : Défense de l'unité. Contre un personnage : +2D, Défense de combat du personnage.
 */
export async function unitAttack(unit, order = "attack", kind = null) {
  const s = unit.system;
  const def = ASOIAF.unitOrders[order] ?? {};
  const target = game.user.targets.first()?.actor ?? null;
  // Une unité armée de feu grégeois ne peut attaquer qu'avec lui ; certains équipements empêchent d'attaquer.
  if (s.gear.wildfire) return throwWildfire(unit);
  if (!s.canAttack) return ui.notifications.warn(loc("ASOIAF.Siege.cannotAttack"));
  // Une unité de tir choisit entre Combat et Tir (une charge se fait toujours au corps à corps).
  let ability = kind ?? "fighting";
  if (!kind && s.shootDamage && order !== "charge") {
    ability = await chooseKind(unit);
    if (!ability) return null;
  }
  const damage = ability === "marksmanship" ? s.shootDamage : s.fightDamage;
  const t = s.getTestData(ability);
  t.penaltyDice += def.penaltyDice ?? 0;
  if (target && target.type !== "unit") t.testDice += 2;

  let difficulty = null;
  if (target?.type === "unit") difficulty = ability === "marksmanship" ? target.system.shootDefense : target.system.currentDefense;
  else if (target && target.type !== "siege") difficulty = target.system.combatDefense ?? null;
  return promptTest({
    ...t,
    actor: unit,
    label: `${loc(`ASOIAF.Order.${order}`)} — ${unit.name} (${loc(`ASOIAF.Ability.${ability}`)})`,
    difficulty,
    damage: (damage?.value ?? 1) + (def.damage ?? 0),
    extra: target ? fmt("ASOIAF.Unit.attackTarget", { name: target.name }) : loc("ASOIAF.Unit.noTarget")
  });
}

async function chooseKind(unit) {
  return DialogV2.wait({
    window: { title: unit.name },
    content: `<p>${loc("ASOIAF.Unit.chooseAttack")}</p>`,
    buttons: [
      { action: "fighting", label: loc("ASOIAF.Ability.fighting"), icon: "fa-solid fa-hand-fist", default: true },
      { action: "marksmanship", label: `${loc("ASOIAF.Ability.marksmanship")} (${unit.system.shootRange} m)`, icon: "fa-solid fa-crosshairs" }
    ],
    rejectClose: false
  });
}

/** Nouveau round de bataille : compteurs d'ordres et Défense « Défendre » remis à zéro. */
export async function resetRound(units) {
  // Seules les unités qui changent sont mises à jour, en parallèle.
  await Promise.all(units.map(unit => {
    if (unit?.type !== "unit" || !unit.isOwner) return null;
    const update = {};
    if (unit.system.ordersThisRound) update["system.ordersThisRound"] = 0;
    if (unit.system.standingOrder !== "defend" && unit.system.defendResult) update["system.defendResult"] = 0;
    return foundry.utils.isEmpty(update) ? null : unit.update(update);
  }));
}

/* -------------------------------------------- */
/*  Fin de bataille (Table 10-6)                */
/* -------------------------------------------- */

export async function endBattle(unit) {
  const s = unit.system;
  const condition = s.status === "destroyed" ? "destroyed" : s.status === "routed" ? "routed"
    : s.disorganizations > 0 ? "disorganized" : s.tookDamage ? "damaged" : "none";
  const roll = await new Roll("1d6").evaluate();
  const malus = Math.max(0, s.disorganizations - 1);
  const index = Math.max(0, Math.min(6, roll.total - malus));
  const result = ASOIAF.unitSurvivors[condition][index];

  const lines = [fmt("ASOIAF.Unit.survivorsRoll", {
    roll: roll.total, malus, condition: loc(`ASOIAF.Unit.condition_${condition}`)
  })];
  const order = ASOIAF.trainingOrder;
  const source = s.source ? fromUuidSync(s.source) : null;
  const house = s.house ? fromUuidSync(s.house) : null;

  if (result === "destroyed" || order.indexOf(s.training) + result < 0) {
    lines.push(`<strong class="warning">${loc("ASOIAF.Unit.lost")}</strong>`);
    await setStatus(unit, "destroyed");
    if (house && source) {
      const power = house.system.resources.power.value;
      lines.push(fmt("ASOIAF.Unit.powerLost", { house: house.name, power: source.system.investment }));
      if (house.isOwner) {
        await house.update({ "system.resources.power.value": Math.max(0, power - source.system.investment) });
        await source.delete();
      }
    }
  } else {
    const newIndex = order.indexOf(s.training) + result;
    const training = order[Math.min(order.length - 1, newIndex)];
    const beyond = Math.max(0, newIndex - (order.length - 1));
    if (result === 0) lines.push(loc("ASOIAF.Unit.intact"));
    else lines.push(fmt("ASOIAF.Unit.trainingChange", { training: loc(`ASOIAF.Training.${training}`) }));
    if (beyond) lines.push(fmt("ASOIAF.Unit.beyondElite", { count: beyond }));
    await setStatus(unit, "ready", {
      "system.training": training, "system.health.value": s.health.max,
      "system.disorganizations": 0, "system.tookDamage": false,
      "system.defendResult": 0, "system.ordersThisRound": 0, "system.standingOrder": ""
    });
    if (source?.isOwner && source.system.training !== training) await source.update({ "system.training": training });
  }
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: unit }),
    content: `<div class="asoiaf-chat unit-card"><h3>${loc("ASOIAF.Unit.endBattle")} — ${unit.name}</h3><p>${lines.join("<br>")}</p></div>`,
    rolls: [roll]
  });
}

/* -------------------------------------------- */
/*  Déploiement depuis la fiche de Maison       */
/* -------------------------------------------- */

/** Crée (ou met à jour) l'acteur Unité correspondant à une unité de la Maison. */
export async function deployUnit(house, item) {
  const existing = item.getFlag("asoiaf", "actor") ? fromUuidSync(item.getFlag("asoiaf", "actor")) : null;
  const system = {
    training: item.system.training,
    types: foundry.utils.deepClone(item.system.types),
    house: house.uuid,
    source: item.uuid
  };
  if (existing) {
    await existing.update({ name: item.name, system });
    existing.sheet.render(true);
    return existing;
  }
  const actor = await Actor.implementation.create({
    name: item.name,
    type: "unit",
    img: item.img,
    folder: house.folder?.id ?? null,
    ownership: foundry.utils.deepClone(house.ownership),
    system
  });
  await item.setFlag("asoiaf", "actor", actor.uuid);
  actor.sheet.render(true);
  ui.notifications.info(fmt("ASOIAF.Unit.deployed", { name: actor.name }));
  return actor;
}
