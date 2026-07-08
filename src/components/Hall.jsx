import { useEffect, useRef, useState } from 'react';
import { HallCarousel } from './HallCarousel.jsx';
import { useLang } from '../i18n/LanguageProvider.jsx';
import './Hall.css';

/**
 * One full-viewport hall. Registers its DOM node with App (for the scroll/rail
 * maths) and adds `.in` when scrolled into view, which cascades the staggered
 * text reveal. Background is either a looping video or a parallaxed still.
 */
export function Hall({ hall, index, registerRef, reduced }) {
  const { t } = useLang();
  const tx = t.halls[hall.id];
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

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
          {hall.media.type === 'video' && (
            <video className="media" autoPlay muted loop playsInline poster={hall.media.poster}>
              <source src={hall.media.src} type="video/mp4" />
            </video>
          )}
          {hall.media.type === 'carousel' && (
            <HallCarousel
              images={hall.media.images}
              interval={hall.media.interval}
              kb={hall.kb}
              reduced={reduced}
            />
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
