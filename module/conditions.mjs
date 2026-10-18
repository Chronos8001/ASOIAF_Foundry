/**
 * États de combat (chapitre 9) : effets de statut posés sur l'acteur (visibles sur le jeton).
 * Leurs conséquences (Défense, tests) sont lues dans CharacterData ; leur durée suit le suivi de combat :
 *   « turn »    : jusqu'au début du prochain tour de l'acteur (attaque prudente, esquive…)
 *   « turnEnd » : jusqu'à la fin de son prochain tour (distrait, chancelant)
 *   « rounds »  : un nombre de rounds (manœuvré, étourdi)
 * Sans durée, l'état reste jusqu'à ce qu'on le retire (à terre, entravé, saisi…).
 */

const loc = key => game.i18n.localize(key);

/** États du système : icône du jeton et statut de Foundry réutilisé quand il existe. */
export const CONDITIONS = {
  prone: { core: "prone", img: "icons/svg/falling.svg" },
  stunned: { core: "stun", img: "icons/svg/daze.svg" },
  entangled: { core: "restrain", img: "icons/svg/net.svg" },
  grabbed: { id: "asoiaf-grabbed", img: "icons/svg/padlock.svg" },
  pinned: { id: "asoiaf-pinned", img: "icons/svg/trap.svg" },
  helpless: { id: "asoiaf-helpless", img: "icons/svg/sleep.svg" },
  cover: { id: "asoiaf-cover", img: "icons/svg/wall.svg" },
  dodging: { id: "asoiaf-dodging", img: "icons/svg/wing.svg" },
  cautious: { id: "asoiaf-cautious", img: "icons/svg/shield.svg" },
  reckless: { id: "asoiaf-reckless", img: "icons/svg/explosion.svg" },
  distracted: { id: "asoiaf-distracted", img: "icons/svg/eye.svg" },
  maneuvered: { id: "asoiaf-maneuvered", img: "icons/svg/degen.svg" },
  staggered: { id: "asoiaf-staggered", img: "icons/svg/lightning.svg" },
  offhand: { id: "asoiaf-offhand", img: "icons/svg/sword.svg" },
  impaled: { id: "asoiaf-impaled", img: "icons/svg/blood.svg" },
  disarmed: { id: "asoiaf-disarmed", img: "icons/svg/hazard.svg" },
  mounted: { id: "asoiaf-mounted", img: "icons/svg/pawprint.svg" },
  fatigueArmor: { id: "asoiaf-fatigue-armor", img: "icons/svg/upgrade.svg" },
  fatigueWound: { id: "asoiaf-fatigue-wound", img: "icons/svg/regen.svg" },
  fatigueInjuries: { id: "asoiaf-fatigue-injuries", img: "icons/svg/heal.svg" },
  unconscious: { core: "unconscious", img: "icons/svg/unconscious.svg" }
};

/** Identifiant de statut Foundry d'un état. */
export const statusId = key => CONDITIONS[key]?.core ?? CONDITIONS[key]?.id ?? key;

/** Ajoute les états propres au système à la liste des statuts de Foundry (menu du jeton). */
export function registerConditions() {
  for (const [key, c] of Object.entries(CONDITIONS)) {
    if (c.core && CONFIG.statusEffects.some(s => s.id === c.core)) continue;
    CONFIG.statusEffects.push({ id: statusId(key), name: `ASOIAF.Condition.${key}`, img: c.img });
  }
}

/** Effet actif d'un état sur l'acteur. */
export function conditionEffect(actor, key) {
  const id = statusId(key);
  return actor?.effects?.find(e => e.statuses?.has(id)) ?? null;
}

/** État présent ? (lu sur actor.statuses, rempli par Foundry avant la préparation des données) */
export function hasCondition(actor, key) {
  return actor?.statuses?.has(statusId(key)) ?? false;
}

/** Valeur numérique portée par un état (couvert 5/10, résultat d'esquive…). */
export function conditionValue(actor, key, fallback = 0) {
  return conditionEffect(actor, key)?.getFlag("asoiaf", "value") ?? fallback;
}

/**
 * Pose (ou met à jour) un état.
 * @param {object} [opts] { value, duration: "turn"|"turnEnd"|"rounds", rounds }
 */
export async function addCondition(actor, key, { value = null, duration = null, rounds = 0 } = {}) {
  if (!actor) return;
  const id = statusId(key);
  const flags = { asoiaf: { value, duration, rounds, seen: false } };
  const existing = conditionEffect(actor, key);
  if (existing) return existing.update({ flags });
  const def = CONFIG.statusEffects.find(s => s.id === id);
  const name = game.i18n.localize(def?.name ?? def?.label ?? `ASOIAF.Condition.${key}`);
  return actor.createEmbeddedDocuments("ActiveEffect", [{
    name, img: def?.img ?? def?.icon ?? CONDITIONS[key]?.img, statuses: [id], flags
  }]);
}

export async function removeCondition(actor, key) {
  const effect = conditionEffect(actor, key);
  if (effect) await effect.delete();
}

/** États affichés sur la fiche. */
export function conditionList(actor) {
  return Object.keys(CONDITIONS).filter(key => hasCondition(actor, key)).map(key => {
    const value = conditionValue(actor, key, null);
    const rounds = conditionEffect(actor, key)?.getFlag("asoiaf", "rounds");
    return {
      key,
      label: loc(`ASOIAF.Condition.${key}`),
      hint: loc(`ASOIAF.Condition.${key}Hint`),
      value: value ?? null,
      rounds: rounds || null,
      img: CONDITIONS[key].img
    };
  });
}

/**
 * Fin de durée des états quand le suivi de combat avance.
 * @param {Combat} combat
 * @param {object} changes   modifications (turn et/ou round)
 * @param {string|null} previousId  combattant dont le tour vient de finir
 */
export async function expireConditions(combat, changes, previousId) {
  const current = combat.combatant;
  const roundChanged = "round" in changes;
  for (const c of combat.combatants) {
    const actor = c.actor;
    if (!actor?.isOwner) continue;
    for (const effect of [...actor.effects]) {
      const f = effect.flags?.asoiaf;
      if (!f?.duration) continue;
      // Début du tour de l'acteur : fin des états « jusqu'à votre prochain tour ».
      if (f.duration === "turn" && c.id === current?.id) {
        await effect.delete();
        continue;
      }
      // États « jusqu'à la fin de son prochain tour » : vus au début, retirés à la fin.
      if (f.duration === "turnEnd") {
        if (c.id === current?.id && !f.seen) await effect.setFlag("asoiaf", "seen", true);
        else if (c.id === previousId && f.seen) await effect.delete();
        continue;
      }
      if (f.duration === "rounds" && roundChanged) {
        if ((f.rounds ?? 1) <= 1) await effect.delete();
        else await effect.setFlag("asoiaf", "rounds", f.rounds - 1);
      }
    }
  }
}
