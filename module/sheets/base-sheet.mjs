const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** Récupère les données d'un glisser-déposer, quelle que soit la version de Foundry. */
export function getDragData(event) {
  const TE = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;
  try {
    return TE.getDragEventData(event);
  } catch {
    return {};
  }
}

/**
 * Base commune aux feuilles d'acteur : onglets, image, gestion des objets
 * intégrés et glisser-déposer.
 */
export class AsoiafActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["asoiaf", "sheet", "actor"],
    form: { submitOnChange: true },
    window: { resizable: true },
    actions: {
      asTab: AsoiafActorSheet.#onTab,
      editImage: AsoiafActorSheet.#onEditImage,
      itemCreate: AsoiafActorSheet.#onItemCreate,
      itemEdit: AsoiafActorSheet.#onItemEdit,
      itemDelete: AsoiafActorSheet.#onItemDelete,
      itemToggle: AsoiafActorSheet.#onItemToggle,
      openUuid: AsoiafActorSheet.#onOpenUuid,
      step: AsoiafActorSheet.#onStep
    }
  };

  /** Onglet actif, conservé entre deux rendus. */
  _asTab = null;

  static SHEET_TABS = [];

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this._asTab ??= this.constructor.SHEET_TABS[0];
    return Object.assign(context, {
      actor: this.actor,
      system: this.actor.system,
      config: CONFIG.ASOIAF,
      editable: this.isEditable,
      activeTab: this._asTab,
      tabs: this.constructor.SHEET_TABS.map(id => ({
        id, label: `ASOIAF.Tab.${id}`, active: id === this._asTab, cssClass: id === this._asTab ? "active" : ""
      }))
    });
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    const el = this.element;
    // Édition en ligne des objets intégrés (champs sans attribut name).
    el.addEventListener("change", event => {
      const input = event.target.closest("[data-item-field]");
      if (!input) return;
      event.stopPropagation();
      const id = input.closest("[data-item-id]")?.dataset.itemId;
      const item = this.actor.items.get(id);
      if (!item) return;
      let value = input.type === "checkbox" ? input.checked : input.value;
      if (input.type === "number") value = Number(value) || 0;
      item.update({ [input.dataset.itemField]: value });
    }, true);
    el.addEventListener("dragover", event => event.preventDefault());
    el.addEventListener("drop", event => {
      if (!this.isEditable) return;
      event.preventDefault();
      event.stopPropagation();
      this._onDropData(event, getDragData(event));
    }, true);
  }

  /** Gestion du dépôt ; les sous-classes complètent pour les acteurs. */
  async _onDropData(event, data) {
    if (data.type !== "Item") return;
    const item = await Item.implementation.fromDropData(data);
    if (!item || item.parent === this.actor) return;
    if (!this._acceptsItemType(item.type)) {
      return ui.notifications.warn(game.i18n.localize("ASOIAF.Warn.wrongItemType"));
    }
    return this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
  }

  _acceptsItemType(type) {
    return true;
  }

  /** Liste d'objets prêts pour les gabarits. */
  _items(type) {
    return this.actor.items.filter(i => i.type === type).sort((a, b) => (a.sort || 0) - (b.sort || 0));
  }

  static #onTab(event, target) {
    this._asTab = target.dataset.tab;
    this.element.querySelectorAll("[data-action=asTab]").forEach(t => t.classList.toggle("active", t.dataset.tab === this._asTab));
    this.element.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.dataset.tab === this._asTab));
  }

  static #onEditImage(event, target) {
    const field = target.dataset.field ?? "img";
    const FP = foundry.applications.apps?.FilePicker?.implementation ?? FilePicker;
    new FP({
      type: "image",
      current: foundry.utils.getProperty(this.actor, field),
      callback: path => this.actor.update({ [field]: path })
    }).render(true);
  }

  static async #onItemCreate(event, target) {
    const type = target.dataset.type;
    const system = target.dataset.system ? JSON.parse(target.dataset.system) : {};
    const name = game.i18n.localize(target.dataset.name ?? `TYPES.Item.${type}`);
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name, type, system }]);
    item?.sheet.render(true);
  }

  static #onItemEdit(event, target) {
    const id = target.closest("[data-item-id]").dataset.itemId;
    this.actor.items.get(id)?.sheet.render(true);
  }

  static async #onItemDelete(event, target) {
    const id = target.closest("[data-item-id]").dataset.itemId;
    const item = this.actor.items.get(id);
    if (!item) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("ASOIAF.Common.delete") },
      content: `<p>${game.i18n.format("ASOIAF.Common.confirmDelete", { name: item.name })}</p>`,
      rejectClose: false
    });
    if (ok) item.delete();
  }

  static #onItemToggle(event, target) {
    const id = target.closest("[data-item-id]").dataset.itemId;
    const item = this.actor.items.get(id);
    const field = target.dataset.field ?? "system.equipped";
    item?.update({ [field]: !foundry.utils.getProperty(item, field) });
  }

  static async #onOpenUuid(event, target) {
    const doc = await fromUuid(target.dataset.uuid);
    doc?.sheet?.render(true);
  }

  /** Bouton +/- sur un champ numérique de l'acteur. */
  static #onStep(event, target) {
    const field = target.dataset.field;
    const delta = Number(target.dataset.delta) || 0;
    const current = Number(foundry.utils.getProperty(this.actor, field)) || 0;
    const min = target.dataset.min !== undefined ? Number(target.dataset.min) : 0;
    const max = target.dataset.max !== undefined ? Number(target.dataset.max) : Infinity;
    this.actor.update({ [field]: Math.clamp?.(current + delta, min, max) ?? Math.min(max, Math.max(min, current + delta)) });
  }
}
