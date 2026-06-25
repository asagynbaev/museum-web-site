import { useEffect } from 'react';

/**
 * Hero scroll choreography: the text block drifts down and fades while the
 * background video slowly scales up. Mirrors the original rAF loop, gated on
 * reduced motion.
 */
export function useHeroParallax({ innerRef, videoRef, enabled = true }) {
  useEffect(() => {
    if (!enabled) return;

    let raf = 0;
    const frame = () => {
      const vh = window.innerHeight;
      const y = window.scrollY || 0;

      if (innerRef.current && y < vh) {
        innerRef.current.style.transform = `translate3d(0, ${y * 0.28}px, 0)`;
        innerRef.current.style.opacity = String(Math.max(0, 1 - y / (vh * 0.85)));
        if (videoRef.current) {
          videoRef.current.style.transform = `scale(${1 + (y / vh) * 0.12})`;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(raf);
  }, [innerRef, videoRef, enabled]);
}
