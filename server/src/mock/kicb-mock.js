/**
 * Мок KICB Terminal API — чтобы разрабатывать и показывать оплату, пока банк
 * не выдал доступ. Повторяет контракт из KicbTerminalApi_v1.7 буквально:
 * те же пути, те же поля, те же коды из раздела 5.
 *
 *   npm run mock          # слушает 8788
 *
 * Плюс к спеке: qrLink ведёт на страницу «телефон с приложением банка».
 * Отсканируйте QR с сайта телефоном — откроется страница с кнопкой «Оплатить»,
 * и сайт увидит оплату так же, как увидел бы боевую.
 * Чтобы телефон достучался, поднимите мок на 0.0.0.0 и укажите LAN-адрес:
 *   MOCK_HOST=0.0.0.0 MOCK_PUBLIC_URL=http://192.168.0.10:8788 npm run mock
 */
import Fastify from 'fastify';

const PORT = Number(process.env.MOCK_PORT || 8788);
const HOST = process.env.MOCK_HOST || '127.0.0.1';
const PUBLIC_URL = (process.env.MOCK_PUBLIC_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
const LOGIN = process.env.KICB_LOGIN || 'test';
const PASSWORD = process.env.KICB_PASSWORD || 'testpassword';
// Через сколько мс «оплатить» QR самому, без нажатия кнопки. 0 — не платить.
const AUTOPAY_MS = Number(process.env.MOCK_AUTOPAY_MS || 0);
// Задержка между «деньги ушли» и финальным Success — чтобы было видно статус 4.
const SETTLE_MS = Number(process.env.MOCK_SETTLE_MS || 1800);

const STATUS = { NOT_FOUND: 0, INITIALIZE: 1, SUCCESS: 2, FAILED: 3, IN_PROGRESS: 4 };

const app = Fastify({ logger: { level: 'warn' } });
// Страница «оплаты» шлёт обычную HTML-форму, а не JSON.
await app.register(import('@fastify/formbody'));

/** @type {Map<string, {id, amount, currency, status, createdAt, description}>} */
const qrs = new Map();
const tokens = new Set();

const ok = (data) => (data === undefined ? { message: 'Ok', code: 0 } : { data, message: 'Ok', code: 0 });

function fail(reply, httpStatus, code, message) {
  return reply.code(httpStatus).send({ message, code });
}

/** Bearer-гейт: без валидного токена банк отдал бы 401. */
function requireToken(req, reply) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !tokens.has(token)) {
    reply.code(401).send({ message: 'Unauthorized', code: 1 });
    return false;
  }
  return true;
}

function settle(id, success) {
  const qr = qrs.get(id);
  if (!qr || qr.status !== STATUS.INITIALIZE) return false;

  qr.status = STATUS.IN_PROGRESS;
  setTimeout(() => {
    const current = qrs.get(id);
    if (!current || current.status !== STATUS.IN_PROGRESS) return;
    current.status = success ? STATUS.SUCCESS : STATUS.FAILED;
    current.description = success ? 'Оплачено (мок)' : 'Отклонено (мок)';
    app.log.warn(`[mock] ${id} → ${success ? 'Success' : 'Failed'}`);
  }, SETTLE_MS);

  return true;
}

// ── 2.1 Авторизация ───────────────────────────────────────────────────────
app.post('/oauth2/token', async (req, reply) => {
  const { login, password } = req.body || {};
  if (login !== LOGIN || password !== PASSWORD) {
    return fail(reply, 400, 1, 'BadRequest: неверный логин или пароль');
  }
  const accessToken = `mock.${Math.random().toString(36).slice(2)}.${Date.now().toString(36)}`;
  tokens.add(accessToken);
  return { accessToken, tokenType: 'Bearer', expiresIn: '3600' };
});

// ── 3.1 GetLink ───────────────────────────────────────────────────────────
app.post('/Terminal/Qr/GetLink', async (req, reply) => {
  if (!requireToken(req, reply)) return;

  const { id, terminalId, amount } = req.body || {};
  if (!id || String(id).length > 36) return fail(reply, 400, 1, 'BadRequest: некорректный id');
  if (!terminalId) return fail(reply, 404, 2, 'DeviceNotFound: не передан terminalId');
  if (typeof amount !== 'number' || amount < 0) {
    return fail(reply, 404, 3, 'AmountForDeviceNotFound: некорректная сумма');
  }

  const qr = {
    id: String(id),
    amount,
    currency: 'KGS',
    status: STATUS.INITIALIZE,
    description: null,
    createdAt: Date.now(),
  };
  qrs.set(qr.id, qr);

  if (AUTOPAY_MS > 0) setTimeout(() => settle(qr.id, true), AUTOPAY_MS);

  app.log.warn(`[mock] GetLink ${qr.id} на ${amount} KGS → ${PUBLIC_URL}/pay/${qr.id}`);

  return ok({
    id: qr.id,
    amount: qr.amount,
    currency: qr.currency,
    qrLink: `${PUBLIC_URL}/pay/${encodeURIComponent(qr.id)}`,
  });
});

