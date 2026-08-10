import { halls } from './halls.js';
import { asset } from '../lib/asset.js';

/**
 * Every heavy asset, listed top-to-bottom in the order they appear on the page,
 * so the preloader warms the browser cache in the same order the visitor will
 * scroll through them: hero first, then each hall.
 */
// `label` holds a translation key (see src/i18n/translations.js). The loader
// resolves it to the current language: 'intro' / 'hero' → t.loader.*, hallN →
// t.halls[hallN].name.
export const preloadAssets = [
  { url: asset('media/hero-poster.jpg'), type: 'image', label: 'intro' },
  { url: asset('media/hero.mp4'), type: 'video', label: 'hero' },
  ...halls.flatMap((hall) => {
    if (hall.media.type === 'carousel') {
      return hall.media.images.map((url) => ({ url, type: 'image', label: hall.id }));
    }
    return [{ url: hall.media.src, type: 'image', label: hall.id }];
  }),
];
