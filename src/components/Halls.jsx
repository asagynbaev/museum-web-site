import { Fragment } from 'react';
import { Hall } from './Hall.jsx';
import { halls } from '../data/halls.js';
import { useParallax } from '../hooks/useParallax.js';

/**
 * Renders the seven halls with a divider between each, and drives the
 * background parallax for all of them. `hallRefs` is App's shared array so the
 * scroll logic can locate every section.
 */
export function Halls({ reduced, hallRefs }) {
  useParallax(!reduced);

  const registerRef = (i, el) => {
    hallRefs.current[i] = el;
  };

  return (
    <main id="halls">
      {halls.map((hall, i) => (
        <Fragment key={hall.id}>
          {i > 0 && <div className="divider" />}
          <Hall hall={hall} index={i} registerRef={registerRef} />
        </Fragment>
      ))}
    </main>
  );
}
