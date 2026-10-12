import { ASOIAF } from "./config.mjs";
import { readForm, rollTest } from "./dice.mjs";

const loc = key => game.i18n.localize(key);
const resLabel = r => loc(`ASOIAF.Resource.${r}`);
const DialogV2 = foundry.applications.api.DialogV2;
const renderTpl = (...args) => (foundry.applications.handlebars?.renderTemplate ?? renderTemplate)(...args);

async function chat(house, title, body, rolls = []) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: house }),
    content: `<div class="asoiaf-chat house-card"><h3>${title}</h3>${body}</div>`,
    rolls
  });
}

const signed = n => (n >= 0 ? `+${n}` : `${n}`);

/* -------------------------------------------- */
/*  Création de la Maison                       */
/* -------------------------------------------- */

/** Tire le royaume au hasard (3d6, Table 6-1). */
export async function rollRealm(house) {
  const roll = await new Roll("3d6").evaluate();
  const [realm] = Object.entries(ASOIAF.realms).find(([, r]) => roll.total >= r.roll[0] && roll.total <= r.roll[1]);
  await house.update({ "system.realm": realm });
  await chat(house, loc("ASOIAF.House.rollRealm"), `<p>${roll.total} : <strong>${loc(`ASOIAF.Realm.${realm}`)}</strong></p>`, [roll]);
}

/** Génère les ressources de départ : 7d6 (5d6 pour un banneret) + modificateurs de royaume, minimum 1. */
export async function rollResources(house) {
  const realm = ASOIAF.realms[house.system.realm];
  if (!realm) return ui.notifications.warn(loc("ASOIAF.Warn.chooseRealm"));
  const dice = house.system.isBanner ? 5 : 7;
  const update = {};
  const rows = [];
  const rolls = [];
  for (const [i, r] of ASOIAF.resources.entries()) {
    const roll = await new Roll(`${dice}d6`).evaluate();
    rolls.push(roll);
    const value = Math.max(1, roll.total + realm.mods[i]);
    update[`system.resources.${r}.value`] = value;
    rows.push(`<tr><td>${resLabel(r)}</td><td>${roll.total}</td><td>${signed(realm.mods[i])}</td><td><strong>${value}</strong></td></tr>`);
  }
  await house.update(update);
  await chat(house, loc("ASOIAF.House.rollResources"),
    `<table><tr><th></th><th>${dice}d6</th><th>${loc("ASOIAF.House.realm")}</th><th>=</th></tr>${rows.join("")}</table>
     <p class="hint">${loc("ASOIAF.House.playerBonusHint")}</p>`, rolls);
}

/** Ajoute 1d6 à une ressource (un jet par joueur, max deux par ressource). */
export async function rollPlayerBonus(house, resource) {
  const roll = await new Roll("1d6").evaluate();
  const value = house.system.resources[resource].value + roll.total;
  await house.update({ [`system.resources.${resource}.value`]: value });
  await chat(house, loc("ASOIAF.House.playerBonus"), `<p>${resLabel(resource)} +${roll.total} → <strong>${value}</strong></p>`, [roll]);
}

/** Tire la première fondation et le nombre d'événements historiques. */
export async function rollFounding(house) {
  let founding = house.system.founding;
  const rolls = [];
  if (!founding) {
    const r = await new Roll("1d6").evaluate();
    rolls.push(r);
    founding = Object.keys(ASOIAF.foundings)[r.total - 1];
  }
  const count = await new Roll(ASOIAF.foundings[founding]).evaluate();
  rolls.push(count);
  const historyCount = Math.max(1, count.total);
  await house.update({ "system.founding": founding, "system.historyCount": historyCount });
  await chat(house, loc("ASOIAF.House.rollFounding"),
    `<p><strong>${loc(`ASOIAF.Founding.${founding}`)}</strong></p>
     <p>${game.i18n.format("ASOIAF.House.eventsCount", { count: historyCount })}</p>`, rolls);
}

