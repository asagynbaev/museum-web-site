import { Fragment, useEffect, useState } from 'react';
import { Logo } from './Logo.jsx';
import { useLang } from '../i18n/LanguageProvider.jsx';
import { LANGS } from '../i18n/translations.js';
import './Header.css';

/**
 * Fixed top bar. `headerRef` is owned by App so useScrollEffects can toggle the
 * condensed (`scrolled`) and hide-on-scroll (`hide`) states without re-render.
 * On mobile the nav collapses behind a burger toggle.
 */
export function Header({ headerRef }) {
  const { t, lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // Lock page scroll and close the menu on Escape while it's open.
  useEffect(() => {
    if (!open) return undefined;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <header id="hdr" ref={headerRef} className={open ? 'menu-open' : ''}>
      <a className="brand" href="#top" aria-label="AI Museum" onClick={close}>
        <Logo spin />
        <span className="bt">
          <b>AI Museum</b>
          <span>{t.brandSub}</span>
        </span>
      </a>

      <button
        type="button"
        className="burger"
        aria-label={open ? t.a11y.closeMenu : t.a11y.openMenu}
        aria-expanded={open}
        aria-controls="main-nav"
        onClick={() => setOpen((o) => !o)}
      >
        <span />
        <span />
        <span />
      </button>

      <nav id="main-nav" className={open ? 'open' : ''}>
        <a className="nl" href="#halls" onClick={close}>{t.nav.halls}</a>
        <a className="nl" href="#visit" onClick={close}>{t.nav.visit}</a>
        <a className="nl" href="#visit" onClick={close}>{t.nav.contacts}</a>
        <a className="ticket" href="#visit" onClick={close}>{t.nav.tickets}</a>
        <span className="lang">
          {LANGS.map((l, i) => (
            <Fragment key={l.code}>
              {i > 0 && <span className="lang-sep"> · </span>}
              <button
                type="button"
                className={`lang-btn${lang === l.code ? ' on' : ''}`}
                aria-pressed={lang === l.code}
                onClick={() => setLang(l.code)}
              >
                {l.label}
              </button>
            </Fragment>
          ))}
        </span>
      </nav>
    </header>
  );
}
