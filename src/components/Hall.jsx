import { useEffect, useRef, useState } from 'react';
import { HallCarousel, CarouselDots } from './HallCarousel.jsx';
import { useCarousel } from '../hooks/useCarousel.js';
import { useSwipe } from '../hooks/useSwipe.js';
import { useLang } from '../i18n/LanguageProvider.jsx';
import './Hall.css';

/**
 * One full-viewport hall. Registers its DOM node with App (for the scroll/rail
 * maths) and adds `.in` when scrolled into view, which cascades the staggered
 * text reveal. Background is a still image or an auto-advancing carousel with
 * manual pagination dots.
 */
export function Hall({ hall, index, registerRef, reduced }) {
  const { t } = useLang();
  const tx = t.halls[hall.id];
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  const isCarousel = hall.media.type === 'carousel';
  const slideCount = isCarousel ? hall.media.images.length : 0;
  const swipeable = isCarousel && slideCount > 1;
  // Hook is always called (stable order); a no-op for non-carousel halls.
  const { index: slide, goTo, next, prev } = useCarousel(
    slideCount,
    hall.media.interval,
    isCarousel && !reduced
  );

  // Swipe / drag to change slides (touch + mouse). Works even under reduced
  // motion since it's manual navigation.
  useSwipe(ref, { onLeft: next, onRight: prev, enabled: swipeable });

  useEffect(() => {
    const el = ref.current;
    registerRef(index, el);

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.unobserve(el);
        }
      },
      { threshold: 0.18 }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      registerRef(index, null);
    };
  }, [index, registerRef]);

  const className = ['hall', hall.side, hall.portal && 'portal', inView && 'in']
    .filter(Boolean)
    .join(' ');

  return (
    <section className={className} id={hall.id} ref={ref} style={{ '--accent': hall.accent }}>
      <div className="layer">
        <div className="pllx" data-speed={hall.speed}>
          {isCarousel && (
            <HallCarousel images={hall.media.images} index={slide} kb={hall.kb} reduced={reduced} />
          )}
          {hall.media.type === 'image' && (
            <div
              className={`media${hall.kb ? ' kb' : ''}`}
              style={{ backgroundImage: `url('${hall.media.src}')` }}
            />
          )}
        </div>
      </div>
      <div className="shimmer" />
      <div className="tint" />
      <div className="glow" />

      {isCarousel && slideCount > 1 && (
        <CarouselDots
          count={slideCount}
          active={slide}
          onSelect={goTo}
          label={t.carousel.slide}
          groupLabel={tx.name}
        />
      )}

      <div className="content">
        <div className="h-num reveal">{t.hall.zone} {hall.num}</div>
        <h2 className="h-name reveal">{tx.name}</h2>
        <div className="h-alt reveal">{tx.alt}</div>
        <p className="h-desc reveal">{tx.desc}</p>
        <div className="h-spec reveal">
          {tx.specs.map((spec) => (
            <span key={spec}>{spec}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
