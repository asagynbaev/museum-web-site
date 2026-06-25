import { useState } from 'react';
import { Reveal } from './Reveal.jsx';
import { CountUp } from './CountUp.jsx';
import './Manifesto.css';

const STATS = [
  { target: 7, pad: 2, label: 'Залов' },
  { target: 60, prefix: '~', label: 'Минут пути' },
  { target: 360, suffix: '°', label: 'Проекция' },
];

function Stats({ reduced }) {
  const [start, setStart] = useState(false);
  return (
    <Reveal className="stats" onReveal={() => setStart(true)}>
      {STATS.map((s) => (
        <div className="stat" key={s.label}>
          <div className="n">
            <CountUp
              target={s.target}
              pad={s.pad}
              prefix={s.prefix}
              suffix={s.suffix}
              start={start}
              reduced={reduced}
            />
          </div>
          <div className="l mono">{s.label}</div>
        </div>
      ))}
    </Reveal>
  );
}

export function Manifesto({ reduced }) {
  return (
    <section className="manifesto wrap">
      <div className="mani-grid">
        <div>
          <Reveal as="p" className="lead">
            От наскальных знаков <em>Саймалуу-Таша</em> до искусственного интеллекта — семь
            пространств, собранных из света, воды и движения.
          </Reveal>
        </div>
        <div className="mani-body">
          <Reveal as="p">
            Это не выставка, на которую смотрят. Музей реагирует на каждого, кто входит: проекции
            текут под ногами, рисунки оживают на стенах, отражения уходят в бесконечность.
          </Reveal>
          <Reveal as="p">
            Каждый зал — отдельный мир со своим светом, цветом и ритмом. Путь длиной примерно в час
            ведёт от истоков до будущего.
          </Reveal>
        </div>
      </div>
      <Stats reduced={reduced} />
    </section>
  );
}
