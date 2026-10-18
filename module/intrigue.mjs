/**
 * Intrigue (chapitre 8) : Influence et Sang-froid, dispositions, techniques et actions.
 *
 * Chaque personnage porte sa disposition envers son adversaire (system.intrigue.disposition) :
 * elle lui donne un Disposition Rating (qui réduit l'Influence subie) et un modificateur à ses
 * propres tests de Persuasion ou de Duperie. Une intrigue peut se jouer dans le suivi de combat :
 * l'initiative se fait au Statut et chaque nouveau round est un nouvel échange.
 */
import { ASOIAF } from "./config.mjs";
import { promptTest } from "./dice.mjs";

const loc = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);
const DialogV2 = () => foundry.applications.api.DialogV2;
const firstTarget = () => [...game.user.targets][0]?.actor ?? null;

async function card(actor, html, flags = {}, whisper = null) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="asoiaf-chat intrigue-card">${html}</div>`,
    flags: { asoiaf: flags },
    ...(whisper ? { whisper } : {})
  });
}

/** Décale une disposition de n crans (positif = meilleure). */
export function shiftDisposition(key, steps) {
  const order = ASOIAF.dispositionOrder;
  const i = Math.max(0, order.indexOf(key));
  return order[Math.min(order.length - 1, Math.max(0, i - steps))];
}

const dispositionLabel = key => loc(`ASOIAF.Disposition.${key}`);

/* -------------------------------------------- */
/*  Influencer                                  */
/* -------------------------------------------- */

/**
 * Test pour influencer la cible avec la technique choisie sur la fiche.
 * Persuasion (spécialité = technique), ou Duperie quand l'objectif est de tromper :
 * on garde alors la meilleure spécialité entre Duperie et Persuasion.
 */
export async function influence(actor) {
  const s = actor.system;
  const intr = s.intrigue;
  const tech = ASOIAF.techniques[intr.technique];
  const target = firstTarget();
  const deceit = intr.deceit || intr.objective === "deceit";
  const ability = deceit ? "deception" : "persuasion";
  let specialty = intr.technique;
  let extraBonus = 0;
  if (deceit) {
    const best = [...tech.deception].sort((a, b) => s.abilities.deception.specialties[b] - s.abilities.deception.specialties[a])[0];
    specialty = best;
    extraBonus = Math.max(0, s.abilities.persuasion.specialties[intr.technique] - s.abilities.deception.specialties[best]);
  }
  const test = s.getTestData(ability, specialty);
  test.bonusDice += extraBonus;
  const effects = [];
  const disp = s.disposition;
  const dispMod = deceit ? disp.deception : disp.persuasion;
  test.modifier += dispMod;
  if (dispMod) effects.push(fmt("ASOIAF.Intrigue.dispositionNote", { disposition: dispositionLabel(intr.disposition), mod: dispMod > 0 ? `+${dispMod}` : dispMod }));
  if (intr.readTarget) { test.testDice += 1; effects.push(loc("ASOIAF.Intrigue.readNote")); }
  if (intr.consider > 0 && intr.consider < 2) {
    test.bonusDice += Math.min(2, s.abilities[ability].value);
    effects.push(loc("ASOIAF.Intrigue.considerNote"));
  }
  if (intr.assist) { test.modifier += intr.assist; effects.push(fmt("ASOIAF.Intrigue.assistNote", { n: intr.assist })); }
  const situational = [
    sit(loc("ASOIAF.Intrigue.noLanguage"), "−3D", { penaltyDice: 3 }),
    sit(loc("ASOIAF.Intrigue.rareLanguage"), "+1B", { bonusDice: 1 }),
    sit(loc("ASOIAF.Intrigue.charmed"), "+1D", { testDice: 1 })
  ];
  const label = `${loc(`ASOIAF.Technique.${intr.technique}`)}${deceit ? ` (${loc("ASOIAF.Ability.deception")})` : ""}${target ? ` → ${target.name}` : ""}`;
  const result = await promptTest({
    actor, label, ...test, situational: [...test.situational, ...situational],
    defenseKey: "intrigueDefense", effects
  });
  // Bonus à usage unique consommés.
  await actor.update({ "system.intrigue.assist": 0, ...(intr.consider > 0 && intr.consider < 2 ? { "system.intrigue.consider": 0 } : {}) });
  if (!result?.outcome?.success) return result;
  const rank = s.abilities[tech.influence].value;
  const amount = rank * result.outcome.degrees;
  await card(actor, `<p>${fmt("ASOIAF.Intrigue.influenceResult", {
    amount, rank, ability: loc(`ASOIAF.Ability.${tech.influence}`), degrees: result.outcome.degrees
  })}</p>
    <button type="button" data-action="apply-influence">${loc("ASOIAF.Intrigue.applyInfluence")}</button>`, {
    influence: { attackerUuid: actor.uuid, targetUuid: target?.uuid ?? null, amount, technique: intr.technique, deceit }
  });
  return result;
}

function sit(label, summary, contrib) {
  return {
    key: label, source: "", label, summary,
    contrib: { testDice: 0, bonusDice: 0, penaltyDice: 0, modifier: 0, convert: 0, convertHalf: false, reroll1: 0, reroll6: false, damage: 0, damageAfter: 0, ...contrib }
  };
}

/**
 * Applique l'Influence à la cible : moins sa Disposition ; elle peut accepter de la frustration
 * (chaque point retire son rang de Volonté, mais −1D en Duperie et Persuasion).
 */
export async function applyInfluence(message) {
  const flag = message.getFlag("asoiaf", "influence");
  if (!flag) return;
  if (message.getFlag("asoiaf", "applied")) return ui.notifications.info(loc("ASOIAF.Intrigue.alreadyApplied"));
  const target = flag.targetUuid ? fromUuidSync(flag.targetUuid) : firstTarget();
  const attacker = fromUuidSync(flag.attackerUuid);
  if (!target?.system?.intrigue) return ui.notifications.warn(loc("ASOIAF.Chat.noTarget"));
  if (!target.isOwner) return ui.notifications.warn(loc("ASOIAF.Warn.notOwner"));
  const s = target.system;
  const dr = s.disposition.dr;
  let remaining = Math.max(0, flag.amount - dr);
  let frustration = 0;
  if (remaining > 0) {
    const will = s.abilities.will.value;
    // Pas plus de frustration que la Volonté : au-delà, on serait vaincu de toute façon.
    const max = Math.min(Math.ceil(remaining / will), will - s.frustration);
    if (max > 0) {
      const chosen = await DialogV2().prompt({
        window: { title: fmt("ASOIAF.Intrigue.yieldTitle", { name: target.name }) },
        content: `<div class="asoiaf-dialog"><p>${fmt("ASOIAF.Intrigue.frustrationChoice", {
          amount: flag.amount, dr, remaining, will, composure: s.composure.value
        })}</p><div class="form-group"><label>${loc("ASOIAF.Intrigue.frustration")}</label>
        <input type="number" name="n" min="0" max="${max}" value="0"></div></div>`,
        ok: { callback: (e, b) => Math.max(0, Math.min(max, Number(b.form.elements.n.value) || 0)) },
        rejectClose: false
      });
      frustration = chosen ?? 0;
    }
    remaining = Math.max(0, remaining - frustration * will);
  }
  const composure = s.composure.value - remaining;
  const totalFrustration = s.frustration + frustration;
  await target.update({
    "system.composure.value": Math.max(0, composure),
    "system.frustration": totalFrustration,
    "system.intrigue.influenced": remaining > 0 || frustration > 0
  });
  if (message.isOwner) await message.setFlag("asoiaf", "applied", true);
  const defeated = composure <= 0 || totalFrustration > s.abilities.will.value;
  await card(target, `<p>${fmt("ASOIAF.Intrigue.influenced", {
    name: target.name, amount: flag.amount, dr, frustration, loss: remaining, composure: Math.max(0, composure), max: s.composure.max
  })}</p>`);
  if (defeated) return defeat(target, attacker, flag.technique);
}

/** Défaite d'intrigue : conséquences de la technique, disposition mise à jour, point de victoire. */
async function defeat(target, attacker, technique) {
  const s = target.system;
  const disp = s.intrigue.disposition;
  const a = attacker?.system?.abilities;
  let newDisp = disp;
  let detail = "";
  switch (technique) {
    case "bargain": {
      const d = ASOIAF.bargainDiscount[disp];
      detail = d === "free" ? loc("ASOIAF.Consequence.bargainFree")
        : d ? fmt("ASOIAF.Consequence.bargainDiscount", { pct: d * (a?.cunning.value ?? 0) })
        : loc(disp === "malicious" ? "ASOIAF.Consequence.bargainShoddy" : "ASOIAF.Consequence.bargainNormal");
      break;
    }
    case "charm": newDisp = shiftDisposition(disp, 1); break;
    case "seduce": newDisp = shiftDisposition(disp, a?.persuasion.value ?? 1); break;
    case "intimidate": {
      const i = ASOIAF.dispositionOrder.indexOf(disp);
      newDisp = i > ASOIAF.dispositionOrder.indexOf("amiable") ? "amiable" : shiftDisposition(disp, 1);
      break;
    }
    case "taunt": newDisp = shiftDisposition(disp, -1); break;
  }
  if (newDisp !== disp) await target.update({ "system.intrigue.disposition": newDisp });
  if (attacker?.isOwner && attacker.system.intrigue?.victoryGoal > 0) {
    await attacker.update({ "system.intrigue.victory": attacker.system.intrigue.victory + 1 });
  }
  const shift = newDisp !== disp ? `<p>${fmt("ASOIAF.Consequence.shift", { from: dispositionLabel(disp), to: dispositionLabel(newDisp) })}</p>` : "";
  return card(target, `<h3>${fmt("ASOIAF.Intrigue.defeated", { name: target.name, winner: attacker?.name ?? "?" })}</h3>
    <p>${loc(`ASOIAF.Consequence.${technique}`)}</p>${detail ? `<p>${detail}</p>` : ""}${shift}
    <p class="hint">${loc("ASOIAF.Intrigue.destinyDefeat")}</p>`);
}

/* -------------------------------------------- */
/*  Autres actions                              */
/* -------------------------------------------- */

/** Test simple contre une Difficulté, puis carte avec un bouton d'effet sur la cible. */
async function actionTest(actor, { ability, specialty = null, label, difficulty, effect, minDegrees = 1, extra = {} }) {
  const target = firstTarget();
  const test = actor.system.getTestData(ability, specialty);
  if (["persuasion", "deception"].includes(ability)) test.modifier += actor.system.disposition[ability];
  const result = await promptTest({ actor, label: target ? `${label} → ${target.name}` : label, ...test, difficulty, ...extra });
  if (!result?.outcome?.success || result.outcome.degrees < minDegrees || !effect) return result;
  await card(actor, `<button type="button" data-action="intrigue-effect" data-effect="${effect}">${loc(`ASOIAF.IntrigueAction.btn_${effect}`)}${target ? ` (${target.name})` : ""}</button>`, {
    intrigueEffect: { attackerUuid: actor.uuid, targetUuid: target?.uuid ?? null, degrees: result.outcome.degrees, total: result.total }
  });
  return result;
}

export const ACTIONS = {
  /** Aider : Persuasion Exigeante (9) → la moitié de son rang de Persuasion au prochain test de l'allié. */
  assist: actor => actionTest(actor, { ability: "persuasion", label: loc("ASOIAF.IntrigueAction.assist"), difficulty: 9, effect: "assist" }),
  /** Réfléchir : renoncer à l'action, +2B à un test de l'échange suivant. */
  consider: async actor => {
    await actor.update({ "system.intrigue.consider": 2 });
    return card(actor, `<p>${fmt("ASOIAF.IntrigueAction.considered", { name: actor.name })}</p>`);
  },
  /** Baratiner : Persuasion contre la Volonté passive ; 2 degrés → la cible perd sa Ruse de sa Défense. */
  fastTalk: actor => actionTest(actor, {
    ability: "persuasion", label: loc("ASOIAF.IntrigueAction.fastTalk"),
    difficulty: firstTarget()?.system.passive?.("will") ?? null, effect: "fastTalk", minDegrees: 2
  }),
  /** Manipuler : Persuasion contre la Volonté passive → on choisit la technique de la cible au round suivant. */
  manipulate: actor => actionTest(actor, {
    ability: "persuasion", label: loc("ASOIAF.IntrigueAction.manipulate"),
    difficulty: firstTarget()?.system.passive?.("will") ?? null, effect: "manipulate"
  }),
  /** Apaiser : Persuasion Redoutable (12) → rend du Sang-froid (rang de Persuasion, +1 par degré supplémentaire). */
  mollify: actor => actionTest(actor, { ability: "persuasion", label: loc("ASOIAF.IntrigueAction.mollify"), difficulty: 12, effect: "mollify" }),
  /** Jauger : Vigilance contre la Duperie passive → disposition et technique de la cible, +1D pour l'intrigue. */
  readTarget: async actor => {
    const target = firstTarget();
    const test = actor.system.getTestData("awareness", "empathy");
    const result = await promptTest({
      actor, label: `${loc("ASOIAF.IntrigueAction.readTarget")}${target ? ` → ${target.name}` : ""}`, ...test,
      difficulty: target?.system.passive?.("deception") ?? null
    });
    if (!result?.outcome?.success) return result;
    await actor.update({ "system.intrigue.readTarget": true });
    if (!target?.system?.intrigue) return result;
    const t = target.system.intrigue;
    return card(actor, `<p>${fmt("ASOIAF.IntrigueAction.read", {
      name: target.name, disposition: dispositionLabel(t.disposition), technique: loc(`ASOIAF.Technique.${t.technique}`)
    })}</p>`, {}, game.users.filter(u => u.isGM || u.isSelf).map(u => u.id));
  },
  /** Bouclier de réputation : Statut contre la Volonté de base ; la disposition de la cible s'améliore d'un cran (une fois). */
  reputation: async actor => {
    if (actor.system.intrigue.shieldUsed) return ui.notifications.warn(loc("ASOIAF.IntrigueAction.shieldUsed"));
    const target = firstTarget();
    await actor.update({ "system.intrigue.shieldUsed": true });
    return actionTest(actor, {
      ability: "status", specialty: "reputation", label: loc("ASOIAF.IntrigueAction.reputation"),
      difficulty: target?.system.passive?.("will") ?? null, effect: "improve"
    });
  },
  /** Se retrancher : test de Volonté (Dévouement), le résultat remplace la Défense d'intrigue jusqu'à la fin de l'échange suivant. */
  withdraw: async actor => {
    const test = actor.system.getTestData("will", "dedication");
    const result = await promptTest({ actor, label: loc("ASOIAF.IntrigueAction.withdraw"), ...test });
    if (!result) return;
    await actor.update({ "system.intrigue.withdraw": result.total, "system.intrigue.withdrawLeft": 2 });
    return card(actor, `<p>${fmt("ASOIAF.IntrigueAction.withdrawn", { name: actor.name, total: result.total })}</p>`);
  },
  /** Reconnaissance (option) : Statut Redoutable (12) moins la Connaissance de la cible ; ±1 cran par degré. */
  recognition: actor => {
    const target = firstTarget();
    return actionTest(actor, {
      ability: "status", specialty: "reputation", label: loc("ASOIAF.IntrigueAction.recognition"), difficulty: 12,
      effect: "recognition", extra: { modifier: actor.system.getTestData("status", "reputation").modifier - (target?.system.abilities?.knowledge.value ?? 0) }
    });
  },
  /** Céder : proposer un compromis plutôt que d'être vaincu. */
  yield: actor => card(actor, `<p>${fmt("ASOIAF.IntrigueAction.yielded", { name: actor.name })}</p>`),
  /** Quitter l'intrigue. */
  quit: actor => card(actor, `<p>${fmt("ASOIAF.IntrigueAction.quitted", { name: actor.name })}</p>`)
};

/** Bouton d'effet d'une action d'intrigue, appliqué à la cible (ou à l'allié aidé). */
async function applyIntrigueEffect(message, effect) {
  const flag = message.getFlag("asoiaf", "intrigueEffect");
  if (!flag) return;
  const target = flag.targetUuid ? fromUuidSync(flag.targetUuid) : firstTarget();
  const source = fromUuidSync(flag.attackerUuid);
  if (!target?.system?.intrigue) return ui.notifications.warn(loc("ASOIAF.Chat.noTarget"));
  if (!target.isOwner) return ui.notifications.warn(loc("ASOIAF.Warn.notOwner"));
  const t = target.system;
  switch (effect) {
    case "assist": {
      const n = Math.floor((source?.system.abilities.persuasion.value ?? 0) / 2);
      await target.update({ "system.intrigue.assist": n });
      return card(target, `<p>${fmt("ASOIAF.IntrigueAction.assisted", { name: target.name, n })}</p>`);
    }
    case "fastTalk":
      await target.update({ "system.intrigue.fastTalkedLeft": 2 });
      return card(target, `<p>${fmt("ASOIAF.IntrigueAction.fastTalked", { name: target.name })}</p>`);
    case "manipulate": {
      const options = Object.keys(ASOIAF.techniques).map(k => `<option value="${k}">${loc(`ASOIAF.Technique.${k}`)}</option>`).join("");
      const technique = await DialogV2().prompt({
        window: { title: loc("ASOIAF.IntrigueAction.manipulate") },
        content: `<div class="asoiaf-dialog"><p>${fmt("ASOIAF.IntrigueAction.chooseTechnique", { name: target.name })}</p><select name="t">${options}</select></div>`,
        ok: { callback: (e, b) => b.form.elements.t.value },
        rejectClose: false
      });
      if (!technique) return;
      await target.update({ "system.intrigue.technique": technique });
      return card(target, `<p>${fmt("ASOIAF.IntrigueAction.manipulated", { name: target.name, technique: loc(`ASOIAF.Technique.${technique}`) })}</p>`);
    }
    case "mollify": {
      const n = (source?.system.abilities.persuasion.value ?? 0) + (flag.degrees - 1);
      await target.update({ "system.composure.value": Math.min(t.composure.max, t.composure.value + n) });
      return card(target, `<p>${fmt("ASOIAF.IntrigueAction.mollified", { name: target.name, n })}</p>`);
    }
    case "improve":
    case "recognition": {
      const steps = effect === "improve" ? 1 : flag.degrees;
      const dir = effect === "improve" ? 1 : await DialogV2().wait({
        window: { title: loc("ASOIAF.IntrigueAction.recognition") },
        content: `<p>${fmt("ASOIAF.IntrigueAction.recognitionChoice", { name: target.name, steps })}</p>`,
        buttons: [{ action: "up", label: loc("ASOIAF.IntrigueAction.better"), callback: () => 1, default: true },
          { action: "down", label: loc("ASOIAF.IntrigueAction.worse"), callback: () => -1 }],
        rejectClose: false
      });
      if (!dir) return;
      const from = t.intrigue.disposition;
      const to = shiftDisposition(from, steps * dir);
      await target.update({ "system.intrigue.disposition": to });
      return card(target, `<p>${fmt("ASOIAF.Consequence.shift", { from: dispositionLabel(from), to: dispositionLabel(to) })}</p>`);
    }
  }
}

/* -------------------------------------------- */
/*  Échanges                                    */
/* -------------------------------------------- */

/** Nouvel échange : les effets « jusqu'à la fin de l'échange suivant » s'usent. */
export async function newExchange(actor) {
  const i = actor.system.intrigue;
  if (!i) return;
  return actor.update({
    "system.intrigue.withdrawLeft": Math.max(0, i.withdrawLeft - 1),
    "system.intrigue.fastTalkedLeft": Math.max(0, i.fastTalkedLeft - 1),
    "system.intrigue.consider": Math.max(0, i.consider - 1),
    "system.intrigue.influenced": false
  });
}

/** Démarrer une intrigue dans le suivi de combat avec les jetons ciblés (initiative au Statut). */
export async function startIntrigue(actor) {
  const own = actor.getActiveTokens()[0];
  const tokens = [own, ...[...game.user.targets]].filter(Boolean);
  if (!own || tokens.length < 2) return ui.notifications.warn(loc("ASOIAF.Intrigue.needTokens"));
  const combat = await Combat.implementation.create({ scene: canvas.scene?.id, active: true, flags: { asoiaf: { intrigue: true } } });
  await combat.createEmbeddedDocuments("Combatant", tokens.map(t => ({ tokenId: t.id, sceneId: t.document?.parent?.id ?? canvas.scene?.id, actorId: t.actor?.id })));
  await combat.rollAll();
  ui.combat?.render?.(true);
  return card(actor, `<p>${fmt("ASOIAF.Intrigue.started", { names: tokens.map(t => t.name).join(", ") })}</p>`);
}

export function bindIntrigueButtons(message, html) {
  html.querySelectorAll("[data-action='apply-influence']").forEach(btn => btn.addEventListener("click", event => {
    event.preventDefault();
    return applyInfluence(message);
  }));
  html.querySelectorAll("[data-action='intrigue-effect']").forEach(btn => btn.addEventListener("click", event => {
    event.preventDefault();
    return applyIntrigueEffect(message, btn.dataset.effect);
  }));
}
