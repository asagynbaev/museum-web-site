import { asset } from '../lib/asset.js';

/**
 * The seven halls of the museum, in walk-through order.
 * This single source of truth drives both the <Hall> sections and the
 * wayfinding rail on the left edge.
 *
 *  - side:    which edge the text column hugs ('left' | 'right')
 *  - accent:  per-hall light colour, exposed to CSS as `--accent`
 *  - portal:  adds a hue-cycling animation to the background (hall 02 only)
 *  - kb:      slow Ken-Burns drift on a still background image
 *  - media:   either a looping video or a still image
 *  - speed:   parallax factor for the background layer
 */
export const halls = [
  {
    id: 'hall1',
    num: '01',
    side: 'left',
    accent: '#3fe0a0',
    name: 'Эволюция',
    alt: 'Большой зал',
    desc:
      'С первого шага вас окружает живая материя. Реки света текут по полу и стенам, ' +
      'вспыхивают звёздными полями и снова сворачиваются в первичный хаос. ' +
      'Зал дышит и меняет цвет вместе с вами.',
    specs: ['360° проекция', 'пол и стены', 'генеративный свет'],
    media: {
      type: 'video',
      src: asset('media/hall1.mp4'),
      poster: asset('media/hall1-poster.jpg'),
    },
    speed: 0.12,
  },
  {
    id: 'hall2',
    num: '02',
    side: 'right',
    accent: '#4d7cff',
    portal: true,
    name: 'Портал',
    alt: 'Коридор',
    desc:
      'Узкий коридор из света — переход между мирами. Неоновые линии уводят в глубину, ' +
      'медленно меняют цвет и растворяют само ощущение стен. ' +
      'Здесь вы оставляете прошлый зал позади.',
    specs: ['переход', 'свет + дым', 'смена цвета'],
    media: { type: 'image', src: asset('media/hall2.jpg') },
    speed: 0.16,
  },
  {
    id: 'hall3',
    num: '03',
    side: 'left',
    accent: '#7e6bff',
    kb: true,
    name: 'Зеркало',
    alt: 'Күзгү',
    desc:
      'Тысячи светящихся сфер отражают друг друга до бесконечности. Вы стоите внутри ' +
      'отражения, у которого нет дна, — и не сразу понимаете, где заканчиваетесь вы ' +
      'и начинается свет.',
    specs: ['бесконечное отражение', 'зеркальные сферы'],
    media: { type: 'image', src: asset('media/hall3.jpg') },
    speed: 0.16,
  },
  {
    id: 'hall4',
    num: '04',
    side: 'right',
    accent: '#ff9a3c',
    kb: true,
    name: 'Раскраски',
    alt: 'Интерактив · для детей',
    desc:
      'Дети раскрашивают барса, беркута и горы — и рисунок оживает на огромной стене: ' +
      'взлетает, бежит, кружит над юртами и вершинами. ' +
      'Искусство, которое отвечает на прикосновение.',
    specs: ['интерактив', 'дополненная реальность', 'сканирование рисунка'],
    media: { type: 'image', src: asset('media/hall4.jpg') },
    speed: 0.16,
  },
  {
    id: 'hall5',
    num: '05',
    side: 'left',
    accent: '#45c7e6',
    kb: true,
    name: 'Иссык-Куль',
    alt: 'Ысык-Көл',
    desc:
      'Вода приходит в зал. Волны и водопады стекают по поверхностям, лёд дышит холодом, ' +
      'свет колышется как на дне озера. ' +
      'Священное море Кыргызстана — на расстоянии вытянутой руки.',
    specs: ['вода и лёд', 'проекция на 4 стены'],
    media: { type: 'image', src: asset('media/hall5.jpg') },
    speed: 0.16,
  },
  {
    id: 'hall6',
    num: '06',
    side: 'right',
    accent: '#5ee0ff',
    kb: true,
    name: 'AkylAI',
    alt: 'Искусственный интеллект',
    desc:
      'Лицо, собранное из тысяч точек света, смотрит на вас и отвечает. Здесь технологии ' +
      'обретают голос — и говорят по-кыргызски. Точка, где наследие встречается с будущим.',
    specs: ['живой портрет', 'голосовой ИИ', 'кыргызский язык'],
    media: { type: 'image', src: asset('media/hall6.jpg') },
    speed: 0.16,
  },
  {
    id: 'hall7',
    num: '07',
    side: 'left',
    accent: '#ff5c8a',
    kb: true,
    name: 'Цветы',
    alt: 'Гүлдөр',
    desc:
      'Гигантские цветы раскрываются вокруг, бабочки поднимаются в воздух, барсёнок спит ' +
      'среди лепестков. Зал, из которого не хочется уходить, — ' +
      'и которым заканчивается путешествие.',
    specs: ['сад света', 'интерактивные бабочки'],
    media: { type: 'image', src: asset('media/hall7.jpg') },
    speed: 0.16,
  },
];
