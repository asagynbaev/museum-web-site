import { ArrowUpRight, Clock, MapPin, Navigation, Ticket } from 'lucide-react';
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
export function Visit({ checkout }) {
  const { t, lang } = useLang();
  const v = t.visit;

  // Цены приходят с сервера — он же считает сумму заказа, так что витрина и
  // касса не могут разъехаться. Пока прайс не загрузился, показываем прочерки.
  const priceList = checkout.tariffs.length
    ? checkout.tariffs.map((tariff) => [
        t.checkout.tariffs[tariff.id],
        `${new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ru-RU').format(tariff.price)} ${t.checkout.som}`,
      ])
    : Object.entries(t.checkout.tariffs).map(([, label]) => [label, v.pricePending]);

  return (
    <section className="visit" id="visit">
      <div className="wrap">
        <Reveal as="h2" className="lead">
          <Rich segments={v.title} />
        </Reveal>

        <Reveal className="v-grid">
          <div className="v-cell">
            <h4>
              <MapPin size={15} strokeWidth={1.5} aria-hidden />
              {v.whereH}
            </h4>
            <div className="big">{v.whereBig}</div>
            <p>
              {v.whereCity}
              <br />
              <span style={{ color: 'var(--fg-faint)' }}>{v.addrPlaceholder}</span>
            </p>
            <a className="v-map" href={ROUTE_URL} target="_blank" rel="noopener noreferrer">
              {v.openMap}
              <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden />
            </a>
          </div>

          <div className="v-cell">
            <h4>
              <Clock size={15} strokeWidth={1.5} aria-hidden />
              {v.hoursH}
            </h4>
            {v.days.map(([label, value]) => (
              <div className="row" key={label}>
                <span>{label}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>

          <div className="v-cell">
            <h4>
              <Ticket size={15} strokeWidth={1.5} aria-hidden />
              {v.ticketsH}
            </h4>
            {priceList.map(([label, value]) => (
              <div className="row" key={label}>
                <span>{label}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal className="v-cta">
          <button className="btn solid" type="button" onClick={checkout.openCheckout}>
            <Ticket size={16} strokeWidth={1.75} aria-hidden />
            {v.buy}
          </button>
          <a className="btn ghost" href={ROUTE_URL} target="_blank" rel="noopener noreferrer">
            <Navigation size={15} strokeWidth={1.75} aria-hidden />
            {v.route}
          </a>
          <span className="mono" style={{ color: 'var(--fg-faint)' }}>
            {v.duration}
          </span>
        </Reveal>
      </div>
    </section>
  );
}
