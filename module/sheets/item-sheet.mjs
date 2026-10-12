import { ASOIAF } from "../config.mjs";

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
      statusOptions: options(["ready", "disorganized", "routed", "destroyed"], "ASOIAF.UnitStatus"),
      linkedName: item.system.linked ? fromUuidSync(item.system.linked)?.name : null
    });
  }

  static #onEditImage() {
    const FP = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
    new FP({ type: "image", current: this.item.img, callback: path => this.item.update({ img: path }) }).render(true);
  }
}
