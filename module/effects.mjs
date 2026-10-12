/**
 * Moteur d'effets des qualités (avantages et handicaps).
 *
 * Chaque qualité porte une liste de modificateurs { type, target, value, situational, condition, label }.
 *
 * Cibles (target) :
 *   "all"                    tous les tests
 *   "fighting"               une capacité
 *   "fighting.longBlades"    une spécialité (le test doit utiliser cette spécialité)
 *   "weapon:Poing"           une arme précise (nom contenant le texte)
 *   "initiative"             le jet d'initiative
 *   cible commençant par "?" : à choisir par le joueur (inactif tant que non choisie)
 *
 * Valeurs (value) : un nombre, ou
 *   "@cunning"               rang d'une capacité
 *   "@fighting.shortBlades"  dés bonus d'une spécialité
 *   "@half:persuasion"       moitié du rang (arrondi inférieur)
 *   "@half1:persuasion"      moitié du rang, minimum 1
 *   "@spec"                  dés bonus de la spécialité utilisée par le test (minimum 1)
 *   "all" / "half"           pour convert et reroll1 : tous / la moitié des dés concernés
 * Un "-" devant inverse le signe.
 */

/** Valeur utilisée pour « tous les dés ». */
export const ALL = 99;

/** Types qui modifient un test. */
export const TEST_TYPES = ["testDice", "bonusDice", "penaltyDice", "modifier", "convert", "reroll1", "reroll6"];
/** Types qui modifient une arme. */
export const WEAPON_TYPES = ["damage", "damageAfter", "piercing", "defensive", "ignoreTraining"];
/** Types de valeurs dérivées. */
export const DERIVED_TYPES = ["derived"];
export const DERIVED_TARGETS = ["health", "composure", "combatDefense", "intrigueDefense", "movement", "sprintMult", "armorRating", "bulk"];
export const ALL_TYPES = [...TEST_TYPES, ...WEAPON_TYPES, ...DERIVED_TYPES, "houseFortune"];

/** Liste des modificateurs actifs d'un acteur (qualités possédées). */
export function collectModifiers(items) {
  const list = [];
  for (const item of items) {
    if (!["benefit", "drawback"].includes(item.type)) continue;
    const mods = item.system.modifiers ?? [];
    mods.forEach((m, index) => {
      if (!m.type || !m.target || m.target.startsWith("?")) return;
      list.push({ ...m, source: item.name, key: `${item.id}.${index}` });
    });
  }
  return list;
}

/** Une qualité contient-elle encore un choix à faire ? */
export function needsChoice(item) {
  return (item.system.modifiers ?? []).some(m => m.target?.startsWith("?"));
}

/** La cible correspond-elle au test en cours ? */
export function targetMatches(target, { ability = null, specialty = null, weapon = null, initiative = false } = {}) {
  if (!target || target.startsWith("?")) return false;
  if (target === "all") return true;
  if (target === "initiative") return initiative;
  if (target.startsWith("weapon:")) {
    const name = target.slice(7).trim().toLowerCase();
    return !!weapon && !!name && weapon.name.toLowerCase().includes(name);
  }
  const [a, s] = target.split(".");
  if (a !== ability) return false;
  return !s || s === specialty;
}

/** Résout une valeur (nombre ou référence au personnage). Renvoie un nombre, ou "all"/"half". */
export function resolveValue(value, abilities, { ability = null, specialty = null } = {}) {
  let v = String(value ?? "").trim();
  if (v === "") return 0;
  if (v === "all" || v === "half") return v;
  let sign = 1;
  if (v.startsWith("-")) {
    sign = -1;
    v = v.slice(1).trim();
  } else if (v.startsWith("+")) {
    v = v.slice(1).trim();
  }
  if (/^\d+$/.test(v)) return sign * Number(v);
  if (!v.startsWith("@")) return 0;

  const rankOf = path => {
    const [a, s] = path.split(".");
    const ab = abilities?.[a];
    if (!ab) return 0;
    return s ? (ab.specialties?.[s] ?? 0) : ab.value;
  };

  const ref = v.slice(1);
  if (ref === "spec") {
    const b = specialty && abilities?.[ability]?.specialties?.[specialty];
    return sign * Math.max(1, b || 0);
  }
  if (ref.startsWith("half1:")) return sign * Math.max(1, Math.floor(rankOf(ref.slice(6)) / 2));
  if (ref.startsWith("half:")) return sign * Math.floor(rankOf(ref.slice(5)) / 2);
  return sign * rankOf(ref);
}

