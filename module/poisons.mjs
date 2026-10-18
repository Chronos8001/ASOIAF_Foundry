/**
 * Poisons et drogues (chapitre 7) : exposition, attaques programmées, soins et récupération.
 *
 * Une victime reçoit une copie active du poison (objet « poison » avec system.active).
 * Ses attaques suivent le temps du monde (game.time.worldTime) : quand le MJ avance le temps,
 * les attaques dues sont lancées seules. Les phases « à chaque round » suivent le suivi de combat.
 * Des boutons sur la fiche permettent aussi de lancer l'attaque suivante ou de tout résoudre.
 */
import { promptTest } from "./dice.mjs";
import * as R from "./poison-rules.mjs";

const loc = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);
const worldTime = () => game.time.worldTime ?? 0;
const DialogV2 = () => foundry.applications.api.DialogV2;

/** Un seul MJ fait tourner l'automatisation. */
export function isMainGM() {
  const gm = game.users.activeGM;
  return gm ? gm.isSelf : game.user.isGM;
}

/* -------------------------------------------- */
/*  Libellés                                    */
/* -------------------------------------------- */

function targetLabel(target) {
  if (target === "all") return loc("ASOIAF.Poison.allTests");
  return loc(`ASOIAF.Ability.${target}`);
}

/** Effet appliqué, lisible (« −2D Ruse »). */
export function describeEffect(e) {
  const v = e.value;
  const signed = n => (n > 0 ? `+${n}` : `${n}`.replace("-", "−"));
  const extra = e.label ? ` (${e.label})` : "";
  switch (e.kind) {
    case "penaltyDice": return `−${v}D ${targetLabel(e.target)}`;
    case "modifier": return `${signed(v)} ${targetLabel(e.target)}${extra}`;
    case "testDice": return `${signed(v)}D ${targetLabel(e.target)}${extra}`;
    case "bonusDice": return `${signed(v)}B ${targetLabel(e.target)}${extra}`;
    case "health": return `${loc("ASOIAF.Derived.health")} ${signed(v)}`;
    case "composure": return `${loc("ASOIAF.Derived.composure")} ${signed(v)}`;
    case "wounds": return fmt("ASOIAF.Poison.effWounds", { n: v });
    case "injuries": return fmt("ASOIAF.Poison.effInjuries", { n: v });
    case "halveInjuries": return loc("ASOIAF.Poison.effHalve");
    default: return e.label ?? "";
  }
}

/** Effet prévu (avec sa formule), pour la fiche d'objet. */
export function describeRule(e) {
  const formula = String(e.formula ?? "").replaceAll("@deg", loc("ASOIAF.Poison.degreesWord"));
  const kind = loc(`ASOIAF.Poison.kind_${e.kind}`);
  const targets = ["penaltyDice", "modifier", "testDice", "bonusDice"].includes(e.kind)
    ? ` · ${R.splitTargets(e.target).map(targetLabel).join(", ")}` : "";
  const flags = [e.permanent && loc("ASOIAF.Poison.permanent"), e.once && loc("ASOIAF.Poison.once"),
    e.always && loc("ASOIAF.Poison.always"), e.situational && (e.label || loc("ASOIAF.Poison.situational"))].filter(Boolean);
  const value = ["halveInjuries", "note"].includes(e.kind) ? "" : ` : ${formula}`;
  const note = e.kind === "note" ? ` : ${e.label}` : "";
  return `${kind}${targets}${value}${note}${flags.length ? ` (${flags.join(", ")})` : ""}`;
}

export function intervalLabel(seconds) {
  const key = R.intervalKey(seconds);
  return key ? loc(`ASOIAF.Poison.every_${key}`) : fmt("ASOIAF.Poison.everyDuration", { duration: durationLabel(seconds) });
}

export function durationLabel(seconds) {
  if (seconds <= 0) return loc("ASOIAF.Poison.now");
  if (seconds < R.MINUTE) return `${Math.ceil(seconds / R.ROUND)} round(s)`;
  if (seconds < R.HOUR) return `${Math.ceil(seconds / R.MINUTE)} min`;
  if (seconds < R.DAY) return `${Math.round(10 * seconds / R.HOUR) / 10} h`;
  return `${Math.round(10 * seconds / R.DAY) / 10} j`;
}

