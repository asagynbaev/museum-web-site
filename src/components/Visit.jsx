import { Reveal } from './Reveal.jsx';
import './Visit.css';

/**
 * Planning section: location, hours and pricing in a three-up grid, plus the
 * primary calls to action. Placeholder values (— сом, точный адрес) are kept
 * from the source so they're easy to fill in later.
 */
export function Visit() {
  return (
    <section className="visit" id="visit">
      <div className="wrap">
        <Reveal as="h2" className="lead">
          Спланируйте <em>визит</em>
        </Reveal>

        <Reveal className="v-grid">
          <div className="v-cell">
            <h4>Где</h4>
            <div className="big">Парк высоких технологий</div>
            <p>
              Бишкек, Кыргызская Республика
              <br />
              <span style={{ color: 'var(--bone-faint)' }}>— укажите точный адрес —</span>
            </p>
          </div>

          <div className="v-cell">
            <h4>Часы работы</h4>
            <div className="row">
              <span>Вторник — Пятница</span>
              <span>10:00–20:00</span>
            </div>
            <div className="row">
              <span>Суббота — Воскресенье</span>
              <span>10:00–21:00</span>
            </div>
            <div className="row">
              <span>Понедельник</span>
              <span>выходной</span>
            </div>
          </div>

          <div className="v-cell">
            <h4>Билеты</h4>
            <div className="row">
              <span>Взрослый</span>
              <span>— сом</span>
            </div>
            <div className="row">
              <span>Детский / студент</span>
              <span>— сом</span>
            </div>
            <div className="row">
              <span>Семейный (2+2)</span>
              <span>— сом</span>
            </div>
          </div>
        </Reveal>

        <Reveal className="v-cta">
          <a className="btn solid" href="#">
            Купить билет
          </a>
          <a className="btn ghost" href="#">
            Построить маршрут
          </a>
          <span className="mono" style={{ color: 'var(--bone-faint)' }}>
            Длительность · ~60 мин · 7 залов
          </span>
        </Reveal>
      </div>
    </section>
  );
}
