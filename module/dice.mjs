import { ASOIAF } from "./config.mjs";
import { applyRerolls, convertCount, emptyContribution, mergeContribution } from "./effects.mjs";
import { ignite } from "./siege.mjs";
import { applyPoisonMessage, poisonFollowUp } from "./poisons.mjs";
import { attackButtons, bindCombatButtons, criticalDamage, criticalResult } from "./combat-actions.mjs";
import { bindIntrigueButtons } from "./intrigue.mjs";

const renderTpl = (...args) => (foundry.applications.handlebars?.renderTemplate ?? renderTemplate)(...args);
const DialogV2 = foundry.applications.api.DialogV2;

/** Lit un formulaire de dialogue en objet simple. */
export function readForm(form) {
  const FDE = foundry.applications.ux?.FormDataExtended ?? FormDataExtended;
  return new FDE(form).object;
}

/**
 * Lance un test SIFRP.
 * - Des dés bonus peuvent d'abord être convertis en dés de test (qualités).
 * - On lance (dés de test + dés bonus) d6, puis on applique les relances (1 ou 6) dues aux qualités.
 * - On écarte les plus faibles en nombre égal aux dés bonus.
 * - Chaque dé de pénalité annule ensuite le plus faible des dés restants.
 * - On additionne et on applique les modificateurs.
 */
export async function rollTest({
  actor, label, testDice, bonusDice = 0, penaltyDice = 0, modifier = 0,
  convert = 0, convertHalf = false, reroll1 = 0, reroll6 = false,
  difficulty = null, extraFormula = "", damage = null, damageAfter = 0, piercing = 0, burn = null,
  extra = null, effects = [], speaker = null, poison = null, attack = null, targetUuid = null
}) {
  testDice = Math.max(1, testDice);
  bonusDice = Math.max(0, bonusDice);
  const converted = convertCount(convert, convertHalf, bonusDice);
  testDice += converted;
  bonusDice = Math.min(bonusDice - converted, testDice);
  penaltyDice = Math.max(0, penaltyDice);

  const roll = await new Roll(`${testDice + bonusDice}d6`).evaluate();
  const rolls = [roll];

  // Relances : un seul jet supplémentaire regroupé, consommé dé par dé.
  const initial = roll.dice[0].results.map(r => r.result);
  const needed = (reroll6 ? initial.filter(v => v === 6).length : 0) + Math.min(reroll1, initial.filter(v => v === 1).length);
  let pool = [];
  if (needed > 0) {
    const rr = await new Roll(`${needed}d6`).evaluate();
    rolls.push(rr);
    pool = rr.dice[0].results.map(r => r.result);
  }
  const rerolled = applyRerolls(initial, { reroll1, reroll6 }, () => pool.shift() ?? 1);
  const dice = rerolled.map((d, i) => ({ value: d.value, original: d.original, index: i, status: "kept" }));

  const sorted = [...dice].sort((x, y) => x.value - y.value);
  sorted.slice(0, bonusDice).forEach(d => d.status = "bonus");
  sorted.slice(bonusDice, bonusDice + penaltyDice).forEach(d => d.status = "penalty");

  let extraTotal = 0;
  if (extraFormula) {
    const extraRoll = await new Roll(extraFormula).evaluate();
    rolls.push(extraRoll);
    extraTotal = extraRoll.total;
  }

  const sum = dice.filter(d => d.status === "kept").reduce((t, d) => t + d.value, 0);
  const total = sum + modifier + extraTotal;

  let outcome = null;
  if (difficulty !== null && difficulty !== undefined && difficulty !== "") {
    const margin = total - Number(difficulty);
    if (margin >= 0) {
      const degrees = Math.min(4, 1 + Math.floor(margin / 5));
      outcome = { success: true, degrees, margin, critical: false, label: game.i18n.localize(`ASOIAF.Degree.${ASOIAF.degrees[degrees]}`) };
    } else {
      outcome = { success: false, degrees: 0, margin, critical: margin <= -5, label: game.i18n.localize(margin >= -4 ? "ASOIAF.Roll.marginalFailure" : "ASOIAF.Roll.criticalFailure") };
    }
  }

  // Coups critiques et maladresses (règles optionnelles) : seulement pour les attaques.
  const crit = criticalResult(attack, outcome, total, Number(difficulty), dice);
  if (damage !== null) damage += criticalDamage(crit);

  let damageData = null;
  if (damage !== null && outcome?.success) {
    damageData = { base: damage, degrees: outcome.degrees, after: damageAfter, total: damage * outcome.degrees + damageAfter, piercing, burn };
  } else if (damage !== null && (difficulty === null || difficulty === "")) {
    damageData = { base: damage, degrees: null, after: damageAfter, total: null, piercing };
  }
  if (damageData) Object.assign(damageData, { targetUuid, vicious: !!attack?.q?.vicious });

  // Effets proposés après l'attaque (qualités d'arme, actions spéciales, critiques).
  const buttons = attackButtons(attack, outcome, total, crit).map(b => {
    if (b.effect === "stagger" && damageData?.total) {
      b.damage = damage * (outcome.degrees - 1) + damageAfter;
      b.piercing = piercing;
    }
    return { ...b, degrees: outcome?.degrees ?? 0 };
  });
  const critical = crit ? {
    type: crit.type,
    title: game.i18n.localize(`ASOIAF.${crit.type === "critical" ? "Critical" : "Fumble"}.title`),
    text: game.i18n.localize(`ASOIAF.${crit.type === "critical" ? "Critical" : "Fumble"}.${crit.key}`)
  } : null;

  const content = await renderTpl("systems/asoiaf/templates/chat/roll.hbs", {
    label, dice, testDice, bonusDice, penaltyDice, modifier, extraFormula, extraTotal, total, converted,
    rerolls: dice.filter(d => d.original !== null).length,
    difficulty, outcome, damage: damageData, extra, effects, buttons, critical,
    poison: poison && (outcome?.success || !outcome) ? poison : null
  });

  const flags = {};
  if (poison && (outcome?.success || !outcome)) flags.poison = poison;
  if (attack) flags.attack = attack;
  await ChatMessage.create({
    speaker: speaker ?? ChatMessage.getSpeaker({ actor }),
    content,
    rolls,
    sound: CONFIG.sounds.dice,
    flags: Object.keys(flags).length ? { asoiaf: flags } : {}
  });
  return { total, outcome, dice };
}

