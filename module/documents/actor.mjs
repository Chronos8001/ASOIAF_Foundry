import { promptTest } from "../dice.mjs";

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
    const test = this.system.getTestData(ability, w.specialty);
    // Entraînement requis : on perd des dés bonus, l'excédent devient des dés de pénalité.
    let bonusDice = test.bonusDice - w.training;
    let penaltyDice = test.penaltyDice;
    if (bonusDice < 0) {
      penaltyDice += -bonusDice;
      bonusDice = 0;
    }
    let damage = w.baseDamage(this);
    if (/puissante|powerful/i.test(w.qualities)) damage += this.system.abilities.athletics.specialties.strength;
    const piercing = w.piercing || Number(w.qualities.match(/(?:perforante|piercing)\s*(\d+)/i)?.[1] ?? 0);

    return promptTest({
      actor: this,
      label: `${item.name} — ${loc(`ASOIAF.Ability.${ability}`)}`,
      ...test,
      bonusDice,
      penaltyDice,
      damage,
      piercing,
      defenseKey: "combatDefense",
      extra: w.qualities
    });
  }

  /* -------------------------------------------- */
  /*  Santé                                       */
  /* -------------------------------------------- */

  /** Applique des dégâts réduits par la VA (moins la perforation). */
  async applyDamage(amount, piercing = 0) {
    const ar = Math.max(0, (this.system.armor?.rating ?? 0) - piercing);
    const taken = Math.max(0, amount - ar);
    const value = Math.max(0, this.system.health.value - taken);
    await this.update({ "system.health.value": value });
    const key = value <= 0 ? "ASOIAF.Chat.defeated" : "ASOIAF.Chat.damageTaken";
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<p>${game.i18n.format(key, { name: this.name, taken, ar, value, max: this.system.health.max })}</p>`
    });
  }

  /** Blessure légère : annule des dégâts égaux à l'Endurance, -1 aux résultats. */
  async takeInjury() {
    const s = this.system;
    if (s.injuries >= s.abilities.endurance.value) return ui.notifications.warn(loc("ASOIAF.Warn.maxInjuries"));
    await this.update({
      "system.injuries": s.injuries + 1,
      "system.health.value": Math.min(s.health.max, s.health.value + s.abilities.endurance.value)
    });
  }

  /** Blessure grave : -1D ; si le nombre de blessures graves atteint l'Endurance, le personnage meurt. */
  async takeWound() {
    const s = this.system;
    const wounds = s.wounds + 1;
    await this.update({ "system.wounds": wounds });
    if (wounds >= s.abilities.endurance.value) {
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<p><strong>${game.i18n.format("ASOIAF.Chat.dead", { name: this.name })}</strong></p>`
      });
    }
  }

  /** Fin de combat : les dégâts disparaissent. Fin d'intrigue : la frustration aussi. */
  async recover(kind) {
    if (kind === "combat") return this.update({ "system.health.value": this.system.health.max });
    return this.update({ "system.composure.value": this.system.composure.max, "system.frustration": 0 });
  }

  /** Formule d'initiative : test d'Agilité (Rapidité). */
  getInitiativeFormula() {
    if (!this.system.getTestData) return "0";
    const t = this.system.getTestData("agility", "quickness");
    const bonus = Math.min(t.bonusDice, t.testDice);
    const keep = Math.max(1, t.testDice - t.penaltyDice);
    const mod = t.modifier ? ` ${t.modifier < 0 ? "-" : "+"} ${Math.abs(t.modifier)}` : "";
    return `${t.testDice + bonus}d6kh${keep}${mod}`;
  }
}

export class AsoiafCombatant extends Combatant {
  /** @override */
  _getInitiativeFormula() {
    return this.actor?.getInitiativeFormula?.() ?? super._getInitiativeFormula();
  }
}
