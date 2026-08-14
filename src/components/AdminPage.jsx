import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, api } from '../lib/api.js';
import './AdminPage.css';

/**
 * Служебная страница `/admin`: лента заказов и их статусы оплаты.
 * Интерфейс намеренно только на русском — это внутренний инструмент кассы,
 * а не часть сайта, и тащить его в три языка ни к чему.
 *
 * Пароль — ADMIN_TOKEN из server/.env. Держим его в sessionStorage: закрыл
 * вкладку — вход слетел.
 */

const TOKEN_KEY = 'aim-admin-token';
const REFRESH_MS = 10_000;

const STATUSES = [
  { id: '', label: 'Все' },
  { id: 'pending', label: 'Ждут оплаты' },
  { id: 'processing', label: 'В обработке' },
  { id: 'paid', label: 'Оплачены' },
  { id: 'failed', label: 'Отклонены' },
  { id: 'expired', label: 'Просрочены' },
  { id: 'cancelled', label: 'Отменены' },
];

const STATUS_LABEL = {
  pending: 'ждёт оплаты',
  processing: 'обрабатывается',
  paid: 'оплачен',
  failed: 'отклонён',
  expired: 'просрочен',
  cancelled: 'отменён',
};

const TARIFF_LABEL = { adult: 'взрослый', reduced: 'льготный', family: 'семейный' };

const money = (v) => new Intl.NumberFormat('ru-RU').format(v);

const when = (ms) =>
  ms
    ? new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(ms))
    : '—';

