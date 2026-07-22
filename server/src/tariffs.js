import { config } from './config.js';

/**
 * Прайс-лист. Единственный источник правды по ценам: клиент присылает только
 * id тарифа и количество, сумму всегда пересчитывает сервер. Названия тарифов
 * живут на фронте в i18n — здесь только деньги и лимиты.
 */
export const TARIFFS = [
  { id: 'adult', price: config.prices.adult, maxQty: 10, seats: 1 },
  { id: 'reduced', price: config.prices.reduced, maxQty: 10, seats: 1 },
  { id: 'family', price: config.prices.family, maxQty: 4, seats: 4 },
];

const byId = new Map(TARIFFS.map((t) => [t.id, t]));

export const CURRENCY = 'KGS';

/** Публичное представление прайса для витрины. */
export function publicTariffs() {
  return TARIFFS.map((t) => ({
    id: t.id,
    price: t.price / 100,
    currency: CURRENCY,
    maxQty: t.maxQty,
    seats: t.seats,
  }));
}

/**
 * Проверяет корзину и считает сумму. Бросает Error с полем `statusCode`,
 * если клиент прислал мусор.
 *
 * @param {Array<{tariff: string, qty: number}>} items
 * @returns {{ items: Array, amount: number, seats: number }} amount — в тыйынах
 */
export function priceCart(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw badRequest('Корзина пуста');
  }

  const seen = new Set();
  const normalised = [];
  let amount = 0;
  let seats = 0;

  for (const raw of items) {
    const tariff = byId.get(raw?.tariff);
    if (!tariff) throw badRequest(`Неизвестный тариф: ${raw?.tariff}`);
    if (seen.has(tariff.id)) throw badRequest(`Тариф ${tariff.id} указан дважды`);
    seen.add(tariff.id);

    const qty = Number(raw.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > tariff.maxQty) {
      throw badRequest(`Некорректное количество для тарифа ${tariff.id}`);
    }

    amount += tariff.price * qty;
    seats += tariff.seats * qty;
    normalised.push({ tariff: tariff.id, qty, price: tariff.price });
  }

  if (amount <= 0) throw badRequest('Сумма заказа должна быть больше нуля');

  return { items: normalised, amount, seats };
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}
