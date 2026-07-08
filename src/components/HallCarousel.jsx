import { useEffect, useState } from 'react';
import './HallCarousel.css';

/**
 * Cross-fading image carousel for a hall background — the A/B alternative to a
 * single still or a low-quality GIF. Slides advance automatically and loop.
 *
 *  - images:   ordered list of background URLs (use high-quality WebP)
 *  - interval: ms between slides (default 4200)
 *  - kb:       adds a slow Ken-Burns drift to the active slide
 *  - reduced:  when true, holds on the first slide (no auto-advance)
 */
export function HallCarousel({ images, interval = 4200, kb = false, reduced = false }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduced || images.length < 2) return undefined;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, interval);
    return () => clearInterval(id);
  }, [images.length, interval, reduced]);

  return (
    <div className="carousel" aria-hidden="true">
      {images.map((src, i) => (
        <div
          key={src}
          className={`media carousel-slide${i === index ? ' active' : ''}${
            kb && !reduced ? ' pan' : ''
          }`}
          style={{ backgroundImage: `url('${src}')` }}
        />
      ))}
    </div>
  );
}
