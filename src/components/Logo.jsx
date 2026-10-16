import { asset } from '../lib/asset.js';

/**
 * Фирменный знак музея. `full` — полный логотип «AI MUSEUM · htp// FUTURE»
 * (шапка, подвал, страница билета), `mark` — только буквы «AI».
 * Знак растровый: внутри букв живая заливка, в SVG её не повторить.
 */
export function Logo({ variant = 'full', className = '' }) {
  const full = variant === 'full';
  return (
    <img
      className={`logo logo-${variant} ${className}`.trim()}
      src={asset(full ? 'media/brand/logo.webp' : 'media/brand/ai-mark.webp')}
      alt="AI Museum"
      width={full ? 960 : 480}
      height={full ? 230 : 318}
      decoding="async"
    />
  );
}
