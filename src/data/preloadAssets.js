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
    const items = [];
    if (hall.media.poster) {
      items.push({ url: hall.media.poster, type: 'image', label: hall.id });
    }
    if (hall.media.type === 'carousel') {
      hall.media.images.forEach((url) => {
        items.push({ url, type: 'image', label: hall.id });
      });
    } else {
      items.push({ url: hall.media.src, type: hall.media.type, label: hall.id });
    }
    return items;
  }),
];
