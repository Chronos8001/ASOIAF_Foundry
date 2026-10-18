/**
 * Règles des poisons et drogues (chapitre 7), sans dépendance à Foundry : testables seules.
 *
 * Un poison a une ou plusieurs phases (stages). Chaque phase attaque à intervalle régulier
 * (Fréquence) un nombre limité de fois (Toxicité) : Virulence d6 contre la valeur passive
 * de la victime (Endurance × 4, ou Volonté × 4). Chaque attaque réussie applique ses effets,
 * calculés selon les degrés de réussite, et les effets se cumulent.
 *
 * Effet : { kind, target, formula, permanent, once, always, situational, label }
 *   kind     penaltyDice | modifier | testDice | bonusDice | health | composure
 *            | wounds | injuries | unconscious | halveInjuries | note
 *   target   capacité, liste « agility,athletics », ou « all »
 *   formula  expression où @deg vaut les degrés de réussite (ex. « 1+floor(@deg/2) »)
 *   once     seulement à la première attaque réussie de la phase
 *   always   s'applique même si l'attaque échoue (avec 1 degré)
 */

/** Durées en secondes du temps du monde. Un round dure 6 secondes. */
export const ROUND = 6;
export const MINUTE = 60;
export const HOUR = 3600;
export const DAY = 86400;
export const WEEK = 604800;

/** Effets cumulés comme pénalités (et bonus) sur la fiche de la victime. */
export const STACKING_KINDS = ["penaltyDice", "modifier", "testDice", "bonusDice", "health", "composure", "halveInjuries"];

/** Évalue une formule de poison. Seuls nombres, opérateurs et floor/ceil/min/max/round sont admis. */
export function evalFormula(formula, deg = 1) {
  const expr = String(formula ?? "").trim().replaceAll("@deg", `(${Number(deg) || 0})`);
  if (!expr) return 0;
  if (!/^[\d\s+\-*/().,]*$/.test(expr.replace(/\b(floor|ceil|min|max|round)\b/g, ""))) return 0;
  try {
    const value = new Function("floor", "ceil", "min", "max", "round", `"use strict"; return (${expr});`)(
      Math.floor, Math.ceil, Math.min, Math.max, Math.round);
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  } catch {
    return 0;
  }
}

/** Degrés de réussite d'une attaque (comme un test : 1 + 1 par tranche de 5, maximum 4). */
export function attackDegrees(total, defense) {
  const margin = total - defense;
  if (margin < 0) return 0;
  return Math.min(4, 1 + Math.floor(margin / 5));
}

/** Valeur passive de la victime contre une phase : rang × 4 + bonus, ou le résultat du soigneur s'il est meilleur. */
export function passiveDefense(abilities, ability, { bonus = 0, treatment = 0 } = {}) {
  const rank = abilities?.[ability]?.value ?? 2;
  return Math.max(rank * 4 + bonus, treatment || 0);
}

/** État de départ d'une victime exposée au poison. */
export function initialState(system, now = 0) {
  return {
    startedAt: now,
    stages: (system.stages ?? []).map(s => ({
      left: s.toxicity,
      next: now + (s.firstDelay ?? 0),
      successes: 0,
      attacks: 0
    })),
    penalties: [],
    course: false,
    courseAt: null,
    nextRecovery: null,
    unconsciousUntil: null,
    thresholdsHit: [],
    diagnosed: false,
    treatment: 0,
    recoverAt: null,
    dead: false,
    servings: 0,
    virulence: null,
    followPending: 0
  };
}

/** Nouvelle dose d'un poison déjà actif : chaque phase regagne sa Toxicité. */
export function reexpose(state, system, now = 0) {
  const s = structuredClone(state);
  (system.stages ?? []).forEach((stage, i) => {
    const st = s.stages[i] ??= { left: 0, next: now, successes: 0, attacks: 0 };
    if (st.left <= 0) st.next = now + (stage.firstDelay ?? 0);
    st.left += stage.toxicity;
  });
  s.course = false;
  s.courseAt = null;
  s.recoverAt = null;
  return s;
}

/** Cibles d'un effet (« agility,athletics » -> deux cibles). */
export function splitTargets(target) {
  const list = String(target ?? "").split(",").map(t => t.trim()).filter(Boolean);
  return list.length ? list : ["all"];
}

/** Ajoute une pénalité en fusionnant avec une entrée identique. */
export function addPenalty(penalties, entry) {
  const same = penalties.find(p => p.kind === entry.kind && p.target === entry.target
    && !!p.permanent === !!entry.permanent && !!p.situational === !!entry.situational && (p.label ?? "") === (entry.label ?? ""));
  if (same) same.value += entry.value;
  else penalties.push({ ...entry });
  return penalties;
}

/**
 * Applique une attaque d'une phase : effets selon les degrés, puis compteurs de la phase.
 * @returns {{ state, applied: object[], wounds: number, injuries: number, unconscious: string[], notes: string[] }}
 */
