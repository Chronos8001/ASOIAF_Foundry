import { ASOIAF } from "../config.mjs";

const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;

const counter = (initial = 0) => new NumberField({ required: true, integer: true, min: 0, initial });
const text = () => new StringField({ required: true, blank: true, initial: "" });

/** Données d'une Maison noble. */
export class HouseData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const resources = {};
    for (const r of ASOIAF.resources) resources[r] = new SchemaField({ value: counter(0) });

    return {
      resources: new SchemaField(resources),
      realm: new StringField({ required: true, blank: true, initial: "" }),
      liege: text(),
      seat: text(),
      founding: new StringField({ required: true, blank: true, initial: "" }),
      historyCount: counter(0),
      motto: text(),
      blazon: text(),
      arms: new StringField({ required: true, blank: true, initial: "" }),
      isBanner: new BooleanField({ initial: false }),
      glory: counter(),
      month: counter(1),
      monthsWithoutFortune: counter(0),
      fortuneRolled: new BooleanField({ initial: false }),
      actionTaken: new BooleanField({ initial: false }),
      members: new ArrayField(new SchemaField({ uuid: text(), role: text() })),
      history: new ArrayField(new SchemaField({
        event: text(), roll: counter(0), changes: text(), notes: text()
      })),
      fortunes: new ArrayField(new SchemaField({
        month: counter(0), result: new NumberField({ integer: true, initial: 0 }), fortune: text(), notes: text()
      })),
      notes: text()
    };
  }

  prepareDerivedData() {
    const items = this.parent.items;
    const res = this.resources;

    for (const r of ASOIAF.resources) {
      res[r].invested = 0;
      res[r].band = ASOIAF.resourceBand(res[r].value);
    }
    for (const item of items) {
      const cost = item.system.investment ?? 0;
      const resource = item.system.resource;
      if (resource && res[resource]) res[resource].invested += cost;
      // Les mercenaires coûtent de la Richesse, les levées de la Population.
      if (item.type === "unit") {
        res.wealth.invested += item.system.wealthCost;
        res.population.invested += item.system.populationCost;
      }
    }
    for (const r of ASOIAF.resources) res[r].available = res[r].value - res[r].invested;

    this.maxStatus = ASOIAF.lookup(ASOIAF.influenceStatus, res.influence.value);
    this.lawModifier = ASOIAF.lookup(ASOIAF.lawFortune, res.law.value);
    this.populationModifier = ASOIAF.lookup(ASOIAF.populationFortune, res.population.value);

    // Bonus de Fortune des possessions terminées : nombres -> modificateur, sinon formule.
    this.holdingModifier = 0;
    const formulas = [];
    for (const item of items) {
      const active = item.type === "artisan" || (item.type === "holding" && item.system.complete);
      if (!active) continue;
      const f = item.system.fortune?.trim();
      if (!f) continue;
      if (/^[+-]?\d+$/.test(f)) this.holdingModifier += Number(f);
      else formulas.push(f);
    }
    this.fortuneFormula = formulas.join(" + ");
    this.fortuneModifier = this.lawModifier + this.populationModifier + this.holdingModifier;
    this.bannerCount = items.filter(i => i.type === "holding" && i.system.kind === "banner").length;
    this.defenseBonus = Math.max(0, ...items
      .filter(i => i.type === "holding" && i.system.complete)
      .map(i => i.system.defenseBonus ?? 0));
  }
}
