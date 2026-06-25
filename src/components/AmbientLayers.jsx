import { useRef } from 'react';
import { useMotes } from '../hooks/useMotes.js';
import { useCursorGlow } from '../hooks/useCursorGlow.js';
import './Ambient.css';

/**
 * Full-screen decorative overlays that sit above everything:
 *   - film grain texture
 *   - drifting dust motes (canvas)
 *   - a glow that trails the cursor
 *   - the slim top progress bar (mobile), written to by useScrollEffects
 */
export function AmbientLayers({ progressRef, reduced }) {
  const motesRef = useRef(null);
  const glowRef = useRef(null);

  useMotes(motesRef, !reduced);
  useCursorGlow(glowRef, !reduced);

  return (
    <>
      <div className="grain" />
      <canvas id="motes" ref={motesRef} />
      <div id="cursorglow" ref={glowRef} />
      <div className="mprog" ref={progressRef} />
    </>
  );
}