export function applyStage(state, stage, index, degrees, now = 0) {
  const s = structuredClone(state);
  const st = s.stages[index];
  const success = degrees > 0;
  const out = { state: s, applied: [], wounds: 0, injuries: 0, unconscious: [], notes: [] };
  for (const e of stage.effects ?? []) {
    if (!success && !e.always) continue;
    // « Une fois » : première attaque (effets « toujours ») ou premier succès de la phase.
    if (e.once && (e.always ? st.attacks > 0 : st.successes > 0)) continue;
    const deg = Math.max(1, degrees);
    const value = ["unconscious", "note", "halveInjuries"].includes(e.kind) ? 0 : evalFormula(e.formula, deg);
    switch (e.kind) {
      case "wounds": out.wounds += Math.max(0, value); out.applied.push({ kind: e.kind, value }); break;
      case "injuries": out.injuries += Math.max(0, value); out.applied.push({ kind: e.kind, value }); break;
      case "unconscious": out.unconscious.push(String(e.formula).replaceAll("@deg", String(deg))); break;
      case "note": out.notes.push(e.label); break;
      case "halveInjuries":
        if (!s.penalties.some(p => p.kind === "halveInjuries")) {
          s.penalties.push({ kind: "halveInjuries", target: "all", value: 1, permanent: false, situational: false, label: "" });
          out.applied.push({ kind: e.kind, value: 1 });
        }
        break;
      default:
        if (!value) break;
        for (const target of splitTargets(e.target)) {
          const entry = { kind: e.kind, target, value, permanent: !!e.permanent, situational: !!e.situational, label: e.label ?? "" };
          addPenalty(s.penalties, entry);
          out.applied.push(entry);
        }
    }
  }
  st.attacks += 1;
  st.left -= 1;
  if (success) st.successes += 1;
  st.next = now + Math.max(ROUND, stage.interval || ROUND);
  return out;
}

/** Total des dés de pénalité du poison sur une capacité (y compris « tous les tests »). */
export function penaltyDiceOn(penalties, ability) {
  return penalties.filter(p => p.kind === "penaltyDice" && (p.target === ability || p.target === "all"))
    .reduce((t, p) => t + p.value, 0);
}

/**
 * Seuils franchis (mort, inconscience) : dés de pénalité >= rang × multiplicateur.
 * Ne renvoie que les seuils pas encore atteints.
 */
export function crossedThresholds(state, thresholds, abilities) {
  const hit = [];
  (thresholds ?? []).forEach((t, index) => {
    if (state.thresholdsHit?.includes(index)) return;
    const rank = abilities?.[t.ability]?.value ?? 0;
    if (rank <= 0) return;
    if (penaltyDiceOn(state.penalties, t.ability) >= rank * Math.max(1, t.multiplier || 1)) hit.push({ ...t, index });
  });
  return hit;
}

/** Une étape de récupération : chaque pénalité non permanente perd `amount` (bonus compris). */
export function recoveryStep(penalties, amount = 1) {
  const out = [];
  for (const p of penalties) {
    if (p.permanent || p.kind === "halveInjuries") {
      out.push(p);
      continue;
    }
    const value = p.value > 0 ? Math.max(0, p.value - amount) : Math.min(0, p.value + amount);
    if (value !== 0) out.push({ ...p, value });
  }
  return out;
}

/** Le poison a-t-il fini d'attaquer ? (Une phase dépendante d'une phase sans succès est annulée.) */
export function settleCourse(state, stages, now = 0) {
  const s = structuredClone(state);
  (stages ?? []).forEach((stage, i) => {
    const req = stage.requires ?? -1;
    const parent = s.stages[req];
    if (req >= 0 && parent && parent.left <= 0 && parent.successes === 0) s.stages[i].left = 0;
  });
  if (!s.course && s.stages.every(st => st.left <= 0)) {
    s.course = true;
    s.courseAt = now;
  }
  return s;
}

/** Une phase peut-elle attaquer ? (Une phase dépendante attend un succès de sa phase mère.) */
export function stageReady(state, stage, index) {
  const st = state.stages[index];
  if (!st || st.left <= 0 || state.dead) return false;
  const req = stage.requires ?? -1;
  return req < 0 || (state.stages[req]?.successes ?? 0) > 0;
}

/** Portions de verre : une chope ou une coupe compte 1, un verre de spiritueux 2. */
export const ALCOHOL = { beer: { servings: 1, toxicity: 2 }, wine: { servings: 1, toxicity: 3 }, spirits: { servings: 2, toxicity: 4 } };

/** Virulence de l'alcool : une par portion au-delà de la limite (rang d'Endurance). */
export function alcoholVirulence(servings, endurance) {
  return Math.max(0, servings - endurance);
}

