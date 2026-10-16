import { Heart, Instagram, Mail, Phone } from 'lucide-react';
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
            <span className="bt">{t.brandSub.replace(' · ', ' ')}</span>
          </a>
          <div className="f-links">
            <div className="f-col">
              <h5>{f.colMuseum}</h5>
              <a href="#halls">{f.linkHalls}</a>
              <a href="#visit">{f.linkVisit}</a>
              <a href="#visit">{f.linkTickets}</a>
              <a href={`mailto:events@htp.kg?subject=${encodeURIComponent(f.groupsSubject)}`}>
                {f.linkGroups}
              </a>
              <span className="f-note">{f.groupsNote}</span>
            </div>
            <div className="f-col">
              <h5>{f.colContacts}</h5>
              <a className="f-ic" href="tel:+996995262662">
                <Phone size={15} strokeWidth={1.5} aria-hidden />
                +996 995 262 662
              </a>
              <a className="f-ic" href="mailto:events@htp.kg">
                <Mail size={15} strokeWidth={1.5} aria-hidden />
                events@htp.kg
              </a>
              <a
                className="f-ic"
                href="https://www.instagram.com/ai_museum_kg"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Instagram size={15} strokeWidth={1.5} aria-hidden />
                Instagram
              </a>
            </div>
          </div>
        </div>
        <div className="f-bot">
          <span>{f.bottom1}</span>
          <span>{f.bottom2}</span>
          <span className="f-credit">
            Made with
            <Heart size={12} fill="currentColor" strokeWidth={0} aria-label="love" role="img" />
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