/** Tire un événement historique (3d6, Table 6-4) et applique ses effets. */
export async function rollHistoricalEvent(house, forced = null) {
  let total = null;
  const rolls = [];
  let key = forced;
  if (!key) {
    const roll = await new Roll("3d6").evaluate();
    rolls.push(roll);
    total = roll.total;
    key = Object.keys(ASOIAF.historicalEvents).find(k => ASOIAF.historicalEvents[k].roll === total);
  }
  const event = ASOIAF.historicalEvents[key];

  let mods = event.mods;
  if (!mods) {
    // Infrastructure : choisir deux ressources différentes, +1d6 chacune.
    const chosen = await chooseResources(2);
    if (!chosen) return;
    mods = ASOIAF.resources.map(r => (chosen.includes(r) ? "1d6" : ""));
  }

  const update = {};
  const changes = [];
  for (const [i, r] of ASOIAF.resources.entries()) {
    if (!mods[i]) continue;
    const roll = await new Roll(mods[i]).evaluate();
    rolls.push(roll);
    const value = Math.max(0, house.system.resources[r].value + roll.total);
    update[`system.resources.${r}.value`] = value;
    changes.push(`${resLabel(r)} ${signed(roll.total)}`);
  }
  const history = [...house.system.history, { event: key, roll: total ?? 0, changes: changes.join(", "), notes: "" }];
  update["system.history"] = history;
  await house.update(update);

  const first = history.length === 1 ? `<p class="hint">${loc("ASOIAF.House.firstEventHint")}</p>` : "";
  await chat(house, `${loc("ASOIAF.House.historicalEvent")} : ${loc(`ASOIAF.Event.${key}`)}`,
    `${total ? `<p>3d6 = ${total}</p>` : ""}<p>${changes.join("<br>")}</p>${first}`, rolls);
}

async function chooseResources(count) {
  const options = ASOIAF.resources.map(r => `<label><input type="checkbox" name="${r}"> ${resLabel(r)}</label>`).join("");
  const data = await DialogV2.prompt({
    window: { title: loc("ASOIAF.Event.infrastructure") },
    content: `<p>${game.i18n.format("ASOIAF.House.chooseResources", { count })}</p><div class="asoiaf-checklist">${options}</div>`,
    ok: { callback: (e, button) => readForm(button.form) },
    rejectClose: false
  });
  if (!data) return null;
  const chosen = ASOIAF.resources.filter(r => data[r]);
  if (chosen.length !== count) {
    ui.notifications.warn(game.i18n.format("ASOIAF.House.chooseResources", { count }));
    return null;
  }
  return chosen;
}

/* -------------------------------------------- */
/*  La Maison en jeu                            */
/* -------------------------------------------- */

/** Membres résolus (acteurs) de la maison. */
export function getMembers(house) {
  return house.system.members.map((m, index) => {
    const actor = fromUuidSync(m.uuid);
    return { ...m, index, actor, name: actor?.name ?? "?", img: actor?.img ?? "icons/svg/mystery-man.svg" };
  });
}

