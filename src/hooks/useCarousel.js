import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Auto-advancing carousel index with manual control.
 *
 *  - count:    number of slides
 *  - interval: ms between automatic advances
 *  - enabled:  when false (single slide / reduced motion), holds on slide 0
 *
 * Returns { index, goTo } — `goTo(i)` jumps to a slide and restarts the timer
 * so a manual pick isn't immediately overridden by the next auto-advance.
 */
export function useCarousel(count, interval = 4600, enabled = true) {
  const [index, setIndex] = useState(0);
  const timer = useRef(null);

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const start = useCallback(() => {
    stop();
    if (!enabled || count < 2) return;
    timer.current = setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, interval);
  }, [enabled, count, interval, stop]);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  // Keep the index valid if the slide count ever changes (e.g. language swap
  // never changes it here, but stay safe).
  useEffect(() => {
    if (index > count - 1) setIndex(0);
  }, [count, index]);

  const goTo = useCallback(
    (i) => {
      setIndex(i);
      start(); // reset the auto-advance countdown after a manual pick
    },
    [start]
  );

  // Stable next/prev (functional updates → no stale index in gesture handlers).
  const next = useCallback(() => {
    setIndex((i) => (i + 1) % count);
    start();
  }, [count, start]);

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + count) % count);
    start();
  }, [count, start]);

  return { index, goTo, next, prev };
}