/**
 * Boîte de dialogue de paramétrage d'un test, puis lancer.
 * Les effets situationnels des qualités apparaissent comme cases à cocher.
 */
export async function promptTest(options) {
  const target = game.user.targets.first()?.actor;
  const defaultDifficulty = options.defenseKey && target?.system[options.defenseKey] !== undefined
    ? target.system[options.defenseKey]
    : (options.difficulty ?? "");
  const situational = options.situational ?? [];

  const content = await renderTpl("systems/asoiaf/templates/dialog/roll.hbs", {
    ...options,
    reroll1: Math.min(options.reroll1 ?? 0, 99),
    convert: Math.min(options.convert ?? 0, options.bonusDice ?? 0),
    difficulty: defaultDifficulty,
    targetName: options.defenseKey ? target?.name : null,
    situational: situational.map((s, i) => ({ ...s, index: i })),
    difficulties: Object.entries(ASOIAF.difficulties).map(([v, k]) => ({
      value: v, label: `${game.i18n.localize(`ASOIAF.Difficulty.${k}`)} (${v})`
    }))
  });

  const data = await DialogV2.prompt({
    window: { title: options.label },
    classes: ["asoiaf", "asoiaf-roll-dialog"],
    position: { width: 500 },
    content,
    ok: {
      label: game.i18n.localize("ASOIAF.Roll.roll"),
      icon: "fa-solid fa-dice-six",
      callback: (event, button) => readForm(button.form)
    },
    rejectClose: false
  });
  if (!data) return null;

  // Valeurs saisies, puis effets situationnels cochés.
  let c = {
    ...emptyContribution(),
    testDice: Number(data.testDice) || 0,
    bonusDice: Number(data.bonusDice) || 0,
    penaltyDice: Number(data.penaltyDice) || 0,
    modifier: Number(data.modifier) || 0,
    convert: Number(data.convert) || 0,
    convertHalf: !!options.convertHalf,
    reroll1: Number(data.reroll1) || 0,
    reroll6: !!data.reroll6
  };
  const applied = [];
  situational.forEach((s, i) => {
    if (!data[`sit_${i}`]) return;
    c = mergeContribution(c, s.contrib);
    applied.push(`${s.label} (${s.summary})`);
  });

  const base = {
    ...options,
    damage: options.damage === null || options.damage === undefined ? null : options.damage + c.damage,
    damageAfter: (options.damageAfter ?? 0) + c.damageAfter,
    effects: [...(options.effects ?? []), ...applied],
    difficulty: data.difficulty === "" || data.difficulty === null ? null : Number(data.difficulty),
    extraFormula: data.extraFormula ?? options.extraFormula ?? ""
  };
  // Choix propres à l'appelant (actions d'attaque…) : ils ajustent les dés, la Difficulté, les dégâts.
  const prep = options.onConfirm ? await options.onConfirm(data, c, base) : null;
  const dice = () => ({
    testDice: c.testDice, bonusDice: c.bonusDice, penaltyDice: c.penaltyDice, modifier: c.modifier,
    convert: c.convert, convertHalf: c.convertHalf, reroll1: c.reroll1, reroll6: c.reroll6
  });
  if (prep?.rolls) {
    let last = null;
    for (const r of prep.rolls) last = await rollTest({ ...base, ...dice(), ...r, onConfirm: null });
    return last;
  }
  const merged = { ...base, ...dice(), ...(prep ?? {}) };
  if (prep?.effects) merged.effects = [...base.effects, ...prep.effects];
  return rollTest(merged);
}

