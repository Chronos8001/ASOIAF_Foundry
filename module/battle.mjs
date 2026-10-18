/**
 * Bataille (chapitre 10) : armées, commandement, moral, champ de bataille et bilan.
 */
import { ASOIAF } from "./config.mjs";
import { promptTest, rollTest } from "./dice.mjs";
import { degrade, endBattle, setStatus, unitAttack } from "./warfare.mjs";

const loc = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);
const DialogV2 = () => foundry.applications.api.DialogV2;
const resolve = uuid => {
  try {
    return uuid ? fromUuidSync(uuid) : null;
  } catch {
    return null;
  }
};

async function chat(actor, html) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="asoiaf-chat unit-card">${html}</div>`
  });
}

/* -------------------------------------------- */
/*  Composition de l'armée                      */
/* -------------------------------------------- */

/**
 * Ajoute un acteur à l'armée selon la zone de dépôt.
 * Unité → liste des unités ; personnage → commandant, sous-commandant ou héros ; Maison → bannière.
 */
export async function addToArmy(army, actor, zone) {
  const s = army.system;
  if (actor.type === "house") return army.update({ "system.house": actor.uuid });
  if (actor.type === "unit") {
    if (s.units.includes(actor.uuid)) return;
    await army.update({ "system.units": [...s.units, actor.uuid] });
    if (actor.isOwner) await actor.update({ "system.army": army.uuid, "system.commander": actor.system.commander || s.commander });
    return;
  }
  if (!actor.system?.abilities?.warfare) return;
  const without = list => list.filter(u => u !== actor.uuid);
  if (zone === "commander") {
    return army.update({ "system.commander": actor.uuid, "system.subCommanders": without(s.subCommanders), "system.heroes": without(s.heroes), "system.commandLost": false });
  }
  if (zone === "sub") {
    if (s.subCommanders.length >= s.maxSubCommanders) ui.notifications.warn(fmt("ASOIAF.Battle.tooManySubs", { n: s.maxSubCommanders }));
    return army.update({ "system.subCommanders": [...without(s.subCommanders), actor.uuid], "system.heroes": without(s.heroes) });
  }
  if (s.heroes.length >= s.maxHeroes) ui.notifications.warn(fmt("ASOIAF.Battle.tooManyHeroes", { n: s.maxHeroes }));
  return army.update({ "system.heroes": [...without(s.heroes), actor.uuid], "system.subCommanders": without(s.subCommanders) });
}

/** Retire un membre (unité ou personnage) de l'armée. */
export async function removeFromArmy(army, uuid) {
  const s = army.system;
  const update = {
    "system.units": s.units.filter(u => u !== uuid),
    "system.subCommanders": s.subCommanders.filter(u => u !== uuid),
    "system.heroes": s.heroes.filter(u => u !== uuid)
  };
  if (s.commander === uuid) update["system.commander"] = "";
  await army.update(update);
  const unit = resolve(uuid);
  if (unit?.type === "unit" && unit.isOwner && unit.system.army === army.uuid) await unit.update({ "system.army": "" });
}

/* -------------------------------------------- */
/*  Commandement                                */
/* -------------------------------------------- */

/** Initiative de bataille : test d'Art de la guerre du commandant (refait chaque round). */
export async function commanderInitiative(army) {
  const commander = army.system.commanderActor;
  if (!commander) return ui.notifications.warn(loc("ASOIAF.Battle.noCommander"));
  const t = commander.system.getTestData("warfare", "strategy");
  return rollTest({ ...t, actor: commander, label: `${loc("ASOIAF.Battle.initiative")} — ${army.name}` });
}

/** Perte du commandement : toutes les unités sont désorganisées, l'armée ne donne plus qu'un ordre par round. */
export async function loseCommand(army) {
  await army.update({ "system.commandLost": true });
  for (const unit of army.system.activeUnits) {
    if (unit.isOwner && unit.system.status === "ready") await degrade(unit);
  }
  return chat(army, `<p class="warning">${fmt("ASOIAF.Battle.commandLost", { name: army.name })}</p>`);
}

/** Prendre le commandement : un personnage de Statut 2 ou plus (déposé, ou choisi parmi les membres). */
export async function takeCommand(army) {
  const s = army.system;
  const candidates = [...s.subActors, ...s.heroActors].filter(a => (a.system.abilities?.status?.value ?? 0) >= 2);
  if (!candidates.length) return ui.notifications.warn(loc("ASOIAF.Battle.noCandidate"));
  const uuid = await DialogV2().prompt({
    window: { title: loc("ASOIAF.Battle.takeCommand") },
    content: `<p>${loc("ASOIAF.Battle.takeCommandPrompt")}</p><select name="c">${candidates.map(a =>
      `<option value="${a.uuid}">${a.name} (${loc("ASOIAF.Ability.status")} ${a.system.abilities.status.value})</option>`).join("")}</select>`,
    ok: { callback: (e, b) => b.form.elements.c.value },
    rejectClose: false
  });
  if (!uuid) return;
  const actor = resolve(uuid);
  await addToArmy(army, actor, "commander");
  return chat(army, `<p>${fmt("ASOIAF.Battle.commandTaken", { name: actor.name, army: army.name })}</p>`);
}

/** Choix d'unités de l'armée (cases à cocher). */
async function pickUnits(army, title, hint, checked = () => false) {
  const units = army.system.activeUnits;
  if (!units.length) return [];
  const result = await DialogV2().prompt({
    window: { title },
    content: `<p>${hint}</p>${units.map(u => `<label class="checkbox"><input type="checkbox" name="${u.id}" ${checked(u) ? "checked" : ""}> ${u.name}
      <small>(${loc(`ASOIAF.Unit.status_${u.system.status}`)})</small></label>`).join("")}`,
    ok: { callback: (e, b) => units.filter(u => b.form.elements[u.id]?.checked) },
    rejectClose: false
  });
  return result ?? [];
}

/**
 * Chute d'un commandant ou d'un héros : les unités voisines testent leur Volonté
 * (Redoutable 12 pour un commandant, Exigeant 9 pour un héros) ; un échec les fait reculer d'un état.
 */
export async function leaderFalls(army, kind) {
  const difficulty = kind === "commander" ? 12 : 9;
  const selected = canvas?.tokens?.controlled?.map(t => t.actor) ?? [];
  const units = await pickUnits(army, loc(`ASOIAF.Battle.falls_${kind}`), fmt("ASOIAF.Battle.fallsHint", { difficulty }),
    u => selected.includes(u));
  for (const unit of units) {
    const t = unit.system.getTestData("will");
    const { outcome } = await rollTest({ ...t, actor: unit, label: `${loc("ASOIAF.Battle.morale")} — ${unit.name}`, difficulty });
    if (!outcome?.success && unit.isOwner) {
      await degrade(unit);
      await chat(unit, `<p class="warning">${fmt("ASOIAF.Battle.moraleBroken", { name: unit.name, status: loc(`ASOIAF.Unit.status_${unit.system.status}`) })}</p>`);
    }
  }
  if (kind === "commander" && units.length) {
    const ok = await DialogV2().confirm({ window: { title: loc("ASOIAF.Battle.commandLostTitle") }, content: `<p>${loc("ASOIAF.Battle.commandLostAsk")}</p>`, rejectClose: false });
    if (ok) return loseCommand(army);
  }
}

/** Reddition générale : un test d'Art de la guerre par unité active ; échec = déroute, réussite = reddition. */
export async function generalSurrender(army) {
  const commander = army.system.commanderActor;
  const ok = await DialogV2().confirm({ window: { title: loc("ASOIAF.Battle.surrenderAll") }, content: `<p>${loc("ASOIAF.Battle.surrenderAllConfirm")}</p>`, rejectClose: false });
  if (!ok) return;
  const t = commander?.system?.getTestData?.("warfare", "command") ?? { testDice: 2, bonusDice: 0, penaltyDice: 0, modifier: 0 };
  for (const unit of army.system.activeUnits) {
    const { outcome } = await rollTest({
      ...t, actor: commander ?? unit, label: `${loc("ASOIAF.Order.surrender")} — ${unit.name}`,
      difficulty: unit.system.orderDifficulty
    });
    if (!unit.isOwner) continue;
    if (outcome?.success) await setStatus(unit, "surrendered");
    else await setStatus(unit, "routed", { "system.formation": "mob" });
  }
}

/** Attaquer un parlementaire : déshonneur, la Maison perd 1d6 d'Influence. */
export async function betrayEnvoy(army) {
  const house = resolve(army.system.house);
  if (!house) return ui.notifications.warn(loc("ASOIAF.Battle.noHouse"));
  const ok = await DialogV2().confirm({ window: { title: loc("ASOIAF.Battle.betrayEnvoy") }, content: `<p>${loc("ASOIAF.Battle.betrayConfirm")}</p>`, rejectClose: false });
  if (!ok) return;
  const roll = await new Roll("1d6").evaluate();
  if (house.isOwner) await house.update({ "system.resources.influence.value": Math.max(0, house.system.resources.influence.value - roll.total) });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: army }),
    content: `<div class="asoiaf-chat unit-card"><p class="warning">${fmt("ASOIAF.Battle.betrayed", { house: house.name, n: roll.total })}</p></div>`,
    rolls: [roll]
  });
}

/* -------------------------------------------- */
/*  Actions d'une unité                         */
/* -------------------------------------------- */

/** Se dissimuler : Discrétion contre la Vigilance passive de l'unité ennemie la plus proche (ciblée). */
export async function conceal(unit) {
  const enemy = game.user.targets.first()?.actor;
  const passive = enemy?.system?.abilities?.awareness ? enemy.system.abilities.awareness.value * 4 : null;
  const t = unit.system.getTestData("stealth");
  const result = await promptTest({ ...t, actor: unit, label: `${loc("ASOIAF.Battle.conceal")} — ${unit.name}`, difficulty: passive });
  if (!result?.outcome?.success) return;
  await unit.update({ "system.concealed": true });
  return chat(unit, `<p>${loc("ASOIAF.Battle.concealed")}</p>`);
}

/** Ordre « Se tenir prêt » : la condition est remplie, l'unité attaque. */
export async function triggerReady(unit) {
  await unit.update({ "system.readied": "" });
  return unitAttack(unit, "attack");
}

/** Contre-charge : l'unité préparée frappe l'unité qui la charge, dégâts de base doublés. */
export function counterCharge(unit) {
  return unitAttack(unit, "attack", "fighting", { counter: true });
}

/** Un personnage attaque une portion de l'unité : 1 point de Santé par groupe de 10 hommes vaincus. */
export async function casualties(unit) {
  const n = await DialogV2().prompt({
    window: { title: `${loc("ASOIAF.Battle.casualties")} — ${unit.name}` },
    content: `<p>${loc("ASOIAF.Battle.casualtiesHint")}</p><input type="number" name="n" min="1" value="1">`,
    ok: { callback: (e, b) => Math.max(0, Number(b.form.elements.n.value) || 0) },
    rejectClose: false
  });
  if (!n) return;
  const value = Math.max(0, unit.system.health.value - n);
  await unit.update({ "system.health.value": value });
  await chat(unit, `<p>${fmt("ASOIAF.Battle.casualtiesDone", { name: unit.name, n, value, max: unit.system.health.max })}</p>`);
  // Une unité réduite à 0 est désorganisée (ou pire), comme pour toute attaque.
  if (value <= 0) await degrade(unit);
}

/* -------------------------------------------- */
/*  Champ de bataille de la scène               */
/* -------------------------------------------- */

/** Visibilité et météo de la scène affichée (MJ). */
export async function editBattlefield() {
  const scene = game.scenes.viewed;
  if (!scene) return ui.notifications.warn(loc("ASOIAF.Battle.noScene"));
  const flag = scene.getFlag("asoiaf", "battlefield") ?? {};
  const select = (name, keys, current, prefix) => `<select name="${name}">${keys.map(k =>
    `<option value="${k}" ${k === current ? "selected" : ""}>${loc(`${prefix}.${k}`)}</option>`).join("")}</select>`;
  const data = await DialogV2().prompt({
    window: { title: `${loc("ASOIAF.Battle.battlefield")} — ${scene.name}` },
    content: `<div class="form-group"><label>${loc("ASOIAF.Battle.visibility")}</label>${select("visibility", Object.keys(ASOIAF.battleVisibility), flag.visibility ?? "clear", "ASOIAF.Visibility")}</div>
      <div class="form-group"><label>${loc("ASOIAF.Battle.weather")}</label>${select("weather", Object.keys(ASOIAF.battleWeather), flag.weather ?? "clear", "ASOIAF.Weather")}</div>
      <p class="hint">${loc("ASOIAF.Battle.battlefieldHint")}</p>`,
    ok: { callback: (e, b) => ({ visibility: b.form.elements.visibility.value, weather: b.form.elements.weather.value }) },
    rejectClose: false
  });
  if (!data) return;
  await scene.setFlag("asoiaf", "battlefield", data);
  // Les unités recalculent leurs valeurs (déplacement, pénalités).
  for (const token of scene.tokens) if (token.actor?.type === "unit") token.actor.reset();
  for (const a of game.actors) if (a.type === "unit") a.reset();
  ui.notifications.info(fmt("ASOIAF.Battle.battlefieldSet", {
    visibility: loc(`ASOIAF.Visibility.${data.visibility}`), weather: loc(`ASOIAF.Weather.${data.weather}`)
  }));
}

/* -------------------------------------------- */
/*  Bilan de la bataille                        */
/* -------------------------------------------- */

const DEFEATED = ["routed", "destroyed", "surrendered"];

/** Gloire de la victoire (Table 10-5) : unités vaincues, et bonus si l'on était en infériorité numérique. */
export function battleGlory(defeated, ratio) {
  if (defeated <= 0) return 0;
  const base = ASOIAF.battleGlory.find(([max]) => defeated <= max)[1];
  const bonus = ASOIAF.battleOutnumbered.find(([r]) => ratio >= r)?.[1] ?? 0;
  return base + bonus;
}

/**
 * Bilan : cette armée a vaincu une armée ennemie. Gloire, ressources gagnées et perdues,
 * rançons, et table des survivants pour toutes les unités.
 */
export async function battleReport(army) {
  const enemies = game.actors.filter(a => a.type === "army" && a.id !== army.id);
  if (!enemies.length) return ui.notifications.warn(loc("ASOIAF.Battle.noEnemy"));
  const enemy0 = enemies[0];
  const enemyHouse = e => resolve(e.system.house);
  const holdingsOf = e => (enemyHouse(e)?.items ?? []).filter(i => i.type === "holding" && i.system.resource === "defense");
  const domainsOf = e => (enemyHouse(e)?.items ?? []).filter(i => i.type === "domain");
  const captivesOf = e => [e.system.commanderActor, ...e.system.subActors, ...e.system.heroActors].filter(Boolean);
  const options = (list, empty) => `<option value="">${empty}</option>${list.map(i => `<option value="${i.id}">${i.name} (${i.system.investment})</option>`).join("")}`;
  const summary = e => {
    const defeated = e.system.unitActors.filter(u => DEFEATED.includes(u.system.status)).length;
    const ratio = army.system.unitActors.length ? e.system.unitActors.length / army.system.unitActors.length : 1;
    return { defeated, ratio, glory: battleGlory(defeated, ratio) };
  };
  const first = summary(enemy0);
  const captiveBoxes = e => captivesOf(e).map(c =>
    `<label class="checkbox"><input type="checkbox" name="cap_${c.id}"> ${c.name} (${loc("ASOIAF.Ability.status")} ${c.system.abilities?.status?.value ?? 0})</label>`).join("") || `<p class="hint">—</p>`;

  const data = await DialogV2().prompt({
    window: { title: `${loc("ASOIAF.Battle.report")} — ${army.name}` },
    position: { width: 520 },
    content: `<div class="asoiaf-dialog battle-report">
      <div class="form-group"><label>${loc("ASOIAF.Battle.enemy")}</label><select name="enemy">${enemies.map(e => `<option value="${e.id}">${e.name}</option>`).join("")}</select></div>
      <p class="report-summary">${fmt("ASOIAF.Battle.reportSummary", { defeated: first.defeated, ratio: first.ratio.toFixed(1), glory: first.glory })}</p>
      <div class="form-group"><label>${loc("ASOIAF.Battle.stronghold")}</label><select name="stronghold">${options(holdingsOf(enemy0), loc("ASOIAF.Battle.none"))}</select></div>
      <div class="form-group"><label>${loc("ASOIAF.Battle.domain")}</label><select name="domain">${options(domainsOf(enemy0), loc("ASOIAF.Battle.none"))}</select></div>
      <label class="checkbox"><input type="checkbox" name="hold"> ${loc("ASOIAF.Battle.holdDomain")}</label>
      <label class="checkbox"><input type="checkbox" name="community"> ${loc("ASOIAF.Battle.community")}</label>
      <fieldset><legend>${loc("ASOIAF.Battle.captives")}</legend><div class="captives">${captiveBoxes(enemy0)}</div></fieldset>
      <label class="checkbox"><input type="checkbox" name="survivors" checked> ${loc("ASOIAF.Battle.rollSurvivors")}</label>
      <p class="hint">${loc("ASOIAF.Battle.reportHint")}</p></div>`,
    // Changer d'ennemi met à jour le résumé, les possessions saisissables et les captifs.
    render: (event, dialog) => {
      const html = dialog instanceof HTMLElement ? dialog : dialog.element;
      const select = html.querySelector("select[name='enemy']");
      select?.addEventListener("change", () => {
        const e = game.actors.get(select.value);
        if (!e) return;
        const sum = summary(e);
        html.querySelector(".report-summary").textContent = fmt("ASOIAF.Battle.reportSummary", { defeated: sum.defeated, ratio: sum.ratio.toFixed(1), glory: sum.glory });
        html.querySelector("select[name='stronghold']").innerHTML = options(holdingsOf(e), loc("ASOIAF.Battle.none"));
        html.querySelector("select[name='domain']").innerHTML = options(domainsOf(e), loc("ASOIAF.Battle.none"));
        html.querySelector(".captives").innerHTML = captiveBoxes(e);
      });
    },
    ok: {
      label: loc("ASOIAF.Battle.apply"),
      callback: (e, b) => {
        const f = b.form.elements;
        return {
          enemy: f.enemy.value, stronghold: f.stronghold.value, domain: f.domain.value, hold: f.hold.checked,
          community: f.community.checked, survivors: f.survivors.checked,
          captives: [...b.form.querySelectorAll("input[name^='cap_']")].filter(i => i.checked).map(i => i.name.slice(4))
        };
      }
    },
    rejectClose: false
  });
  if (!data) return;
  const enemy = game.actors.get(data.enemy);
  if (!enemy) return;
  const win = resolve(army.system.house);
  const lose = enemyHouse(enemy);
  const { defeated, ratio, glory } = summary(enemy);
  const lines = [fmt("ASOIAF.Battle.reportGlory", { defeated, ratio: ratio.toFixed(1), glory, house: win?.name ?? army.name })];
  const rolls = [];
  const delta = { win: {}, lose: {} };
  const add = (side, resource, n) => delta[side][resource] = (delta[side][resource] ?? 0) + n;
  const roll = async formula => {
    const r = await new Roll(formula).evaluate();
    rolls.push(r);
    return r.total;
  };

  // Loi : le vaincu perd 1d6 ; le vainqueur aussi s'il tient le domaine.
  const lawLoss = await roll("1d6");
  add("lose", "law", -lawLoss);
  lines.push(fmt("ASOIAF.Battle.reportLaw", { n: lawLoss }));

  // Place forte prise : elle change de main avec sa Défense.
  const stronghold = data.stronghold ? lose?.items.get(data.stronghold) : null;
  if (stronghold) {
    add("win", "defense", stronghold.system.investment);
    add("lose", "defense", -stronghold.system.investment);
    lines.push(fmt("ASOIAF.Battle.reportStronghold", { name: stronghold.name, n: stronghold.system.investment }));
  }
  // Domaine saisi : Terres transférées ; Population et Loi selon que le vainqueur le tient.
  const domain = data.domain ? lose?.items.get(data.domain) : null;
  if (domain) {
    add("win", "lands", domain.system.investment);
    add("lose", "lands", -domain.system.investment);
    const popLoss = await roll("1d6");
    add("lose", "population", -popLoss);
    lines.push(fmt("ASOIAF.Battle.reportDomain", { name: domain.name, n: domain.system.investment, pop: popLoss }));
    if (data.hold) {
      const lawWin = await roll("1d6");
      const popWin = Math.max(0, await roll("1d6-1"));
      add("win", "law", -lawWin);
      add("win", "population", popWin);
      lines.push(fmt("ASOIAF.Battle.reportHold", { law: lawWin, pop: popWin }));
    }
  }
  // Communauté ou place forte dans le domaine : Richesse.
  if ((domain && data.community) || stronghold) {
    const wealthWin = Math.max(0, await roll("1d6-1"));
    const wealthLose = await roll("2d6");
    add("win", "wealth", wealthWin);
    add("lose", "wealth", -wealthLose);
    lines.push(fmt("ASOIAF.Battle.reportWealth", { win: wealthWin, lose: wealthLose }));
  }
  // Rançons : 1 Richesse par rang de Statut du captif.
  const captives = data.captives.map(id => game.actors.get(id)).filter(Boolean);
  const ransom = captives.reduce((t, c) => t + (c.system.abilities?.status?.value ?? 0), 0);
  if (ransom) {
    add("win", "wealth", ransom);
    add("lose", "wealth", -ransom);
    lines.push(fmt("ASOIAF.Battle.reportRansom", { names: captives.map(c => c.name).join(", "), n: ransom }));
  }

  // Application aux Maisons.
  const apply = async (house, d, gloryGain) => {
    if (!house?.isOwner) return;
    const update = { "system.glory": house.system.glory + gloryGain };
    for (const [r, n] of Object.entries(d)) update[`system.resources.${r}.value`] = Math.max(0, house.system.resources[r].value + n);
    await house.update(update);
  };
  await apply(win, delta.win, glory);
  await apply(lose, delta.lose, 1);
  lines.push(fmt("ASOIAF.Battle.reportLoserGlory", { house: lose?.name ?? enemy.name }));
  // Les possessions prises changent de Maison.
  for (const item of [stronghold, domain].filter(Boolean)) {
    if (win?.isOwner && lose?.isOwner) {
      await win.createEmbeddedDocuments("Item", [item.toObject()]);
      await item.delete();
    }
  }
  const resLine = (house, d) => house ? `<li><strong>${house.name}</strong> : ${Object.entries(d).map(([r, n]) =>
    `${loc(`ASOIAF.Resource.${r}`)} ${n >= 0 ? "+" : ""}${n}`).join(", ") || "—"}</li>` : "";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: army }),
    content: `<div class="asoiaf-chat unit-card"><h3>${loc("ASOIAF.Battle.report")} : ${army.name} ⚔ ${enemy.name}</h3>
      <p>${lines.join("<br>")}</p><ul>${resLine(win, delta.win)}${resLine(lose, delta.lose)}</ul></div>`,
    rolls
  });
  // Table des survivants pour toutes les unités des deux armées.
  if (data.survivors) {
    for (const unit of [...army.system.unitActors, ...enemy.system.unitActors]) {
      if (unit.isOwner && !unit.getFlag("asoiaf", "reformed")) await endBattle(unit);
    }
  }
}
