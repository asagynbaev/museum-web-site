import { useCallback, useEffect, useMemo, useState } from 'react';

import { api, ApiError } from '../lib/api.js';

const RESUME_KEY = 'aim-order';

/** Пока платёж не завершён — спрашиваем сервер часто, потом реже. */
const POLL_FAST_MS = 2000;
const POLL_SLOW_MS = 5000;
const POLL_SLOWDOWN_AFTER_MS = 90_000;

const OPEN = new Set(['pending', 'processing']);
const isOpen = (order) => Boolean(order) && OPEN.has(order.status);

/**
 * Состояние покупки билета от корзины до оплаченного билета.
 *
 * Шаги: cart → qr → done, плюс error как отдельная ветка.
 * У KICB нет вебхуков (см. доку, раздел 3.2), поэтому статус узнаём опросом —
 * сервер сам ходит в банк, а мы опрашиваем сервер.
 */
export function useCheckout(lang) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('cart');
  const [tariffs, setTariffs] = useState([]);
  const [tariffsFailed, setTariffsFailed] = useState(false);
  const [qty, setQty] = useState({});
  const [email, setEmail] = useState('');
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  // Прайс нужен и закрытой витрине (блок «Билеты»), поэтому грузим сразу.
  useEffect(() => {
    const ctrl = new AbortController();
    api
      .tariffs(ctrl.signal)
      .then(setTariffs)
      .catch((err) => {
        // Витрина переживёт — покажет прочерки вместо цен. А вот кассе
        // без прайса делать нечего: там об этом надо сказать словами.
        if (err.name !== 'AbortError') setTariffsFailed(true);
      });
    return () => ctrl.abort();
  }, []);

  const total = useMemo(
    () => tariffs.reduce((sum, t) => sum + (qty[t.id] || 0) * t.price, 0),
    [tariffs, qty]
  );
  const count = useMemo(() => Object.values(qty).reduce((a, b) => a + b, 0), [qty]);

  const setTariffQty = useCallback((id, next) => {
    setQty((prev) => {
      if (next <= 0) {
        const rest = { ...prev };
        delete rest[id];
        return rest;
      }
      return { ...prev, [id]: next };
    });
  }, []);

  // ── Опрос статуса ────────────────────────────────────────────────────────
  const orderId = isOpen(order) ? order.id : null;

  useEffect(() => {
    if (!orderId) return undefined;

    const ctrl = new AbortController();
    let timer;
    let stopped = false;
    const startedAt = Date.now();

    const poll = async () => {
      // Во вкладке в фоне опрашивать бессмысленно — продолжим на возврате.
      if (document.hidden) return schedule();

      try {
        const fresh = await api.getOrder(orderId, ctrl.signal);
        if (stopped) return undefined;

        setOrder(fresh);

        if (fresh.status === 'paid') {
          setStep('done');
          // Человек мог закрыть окно и уйти платить в приложение банка —
          // возвращаем его к билету, как только деньги дошли.
          setOpen(true);
          sessionStorage.removeItem(RESUME_KEY);
          return undefined;
        }
        if (!OPEN.has(fresh.status)) {
          setStep('error');
          setError(fresh.status === 'expired' ? 'expired' : 'declined');
          sessionStorage.removeItem(RESUME_KEY);
          return undefined;
        }
      } catch (err) {
        // Сеть моргнула — не рушим экран, просто пробуем ещё раз.
        if (err.name === 'AbortError' || stopped) return undefined;
        if (err instanceof ApiError && err.status === 404) {
          setStep('error');
          setError('lost');
          sessionStorage.removeItem(RESUME_KEY);
          return undefined;
        }
      }

      return schedule();
    };

    function schedule() {
      const elapsed = Date.now() - startedAt;
      timer = setTimeout(poll, elapsed > POLL_SLOWDOWN_AFTER_MS ? POLL_SLOW_MS : POLL_FAST_MS);
      return undefined;
    }

    const onVisible = () => {
      if (!document.hidden && !stopped) {
        clearTimeout(timer);
        poll();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    timer = setTimeout(poll, POLL_FAST_MS);

    return () => {
      stopped = true;
      clearTimeout(timer);
      ctrl.abort();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [orderId]);

  // Тикающие часы для обратного отсчёта жизни QR.
  useEffect(() => {
    if (!orderId) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [orderId]);

  const secondsLeft = order?.expiresAt ? Math.max(0, Math.round((order.expiresAt - now) / 1000)) : 0;

  // ── Восстановление после перезагрузки страницы ──────────────────────────
  useEffect(() => {
    const saved = sessionStorage.getItem(RESUME_KEY);
    if (!saved) return;

    api
      .getOrder(saved)
      .then((fresh) => {
        if (isOpen(fresh)) {
          setOrder(fresh);
          setStep('qr');
          setOpen(true);
        } else {
          sessionStorage.removeItem(RESUME_KEY);
        }
      })
      .catch(() => sessionStorage.removeItem(RESUME_KEY));
  }, []);

  // ── Действия ─────────────────────────────────────────────────────────────
  const openCheckout = useCallback(() => {
    setOpen(true);
    if (step === 'cart' && !order) setError(null);
  }, [step, order]);

  const submit = useCallback(async () => {
    if (busy || count === 0) return;

    setBusy(true);
    setError(null);
    try {
      const items = Object.entries(qty).map(([tariff, q]) => ({ tariff, qty: q }));
      const fresh = await api.createOrder({ items, email, lang });
      sessionStorage.setItem(RESUME_KEY, fresh.id);
      setOrder(fresh);
      setNow(Date.now());
      setStep('qr');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'network') setError('network');
      else if (err instanceof ApiError && err.code === 'bank_unavailable') setError('bank');
      else if (err instanceof ApiError && err.status === 429) setError('throttled');
      else setError('create');
    } finally {
      setBusy(false);
    }
  }, [busy, count, qty, email, lang]);

  /** Возврат к корзине: незакрытый заказ гасим, чтобы QR не жил без дела. */
  const reset = useCallback(() => {
    if (isOpen(order)) api.cancelOrder(order.id).catch(() => {});
    sessionStorage.removeItem(RESUME_KEY);
    setOrder(null);
    setError(null);
    setStep('cart');
  }, [order]);

  const close = useCallback(() => {
    setOpen(false);
    // Оплаченный заказ после закрытия окна сбрасываем — иначе при следующем
    // открытии человек увидит чужой прошлый билет вместо корзины.
    if (step === 'done') {
      setOrder(null);
      setQty({});
      setStep('cart');
    }
  }, [step]);

  return {
    open,
    step,
    tariffs,
    tariffsFailed,
    qty,
    setTariffQty,
    count,
    total,
    email,
    setEmail,
    order,
    busy,
    error,
    secondsLeft,
    openCheckout,
    submit,
    reset,
    close,
  };
}
