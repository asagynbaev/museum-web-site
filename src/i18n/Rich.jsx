import { Fragment } from 'react';

/**
 * Renders a translated string made of segments, turning `{ em: true }` parts
 * into <em> (used for the accent word in headings). Keeps word order flexible
 * across languages.
 */
export function Rich({ segments }) {
  return segments.map((s, i) =>
    s.em ? <em key={i}>{s.t}</em> : <Fragment key={i}>{s.t}</Fragment>
  );
}
