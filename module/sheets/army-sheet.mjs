import { AsoiafActorSheet } from "./base-sheet.mjs";
import { ASOIAF } from "../config.mjs";
import * as Battle from "../battle.mjs";
import * as Warfare from "../warfare.mjs";
import { sceneBattlefield } from "../data/unit.mjs";

/** Fiche d'Armée : commandement, ordres du round, unités, champ de bataille et bilan. */
export class ArmySheet extends AsoiafActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["army"],
    position: { width: 780, height: 820 },
    actions: {
      remove: ArmySheet.#onRemove,
      issueOrder: ArmySheet.#unit(u => Warfare.issueOrder(u)),
      standing: ArmySheet.#unit(u => u.system.standingOrder && Warfare.executeOrder(u, u.system.standingOrder, { standing: true })),
      openUnit: ArmySheet.#unit(u => u.sheet.render(true)),
      initiative: ArmySheet.#army(Battle.commanderInitiative),
      newRound: ArmySheet.#army(a => Warfare.resetRound(a.system.unitActors)),
      loseCommand: ArmySheet.#army(Battle.loseCommand),
      takeCommand: ArmySheet.#army(Battle.takeCommand),
      commanderFalls: ArmySheet.#army(a => Battle.leaderFalls(a, "commander")),
      heroFalls: ArmySheet.#army(a => Battle.leaderFalls(a, "hero")),
      surrenderAll: ArmySheet.#army(Battle.generalSurrender),
      betrayEnvoy: ArmySheet.#army(Battle.betrayEnvoy),
      battlefield: () => Battle.editBattlefield(),
      report: ArmySheet.#army(Battle.battleReport)
    }
  };

  static PARTS = {
    sheet: { template: "systems/asoiaf/templates/actor/army-sheet.hbs", scrollable: [".sheet-body"] }
  };

  static SHEET_TABS = ["command", "field", "report"];

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const s = this.actor.system;
    const loc = k => game.i18n.localize(k);
    const fmt = (k, d) => game.i18n.format(k, d);
    const person = (a, kind) => a ? {
      uuid: a.uuid, name: a.name, img: a.img,
      warfare: a.system.abilities?.warfare?.value ?? 0, status: a.system.abilities?.status?.value ?? 0,
      left: kind ? s.ordersLeft(a.uuid) : null, total: kind === "commander" ? s.commanderOrders : kind === "sub" ? 1 : null
    } : null;
    const house = s.house ? fromUuidSync(s.house) : null;
    context.house = house ? { uuid: house.uuid, name: house.name, img: house.img } : null;
    context.commander = person(s.commanderActor, "commander");
    context.subs = s.subActors.map((a, i) => ({ ...person(a, "sub"), over: i >= s.maxSubCommanders }));
    context.heroes = s.heroActors.map((a, i) => ({ ...person(a), over: i >= s.maxHeroes }));
    context.sideOptions = { attacker: "ASOIAF.Battle.attacker", defender: "ASOIAF.Battle.defender" };
    context.units = s.unitActors.map(u => {
      const us = u.system;
      return {
        uuid: u.uuid, id: u.id, name: u.name, img: u.img, status: us.status,
        statusLabel: loc(`ASOIAF.Unit.status_${us.status}`),
        health: `${us.health.value}/${us.health.max}`,
        defense: us.currentDefense, shootDefense: us.shootDefense, discipline: us.orderDifficulty,
        orders: us.ordersThisRound,
        standing: us.standingOrder ? loc(`ASOIAF.Order.${us.standingOrder}`) : "—",
        activated: us.activated,
        formation: us.formation !== "none" ? loc(`ASOIAF.Formation.${us.formation}`) : "",
        terrain: us.terrain !== "open" ? loc(`ASOIAF.Terrain.${us.terrain}`) : "",
        fortification: us.fortification !== "none" ? loc(`ASOIAF.Fortification.${us.fortification}`) : "",
        concealed: us.concealed,
        attached: us.attachedActor?.name ?? ""
      };
    });
    context.ordersLabel = fmt("ASOIAF.Battle.ordersRound", { spent: s.ordersSpent, total: s.totalOrders });
    const field = sceneBattlefield();
    context.field = {
      scene: game.scenes.viewed?.name ?? "—",
      visibility: loc(`ASOIAF.Visibility.${field.visibility}`),
      weather: loc(`ASOIAF.Weather.${field.weather}`)
    };
    context.isGM = game.user.isGM;
    context.terrainTable = Object.entries(ASOIAF.battleTerrain).map(([k, t]) => ({
      label: loc(`ASOIAF.Terrain.${k}`),
      effects: [t.cover ? fmt("ASOIAF.Battle.coverN", { n: t.cover }) : null, t.bonusDice ? `+${t.bonusDice}B` : null,
        t.slow === 1 ? loc("ASOIAF.Battle.slow") : t.slow === 2 ? loc("ASOIAF.Battle.verySlow") : null,
        t.noCavalry ? loc("ASOIAF.Battle.noCavalry") : null, t.noSiege ? loc("ASOIAF.Battle.noSiege") : null,
        t.blocks ? loc("ASOIAF.Battle.blocks") : null, t.warships ? loc("ASOIAF.Battle.warships") : null].filter(Boolean).join(", ") || "—"
    }));
    context.formationTable = Object.keys(ASOIAF.formations).filter(k => k !== "none").map(k => ({
      label: loc(`ASOIAF.Formation.${k}`), hint: loc(`ASOIAF.FormationHint.${k}`)
    }));
    return context;
  }

  _acceptsItemType() {
    return false;
  }

  /** Glisser une unité, un personnage (selon la zone) ou une Maison sur la fiche. */
  async _onDropData(event, data) {
    if (data.type !== "Actor") return;
    const actor = await fromUuid(data.uuid);
    if (!actor || actor === this.actor) return;
    const zone = event.target.closest("[data-drop]")?.dataset.drop ?? (actor.type === "unit" ? "units" : "hero");
    return Battle.addToArmy(this.actor, actor, zone);
  }

  static #unit(fn) {
    return function (event, target) {
      const unit = fromUuidSync(target.closest("[data-uuid]").dataset.uuid);
      if (unit) return fn(unit);
    };
  }

  static #army(fn) {
    return function () {
      return fn(this.actor);
    };
  }

  static #onRemove(event, target) {
    return Battle.removeFromArmy(this.actor, target.closest("[data-uuid]").dataset.uuid);
  }
}
