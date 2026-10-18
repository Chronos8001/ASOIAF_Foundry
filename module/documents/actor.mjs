import { ASOIAF } from "../config.mjs";
import { promptTest } from "../dice.mjs";
import { attackContext, confirmAttack, defeatButtons } from "../combat-actions.mjs";
import { weaponContext } from "../data/character.mjs";
import { convertCount, ignoresTraining, weaponEffect } from "../effects.mjs";
import { applyUnitDamage } from "../warfare.mjs";
import { applySiegeDamage } from "../siege.mjs";

const loc = key => game.i18n.localize(key);
export const HOUSE_IMG = "icons/svg/castle.svg";

export class AsoiafActor extends Actor {
  /** @override Valeurs par défaut à la création. */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    const prototypeToken = { actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY };
    if (this.type === "character") prototypeToken.sight = { enabled: true };
    if (this.type === "house" && !data.img) this.updateSource({ img: HOUSE_IMG });
    if (this.type === "unit" || this.type === "siege") {
      if (!data.img) this.updateSource({ img: this.type === "unit" ? "icons/svg/combat.svg" : "icons/svg/target.svg" });
      prototypeToken.displayBars = CONST.TOKEN_DISPLAY_MODES.ALWAYS;
      prototypeToken.displayName = CONST.TOKEN_DISPLAY_MODES.HOVER;
      prototypeToken.bar1 = { attribute: "health" };
      prototypeToken.bar2 = { attribute: null };
    }
    if (this.type !== "npc") this.updateSource({ prototypeToken });
  }

  /** @override Le blason d'une Maison sert aussi d'image (liste des acteurs, jeton). */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    // Endurance ou Volonté modifiée : Santé et Sang-froid suivent le nouveau maximum (les dégâts subis restent).
    if (["character", "npc"].includes(this.type)) {
      for (const [ability, pool] of [["endurance", "health"], ["will", "composure"]]) {
        const rank = foundry.utils.getProperty(changes, `system.abilities.${ability}.value`);
        // La fiche renvoie toute sa saisie : la valeur n'est « modifiée à la main » que si elle a changé.
        const sent = foundry.utils.getProperty(changes, `system.${pool}.value`);
        if (rank === undefined || (sent !== undefined && Number(sent) !== this.system[pool].value)) continue;
        const delta = (Number(rank) - this.system.abilities[ability].value) * 3;
        if (!delta) continue;
        const max = Math.max(1, this.system[pool].max + delta);
        foundry.utils.setProperty(changes, `system.${pool}.value`, Math.min(max, Math.max(0, this.system[pool].value + delta)));
      }
    }
    const arms = foundry.utils.getProperty(changes, "system.arms");
    if (this.type !== "house" || !arms) return;
    const img = changes.img ?? this.img;
    // On ne remplace que l'image par défaut ou l'ancien blason, pas une image choisie à part.
    if ([HOUSE_IMG, this.system.arms].includes(img)) changes.img = arms;
    const token = this.prototypeToken.texture.src;
    if ([HOUSE_IMG, this.system.arms, CONST.DEFAULT_TOKEN].includes(token)) {
      foundry.utils.setProperty(changes, "prototypeToken.texture.src", arms);
    }
  }

  /* -------------------------------------------- */
  /*  Tests                                       */
  /* -------------------------------------------- */

  async rollAbility(ability, specialty = null) {
    if (this.type === "unit") {
      return promptTest({ actor: this, label: `${this.name} — ${loc(`ASOIAF.Ability.${ability}`)}`, ...this.system.getTestData(ability) });
    }
    const test = this.system.getTestData(ability, specialty);
    let label = loc(`ASOIAF.Ability.${ability}`);
    if (specialty) label += ` (${loc(`ASOIAF.Specialty.${specialty}`)})`;
    const defenseKey = ["deception", "persuasion"].includes(ability) ? "intrigueDefense" : null;
    return promptTest({ actor: this, label, ...test, defenseKey });
  }

  async rollWeapon(item) {
    const w = item.system;
    const ability = w.ability;
    const ctx = weaponContext(item);
    const mods = this.system.modifiers ?? [];
    const test = this.system.getTestData(ability, w.specialty, { weapon: item });

    // Entraînement requis : on perd des dés bonus, l'excédent devient des dés de pénalité.
    const training = ignoresTraining(mods, ctx) ? 0 : w.training;
    const grade = ASOIAF.weaponGrades[w.grade] ?? ASOIAF.weaponGrades.common;
    let bonusDice = test.bonusDice - training;
    let penaltyDice = test.penaltyDice + grade.penaltyDice;
    if (bonusDice < 0) {
      penaltyDice += -bonusDice;
      bonusDice = 0;
    }

    let damage = w.baseDamage(this) + test.damageBonus;
    if (/puissante|powerful/i.test(w.qualities)) damage += this.system.abilities.athletics.specialties.strength;
    const basePiercing = w.piercing || Number(w.qualities.match(/(?:perforante|piercing)\s*(\d+)/i)?.[1] ?? 0);
    const piercing = basePiercing + weaponEffect(mods, "piercing", this.system.abilities, ctx);

    // Arme enduite de poison : la carte propose d'empoisonner la cible touchée.
    const coating = item.getFlag("asoiaf", "coating");
    const effects = w.grade !== "common" ? [`${loc("ASOIAF.Weapon.grade")} : ${loc(`ASOIAF.Grade.${w.grade}`)}`] : [];

    return promptTest({
      actor: this,
      label: `${item.name} — ${loc(`ASOIAF.Ability.${ability}`)}`,
      ...test,
      modifier: test.modifier + grade.modifier,
      bonusDice,
      penaltyDice,
      effects,
      poison: coating ? { name: coating.name, data: coating, weaponUuid: item.uuid } : null,
      attack: attackContext(this, item),
      onConfirm: (data, c, base) => confirmAttack(this, item, data, c, base),
      damage,
      damageAfter: test.damageAfter,
      piercing,
      defenseKey: "combatDefense",
      extra: w.qualities
    });
  }

  /* -------------------------------------------- */
  /*  Santé                                       */
  /* -------------------------------------------- */

  /**
   * Applique des dégâts réduits par la VA (moins la perforation), puis poste une
   * carte permettant d'encaisser des blessures pour annuler tout ou partie du coup.
   */
  async applyDamage(amount, piercing = 0, { vicious = false } = {}) {
    if (this.type === "unit") return applyUnitDamage(this, amount, piercing);
    if (this.type === "siege") return applySiegeDamage(this, amount, piercing);
    const ar = Math.max(0, (this.system.armor?.rating ?? 0) - piercing);
    const taken = Math.max(0, amount - ar);
    const before = this.system.health.value;
    const value = Math.max(0, before - taken);
    await this.update({ "system.health.value": value });

    const key = value <= 0 ? "ASOIAF.Chat.defeated" : "ASOIAF.Chat.damageTaken";
    const endurance = this.system.abilities.endurance.value;
    const buttons = taken > 0 ? `
      <div class="absorb-buttons">
        <button type="button" data-action="absorb" data-kind="injury">
          <i class="fa-solid fa-droplet"></i> ${game.i18n.format("ASOIAF.Chat.absorbInjury", { endurance })}
        </button>
        <button type="button" data-action="absorb" data-kind="wound">
          <i class="fa-solid fa-skull"></i> ${loc("ASOIAF.Chat.absorbWound")}
        </button>
      </div>` : "";
    // Vaincu : le vainqueur choisit la conséquence (une arme vicieuse tue).
    const defeat = value <= 0 ? defeatButtons(vicious) : "";
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="asoiaf-chat damage-card">
        <p>${game.i18n.format(key, { name: this.name, taken, ar, value, max: this.system.health.max })}</p>${buttons}${defeat}</div>`,
      flags: { asoiaf: { damage: { actorUuid: this.uuid, taken, before } } }
    });
  }

  /**
   * Encaisse une blessure pour annuler les dégâts d'un coup précis (carte de dégâts).
   * Blessure légère : annule des dégâts égaux à l'Endurance. Blessure grave : annule le reste du coup.
   */
  async absorbHit(message, kind) {
    const hit = message.getFlag("asoiaf", "damage");
    if (!hit) return;
    const s = this.system;
    const endurance = s.abilities.endurance.value;
    const absorbed = this.getFlag("asoiaf", `absorbed.${message.id}`) ?? 0;
    const remaining = hit.taken - absorbed;
    if (remaining <= 0) return ui.notifications.info(loc("ASOIAF.Warn.nothingToAbsorb"));
    if (kind === "injury" && s.injuries >= endurance) return ui.notifications.warn(loc("ASOIAF.Warn.maxInjuries"));

    const amount = kind === "injury" ? Math.min(endurance, remaining) : remaining;
    // Seuls les dégâts réellement retirés à la Santé (pas ceux au-delà de 0) sont rendus.
    const lostBefore = Math.min(hit.before, remaining);
    const lostAfter = Math.min(hit.before, remaining - amount);
    const health = Math.min(s.health.max, s.health.value + lostBefore - lostAfter);

    const update = { "system.health.value": health, [`flags.asoiaf.absorbed.${message.id}`]: absorbed + amount };
    if (kind === "injury") update["system.injuries"] = s.injuries + 1;
    else update["system.wounds"] = s.wounds + 1;
    await this.update(update);

    const label = kind === "injury" ? "ASOIAF.Chat.injuryTaken" : "ASOIAF.Chat.woundTaken";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<p>${game.i18n.format(label, { name: this.name, amount, value: health, max: s.health.max })}</p>`
    });
    if (kind === "wound") await this.#checkDeath();
  }

  /** Blessure légère (depuis la fiche) : annule des dégâts égaux à l'Endurance, -1 aux résultats. */
  async takeInjury() {
    const s = this.system;
    if (s.injuries >= s.abilities.endurance.value) return ui.notifications.warn(loc("ASOIAF.Warn.maxInjuries"));
    await this.update({
      "system.injuries": s.injuries + 1,
      "system.health.value": Math.min(s.health.max, s.health.value + s.abilities.endurance.value)
    });
  }

  /** Blessure grave (depuis la fiche) : -1D ; autant que l'Endurance = mort. */
  async takeWound() {
    await this.update({ "system.wounds": this.system.wounds + 1 });
    return this.#checkDeath();
  }

  async #checkDeath() {
    if (this.system.wounds < this.system.abilities.endurance.value) return;
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<p><strong>${game.i18n.format("ASOIAF.Chat.dead", { name: this.name })}</strong></p>`
    });
  }

  /** Fin de combat : les dégâts disparaissent. Fin d'intrigue : la frustration aussi. */
  async recover(kind) {
    if (kind === "combat") return this.update({ "system.health.value": this.system.health.max });
    return this.update({
      "system.composure.value": this.system.composure.max, "system.frustration": 0,
      "system.intrigue.withdrawLeft": 0, "system.intrigue.fastTalkedLeft": 0, "system.intrigue.consider": 0,
      "system.intrigue.readTarget": false, "system.intrigue.assist": 0, "system.intrigue.shieldUsed": false,
      "system.intrigue.influenced": false
    });
  }

  /** Formule d'initiative : test d'Agilité (Rapidité). */
  getInitiativeFormula(combat = null) {
    // Intrigue menée dans le suivi de combat : initiative au Statut (Réputation).
    if (combat?.getFlag?.("asoiaf", "intrigue") && this.system.getTestData) return this.getTestFormula("status", "reputation");
    // En bataille, l'initiative est un test d'Art de la guerre (Stratégie) du commandant.
    if (this.type === "unit") {
      return this.system.commanderActor?.getTestFormula?.("warfare", "strategy") ?? "2d6";
    }
    return this.getTestFormula("agility", "quickness", { initiative: true });
  }

  /** Formule de dés d'un test (utilisée pour l'initiative). */
  getTestFormula(ability, specialty, ctx = {}) {
    if (!this.system.getTestData) return "0";
    const t = this.system.getTestData(ability, specialty, ctx);
    const converted = convertCount(t.convert, t.convertHalf, t.bonusDice);
    const testDice = t.testDice + converted;
    const bonus = Math.min(t.bonusDice - converted, testDice);
    const keep = Math.max(1, testDice - t.penaltyDice);
    const reroll = t.reroll1 > 0 ? "r1" : "";
    const mod = t.modifier ? ` ${t.modifier < 0 ? "-" : "+"} ${Math.abs(t.modifier)}` : "";
    return `${testDice + bonus}d6${reroll}kh${keep}${mod}`;
  }
}

export class AsoiafCombatant extends Combatant {
  /** @override */
  _getInitiativeFormula() {
    return this.actor?.getInitiativeFormula?.(this.combat) ?? super._getInitiativeFormula();
  }
}