/** Active les boutons des cartes de discussion. */
export function bindChatButtons(message, html) {
  html.querySelectorAll("[data-action='apply-damage']").forEach(btn => {
    btn.addEventListener("click", async event => {
      event.preventDefault();
      const amount = Number(btn.dataset.damage);
      const piercing = Number(btn.dataset.piercing) || 0;
      // Cible mémorisée par l'attaque (attaque divisée, cible désignée), sinon les cibles actuelles.
      const fixed = btn.dataset.targetUuid ? fromUuidSync(btn.dataset.targetUuid) : null;
      const actors = fixed ? [fixed] : getTargetActors();
      if (!actors.length) return ui.notifications.warn(game.i18n.localize("ASOIAF.Chat.noTarget"));
      for (const actor of actors) {
        if (!actor.isOwner) {
          ui.notifications.warn(game.i18n.localize("ASOIAF.Warn.notOwner"));
          continue;
        }
        await actor.applyDamage(amount, piercing, { vicious: btn.dataset.vicious === "true" });
        // Munitions incendiaires : la cible brûle pendant plusieurs rounds.
        if (btn.dataset.burnDamage) await ignite(actor, Number(btn.dataset.burnDamage), btn.dataset.burnRounds);
      }
    });
  });

  bindCombatButtons(message, html);
  bindIntrigueButtons(message, html);

  // Poison : empoisonner les cibles (arme enduite, dose administrée), test de suivi d'une attaque.
  html.querySelectorAll("[data-action='apply-poison']").forEach(btn => {
    btn.addEventListener("click", event => {
      event.preventDefault();
      return applyPoisonMessage(message);
    });
  });
  html.querySelectorAll("[data-action='poison-follow']").forEach(btn => {
    btn.addEventListener("click", event => {
      event.preventDefault();
      return poisonFollowUp(message);
    });
  });

  // Encaisser une blessure depuis une carte de dégâts : réservé au propriétaire du personnage.
  html.querySelectorAll("[data-action='absorb']").forEach(btn => {
    btn.addEventListener("click", async event => {
      event.preventDefault();
      const hit = message.getFlag("asoiaf", "damage");
      const actor = hit ? fromUuidSync(hit.actorUuid) : null;
      if (!actor) return;
      if (!actor.isOwner) return ui.notifications.warn(game.i18n.localize("ASOIAF.Warn.notOwner"));
      await actor.absorbHit(message, btn.dataset.kind);
    });
  });
}

function getTargetActors() {
  const tokens = game.user.targets.size ? [...game.user.targets] : canvas.tokens?.controlled ?? [];
  return tokens.map(t => t.actor).filter(a => a?.system?.health);
}
