import { asset } from '../lib/asset.js';

/**
 * The seven halls of the museum, in walk-through order — structural data only.
 * All visible text (name, alt, description, specs) lives in the i18n dictionary
 * keyed by `id` (see src/i18n/translations.js) so it can be translated.
 *
 *  - id:      key into translations.halls
 *  - num:     display number ('01'…'07')
 *  - side:    which edge the text column hugs ('left' | 'right')
 *  - accent:  per-hall light colour, exposed to CSS as `--accent`
 *  - kb:      slow Ken-Burns drift on the background image(s)
 *  - media:   a still image ('image') or an auto-advancing set of stills
 *             ('carousel'); high-quality WebP backgrounds
 *  - speed:   parallax factor for the background layer
 */
export const halls = [
  {
    id: 'hall1',
    num: '01',
    side: 'left',
    accent: '#3fe0a0',
    kb: true,
    media: {
      type: 'carousel',
      interval: 4600,
      images: [
        asset('media/hall1-2.webp'),
        asset('media/hall1-3.webp'),
        asset('media/hall1-4.webp'),
      ],
    },
    speed: 0.12,
  },
  {
    id: 'hall2',
    num: '02',
    side: 'right',
    accent: '#4d7cff',
    kb: true,
    media: {
      type: 'carousel',
      interval: 4600,
      images: [
        asset('media/hall2-1.webp'),
        asset('media/hall2-2.webp'),
        asset('media/hall2-3.webp'),
      ],
    },
    speed: 0.16,
  },
  {
    id: 'hall3',
    num: '03',
    side: 'left',
    accent: '#7e6bff',
    kb: true,
    media: {
      type: 'carousel',
      interval: 4600,
      images: [
        asset('media/hall3-1.webp'),
        asset('media/hall3-2.webp'),
        asset('media/hall3-3.webp'),
      ],
    },
    speed: 0.16,
  },
  {
    id: 'hall4',
    num: '04',
    side: 'right',
    accent: '#ff9a3c',
    kb: true,
    media: {
      type: 'carousel',
      interval: 4600,
      images: [
        asset('media/hall4-1.webp'),
        asset('media/hall4-2.webp'),
        asset('media/hall4-3.webp'),
      ],
    },
    speed: 0.16,
  },
  {
    id: 'hall5',
    num: '05',
    side: 'left',
    accent: '#45c7e6',
    kb: true,
    media: { type: 'image', src: asset('media/hall5.webp') },
    speed: 0.16,
  },
  {
    id: 'hall6',
    num: '06',
    side: 'right',
    accent: '#5ee0ff',
    kb: true,
    media: {
      type: 'carousel',
      interval: 4600,
      images: [
        asset('media/hall6-1.webp'),
        asset('media/hall6-2.webp'),
      ],
    },
    speed: 0.16,
  },
  {
    id: 'hall7',
    num: '07',
    side: 'left',
    accent: '#ff5c8a',
    kb: true,
    media: {
      type: 'carousel',
      interval: 4600,
      images: [
        asset('media/hall7-1.webp'),
        asset('media/hall7-2.webp'),
      ],
    },
    speed: 0.16,
  },
];
