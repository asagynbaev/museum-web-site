import { useCallback, useEffect, useRef, useState } from 'react';

import { Loader } from './components/Loader.jsx';
import { AmbientLayers } from './components/AmbientLayers.jsx';
import { Header } from './components/Header.jsx';
import { WayfindingRail } from './components/WayfindingRail.jsx';
import { Hero } from './components/Hero.jsx';
import { Manifesto } from './components/Manifesto.jsx';
import { Halls } from './components/Halls.jsx';
import { Visit } from './components/Visit.jsx';
import { Footer } from './components/Footer.jsx';
import { BackToTop } from './components/BackToTop.jsx';

import { halls } from './data/halls.js';
import { preloadAssets } from './data/preloadAssets.js';
import { useReducedMotion } from './hooks/useReducedMotion.js';
import { usePreloader } from './hooks/usePreloader.js';
import { useScrollEffects } from './hooks/useScrollEffects.js';

export default function App() {
  const reduced = useReducedMotion();

  // Intro preloader — warms the media cache top-to-bottom before reveal.
  const { progress, label, finished } = usePreloader(preloadAssets);
  const [loaderGone, setLoaderGone] = useState(false);

  // Lock page scroll while the loader is covering the page.
  useEffect(() => {
    document.body.style.overflow = loaderGone ? '' : 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [loaderGone]);

  // Shared refs the scroll logic writes to directly (no re-render on scroll).
  const headerRef = useRef(null);
  const progressRef = useRef(null);
  const railFillRef = useRef(null);
  const hallRefs = useRef([]);

  // The one piece of scroll state that drives React output: the active hall.
  const [activeHall, setActiveHall] = useState(0);
  const onActive = useCallback((i) => setActiveHall(i), []);

  useScrollEffects({ headerRef, progressRef, railFillRef, hallRefs, onActive });

  return (
    <>
      {!loaderGone && (
        <Loader
          progress={progress}
          label={label}
          finished={finished}
          onDone={() => setLoaderGone(true)}
        />
      )}

      <AmbientLayers progressRef={progressRef} reduced={reduced} />
      <Header headerRef={headerRef} />
      <WayfindingRail halls={halls} active={activeHall} railFillRef={railFillRef} />

      <Hero reduced={reduced} />
      <Manifesto reduced={reduced} />
      <div className="divider" />
      <Halls reduced={reduced} hallRefs={hallRefs} />
      <div className="divider" />
      <Visit />
      <Footer />
      <BackToTop />
    </>
  );
}
