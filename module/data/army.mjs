const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;

const text = () => new StringField({ required: true, blank: true, initial: "" });

/**
 * Armée (chapitre 10) : un camp de la bataille.
 * Le commandant donne autant d'ordres par round que son rang d'Art de la guerre ; chaque
 * sous-commandant (un pour deux unités) en donne un. L'armée compte un héros par rang de
 * Statut du commandant. Sans commandement, toutes les unités sont désorganisées et l'armée
 * ne donne plus qu'un ordre par round.
 */
export class ArmyData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      house: text(),
      side: new StringField({ required: true, initial: "attacker", choices: ["attacker", "defender"] }),
      commander: text(),
      subCommanders: new ArrayField(text()),
      heroes: new ArrayField(text()),
      units: new ArrayField(text()),
      ordersUsed: new ArrayField(new SchemaField({ uuid: text(), n: new NumberField({ required: true, integer: true, min: 0, initial: 0 }) })),
      commandLost: new BooleanField({ initial: false }),
      siegeShots: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      notes: text()
    };
  }

  prepareDerivedData() {
    const resolve = uuid => {
      try {
        return uuid ? fromUuidSync(uuid) : null;
      } catch {
        return null;
      }
    };
    this.commanderActor = resolve(this.commander);
    this.unitActors = this.units.map(resolve).filter(u => u?.type === "unit");
    this.subActors = this.subCommanders.map(resolve).filter(Boolean);
    this.heroActors = this.heroes.map(resolve).filter(Boolean);
    const warfare = this.commanderActor?.system.abilities?.warfare?.value ?? 0;
    const status = this.commanderActor?.system.abilities?.status?.value ?? 0;
    // Ordres par round : rang d'Art de la guerre du commandant (1 seul sans commandement).
    this.commanderOrders = this.commandLost || !this.commanderActor ? 1 : warfare;
    this.maxSubCommanders = Math.floor(this.unitActors.length / 2);
    this.maxHeroes = status;
    this.activeUnits = this.unitActors.filter(u => !["destroyed", "surrendered"].includes(u.system.status));
    this.totalOrders = this.commanderOrders + (this.commandLost ? 0 : Math.min(this.subActors.length, this.maxSubCommanders));
    this.ordersSpent = this.ordersUsed.reduce((t, o) => t + o.n, 0);
  }

  /** Ordres déjà donnés ce round par un chef. */
  usedBy(uuid) {
    return this.ordersUsed.find(o => o.uuid === uuid)?.n ?? 0;
  }

  /** Ordres restants d'un chef (commandant ou sous-commandant) pour ce round. */
  ordersLeft(uuid) {
    const used = this.usedBy(uuid);
    if (this.commandLost) return Math.max(0, 1 - this.ordersSpent);
    if (uuid === this.commander) return Math.max(0, this.commanderOrders - used);
    const index = this.subCommanders.indexOf(uuid);
    if (index >= 0 && index < this.maxSubCommanders) return Math.max(0, 1 - used);
    return 0;
  }
}
