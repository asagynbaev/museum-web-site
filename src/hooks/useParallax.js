import { useEffect } from 'react';

/**
 * Drifts every `.pllx` background layer relative to its hall as it passes
 * through the viewport. Reads `data-speed` off each layer. Off-screen halls are
 * skipped. Runs a single rAF loop; disabled entirely under reduced motion.
 */
export function useParallax(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const layers = Array.from(document.querySelectorAll('.pllx'));
    if (!layers.length) return;

    let raf = 0;
    const frame = () => {
      const vh = window.innerHeight;
      for (const el of layers) {
        const section = el.closest('.hall');
        if (!section) continue;
        const r = section.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        const speed = parseFloat(el.dataset.speed) || 0.15;
        const prog = (r.top + r.height / 2 - vh / 2) / vh;
        el.style.transform = `translate3d(0, ${prog * speed * 100}px, 0)`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(raf);
  }, [enabled]);
}
