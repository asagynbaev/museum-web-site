import { useEffect, useState } from 'react';
import { asset } from '../lib/asset.js';
import { useLang } from '../i18n/LanguageProvider.jsx';
import './Loader.css';

/**
 * Full-screen intro overlay shown while media preloads. В центре крутится
 * фирменный ролик с «AI» (его чёрный фон растворяется в фоне страницы), под ним
 * тонкая полоса прогресса и название зоны, которая сейчас грузится. When
 * `finished`, it fades out and calls `onDone` so the parent can unmount it.
 */
export function Loader({ progress, label, finished, onDone, reduced }) {
  const { t } = useLang();
  const [hide, setHide] = useState(false);

  // `label` is a translation key: 'intro' / 'hero' → t.loader.*, hallN → hall name.
  const zone = t.halls[label]?.name ?? t.loader[label] ?? '';

  useEffect(() => {
    if (!finished) return;
    setHide(true);
    const t = setTimeout(onDone, 800); // match the CSS fade duration
    return () => clearTimeout(t);
  }, [finished, onDone]);

  const pct = Math.round(progress * 100);
  const poster = asset('media/brand/ai-mark-poster.jpg');

  return (
    <div
      className={`loader${hide ? ' hide' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy={!finished}
    >
      <div className="loader-inner">
        {reduced ? (
          <img className="loader-mark" src={poster} alt="AI Museum" />
        ) : (
          <video
            className="loader-mark"
            src={asset('media/brand/ai-mark.mp4')}
            poster={poster}
            autoPlay
            muted
            loop
            playsInline
            aria-label="AI Museum"
          />
        )}

        <div className="loader-bar">
          <span className="loader-fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="loader-meta mono">
          <span className="loader-now">{zone}</span>
          <span className="loader-pct">{pct}%</span>
        </div>
      </div>
    </div>
  );
}
