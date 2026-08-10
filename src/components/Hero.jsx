import { useEffect, useRef, useState } from 'react';
import { useHeroParallax } from '../hooks/useHeroParallax.js';
import { asset } from '../lib/asset.js';
import { useLang } from '../i18n/LanguageProvider.jsx';
import { Rich } from '../i18n/Rich.jsx';
import './Hero.css';

/**
 * Full-viewport opening: looping background video, layered scrims and the
 * staggered title reveal. Падаем на статичный постер, если автовоспроизведение
 * заблокировано браузером или человек просил меньше движения.
 * Фон медленно наезжает при скролле (см. useHeroParallax).
 */
export function Hero({ reduced, started }) {
  const { t } = useLang();
  const innerRef = useRef(null);
  const bgRef = useRef(null);
  const [showPoster, setShowPoster] = useState(false);

  useHeroParallax({ innerRef, bgRef, enabled: !reduced });

  // Видео не должно крутиться за спиной у лоадера: стартуем ровно тогда,
  // когда предзагрузка закончилась и первый экран открылся.
  useEffect(() => {
    const video = bgRef.current;
    if (!video) return;

    if (reduced) {
      video.pause();
      setShowPoster(true);
      return;
    }
    if (!started) return;

    setShowPoster(false);
    const playback = video.play?.();
    // Автоплей могут запретить (экономия трафика, политика браузера) —
    // тогда вместо чёрного прямоугольника показываем постер.
    playback?.catch?.(() => setShowPoster(true));
  }, [reduced, started]);

  const poster = asset('media/hero-poster.jpg');

  return (
    <section className="hero" id="top">
      <video ref={bgRef} muted loop playsInline poster={poster} preload="metadata">
        <source src={asset('media/hero.mp4')} type="video/mp4" />
      </video>
      {showPoster && (
        <div className="poster" style={{ background: `url('${poster}') center/cover` }} />
      )}
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
