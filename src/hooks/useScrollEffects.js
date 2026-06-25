import { useEffect } from 'react';

/**
 * Single scroll listener that drives all the scroll-coupled chrome:
 *   - header: condense (`scrolled`) and hide-on-scroll-down (`hide`)
 *   - top progress bar width (mobile)
 *   - wayfinding rail fill height
 *   - which hall is currently active (reported through `onActive`)
 *
 * Header / progress / rail-fill are written straight to the DOM via refs to
 * avoid re-rendering on every scroll frame; only the active hall index — which
 * changes rarely — is lifted to React state by the caller.
 */
export function useScrollEffects({ headerRef, progressRef, railFillRef, hallRefs, onActive }) {
  useEffect(() => {
    let lastY = 0;
    let lastActive = -1;

    function onScroll() {
      const y = window.scrollY || document.documentElement.scrollTop;

      const hdr = headerRef.current;
      if (hdr) {
        hdr.classList.toggle('scrolled', y > 60);
        hdr.classList.toggle('hide', y > lastY && y > 700);
      }
      lastY = y;

      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (progressRef.current) {
        progressRef.current.style.width = `${Math.min(1, Math.max(0, y / max)) * 100}%`;
      }

      const els = hallRefs.current.filter(Boolean);
      if (els.length) {
        const first = els[0].offsetTop;
        const lastEl = els[els.length - 1];
        const last = lastEl.offsetTop + lastEl.offsetHeight;
        const mid = y + window.innerHeight * 0.5;

        if (railFillRef.current) {
          const fill = Math.min(1, Math.max(0, (mid - first) / (last - first)));
          railFillRef.current.style.height = `${fill * 100}%`;
        }

        let best = 0;
        let bestDist = Infinity;
        els.forEach((el, i) => {
          const center = el.offsetTop + el.offsetHeight / 2;
          const dist = Math.abs(center - mid);
          if (dist < bestDist) {
            bestDist = dist;
            best = i;
          }
        });
        if (best !== lastActive) {
          lastActive = best;
          onActive(best);
        }
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [headerRef, progressRef, railFillRef, hallRefs, onActive]);
}
