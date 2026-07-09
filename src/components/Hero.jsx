import { useRef } from 'react';
import { useHeroParallax } from '../hooks/useHeroParallax.js';
import { asset } from '../lib/asset.js';
import { useLang } from '../i18n/LanguageProvider.jsx';
import { Rich } from '../i18n/Rich.jsx';
import './Hero.css';

/**
 * Full-viewport opening: an optimized still background (lighter than video),
 * layered scrims and the staggered title reveal. The background slowly scales
 * up as the visitor scrolls (see useHeroParallax).
 */
export function Hero({ reduced }) {
  const { t } = useLang();
  const innerRef = useRef(null);
  const bgRef = useRef(null);

  useHeroParallax({ innerRef, bgRef, enabled: !reduced });

  const poster = asset('media/hero-poster.jpg');

  return (
    <section className="hero" id="top">
      <div
        className="hero-bg"
        ref={bgRef}
        style={{ backgroundImage: `url('${poster}')` }}
      />
      <div className="scrim" />
      <div className="scrim2" />

      <div className="hero-inner wrap" ref={innerRef}>
        <div className="eyebrow mono">{t.hero.eyebrow}</div>
        <h1 className="hero-title">
          {t.hero.title.map((line, i) => (
            <span className="ln" key={i}>
              <i>
                <Rich segments={line} />
              </i>
            </span>
          ))}
        </h1>
        <p className="hero-sub">{t.hero.sub}</p>
        <div className="scrollcue mono">
          <span className="ar" /> {t.hero.scrollcue}
        </div>
      </div>
    </section>
  );
}
