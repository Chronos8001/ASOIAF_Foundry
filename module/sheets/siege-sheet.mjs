import { AsoiafActorSheet } from "./base-sheet.mjs";
import { ASOIAF } from "../config.mjs";
import * as Siege from "../siege.mjs";

export class SiegeSheet extends AsoiafActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["siege"],
    position: { width: 600, height: 640 },
    actions: {
      fire: SiegeSheet.#onFire,
      smash: SiegeSheet.#onSmash,
      release: SiegeSheet.#onRelease,
      repair: SiegeSheet.#onRepair
    }
  };

  static PARTS = {
    sheet: { template: "systems/asoiaf/templates/actor/siege-sheet.hbs", scrollable: [".sheet-body"] }
  };

  static SHEET_TABS = ["battle", "notes"];

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const s = this.actor.system;
    const loc = k => game.i18n.localize(k);
    const link = uuid => {
      const doc = uuid ? fromUuidSync(uuid) : null;
      return doc ? { uuid, name: doc.name, img: doc.img } : null;
    };
    context.kindOptions = Object.fromEntries(Object.keys(ASOIAF.siegeEngines).map(k => [k, `ASOIAF.SiegeKind.${k}`]));
    context.ammo = s.ammoList.map(a => ({
      key: a, label: loc(`ASOIAF.Ammo.${a}`), damage: s.def.damage[a], active: a === s.currentAmmo,
      ignore: ASOIAF.siegeAmmo[a]?.ignore, cost: Siege.costLabel(ASOIAF.siegeAmmo[a]?.cost)
    }));
    context.crew = link(s.crew);
    context.carried = link(s.carried);
    context.house = link(s.house);
    context.healthPct = s.health.max ? Math.round(100 * s.health.value / s.health.max) : 0;
    context.cost = Siege.costLabel(s.def.cost);
    context.carries = !!s.def.carries;
    context.hasCrew = !s.def.carries;
    context.crewIsShelter = !!s.def.crew;
    context.kindHint = loc(`ASOIAF.SiegeHint.${s.kind}`);
    context.reloading = game.combat && s.lastFired >= 0 && game.combat.round === s.lastFired + 1;
    return context;
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    // Choix des munitions (payantes pour la poix et le feu grégeois).
    this.element.addEventListener("change", event => {
      const input = event.target.closest("[data-ammo]");
      if (!input) return;
      event.stopPropagation();
      Siege.setAmmo(this.actor, input.value);
    }, true);
  }

  async _onDropData(event, data) {
    if (data.type !== "Actor") return;
    const actor = await fromUuid(data.uuid);
    if (actor?.type === "house") return this.actor.update({ "system.house": actor.uuid });
    if (actor?.type === "unit") return Siege.assignUnit(this.actor, actor);
  }

  static #onFire() {
    return Siege.fireSiege(this.actor);
  }

  static #onSmash() {
    return Siege.smash(this.actor);
  }

  static #onRelease(event, target) {
    return Siege.releaseUnit(this.actor, target.dataset.field);
  }

  static async #onRepair() {
    await this.actor.update({ "system.health.value": this.actor.system.health.max, "system.status": "ready" });
    try {
      await this.actor.toggleStatusEffect?.("asoiaf-destroyed", { active: false });
    } catch (err) {
      console.warn("ASOIAF | Effet de statut", err);
    }
  }
}
