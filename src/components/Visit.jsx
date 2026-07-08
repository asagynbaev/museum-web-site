import { Reveal } from './Reveal.jsx';
import { useLang } from '../i18n/LanguageProvider.jsx';
import { Rich } from '../i18n/Rich.jsx';
import './Visit.css';

// Маршрут до музея в 2ГИС. Пока — поиск по названию площадки в Бишкеке;
// когда появится точный адрес/карточка, заменить на прямую ссылку dir/points.
const ROUTE_URL =
  'https://2gis.kg/bishkek/search/' + encodeURIComponent('Парк высоких технологий');

/**
 * Planning section: location, hours and pricing in a three-up grid, plus the
 * primary calls to action. Placeholder values (— сом, точный адрес) are kept
 * so they're easy to fill in later.
 */
export function Visit() {
  const { t } = useLang();
  const v = t.visit;

  return (
    <section className="visit" id="visit">
      <div className="wrap">
        <Reveal as="h2" className="lead">
          <Rich segments={v.title} />
        </Reveal>

        <Reveal className="v-grid">
          <div className="v-cell">
            <h4>{v.whereH}</h4>
            <div className="big">{v.whereBig}</div>
            <p>
              {v.whereCity}
              <br />
              <span style={{ color: 'var(--bone-faint)' }}>{v.addrPlaceholder}</span>
            </p>
            <a className="v-map" href={ROUTE_URL} target="_blank" rel="noopener noreferrer">
              {v.openMap}
            </a>
          </div>

          <div className="v-cell">
            <h4>{v.hoursH}</h4>
            {v.days.map(([label, value]) => (
              <div className="row" key={label}>
                <span>{label}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>

          <div className="v-cell">
            <h4>{v.ticketsH}</h4>
            {v.tickets.map(([label, value]) => (
              <div className="row" key={label}>
                <span>{label}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal className="v-cta">
          <a className="btn solid" href="#visit">
            {v.buy}
          </a>
          <a className="btn ghost" href={ROUTE_URL} target="_blank" rel="noopener noreferrer">
            {v.route}
          </a>
          <span className="mono" style={{ color: 'var(--bone-faint)' }}>
            {v.duration}
          </span>
        </Reveal>
      </div>
    </section>
  );
}
