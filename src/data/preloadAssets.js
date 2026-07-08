import { halls } from './halls.js';
import { asset } from '../lib/asset.js';

/**
 * Every heavy asset, listed top-to-bottom in the order they appear on the page,
 * so the preloader warms the browser cache in the same order the visitor will
 * scroll through them: hero first, then each hall.
 */
export const preloadAssets = [
  { url: asset('media/hero-poster.jpg'), type: 'image', label: 'Вступление' },
  { url: asset('media/hero.mp4'), type: 'video', label: 'Память, написанная светом' },
  ...halls.flatMap((hall) => {
    const items = [];
    if (hall.media.poster) {
      items.push({ url: hall.media.poster, type: 'image', label: hall.name });
    }
    if (hall.media.type === 'carousel') {
      hall.media.images.forEach((url) => {
        items.push({ url, type: 'image', label: hall.name });
      });
    } else {
      items.push({ url: hall.media.src, type: hall.media.type, label: hall.name });
    }
    return items;
  }),
];
