/**
 * Inventaire : objets glissés depuis le compendium « Équipement » ou « Poisons et drogues ».
 * On peut les acheter (le prix est retiré de la bourse, monnaie rendue) ou les ajouter gratuitement.
 * Les objets identiques (équipement, doses) s'empilent.
 */
import { COIN_VALUE, formatCoins, parseCost, payFromPurse, purseValue } from "./poison-rules.mjs";

const loc = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);

export const PHYSICAL_TYPES = ["weapon", "armor", "equipment", "poison"];
const STACKING_TYPES = ["equipment", "poison"];

/** Objet déjà possédé avec lequel empiler (même nom, même type ; jamais un poison qui affecte le personnage). */
function stackTarget(actor, data) {
  if (!STACKING_TYPES.includes(data.type)) return null;
  return actor.items.find(i => i.type === data.type && i.name === data.name && !i.system.active) ?? null;
}

/** Ajoute un objet à l'inventaire (empilé si possible). */
export async function addToInventory(actor, data) {
  const existing = stackTarget(actor, data);
  if (existing) {
    const qty = data.system?.quantity || 1;
    return existing.update({ "system.quantity": existing.system.quantity + qty });
  }
  return actor.createEmbeddedDocuments("Item", [data]);
}

/** Retire un montant (en sous) de la bourse d'un personnage. */
export async function pay(actor, amount) {
  const purse = payFromPurse(actor.system.coin, amount);
  if (!purse) {
    ui.notifications.warn(fmt("ASOIAF.Inventory.notEnough", { price: formatCoins(amount), purse: formatCoins(purseValue(actor.system.coin)) }));
    return false;
  }
  await actor.update({ "system.coin": purse });
  return true;
}

/**
 * Dépôt d'un objet physique venant d'un compendium ou du monde : proposer l'achat s'il a un prix.
 * Un objet venant d'un autre acteur est simplement copié.
 */
export async function acquireItem(actor, item) {
  const data = item.toObject();
  delete data._id;
  if (data.type === "poison") {
    data.system.active = false;
    data.system.state = {};
  }
  const price = parseCost(item.system.cost);
  if (!price || item.parent) return addToInventory(actor, data);

  const unitName = { dragon: "dragons", lune: "lunes", cerf: "cerfs", etoile: "étoiles", gros: "gros", sou: "sous" }[price.unit];
  const range = price.max > price.min;
  const min = price.min / COIN_VALUE[price.unit];
  const max = price.max / COIN_VALUE[price.unit];
  const content = `<div class="asoiaf-dialog">
    <p>${fmt("ASOIAF.Inventory.buyText", { name: item.name, cost: item.system.cost })}</p>
    ${range ? `<div class="form-group"><label>${fmt("ASOIAF.Inventory.pricePaid", { unit: unitName })}</label>
      <input type="number" name="price" value="${min}" min="0" step="1"></div>
      <p class="hint">${fmt("ASOIAF.Inventory.rangeHint", { min, max, unit: unitName })}</p>` : ""}
    <div class="form-group"><label>${loc("ASOIAF.Common.quantity")}</label><input type="number" name="quantity" value="1" min="1" step="1"></div>
    <p class="hint">${fmt("ASOIAF.Inventory.purse", { purse: formatCoins(purseValue(actor.system.coin)) })}</p>
  </div>`;
  const read = button => ({
    quantity: Math.max(1, Number(button.form.elements.quantity.value) || 1),
    unitPrice: range ? Math.max(0, Number(button.form.elements.price.value) || 0) * COIN_VALUE[price.unit] : price.min
  });
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: item.name },
    content,
    buttons: [
      { action: "buy", label: loc("ASOIAF.Inventory.buy"), icon: "fa-solid fa-coins", default: true, callback: (e, b) => ({ buy: true, ...read(b) }) },
      { action: "free", label: loc("ASOIAF.Inventory.free"), icon: "fa-solid fa-gift", callback: (e, b) => ({ buy: false, ...read(b) }) }
    ],
    rejectClose: false
  });
  if (!choice) return;
  if (choice.buy) {
    const total = choice.unitPrice * choice.quantity;
    if (total > 0 && !(await pay(actor, total))) return;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p>${fmt("ASOIAF.Inventory.bought", { name: actor.name, quantity: choice.quantity, item: item.name, price: formatCoins(total) })}</p>`
    });
  }
  if (STACKING_TYPES.includes(data.type)) {
    data.system.quantity = choice.quantity;
    return addToInventory(actor, data);
  }
  return actor.createEmbeddedDocuments("Item", Array.from({ length: choice.quantity }, () => foundry.utils.deepClone(data)));
}
