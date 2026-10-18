import { ASOIAF } from "../config.mjs";
import { ALL_TYPES, DERIVED_TARGETS, describe } from "../effects.mjs";
import { describeRule, intervalLabel } from "../poisons.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const options = (keys, prefix) => Object.fromEntries(keys.map(k => [k, `${prefix}.${k}`]));

export class AsoiafItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["asoiaf", "sheet", "item"],
    position: { width: 520, height: "auto" },
    form: { submitOnChange: true },
    window: { resizable: true },
    actions: {
      editImage: AsoiafItemSheet.#onEditImage,
      modAdd: AsoiafItemSheet.#onModAdd,
      modDelete: AsoiafItemSheet.#onModDelete,
      openUuid: async (event, target) => (await fromUuid(target.dataset.uuid))?.sheet?.render(true)
    }
  };

  static PARTS = {
    sheet: { template: "systems/asoiaf/templates/item/item-sheet.hbs" }
  };

  async _prepareContext(options_) {
    const context = await super._prepareContext(options_);
    const item = this.item;
    return Object.assign(context, {
      item,
      system: item.system,
      editable: this.isEditable,
      isType: Object.fromEntries([item.type].map(t => [t, true])),
      typeLabel: game.i18n.localize(`TYPES.Item.${item.type}`),
      specialtyOptions: options(Object.keys(ASOIAF.weaponSpecialties), "ASOIAF.Specialty"),
      damageAbilityOptions: { ...options(Object.keys(ASOIAF.abilities), "ASOIAF.Ability"), none: "ASOIAF.Common.none" },
      abilityOptions: options(Object.keys(ASOIAF.abilities), "ASOIAF.Ability"),
      gradeOptions: options(["poor", "common", "superior", "extraordinary"], "ASOIAF.Grade"),
      resourceOptions: options(ASOIAF.resources, "ASOIAF.Resource"),
      terrainOptions: Object.fromEntries(Object.entries(ASOIAF.terrains)
        .map(([k, c]) => [k, `${game.i18n.localize(`ASOIAF.Terrain.${k}`)} (${c})`])),
      features: Object.entries(ASOIAF.features).map(([k, c]) => ({
        key: k, cost: c, label: game.i18n.localize(`ASOIAF.Feature.${k}`), value: item.system.features?.[k] ?? 0
      })),
      trainingOptions: Object.fromEntries(Object.entries(ASOIAF.unitTraining)
        .map(([k, t]) => [k, `${game.i18n.localize(`ASOIAF.Training.${k}`)} (${t.cost})`])),
      unitTypes: Object.entries(ASOIAF.unitTypes).map(([k, t]) => ({
        key: k, cost: t.cost, discipline: t.discipline >= 0 ? `+${t.discipline}` : t.discipline,
        label: game.i18n.localize(`ASOIAF.UnitType.${k}`), checked: item.system.types?.[k]
      })),
      loanOptions: Object.fromEntries(["home", "lent", "borrowed"].map(k => [k, `ASOIAF.Artisan.loan_${k}`])),
      artisanMax: ASOIAF.artisan.maxBudget,
      statusOptions: options(["ready", "disorganized", "routed", "destroyed"], "ASOIAF.UnitStatus"),
      linkedName: item.system.linked ? fromUuidSync(item.system.linked)?.name : null,
      hasModifiers: ["benefit", "drawback"].includes(item.type),
      modifierRows: (item.system.modifiers ?? []).map((m, index) => ({
        ...m, index,
        pending: m.target?.startsWith("?"),
        summary: describe(m, item.parent?.system?.abilities)
      })),
      modifierTypes: Object.fromEntries(ALL_TYPES.map(t => [t, `ASOIAF.Modifier.type_${t}`])),
      targetSuggestions: AsoiafItemSheet.#targetSuggestions(),
      categoryOptions: options(ASOIAF.equipmentCategories, "ASOIAF.EquipmentCategory"),
      ...(item.type === "poison" ? AsoiafItemSheet.#poisonContext(item.system) : {})
    });
  }

  /** Résumé lisible des phases, seuils et de la récupération d'un poison. */
  static #poisonContext(sys) {
    const loc = k => game.i18n.localize(k);
    const fmt = (k, d) => game.i18n.format(k, d);
    const ability = a => loc(`ASOIAF.Ability.${a}`);
    const json = v => JSON.stringify(v, null, 1);
    const r = sys.recovery;
    const recovery = {
      fade: r.fadeOnWake ? loc("ASOIAF.Poison.rec_wake") : fmt("ASOIAF.Poison.rec_fade", { hours: Math.round(r.fadeAfter / 360) / 10 }),
      periodic: fmt("ASOIAF.Poison.rec_periodic", { amount: r.amount, every: intervalLabel(r.interval) }),
      test: fmt("ASOIAF.Poison.rec_test", { difficulty: r.difficulty, every: intervalLabel(r.interval) }),
      permanent: loc("ASOIAF.Poison.rec_permanent")
    }[r.mode];
    return {
      alcoholOptions: { "": "ASOIAF.Common.none", beer: "ASOIAF.Poison.alcohol_beer", wine: "ASOIAF.Poison.alcohol_wine", spirits: "ASOIAF.Poison.alcohol_spirits" },
      poisonStages: sys.stages.map((st, i) => ({
        title: st.label || fmt("ASOIAF.Poison.stageN", { n: i + 1 }),
        schedule: st.auto
          ? loc("ASOIAF.Poison.autoStage")
          : fmt("ASOIAF.Poison.schedule", { toxicity: st.toxicity, every: intervalLabel(st.interval), ability: ability(st.defense) }),
        effects: st.effects.map(describeRule),
        follow: st.followAbility ? fmt("ASOIAF.Poison.followText", {
          ability: ability(st.followAbility), difficulty: st.followDifficulty, fail: describeRule(st.followFail)
        }) : ""
      })),
      poisonThresholds: sys.thresholds.map(t => fmt(`ASOIAF.Poison.threshold_${t.result}`, {
        ability: ability(t.ability), multiplier: t.multiplier > 1 ? `${t.multiplier} × ` : "", hours: t.hours
      })).join(" ; "),
      poisonRecovery: recovery + (r.destinyDelay ? ` ${fmt("ASOIAF.Poison.rec_destiny", { delay: r.destinyDelay })}` : ""),
      poisonJson: { stages: json(sys.stages), thresholds: json(sys.thresholds), recovery: json(sys.recovery) }
    };
  }

  /** Cibles proposées dans l'éditeur d'effets. */
  static #targetSuggestions() {
    const loc = k => game.i18n.localize(k);
    const list = [{ value: "all", label: loc("ASOIAF.Modifier.allTests") }, { value: "initiative", label: loc("ASOIAF.Modifier.initiative") }];
    for (const [a, specs] of Object.entries(ASOIAF.abilities)) {
      list.push({ value: a, label: loc(`ASOIAF.Ability.${a}`) });
      for (const sp of specs) list.push({ value: `${a}.${sp}`, label: `${loc(`ASOIAF.Ability.${a}`)} — ${loc(`ASOIAF.Specialty.${sp}`)}` });
    }
    for (const t of DERIVED_TARGETS) list.push({ value: t, label: loc(`ASOIAF.Modifier.derived_${t}`) });
    list.push({ value: "weapon:", label: loc("ASOIAF.Modifier.weaponTarget") });
    return list;
  }

  _onFirstRender(context, options_) {
    super._onFirstRender?.(context, options_);
    // Éditeur avancé des poisons : JSON des phases, seuils et récupération.
    this.element.addEventListener("change", event => {
      const area = event.target.closest("[data-json]");
      if (!area) return;
      event.stopPropagation();
      try {
        this.item.update({ [`system.${area.dataset.json}`]: JSON.parse(area.value) });
      } catch (err) {
        ui.notifications.error(game.i18n.format("ASOIAF.Poison.jsonError", { error: err.message }));
      }
    }, true);
    // Champs de l'éditeur d'effets (sans attribut name).
    this.element.addEventListener("change", event => {
      const input = event.target.closest("[data-mod-index]");
      if (!input) return;
      event.stopPropagation();
      const mods = foundry.utils.deepClone(this.item.system.modifiers);
      const value = input.type === "checkbox" ? input.checked : input.value;
      mods[Number(input.dataset.modIndex)][input.dataset.key] = value;
      this.item.update({ "system.modifiers": mods });
    }, true);
  }

  static #onModAdd() {
    const mods = [...this.item.system.modifiers, { type: "modifier", target: "", value: "1", situational: false, condition: "", label: "" }];
    return this.item.update({ "system.modifiers": mods });
  }

  static #onModDelete(event, target) {
    const mods = foundry.utils.deepClone(this.item.system.modifiers);
    mods.splice(Number(target.dataset.index), 1);
    return this.item.update({ "system.modifiers": mods });
  }

  static #onEditImage() {
    const FP = foundry.applications.apps?.FilePicker?.implementation ?? FilePicker;
    new FP({ type: "image", current: this.item.img, callback: path => this.item.update({ img: path }) }).render(true);
  }
}
