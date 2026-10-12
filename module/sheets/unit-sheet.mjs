import { AsoiafActorSheet } from "./base-sheet.mjs";
import { ASOIAF } from "../config.mjs";
import * as Warfare from "../warfare.mjs";
import * as Siege from "../siege.mjs";

export class UnitSheet extends AsoiafActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["unit"],
    position: { width: 720, height: 820 },
    actions: {
      issueOrder: UnitSheet.#onIssueOrder,
      standing: UnitSheet.#onStanding,
      attack: UnitSheet.#onAttack,
      endRound: UnitSheet.#onEndRound,
      endBattle: UnitSheet.#onEndBattle,
      rollAbility: UnitSheet.#onRollAbility,
      setStatus: UnitSheet.#onSetStatus,
      unlink: UnitSheet.#onUnlink,
      toggleGear: UnitSheet.#onToggleGear,
      batter: UnitSheet.#onSiegeAction(Siege.batter),
      climb: UnitSheet.#onSiegeAction(Siege.climb),
      wildfire: UnitSheet.#onSiegeAction(Siege.throwWildfire),
      boiling: UnitSheet.#onSiegeAction(Siege.boiling),
      leaveShelter: UnitSheet.#onLeaveShelter
    }
  };

  static PARTS = {
    sheet: { template: "systems/asoiaf/templates/actor/unit-sheet.hbs", scrollable: [".sheet-body"] }
  };

  static SHEET_TABS = ["battle", "composition", "notes"];

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const s = this.actor.system;
    const loc = k => game.i18n.localize(k);
    const link = uuid => {
      const doc = uuid ? fromUuidSync(uuid) : null;
      return doc ? { uuid, name: doc.name, img: doc.img } : null;
    };

    context.house = link(s.house);
    context.commander = link(s.commander);
    context.attached = link(s.attached);
    context.trainingOptions = Object.fromEntries(ASOIAF.trainingOrder.map(t => [t, `ASOIAF.Training.${t}`]));
    context.statusLabel = loc(`ASOIAF.Unit.status_${s.status}`);
    context.statuses = ["ready", "disorganized", "routed", "destroyed"].map(k => ({
      key: k, label: loc(`ASOIAF.Unit.status_${k}`), active: k === s.status
    }));
    context.typesLabel = s.typeList.map(t => loc(`ASOIAF.UnitType.${t}`)).join(" / ") || "—";
    context.types = Object.keys(ASOIAF.unitTypes).map(k => ({
      key: k, label: loc(`ASOIAF.UnitType.${k}`), checked: s.types[k]
    }));
    context.equipmentOptions = Object.fromEntries(s.typeList.map(t => [t, `ASOIAF.UnitType.${t}`]));
    context.abilities = Object.keys(ASOIAF.abilities).map(k => ({
      key: k, label: loc(`ASOIAF.Ability.${k}`), value: s.abilities[k].value, key_: s.keyAbilities.includes(k)
    })).sort((a, b) => (b.key_ - a.key_) || a.label.localeCompare(b.label, game.i18n.lang));
    context.healthPct = s.health.max ? Math.round(100 * s.health.value / s.health.max) : 0;
    context.disorgSlots = Array.from({ length: s.abilities.endurance.value }, (_, i) => ({ filled: i < s.disorganizations }));
    context.standingLabel = s.standingOrder ? loc(`ASOIAF.Order.${s.standingOrder}`) : "—";
    context.xpOver = s.xpSpent > s.xpTotal;
    context.fightLabel = `${loc(`ASOIAF.Ability.${s.fightDamage.ability}`)} ${s.fightDamage.mod >= 0 ? "+" : ""}${s.fightDamage.mod}`;
    context.shootLabel = s.shootDamage
      ? `${loc(`ASOIAF.Ability.${s.shootDamage.ability}`)} ${s.shootDamage.mod >= 0 ? "+" : ""}${s.shootDamage.mod}` : null;
    context.gear = Object.entries(ASOIAF.unitGear).map(([key, g]) => ({
      key, label: loc(`ASOIAF.Gear.${key}`), hint: loc(`ASOIAF.GearHint.${key}`),
      cost: Siege.costLabel(g.cost), active: s.gear[key]
    }));
    context.shelter = s.shelterActor ? { uuid: s.shelterActor.uuid, name: s.shelterActor.name, img: s.shelterActor.img } : null;
    return context;
  }

  async _onDropData(event, data) {
    if (data.type !== "Actor") return;
    const actor = await fromUuid(data.uuid);
    if (!actor) return;
    if (actor.type === "house") return this.actor.update({ "system.house": actor.uuid });
    if (!actor.system?.abilities?.warfare || actor.type === "unit") return;
    const zone = event.target.closest("[data-drop]")?.dataset.drop ?? "attached";
    return this.actor.update({ [`system.${zone === "commander" ? "commander" : "attached"}`]: actor.uuid });
  }

  static #onIssueOrder() {
    return Warfare.issueOrder(this.actor);
  }

  static #onStanding() {
    const order = this.actor.system.standingOrder;
    if (!order) return ui.notifications.warn(game.i18n.localize("ASOIAF.Unit.noStanding"));
    return Warfare.executeOrder(this.actor, order, { standing: true });
  }

  static #onAttack(event, target) {
    return Warfare.unitAttack(this.actor, "attack", target.dataset.kind);
  }

  static #onEndRound() {
    return Warfare.resetRound([this.actor]);
  }

  static async #onEndBattle() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("ASOIAF.Unit.endBattle") },
      content: `<p>${game.i18n.localize("ASOIAF.Unit.endBattleConfirm")}</p>`,
      rejectClose: false
    });
    if (ok) return Warfare.endBattle(this.actor);
  }

  static #onRollAbility(event, target) {
    return this.actor.rollAbility(target.dataset.ability);
  }

  static #onSetStatus(event, target) {
    return Warfare.setStatus(this.actor, target.dataset.status);
  }

  static #onToggleGear(event, target) {
    return Siege.toggleGear(this.actor, target.dataset.key);
  }

  static #onSiegeAction(fn) {
    return function () {
      return fn(this.actor);
    };
  }

  static async #onLeaveShelter() {
    const shelter = this.actor.system.shelterActor;
    if (shelter) {
      const field = shelter.system.carried === this.actor.uuid ? "carried" : "crew";
      return Siege.releaseUnit(shelter, field);
    }
    return this.actor.update({ "system.shelter": "" });
  }

  static #onUnlink(event, target) {
    return this.actor.update({ [`system.${target.dataset.field}`]: "" });
  }
}
