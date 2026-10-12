/**
 * Règle maison : les artisans de la Maison.
 *
 * Début de mois : l'artisan dépense 1 point de budget pour se mettre au travail.
 * Fin de mois   : jet de sa compétence de métier contre Difficulté 9.
 *   - réussite : +degrés +5 au budget (max 10) et +1 XP par degré ;
 *   - échec : le point est perdu ; échec critique : -1D au prochain jet.
 * Projet commun : chaque artisan dépense 1 point, le chef peut en dépenser un 2e ;
 *   +1B par artisan au-delà du chef ; seuls les bonus du chef s'appliquent ;
 *   tous gagnent l'XP, le chef +2 XP si le projet réussit.
 */
import { ASOIAF } from "./config.mjs";
import { readForm, rollTest } from "./dice.mjs";

const loc = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);
const DialogV2 = foundry.applications.api.DialogV2;
const A = () => ASOIAF.artisan;

async function chat(house, title, body) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: house }),
    content: `<div class="asoiaf-chat house-card"><h3>${title}</h3>${body}</div>`
  });
}

const month = house => house.system.month;
const isWorking = (house, artisan) => artisan.system.startedMonth === month(house)
  && artisan.system.rolledMonth !== month(house);

/** Début de mois : dépenser 1 point de budget pour travailler. */
export async function startWork(house, artisan) {
  const s = artisan.system;
  if (s.startedMonth === month(house)) return ui.notifications.warn(loc("ASOIAF.Artisan.warnAlreadyStarted"));
  if (s.budget < 1) return ui.notifications.warn(loc("ASOIAF.Artisan.warnNoBudget"));
  await artisan.update({ "system.budget": s.budget - 1, "system.startedMonth": month(house) });
  await chat(house, artisan.name, `<p>${fmt("ASOIAF.Artisan.started", { name: artisan.name, month: month(house), project: s.project || "—" })}</p>`);
}

/** Travail interrompu (attaque du territoire…) : le mois et le point sont perdus. */
export async function interrupt(house, artisan) {
  if (!isWorking(house, artisan)) return ui.notifications.warn(loc("ASOIAF.Artisan.warnNotWorking"));
  await artisan.update({ "system.rolledMonth": month(house) });
  await chat(house, artisan.name, `<p class="warning">${fmt("ASOIAF.Artisan.interrupted", { name: artisan.name })}</p>`);
}

/** Jet de métier commun aux travaux seuls et aux projets communs. */
async function rollCraft(house, lead, { extraBonus = 0, label }) {
  const s = lead.system;
  return rollTest({
    actor: null,
    speaker: ChatMessage.getSpeaker({ actor: house }),
    label,
    testDice: s.rank,
    bonusDice: s.bonusDice + extraBonus,
    penaltyDice: s.penalty,
    modifier: s.modifier,
    difficulty: A().difficulty
  });
}

/** Résultat d'un jet pour un artisan participant. */
function craftUpdate(house, artisan, outcome, { isLead = false, group = false } = {}) {
  const s = artisan.system;
  const update = { _id: artisan.id, "system.rolledMonth": month(house), "system.penalty": 0 };
  if (outcome.success) {
    update["system.budget"] = Math.min(A().maxBudget, s.budget + outcome.degrees + A().successBonus);
    update["system.xp"] = s.xp + outcome.degrees + (isLead && group ? A().leadXpBonus : 0);
  } else if (outcome.critical) {
    update["system.penalty"] = 1;
  }
  return update;
}

/** Fin de mois : jet de métier d'un artisan seul. */
export async function rollWork(house, artisan) {
  if (!isWorking(house, artisan)) return ui.notifications.warn(loc("ASOIAF.Artisan.warnNotWorking"));
  const { outcome } = await rollCraft(house, artisan, {
    label: `${artisan.name} — ${artisan.system.trade || loc("ASOIAF.Artisan.title")} (${loc(`ASOIAF.Ability.${artisan.system.ability}`)})`
  });
  const update = craftUpdate(house, artisan, outcome);
  await house.updateEmbeddedDocuments("Item", [update]);
  await chat(house, artisan.name, resultText(artisan, outcome, update));
}

