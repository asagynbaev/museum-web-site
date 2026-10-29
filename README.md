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

Требуется Node 18+ (для билетного сервера — 20.6+).

Продажа билетов работает поверх отдельного сервиса в [`server/`](server/README.md),
деплой сайта и кассы на VPS — в [`deploy/`](deploy/README.md).
Без него сайт открывается и живёт как обычно, только вместо цен будут прочерки,
а кнопка «Купить билет» покажет ошибку. Чтобы поднять всё целиком:

```bash
cd server && npm install
npm run mock      # заглушка банка  :8788
npm run dev:mock  # билетный API поверх заглушки  :8787
```

`npm run dev` (без `:mock`) поднимает тот же API, но уже против настоящего KICB —
доступы лежат в `server/.env`, который в git не хранится.

## Структура

```
public/media/            фото залов и видео первого экрана
public/media/brand/      логотип, знак «AI» и ролик с ним (экран загрузки)
src/
  main.jsx               точка входа, подключает глобальные стили
  App.jsx                композиция страницы + общий scroll-state
  data/halls.js          данные семи залов (единый источник правды)
  data/preloadAssets.js  список медиа в порядке сверху вниз для прелоадера
  lib/asset.js           резолвинг путей к /public с учётом base URL
  lib/api.js             клиент билетного API (server/)
  styles/
    tokens.css           CSS-переменные: палитра снята с логотипа, шрифты, размеры
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
    useCheckout.js       покупка билета: корзина → QR → оплаченный билет
  components/
    Loader.jsx           экран загрузки: ролик с «AI», пока предзагружаются медиа
    AmbientLayers.jsx    grain / motes / cursor glow / mobile progress
    Header.jsx           фиксированная шапка
    WayfindingRail.jsx   боковой навигатор по залам
    Hero.jsx             первый экран с видео
    Manifesto.jsx        манифест + счётчики (CountUp)
    Halls.jsx / Hall.jsx залы (рендерятся из data/halls.js)
    Visit.jsx            планирование визита (цены тянутся из server/)
    Checkout.jsx         окно покупки билета
    TicketPage.jsx       проверка билета на /ticket/:code (сюда ведёт QR из письма)
    AdminPage.jsx        касса на /admin: статусы оплат, поиск, сверка с банком
    BarsPage.jsx         голосовой гид на /bars: 3D-барс + разговор через Gemini Live
    Footer.jsx           подвал
    Logo.jsx             логотип музея (полный или только «AI»)
    Reveal.jsx           обёртка для scroll-reveal
    CountUp.jsx          анимированный счётчик
```

Голосовой гид `/bars` — отдельный чанк (three.js, Gemini, модель ~22 МБ сжатой
грузятся только там). Его код `src/concierge/` и ассеты `public/concierge/` —
**копия из репозитория ai-concierge** (`node web/scripts/export-museum.mjs`):
руками здесь не править, а экспортировать заново. В разработке разговору нужен
сервер консьержа на `:8090` (прокси `/api/live`, `/api/tools` в `vite.config.js`);
`npm run build` после сборки кладёт `.gz` рядом с моделью (`scripts/precompress.mjs`).

Каждый компонент держит свой `*.css` рядом с собой; общие токены и утилиты —
в `src/styles`. Вся императивная анимация из исходного `<script>` вынесена в
переиспользуемые хуки и корректно очищается при размонтировании.

## Замечания по контенту

В разметке остались плейсхолдеры из оригинала, которые стоит заполнить:
точный адрес, телефон и e-mail в подвале.

**Цены билетов задаются на сервере** — в `server/.env` (`PRICE_ADULT` и соседние).
Сейчас: взрослый **1600**, детский / студенческий **1200**, семейный 2+2 **4800 сом**
(цена трёх взрослых).
Витрина и касса берут прайс из одного места, поэтому разъехаться они не могут.

Исходный одностраничный файл сохранён в [`reference/muzey-sveta.html`](reference/muzey-sveta.html).
