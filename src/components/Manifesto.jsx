import { useState } from 'react';
import { Reveal } from './Reveal.jsx';
import { CountUp } from './CountUp.jsx';
import { useLang } from '../i18n/LanguageProvider.jsx';
import { Rich } from '../i18n/Rich.jsx';
import './Manifesto.css';

const STAT_META = [
  { target: 7, pad: 2 },
  { target: 60, prefix: '~' },
  { target: 360, suffix: '°' },
];

function Stats({ reduced }) {
  const { t } = useLang();
  const [start, setStart] = useState(false);
  return (
    <Reveal className="stats" onReveal={() => setStart(true)}>
      {STAT_META.map((s, i) => (
        <div className="stat" key={t.manifesto.stats[i]}>
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
          <div className="l mono">{t.manifesto.stats[i]}</div>
        </div>
      ))}
    </Reveal>
  );
}

export function Manifesto({ reduced }) {
  const { t } = useLang();
  return (
    <section className="manifesto wrap">
      <div className="mani-grid">
        <div>
          <Reveal as="p" className="lead">
            <Rich segments={t.manifesto.lead} />
          </Reveal>
        </div>
        <div className="mani-body">
          <Reveal as="p">{t.manifesto.body1}</Reveal>
          <Reveal as="p">{t.manifesto.body2}</Reveal>
        </div>
      </div>
      <Stats reduced={reduced} />
    </section>
  );
}