function resultText(artisan, outcome, update) {
  if (outcome.success) {
    return `<p>${fmt("ASOIAF.Artisan.success", {
      name: artisan.name, gain: outcome.degrees + A().successBonus, budget: update["system.budget"], xp: update["system.xp"]
    })}</p>`;
  }
  return `<p class="warning">${fmt(outcome.critical ? "ASOIAF.Artisan.critical" : "ASOIAF.Artisan.failure", { name: artisan.name })}</p>`;
}

/** Projet commun : plusieurs artisans au travail, un chef de projet. */
export async function groupProject(house) {
  const working = house.items.filter(i => i.type === "artisan" && isWorking(house, i));
  if (working.length < 2) return ui.notifications.warn(loc("ASOIAF.Artisan.warnGroup"));

  const rows = working.map((a, i) => `
    <tr>
      <td><input type="radio" name="lead" value="${a.id}" ${i === 0 ? "checked" : ""}></td>
      <td><input type="checkbox" name="part_${a.id}" checked></td>
      <td>${a.name}</td><td>${a.system.trade}</td><td>${a.system.budget}</td>
    </tr>`).join("");

  const data = await DialogV2.prompt({
    window: { title: loc("ASOIAF.Artisan.groupProject") },
    position: { width: 480 },
    content: `
      <table class="asoiaf-table">
        <tr><th>${loc("ASOIAF.Artisan.lead")}</th><th>${loc("ASOIAF.Artisan.participates")}</th>
          <th>${loc("ASOIAF.Common.name")}</th><th>${loc("ASOIAF.Artisan.trade")}</th><th>${loc("ASOIAF.Artisan.budget")}</th></tr>
        ${rows}
      </table>
      <div class="form-group"><label>${loc("ASOIAF.Artisan.project")}</label><input type="text" name="project"></div>
      <label class="checkbox"><input type="checkbox" name="extraPoint"> ${loc("ASOIAF.Artisan.leadExtraPoint")}</label>
      <p class="hint">${loc("ASOIAF.Artisan.groupHint")}</p>`,
    ok: { label: loc("ASOIAF.Roll.roll"), icon: "fa-solid fa-dice-six", callback: (e, button) => readForm(button.form) },
    rejectClose: false
  });
  if (!data) return;

  const lead = house.items.get(data.lead);
  const members = working.filter(a => data[`part_${a.id}`] || a === lead);
  if (!lead || members.length < 2) return ui.notifications.warn(loc("ASOIAF.Artisan.warnGroup"));

  // Second point du chef de projet.
  let invested = members.length;
  if (data.extraPoint) {
    if (lead.system.budget < 1) return ui.notifications.warn(loc("ASOIAF.Artisan.warnNoBudget"));
    await lead.update({ "system.budget": lead.system.budget - 1, "system.leadExtraMonth": month(house) });
    invested += 1;
  }

  const project = data.project || lead.system.project || loc("ASOIAF.Artisan.groupProject");
  const { outcome } = await rollCraft(house, lead, {
    extraBonus: members.length - 1,
    label: `${loc("ASOIAF.Artisan.groupProject")} : ${project} (${lead.name})`
  });

  const updates = members.map(a => craftUpdate(house, house.items.get(a.id), outcome, { isLead: a === lead, group: true }));
  await house.updateEmbeddedDocuments("Item", updates);

  const lines = members.map(a => {
    const u = updates.find(x => x._id === a.id);
    return `<li>${a.name}${a === lead ? ` (${loc("ASOIAF.Artisan.lead")})` : ""} : ${loc("ASOIAF.Artisan.budget")} ${u["system.budget"] ?? a.system.budget}, XP ${u["system.xp"] ?? a.system.xp}</li>`;
  }).join("");
  let body = `<p>${fmt("ASOIAF.Artisan.groupSummary", { count: members.length, invested, project })}</p><ul>${lines}</ul>`;
  body += outcome.success
    ? `<p class="hint">${loc("ASOIAF.Artisan.halfRule")}</p>`
    : `<p class="warning">${loc(outcome.critical ? "ASOIAF.Artisan.groupCritical" : "ASOIAF.Artisan.groupFailure")}</p>`;
  await chat(house, `${loc("ASOIAF.Artisan.groupProject")} : ${project}`, body);
}

