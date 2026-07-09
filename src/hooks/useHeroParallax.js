import { useEffect } from 'react';

/**
 * Hero scroll choreography: the text block drifts down and fades while the
 * background image slowly scales up. Mirrors the original rAF loop, gated on
 * reduced motion.
 */
export function useHeroParallax({ innerRef, bgRef, enabled = true }) {
  useEffect(() => {
    if (!enabled) {
      // Reduce-motion may be toggled on mid-session (useReducedMotion listens
      // for it): clear any inline transforms left from a prior scroll so the
      // hero doesn't stay frozen zoomed / faded.
      if (innerRef.current) {
        innerRef.current.style.transform = '';
        innerRef.current.style.opacity = '';
      }
      if (bgRef.current) bgRef.current.style.transform = '';
      return undefined;
    }

    let raf = 0;
    const frame = () => {
      const vh = window.innerHeight;
      const y = window.scrollY || 0;

      if (innerRef.current && y < vh) {
        innerRef.current.style.transform = `translate3d(0, ${y * 0.28}px, 0)`;
        innerRef.current.style.opacity = String(Math.max(0, 1 - y / (vh * 0.85)));
        if (bgRef.current) {
          bgRef.current.style.transform = `scale(${1 + (y / vh) * 0.12})`;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(raf);
  }, [innerRef, bgRef, enabled]);
}
