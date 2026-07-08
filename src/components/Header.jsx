import { useEffect, useState } from 'react';
import { Logo } from './Logo.jsx';
import './Header.css';

/**
 * Fixed top bar. `headerRef` is owned by App so useScrollEffects can toggle the
 * condensed (`scrolled`) and hide-on-scroll (`hide`) states without re-render.
 * On mobile the nav collapses behind a burger toggle.
 */
export function Header({ headerRef }) {
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
          <span>Парк высоких технологий · КР</span>
        </span>
      </a>

      <button
        type="button"
        className="burger"
        aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
        aria-expanded={open}
        aria-controls="main-nav"
        onClick={() => setOpen((o) => !o)}
      >
        <span />
        <span />
        <span />
      </button>

      <nav id="main-nav" className={open ? 'open' : ''}>
        <a className="nl" href="#halls" onClick={close}>Залы</a>
        <a className="nl" href="#visit" onClick={close}>Визит</a>
        <a className="nl" href="#visit" onClick={close}>Контакты</a>
        <a className="ticket" href="#visit" onClick={close}>Билеты</a>
        <span className="lang">
          <b>RU</b> · KG · EN
        </span>
      </nav>
    </header>
  );
}
