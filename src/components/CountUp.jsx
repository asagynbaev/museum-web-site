import { useEffect, useState } from 'react';

/**
 * Animates a number from 0 to `target` with an ease-out curve once `start`
 * becomes true. Under reduced motion it shows the final value immediately.
 */
export function CountUp({
  target,
  pad = 0,
  prefix = '',
  suffix = '',
  start = false,
  reduced = false,
  duration = 1100,
}) {
  const [val, setVal] = useState(reduced ? target : 0);

  useEffect(() => {
    if (reduced) {
      setVal(target);
      return;
    }
    if (!start) return;

    let raf = 0;
    let t0 = null;
    const tick = (now) => {
      if (t0 == null) t0 = now;
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, target, duration, reduced]);

  let text = String(val);
  while (text.length < pad) text = `0${text}`;
  return <>{prefix + text + suffix}</>;
}
