import { useEffect, useId, useRef } from 'react';

import { useLang } from '../i18n/LanguageProvider.jsx';
import { api } from '../lib/api.js';
import './Checkout.css';

const money = (value, lang) =>
  new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ru-RU').format(value);

const clock = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Покупка билета: корзина → QR → билет. Всё состояние живёт в `useCheckout`,
 * здесь только разметка и фокус-ловушка.
 */
export function Checkout({ checkout }) {
  const { t, lang } = useLang();
  const c = t.checkout;
  const panelRef = useRef(null);
  const titleId = useId();

  const { open, step, close } = checkout;

  // `close` пересоздаётся при смене шага, а эффект ниже должен отработать
  // ровно один раз на открытие — иначе фокус вернётся не на ту кнопку.
  const closeRef = useRef(close);
  closeRef.current = close;

  // Пока окно открыто — страница под ним не скроллится, Esc закрывает,
  // Tab не убегает на фон, а после закрытия фокус возвращается туда, откуда пришёл.
  useEffect(() => {
    if (!open) return undefined;

    const previous = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled])'
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [open]);

  // На каждом шаге фокус уводим на саму панель: скринридер прочитает заголовок
  // шага, а Tab дальше пойдёт по содержимому сверху вниз.
  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open, step]);

  if (!open) return null;

  return (
    // Клик мимо панели закрывает окно; для клавиатуры ту же роль играет Esc.
    <div
      className="co-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        className="co-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <button className="co-close" onClick={close} aria-label={c.close}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.4" fill="none" />
          </svg>
        </button>

        <div className="co-eyebrow">{c.eyebrow}</div>

        {step === 'cart' && <CartStep checkout={checkout} c={c} lang={lang} titleId={titleId} />}
        {step === 'qr' && <QrStep checkout={checkout} c={c} lang={lang} titleId={titleId} />}
        {step === 'done' && <DoneStep checkout={checkout} c={c} lang={lang} titleId={titleId} />}
        {step === 'error' && <ErrorStep checkout={checkout} c={c} titleId={titleId} />}
      </div>
    </div>
  );
}

/* ── Шаг 1: корзина ───────────────────────────────────────────────────── */

function CartStep({ checkout, c, lang, titleId }) {
  const { tariffs, qty, setTariffQty, count, total, email, setEmail, submit, busy, error } =
    checkout;

  const emailValid = EMAIL_RE.test(email.trim());
  const canSubmit = count > 0 && emailValid && !busy;

  return (
    <form
      className="co-step"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h3 className="co-title" id={titleId}>
        {c.cartTitle}
      </h3>

      <div className="co-rows">
        {tariffs.length === 0 && <div className="co-skeleton" aria-hidden="true" />}

        {tariffs.map((tariff) => {
          const n = qty[tariff.id] || 0;
          return (
            <div className={`co-row${n > 0 ? ' picked' : ''}`} key={tariff.id}>
              <div className="co-row-text">
                <div className="co-row-name">{c.tariffs[tariff.id]}</div>
                <div className="co-row-price">
                  {money(tariff.price, lang)} {c.som}
                </div>
              </div>

              <div className="co-stepper">
                <button
                  type="button"
                  onClick={() => setTariffQty(tariff.id, n - 1)}
                  disabled={n === 0}
                  aria-label={`${c.minus} · ${c.tariffs[tariff.id]}`}
                >
                  −
                </button>
                <span aria-live="polite">{n}</span>
                <button
                  type="button"
                  onClick={() => setTariffQty(tariff.id, n + 1)}
                  disabled={n >= tariff.maxQty}
                  aria-label={`${c.plus} · ${c.tariffs[tariff.id]}`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <label className="co-field">
        <span>{c.emailLabel}</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={c.emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <small>{c.emailHint}</small>
      </label>

      {error && <div className="co-alert">{c.errors[error] || c.errors.create}</div>}

      <div className="co-total">
        <span>{c.total}</span>
        <strong>
          {money(total, lang)} {c.som}
        </strong>
      </div>

      <button className="co-cta" type="submit" disabled={!canSubmit}>
        {busy ? c.creating : c.pay}
      </button>
    </form>
  );
}

/* ── Шаг 2: QR и ожидание оплаты ──────────────────────────────────────── */

function QrStep({ checkout, c, lang, titleId }) {
  const { order, secondsLeft, reset } = checkout;
  const processing = order.status === 'processing';

  return (
    <div className="co-step">
      <h3 className="co-title" id={titleId}>
        {processing ? c.qrProcessingTitle : c.qrTitle}
      </h3>
      <p className="co-sub">{processing ? c.qrProcessingHint : c.qrHint}</p>

      <div className="co-qr-plate">
        <img className="co-qr" src={api.qrUrl(order.id)} alt={c.qrAlt} width="220" height="220" />
        <span className="co-scan" aria-hidden="true" />
      </div>

      <div className="co-amount">
        {money(order.amount, lang)} <span>{c.som}</span>
      </div>

      <a className="co-openapp" href={order.qrLink} target="_blank" rel="noopener noreferrer">
        {c.openApp}
      </a>

      <div className={`co-status${processing ? ' busy' : ''}`}>
        <span className="co-dot" aria-hidden="true" />
        <span aria-live="polite">{processing ? c.statusProcessing : c.statusWaiting}</span>
      </div>

      <div className="co-timer">
        {c.expiresIn} <strong>{clock(secondsLeft)}</strong>
      </div>

      <button className="co-link" type="button" onClick={reset}>
        {c.cancel}
      </button>
    </div>
  );
}

/* ── Шаг 3: билет куплен ──────────────────────────────────────────────── */

function DoneStep({ checkout, c, lang, titleId }) {
  const { order, close } = checkout;

  return (
    <div className="co-step co-done">
      <div className="co-check" aria-hidden="true">
        <svg viewBox="0 0 44 44" width="44" height="44">
          <circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".35" />
          <path
            d="M13 22.5l6 6 12-13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h3 className="co-title" id={titleId}>
        {c.doneTitle}
      </h3>
      <p className="co-sub">{c.doneHint.replace('{email}', order.email)}</p>

      <div className="co-ticket">
        <div className="co-ticket-label">{c.ticketCode}</div>
        <div className="co-ticket-code">{order.ticketCode}</div>
      </div>

      <div className="co-recap">
        {order.items.map((item) => (
          <div className="co-recap-row" key={item.tariff}>
            <span>
              {c.tariffs[item.tariff]} × {item.qty}
            </span>
            <span>
              {money(item.price * item.qty, lang)} {c.som}
            </span>
          </div>
        ))}
      </div>

      <button className="co-cta" type="button" onClick={close}>
        {c.doneCta}
      </button>
    </div>
  );
}

/* ── Ветка ошибки ─────────────────────────────────────────────────────── */

function ErrorStep({ checkout, c, titleId }) {
  const { error, reset } = checkout;

  return (
    <div className="co-step co-done">
      <div className="co-cross" aria-hidden="true">
        <svg viewBox="0 0 44 44" width="44" height="44">
          <circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".35" />
          <path
            d="M16 16l12 12M28 16L16 28"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <h3 className="co-title" id={titleId}>
        {c.errorTitle}
      </h3>
      <p className="co-sub">{c.errors[error] || c.errors.create}</p>

      <button className="co-cta" type="button" onClick={reset}>
        {c.retry}
      </button>
    </div>
  );
}
