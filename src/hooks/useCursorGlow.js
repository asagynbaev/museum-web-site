import { useEffect } from 'react';

/**
 * A soft golden glow that eases toward the pointer (ignoring touch input).
 * Disabled under reduced motion.
 */
export function useCursorGlow(glowRef, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const glow = glowRef.current;
    if (!glow) return;

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let gx = mx;
    let gy = my;

    const onMove = (e) => {
      if (e.pointerType !== 'touch') {
        mx = e.clientX;
        my = e.clientY;
      }
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    let raf = 0;
    const frame = () => {
      gx += (mx - gx) * 0.08;
      gy += (my - gy) * 0.08;
      glow.style.transform = `translate3d(${gx - 300}px, ${gy - 300}px, 0)`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
    };
  }, [glowRef, enabled]);
}
