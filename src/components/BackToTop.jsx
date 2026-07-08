import { useEffect, useState } from 'react';
import { useLang } from '../i18n/LanguageProvider.jsx';
import './BackToTop.css';

/**
 * Floating "back to top" control. Fades in once the user has scrolled roughly
 * one viewport down and smoothly returns them to the hero. Hidden from the
 * layout until visible so it never intercepts taps at the top of the page.
 */
export function BackToTop() {
  const { t } = useLang();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > window.innerHeight * 0.9);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <button
      type="button"
      className={`to-top${visible ? ' show' : ''}`}
      onClick={toTop}
      aria-label={t.backToTop}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <span className="to-top-arrow" aria-hidden="true" />
      <span className="to-top-label mono">{t.backToTop}</span>
    </button>
  );
}
