import { Mic, MicOff } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';

import { BarsConcierge } from '../concierge/embed/bars-concierge.ts';
import { Logo } from './Logo.jsx';
import { LANGS } from '../i18n/translations.js';
import { useLang } from '../i18n/LanguageProvider.jsx';
import './BarsPage.css';

// Гид — японский барс, поэтому здесь есть и японский. Только на этой странице:
// у остального сайта японских текстов нет, общий язык сайта он не трогает.
const JA = {
  eyebrow: 'ミュージアムのAIガイド',
  title: 'コクロクと話しましょう',
  lead: '展示室・チケット・開館時間について、声で質問してください。',
  start: '会話をはじめる',
  stop: '終了',
  starting: '接続中…',
  loading: 'コクロクが目を覚ましています…',
  loadError: 'コクロクを読み込めませんでした。ページを再読み込みしてください。',
  listening: 'コクロクが聞いています — どうぞ話してください',
  sayName: '話しかけるには「コクロク」と呼んでください',
  tapToWake: '画面をタップして音声をオンにし、「コクロク」と呼んでください',
  reconnecting: '再接続中…',
  micDenied: 'マイクへのアクセスがありません。ブラウザの設定でこのサイトのマイクを許可してください。',
  error: '接続が切れました。もう一度お試しください。',
  toSite: 'ミュージアムのサイトへ',
};
const PAGE_LANGS = [...LANGS, { code: 'ja', label: 'JP' }];

/**
 * Голосовой гид на `/bars`: 3D-барс и разговор с ним через Gemini Live.
 * Сам барс и разговор — модуль консьержа (`src/concierge`, копия из репозитория
 * ai-concierge, правится там); токен сессии и тулы — его Java-сервер за
 * `/api/live` и `/api/tools` (deploy/nginx.conf). Страница грузится отдельным
 * чанком: three.js и модель на ~20 МБ нужны только здесь.
 */
export default function BarsPage() {
  const { t, lang: siteLang, setLang: setSiteLang } = useLang();
  const [japanese, setJapanese] = useState(false);
  const lang = japanese ? 'ja' : siteLang;
  const s = japanese ? JA : t.bars;
  const setLang = (code) => {
    setJapanese(code === 'ja');
    if (code !== 'ja') setSiteLang(code);
  };
  const stageRef = useRef(null);
  const userRef = useRef(null);
  const botRef = useRef(null);
  const conciergeRef = useRef(null);
  const [load, setLoad] = useState('loading'); // loading | ready | error
  const [conn, setConn] = useState({ state: 'idle', detail: '' });
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [wake, setWake] = useState('off'); // listening | tap | off — ждёт ли гид своё имя

  useEffect(() => {
    const c = new BarsConcierge({
      stage: stageRef.current,
      userCaption: userRef.current,
      botCaption: botRef.current,
      assetBase: '/concierge',
      lang,
      // «Кокурок, …» начинает разговор, как у умной колонки (Chrome; кнопка — запасной путь)
      wakeWord: true,
      onWake: setWake,
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

  // Язык разговора — язык страницы: смена переоткрывает сессию на новом.
  useEffect(() => {
    void conciergeRef.current?.setLang(lang);
    // (японский — не язык сайта, провайдер его не ставит; lang нужен браузеру для японских шрифтов)
    document.documentElement.lang = lang;
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
    // (сокет открыт, но сессия ещё настраивается: разговор по имени стартует без кнопки)
    if (starting || conn.state === 'connecting' || (conn.state === 'connected' && !running)) {
      return { text: s.starting, tone: 'muted' };
    }
    if (conn.state === 'reconnecting') return { text: s.reconnecting, tone: 'muted' };
    if (running) return { text: s.listening, tone: 'live' };
    if (wake === 'listening') return { text: s.sayName, tone: 'wake' };
    if (wake === 'tap') return { text: s.tapToWake, tone: 'wake' };
    return { text: '', tone: 'muted' };
  })();

  return (
    <main className="bp">
      {/* не <header>: Header.css лендинга стилизует сам тег (fixed по верху) */}
      <div className="bp-top">
        <a className="bp-brand" href="/" aria-label={s.toSite}>
          <Logo />
        </a>
        <span className="bp-langs">
          {PAGE_LANGS.map((l, i) => (
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
        {/* имя по-японски, как на футболке гида (в японском заголовке оно уже есть) */}
        {!japanese && (
          <p className="bp-jp" lang="ja">
            コクロク
          </p>
        )}
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
          {running ? <MicOff strokeWidth={1.75} aria-hidden /> : <Mic strokeWidth={1.75} aria-hidden />}
          {running ? s.stop : s.start}
        </button>
        <p className={`bp-status ${status.tone}`} role="status">
          {status.text}
        </p>
      </div>
    </main>
  );
}