/** Jet de Fortune : test de Statut de l'intendant + modificateurs de la maison. */
export async function rollFortune(house) {
  const s = house.system;
  const members = getMembers(house).filter(m => m.actor?.system?.abilities);
  const steward = members.find(m => m.role === "steward") ?? members.find(m => m.role === "lord") ?? members[0];

  const content = await renderTpl("systems/asoiaf/templates/dialog/fortune.hbs", {
    members: members.map(m => ({ index: m.index, name: m.name, role: m.role, selected: m === steward })),
    status: steward?.actor.system.abilities.status.value ?? 2,
    stewardship: steward?.actor.system.abilities.status.specialties.stewardship ?? 0,
    banners: s.bannerCount,
    law: s.lawModifier,
    population: s.populationModifier,
    holdings: s.holdingModifier,
    formula: s.fortuneFormula,
    influence: s.resources.influence.value
  });

  const data = await DialogV2.prompt({
    window: { title: loc("ASOIAF.House.rollFortune") },
    position: { width: 460 },
    content,
    ok: { label: loc("ASOIAF.Roll.roll"), icon: "fa-solid fa-dice-six", callback: (e, button) => readForm(button.form) },
    rejectClose: false,
    render: (event, dialog) => {
      // Mise à jour automatique du Statut quand on change d'intendant.
      const el = dialog.element ?? dialog;
      el.querySelector("[name=steward]")?.addEventListener("change", ev => {
        const m = members.find(x => String(x.index) === ev.target.value);
        if (!m) return;
        el.querySelector("[name=status]").value = m.actor.system.abilities.status.value;
        el.querySelector("[name=stewardship]").value = m.actor.system.abilities.status.specialties.stewardship;
      });
    }
  });
  if (!data) return;

  const spend = Math.max(0, Number(data.influenceSpend) || 0);
  const influenceDice = Math.floor(spend / 5);
  const formulas = [data.formula, influenceDice ? `${influenceDice}d6` : ""].filter(f => f && f.trim());
  const modifier = s.lawModifier + s.populationModifier + s.holdingModifier + (Number(data.modifier) || 0);
  const steward2 = members.find(m => String(m.index) === String(data.steward));

  const result = await rollTest({
    actor: steward2?.actor ?? null,
    speaker: ChatMessage.getSpeaker({ actor: house }),
    label: `${loc("ASOIAF.House.rollFortune")} — ${house.name}`,
    testDice: Number(data.status) + Number(data.banners || 0),
    bonusDice: Number(data.stewardship),
    modifier,
    extraFormula: formulas.join(" + ")
  });

  const fortune = ASOIAF.lookup(ASOIAF.houseFortunes, result.total);
  const update = {
    "system.fortuneRolled": true,
    "system.monthsWithoutFortune": 0,
    "system.fortunes": [...s.fortunes, { month: s.month, result: result.total, fortune, notes: "" }]
  };
  if (spend) update["system.resources.influence.value"] = Math.max(0, s.resources.influence.value - spend);
  await house.update(update);

  await chat(house, `${loc("ASOIAF.House.fortune")} : ${loc(`ASOIAF.Fortune.${fortune}`)}`,
    `<p class="fortune fortune-${fortune}">${loc(`ASOIAF.FortuneEffect.${fortune}`)}</p>
     ${steward2 ? `<p class="hint">${loc("ASOIAF.House.steward")} : ${steward2.name}</p>` : ""}`);
}

/** Renonce au jet de Fortune ce mois-ci : +1 à une ressource. */
export async function skipFortune(house, resource) {
  if (house.system.fortuneRolled) return ui.notifications.warn(loc("ASOIAF.Warn.fortuneAlready"));
  const value = house.system.resources[resource].value + 1;
  await house.update({ [`system.resources.${resource}.value`]: value, "system.fortuneRolled": true });
  await chat(house, loc("ASOIAF.House.skipFortune"), `<p>${resLabel(resource)} +1 → ${value}</p>`);
}

/** Passe au mois suivant : les chantiers avancent, les drapeaux mensuels sont remis à zéro. */
export async function nextMonth(house) {
  const s = house.system;
  const finished = [];
  const updates = [];
  for (const item of house.items) {
    if (item.type !== "holding" || item.system.monthsRemaining <= 0) continue;
    const monthsRemaining = item.system.monthsRemaining - 1;
    updates.push({ _id: item.id, "system.monthsRemaining": monthsRemaining });
    if (monthsRemaining === 0) finished.push(item.name);
  }
  if (updates.length) await house.updateEmbeddedDocuments("Item", updates);

  const without = s.fortuneRolled ? 0 : s.monthsWithoutFortune + 1;
  await house.update({
    "system.month": s.month + 1,
    "system.fortuneRolled": false,
    "system.actionTaken": false,
    "system.monthsWithoutFortune": without
  });

  let body = `<p>${game.i18n.format("ASOIAF.House.monthStart", { month: s.month + 1 })}</p>`;
  if (finished.length) body += `<p>${loc("ASOIAF.House.projectsDone")} : <strong>${finished.join(", ")}</strong></p>`;
  if (without >= 2) body += `<p class="warning">${loc("ASOIAF.House.fortuneRequired")}</p>`;
  await chat(house, loc("ASOIAF.House.nextMonth"), body);
}

