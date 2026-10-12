import { promptTest } from "../dice.mjs";
import { weaponContext } from "../data/character.mjs";
import { convertCount, ignoresTraining, weaponEffect } from "../effects.mjs";

const loc = key => game.i18n.localize(key);

export class AsoiafActor extends Actor {
  /** @override Valeurs par défaut à la création. */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    const prototypeToken = { actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY };
    if (this.type === "character") prototypeToken.sight = { enabled: true };
    if (this.type === "house" && !data.img) this.updateSource({ img: "icons/svg/castle.svg" });
    if (this.type !== "npc") this.updateSource({ prototypeToken });
  }

  /* -------------------------------------------- */
  /*  Tests                                       */
  /* -------------------------------------------- */

  async rollAbility(ability, specialty = null) {
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
    let bonusDice = test.bonusDice - training;
    let penaltyDice = test.penaltyDice;
    if (bonusDice < 0) {
      penaltyDice += -bonusDice;
      bonusDice = 0;
    }

    let damage = w.baseDamage(this) + test.damageBonus;
    if (/puissante|powerful/i.test(w.qualities)) damage += this.system.abilities.athletics.specialties.strength;
    const basePiercing = w.piercing || Number(w.qualities.match(/(?:perforante|piercing)\s*(\d+)/i)?.[1] ?? 0);
    const piercing = basePiercing + weaponEffect(mods, "piercing", this.system.abilities, ctx);

    return promptTest({
      actor: this,
      label: `${item.name} — ${loc(`ASOIAF.Ability.${ability}`)}`,
      ...test,
      bonusDice,
      penaltyDice,
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
  async applyDamage(amount, piercing = 0) {
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
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="asoiaf-chat damage-card">
        <p>${game.i18n.format(key, { name: this.name, taken, ar, value, max: this.system.health.max })}</p>${buttons}</div>`,
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
    return this.update({ "system.composure.value": this.system.composure.max, "system.frustration": 0 });
  }

  /** Formule d'initiative : test d'Agilité (Rapidité). */
  getInitiativeFormula() {
    if (!this.system.getTestData) return "0";
    const t = this.system.getTestData("agility", "quickness", { initiative: true });
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
    return this.actor?.getInitiativeFormula?.() ?? super._getInitiativeFormula();
  }
}