/** Contributions vides d'un ensemble de modificateurs de test. */
export function emptyContribution() {
  return {
    testDice: 0, bonusDice: 0, penaltyDice: 0, modifier: 0,
    convert: 0, convertHalf: false, reroll1: 0, reroll6: false, damage: 0, damageAfter: 0
  };
}

/** Additionne deux contributions. */
export function mergeContribution(a, b) {
  const out = { ...a };
  for (const k of ["testDice", "bonusDice", "penaltyDice", "modifier", "damage", "damageAfter"]) out[k] += b[k];
  out.convert = Math.min(ALL, a.convert + b.convert);
  out.reroll1 = Math.min(ALL, a.reroll1 + b.reroll1);
  out.convertHalf = a.convertHalf || b.convertHalf;
  out.reroll6 = a.reroll6 || b.reroll6;
  return out;
}

/** Ajoute un modificateur à une contribution. */
export function addModifier(contrib, mod, abilities, ctx) {
  const value = resolveValue(mod.value, abilities, ctx);
  switch (mod.type) {
    case "reroll6":
      contrib.reroll6 = true;
      break;
    case "convert":
    case "reroll1":
      // "all" = tous les dés concernés (99), "half" = la moitié des dés bonus (convert uniquement).
      if (value === "all") contrib[mod.type] = ALL;
      else if (value === "half") contrib.convertHalf = true;
      else contrib[mod.type] = Math.min(ALL, contrib[mod.type] + Math.max(0, value));
      break;
    case "testDice":
    case "bonusDice":
    case "penaltyDice":
    case "modifier":
    case "damage":
    case "damageAfter":
      if (typeof value === "number") contrib[mod.type] += value;
      break;
  }
  return contrib;
}

/**
 * Effets de qualité applicables à un test.
 * Renvoie les contributions permanentes et la liste des effets situationnels (à cocher).
 */
export function testEffects(modifiers, abilities, ctx) {
  const permanent = emptyContribution();
  const situational = [];
  for (const mod of modifiers) {
    if (![...TEST_TYPES, "damage", "damageAfter"].includes(mod.type)) continue;
    if (["damage", "damageAfter"].includes(mod.type) && !ctx.weapon) continue;
    if (!targetMatches(mod.target, ctx)) continue;
    if (mod.situational) {
      // Les effets d'une même qualité avec le même libellé forment une seule case à cocher.
      const label = mod.label || mod.source;
      const existing = situational.find(x => x.source === mod.source && x.label === label);
      if (existing) {
        addModifier(existing.contrib, mod, abilities, ctx);
        existing.summary += `, ${describe(mod, abilities, ctx)}`;
      } else {
        situational.push({
          key: mod.key,
          source: mod.source,
          label,
          summary: describe(mod, abilities, ctx),
          contrib: addModifier(emptyContribution(), mod, abilities, ctx)
        });
      }
    } else {
      addModifier(permanent, mod, abilities, ctx);
    }
  }
  return { permanent, situational };
}

/** Somme des modificateurs d'armes (piercing, defensive…) qui visent une arme. */
export function weaponEffect(modifiers, type, abilities, weaponCtx) {
  let total = 0;
  for (const mod of modifiers) {
    if (mod.type !== type || mod.situational) continue;
    if (!targetMatches(mod.target, weaponCtx)) continue;
    const v = resolveValue(mod.value, abilities, weaponCtx);
    if (typeof v === "number") total += v;
  }
  return total;
}

