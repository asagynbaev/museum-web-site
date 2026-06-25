import { Logo } from './Logo.jsx';
import './Header.css';

/**
 * Fixed top bar. `headerRef` is owned by App so useScrollEffects can toggle the
 * condensed (`scrolled`) and hide-on-scroll (`hide`) states without re-render.
 */
export function Header({ headerRef }) {
  return (
    <header id="hdr" ref={headerRef}>
      <a className="brand" href="#top" aria-label="Музей света">
        <Logo spin />
        <span className="bt">
          <b>Музей света</b>
          <span>Парк высоких технологий · КР</span>
        </span>
      </a>
      <nav>
        <a className="nl" href="#halls">Залы</a>
        <a className="nl" href="#visit">Визит</a>
        <a className="nl" href="#visit">Контакты</a>
        <a className="ticket" href="#visit">Билеты</a>
        <span className="lang">
          <b>RU</b> · KG · EN
        </span>
      </nav>
    </header>
  );
}