/** Action de Maison « Gérer les ressources » (Table 6-19). */
export async function manageResources(house) {
  const s = house.system;
  const exchanges = Object.entries(ASOIAF.resourceExchange);
  const fromOptions = exchanges.map(([r]) => `<option value="${r}">${resLabel(r)}</option>`).join("");
  const toOptions = ASOIAF.resources.map(r => `<option value="${r}">${resLabel(r)}</option>`).join("");
  const rows = exchanges.map(([r, x]) =>
    `<tr><td>${resLabel(r)}</td><td>${x.to.map(resLabel).join(", ")}</td><td>${x.rate}:1</td><td>${x.rushed}:1</td></tr>`).join("");

  const data = await DialogV2.prompt({
    window: { title: loc("ASOIAF.House.manageResources") },
    position: { width: 480 },
    content: `
      <table class="asoiaf-table"><tr><th>${loc("ASOIAF.House.from")}</th><th>${loc("ASOIAF.House.to")}</th>
        <th>${loc("ASOIAF.House.rate")}</th><th>${loc("ASOIAF.House.rushed")}</th></tr>${rows}</table>
      <div class="form-group"><label>${loc("ASOIAF.House.from")}</label><select name="from">${fromOptions}</select></div>
      <div class="form-group"><label>${loc("ASOIAF.House.to")}</label><select name="to">${toOptions}</select></div>
      <div class="form-group"><label>${loc("ASOIAF.House.amountSpent")}</label><input type="number" name="amount" value="2" min="1"></div>
      <div class="form-group"><label>${loc("ASOIAF.House.rushed")}</label><input type="checkbox" name="rushed"></div>
      <p class="hint">${loc("ASOIAF.House.rushedHint")}</p>`,
    ok: { callback: (e, button) => readForm(button.form) },
    rejectClose: false
  });
  if (!data) return;

  const rule = ASOIAF.resourceExchange[data.from];
  if (!rule.to.includes(data.to)) return ui.notifications.warn(loc("ASOIAF.Warn.badExchange"));
  const amount = Math.min(Number(data.amount) || 0, s.resources[data.from].value);
  const gain = Math.floor(amount / (data.rushed ? rule.rushed : rule.rate));
  if (gain <= 0) return ui.notifications.warn(loc("ASOIAF.Warn.badExchange"));
  const spent = gain * (data.rushed ? rule.rushed : rule.rate);

  await house.update({
    [`system.resources.${data.from}.value`]: s.resources[data.from].value - spent,
    [`system.resources.${data.to}.value`]: s.resources[data.to].value + gain,
    "system.actionTaken": true
  });
  await chat(house, loc("ASOIAF.House.manageResources"),
    `<p>${resLabel(data.from)} −${spent} → ${resLabel(data.to)} +${gain}${data.rushed ? ` (${loc("ASOIAF.House.rushed")})` : ""}</p>`);
}

/** Dépense de la Gloire du groupe : +1 ressource par point. */
export async function donateGlory(house, resource) {
  if (house.system.glory <= 0) return ui.notifications.warn(loc("ASOIAF.Warn.noGlory"));
  await house.update({
    "system.glory": house.system.glory - 1,
    [`system.resources.${resource}.value`]: house.system.resources[resource].value + 1
  });
}

/** Crée une possession à partir du catalogue, avec temps de construction si la partie est lancée. */
export async function addHolding(house, resource, index, { underConstruction = false } = {}) {
  const entry = ASOIAF.holdingCatalog[resource]?.[index];
  if (!entry) return;
  let monthsRemaining = 0;
  if (underConstruction && entry.time) monthsRemaining = (await new Roll(entry.time).evaluate()).total;
  const system = {
    resource,
    investment: entry.cost,
    time: entry.time ?? "",
    monthsRemaining,
    fortune: entry.fortune ?? "",
    defenseBonus: entry.defenseBonus ?? 0,
    requirement: entry.requirement ?? "",
    kind: entry.heirStatus ? "heir" : ""
  };
  if (entry.heirStatus) {
    system.description = game.i18n.format("ASOIAF.House.heirStatus", {
      status: Math.max(3, house.system.maxStatus - entry.heirStatus)
    });
  }
  return house.createEmbeddedDocuments("Item", [{ name: entry.name, type: "holding", system }]);
}

/** Lie une autre Maison comme banneret (coût en Puissance 20/10/5). */
export async function addBanner(house, banner) {
  const cost = ASOIAF.bannerCost(house.system.bannerCount);
  return house.createEmbeddedDocuments("Item", [{
    name: banner.name, type: "holding", img: banner.img,
    system: { resource: "power", kind: "banner", investment: cost, linked: banner.uuid }
  }]);
}
