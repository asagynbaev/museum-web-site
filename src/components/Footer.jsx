import { Logo } from './Logo.jsx';
import './Footer.css';

export function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="f-top">
          <a className="f-brand" href="#top">
            <Logo />
            <span className="bt">
              <b>AI Museum</b>
              <span>Парк высоких технологий КР</span>
            </span>
          </a>
          <div className="f-links">
            <div className="f-col">
              <h5>Музей</h5>
              <a href="#halls">Залы</a>
              <a href="#visit">Визит</a>
              <a href="#visit">Билеты</a>
              <a href="#">Группам и школам</a>
            </div>
            <div className="f-col">
              <h5>Контакты</h5>
              <a href="#">+996 — — —</a>
              <a href="#">info@—.kg</a>
              <a href="#">Instagram</a>
              <a href="#">Telegram</a>
            </div>
          </div>
        </div>
        <div className="f-bot">
          <span>© 2026 Парк высоких технологий Кыргызской Республики</span>
          <span>Свет · Вода · Память · Технология</span>
        </div>
      </div>
    </footer>
  );
}
