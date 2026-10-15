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
              <a href="tel:+996995262662">+996 995 262 662</a>
              <a href="mailto:events@htp.kg">events@htp.kg</a>
              <a href="https://www.instagram.com/ai_museum_kg" target="_blank" rel="noopener noreferrer">
                Instagram
              </a>
              <a href="#">Telegram</a>
            </div>
          </div>
        </div>
        <div className="f-bot">
          <span>{f.bottom1}</span>
          <span>{f.bottom2}</span>
          <span className="f-credit">
            Made with
            <svg viewBox="0 0 24 24" aria-label="love" role="img">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
            by
            <a href="https://t.me/azimbek_s" target="_blank" rel="noopener noreferrer">
              @azimbek_s
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
