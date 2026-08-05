/**
 * Тонкий клиент билетного API. В dev Vite проксирует /api на локальный сервер,
 * в проде сайт и API стоят за одним nginx — поэтому путь всегда относительный.
 */

const BASE = import.meta.env.VITE_API_URL ?? '';

/** Ошибка с текстом, который уже можно показать человеку. */
export class ApiError extends Error {
  constructor(message, { code = 'error', status = 0 } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (cause.name === 'AbortError') throw cause;
    throw new ApiError('network', { code: 'network' });
  }

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(payload?.message || `HTTP ${res.status}`, {
      code: payload?.error || 'error',
      status: res.status,
    });
  }

  return payload;
}

export const api = {
  tariffs: (signal) => request('/tariffs', { signal }).then((r) => r.tariffs),

  createOrder: ({ items, email, lang }) =>
    request('/orders', { method: 'POST', body: { items, email, lang } }).then((r) => r.order),

  getOrder: (id, signal) => request(`/orders/${id}`, { signal }).then((r) => r.order),

  cancelOrder: (id) => request(`/orders/${id}/cancel`, { method: 'POST' }).then((r) => r.order),

  /** Проверка билета по коду — сюда ведёт QR из письма. */
  ticket: (code, signal) =>
    request(`/tickets/${encodeURIComponent(code)}`, { signal }).then((r) => r.ticket),

  qrUrl: (id) => `${BASE}/api/orders/${id}/qr.svg`,
};