export function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
  const [authed, setAuthed] = useState(false);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState({ orders: [], stats: null });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(null);
  const [notice, setNotice] = useState(null);

  // Фильтры меняются чаще, чем успевает отработать автообновление, — держим их
  // в ref, чтобы таймер всегда читал свежие значения и не тянул за собой рестарт.
  const filters = useRef({ status, query });
  filters.current = { status, query };

  const load = useCallback(
    async (signal) => {
      if (!token) return;
      setLoading(true);
      try {
        const fresh = await api.admin.orders({
          token,
          status: filters.current.status,
          q: filters.current.query,
          signal,
        });
        setData(fresh);
        setAuthed(true);
        setError(null);
      } catch (err) {
        if (err.name === 'AbortError') return;
        if (err instanceof ApiError && err.status === 401) {
          setAuthed(false);
          sessionStorage.removeItem(TOKEN_KEY);
          setError('Неверный пароль');
        } else {
          setError(err instanceof ApiError ? err.message : 'Нет связи с сервером');
        }
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  // Первый заход и смена фильтров.
  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load, status, query]);

  // Автообновление: заказы живут минутами, десяти секунд достаточно.
  useEffect(() => {
    if (!authed) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [authed, load]);

  /** Обе кнопки строки устроены одинаково: дёрнуть ручку и вклеить ответ. */
  const act = async (id, run, fallbackError) => {
    setSyncing(id);
    setNotice(null);
    try {
      const { order } = await run();
      setData((prev) => ({
        ...prev,
        orders: prev.orders.map((o) => (o.id === order.id ? order : o)),
      }));
      return order;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallbackError);
      return null;
    } finally {
      setSyncing(null);
    }
  };

  const syncOne = (id) => act(id, () => api.admin.sync(id, token), 'Не удалось спросить банк');

  const resendOne = async (id) => {
    const order = await act(id, () => api.admin.resend(id, token), 'Не удалось отправить письмо');
    if (order) setNotice(`Письмо отправлено на ${order.email}`);
  };

  if (!authed) {
    return (
      <Login
        error={error}
        onSubmit={(value) => {
          sessionStorage.setItem(TOKEN_KEY, value);
          setError(null);
          setToken(value);
        }}
      />
    );
  }

  const { orders, stats } = data;

  return (
    <main className="ad">
      <header className="ad-head">
        <div>
          <div className="ad-eyebrow">AI Museum · касса</div>
          <h1 className="ad-title">Заказы</h1>
        </div>
        <button
          className="ad-btn"
          type="button"
          onClick={() => {
            sessionStorage.removeItem(TOKEN_KEY);
            setToken('');
            setAuthed(false);
          }}
        >
          Выйти
        </button>
      </header>

      {stats && (
        <div className="ad-stats">
          <Stat label="Оплачено сегодня" value={`${stats.today.paid}`} />
          <Stat label="Выручка сегодня" value={`${money(stats.today.amount)} сом`} />
          <Stat label="Мест продано" value={`${stats.today.seats}`} />
          <Stat label="Ждут оплаты" value={`${stats.byStatus.pending || 0}`} />
          <Stat label="Всего оплачено" value={`${stats.byStatus.paid || 0}`} />
        </div>
      )}

      <div className="ad-controls">
        <div className="ad-filters">
          {STATUSES.map((s) => (
            <button
              key={s.id || 'all'}
              type="button"
              className={`ad-chip${status === s.id ? ' on' : ''}`}
              onClick={() => setStatus(s.id)}
              disabled={Boolean(query)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <input
          className="ad-search"
          type="search"
          placeholder="Номер заказа, код билета или почта"
          value={query}
          onChange={(e) => setQuery(e.target.value.trim())}
        />
      </div>

      {error && <div className="ad-error">{error}</div>}
      {notice && <div className="ad-notice">{notice}</div>}

      <div className="ad-table" role="table">
        <div className="ad-row ad-row-head" role="row">
          <span>Заказ</span>
          <span>Создан</span>
          <span>Состав</span>
          <span>Сумма</span>
          <span>Статус</span>
          <span>Билет</span>
          <span />
        </div>

        {orders.length === 0 && !loading && <div className="ad-empty">Заказов нет</div>}

        {orders.map((o) => (
          <div className="ad-row" role="row" key={o.id}>
            <span className="ad-id" title={o.id}>
              {o.id}
              <em>{o.email}</em>
            </span>
            <span className="ad-dim">{when(o.createdAt)}</span>
            <span className="ad-items">
              {o.items.map((i) => `${TARIFF_LABEL[i.tariff] || i.tariff} × ${i.qty}`).join(', ')}
            </span>
            <span className="ad-amount">{money(o.amount)} сом</span>
            <span>
              <b className={`ad-badge is-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</b>
              {o.lastError && (
                <em className="ad-err" title={o.lastError}>
                  {o.lastError}
                </em>
              )}
            </span>
            <span className="ad-ticket">
              {o.ticketCode ? (
                <>
                  <a href={`/ticket/${o.ticketCode}`} target="_blank" rel="noopener noreferrer">
                    {o.ticketCode}
                  </a>
                  <em className={o.mailSent ? 'ad-dim' : 'ad-err'}>
                    {o.mailSent ? 'письмо ушло' : `письмо не ушло (попыток: ${o.mailAttempts})`}
                  </em>
                </>
              ) : (
                <span className="ad-dim">—</span>
              )}
            </span>
            <span className="ad-actions">
              <button
                className="ad-btn sm"
                type="button"
                onClick={() => syncOne(o.id)}
                disabled={syncing === o.id}
              >
                {syncing === o.id ? '…' : 'Спросить банк'}
              </button>
              {o.status === 'paid' && (
                <button
                  className="ad-btn sm"
                  type="button"
                  onClick={() => resendOne(o.id)}
                  disabled={syncing === o.id}
                  title="Отправить письмо с билетом ещё раз"
                >
                  Письмо
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      <footer className="ad-foot">
        Обновляется само раз в 10 секунд{loading ? ' · обновляю…' : ''}. Статус приходит из KICB:
        сервер опрашивает банк, вебхуков у него нет.
      </footer>
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="ad-stat">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Login({ error, onSubmit }) {
  const [value, setValue] = useState('');

  return (
    <main className="ad ad-login">
      <form
        className="ad-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSubmit(value.trim());
        }}
      >
        <div className="ad-eyebrow">AI Museum · касса</div>
        <h1 className="ad-title">Вход</h1>
        <label className="ad-field">
          <span>Пароль</span>
          <input
            type="password"
            autoComplete="current-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </label>
        {error && <div className="ad-error">{error}</div>}
        <button className="ad-btn wide" type="submit">
          Войти
        </button>
      </form>
    </main>
  );
}
