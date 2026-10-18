/**
 * Engins de siège et équipements spéciaux (chapitre 10).
 *
 * - Les engins sont des acteurs « siege » posés sur la carte, servis par une unité d'ingénieurs
 *   (qui teste son Art de la guerre contre la Défense de la cible). Un engin ne tire qu'un round sur deux.
 * - La tour de siège transporte une unité (+5 Défense) ; le bélier couvert abrite ses servants (+5 Défense).
 * - Les équipements d'unité (bélier, mantelets, échelles, tortue, feu grégeois) modifient la fiche d'unité.
 * - Le feu grégeois brûle 7 dégâts par round pendant 2d6 rounds, décomptés à chaque round de combat.
 */
import { ASOIAF } from "./config.mjs";
import { promptTest } from "./dice.mjs";
import { setStatus } from "./warfare.mjs";

const loc = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);
const DialogV2 = foundry.applications.api.DialogV2;
const IGNORE_AR = 99;

async function chat(actor, body, title = null) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="asoiaf-chat unit-card"><h3>${title ?? actor.name}</h3>${body}</div>`
  });
}

/** Libellé d'un coût : { wealth: 1 } -> « 1 Richesse ». */
export function costLabel(cost) {
  return Object.entries(cost ?? {}).map(([r, n]) => `${n === 0.5 ? "½" : n} ${loc(`ASOIAF.Resource.${r}`)}`).join(", ");
}

/**
 * Propose de payer un coût avec la Maison liée. Les demi-points de Richesse sont mis en réserve
 * (deux demi-points font un point retiré).
 * @returns {Promise<boolean>} false si l'utilisateur annule.
 */
export async function payHouse(house, cost, reason) {
  if (!cost || !Object.keys(cost).length) return true;
  const label = costLabel(cost);
  if (!house?.isOwner) {
    ui.notifications.info(fmt("ASOIAF.Siege.costNoHouse", { cost: label }));
    return true;
  }
  const choice = await DialogV2.wait({
    window: { title: reason },
    content: `<p>${fmt("ASOIAF.Siege.payQuestion", { house: house.name, cost: label })}</p>`,
    buttons: [
      { action: "pay", label: loc("ASOIAF.Siege.pay"), icon: "fa-solid fa-coins", default: true },
      { action: "free", label: loc("ASOIAF.Siege.free") }
    ],
    rejectClose: false
  });
  if (!choice) return false;
  if (choice === "free") return true;

  const update = {};
  const parts = [];
  for (const [resource, amount] of Object.entries(cost)) {
    let whole = Math.floor(amount);
    if (amount % 1) {
      const owed = (house.getFlag("asoiaf", "halfWealth") ?? 0) + 1;
      if (owed >= 2) whole += 1;
      update["flags.asoiaf.halfWealth"] = owed % 2;
    }
    if (whole) update[`system.resources.${resource}.value`] = Math.max(0, house.system.resources[resource].value - whole);
    parts.push(`${loc(`ASOIAF.Resource.${resource}`)} -${whole}${amount % 1 && !whole ? " (½ en réserve)" : ""}`);
  }
  await house.update(update);
  await chat(house, `<p>${reason} : ${parts.join(", ")}</p>`);
  return true;
}

/** Carte de dégâts sans jet (huile bouillante…), avec le bouton « Appliquer aux cibles ». */
async function damageCard(actor, title, amount, { ignore = false, burn = null, text = "" } = {}) {
  const burnAttrs = burn ? ` data-burn-damage="${burn.damage}" data-burn-rounds="${burn.rounds}"` : "";
  return chat(actor, `${text ? `<p>${text}</p>` : ""}
    <div class="damage"><span>${loc("ASOIAF.Weapon.damage")} : <strong>${amount}</strong>${ignore ? ` (${loc("ASOIAF.Siege.ignoresArmor")})` : ""}</span>
    <button type="button" data-action="apply-damage" data-damage="${amount}" data-piercing="${ignore ? IGNORE_AR : 0}"${burnAttrs}>
      <i class="fa-solid fa-heart-crack"></i> ${loc("ASOIAF.Chat.applyDamage")}</button></div>`, title);
}

/* -------------------------------------------- */
/*  Incendies (feu grégeois)                    */
/* -------------------------------------------- */

/** Met le feu à un acteur (unité ou engin) : dégâts par round pendant une durée tirée au sort. */
export async function ignite(actor, damage, roundsFormula) {
  if (!actor?.system?.burning) return;
  const roll = await new Roll(String(roundsFormula)).evaluate();
  const rounds = Math.max(actor.system.burning.rounds, roll.total);
  await actor.update({ "system.burning.damage": Math.max(actor.system.burning.damage, damage), "system.burning.rounds": rounds });
  await chat(actor, `<p class="warning">${fmt("ASOIAF.Siege.ignited", { name: actor.name, damage, rounds })}</p>`);
}

/** À chaque nouveau round : les acteurs en feu subissent leurs dégâts (ignorent la VA). */
export async function burnTick(actors) {
  for (const actor of actors) {
    const b = actor?.system?.burning;
    if (!b?.rounds || !actor.isOwner) continue;
    await actor.update({ "system.burning.rounds": b.rounds - 1, ...(b.rounds - 1 <= 0 ? { "system.burning.damage": 0 } : {}) });
    await chat(actor, `<p>${fmt("ASOIAF.Siege.burns", { name: actor.name, damage: b.damage, left: b.rounds - 1 })}</p>`);
    await actor.applyDamage(b.damage, IGNORE_AR);
  }
}

/* -------------------------------------------- */
/*  Équipements d'unité                         */
/* -------------------------------------------- */

/** Équipe ou retire un équipement spécial (le coût est proposé à la Maison liée). */
export async function toggleGear(unit, key) {
  const active = !unit.system.gear[key];
  if (active) {
    const house = unit.system.house ? fromUuidSync(unit.system.house) : null;
    const ok = await payHouse(house, ASOIAF.unitGear[key].cost, `${loc(`ASOIAF.Gear.${key}`)} — ${unit.name}`);
    if (!ok) return;
  }
  await unit.update({ [`system.gear.${key}`]: active });
}

/** Enfoncer une porte : bélier simple (+2D en Athlétisme). */
export async function batter(unit) {
  const t = unit.system.getTestData("athletics");
  if (unit.system.gear.ram) t.testDice += 2;
  return promptTest({ ...t, actor: unit, label: `${loc("ASOIAF.Siege.batter")} — ${unit.name}` });
}

/** Escalader une muraille : +1D avec des échelles ; aucun test depuis une tour de siège arrivée au mur. */
export async function climb(unit) {
  const s = unit.system;
  if (s.shelterActor?.system.kind === "siegeTower") {
    return chat(unit, `<p>${loc("ASOIAF.Siege.towerClimb")}</p>`);
  }
  const t = s.getTestData("athletics");
  if (s.gear.ladders) t.testDice += 1;
  return promptTest({ ...t, actor: unit, label: `${loc("ASOIAF.Siege.climb")} — ${unit.name}` });
}

/** Lancer le feu grégeois sur une unité adjacente (Tir) ; échec critique : l'unité s'embrase elle-même. */
export async function throwWildfire(unit) {
  const s = unit.system;
  if (!s.gear.wildfire) return ui.notifications.warn(loc("ASOIAF.Siege.noWildfire"));
  const target = game.user.targets.first()?.actor ?? null;
  const t = s.getTestData("marksmanship");
  const result = await promptTest({
    ...t,
    actor: unit,
    label: `${loc("ASOIAF.Gear.wildfire")} — ${unit.name}`,
    difficulty: target?.type === "unit" ? target.system.shootDefense : null,
    damage: ASOIAF.wildfire.damage,
    piercing: IGNORE_AR,
    burn: { damage: ASOIAF.wildfire.damage, rounds: ASOIAF.wildfire.rounds },
    extra: loc("ASOIAF.Siege.wildfireHint")
  });
  if (!result) return;
  await unit.update({ "system.gear.wildfire": false });
  if (result.outcome && !result.outcome.success) {
    if (result.outcome.critical) {
      await chat(unit, `<p class="warning">${loc("ASOIAF.Siege.wildfireMishap")}</p>`);
      await unit.applyDamage(ASOIAF.wildfire.damage, IGNORE_AR);
      await ignite(unit, ASOIAF.wildfire.damage, ASOIAF.wildfire.rounds);
    } else {
      await chat(unit, `<p>${loc("ASOIAF.Siege.wildfireMiss")}</p>`);
    }
  }
}

/** Une unité armée de feu grégeois qui subit des dégâts : 1 chance sur 6 qu'il s'embrase. */
export async function wildfireEruption(unit) {
  if (!unit.system.gear?.wildfire) return;
  const roll = await new Roll("1d6").evaluate();
  if (roll.total !== 1) return;
  await unit.update({ "system.gear.wildfire": false });
  await chat(unit, `<p class="warning">${loc("ASOIAF.Siege.eruption")}</p>`);
  await unit.applyDamage(ASOIAF.wildfire.damage, IGNORE_AR);
  await ignite(unit, ASOIAF.wildfire.damage, ASOIAF.wildfire.rounds);
}

/** Huile ou eau bouillante versée depuis les murs (½ Richesse par utilisation). */
export async function boiling(unit) {
  const choice = await DialogV2.wait({
    window: { title: loc("ASOIAF.Siege.boiling") },
    content: `<p>${loc("ASOIAF.Siege.boilingHint")}</p>`,
    buttons: [
      { action: "water", label: `${loc("ASOIAF.Siege.water")} (${ASOIAF.boiling.water})`, icon: "fa-solid fa-droplet" },
      { action: "oil", label: `${loc("ASOIAF.Siege.oil")} (${ASOIAF.boiling.oil})`, icon: "fa-solid fa-fire", default: true }
    ],
    rejectClose: false
  });
  if (!choice) return;
  const house = unit.system.house ? fromUuidSync(unit.system.house) : null;
  if (!await payHouse(house, { wealth: 0.5 }, `${loc(`ASOIAF.Siege.${choice}`)} — ${unit.name}`)) return;
  return damageCard(unit, `${loc(`ASOIAF.Siege.${choice}`)} — ${unit.name}`, ASOIAF.boiling[choice], {
    ignore: true, text: choice === "oil" ? loc("ASOIAF.Siege.oilHint") : ""
  });
}

/* -------------------------------------------- */
/*  Engins de siège                             */
/* -------------------------------------------- */

/** Construit un engin de siège pour la Maison (coût proposé), puis ouvre sa fiche. */
export async function buildSiege(house, kind) {
  const def = ASOIAF.siegeEngines[kind];
  if (!def) return;
  const name = loc(`ASOIAF.SiegeKind.${kind}`);
  if (!await payHouse(house, def.cost, `${loc("ASOIAF.Siege.build")} : ${name}`)) return;
  const actor = await Actor.implementation.create({
    name, type: "siege", img: "icons/svg/target.svg",
    folder: house.folder?.id ?? null,
    ownership: foundry.utils.deepClone(house.ownership),
    system: { kind, house: house.uuid, health: { value: def.health, max: def.health } }
  });
  actor?.sheet.render(true);
  return actor;
}

/** Tir d'un engin : test d'Art de la guerre des servants contre la Défense de la cible. */
export async function fireSiege(siege) {
  const s = siege.system;
  if (s.status === "destroyed") return ui.notifications.warn(loc("ASOIAF.Siege.destroyedWarn"));
  if (!s.canFire) return ui.notifications.warn(loc("ASOIAF.Siege.cannotFire"));
  const round = game.combat?.round ?? null;
  if (round !== null && s.lastFired >= 0 && round === s.lastFired + 1) {
    ui.notifications.warn(loc("ASOIAF.Siege.reloading"));
  }

  const crew = s.crewActor;
  // Par round, une armée tire autant d'engins que le rang d'Art de la guerre de son commandant (p. 184).
  const army = crew?.system?.armyActor;
  if (army) {
    const max = army.system.commanderActor?.system.abilities?.warfare?.value ?? 1;
    if (army.system.siegeShots >= max) ui.notifications.warn(game.i18n.format("ASOIAF.Battle.siegeShotsMax", { n: max }));
    if (army.isOwner) await army.update({ "system.siegeShots": army.system.siegeShots + 1 });
  }
  const target = game.user.targets.first()?.actor ?? null;
  const t = crew?.system?.getTestData?.("warfare") ?? { testDice: 2, bonusDice: 0, penaltyDice: 0, modifier: 0 };
  let damage = s.damage;
  let difficulty = null;
  if (target?.type === "unit") {
    difficulty = target.system.shootDefense;
    t.penaltyDice += s.def.vsUnitPenalty ?? 0;
  } else if (target?.system?.combatDefense !== undefined && target.type !== "siege") {
    difficulty = target.system.combatDefense;
    if (s.def.vsCharacter) {
      t.penaltyDice += s.def.vsCharacter.penalty;
      damage = s.def.vsCharacter.damage;
    }
  }

  const result = await promptTest({
    ...t,
    actor: siege,
    label: `${siege.name} (${loc(`ASOIAF.Ammo.${s.currentAmmo}`)})${crew ? ` — ${crew.name}` : ""}`,
    difficulty,
    damage,
    piercing: s.ignoresArmor ? IGNORE_AR : 0,
    burn: s.burns ? { damage, rounds: s.burns } : null,
    extra: [
      target ? fmt("ASOIAF.Unit.attackTarget", { name: target.name }) : loc("ASOIAF.Unit.noTarget"),
      crew ? "" : loc("ASOIAF.Siege.noCrew"),
      `${loc("ASOIAF.Siege.range")} ${s.range} m`
    ].filter(Boolean).join(" · ")
  });
  if (result && round !== null) await siege.update({ "system.lastFired": round });
  return result;
}

/** Battre une muraille ou une porte : Athlétisme effectif de l'engin (bélier couvert, catapulte…). */
export async function smash(siege) {
  const s = siege.system;
  if (!s.smash) return ui.notifications.warn(loc("ASOIAF.Siege.cannotSmash"));
  return promptTest({ testDice: s.smash, bonusDice: 0, penaltyDice: 0, modifier: 0, actor: siege, label: `${loc("ASOIAF.Siege.smash")} — ${siege.name}` });
}

/** Dégâts subis par un engin : VA, puis destruction à 0 (et sort de l'unité transportée ou des servants). */
export async function applySiegeDamage(siege, amount, piercing = 0) {
  const s = siege.system;
  if (s.status === "destroyed") return;
  const ar = Math.max(0, s.armor.rating - piercing);
  const taken = Math.max(0, amount - ar);
  const value = Math.max(0, s.health.value - taken);
  const lines = [fmt("ASOIAF.Unit.damageTaken", { name: siege.name, taken, ar })];
  if (value > 0) {
    await siege.update({ "system.health.value": value });
  } else {
    await siege.update({ "system.health.value": 0, "system.status": "destroyed" });
    try {
      await siege.toggleStatusEffect?.("asoiaf-destroyed", { active: true, overlay: true });
    } catch (err) {
      console.warn("ASOIAF | Effet de statut", err);
    }
    lines.push(`<strong>${loc("ASOIAF.Siege.destroyed")}</strong>`);
    // La tour emporte l'unité qu'elle transporte ; le bélier couvert libère ses servants.
    const sheltered = game.actors.filter(a => a.type === "unit" && a.system.shelter === siege.uuid);
    for (const unit of sheltered) {
      if (s.kind === "siegeTower" && unit.isOwner) {
        await setStatus(unit, "destroyed", { "system.shelter": "" });
        lines.push(fmt("ASOIAF.Siege.carriedLost", { name: unit.name }));
      } else if (unit.isOwner) {
        await unit.update({ "system.shelter": "" });
      }
    }
  }
  await chat(siege, `<p>${lines.join("<br>")}</p>`);
}

/** Embarque une unité dans une tour de siège, ou l'affecte à un bélier couvert / un engin (servants). */
export async function assignUnit(siege, unit) {
  const s = siege.system;
  if (s.def.carries) {
    const previous = s.carriedActor;
    if (previous && previous !== unit && previous.isOwner) await previous.update({ "system.shelter": "" });
    await siege.update({ "system.carried": unit.uuid });
    await unit.update({ "system.shelter": siege.uuid });
    return chat(siege, `<p>${fmt("ASOIAF.Siege.boarded", { name: unit.name })}</p>`);
  }
  await siege.update({ "system.crew": unit.uuid });
  if (s.def.crew) await unit.update({ "system.shelter": siege.uuid });
  if (!unit.system.types?.engineers) ui.notifications.warn(loc("ASOIAF.Siege.crewNotEngineers"));
  return chat(siege, `<p>${fmt("ASOIAF.Siege.crewed", { name: unit.name })}</p>`);
}

/** Débarque l'unité transportée ou retire les servants. */
export async function releaseUnit(siege, field) {
  const actor = fromUuidSync(siege.system[field]);
  if (actor?.isOwner && actor.system.shelter === siege.uuid) await actor.update({ "system.shelter": "" });
  return siege.update({ [`system.${field}`]: "" });
}

/** Choix des munitions (le feu grégeois et la poix se paient en Richesse). */
export async function setAmmo(siege, ammo) {
  const cost = ASOIAF.siegeAmmo[ammo]?.cost;
  if (cost && ammo !== siege.system.currentAmmo) {
    const house = siege.system.house ? fromUuidSync(siege.system.house) : null;
    if (!await payHouse(house, cost, `${loc(`ASOIAF.Ammo.${ammo}`)} — ${siege.name}`)) return siege.sheet?.render();
  }
  return siege.update({ "system.ammo": ammo });
}
