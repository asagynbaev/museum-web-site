import { useEffect } from 'react';

const THRESHOLD = 45; // px of horizontal travel to count as a swipe
const RATIO = 1.4; // must be this much more horizontal than vertical
const MAX_MS = 1000; // ignore slow drags

/**
 * Horizontal swipe / drag detection on a ref element, via Pointer Events so it
 * covers touch, mouse and pen. Pair with `touch-action: pan-y` on the element
 * so vertical scrolling keeps working while horizontal swipes are captured.
 *
 * swipe left → onLeft (next), swipe right → onRight (previous).
 */
export function useSwipe(ref, { onLeft, onRight, enabled = true }) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;

    let x0 = 0;
    let y0 = 0;
    let t0 = 0;
    let active = false;

    const down = (e) => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      active = true;
      x0 = e.clientX;
      y0 = e.clientY;
      t0 = performance.now();
    };

    const up = (e) => {
      if (!active) return;
      active = false;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      if (
        performance.now() - t0 < MAX_MS &&
        Math.abs(dx) > THRESHOLD &&
        Math.abs(dx) > Math.abs(dy) * RATIO
      ) {
        if (dx < 0) onLeft?.();
        else onRight?.();
      }
    };

    const cancel = () => {
      active = false;
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
    };
  }, [ref, onLeft, onRight, enabled]);
}
