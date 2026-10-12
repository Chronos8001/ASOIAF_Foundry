import { ASOIAF } from "./config.mjs";

const renderTpl = (...args) => (foundry.applications.handlebars?.renderTemplate ?? renderTemplate)(...args);
const DialogV2 = foundry.applications.api.DialogV2;

/** Lit un formulaire de dialogue en objet simple. */
export function readForm(form) {
  const FDE = foundry.applications.ux?.FormDataExtended ?? FormDataExtended;
  return new FDE(form).object;
}

/**
 * Lance un test SIFRP.
 * - On lance (dés de test + dés bonus) d6.
 * - On écarte les plus faibles en nombre égal aux dés bonus.
 * - Chaque dé de pénalité annule ensuite le plus faible des dés restants.
 * - On additionne et on applique les modificateurs.
 */
export async function rollTest({
  actor, label, testDice, bonusDice = 0, penaltyDice = 0, modifier = 0,
  difficulty = null, extraFormula = "", damage = null, piercing = 0, extra = null, speaker = null
}) {
  testDice = Math.max(1, testDice);
  bonusDice = Math.max(0, Math.min(bonusDice, testDice));
  penaltyDice = Math.max(0, penaltyDice);

  const roll = await new Roll(`${testDice + bonusDice}d6`).evaluate();
  const rolls = [roll];
  const dice = roll.dice[0].results.map((r, i) => ({ value: r.result, index: i, status: "kept" }));

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

  let damageData = null;
  if (damage !== null && outcome?.success) {
    damageData = { base: damage, degrees: outcome.degrees, total: damage * outcome.degrees, piercing };
  } else if (damage !== null && difficulty === null) {
    damageData = { base: damage, degrees: null, total: null, piercing };
  }

  const content = await renderTpl("systems/asoiaf/templates/chat/roll.hbs", {
    label, dice, testDice, bonusDice, penaltyDice, modifier, extraFormula, extraTotal, total,
    difficulty, outcome, damage: damageData, extra
  });

  await ChatMessage.create({
    speaker: speaker ?? ChatMessage.getSpeaker({ actor }),
    content,
    rolls,
    sound: CONFIG.sounds.dice
  });
  return { total, outcome, dice };
}

/** Boîte de dialogue de paramétrage d'un test, puis lancer. */
export async function promptTest(options) {
  const target = game.user.targets.first()?.actor;
  const defaultDifficulty = options.defenseKey && target?.system[options.defenseKey] !== undefined
    ? target.system[options.defenseKey]
    : (options.difficulty ?? "");

  const content = await renderTpl("systems/asoiaf/templates/dialog/roll.hbs", {
    ...options,
    difficulty: defaultDifficulty,
    targetName: options.defenseKey ? target?.name : null,
    difficulties: Object.entries(ASOIAF.difficulties).map(([v, k]) => ({
      value: v, label: `${game.i18n.localize(`ASOIAF.Difficulty.${k}`)} (${v})`
    }))
  });

  const data = await DialogV2.prompt({
    window: { title: options.label },
    content,
    ok: {
      label: game.i18n.localize("ASOIAF.Roll.roll"),
      icon: "fa-solid fa-dice-six",
      callback: (event, button) => readForm(button.form)
    },
    rejectClose: false
  });
  if (!data) return null;

  return rollTest({
    ...options,
    testDice: Number(data.testDice),
    bonusDice: Number(data.bonusDice),
    penaltyDice: Number(data.penaltyDice),
    modifier: Number(data.modifier),
    difficulty: data.difficulty === "" || data.difficulty === null ? null : Number(data.difficulty),
    extraFormula: data.extraFormula ?? options.extraFormula ?? ""
  });
}

/** Active les boutons des cartes de discussion. */
export function bindChatButtons(message, html) {
  html.querySelectorAll("[data-action='apply-damage']").forEach(btn => {
    btn.addEventListener("click", async event => {
      event.preventDefault();
      const amount = Number(btn.dataset.damage);
      const piercing = Number(btn.dataset.piercing) || 0;
      const actors = getTargetActors();
      if (!actors.length) return ui.notifications.warn(game.i18n.localize("ASOIAF.Chat.noTarget"));
      for (const actor of actors) await actor.applyDamage(amount, piercing);
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