/** Modificateurs (format de module/effects.mjs) produits par les pénalités d'un poison actif. */
export function poisonModifiers(name, id, penalties) {
  const list = [];
  (penalties ?? []).forEach((p, index) => {
    const base = { source: name, key: `${id}.p${index}`, condition: "", situational: !!p.situational, label: p.label || name };
    if (["penaltyDice", "modifier", "testDice", "bonusDice"].includes(p.kind)) {
      list.push({ ...base, type: p.kind, target: p.target, value: String(p.value) });
    } else if (p.kind === "health" || p.kind === "composure") {
      list.push({ ...base, situational: false, type: "derived", target: p.kind, value: String(p.value) });
    }
  });
  return list;
}

/** Libellé d'un intervalle en secondes. */
export function intervalKey(seconds) {
  const table = [[ROUND, "round"], [MINUTE, "minute"], [5 * MINUTE, "5minutes"], [30 * MINUTE, "30minutes"],
    [HOUR, "hour"], [2 * HOUR, "2hours"], [6 * HOUR, "6hours"], [DAY, "day"], [WEEK, "week"]];
  return table.find(([s]) => s === Number(seconds))?.[1] ?? null;
}

/* -------------------------------------------- */
/*  Monnaie (Table 7-1)                         */
/* -------------------------------------------- */

/** Valeur des pièces en sous de cuivre. */
export const COIN_VALUE = { dragon: 11760, lune: 392, cerf: 56, etoile: 8, gros: 4, sou: 1 };

const COIN_WORDS = [
  [/^(dragons?|gd|do)$/i, "dragon"], [/^(lunes?|sm)$/i, "lune"], [/^(cerfs?|ss|ca)$/i, "cerf"],
  [/^(étoiles?|etoiles?|cs)$/i, "etoile"], [/^(gros|cg)$/i, "gros"], [/^(sous?|cp|pennies|penny)$/i, "sou"]
];

/**
 * Lit un prix (« 50 cerfs », « 5–10 dragons », « 2 sous »).
 * @returns {{ min: number, max: number, unit: string }|null} montants en sous de cuivre
 */
export function parseCost(text) {
  const m = String(text ?? "").replace(/ /g, " ").match(/(\d[\d\s.,]*)\s*(?:[–—-]\s*(\d[\d\s.,]*))?\s*([a-zéèA-ZÉ]+)/);
  if (!m) return null;
  const unit = COIN_WORDS.find(([re]) => re.test(m[3]))?.[1];
  if (!unit) return null;
  const n = s => Number(String(s).replace(/[\s.,]/g, ""));
  const min = n(m[1]) * COIN_VALUE[unit];
  const max = m[2] ? n(m[2]) * COIN_VALUE[unit] : min;
  if (!Number.isFinite(min) || min <= 0) return null;
  return { min, max, unit };
}

/** Total d'une bourse en sous. */
export function purseValue(coin) {
  return (coin.dragons ?? 0) * COIN_VALUE.dragon + (coin.stags ?? 0) * COIN_VALUE.cerf + (coin.pennies ?? 0);
}

/**
 * Paie un montant en sous : d'abord les sous, puis les cerfs, puis les dragons ; la monnaie est rendue.
 * @returns {object|null} la nouvelle bourse, ou null si la somme manque
 */
export function payFromPurse(coin, amount) {
  let d = coin.dragons ?? 0, s = coin.stags ?? 0, p = coin.pennies ?? 0;
  if (purseValue(coin) < amount) return null;
  let need = amount;
  const fromP = Math.min(p, need);
  p -= fromP;
  need -= fromP;
  if (need > 0) {
    const stags = Math.min(s, Math.ceil(need / COIN_VALUE.cerf));
    s -= stags;
    need -= stags * COIN_VALUE.cerf;
  }
  if (need > 0) {
    const dragons = Math.ceil(need / COIN_VALUE.dragon);
    d -= dragons;
    need -= dragons * COIN_VALUE.dragon;
  }
  // Monnaie rendue (need est négatif ou nul).
  let change = -need;
  s += Math.floor(change / COIN_VALUE.cerf);
  p += change % COIN_VALUE.cerf;
  return { dragons: d, stags: s, pennies: p };
}

/** Écrit un montant en sous de façon lisible (« 1 dragon 3 cerfs 2 sous »). */
export function formatCoins(amount) {
  const d = Math.floor(amount / COIN_VALUE.dragon);
  const s = Math.floor((amount % COIN_VALUE.dragon) / COIN_VALUE.cerf);
  const p = amount % COIN_VALUE.cerf;
  const parts = [];
  if (d) parts.push(`${d} dragon${d > 1 ? "s" : ""}`);
  if (s) parts.push(`${s} cerf${s > 1 ? "s" : ""}`);
  if (p || !parts.length) parts.push(`${p} sou${p > 1 ? "s" : ""}`);
  return parts.join(" ");
}
