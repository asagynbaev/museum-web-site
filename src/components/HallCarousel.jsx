import './HallCarousel.css';

/**
 * Cross-fading image background for a hall. The slow zoom (Ken-Burns) lives on
 * the container, not on individual slides, so it stays continuous across slide
 * changes — no snap back to the original size when the active slide swaps.
 *
 *  - images:   ordered list of background URLs (high-quality WebP)
 *  - index:    which slide is currently shown (owned by the parent hall)
 *  - kb:       enable the slow zoom
 *  - reduced:  reduced-motion — no zoom, no transition
 */
export function HallCarousel({ images, index, kb = false, reduced = false }) {
  return (
    <div className={`carousel${kb && !reduced ? ' pan' : ''}`} aria-hidden="true">
      {images.map((src, i) => (
        <div
          key={src}
          className={`media carousel-slide${i === index ? ' active' : ''}`}
          style={{ backgroundImage: `url('${src}')` }}
        />
      ))}
    </div>
  );
}

/**
 * Pagination dots below the slider — lets visitors flip slides manually. Not
 * decorative, so (unlike the background) these are real, focusable buttons.
 */
export function CarouselDots({ count, active, onSelect, label = 'Slide', groupLabel }) {
  return (
    <div className="carousel-dots" role="group" aria-label={groupLabel}>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          className={`cdot${i === active ? ' on' : ''}`}
          aria-label={`${label} ${i + 1}`}
          aria-current={i === active}
          onClick={() => onSelect(i)}
        />
      ))}
    </div>
  );
}
