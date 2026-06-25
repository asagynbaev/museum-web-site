import { useEffect, useRef, useState } from 'react';

/**
 * Returns `[ref, inView]`. Attach `ref` to an element and `inView` flips true
 * once it scrolls into view. With `once` (the default) it latches and stops
 * observing — used to trigger one-shot reveal / count-up animations.
 */
export function useInView({ threshold = 0.2, once = true } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.unobserve(el);
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [threshold, once]);

  return [ref, inView];
}
