import { useEffect, useRef, useState } from 'react';

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = url;
  });
}

function loadAsset(asset, signal) {
  if (asset.type === 'video') {
    // Pull the full bytes into cache; ignore aborts / offline errors.
    return fetch(asset.url, { signal })
      .then((res) => res.blob())
      .catch(() => {});
  }
  return loadImage(asset.url);
}

/**
 * Preloads a list of assets sequentially (top-to-bottom) while reporting a
 * smooth progress value and the label of whatever is loading right now.
 *
 * Timing rules so the loader feels intentional, never janky, never stuck:
 *   - it shows for at least `minMs` even if the cache is already warm;
 *   - it reveals as soon as everything is loaded past that minimum;
 *   - it gives up waiting after `maxMs` so a slow video can't trap the visitor
 *     (the still poster covers anything not finished in time, and the remaining
 *      assets keep warming the cache in the background).
 *
 * The reveal decision runs on plain timers, not rAF, so it stays accurate even
 * when the browser throttles animation frames (background tab, headless, etc).
 * rAF is used only to animate the bar smoothly.
 */
export function usePreloader(assets, { minMs = 3000, maxMs = 5000 } = {}) {
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState(assets[0]?.label ?? '');
  const [finished, setFinished] = useState(false);
  const realRef = useRef(0);

  useEffect(() => {
    const total = assets.length || 1;
    const controller = new AbortController();
    const start = performance.now();

    let aborted = false;
    let done = false;
    let minPassed = false;
    let allLoaded = false;
    let raf = 0;

    const finishNow = () => {
      if (done) return;
      done = true;
      setProgress(1);
      setFinished(true);
      cancelAnimationFrame(raf);
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
    const maybeFinish = () => {
      if (allLoaded && minPassed) finishNow();
    };

    const minTimer = setTimeout(() => {
      minPassed = true;
      maybeFinish();
    }, minMs);
    const maxTimer = setTimeout(finishNow, maxMs);

    // Sequential, top-to-bottom warm-up. Keeps running after reveal so the
    // lower assets finish caching even if we revealed on the max-time cap.
    (async () => {
      for (let i = 0; i < assets.length; i++) {
        if (aborted) return;
        if (!done) setLabel(assets[i].label);
        await loadAsset(assets[i], controller.signal);
        if (aborted) return;
        realRef.current = (i + 1) / total;
      }
      allLoaded = true;
      maybeFinish();
    })();

    // Cosmetic bar fill: honest min(time, real), monotonic so it never jumps back.
    const tick = (now) => {
      if (done) return;
      const timeProgress = Math.min(1, (now - start) / minMs);
      setProgress((p) => Math.max(p, Math.min(timeProgress, realRef.current)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      aborted = true;
      controller.abort();
      cancelAnimationFrame(raf);
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
    // assets / minMs / maxMs are stable module-level inputs; run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { progress, label, finished };
}
