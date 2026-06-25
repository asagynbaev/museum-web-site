import { useEffect } from 'react';
import { useInView } from '../hooks/useInView.js';

/**
 * Wraps content in the `.reveal` primitive and adds `.in` when it scrolls into
 * view. `onReveal` fires once at that moment (used to kick off the stat
 * counters). Render a different tag with `as`.
 */
export function Reveal({
  as: Tag = 'div',
  className = '',
  threshold = 0.3,
  once = true,
  onReveal,
  children,
  ...rest
}) {
  const [ref, inView] = useInView({ threshold, once });

  useEffect(() => {
    if (inView && onReveal) onReveal();
  }, [inView, onReveal]);

  const cls = ['reveal', className, inView ? 'in' : ''].filter(Boolean).join(' ');

  return (
    <Tag ref={ref} className={cls} {...rest}>
      {children}
    </Tag>
  );
}