// ── 3.2 CheckStatus ───────────────────────────────────────────────────────
app.get('/Terminal/Qr/CheckStatus', async (req, reply) => {
  if (!requireToken(req, reply)) return;

  const id = req.query?.pQrId;
  const qr = qrs.get(String(id));
  if (!qr) return fail(reply, 404, 4, 'QrDataNotFound: QR с таким id не найден');

  return ok({ id: qr.id, status: qr.status, amount: qr.amount, description: qr.description });
});

// ── 3.3 ChangeStatus ──────────────────────────────────────────────────────
app.post('/Terminal/Qr/ChangeStatus', async (req, reply) => {
  if (!requireToken(req, reply)) return;

  const { id, status, message } = req.body || {};
  const qr = qrs.get(String(id));
  if (!qr) return fail(reply, 404, 4, 'QrDataNotFound: QR с таким id не найден');
  if (!Object.values(STATUS).includes(Number(status))) {
    return fail(reply, 400, 1, 'BadRequest: недопустимый статус');
  }

  qr.status = Number(status);
  qr.description = message ?? qr.description;
  return ok();
});

// ── 3.4 AbortPayment ──────────────────────────────────────────────────────
app.post('/Terminal/Qr/AbortPayment', async (req, reply) => {
  if (!requireToken(req, reply)) return;

  const id = String(req.query?.pQrId);
  const qr = qrs.get(id);
  if (!qr) return fail(reply, 404, 4, 'QrDataNotFound: QR с таким id не найден');
  if (qr.status === STATUS.SUCCESS) return fail(reply, 400, 1, 'BadRequest: QR уже оплачен');

  qr.status = STATUS.FAILED;
  qr.description = 'Отменён кассой (мок)';
  return ok();
});

// ── Дальше — только для разработки, в боевом API этого нет ────────────────

const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replaceAll(/[&<>"']/g, (c) => ESCAPE[c]);

function page(title, body) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;
       background:#141009;color:#ebe1cd;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .card{width:100%;max-width:380px;border:1px solid rgba(235,225,205,.14);border-radius:14px;
        padding:28px;background:#1b1610;text-align:center}
  .tag{font-size:.66rem;letter-spacing:.2em;text-transform:uppercase;color:#e2bd84}
  .amt{font-size:2.4rem;font-weight:700;margin:14px 0 4px;letter-spacing:-.02em}
  .id{font-size:.72rem;color:rgba(235,225,205,.4);word-break:break-all;margin-bottom:24px}
  button{width:100%;padding:15px;border:0;border-radius:8px;font-size:.95rem;font-weight:600;
         cursor:pointer;margin-top:10px}
  .pay{background:#c99a5b;color:#1a1206}
  .no{background:transparent;color:rgba(235,225,205,.55);border:1px solid rgba(235,225,205,.18)}
  .note{margin-top:22px;font-size:.75rem;color:rgba(235,225,205,.35)}
  .big{font-size:1.15rem;font-weight:600;margin:8px 0}
</style></head><body><div class="card">${body}</div></body></html>`;
}

/** Экран «приложение банка»: открывается по ссылке из QR. */
app.get('/pay/:id', async (req, reply) => {
  const id = req.params.id;
  const qr = qrs.get(id);
  reply.type('text/html; charset=utf-8');

  if (!qr) return page('QR не найден', '<div class="tag">Мок KICB</div><p class="big">QR не найден</p>');

  if (qr.status === STATUS.SUCCESS) {
    return page('Оплачено', '<div class="tag">Мок KICB</div><p class="big">Оплачено ✓</p><p class="note">Можно вернуться на сайт</p>');
  }
  if (qr.status === STATUS.FAILED) {
    return page('Отклонено', '<div class="tag">Мок KICB</div><p class="big">Платёж отклонён</p>');
  }
  if (qr.status === STATUS.IN_PROGRESS) {
    return page('Обработка', '<div class="tag">Мок KICB</div><p class="big">Обрабатывается…</p>');
  }

  return page(
    'Оплата',
    `<div class="tag">Мок KICB · терминал</div>
     <div class="amt">${esc(qr.amount)} <span style="font-size:1rem">KGS</span></div>
     <div class="id">${esc(qr.id)}</div>
     <form method="post" action="/pay/${encodeURIComponent(id)}">
       <button class="pay" name="act" value="pay" type="submit">Оплатить</button>
       <button class="no" name="act" value="fail" type="submit">Отклонить</button>
     </form>
     <p class="note">Это заглушка для разработки, деньги не двигаются</p>`
  );
});

app.post('/pay/:id', async (req, reply) => {
  const id = req.params.id;
  const success = (req.body?.act ?? 'pay') !== 'fail';
  settle(id, success);
  return reply.redirect(`/pay/${encodeURIComponent(id)}`, 303);
});

app.get('/mock/qrs', async () => [...qrs.values()]);

await app.listen({ port: PORT, host: HOST });
console.log(`Мок KICB слушает http://${HOST}:${PORT} (ссылки в QR: ${PUBLIC_URL})`);
if (AUTOPAY_MS > 0) console.log(`Автооплата через ${AUTOPAY_MS} мс`);
