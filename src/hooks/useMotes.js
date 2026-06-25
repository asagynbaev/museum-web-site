import { useEffect } from 'react';

/**
 * Floating dust-mote particle field rendered to a full-screen <canvas>.
 * Particles drift slowly upward and wrap around. Resizes with the window and
 * scales particle count to viewport width. Disabled under reduced motion.
 */
export function useMotes(canvasRef, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    let parts = [];

    function size() {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
      const n = Math.min(64, Math.floor(window.innerWidth / 24));
      parts = Array.from({ length: n }, () => ({
        x: Math.random() * cv.width,
        y: Math.random() * cv.height,
        r: Math.random() * 1.5 + 0.4,
        vy: -(Math.random() * 0.22 + 0.04),
        vx: (Math.random() - 0.5) * 0.1,
        a: Math.random() * 0.35 + 0.08,
      }));
    }
    size();
    window.addEventListener('resize', size);

    let raf = 0;
    const frame = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const p of parts) {
        p.y += p.vy;
        p.x += p.vx;
        if (p.y < -6) {
          p.y = cv.height + 6;
          p.x = Math.random() * cv.width;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fillStyle = `rgba(226, 189, 132, ${p.a})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
  }, [canvasRef, enabled]);
}
