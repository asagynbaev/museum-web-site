import { Mic, MicOff } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';

import { BarsConcierge } from '../concierge/embed/bars-concierge.ts';
import { Logo } from './Logo.jsx';
import { LANGS } from '../i18n/translations.js';
import { useLang } from '../i18n/LanguageProvider.jsx';
import './BarsPage.css';

/**
 * Голосовой гид на `/bars`: 3D-барс и разговор с ним через Gemini Live.
 * Сам барс и разговор — модуль консьержа (`src/concierge`, копия из репозитория
 * ai-concierge, правится там); токен сессии и тулы — его Java-сервер за
 * `/api/live` и `/api/tools` (deploy/nginx.conf). Страница грузится отдельным
 * чанком: three.js и модель на ~20 МБ нужны только здесь.
 */
export default function BarsPage() {
  const { t, lang, setLang } = useLang();
  const s = t.bars;
  const stageRef = useRef(null);
  const userRef = useRef(null);
  const botRef = useRef(null);
  const conciergeRef = useRef(null);
  const [load, setLoad] = useState('loading'); // loading | ready | error
  const [conn, setConn] = useState({ state: 'idle', detail: '' });
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const c = new BarsConcierge({
      stage: stageRef.current,
      userCaption: userRef.current,
      botCaption: botRef.current,
      assetBase: '/concierge',
      lang,
      onState: (state, detail = '') => setConn({ state, detail }),
      onRunning: setRunning,
    });
    conciergeRef.current = c;
    c.ready.then(
      () => setLoad('ready'),
      (err) => {
        console.error('[bars]', err);
        setLoad('error');
      }
    );
    return () => {
      c.dispose();
      conciergeRef.current = null;
    };
    // Барс создаётся один раз; язык дальше меняет setLang().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Язык разговора — язык сайта: смена переоткрывает сессию на новом.
  useEffect(() => {
    void conciergeRef.current?.setLang(lang);
  }, [lang]);

  const toggle = async () => {
    const c = conciergeRef.current;
    if (!c) return;
    if (c.isRunning) {
      c.stop();
      return;
    }
    setStarting(true);
    try {
      await c.start();
    } finally {
      setStarting(false);
    }
  };

  const status = (() => {
    if (load === 'loading') return { text: s.loading, tone: 'muted' };
    if (load === 'error') return { text: s.loadError, tone: 'error' };
    if (conn.state === 'error') {
      const denied = /NotAllowed|Permission|denied/i.test(conn.detail);
      return { text: denied ? s.micDenied : s.error, tone: 'error' };
    }
    if (starting || conn.state === 'connecting') return { text: s.starting, tone: 'muted' };
    if (conn.state === 'reconnecting') return { text: s.reconnecting, tone: 'muted' };
    if (running) return { text: s.listening, tone: 'live' };
    return { text: s.hint, tone: 'muted' };
  })();

  return (
    <main className="bp">
      {/* не <header>: Header.css лендинга стилизует сам тег (fixed по верху) */}
      <div className="bp-top">
        <a className="bp-brand" href="/" aria-label={s.toSite}>
          <Logo />
        </a>
        <span className="bp-langs">
          {LANGS.map((l, i) => (
            <Fragment key={l.code}>
              {i > 0 && <span className="bp-sep"> · </span>}
              <button
                type="button"
                className={`bp-lang${lang === l.code ? ' on' : ''}`}
                aria-pressed={lang === l.code}
                onClick={() => setLang(l.code)}
              >
                {l.label}
              </button>
            </Fragment>
          ))}
        </span>
      </div>

      <section className="bp-intro">
        <p className="bp-eyebrow">{s.eyebrow}</p>
        <h1 className="bp-title">{s.title}</h1>
        <p className="bp-lead">{s.lead}</p>
      </section>

      <div className="bp-stage" ref={stageRef}>
        {load !== 'ready' && (
          <div className={`bp-veil${load === 'error' ? ' failed' : ''}`} aria-hidden>
            <span className="bp-spinner" />
          </div>
        )}
        <div className="bp-captions" aria-live="polite">
          <p className="bp-cap bp-cap-user" ref={userRef} />
          <p className="bp-cap bp-cap-bot" ref={botRef} />
        </div>
      </div>

      <div className="bp-controls">
        <button
          type="button"
          className={`bp-btn${running ? ' on' : ''}`}
          onClick={toggle}
          disabled={load !== 'ready' || starting}
        >
          {running ? <MicOff size={18} strokeWidth={1.75} aria-hidden /> : <Mic size={18} strokeWidth={1.75} aria-hidden />}
          {running ? s.stop : s.start}
        </button>
        <p className={`bp-status ${status.tone}`} role="status">
          {status.text}
        </p>
      </div>
    </main>
  );
}
