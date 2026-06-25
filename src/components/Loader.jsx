import { useEffect, useState } from 'react';
import { Logo } from './Logo.jsx';
import './Loader.css';

/**
 * Full-screen intro overlay shown while media preloads. A spinning gold ring
 * orbits the museum mark; below it a thin bar fills and the name of the zone
 * currently loading is shown. When `finished`, it fades out and calls `onDone`
 * so the parent can unmount it.
 */
export function Loader({ progress, label, finished, onDone }) {
  const [hide, setHide] = useState(false);

  useEffect(() => {
    if (!finished) return;
    setHide(true);
    const t = setTimeout(onDone, 800); // match the CSS fade duration
    return () => clearTimeout(t);
  }, [finished, onDone]);

  const pct = Math.round(progress * 100);

  return (
    <div
      className={`loader${hide ? ' hide' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy={!finished}
    >
      <div className="loader-inner">
        <div className="loader-mark">
          <span className="loader-ring" />
          <span className="loader-logo">
            <Logo />
          </span>
        </div>

        <div className="loader-brand">
          <b>Музей света</b>
          <span className="mono">Парк высоких технологий · КР</span>
        </div>

        <div className="loader-bar">
          <span className="loader-fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="loader-meta mono">
          <span className="loader-now">{label}</span>
          <span className="loader-pct">{pct}%</span>
        </div>
      </div>
    </div>
  );
}