/* -------------------------------------------- */
/*  Outils                                      */
/* -------------------------------------------- */

/** Destinataires des cartes de poison : le MJ et les propriétaires de la victime (un poison est discret). */
function witnesses(actor) {
  return game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id);
}

async function chat(actor, html, { flags = {}, rolls = [], whisper = null } = {}) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="asoiaf-chat poison-card">${html}</div>`,
    whisper: whisper ?? witnesses(actor),
    rolls,
    flags
  });
}

async function setStatus(actor, id, active, overlay = false) {
  try {
    await actor.toggleStatusEffect?.(id, { active, overlay });
  } catch (err) {
    console.warn("ASOIAF | Effet de statut", err);
  }
}

const activePoisons = actor => actor?.items?.filter(i => i.type === "poison" && i.system.active) ?? [];

/** Bonus à la valeur passive contre les poisons (potion de purge…). */
function resistBonus(actor) {
  return activePoisons(actor).reduce((t, p) => t + (p.system.resistBonus || 0), 0);
}

function inCombat(actor) {
  return game.combats?.some(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid)) ?? false;
}

/** Données d'un poison prêtes à être copiées (une dose). */
export function poisonDose(item) {
  const data = item.toObject();
  for (const key of ["_id", "folder", "sort", "ownership", "_stats"]) delete data[key];
  data.system.quantity = 1;
  data.system.active = false;
  data.system.state = {};
  return data;
}

/* -------------------------------------------- */
/*  Exposition                                  */
/* -------------------------------------------- */

/** Expose un personnage à une dose de poison (données d'objet). */
export async function exposeActor(actor, data) {
  if (!actor?.system?.abilities) return;
  if (!actor.isOwner) return ui.notifications.warn(loc("ASOIAF.Warn.notOwner"));
  if (data.system.alcohol) return drink(actor, data);
  const now = worldTime();
  let item = activePoisons(actor).find(i => i.name === data.name);
  if (item) {
    await item.update({ "system.state": R.reexpose(item.system.state, item.system, now) });
    await chat(actor, `<p>${fmt("ASOIAF.Poison.reexposed", { name: actor.name, poison: item.name })}</p>`);
  } else {
    const obj = foundry.utils.deepClone(data);
    obj.system = { ...obj.system, active: true, quantity: 1, equipped: false, state: R.initialState(obj.system, now) };
    [item] = await actor.createEmbeddedDocuments("Item", [obj]);
    await setStatus(actor, "poison", true);
    await chat(actor, `<h3><i class="fa-solid fa-flask"></i> ${item.name}</h3>
      <p>${fmt("ASOIAF.Poison.exposed", { name: actor.name, poison: item.name })}</p>`);
  }
  await runDue(actor, item, now);
  return settle(actor, item, now);
}

/** Boire : l'alcool devient un poison au-delà de la limite (rang d'Endurance, spiritueux comptés double). */
async function drink(actor, data) {
  const kind = R.ALCOHOL[data.system.alcohol];
  const now = worldTime();
  const endurance = actor.system.abilities.endurance.value;
  let item = activePoisons(actor).find(i => i.system.alcohol);
  if (!item) {
    const obj = foundry.utils.deepClone(data);
    obj.name = loc("ASOIAF.Poison.drunk");
    const state = R.initialState(obj.system, now);
    state.stages.forEach(st => st.left = 0);
    obj.system = { ...obj.system, active: true, quantity: 1, equipped: false, state };
    [item] = await actor.createEmbeddedDocuments("Item", [obj]);
  }
  const state = foundry.utils.deepClone(item.system.state);
  state.servings = (state.servings ?? 0) + kind.servings;
  state.virulence = R.alcoholVirulence(state.servings, endurance);
  let warning = "";
  if (state.virulence > 0) {
    const st = state.stages[0];
    st.left = Math.max(st.left, kind.toxicity);
    // L'alcool agit cinq minutes après le dernier verre.
    st.next = now + (item.system.stages[0]?.firstDelay ?? 5 * R.MINUTE);
    state.course = false;
    state.courseAt = null;
    state.nextRecovery = null;
    warning = `<p class="warning">${fmt("ASOIAF.Poison.drunkWarning", { virulence: state.virulence })}</p>`;
  }
  await item.update({ "system.state": state });
  if (state.virulence > 0) await setStatus(actor, "poison", true);
  return chat(actor, `<p>${fmt("ASOIAF.Poison.drinks", { name: actor.name, drink: data.name, servings: state.servings, limit: endurance })}</p>${warning}`,
    { whisper: [] });
}

/* -------------------------------------------- */
/*  Attaques                                    */
/* -------------------------------------------- */

/**
 * Une attaque d'une phase : Virulence d6 contre la valeur passive, effets selon les degrés.
 * @param {number} at  instant (temps du monde) de l'attaque, pour programmer la suivante
 */
export async function poisonAttack(actor, item, index, at = worldTime()) {
  const sys = item.system;
  const stage = sys.stages[index];
  const before = sys.state;
  const virulence = before.virulence ?? sys.virulence;
  const defenseKey = stage.defense || "endurance";
  let degrees = 1, roll = null, total = 0, defense = 0;
  if (!stage.auto) {
    defense = R.passiveDefense(actor.system.abilities, defenseKey, { bonus: resistBonus(actor), treatment: before.treatment });
    if (virulence > 0) {
      roll = await new Roll(`${virulence}d6`).evaluate();
      total = roll.total;
    }
    degrees = R.attackDegrees(total, defense);
  }

  const res = R.applyStage(before, stage, index, degrees, at);
  let state = R.settleCourse(res.state, sys.stages, at);
  const lines = res.applied.map(describeEffect).concat(res.notes);

  // Inconscience due aux effets (lait de pavot, doux-sommeil).
  for (const formula of res.unconscious) {
    const r = await new Roll(formula).evaluate();
    state.unconsciousUntil = Math.max(state.unconsciousUntil ?? 0, at + r.total * R.HOUR);
    lines.push(fmt("ASOIAF.Poison.unconsciousFor", { hours: r.total }));
  }

  // Blessures infligées directement (venin de basilic).
  const s = actor.system;
  const update = {};
  if (res.wounds) update["system.wounds"] = s.wounds + res.wounds;
  if (res.injuries) update["system.injuries"] = Math.min(s.abilities.endurance.value, s.injuries + res.injuries);

  // Seuils : mort ou inconscience quand les dés de pénalité atteignent le rang.
  const warnings = [];
  for (const t of R.crossedThresholds(state, sys.thresholds, s.abilities)) {
    state.thresholdsHit.push(t.index);
    if (t.result === "death") {
      state.dead = true;
      warnings.push(fmt("ASOIAF.Poison.death", { name: actor.name, ability: targetLabel(t.ability) }));
    } else {
      const r = await new Roll(t.hours || "1").evaluate();
      state.unconsciousUntil = Math.max(state.unconsciousUntil ?? 0, at + r.total * R.HOUR);
      warnings.push(fmt("ASOIAF.Poison.passOut", { name: actor.name, hours: r.total }));
    }
  }
  if ((res.wounds) && s.wounds + res.wounds >= s.abilities.endurance.value) {
    state.dead = true;
    warnings.push(fmt("ASOIAF.Chat.dead", { name: actor.name }));
  }
  if (state.course && !before.course) state.nextRecovery = at + (sys.recovery.interval || R.DAY);
  // Test de suivi à faire : l'empoisonnement reste ouvert jusqu'à ce qu'il soit lancé.
  if (degrees && stage.followAbility) state.followPending = (state.followPending ?? 0) + 1;

  await item.update({ "system.state": state });
  if (Object.keys(update).length) await actor.update(update);
  if (state.unconsciousUntil && state.unconsciousUntil > worldTime()) await setStatus(actor, "unconscious", true);
  if (state.dead) await setStatus(actor, "dead", true, true);

  // Carte de l'attaque.
  const st = state.stages[index];
  const dice = roll ? roll.dice[0].results.map(r => `<span class="die kept">${r.result}</span>`).join("") : "";
  const attackLine = stage.auto
    ? `<p>${loc("ASOIAF.Poison.autoEffect")}</p>`
    : `<div class="dice-row">${dice}</div><p>${fmt("ASOIAF.Poison.attackLine", {
      virulence, total, defense, ability: loc(`ASOIAF.Ability.${defenseKey}`),
      treated: before.treatment && before.treatment >= defense ? loc("ASOIAF.Poison.treatedNote") : ""
    })}</p>`;
  const outcome = stage.auto ? "" : `<div class="outcome ${degrees ? "failure" : "success"}"><strong>${degrees
    ? fmt("ASOIAF.Poison.hit", { degrees }) : loc("ASOIAF.Poison.resisted")}</strong></div>`;
  const remaining = st.left > 0 && !stage.auto
    ? fmt("ASOIAF.Poison.attacksLeft", { left: st.left, every: intervalLabel(stage.interval) })
    : state.course ? loc("ASOIAF.Poison.courseRun") : "";
  const follow = degrees && stage.followAbility
    ? `<button type="button" data-action="poison-follow"><i class="fa-solid fa-dice-six"></i> ${stage.followLabel
      || loc(`ASOIAF.Ability.${stage.followAbility}`)} (${stage.followDifficulty})</button>` : "";
  await chat(actor, `<h3><i class="fa-solid fa-flask"></i> ${item.name}${stage.label ? ` — ${stage.label}` : ""}</h3>
    ${attackLine}${outcome}
    ${lines.length ? `<ul class="applied-effects">${lines.map(l => `<li>${l}</li>`).join("")}</ul>` : ""}
    ${warnings.map(w => `<p class="warning"><strong>${w}</strong></p>`).join("")}
    ${remaining ? `<p class="hint">${remaining}</p>` : ""}${follow}`, {
    rolls: roll ? [roll] : [],
    flags: follow ? { asoiaf: { poisonFollow: { actorUuid: actor.uuid, itemId: item.id, index } } } : {}
  });
  return degrees;
}

/** Phase prête dont l'attaque est due le plus tôt (avant `until`). */
function nextDue(item, until, includeRounds = true) {
  const { state, stages } = item.system;
  let best = null;
  stages.forEach((stage, i) => {
    if (!R.stageReady(state, stage, i)) return;
    if (!includeRounds && stage.interval <= R.ROUND) return;
    const next = state.stages[i].next ?? 0;
    if (next <= until && (!best || next < best.next)) best = { index: i, next };
  });
  return best;
}

/** Lance, dans l'ordre, toutes les attaques dues avant `until`. */
export async function runDue(actor, item, until = worldTime(), { includeRounds = true } = {}) {
  for (let guard = 0; guard < 200; guard++) {
    const fresh = actor.items.get(item.id);
    if (!fresh?.system.active || fresh.system.state.dead) return;
    const due = nextDue(fresh, until, includeRounds);
    if (!due) return;
    await poisonAttack(actor, fresh, due.index, Number.isFinite(until) ? due.next : Math.max(due.next, worldTime()));
  }
}

/** Attaque suivante, sans attendre le temps (bouton de la fiche). */
export async function nextAttack(actor, item) {
  const due = nextDue(item, Infinity);
  if (!due) return ui.notifications.info(loc("ASOIAF.Poison.noAttack"));
  await poisonAttack(actor, item, due.index, Math.max(worldTime(), due.next));
  return settle(actor, actor.items.get(item.id), worldTime());
}

/** Toutes les attaques restantes d'un coup (hors combat, ou pour gagner du temps). */
export async function resolveAll(actor, item) {
  await runDue(actor, item, Infinity);
  return settle(actor, actor.items.get(item.id), worldTime());
}

/* -------------------------------------------- */
/*  Récupération                                */
/* -------------------------------------------- */

/** Fin de l'empoisonnement : l'objet disparaît, les statuts aussi. */
async function endAffliction(actor, item, key = "ASOIAF.Poison.recovered") {
  const wasUnconscious = !!item.system.state.unconsciousUntil;
  await item.delete();
  if (!activePoisons(actor).length) await setStatus(actor, "poison", false);
  if (wasUnconscious && !activePoisons(actor).some(p => p.system.state.unconsciousUntil)) await setStatus(actor, "unconscious", false);
  return chat(actor, `<p>${fmt(key, { name: actor.name, poison: item.name })}</p>`);
}

/** Réveil, disparition des effets, récupération périodique : selon le temps écoulé. */
export async function settle(actor, item, now = worldTime()) {
  if (!item?.system.active) return;
  const sys = item.system;
  const r = sys.recovery;
  const s = foundry.utils.deepClone(sys.state);
  let changed = false;

  if (s.unconsciousUntil && now >= s.unconsciousUntil) {
    s.unconsciousUntil = null;
    changed = true;
    await chat(actor, `<p>${fmt("ASOIAF.Poison.wakes", { name: actor.name })}</p>`);
    if (!activePoisons(actor).some(p => p.id !== item.id && p.system.state.unconsciousUntil)) await setStatus(actor, "unconscious", false);
    if (r.fadeOnWake && s.course) return endAffliction(actor, item);
  }
  if (s.dead) {
    if (changed) await item.update({ "system.state": s });
    return;
  }
  if (s.recoverAt && now >= s.recoverAt) return endAffliction(actor, item);
  const awake = !(s.unconsciousUntil > now);
  if (r.mode === "fade" && r.fadeAfter > 0 && s.course && awake && now >= s.startedAt + r.fadeAfter) return endAffliction(actor, item);
  if (r.mode === "periodic" && s.course && r.interval > 0) {
    s.nextRecovery ??= (s.courseAt ?? now) + r.interval;
    for (let guard = 0; s.nextRecovery <= now && guard < 500; guard++) {
      s.penalties = R.recoveryStep(s.penalties, r.amount || 1);
      s.nextRecovery += r.interval;
      changed = true;
    }
  }
  // Plus rien à subir : le poison n'a pas (ou plus) d'effet.
  if (s.course && awake && !s.penalties.length && !s.recoverAt && !s.followPending) return endAffliction(actor, item);
  if (changed) await item.update({ "system.state": s });
}

/** Avance du temps du monde : attaques dues et récupération de tous les personnages empoisonnés. */
export async function tickAll(now = worldTime()) {
  const actors = new Set(game.actors.contents);
  for (const token of canvas?.scene?.tokens ?? []) if (!token.actorLink && token.actor) actors.add(token.actor);
  for (const actor of actors) {
    for (const item of activePoisons(actor)) {
      await runDue(actor, item, now, { includeRounds: !inCombat(actor) });
      await settle(actor, actor.items.get(item.id), now);
    }
  }
}

/** Nouveau round : les phases « à chaque round » attaquent. */
export async function roundTick(actors) {
  for (const actor of actors) {
    if (!actor?.isOwner) continue;
    for (const item of activePoisons(actor)) {
      const due = item.system.stages.map((stage, i) => ({ stage, i })).filter(({ stage, i }) =>
        stage.interval <= R.ROUND && R.stageReady(item.system.state, stage, i));
      for (const { i } of due) {
        const fresh = actor.items.get(item.id);
        if (!fresh?.system.active || fresh.system.state.dead) break;
        await poisonAttack(actor, fresh, i, worldTime());
      }
      await settle(actor, actor.items.get(item.id), worldTime());
    }
  }
}

/** Bouton « Récupérer » : selon le poison, test d'Endurance, étape de récupération ou fin des effets. */
export async function recover(actor, item) {
  const r = item.system.recovery;
  const s = foundry.utils.deepClone(item.system.state);
  if (!s.course) return ui.notifications.warn(loc("ASOIAF.Poison.stillActive"));
  if (r.mode === "permanent") return ui.notifications.warn(loc("ASOIAF.Poison.permanentWarn"));
  if (r.mode === "fade") return endAffliction(actor, item);
  if (r.mode === "periodic") {
    s.penalties = R.recoveryStep(s.penalties, r.amount || 1);
    s.nextRecovery = worldTime() + r.interval;
    await item.update({ "system.state": s });
    await chat(actor, `<p>${fmt("ASOIAF.Poison.recoveryStep", { name: actor.name, poison: item.name })}</p>`);
    return settle(actor, actor.items.get(item.id));
  }
  // Test d'Endurance : chaque degré retire une pénalité.
  const test = actor.system.getTestData("endurance");
  const result = await promptTest({ actor, label: `${loc("ASOIAF.Poison.recoveryTest")} — ${item.name}`, ...test, difficulty: r.difficulty || 9 });
  if (!result?.outcome?.success) return;
  s.penalties = R.recoveryStep(s.penalties, (r.amount || 1) * result.outcome.degrees);
  await item.update({ "system.state": s });
  return settle(actor, actor.items.get(item.id));
}

/** Brûler un point de Destinée : le poison cesse ; guérison complète après le délai prévu. */
export async function burnDestiny(actor, item) {
  const d = actor.system.destiny;
  if (d.value < 1) return ui.notifications.warn(loc("ASOIAF.Poison.noDestiny"));
  const ok = await DialogV2().confirm({
    window: { title: loc("ASOIAF.Poison.burnDestiny") },
    content: `<p>${fmt("ASOIAF.Poison.burnConfirm", { poison: item.name })}</p>`,
    rejectClose: false
  });
  if (!ok) return;
  const s = foundry.utils.deepClone(item.system.state);
  s.stages.forEach(st => st.left = 0);
  s.course = true;
  s.courseAt ??= worldTime();
  s.dead = false;
  let delay = "";
  if (item.system.recovery.destinyDelay) {
    const roll = await new Roll(item.system.recovery.destinyDelay).evaluate();
    s.recoverAt = worldTime() + roll.total * R.DAY;
    delay = fmt("ASOIAF.Poison.recoversIn", { days: roll.total });
  }
  await actor.update({ "system.destiny.value": d.value - 1, "system.destiny.burned": d.burned + 1 });
  await item.update({ "system.state": s });
  await setStatus(actor, "dead", false);
  await chat(actor, `<p>${fmt("ASOIAF.Poison.destinyBurned", { name: actor.name, poison: item.name })} ${delay}</p>`, { whisper: [] });
  return settle(actor, actor.items.get(item.id));
}

/* -------------------------------------------- */
/*  Soins                                       */
/* -------------------------------------------- */

/** Le soigneur : jeton sélectionné (autre que la victime), sinon personnage du joueur, sinon la victime. */
function pickHealer(victim) {
  const controlled = canvas?.tokens?.controlled?.map(t => t.actor).find(a => a?.system?.abilities && a.uuid !== victim.uuid);
  return controlled ?? (game.user.character?.system?.abilities ? game.user.character : victim);
}

/** Diagnostic : Soins (Diagnostic) contre la Difficulté du poison. */
export async function diagnose(actor, item) {
  const healer = pickHealer(actor);
  const test = healer.system.getTestData("healing", "diagnose");
  const result = await promptTest({ actor: healer, label: `${loc("ASOIAF.Poison.diagnose")} — ${actor.name}`, ...test, difficulty: item.system.diagnosis });
  if (!result?.outcome?.success) return;
  await item.update({ "system.state.diagnosed": true });
  return chat(actor, `<p>${fmt("ASOIAF.Poison.diagnosed", { healer: healer.name, poison: item.name })}</p>`);
}

/**
 * Traitement : le résultat de Soins (Traiter un mal) remplace la valeur passive de la victime s'il est meilleur.
 * Certains poisons (sang de veuve) se guérissent : une réussite retarde d'un jour, assez de degrés guérissent.
 */
export async function treat(actor, item) {
  if (!item.system.state.diagnosed) return ui.notifications.warn(loc("ASOIAF.Poison.diagnoseFirst"));
  const healer = pickHealer(actor);
  const sys = item.system;
  const test = healer.system.getTestData("healing", "treatAilment");
  const result = await promptTest({ actor: healer, label: `${loc("ASOIAF.Poison.treat")} — ${actor.name}`, ...test,
    difficulty: sys.cureDegrees ? sys.diagnosis : null });
  if (!result) return;
  const s = foundry.utils.deepClone(sys.state);
  s.treatment = Math.max(s.treatment ?? 0, result.total);
  let note = fmt("ASOIAF.Poison.treated", { healer: healer.name, total: result.total });
  if (sys.cureDegrees && result.outcome?.success) {
    if (result.outcome.degrees >= sys.cureDegrees) {
      s.stages.forEach(st => st.left = 0);
      note = fmt("ASOIAF.Poison.cured", { healer: healer.name, poison: item.name });
    } else {
      sys.stages.forEach((stage, i) => { if (stage.auto) s.stages[i].next += stage.interval; });
      note = fmt("ASOIAF.Poison.halted", { healer: healer.name, poison: item.name });
    }
    Object.assign(s, R.settleCourse(s, sys.stages, worldTime()));
    if (s.course) s.nextRecovery = worldTime() + (sys.recovery.interval || R.DAY);
  }
  await item.update({ "system.state": s });
  await chat(actor, `<p>${note}</p>`);
  return settle(actor, actor.items.get(item.id));
}

/** Test de suivi d'une attaque (Volonté contre la folie du sang de basilic…). */
export async function poisonFollowUp(message) {
  const flag = message.getFlag("asoiaf", "poisonFollow");
  const actor = flag ? fromUuidSync(flag.actorUuid) : null;
  const item = actor?.items.get(flag.itemId);
  if (!item) return;
  if (!actor.isOwner) return ui.notifications.warn(loc("ASOIAF.Warn.notOwner"));
  const stage = item.system.stages[flag.index];
  const test = actor.system.getTestData(stage.followAbility);
  const result = await promptTest({ actor, label: stage.followLabel || loc(`ASOIAF.Ability.${stage.followAbility}`), ...test,
    difficulty: stage.followDifficulty });
  if (!result?.outcome) return;
  const s = foundry.utils.deepClone(item.system.state);
  s.followPending = Math.max(0, (s.followPending ?? 0) - 1);
  const e = stage.followFail;
  if (!result.outcome.success && e?.kind === "note" && e.label) await chat(actor, `<p class="warning">${e.label}</p>`);
  if (!result.outcome.success && e?.kind && e.kind !== "note") {
    const value = R.evalFormula(e.formula, 1);
    const applied = R.splitTargets(e.target).map(target => {
      const entry = { kind: e.kind, target, value, permanent: !!e.permanent, situational: !!e.situational, label: e.label ?? "" };
      R.addPenalty(s.penalties, entry);
      return entry;
    });
    await chat(actor, `<p class="warning">${applied.map(describeEffect).join(", ")}</p>`);
  }
  await item.update({ "system.state": s });
  return settle(actor, actor.items.get(item.id));
}

/* -------------------------------------------- */
/*  Administrer, enduire une arme               */
/* -------------------------------------------- */

/** Utiliser une dose de l'inventaire : soi-même, une cible, ou enduire une arme (poison de contact). */
export async function administer(actor, item) {
  if (item.system.quantity < 1) return ui.notifications.warn(loc("ASOIAF.Poison.noDose"));
  const targets = [...game.user.targets].map(t => t.actor).filter(a => a?.system?.abilities && a.uuid !== actor.uuid);
  const contact = String(item.system.delivery).includes("contact");
  const weapons = contact ? actor.items.filter(i => i.type === "weapon") : [];
  const choices = [`<option value="self">${fmt("ASOIAF.Poison.onSelf", { name: actor.name })}</option>`,
    ...targets.map(t => `<option value="actor:${t.uuid}">${fmt("ASOIAF.Poison.onTarget", { name: t.name })}</option>`),
    ...weapons.map(w => `<option value="weapon:${w.id}">${fmt("ASOIAF.Poison.coat", { name: w.name })}</option>`)];
  if (targets.length) choices.push(choices.shift());
  const data = await DialogV2().prompt({
    window: { title: `${loc("ASOIAF.Poison.administer")} — ${item.name}` },
    content: `<div class="asoiaf-dialog"><div class="form-group"><label>${loc("ASOIAF.Poison.how")}</label>
      <select name="choice">${choices.join("")}</select></div>
      <p class="hint">${loc("ASOIAF.Poison.administerHint")}</p></div>`,
    ok: { label: loc("ASOIAF.Poison.administer"), callback: (event, button) => button.form.elements.choice.value },
    rejectClose: false
  });
  if (!data) return;

  const dose = poisonDose(item);
  if (item.system.quantity <= 1) await item.delete();
  else await item.update({ "system.quantity": item.system.quantity - 1 });

  if (data.startsWith("weapon:")) {
    const weapon = actor.items.get(data.slice(7));
    await weapon?.setFlag("asoiaf", "coating", dose);
    return chat(actor, `<p>${fmt("ASOIAF.Poison.coated", { name: actor.name, weapon: weapon?.name, poison: item.name })}</p>`,
      { whisper: game.users.filter(u => u.isGM || u.isSelf).map(u => u.id) });
  }
  const target = data === "self" ? actor : fromUuidSync(data.slice(6));
  if (!target) return;
  if (target.isOwner) return exposeActor(target, dose);
  // Victime d'un autre joueur : le MJ applique le poison depuis la carte (envoyée en secret).
  return chat(actor, `<p>${fmt("ASOIAF.Poison.attempt", { name: actor.name, poison: item.name, target: target.name })}</p>
    <button type="button" data-action="apply-poison"><i class="fa-solid fa-flask"></i> ${loc("ASOIAF.Poison.applyGM")}</button>`, {
    whisper: game.users.filter(u => u.isGM || u.isSelf).map(u => u.id),
    flags: { asoiaf: { poison: { name: item.name, data: dose, targets: [target.uuid] } } }
  });
}

/** Bouton d'une carte : empoisonne les cibles (arme enduite) ou la victime désignée (dose administrée). */
export async function applyPoisonMessage(message) {
  const flag = message.getFlag("asoiaf", "poison");
  if (!flag) return;
  if (message.getFlag("asoiaf", "poisonApplied")) return ui.notifications.info(loc("ASOIAF.Poison.alreadyApplied"));
  const actors = flag.targets?.length
    ? flag.targets.map(uuid => fromUuidSync(uuid)).filter(Boolean)
    : [...game.user.targets].map(t => t.actor).filter(a => a?.system?.abilities);
  if (!actors.length) return ui.notifications.warn(loc("ASOIAF.Chat.noTarget"));
  if (actors.some(a => !a.isOwner)) return ui.notifications.warn(loc("ASOIAF.Poison.gmOnly"));
  for (const actor of actors) await exposeActor(actor, flag.data);
  if (message.isOwner) await message.setFlag("asoiaf", "poisonApplied", true);
  // Le poison sur la lame ne sert qu'une fois.
  const weapon = flag.weaponUuid ? fromUuidSync(flag.weaponUuid) : null;
  if (weapon?.isOwner) await weapon.unsetFlag("asoiaf", "coating");
}

/* -------------------------------------------- */
/*  Fiche                                       */
/* -------------------------------------------- */

/** Données d'affichage d'un empoisonnement en cours. */
export function afflictionContext(item) {
  const sys = item.system;
  const s = sys.state ?? {};
  const now = worldTime();
  const stages = sys.stages.map((stage, i) => {
    const st = s.stages?.[i] ?? { left: 0 };
    const ready = R.stageReady(s, stage, i);
    return {
      label: stage.label || item.name,
      left: st.left,
      every: intervalLabel(stage.interval),
      next: ready ? durationLabel((st.next ?? now) - now) : null,
      waiting: st.left > 0 && !ready
    };
  }).filter(st => st.left > 0);
  const recovery = sys.recovery;
  let recoveryText = "";
  if (s.recoverAt) recoveryText = fmt("ASOIAF.Poison.recoversIn", { days: Math.max(0, Math.ceil((s.recoverAt - now) / R.DAY)) });
  else if (s.course) {
    if (recovery.mode === "fade") recoveryText = fmt("ASOIAF.Poison.fadesIn", { duration: durationLabel(s.startedAt + recovery.fadeAfter - now) });
    else if (recovery.mode === "periodic") recoveryText = fmt("ASOIAF.Poison.periodicText", { every: intervalLabel(recovery.interval), next: durationLabel((s.nextRecovery ?? now) - now) });
    else if (recovery.mode === "test") recoveryText = fmt("ASOIAF.Poison.testText", { every: intervalLabel(recovery.interval), difficulty: recovery.difficulty });
    else recoveryText = loc("ASOIAF.Poison.permanentText");
  }
  return {
    id: item.id,
    name: item.name,
    img: item.img,
    stages,
    penalties: (s.penalties ?? []).map(p => describeEffect(p) + (p.permanent ? " *" : "")).join(", "),
    unconscious: s.unconsciousUntil ? durationLabel(s.unconsciousUntil - now) : null,
    servings: sys.alcohol ? s.servings : null,
    dead: s.dead,
    course: s.course,
    diagnosed: s.diagnosed,
    treatment: s.treatment,
    recoveryText,
    canRecover: s.course && recovery.mode !== "permanent",
    hasAttacks: stages.some(st => !st.waiting)
  };
}
