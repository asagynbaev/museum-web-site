import { useEffect, useState } from 'react';

import { Logo } from './Logo.jsx';
import { useLang } from '../i18n/LanguageProvider.jsx';
import { ApiError, api } from '../lib/api.js';
import './TicketPage.css';

/**
 * Экран проверки билета: сюда ведёт QR из письма (`/ticket/AIM-XXXX-XXXX`).
 * Открывается вместо лендинга — контролёру на входе не нужен ни прелоадер,
 * ни тяжёлые медиа, ему нужен ответ «пускать или нет» за секунду.
 */
export function TicketPage({ code }) {
  const { t, lang } = useLang();
  const s = t.ticket;
  const [state, setState] = useState({ status: 'loading', ticket: null });

  useEffect(() => {
    const ctrl = new AbortController();

    api
      .ticket(code, ctrl.signal)
      .then((ticket) => setState({ status: 'valid', ticket }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        // 404 — билета нет или он не оплачен; всё остальное — связь.
        const status = err instanceof ApiError && err.status === 404 ? 'unknown' : 'error';
        setState({ status, ticket: null });
      });

    return () => ctrl.abort();
  }, [code]);

  const { status, ticket } = state;

  return (
    <main className="tk">
      <a className="tk-brand" href="/" aria-label="AI Museum">
        <Logo />
        <span>{t.brandSub}</span>
      </a>

      <div className={`tk-card is-${status}`}>
        {status === 'loading' && (
          <>
            <div className="tk-spinner" aria-hidden="true" />
            <p className="tk-status" aria-live="polite">
              {s.checking}
            </p>
          </>
        )}

        {status === 'valid' && (
          <>
            <Mark ok />
            <div className="tk-eyebrow">{s.eyebrow}</div>
            <h1 className="tk-title">{s.validTitle}</h1>

            <div className="tk-code">{ticket.code}</div>

            <dl className="tk-rows">
              {ticket.items.map((item) => (
                <div className="tk-row" key={item.tariff}>
                  <dt>{t.checkout.tariffs[item.tariff] || item.tariff}</dt>
                  <dd>× {item.qty}</dd>
                </div>
              ))}
              <div className="tk-row">
                <dt>{s.seats}</dt>
                <dd>{ticket.seats}</dd>
              </div>
              <div className="tk-row">
                <dt>{s.paid}</dt>
                <dd>
                  {new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ru-RU').format(ticket.amount)}{' '}
                  {t.checkout.som}
                </dd>
              </div>
              <div className="tk-row">
                <dt>{s.paidAt}</dt>
                <dd>{formatDate(ticket.paidAt, lang)}</dd>
              </div>
            </dl>

            <p className="tk-note">{s.validNote}</p>
          </>
        )}

        {status !== 'loading' && status !== 'valid' && (
          <>
            <Mark />
            <div className="tk-eyebrow">{s.eyebrow}</div>
            <h1 className="tk-title">{status === 'unknown' ? s.unknownTitle : s.errorTitle}</h1>
            <p className="tk-note">{status === 'unknown' ? s.unknownNote : s.errorNote}</p>
            <div className="tk-code tk-code-dim">{code}</div>
          </>
        )}
      </div>

      <a className="tk-home" href="/">
        {s.toSite}
      </a>
    </main>
  );
}

function Mark({ ok = false }) {
  return (
    <div className={`tk-mark${ok ? ' ok' : ' no'}`} aria-hidden="true">
      <svg viewBox="0 0 44 44" width="44" height="44">
        <circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".35" />
        <path
          d={ok ? 'M13 22.5l6 6 12-13' : 'M16 16l12 12M28 16L16 28'}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function formatDate(ms, lang) {
  if (!ms) return '—';
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}