/** Fin de mois : dépenser du budget pour un bénéfice de la Maison. */
export async function spendBudget(house, artisan) {
  const s = artisan.system;
  if (s.budget < 1) return ui.notifications.warn(loc("ASOIAF.Artisan.warnNoBudget"));
  const data = await DialogV2.prompt({
    window: { title: `${loc("ASOIAF.Artisan.spend")} — ${artisan.name}` },
    content: `
      <div class="form-group"><label>${loc("ASOIAF.Artisan.points")} (max ${s.budget})</label>
        <input type="number" name="amount" value="1" min="1" max="${s.budget}"></div>
      <div class="form-group"><label>${loc("ASOIAF.Artisan.benefit")}</label>
        <input type="text" name="benefit" placeholder="${loc("ASOIAF.Artisan.benefitPlaceholder")}"></div>`,
    ok: { callback: (e, button) => readForm(button.form) },
    rejectClose: false
  });
  if (!data) return;
  const amount = Math.min(s.budget, Math.max(1, Number(data.amount) || 0));
  await artisan.update({ "system.budget": s.budget - amount });
  await chat(house, artisan.name, `<p>${fmt("ASOIAF.Artisan.spent", { name: artisan.name, amount, benefit: data.benefit || "—" })}</p>`);
}

/** Obtenir un point de budget : 2 points de ressource ou 500 dragons d'or. */
export async function buyBudget(house, artisan) {
  const s = artisan.system;
  if (s.budget >= A().maxBudget) return ui.notifications.warn(loc("ASOIAF.Artisan.warnMaxBudget"));
  const resources = ASOIAF.resources.map(r =>
    `<option value="res.${r}">${fmt("ASOIAF.Artisan.payResource", { cost: A().resourceCost, resource: loc(`ASOIAF.Resource.${r}`) })}</option>`);
  const payers = house.system.members
    .map(m => fromUuidSync(m.uuid))
    .filter(a => a?.system?.coin)
    .map(a => `<option value="coin.${a.uuid}">${fmt("ASOIAF.Artisan.payCoin", { cost: A().dragonCost, name: a.name, have: a.system.coin.dragons })}</option>`);
  payers.push(`<option value="coin.">${fmt("ASOIAF.Artisan.payCoinOther", { cost: A().dragonCost })}</option>`);

  const data = await DialogV2.prompt({
    window: { title: `${loc("ASOIAF.Artisan.buy")} — ${artisan.name}` },
    content: `<div class="form-group"><label>${loc("ASOIAF.Artisan.payment")}</label>
      <select name="pay">${[...resources, ...payers].join("")}</select></div>`,
    ok: { callback: (e, button) => readForm(button.form) },
    rejectClose: false
  });
  if (!data) return;

  const [kind, ref] = data.pay.split(/\.(.*)/s);
  let paid;
  if (kind === "res") {
    const value = house.system.resources[ref].value;
    if (value < A().resourceCost) return ui.notifications.warn(loc("ASOIAF.Artisan.warnCannotPay"));
    await house.update({ [`system.resources.${ref}.value`]: value - A().resourceCost });
    paid = `${A().resourceCost} ${loc(`ASOIAF.Resource.${ref}`)}`;
  } else {
    if (ref) {
      const payer = fromUuidSync(ref);
      if (!payer || payer.system.coin.dragons < A().dragonCost) return ui.notifications.warn(loc("ASOIAF.Artisan.warnCannotPay"));
      await payer.update({ "system.coin.dragons": payer.system.coin.dragons - A().dragonCost });
      paid = `${A().dragonCost} ${loc("ASOIAF.Coin.dragons")} (${payer.name})`;
    } else {
      paid = `${A().dragonCost} ${loc("ASOIAF.Coin.dragons")}`;
    }
  }
  await artisan.update({ "system.budget": s.budget + 1 });
  await chat(house, artisan.name, `<p>${fmt("ASOIAF.Artisan.bought", { name: artisan.name, paid })}</p>`);
}

