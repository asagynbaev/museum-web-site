/**
 * The museum's sun-compass mark. `spin` wraps the inner rays in a rotating
 * group (used in the header); the footer renders it static.
 */
export function Logo({ spin = false }) {
  const core = (
    <>
      <circle cx="50" cy="50" r="13" stroke="var(--gold-2)" strokeWidth="2" />
      <g stroke="var(--gold)" strokeWidth="2" strokeLinecap="round">
        <path d="M50 4 V24 M50 76 V96 M4 50 H24 M76 50 H96 M18 18 L32 32 M68 68 L82 82 M82 18 L68 32 M32 68 L18 82" />
      </g>
    </>
  );

  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <circle cx="50" cy="50" r="46" stroke="var(--gold)" strokeWidth="2" />
      {spin ? <g className="spin">{core}</g> : core}
      <path d="M50 37 Q57 50 50 63 Q43 50 50 37Z" fill="var(--gold-2)" />
    </svg>
  );
}
