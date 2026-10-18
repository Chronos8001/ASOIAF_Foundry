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
  destroyed: "asoiaf-destroyed",
  surrendered: "asoiaf-surrendered"
};

/** Effets de statut affichés sur les jetons (enregistrés dans CONFIG.statusEffects). */
export function registerStatusEffects() {
  CONFIG.statusEffects.push(
    { id: STATUS_EFFECTS.disorganized, name: "ASOIAF.Unit.status_disorganized", img: "icons/svg/daze.svg" },
    { id: STATUS_EFFECTS.routed, name: "ASOIAF.Unit.status_routed", img: "icons/svg/falling.svg" },
    { id: STATUS_EFFECTS.destroyed, name: "ASOIAF.Unit.status_destroyed", img: "icons/svg/skull.svg" },
    { id: STATUS_EFFECTS.surrendered, name: "ASOIAF.Unit.status_surrendered", img: "icons/svg/cancel.svg" }
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
    // En déroute, l'unité devient une cohue (p. 188).
    await setStatus(unit, "routed", { "system.health.value": 0, "system.tookDamage": true, "system.formation": "mob" });
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

/** Chefs qui peuvent donner l'ordre : ceux de l'armée de l'unité, sinon les personnages présents. */
function commanderChoices(unit) {
  const army = unit.system.armyActor;
  if (army) {
    return [army.system.commanderActor, ...army.system.subActors].filter(a => a?.system?.abilities?.warfare)
      .map(a => ({ actor: a, left: army.system.ordersLeft(a.uuid), army }));
  }
  const actors = new Map();
  const add = a => {
    if (a?.system?.abilities?.warfare && a.type !== "unit") actors.set(a.uuid, a);
  };
  add(unit.system.commanderActor);
  for (const t of canvas.tokens?.placeables ?? []) add(t.actor);
  for (const a of game.actors) if (a.isOwner && a.type === "character") add(a);
  return [...actors.values()].map(actor => ({ actor, left: null, army: null }));
}

/** Difficulté d'un ordre : Discipline (+ tir de barrage), +3 par ordre déjà donné ce round, + l'ordre lui-même. */
export function orderDifficulty(unit, order, formation = null) {
  const s = unit.system;
  const def = ASOIAF.unitOrders[order] ?? {};
  let diff = s.orderDifficulty + 3 * s.ordersThisRound + (def.diff ?? 0);
  if (order === "formation" && formation) diff += ASOIAF.formations[formation]?.diff ?? 0;
  if (order === "scaleWalls" && s.gear.ladders) diff -= def.diff ?? 0;
  return diff;
}

/** Un ordre est-il possible pour cette unité ? Renvoie la clé du message d'erreur, ou null. */
function orderBlocked(unit, order, formation) {
  const s = unit.system;
  const def = ASOIAF.unitOrders[order] ?? {};
  if (def.concealed && !s.concealed) return "ASOIAF.Battle.needConcealed";
  if (def.engineers && !s.types.engineers) return "ASOIAF.Battle.needEngineers";
  if (def.cavalry && !s.types.cavalry) return "ASOIAF.Battle.needCavalry";
  if (def.attack && !s.canAttack && !s.gear.wildfire) return "ASOIAF.Siege.cannotAttack";
  if (order === "formation" && ASOIAF.formations[formation]?.infantryOnly && (s.types.cavalry || s.types.warships)) return "ASOIAF.Battle.phalanxInfantry";
  return null;
}

/** Fenêtre « Donner un ordre ». */
export async function issueOrder(unit, preset = null) {
  const s = unit.system;
  if (["destroyed", "surrendered"].includes(s.status)) return ui.notifications.warn(loc("ASOIAF.Unit.warnDestroyed"));
  const chiefs = commanderChoices(unit);
  const selected = preset ?? s.standingOrder ?? "attack";
  const groups = ASOIAF.orderGroups.map(g => `<optgroup label="${loc(`ASOIAF.OrderGroup.${g}`)}">${Object.entries(ASOIAF.unitOrders)
    .filter(([, d]) => d.group === g)
    .map(([o, d]) => `<option value="${o}" ${o === selected ? "selected" : ""}>${loc(`ASOIAF.Order.${o}`)}${d.diff ? ` (+${d.diff})` : ""}</option>`)
    .join("")}</optgroup>`).join("");
  const formations = Object.entries(ASOIAF.formations).map(([f, d]) =>
    `<option value="${f}">${loc(`ASOIAF.Formation.${f}`)}${d.diff ? ` (${d.diff > 0 ? "+" : ""}${d.diff})` : ""}</option>`).join("");
  const firstWithOrders = chiefs.find(c => c.left === null || c.left > 0) ?? chiefs[0];
  const options = chiefs.map(c => `<option value="${c.actor.uuid}" ${c === firstWithOrders ? "selected" : ""}>${c.actor.name}
    (${loc("ASOIAF.Ability.warfare")} ${c.actor.system.abilities.warfare.value}${c.left !== null ? ` — ${fmt("ASOIAF.Battle.ordersLeft", { n: c.left })}` : ""})</option>`).join("");

  const data = await DialogV2.prompt({
    window: { title: `${loc("ASOIAF.Unit.issueOrder")} — ${unit.name}` },
    position: { width: 480 },
    content: `
      <div class="form-group"><label>${loc("ASOIAF.Unit.order")}</label><select name="order">${groups}</select></div>
      <div class="form-group formation-choice"><label>${loc("ASOIAF.Battle.formation")}</label><select name="formation">${formations}</select></div>
      <p class="hint order-hint">${loc(`ASOIAF.OrderHint.${selected}`)}</p>
      <div class="form-group"><label>${loc("ASOIAF.Unit.commander")}</label>
        <select name="commander"><option value="">${loc("ASOIAF.Unit.noCommander")}</option>${options}</select></div>
      <div class="form-group"><label>${loc("ASOIAF.Unit.discipline")}</label>
        <input type="number" name="difficulty" value="${orderDifficulty(unit, selected, "battle")}"></div>
      <label class="checkbox"><input type="checkbox" name="standing"> ${loc("ASOIAF.Unit.standingCheckbox")}</label>
      <p class="hint">${loc("ASOIAF.Unit.orderHint")}</p>
      ${s.activated ? "" : `<p class="hint">${loc("ASOIAF.Battle.notActivated")}</p>`}`,
    ok: { label: loc("ASOIAF.Unit.give"), icon: "fa-solid fa-flag", callback: (e, button) => readForm(button.form) },
    // Description, Difficulté et choix de formation suivent l'ordre choisi.
    render: (event, dialog) => {
      const html = dialog instanceof HTMLElement ? dialog : dialog.element;
      const select = html.querySelector("select[name='order']");
      const formation = html.querySelector("select[name='formation']");
      const hint = html.querySelector(".order-hint");
      const diff = html.querySelector("input[name='difficulty']");
      const row = html.querySelector(".formation-choice");
      const refresh = () => {
        hint.textContent = loc(`ASOIAF.OrderHint.${select.value}`);
        row.style.display = select.value === "formation" ? "" : "none";
        diff.value = orderDifficulty(unit, select.value, formation.value);
      };
      select?.addEventListener("change", refresh);
      formation?.addEventListener("change", refresh);
      refresh();
    },
    rejectClose: false
  });
  if (!data) return;
  const blocked = orderBlocked(unit, data.order, data.formation);
  if (blocked) return ui.notifications.warn(loc(blocked));

  // Ordre permanent : pas de test de commandement.
  if (data.standing) return executeOrder(unit, data.order, { degrees: 1, standing: true, formation: data.formation });

  const commander = data.commander ? fromUuidSync(data.commander) : null;
  const army = s.armyActor;
  if (army && commander && army.system.ordersLeft(commander.uuid) <= 0) {
    ui.notifications.warn(fmt("ASOIAF.Battle.noOrdersLeft", { name: commander.name }));
  }
  const t = commander?.system?.getTestData?.("warfare", "command") ?? { testDice: 2, bonusDice: 0, penaltyDice: 0, modifier: 0 };
  const { outcome } = await rollTest({
    ...t,
    actor: commander,
    speaker: commander ? ChatMessage.getSpeaker({ actor: commander }) : ChatMessage.getSpeaker({ actor: unit }),
    label: `${loc(`ASOIAF.Order.${data.order}`)} → ${unit.name}`,
    difficulty: Number(data.difficulty)
  });
  await unit.update({ "system.ordersThisRound": s.ordersThisRound + 1 });
  if (army?.isOwner && commander) {
    const used = army.system.ordersUsed.filter(o => o.uuid !== commander.uuid);
    await army.update({ "system.ordersUsed": [...used, { uuid: commander.uuid, n: army.system.usedBy(commander.uuid) + 1 }] });
  }

  const def = ASOIAF.unitOrders[data.order] ?? {};
  if (outcome?.success) {
    if (!s.activated) await unit.update({ "system.activated": true });
    return executeOrder(unit, data.order, { degrees: outcome.degrees, formation: data.formation });
  }
  // Reddition refusée : l'unité part en déroute.
  if (def.failure) {
    await setStatus(unit, def.failure, { "system.formation": "mob" });
    return chat(unit, `<p class="warning">${loc(`ASOIAF.Battle.failure_${data.order}`)}</p>`);
  }
  if (outcome?.critical) {
    if (def.critical) {
      if (def.critical === "disorganized") await disorganize(unit);
      else await setStatus(unit, def.critical, { "system.formation": "mob" });
      return chat(unit, `<p class="warning">${loc(`ASOIAF.Battle.critical_${data.order}`)}</p>`);
    }
    return chat(unit, `<p class="warning">${loc("ASOIAF.Unit.orderCritical")}</p>`);
  }
  if (!s.activated || !s.standingOrder) return chat(unit, `<p class="warning">${loc(s.activated ? "ASOIAF.Unit.orderIgnored" : "ASOIAF.Battle.idle")}</p>`);
  await chat(unit, `<p>${fmt("ASOIAF.Unit.followsStanding", { order: loc(`ASOIAF.Order.${s.standingOrder}`) })}</p>`);
  return executeOrder(unit, s.standingOrder, { degrees: 1, standing: true });
}

/** Désorganise une unité (pénalités cumulées ; détruite si elles atteignent l'Endurance). */
async function disorganize(unit) {
  const s = unit.system;
  const disorganizations = s.disorganizations + 1;
  const destroyed = disorganizations >= s.abilities.endurance.value;
  await setStatus(unit, destroyed ? "destroyed" : "disorganized", { "system.disorganizations": disorganizations });
  return destroyed ? "destroyed" : "disorganized";
}

/** Dégrade l'état d'une unité d'un cran (moral) : en ordre → désorganisée → déroute → détruite. */
export async function degrade(unit) {
  const s = unit.system;
  if (s.status === "routed") return setStatus(unit, "destroyed");
  if (s.status === "disorganized") return setStatus(unit, "routed", { "system.formation": "mob" });
  return disorganize(unit);
}

const firstTarget = () => game.user.targets.first()?.actor ?? null;

/** Exécute un ordre réussi (ou un ordre permanent). */
export async function executeOrder(unit, order, { degrees = 1, standing = false, formation = null } = {}) {
  const def = ASOIAF.unitOrders[order] ?? {};
  const s = unit.system;
  if (def.persistent && !standing) await unit.update({ "system.standingOrder": def.standing ?? order });

  if (def.attack) return unitAttack(unit, order);
  const target = firstTarget();
  switch (order) {
    case "defend":
      return unitDefend(unit);
    case "move":
      return chat(unit, `<p>${fmt("ASOIAF.Unit.moves", { move: s.movement, sprint: s.sprint })}</p>`);
    case "retreat":
      return chat(unit, `<p>${fmt("ASOIAF.Battle.retreating", { move: s.movement })}</p>`);
    case "organize":
      if (s.status !== "disorganized") return chat(unit, `<p>${loc("ASOIAF.Unit.nothingToOrganize")}</p>`);
      await setStatus(unit, "ready", { "system.health.value": s.health.max });
      return chat(unit, `<p>${loc("ASOIAF.Unit.organized")}</p>`);
    case "rally":
      if (s.status !== "routed") return chat(unit, `<p>${loc("ASOIAF.Unit.nothingToRally")}</p>`);
      await setStatus(unit, "disorganized", s.formation === "mob" ? { "system.formation": "battle" } : {});
      return chat(unit, `<p>${loc("ASOIAF.Unit.rallied")}</p>`);
    case "regroup": {
      const value = Math.min(s.health.max, s.health.value + degrees);
      await unit.update({ "system.health.value": value });
      return chat(unit, `<p>${fmt("ASOIAF.Unit.regrouped", { healed: value - s.health.value, value, max: s.health.max })}</p>`);
    }
    case "surrender":
      await setStatus(unit, "surrendered");
      return chat(unit, `<p class="warning">${loc("ASOIAF.Unit.surrendered")}</p>`);
    case "ready": {
      const condition = standing && s.readied ? s.readied : await DialogV2.prompt({
        window: { title: `${loc("ASOIAF.Order.ready")} — ${unit.name}` },
        content: `<p>${loc("ASOIAF.Battle.readyPrompt")}</p><input type="text" name="c" value="${s.readied ?? ""}">`,
        ok: { callback: (e, b) => b.form.elements.c.value },
        rejectClose: false
      });
      if (!condition) return;
      await unit.update({ "system.readied": condition });
      return chat(unit, `<p>${fmt("ASOIAF.Battle.readied", { condition })}</p>`);
    }
    case "setCharge":
      await unit.update({ "system.setForCharge": true });
      return chat(unit, `<p>${loc("ASOIAF.Battle.setForCharge")}</p>`);
    case "forceBack":
    case "hammerAnvil":
      return pushBack(unit, order, target);
    case "reform":
      return reform(unit, target);
    case "sap":
      return sap(unit, target);
    case "slashBurn":
      return slashBurn(unit, target);
    case "scaleWalls":
      return scaleWalls(unit);
    case "reverse":
    case "wheel":
      return chat(unit, `<p>${loc(`ASOIAF.OrderHint.${order}`)}</p>`);
    case "formation": {
      const key = formation ?? "battle";
      await unit.update({ "system.formation": key });
      return chat(unit, `<p>${fmt("ASOIAF.Battle.formationSet", { formation: loc(`ASOIAF.Formation.${key}`) })}</p>`);
    }
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
  return chat(unit, `<p>${fmt("ASOIAF.Unit.defending", { defense: Math.max(1, result.total) + unit.system.coverDefense })}</p>`);
}

/** Repousser (Combat contre l'Athlétisme passif) ou Marteau et enclume (Athlétisme opposé). */
async function pushBack(unit, order, target) {
  const ability = order === "forceBack" ? "fighting" : "athletics";
  const t = unit.system.getTestData(ability);
  const passive = target?.system?.abilities?.athletics ? target.system.abilities.athletics.value * 4 : null;
  const result = await promptTest({ ...t, actor: unit, label: `${loc(`ASOIAF.Order.${order}`)} — ${unit.name}`, difficulty: passive });
  if (!result?.outcome?.success) return;
  const distance = order === "forceBack" ? 10 * result.outcome.degrees : Math.floor(unit.system.movement / 2);
  return chat(unit, `<p>${fmt(`ASOIAF.Battle.pushed_${order}`, { target: target?.name ?? "?", distance })}</p>`);
}

/** Reformer : l'unité ciblée (la plus abîmée, de la même armée) est fondue dans celle-ci, qui récupère toute sa Santé. */
async function reform(unit, target) {
  if (target?.type !== "unit" || target === unit) return ui.notifications.warn(loc("ASOIAF.Battle.reformTarget"));
  if (!target.isOwner) return ui.notifications.warn(loc("ASOIAF.Warn.notOwner"));
  await setStatus(target, "destroyed");
  await target.setFlag("asoiaf", "reformed", unit.uuid);
  await unit.update({ "system.health.value": unit.system.health.max });
  return chat(unit, `<p>${fmt("ASOIAF.Battle.reformed", { target: target.name })}</p>`);
}

/** Sape : des ingénieurs au pied d'une fortification (Art de la guerre Redoutable 12) en réduisent le bonus. */
async function sap(unit, target) {
  const t = unit.system.getTestData("warfare");
  await unit.update({ "system.sapping": true });
  const result = await promptTest({ ...t, actor: unit, label: `${loc("ASOIAF.Order.sap")} — ${unit.name}`, difficulty: 12 });
  if (!result?.outcome?.success) return;
  if (target?.type === "unit" && target.isOwner) {
    await target.update({ "system.fortificationMod": target.system.fortificationMod - result.outcome.degrees });
  }
  return chat(unit, `<p>${fmt("ASOIAF.Battle.sapped", { n: result.outcome.degrees, target: target?.name ?? "—" })}</p>`);
}

/** Terre brûlée : la Maison qui tient ces terres perd 1 Population et 1 Richesse. */
async function slashBurn(unit, target) {
  const houses = game.actors.filter(a => a.type === "house");
  const preferred = target?.system?.house ?? "";
  const house = await DialogV2.prompt({
    window: { title: loc("ASOIAF.Order.slashBurn") },
    content: `<p>${loc("ASOIAF.Battle.slashBurnPrompt")}</p><select name="h">${houses.map(h =>
      `<option value="${h.uuid}" ${h.uuid === preferred ? "selected" : ""}>${h.name}</option>`).join("")}</select>`,
    ok: { callback: (e, b) => b.form.elements.h.value },
    rejectClose: false
  });
  const victim = house ? fromUuidSync(house) : null;
  if (!victim) return;
  const r = victim.system.resources;
  if (victim.isOwner) await victim.update({
    "system.resources.population.value": Math.max(0, r.population.value - 1),
    "system.resources.wealth.value": Math.max(0, r.wealth.value - 1)
  });
  return chat(unit, `<p class="warning">${fmt("ASOIAF.Battle.slashBurned", { house: victim.name })}</p>`);
}

/** Escalade : Athlétisme contre la Difficulté du mur (+1D avec échelles). */
async function scaleWalls(unit) {
  const t = unit.system.getTestData("athletics");
  if (unit.system.gear.ladders) t.testDice += 1;
  const result = await promptTest({ ...t, actor: unit, label: `${loc("ASOIAF.Order.scaleWalls")} — ${unit.name}`, difficulty: 12 });
  if (!result?.outcome?.success) return;
  return chat(unit, `<p>${fmt("ASOIAF.Battle.climbed", { move: unit.system.movement })}</p>`);
}

/** Situations d'une attaque d'unité, proposées en cases à cocher. */
function situation(label, summary, contrib) {
  return {
    key: label, source: "", label, summary,
    contrib: { testDice: 0, bonusDice: 0, penaltyDice: 0, modifier: 0, convert: 0, convertHalf: false, reroll1: 0, reroll6: false, damage: 0, damageAfter: 0, ...contrib }
  };
}

/**
 * Attaque d'une unité contre la cible désignée (jeton ciblé).
 * Contre une unité : sa Défense (Combat) ou sa Défense contre le Tir. Contre un personnage : +2D, Défense de combat.
 * @param {object} [opts] { counter: contre-charge (dégâts de base doublés) }
 */
export async function unitAttack(unit, order = "attack", kind = null, { counter = false } = {}) {
  const s = unit.system;
  const def = ASOIAF.unitOrders[order] ?? {};
  const targets = [...game.user.targets].map(t => t.actor).filter(Boolean);
  const target = targets[0] ?? null;
  // Une unité armée de feu grégeois ne peut attaquer qu'avec lui ; certains équipements empêchent d'attaquer.
  if (s.gear.wildfire) return throwWildfire(unit);
  if (!s.canAttack) return ui.notifications.warn(loc("ASOIAF.Siege.cannotAttack"));
  // Une unité de tir choisit entre Combat et Tir (certains ordres imposent l'un ou l'autre).
  let ability = kind ?? def.kind ?? "fighting";
  if (!kind && !def.kind && s.shootDamage) {
    ability = await chooseKind(unit);
    if (!ability) return null;
  }
  const damage = ability === "marksmanship" ? s.shootDamage : s.fightDamage;
  const t = s.getTestData(ability);
  t.penaltyDice += def.penaltyDice ?? 0;
  t.testDice += def.testDice ?? 0;
  const effects = [];
  let base = (damage?.value ?? 1);
  if (def.damage) {
    // Un mur de boucliers annule le bonus de charge.
    const shieldWall = target?.type === "unit" && ASOIAF.formations[target.system.formation]?.noCharge && def.charge;
    if (shieldWall) effects.push(loc("ASOIAF.Battle.shieldWallNote"));
    else base += def.damage;
  }
  if (def.charge && s.formationData?.chargeDice) { t.testDice += 1; effects.push(loc("ASOIAF.Battle.wedgeNote")); }
  if (counter) { base *= 2; effects.push(loc("ASOIAF.Battle.counterNote")); }
  if (s.concealed) { t.testDice += 1; effects.push(loc("ASOIAF.Battle.concealedNote")); }
  if (target && target.type !== "unit" && target.type !== "siege") t.testDice += 2;
  if (target?.type === "unit" && target.system.formation === "mob" && s.formationData?.vsMob && ability === "fighting") {
    t.testDice += 1;
    effects.push(loc("ASOIAF.Battle.checkeredNote"));
  }
  if (s.noCavalry) effects.push(loc("ASOIAF.Battle.noCavalryNote"));

  // Orientation (Combat contre une unité) : flanc, arrière, encerclement ; un carré l'annule.
  const situational = [];
  if (ability === "fighting" && target?.type === "unit") {
    if (ASOIAF.formations[target.system.formation]?.noFacing) effects.push(loc("ASOIAF.Battle.squareNote"));
    else for (const [key, f] of Object.entries(ASOIAF.battleFacing)) {
      if (key === "front") continue;
      const summary = f.bonusDice ? `+${f.bonusDice}B` : f.testDice ? `+${f.testDice}D` : `−${f.penaltyDice}D`;
      situational.push(situation(loc(`ASOIAF.Facing.${key}`), summary, f));
    }
  }
  if (def.extraTargets) {
    situational.push(situation(loc("ASOIAF.Battle.secondUnit"), "−1D", { penaltyDice: 1 }));
    situational.push(situation(loc("ASOIAF.Battle.thirdUnit"), "−2D", { penaltyDice: 2 }));
  }

  const defenseOf = a => {
    if (a?.type === "unit") return ability === "marksmanship" ? a.system.shootDefense : a.system.currentDefense;
    if (a && a.type !== "siege") return a.system.combatDefense ?? null;
    return null;
  };
  const label = `${loc(`ASOIAF.Order.${order}`)} — ${unit.name} (${loc(`ASOIAF.Ability.${ability}`)})`;
  const options = {
    ...t,
    situational,
    effects,
    actor: unit,
    label,
    difficulty: defenseOf(target),
    damage: def.suppressing ? null : base,
    damageAfter: def.damageAfter ?? 0,
    targetUuid: target?.uuid ?? null,
    extra: target ? fmt("ASOIAF.Unit.attackTarget", { name: target.name }) : loc("ASOIAF.Unit.noTarget")
  };
  // Attaque divisée : les dés de test (et bonus) sont répartis entre les unités ciblées.
  if (def.split && targets.length > 1) {
    options.onConfirm = (data, c) => ({
      rolls: targets.map((tg, i) => {
        const n = targets.length;
        const testDice = Math.floor(c.testDice / n) + (i < c.testDice % n ? 1 : 0);
        return {
          label: `${label} → ${tg.name}`, testDice,
          bonusDice: Math.min(testDice, Math.floor(c.bonusDice / n) + (i < c.bonusDice % n ? 1 : 0)),
          difficulty: defenseOf(tg), targetUuid: tg.uuid
        };
      })
    });
  }
  const result = await promptTest(options);
  // Effets qui suivent l'attaque.
  const update = {};
  if (s.concealed) update["system.concealed"] = false;
  if (def.probing) update["system.probing"] = true;
  if (order === "envelop" && target) update["system.enveloping"] = target.uuid;
  if (counter) update["system.setForCharge"] = false;
  if (Object.keys(update).length) await unit.update(update);
  if (def.suppressing && result?.outcome?.success) await suppress(unit, target, result.outcome.degrees, base);
  if (order === "envelop" && target) await chat(unit, `<p>${fmt("ASOIAF.Battle.enveloping", { target: target.name })}</p>`);
  return result;
}

/** Tir de barrage : la cible devient plus dure à commander (+3, +1 par degré supplémentaire) ; dégâts à partir de 2 degrés. */
async function suppress(unit, target, degrees, base) {
  const extra = 3 + (degrees - 1);
  if (target?.type === "unit" && target.isOwner) await target.update({ "system.suppressed": target.system.suppressed + extra });
  const damage = degrees >= 2 ? base * (degrees - 1) : 0;
  const button = damage ? `<button type="button" data-action="apply-damage" data-damage="${damage}" data-piercing="0"
    ${target ? `data-target-uuid="${target.uuid}"` : ""}><i class="fa-solid fa-heart-crack"></i> ${loc("ASOIAF.Chat.applyDamage")} (${damage})</button>` : "";
  return chat(unit, `<p>${fmt("ASOIAF.Battle.suppressed", { target: target?.name ?? "—", n: extra })}</p>${button}`);
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

/** Nouveau round de bataille : compteurs d'ordres, Défense « Défendre » et effets d'un round remis à zéro. */
export async function resetRound(units) {
  // Seules les unités qui changent sont mises à jour, en parallèle.
  await Promise.all(units.map(unit => {
    if (unit?.type !== "unit" || !unit.isOwner) return null;
    const s = unit.system;
    const update = {};
    if (s.ordersThisRound) update["system.ordersThisRound"] = 0;
    if (s.standingOrder !== "defend" && s.defendResult) update["system.defendResult"] = 0;
    if (s.suppressed) update["system.suppressed"] = 0;
    if (s.probing) update["system.probing"] = false;
    if (s.sapping) update["system.sapping"] = false;
    if (s.setForCharge && s.standingOrder !== "attack") update["system.setForCharge"] = false;
    return foundry.utils.isEmpty(update) ? null : unit.update(update);
  }));
  // Les armées retrouvent tous leurs ordres et leurs tirs d'engins.
  const armies = new Set(units.map(u => u?.system?.armyActor).filter(a => a?.isOwner));
  await Promise.all([...armies].map(a => a.update({ "system.ordersUsed": [], "system.siegeShots": 0 })));
}

/* -------------------------------------------- */
/*  Fin de bataille (Table 10-6)                */
/* -------------------------------------------- */

export async function endBattle(unit) {
  const s = unit.system;
  const condition = s.status === "destroyed" ? "destroyed" : ["routed", "surrendered"].includes(s.status) ? "routed"
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
      "system.defendResult": 0, "system.ordersThisRound": 0, "system.standingOrder": "",
      "system.activated": false, "system.formation": "none", "system.concealed": false, "system.readied": "",
      "system.setForCharge": false, "system.suppressed": 0, "system.fortificationMod": 0, "system.enveloping": ""
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
