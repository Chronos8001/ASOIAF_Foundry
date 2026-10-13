import { AsoiafActorSheet } from "./base-sheet.mjs";
import { ASOIAF } from "../config.mjs";
import * as House from "../house.mjs";
import * as Artisans from "../artisans.mjs";
import { deployUnit } from "../warfare.mjs";
import { buildSiege, costLabel } from "../siege.mjs";

const HOUSE_ITEM_TYPES = ["holding", "domain", "unit", "artisan"];

export class HouseSheet extends AsoiafActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["house"],
    position: { width: 860, height: 900 },
    actions: {
      rollRealm: HouseSheet.#call(House.rollRealm),
      rollResources: HouseSheet.#onRollResources,
      playerBonus: HouseSheet.#withResource(House.rollPlayerBonus, "bonus"),
      rollFounding: HouseSheet.#call(House.rollFounding),
      rollEvent: HouseSheet.#call(House.rollHistoricalEvent),
      chooseEvent: HouseSheet.#onChooseEvent,
      deleteRow: HouseSheet.#onDeleteRow,
      rollFortune: HouseSheet.#call(House.rollFortune),
      skipFortune: HouseSheet.#withResource(House.skipFortune, "skip"),
      nextMonth: HouseSheet.#onNextMonth,
      manageResources: HouseSheet.#call(House.manageResources),
      donateGlory: HouseSheet.#withResource(House.donateGlory, "glory"),
      addHolding: HouseSheet.#onAddHolding,
      artisanStart: HouseSheet.#artisan(Artisans.startWork),
      artisanRoll: HouseSheet.#artisan(Artisans.rollWork),
      artisanInterrupt: HouseSheet.#artisan(Artisans.interrupt),
      artisanSpend: HouseSheet.#artisan(Artisans.spendBudget),
      artisanBuy: HouseSheet.#artisan(Artisans.buyBudget),
      artisanXp: HouseSheet.#artisan(Artisans.spendXp),
      artisanDeath: HouseSheet.#artisan(Artisans.death),
      groupProject: HouseSheet.#call(Artisans.groupProject),
      deployUnit: HouseSheet.#artisan(deployUnit),
      buildSiege: HouseSheet.#onBuildSiege
    }
  };

  static PARTS = {
    sheet: { template: "systems/asoiaf/templates/actor/house-sheet.hbs", scrollable: [".sheet-body"] }
  };

  static SHEET_TABS = ["resources", "holdings", "artisans", "household", "history", "fortunes", "arms"];

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const s = this.actor.system;
    const loc = k => game.i18n.localize(k);

    context.resources = ASOIAF.resources.map(r => {
      const res = s.resources[r];
      return {
        key: r,
        label: loc(`ASOIAF.Resource.${r}`),
        value: res.value,
        invested: res.invested,
        available: res.available,
        over: res.available < 0,
        pct: Math.min(100, Math.round(res.value / 70 * 100)),
        band: loc(`ASOIAF.Band.${r}.${res.band}`),
        realmMod: ASOIAF.realms[s.realm]?.mods[ASOIAF.resources.indexOf(r)]
      };
    });
    context.resourceOptions = Object.fromEntries(ASOIAF.resources.map(r => [r, `ASOIAF.Resource.${r}`]));
    context.realmOptions = Object.fromEntries(Object.keys(ASOIAF.realms).map(r => [r, `ASOIAF.Realm.${r}`]));
    context.foundingOptions = Object.fromEntries(Object.keys(ASOIAF.foundings).map(f => [f, `ASOIAF.Founding.${f}`]));
    context.eventOptions = Object.fromEntries(Object.keys(ASOIAF.historicalEvents).map(e => [e, `ASOIAF.Event.${e}`]));
    context.unitStatusOptions = Object.fromEntries(["ready", "disorganized", "routed", "destroyed"].map(k => [k, `ASOIAF.UnitStatus.${k}`]));
    context.roleOptions = Object.fromEntries(ASOIAF.houseRoles.map(r => [r, `ASOIAF.Role.${r}`]));
    context.realmLiege = s.realm ? loc(`ASOIAF.Liege.${s.realm}`) : "";

    // Possessions regroupées par ressource.
    const holdings = this._items("holding");
    const describe = h => ({
      item: h, id: h.id,
      complete: h.system.complete,
      linked: h.system.linked,
      fortune: h.system.fortune
    });
    context.holdings = {
      defense: holdings.filter(h => h.system.resource === "defense").map(describe),
      influence: holdings.filter(h => h.system.resource === "influence").map(describe),
      lands: holdings.filter(h => h.system.resource === "lands").map(describe),
      power: holdings.filter(h => h.system.resource === "power").map(describe),
      wealth: holdings.filter(h => !["defense", "influence", "lands", "power"].includes(h.system.resource)).map(describe)
    };
    context.domains = this._items("domain").map(d => ({
      item: d, id: d.id,
      terrain: loc(`ASOIAF.Terrain.${d.system.terrain}`),
      features: Object.entries(d.system.features).filter(([, n]) => n > 0)
        .map(([f, n]) => `${loc(`ASOIAF.Feature.${f}`)}${n > 1 ? ` ×${n}` : ""}`).join(", ")
    }));
    context.units = this._items("unit").map(u => ({
      item: u, id: u.id,
      training: loc(`ASOIAF.Training.${u.system.training}`),
      types: u.system.typeList.map(t => loc(`ASOIAF.UnitType.${t}`)).join(" / ") || "—",
      discipline: u.system.discipline,
      keyAbilities: u.system.keyAbilities.map(a => loc(`ASOIAF.Ability.${a}`)).join(", "),
      deployed: !!u.getFlag("asoiaf", "actor") && !!fromUuidSync(u.getFlag("asoiaf", "actor"))
    }));
    context.siegeCatalog = Object.entries(CONFIG.ASOIAF.siegeEngines).map(([k, d]) => ({
      key: k, label: `${loc(`ASOIAF.SiegeKind.${k}`)} (${costLabel(d.cost)})`
    }));
    const uuid = this.actor.uuid;
    context.siegeEngines = game.actors.filter(a => a.type === "siege" && a.system.house === uuid)
      .map(a => ({ uuid: a.uuid, name: a.name, img: a.img, destroyed: a.system.status === "destroyed",
        kind: loc(`ASOIAF.SiegeKind.${a.system.kind}`), health: a.system.health.value, max: a.system.health.max }));
    context.catalog = Object.fromEntries(Object.entries(ASOIAF.holdingCatalog).map(([r, list]) =>
      [r, list.map((e, i) => ({ index: i, label: `${e.name} (${e.cost})` }))]));

    const month = s.month;
    const maxBudget = CONFIG.ASOIAF.artisan.maxBudget;
    context.artisans = this._items("artisan").map(a => {
      const sys = a.system;
      const working = sys.startedMonth === month && sys.rolledMonth !== month;
      const done = sys.rolledMonth === month;
      return {
        item: a, id: a.id,
        ability: loc(`ASOIAF.Ability.${sys.ability}`),
        budgetPct: Math.round(100 * sys.budget / maxBudget),
        state: done ? "done" : working ? "working" : "idle",
        stateLabel: loc(`ASOIAF.Artisan.state_${done ? "done" : working ? "working" : "idle"}`),
        canStart: !working && !done && sys.startedMonth !== month && sys.budget > 0,
        canRoll: working,
        nextRank: sys.xp >= CONFIG.ASOIAF.artisan.rankXp || sys.xp >= CONFIG.ASOIAF.artisan.productionXp,
        loanLabel: sys.loan === "home" ? "" : loc(`ASOIAF.Artisan.loan_${sys.loan}`)
      };
    });
    context.artisanRules = CONFIG.ASOIAF.artisan;
    context.workingCount = context.artisans.filter(a => a.state === "working").length;

    context.members = House.getMembers(this.actor).map(m => ({
      ...m,
      status: m.actor?.system?.abilities?.status.value ?? "—",
      overStatus: (m.actor?.system?.abilities?.status.value ?? 0) > s.maxStatus
    }));
    context.history = s.history.map((h, index) => ({ ...h, index, label: loc(`ASOIAF.Event.${h.event}`) }));
    context.fortunes = s.fortunes.map((f, index) => ({ ...f, index, label: loc(`ASOIAF.Fortune.${f.fortune}`) })).reverse();
    context.fortuneTable = this.#fortuneTable();
    context.fortuneWarning = s.monthsWithoutFortune >= 2 && !s.fortuneRolled;
    context.armsImg = s.arms || "icons/svg/shield.svg";
    return context;
  }

  /** Table 6-18 condensée en plages lisibles. */
  #fortuneTable() {
    const rows = [];
    let min = -Infinity;
    for (const [max, fortune] of ASOIAF.houseFortunes) {
      const range = min === -Infinity ? `≤ ${max}` : max === Infinity ? `${min}+` : min === max ? `${max}` : `${min}–${max}`;
      rows.push({ range, fortune, label: game.i18n.localize(`ASOIAF.Fortune.${fortune}`) });
      min = max + 1;
    }
    return rows;
  }

  _acceptsItemType(type) {
    return HOUSE_ITEM_TYPES.includes(type);
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    // Champs des tableaux (membres, historique, fortunes).
    this.element.addEventListener("change", event => {
      const input = event.target.closest("[data-array]");
      if (!input) return;
      event.stopPropagation();
      const { array, index, key } = input.dataset;
      const list = foundry.utils.deepClone(this.actor.system[array]);
      list[Number(index)][key] = input.value;
      this.actor.update({ [`system.${array}`]: list });
    }, true);
  }

  async _onDropData(event, data) {
    if (data.type === "Actor") {
      const actor = await fromUuid(data.uuid);
      if (!actor || actor === this.actor) return;
      if (actor.type === "house") return House.addBanner(this.actor, actor);
      if (this.actor.system.members.some(m => m.uuid === actor.uuid)) return;
      await this.actor.update({ "system.members": [...this.actor.system.members, { uuid: actor.uuid, role: "retainer" }] });
      // Lien inverse : le personnage appartient à cette maison.
      if (actor.system.house !== undefined && !actor.system.house && actor.isOwner) {
        await actor.update({ "system.house": this.actor.uuid });
      }
      return;
    }
    return super._onDropData(event, data);
  }

  /* -------------------------------------------- */

  /** Action portant sur un artisan (ligne data-item-id). */
  static #artisan(fn) {
    return function (event, target) {
      const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
      if (item) return fn(this.actor, item);
    };
  }

  static #call(fn) {
    return function () {
      return fn(this.actor);
    };
  }

  /** Action nécessitant une ressource choisie dans une liste (data-select). */
  static #withResource(fn, select) {
    return function () {
      const resource = this.element.querySelector(`select[data-select=${select}]`)?.value;
      if (resource) return fn(this.actor, resource);
    };
  }

  static async #onRollResources() {
    const hasValues = ASOIAF.resources.some(r => this.actor.system.resources[r].value > 0);
    if (hasValues) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("ASOIAF.House.rollResources") },
        content: `<p>${game.i18n.localize("ASOIAF.House.overwriteResources")}</p>`,
        rejectClose: false
      });
      if (!ok) return;
    }
    return House.rollResources(this.actor);
  }

  static #onChooseEvent() {
    const key = this.element.querySelector("select[data-select=event]")?.value;
    if (key) return House.rollHistoricalEvent(this.actor, key);
  }

  static #onDeleteRow(event, target) {
    const { array, index } = target.dataset;
    const list = foundry.utils.deepClone(this.actor.system[array]);
    list.splice(Number(index), 1);
    return this.actor.update({ [`system.${array}`]: list });
  }

  static async #onNextMonth() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("ASOIAF.House.nextMonth") },
      content: `<p>${game.i18n.localize("ASOIAF.House.nextMonthConfirm")}</p>`,
      rejectClose: false
    });
    if (ok) return House.nextMonth(this.actor);
  }

  static #onBuildSiege() {
    const kind = this.element.querySelector("select[data-select=siege]")?.value;
    if (kind) return buildSiege(this.actor, kind);
  }

  static #onAddHolding(event, target) {
    const resource = target.dataset.resource;
    const select = this.element.querySelector(`select[data-catalog=${resource}]`);
    const construction = this.element.querySelector("input[data-construction]")?.checked;
    return House.addHolding(this.actor, resource, Number(select?.value), { underConstruction: construction });
  }
}