/** Dépense d'expérience : +1D (30 XP) ou nouvelle production / spécialité (50 XP). */
export async function spendXp(house, artisan) {
  const s = artisan.system;
  const data = await DialogV2.prompt({
    window: { title: `${loc("ASOIAF.Artisan.progress")} — ${artisan.name}` },
    content: `
      <p>${loc("ASOIAF.Artisan.xp")} : <strong>${s.xp}</strong></p>
      <label class="checkbox"><input type="radio" name="choice" value="rank" checked>
        ${fmt("ASOIAF.Artisan.xpRank", { cost: A().rankXp, rank: s.rank + 1 })}</label>
      <label class="checkbox"><input type="radio" name="choice" value="production">
        ${fmt("ASOIAF.Artisan.xpProduction", { cost: A().productionXp })}</label>
      <div class="form-group"><label>${loc("ASOIAF.Artisan.newProduction")}</label><input type="text" name="production"></div>`,
    ok: { callback: (e, button) => readForm(button.form) },
    rejectClose: false
  });
  if (!data) return;

  const cost = data.choice === "rank" ? A().rankXp : A().productionXp;
  if (s.xp < cost) return ui.notifications.warn(loc("ASOIAF.Artisan.warnXp"));
  const update = { "system.xp": s.xp - cost };
  let gained;
  if (data.choice === "rank") {
    update["system.rank"] = s.rank + 1;
    gained = `${loc(`ASOIAF.Ability.${s.ability}`)} ${s.rank + 1}`;
  } else {
    if (!data.production) return ui.notifications.warn(loc("ASOIAF.Artisan.warnProduction"));
    update["system.productions"] = [s.productions, data.production].filter(Boolean).join(", ");
    gained = data.production;
  }
  await artisan.update(update);
  await chat(house, artisan.name, `<p>${fmt("ASOIAF.Artisan.improved", { name: artisan.name, gained })}</p>`);
}

/** Décès : le budget et la Richesse investie dans l'artisan sont perdus. */
export async function death(house, artisan) {
  const ok = await DialogV2.confirm({
    window: { title: loc("ASOIAF.Artisan.death") },
    content: `<p>${fmt("ASOIAF.Artisan.deathConfirm", { name: artisan.name, wealth: artisan.system.investment })}</p>`,
    rejectClose: false
  });
  if (!ok) return;
  const wealth = house.system.resources.wealth.value;
  const lost = artisan.system.investment;
  await artisan.delete();
  await house.update({ "system.resources.wealth.value": Math.max(0, wealth - lost) });
  await chat(house, loc("ASOIAF.Artisan.death"), `<p class="warning">${fmt("ASOIAF.Artisan.died", { name: artisan.name, wealth: lost })}</p>`);
}

/**
 * Passage au mois suivant : frais des artisans prêtés ou accueillis.
 * Renvoie les lignes à ajouter au résumé et la variation de Richesse.
 */
export function monthlyLoans(house) {
  let wealth = 0;
  const lines = [];
  for (const a of house.items) {
    if (a.type !== "artisan" || a.system.loan === "home" || a.system.loanFree) continue;
    const delta = a.system.loan === "borrowed" ? A().borrowedWealth : A().lentWealth;
    wealth += delta;
    lines.push(`${a.name} (${loc(`ASOIAF.Artisan.loan_${a.system.loan}`)}) : ${loc("ASOIAF.Resource.wealth")} ${delta > 0 ? "+" : ""}${delta}`);
  }
  return { wealth, lines };
}
