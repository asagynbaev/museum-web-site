# AI Museum · Парк высоких технологий КР

Иммерсивный лендинг музея на **React + Vite**. Изначально это был один HTML-файл на
4 МБ со встроенными в base64 картинками и видео — теперь это нормальное React-приложение
с разделёнными стилями, логикой и медиа.

## Запуск

```bash
npm install
npm run dev      # дев-сервер с HMR (откроется в браузере)
npm run build    # продакшн-сборка в dist/
npm run preview  # локальный предпросмотр собранной версии
```

Требуется Node 18+.

## Структура

```
public/media/            извлечённые ассеты (9 изображений + 2 видео)
src/
  main.jsx               точка входа, подключает глобальные стили
  App.jsx                композиция страницы + общий scroll-state
  data/halls.js          данные семи залов (единый источник правды)
  data/preloadAssets.js  список медиа в порядке сверху вниз для прелоадера
  lib/asset.js           резолвинг путей к /public с учётом base URL
  styles/
    tokens.css           CSS-переменные (цвета, шрифты, размеры)
    base.css             reset, body, утилиты (.wrap, .mono, .reveal, .divider)
    animations.css       @keyframes + prefers-reduced-motion
  hooks/
    usePreloader.js      предзагрузка медиа сверху вниз + тайминг лоадера (3–5 с)
    useReducedMotion.js  отслеживает системную настройку «меньше движения»
    useInView.js         IntersectionObserver → [ref, inView]
    useScrollEffects.js  шапка, прогресс-бар, заливка rail, активный зал
    useParallax.js       параллакс фонов залов
    useHeroParallax.js   параллакс и зум hero
    useMotes.js          canvas-частицы (пылинки)
    useCursorGlow.js     свечение за курсором
  components/
    Loader.jsx           экран загрузки: предзагружает медиа, потом плавно уходит
    AmbientLayers.jsx    grain / motes / cursor glow / mobile progress
    Header.jsx           фиксированная шапка
    WayfindingRail.jsx   боковой навигатор по залам
    Hero.jsx             первый экран с видео
    Manifesto.jsx        манифест + счётчики (CountUp)
    Halls.jsx / Hall.jsx залы (рендерятся из data/halls.js)
    Visit.jsx            планирование визита
    Footer.jsx           подвал
    Logo.jsx             SVG-знак (с вращением и без)
    Reveal.jsx           обёртка для scroll-reveal
    CountUp.jsx          анимированный счётчик
```

Каждый компонент держит свой `*.css` рядом с собой; общие токены и утилиты —
в `src/styles`. Вся императивная анимация из исходного `<script>` вынесена в
переиспользуемые хуки и корректно очищается при размонтировании.

## Замечания по контенту

В разметке остались плейсхолдеры из оригинала, которые стоит заполнить:
цены билетов (`— сом`), точный адрес, телефон и e-mail в подвале.

Исходный одностраничный файл сохранён в [`reference/muzey-sveta.html`](reference/muzey-sveta.html).
