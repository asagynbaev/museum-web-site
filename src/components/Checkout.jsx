import { CalendarDays, ChevronLeft, ChevronRight, CircleCheck, CircleX, Minus, Plus, Smartphone, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { useLang } from '../i18n/LanguageProvider.jsx';
import { api } from '../lib/api.js';
import { formatEntry, formatSlot, parseDay } from '../lib/visit.js';
import './Checkout.css';

const money = (value, lang) =>
  new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ru-RU').format(value);

const clock = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Покупка билета: сеанс → корзина → QR → билет. Всё состояние живёт в `useCheckout`,
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
          <X size={20} strokeWidth={1.5} aria-hidden />
        </button>

        <div className="co-eyebrow">{c.eyebrow}</div>

        {step === 'when' && <WhenStep checkout={checkout} c={c} titleId={titleId} />}
        {step === 'cart' && <CartStep checkout={checkout} c={c} lang={lang} titleId={titleId} />}
        {step === 'qr' && <QrStep checkout={checkout} c={c} lang={lang} titleId={titleId} />}
        {step === 'done' && <DoneStep checkout={checkout} c={c} lang={lang} titleId={titleId} />}
        {step === 'error' && <ErrorStep checkout={checkout} c={c} titleId={titleId} />}
      </div>
    </div>
  );
}

/* ── Шаг 1: дата и час входа ──────────────────────────────────────────── */

const SELLING = new Set(['open', 'few']);
const monthKey = (date) => date.slice(0, 7);

/** Сетка месяца с понедельника: null — пустые клетки до первого числа. */
function monthGrid(key) {
  const [y, m] = key.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(`${key}-${String(d).padStart(2, '0')}`);
  return cells;
}

