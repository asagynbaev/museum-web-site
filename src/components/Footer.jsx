import { Logo } from './Logo.jsx';
import { useLang } from '../i18n/LanguageProvider.jsx';
import './Footer.css';

export function Footer() {
  const { t } = useLang();
  const f = t.footer;

  return (
    <footer>
      <div className="wrap">
        <div className="f-top">
          <a className="f-brand" href="#top">
            <Logo />
            <span className="bt">
              <b>AI Museum</b>
              <span>{t.brandSub.replace(' · ', ' ')}</span>
            </span>
          </a>
          <div className="f-links">
            <div className="f-col">
              <h5>{f.colMuseum}</h5>
              <a href="#halls">{f.linkHalls}</a>
              <a href="#visit">{f.linkVisit}</a>
              <a href="#visit">{f.linkTickets}</a>
              <a href="#">{f.linkGroups}</a>
            </div>
            <div className="f-col">
              <h5>{f.colContacts}</h5>
              <a href="#">+996 — — —</a>
              <a href="#">info@—.kg</a>
              <a href="#">Instagram</a>
              <a href="#">Telegram</a>
            </div>
          </div>
        </div>
        <div className="f-bot">
          <span>{f.bottom1}</span>
          <span>{f.bottom2}</span>
        </div>
      </div>
    </footer>
  );
}
