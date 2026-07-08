import { useLang } from '../i18n/LanguageProvider.jsx';
import './WayfindingRail.css';

/**
 * Fixed vertical route indicator on the left edge (desktop only). The fill
 * height is written by useScrollEffects via `railFillRef`; `active` highlights
 * the current hall's node.
 */
export function WayfindingRail({ halls, active, railFillRef }) {
  const { t } = useLang();
  const total = halls.length;

  return (
    <aside className="rail" aria-hidden="true">
      <span className="cap top">{t.rail.caption}</span>
      <div className="rail-wrap">
        <div className="track" id="track">
          <div className="fill" ref={railFillRef} />
          {halls.map((hall, i) => (
            <a
              key={hall.id}
              className={`rnode${i === active ? ' active' : ''}`}
              href={`#${hall.id}`}
              style={{ top: `${(i / (total - 1)) * 100}%` }}
            >
              <span className="rdot" />
              <span className="rlab">
                {String(i + 1).padStart(2, '0')} · {t.halls[hall.id].name}
              </span>
            </a>
          ))}
        </div>
      </div>
      <span className="cap bot">{String(total).padStart(2, '0')}</span>
    </aside>
  );
}