function WhenStep({ checkout, c, titleId }) {
  const { days, scheduleFailed, date, pickDate, slots, slot, setSlot, toCart, error } = checkout;

  const byDate = useMemo(() => new Map((days || []).map((d) => [d.date, d])), [days]);
  const months = useMemo(() => [...new Set((days || []).map((d) => monthKey(d.date)))], [days]);

  // Какой месяц открыт в календаре — по умолчанию месяц выбранного дня.
  const [view, setView] = useState(null);
  const current = view && months.includes(view) ? view : date ? monthKey(date) : months[0];
  const at = months.indexOf(current);

  return (
    <div className="co-step">
      <h3 className="co-title" id={titleId}>
        {c.whenTitle}
      </h3>
      <p className="co-sub">{c.whenHint}</p>

      {error && <div className="co-alert">{c.errors[error] || c.errors.create}</div>}

      {!days &&
        (scheduleFailed ? (
          <div className="co-alert">{c.errors.schedule}</div>
        ) : (
          <div className="co-skeleton co-skeleton-cal" aria-hidden="true" />
        ))}

      {days && current && (
        <div className="co-cal">
          <div className="co-cal-head">
            <button
              type="button"
              className="co-cal-nav"
              onClick={() => setView(months[at - 1])}
              disabled={at <= 0}
              aria-label={c.prevMonth}
            >
              <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
            </button>
            <div className="co-cal-month" aria-live="polite">
              {c.months[Number(current.slice(5, 7)) - 1]} {current.slice(0, 4)}
            </div>
            <button
              type="button"
              className="co-cal-nav"
              onClick={() => setView(months[at + 1])}
              disabled={at >= months.length - 1}
              aria-label={c.nextMonth}
            >
              <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
            </button>
          </div>

          <div className="co-cal-grid" role="group" aria-label={c.dateLabel}>
            {c.weekdaysShort.map((wd) => (
              <span className="co-cal-wd" key={wd} aria-hidden="true">
                {wd}
              </span>
            ))}
            {monthGrid(current).map((d, i) => {
              if (!d) return <span key={`pad-${i}`} />;
              const info = byDate.get(d);
              const status = info?.status ?? 'out';
              const selling = SELLING.has(status);
              const { d: dayNum, weekday } = parseDay(d);
              return (
                <button
                  key={d}
                  type="button"
                  className={`co-cal-day is-${status}${d === date ? ' on' : ''}`}
                  disabled={!selling}
                  aria-pressed={d === date}
                  aria-label={`${dayNum} ${c.monthsOf[Number(d.slice(5, 7)) - 1]}, ${c.weekdays[weekday]}${
                    status === 'full' ? ` — ${c.slotFull}` : ''
                  }`}
                  onClick={() => pickDate(d)}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {days && (
        <div className="co-slots-wrap">
          <div className="co-label">{c.timeLabel}</div>
          {!date && <p className="co-sub">{c.pickDate}</p>}
          {date && !slots && <div className="co-skeleton co-skeleton-slots" aria-hidden="true" />}
          {date && slots && slots.length === 0 && <p className="co-sub">{c.noSlots}</p>}
          {date && slots && slots.length > 0 && (
            <div className="co-slots" role="group" aria-label={c.timeLabel}>
              {slots.map((x) => {
                const selling = SELLING.has(x.status);
                const note =
                  x.status === 'few'
                    ? c.slotFew.replace('{n}', x.remaining)
                    : x.status === 'full'
                      ? c.slotFull
                      : x.status === 'past'
                        ? c.slotPast
                        : c.slotOpen;
                return (
                  <button
                    key={x.slot}
                    type="button"
                    className={`co-slot is-${x.status}${x.slot === slot ? ' on' : ''}`}
                    disabled={!selling}
                    aria-pressed={x.slot === slot}
                    onClick={() => setSlot(x.slot)}
                  >
                    <strong>{x.time}</strong>
                    <small>{note}</small>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <button className="co-cta" type="button" onClick={toCart} disabled={!slot}>
        {c.next}
      </button>
    </div>
  );
}

/* ── Шаг 2: корзина ───────────────────────────────────────────────────── */

function CartStep({ checkout, c, lang, titleId }) {
  const {
    tariffs,
    tariffsFailed,
    qty,
    setTariffQty,
    count,
    total,
    email,
    setEmail,
    submit,
    busy,
    error,
    slot,
    slotInfo,
    seatsLeft,
    toWhen,
  } = checkout;

  const emailValid = EMAIL_RE.test(email.trim());
  // seatsLeft < 0 — человек выбрал больше, чем осталось в сеансе (например,
  // сменил время на более занятое). Покупать так нельзя, пусть уберёт лишних.
  const overbooked = Boolean(slotInfo) && seatsLeft < 0;
  const canSubmit = count > 0 && emailValid && !busy && !overbooked;

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

      <div className="co-visit">
        <CalendarDays size={16} strokeWidth={1.5} aria-hidden />
        <div>
          <span>{c.visitLabel}</span>
          <strong>{formatSlot(slot, c)}</strong>
        </div>
        <button className="co-visit-change" type="button" onClick={toWhen}>
          {c.change}
        </button>
      </div>

      <div className="co-rows">
        {/* Без прайса покупать нечего: пока он едет — скелетон, если не доехал — текст. */}
        {tariffs.length === 0 &&
          (tariffsFailed ? (
            <div className="co-alert co-alert-row">{c.errors.unavailable}</div>
          ) : (
            <div className="co-skeleton" aria-hidden="true" />
          ))}

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
                  <Minus size={14} strokeWidth={1.75} aria-hidden />
                </button>
                <span aria-live="polite">{n}</span>
                <button
                  type="button"
                  onClick={() => setTariffQty(tariff.id, n + 1)}
                  disabled={n >= tariff.maxQty || (slotInfo && seatsLeft < (tariff.seats || 1))}
                  aria-label={`${c.plus} · ${c.tariffs[tariff.id]}`}
                >
                  <Plus size={14} strokeWidth={1.75} aria-hidden />
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

      {slotInfo && (overbooked || slotInfo.status === 'few') && (
        <div className={overbooked ? 'co-alert' : 'co-note'}>
          {c.seatsLeft.replace('{n}', slotInfo.remaining)}
        </div>
      )}

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

/* ── Шаг 3: QR и ожидание оплаты ──────────────────────────────────────── */

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
        <Smartphone size={16} strokeWidth={1.5} aria-hidden />
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

/* ── Шаг 4: билет куплен ──────────────────────────────────────────────── */

function DoneStep({ checkout, c, lang, titleId }) {
  const { order, close } = checkout;

  return (
    <div className="co-step co-done">
      <div className="co-check" aria-hidden="true">
        <CircleCheck size={48} strokeWidth={1.25} />
      </div>

      <h3 className="co-title" id={titleId}>
        {c.doneTitle}
      </h3>
      <p className="co-sub">{c.doneHint.replace('{email}', order.email)}</p>

      <div className="co-ticket">
        <div className="co-ticket-label">{c.ticketCode}</div>
        <div className="co-ticket-code">{order.ticketCode}</div>
        {order.slot && (
          <div className="co-ticket-visit">
            <strong>{formatSlot(order.slot, c)}</strong>
            <span>{formatEntry(order.entryFrom, order.entryUntil, c)}</span>
          </div>
        )}
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
        <CircleX size={48} strokeWidth={1.25} />
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