/** L'arme ignore-t-elle son entraînement requis ? */
export function ignoresTraining(modifiers, weaponCtx) {
  return modifiers.some(m => m.type === "ignoreTraining" && !m.situational && targetMatches(m.target, weaponCtx));
}

/** Conditions simples des effets dérivés. */
export function conditionMet(condition, state) {
  if (!condition) return true;
  return condition.split(",").map(c => c.trim()).filter(Boolean).every(c => {
    if (c === "noBulk") return (state.armorBulk ?? 0) === 0;
    if (c.startsWith("equipped:")) return state.equippedSpecialties?.includes(c.slice(9));
    return true;
  });
}

/** Somme des effets dérivés permanents par cible. */
export function derivedEffects(modifiers, abilities, state) {
  const out = Object.fromEntries(DERIVED_TARGETS.map(t => [t, 0]));
  for (const mod of modifiers) {
    if (mod.type !== "derived" || mod.situational) continue;
    if (!(mod.target in out)) continue;
    if (!conditionMet(mod.condition, state)) continue;
    const v = resolveValue(mod.value, abilities);
    if (typeof v === "number") out[mod.target] += v;
  }
  return out;
}

/** Somme d'un type d'effet simple (ex. houseFortune). */
export function sumType(modifiers, type, abilities) {
  return modifiers.filter(m => m.type === type && !m.situational).reduce((t, m) => {
    const v = resolveValue(m.value, abilities);
    return t + (typeof v === "number" ? v : 0);
  }, 0);
}

/** Description courte (sans localisation lourde) d'un modificateur, pour l'affichage. */
export function describe(mod, abilities, ctx = {}) {
  const v = resolveValue(mod.value, abilities, ctx);
  const n = typeof v === "number" ? v : v === "all" ? "tous" : "moitié";
  switch (mod.type) {
    case "testDice": return `${n >= 0 ? "+" : ""}${n}D`;
    case "bonusDice": return `${n >= 0 ? "+" : ""}${n}B`;
    case "penaltyDice": return `-${n}D`;
    case "modifier": return `${n >= 0 ? "+" : ""}${n}`;
    case "convert": return `${n} B → D`;
    case "reroll1": return `relance ${n} × 1`;
    case "reroll6": return "relance les 6";
    case "damage": return `dégâts ${n >= 0 ? "+" : ""}${n}`;
    case "damageAfter": return `dégâts finaux ${n >= 0 ? "+" : ""}${n}`;
    default: return `${mod.type} ${n}`;
  }
}

/**
 * Applique conversions et relances à des dés déjà lancés (fonction pure, testable).
 * @param {number[]} results       valeurs des dés lancés
 * @param {object}   opts          { reroll1, reroll6 }
 * @param {Function} rollDie       () => nouvelle valeur d'un d6
 */
export function applyRerolls(results, { reroll1 = 0, reroll6 = false } = {}, rollDie) {
  const dice = results.map(value => ({ value, original: null }));
  if (reroll6) {
    for (const d of dice) {
      if (d.value === 6) {
        d.original = 6;
        d.value = rollDie();
      }
    }
  }
  let left = reroll1;
  for (const d of dice) {
    if (left <= 0) break;
    if (d.value === 1 && d.original === null) {
      d.original = 1;
      d.value = rollDie();
      left -= 1;
    }
  }
  return dice;
}

/** Nombre de dés bonus convertis en dés de test. */
export function convertCount(convert, convertHalf, bonusDice) {
  let n = Math.min(bonusDice, convert);
  if (convertHalf && bonusDice > 0) n = Math.max(n, Math.max(1, Math.floor(bonusDice / 2)));
  return n;
}
