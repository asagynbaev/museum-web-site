import { useEffect, useRef, useState } from 'react';
import { useHeroParallax } from '../hooks/useHeroParallax.js';
import { asset } from '../lib/asset.js';
import './Hero.css';

/**
 * Full-viewport opening: looping background video, layered scrims and the
 * staggered title reveal. Falls back to a still poster if autoplay is blocked
 * or motion is reduced.
 */
export function Hero({ reduced, started }) {
  const innerRef = useRef(null);
  const videoRef = useRef(null);
  const [showPoster, setShowPoster] = useState(false);

  useHeroParallax({ innerRef, videoRef, enabled: !reduced });

  // Hold playback until the preloader is done — the video must not run in the
  // background behind the loader, it starts exactly when loading finishes.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (reduced) {
      setShowPoster(true);
      return;
    }
    if (!started) return;
    const playback = v.play?.();
    if (playback && typeof playback.catch === 'function') {
      playback.catch(() => setShowPoster(true));
    }
  }, [reduced, started]);

  const poster = asset('media/hero-poster.jpg');

  return (
    <section className="hero" id="top">
      <video ref={videoRef} muted loop playsInline poster={poster} preload="metadata">
        <source src={asset('media/hero.mp4')} type="video/mp4" />
      </video>
      <div
        className="poster"
        style={{
          background: `url('${poster}') center/cover`,
          display: showPoster ? 'block' : 'none',
        }}
      />
      <div className="scrim" />
      <div className="scrim2" />

      <div className="hero-inner wrap" ref={innerRef}>
        <div className="eyebrow mono">Парк высоких технологий · Бишкек</div>
        <h1 className="hero-title">
          <span className="ln">
            <i>Память,</i>
          </span>
          <span className="ln">
            <i>
              написанная <em>светом</em>
            </i>
          </span>
        </h1>
        <p className="hero-sub">
          Иммерсивный музей из семи залов, где древние образы Кыргызстана — петроглифы, барс,
          беркут, Ысык-Көл — оживают в цифровом свете.
        </p>
        <div className="scrollcue mono">
          <span className="ar" /> Пройти семь залов
        </div>
      </div>
    </section>
  );
}
