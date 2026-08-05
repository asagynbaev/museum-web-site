/**
 * UI-тексты для трёх языков: русский (ru), кыргызский (ky), английский (en).
 *
 * Переводы смысловые, а не буквальные: поэтичные формулировки описаний залов
 * и манифеста адаптированы под каждый язык. Кыргызский текст желательно отдать
 * на финальную вычитку носителю — особенно образные фразы.
 *
 * Строки с выделенным словом (<em>) хранятся сегментами: [{ t }, { t, em: true }].
 */

const ru = {
  code: 'ru',
  brandSub: 'Парк высоких технологий · КР',

  nav: { halls: 'Залы', visit: 'Визит', contacts: 'Контакты', tickets: 'Билеты' },

  hero: {
    eyebrow: 'Парк высоких технологий · Бишкек',
    title: [
      [{ t: 'Память,' }],
      [{ t: 'написанная ' }, { t: 'светом', em: true }],
    ],
    sub:
      'Иммерсивный музей из семи залов, где древние образы Кыргызстана — ' +
      'петроглифы, барс, беркут, Ысык-Көл — оживают в цифровом свете.',
    scrollcue: 'Пройти семь залов',
  },

  manifesto: {
    lead: [
      { t: 'От наскальных знаков ' },
      { t: 'Саймалуу-Таша', em: true },
      { t: ' до искусственного интеллекта — семь пространств, собранных из света, воды и движения.' },
    ],
    body1:
      'Это не выставка, на которую смотрят. Музей реагирует на каждого, кто входит: ' +
      'проекции текут под ногами, рисунки оживают на стенах, отражения уходят в бесконечность.',
    body2:
      'Каждый зал — отдельный мир со своим светом, цветом и ритмом. ' +
      'Путь длиной примерно в час ведёт от истоков до будущего.',
    stats: ['Залов', 'Минут пути', 'Проекция'],
  },

  hall: { zone: 'Зал' },

  halls: {
    hall1: {
      name: 'Эволюция',
      alt: 'Большой зал',
      desc:
        'С первого шага вас окружает живая материя. Реки света текут по полу и стенам, ' +
        'вспыхивают звёздными полями и снова сворачиваются в первичный хаос. ' +
        'Зал дышит и меняет цвет вместе с вами.',
      specs: ['360° проекция', 'пол и стены', 'генеративный свет'],
    },
    hall2: {
      name: 'Портал',
      alt: 'Коридор',
      desc:
        'Узкий коридор из света — переход между мирами. Неоновые линии уводят в глубину, ' +
        'медленно меняют цвет и растворяют само ощущение стен. ' +
        'Здесь вы оставляете прошлый зал позади.',
      specs: ['переход', 'свет + дым', 'смена цвета'],
    },
    hall3: {
      name: 'Зеркало',
      alt: 'Күзгү',
      desc:
        'Тысячи светящихся сфер отражают друг друга до бесконечности. Вы стоите внутри ' +
        'отражения, у которого нет дна, — и не сразу понимаете, где заканчиваетесь вы ' +
        'и начинается свет.',
      specs: ['бесконечное отражение', 'зеркальные сферы'],
    },
    hall4: {
      name: 'Раскраски',
      alt: 'Интерактив · для детей',
      desc:
        'Дети раскрашивают барса, беркута и горы — и рисунок оживает на огромной стене: ' +
        'взлетает, бежит, кружит над юртами и вершинами. ' +
        'Искусство, которое отвечает на прикосновение.',
      specs: ['интерактив', 'дополненная реальность', 'сканирование рисунка'],
    },
    hall5: {
      name: 'Иссык-Куль',
      alt: 'Ысык-Көл',
      desc:
        'Вода приходит в зал. Волны и водопады стекают по поверхностям, лёд дышит холодом, ' +
        'свет колышется как на дне озера. ' +
        'Священное море Кыргызстана — на расстоянии вытянутой руки.',
      specs: ['вода и лёд', 'проекция на 4 стены'],
    },
    hall6: {
      name: 'AkylAI',
      alt: 'Искусственный интеллект',
      desc:
        'Лицо, собранное из тысяч точек света, смотрит на вас и отвечает. Здесь технологии ' +
        'обретают голос — и говорят по-кыргызски. Точка, где наследие встречается с будущим.',
      specs: ['живой портрет', 'голосовой ИИ', 'кыргызский язык'],
    },
    hall7: {
      name: 'Цветы',
      alt: 'Гүлдөр',
      desc:
        'Гигантские цветы раскрываются вокруг, бабочки поднимаются в воздух, барсёнок спит ' +
        'среди лепестков. Зал, из которого не хочется уходить, — ' +
        'и которым заканчивается путешествие.',
      specs: ['сад света', 'интерактивные бабочки'],
    },
  },

  visit: {
    title: [{ t: 'Спланируйте ' }, { t: 'визит', em: true }],
    whereH: 'Где',
    whereBig: 'Парк высоких технологий',
    whereCity: 'Бишкек, Кыргызская Республика',
    addrPlaceholder: '— укажите точный адрес —',
    openMap: 'Открыть в 2ГИС →',
    hoursH: 'Часы работы',
    days: [
      ['Вторник — Пятница', '10:00–20:00'],
      ['Суббота — Воскресенье', '10:00–21:00'],
      ['Понедельник', 'выходной'],
    ],
    ticketsH: 'Билеты',
    pricePending: '— сом',
    buy: 'Купить билет',
    route: 'Построить маршрут',
    duration: 'Длительность · ~60 мин · 7 залов',
  },

  checkout: {
    eyebrow: 'Билеты',
    close: 'Закрыть',
    som: 'сом',
    tariffs: {
      adult: 'Взрослый',
      reduced: 'Детский / студент',
      family: 'Семейный (2+2)',
    },

    cartTitle: 'Сколько вас будет?',
    minus: 'Убрать',
    plus: 'Добавить',
    emailLabel: 'E-mail',
    emailPlaceholder: 'you@example.com',
    emailHint: 'На этот адрес придёт билет с QR-кодом',
    total: 'Итого',
    pay: 'Перейти к оплате',
    creating: 'Создаём QR…',

    qrTitle: 'Отсканируйте QR',
    qrHint: 'Камерой телефона или приложением вашего банка — оплата пройдёт через KICB.',
    qrProcessingTitle: 'Платёж обрабатывается',
    qrProcessingHint: 'Не закрывайте окно — банк подтверждает операцию.',
    qrAlt: 'QR-код для оплаты',
    openApp: 'Открыть приложение банка',
    statusWaiting: 'Ожидаем оплату',
    statusProcessing: 'Подтверждаем',
    expiresIn: 'QR действителен ещё',
    cancel: 'Отменить оплату',

    doneTitle: 'Билет ваш',
    doneHint: 'Мы отправили его на {email}. Покажите QR на входе — распечатывать не нужно.',
    ticketCode: 'Код билета',
    doneCta: 'Готово',

    errorTitle: 'Что-то пошло не так',
    retry: 'Попробовать снова',
    errors: {
      create: 'Не удалось создать оплату. Попробуйте ещё раз.',
      network: 'Нет связи с сервером. Проверьте интернет.',
      bank: 'Банк временно недоступен. Попробуйте через минуту.',
      throttled: 'Слишком много попыток. Подождите пару минут.',
      declined: 'Платёж не прошёл — деньги не списаны.',
      expired: 'Время на оплату вышло. Создайте новый QR.',
      lost: 'Заказ не найден. Начните заново.',
    },
  },

  footer: {
    colMuseum: 'Музей',
    linkHalls: 'Залы',
    linkVisit: 'Визит',
    linkTickets: 'Билеты',
    linkGroups: 'Группам и школам',
    colContacts: 'Контакты',
    bottom1: '© 2026 Парк высоких технологий Кыргызской Республики',
    bottom2: 'Свет · Вода · Память · Технология',
  },

  ticket: {
    eyebrow: 'Билет',
    checking: 'Проверяем билет…',
    validTitle: 'Билет действителен',
    validNote: 'Покажите этот экран на входе. Билет действителен на одно посещение.',
    unknownTitle: 'Билет не найден',
    unknownNote: 'Такого билета нет или он не оплачен. Проверьте код в письме.',
    errorTitle: 'Не удалось проверить',
    errorNote: 'Нет связи с сервером. Обновите страницу через минуту.',
    seats: 'Мест',
    paid: 'Оплачено',
    paidAt: 'Дата оплаты',
    toSite: 'На сайт музея',
  },

  loader: { intro: 'Вступление', hero: 'Память, написанная светом' },

  rail: { caption: 'Маршрут' },

  backToTop: 'Наверх',
  carousel: { slide: 'Слайд' },

  a11y: { openMenu: 'Открыть меню', closeMenu: 'Закрыть меню' },
  meta: {
    title: 'AI Museum · Парк высоких технологий КР',
    description:
      'Иммерсивный музей из семи залов, где древние образы Кыргызстана — петроглифы, ' +
      'барс, беркут, Ысык-Көл — оживают в цифровом свете.',
  },
};

const ky = {
  code: 'ky',
  brandSub: 'Жогорку технологиялар паркы · КР',

  nav: { halls: 'Залдар', visit: 'Баруу', contacts: 'Байланыш', tickets: 'Билеттер' },

  hero: {
    eyebrow: 'Жогорку технологиялар паркы · Бишкек',
    title: [
      [{ t: 'Эс-тутум —' }],
      [{ t: 'жарык', em: true }, { t: ' менен жазылган' }],
    ],
    sub:
      'Кыргызстандын байыркы образдары — петроглифтер, илбирс, бүркүт, Ысык-Көл — ' +
      'санарип жарыгында кайра жашоого келген жети залдуу иммерсивдик музей.',
    scrollcue: 'Жети залды кыдырып чыгыңыз',
  },

  manifesto: {
    lead: [
      { t: '' },
      { t: 'Саймалуу-Таштын', em: true },
      { t: ' аска сүрөттөрүнөн жасалма интеллектке чейин — жарыктан, суудан жана кыймылдан курулган жети мейкиндик.' },
    ],
    body1:
      'Бул жөн гана карап турган көргөзмө эмес. Музей ичине кирген ар бир адамга жооп берет: ' +
      'буттун астында проекциялар агып, дубалдарда сүрөттөр тирилип, чагылышуулар түбөлүккө созулат.',
    body2:
      'Ар бир зал — өзүнүн жарыгы, түсү жана ыргагы бар өзүнчө дүйнө. ' +
      'Болжол менен бир сааттык жол башаттан келечекке алып барат.',
    stats: ['Зал', 'Мүнөт жол', 'Проекция'],
  },

  hall: { zone: 'Зал' },

  halls: {
    hall1: {
      name: 'Эволюция',
      alt: 'Чоң зал',
      desc:
        'Биринчи кадамдан баштап сизди тирүү материя курчап турат. Жарык дарыялары пол менен ' +
        'дубалдарды бойлой агып, жылдыздуу талааларга айланып, кайра алгачкы башаламандыкка оролот. ' +
        'Зал сиз менен бирге дем алып, түсүн өзгөртөт.',
      specs: ['360° проекция', 'пол жана дубалдар', 'генеративдик жарык'],
    },
    hall2: {
      name: 'Портал',
      alt: 'Коридор',
      desc:
        'Жарыктан жасалган тар коридор — дүйнөлөрдүн ортосундагы өтмө. Неон сызыктары тереңдикке ' +
        'жетелеп, акырын түсүн өзгөртүп, дубалдардын сезимин эритип жок кылат. ' +
        'Бул жерде мурунку залды артта каласыз.',
      specs: ['өтмө', 'жарык + түтүн', 'түс алмашуу'],
    },
    hall3: {
      name: 'Күзгү',
      alt: 'Чагылышуу',
      desc:
        'Миңдеген жаркыраган шарлар бири-бирин чексиздикке чейин чагылдырат. Сиз түбү жок ' +
        'чагылышуунун ичинде турасыз — жана өзүңүз кайда бүтүп, жарык кайдан башталганын ' +
        'дароо түшүнбөйсүз.',
      specs: ['чексиз чагылышуу', 'күзгү шарлар'],
    },
    hall4: {
      name: 'Боёо сүрөттөр',
      alt: 'Интерактив · балдар үчүн',
      desc:
        'Балдар илбирсти, бүркүттү жана тоолорду боёшот — сүрөт болсо алп дубалда тирилет: ' +
        'асманга көтөрүлүп, чуркап, боз үйлөр менен чокулардын үстүндө айланат. ' +
        'Тийүүгө жооп берген искусство.',
      specs: ['интерактив', 'толукталган чындык', 'сүрөттү сканерлөө'],
    },
    hall5: {
      name: 'Ысык-Көл',
      alt: 'Ыйык деңиз',
      desc:
        'Сууга зал толот. Толкундар менен шаркыратмалар беттерден агып, муз суукту дем алат, ' +
        'жарык көлдүн түбүндөгүдөй термелет. ' +
        'Кыргызстандын ыйык деңизи — кол сунса жете турган жерде.',
      specs: ['суу жана муз', '4 дубалга проекция'],
    },
    hall6: {
      name: 'AkylAI',
      alt: 'Жасалма интеллект',
      desc:
        'Миңдеген жарык чекиттеринен түзүлгөн жүз сизге карап, жооп берет. Бул жерде технология ' +
        'үн табат — жана кыргызча сүйлөйт. Мурас келечек менен жолуккан чекит.',
      specs: ['тирүү портрет', 'үн ИИ', 'кыргыз тили'],
    },
    hall7: {
      name: 'Гүлдөр',
      alt: 'Гүл бакча',
      desc:
        'Айланада алп гүлдөр ачылат, көпөлөктөр абага көтөрүлөт, илбирстин баласы ' +
        'желекчелердин арасында уктайт. Чыккың келбеген зал — ' +
        'жана саякат ушуну менен аяктайт.',
      specs: ['жарык бакча', 'интерактивдүү көпөлөктөр'],
    },
  },

  visit: {
    title: [{ t: 'Барууну', em: true }, { t: ' пландаштырыңыз' }],
    whereH: 'Кайда',
    whereBig: 'Жогорку технологиялар паркы',
    whereCity: 'Бишкек, Кыргыз Республикасы',
    addrPlaceholder: '— так дарек көрсөтүлсүн —',
    openMap: '2ГИСтен ачуу →',
    hoursH: 'Иштөө убактысы',
    days: [
      ['Шейшемби — Жума', '10:00–20:00'],
      ['Ишемби — Жекшемби', '10:00–21:00'],
      ['Дүйшөмбү', 'дем алыш'],
    ],
    ticketsH: 'Билеттер',
    pricePending: '— сом',
    buy: 'Билет сатып алуу',
    route: 'Маршрут түзүү',
    duration: 'Узактыгы · ~60 мүн · 7 зал',
  },

  checkout: {
    eyebrow: 'Билеттер',
    close: 'Жабуу',
    som: 'сом',
    tariffs: {
      adult: 'Чоңдор',
      reduced: 'Балдар / студент',
      family: 'Үй-бүлөлүк (2+2)',
    },

    cartTitle: 'Канчооңуз болосуз?',
    minus: 'Азайтуу',
    plus: 'Кошуу',
    emailLabel: 'E-mail',
    emailPlaceholder: 'you@example.com',
    emailHint: 'Билет QR коду менен ушул дарекке келет',
    total: 'Жалпы',
    pay: 'Төлөөгө өтүү',
    creating: 'QR түзүлүүдө…',

    qrTitle: 'QR кодду скандаңыз',
    qrHint: 'Телефондун камерасы же банк колдонмоңуз менен — төлөм KICB аркылуу өтөт.',
    qrProcessingTitle: 'Төлөм иштелүүдө',
    qrProcessingHint: 'Терезени жаппаңыз — банк операцияны ырастап жатат.',
    qrAlt: 'Төлөм үчүн QR код',
    openApp: 'Банк колдонмосун ачуу',
    statusWaiting: 'Төлөмдү күтүүдө',
    statusProcessing: 'Ырасталууда',
    expiresIn: 'QR дагы жарактуу',
    cancel: 'Төлөмдү жокко чыгаруу',

    doneTitle: 'Билет сиздики',
    doneHint: 'Аны {email} дарегине жөнөттүк. Кирүүдө QR кодду көрсөтүңүз — басып чыгаруунун кажети жок.',
    ticketCode: 'Билеттин коду',
    doneCta: 'Даяр',

    errorTitle: 'Бир жерден ката кетти',
    retry: 'Кайра аракет кылуу',
    errors: {
      create: 'Төлөмдү түзүү мүмкүн болбоду. Кайра аракет кылыңыз.',
      network: 'Сервер менен байланыш жок. Интернетти текшериңиз.',
      bank: 'Банк убактылуу жеткиликсиз. Бир мүнөттөн кийин аракет кылыңыз.',
      throttled: 'Аракет өтө көп болду. Бир нече мүнөт күтө туруңуз.',
      declined: 'Төлөм өткөн жок — акча алынган жок.',
      expired: 'Төлөө убактысы бүттү. Жаңы QR түзүңүз.',
      lost: 'Буйрутма табылган жок. Кайра баштаңыз.',
    },
  },

  footer: {
    colMuseum: 'Музей',
    linkHalls: 'Залдар',
    linkVisit: 'Баруу',
    linkTickets: 'Билеттер',
    linkGroups: 'Топтор жана мектептер',
    colContacts: 'Байланыш',
    bottom1: '© 2026 Кыргыз Республикасынын Жогорку технологиялар паркы',
    bottom2: 'Жарык · Суу · Эс-тутум · Технология',
  },

  ticket: {
    eyebrow: 'Билет',
    checking: 'Билет текшерилүүдө…',
    validTitle: 'Билет жарактуу',
    validNote: 'Кирүүдө ушул экранды көрсөтүңүз. Билет бир жолу баруу үчүн жарактуу.',
    unknownTitle: 'Билет табылган жок',
    unknownNote: 'Мындай билет жок же төлөнгөн эмес. Каттагы кодду текшериңиз.',
    errorTitle: 'Текшерүү мүмкүн болбоду',
    errorNote: 'Сервер менен байланыш жок. Бир мүнөттөн кийин баракты жаңыртыңыз.',
    seats: 'Орун',
    paid: 'Төлөндү',
    paidAt: 'Төлөм күнү',
    toSite: 'Музей сайтына',
  },

  loader: { intro: 'Кириш', hero: 'Жарык менен жазылган эс-тутум' },

  rail: { caption: 'Маршрут' },

  backToTop: 'Жогору',
  carousel: { slide: 'Слайд' },

  a11y: { openMenu: 'Менюну ачуу', closeMenu: 'Менюну жабуу' },
  meta: {
    title: 'AI Museum · Жогорку технологиялар паркы КР',
    description:
      'Кыргызстандын байыркы образдары — петроглифтер, илбирс, бүркүт, Ысык-Көл — ' +
      'санарип жарыгында тирилген жети залдуу иммерсивдик музей.',
  },
};

const en = {
  code: 'en',
  brandSub: 'High Technology Park · KR',

  nav: { halls: 'Halls', visit: 'Visit', contacts: 'Contacts', tickets: 'Tickets' },

  hero: {
    eyebrow: 'High Technology Park · Bishkek',
    title: [
      [{ t: 'Memory,' }],
      [{ t: 'written in ' }, { t: 'light', em: true }],
    ],
    sub:
      'An immersive museum of seven halls, where the ancient images of Kyrgyzstan — ' +
      'petroglyphs, the snow leopard, the golden eagle, Ysyk-Köl — come alive in digital light.',
    scrollcue: 'Walk the seven halls',
  },

  manifesto: {
    lead: [
      { t: 'From the rock carvings of ' },
      { t: 'Saimaluu-Tash', em: true },
      { t: ' to artificial intelligence — seven spaces built from light, water and motion.' },
    ],
    body1:
      'This is not an exhibition you simply look at. The museum responds to everyone who enters: ' +
      'projections flow beneath your feet, drawings come alive on the walls, reflections stretch into infinity.',
    body2:
      'Each hall is a separate world with its own light, colour and rhythm. ' +
      'A journey of about an hour leads from the origins to the future.',
    stats: ['Halls', 'Minutes', 'Projection'],
  },

  hall: { zone: 'Hall' },

  halls: {
    hall1: {
      name: 'Evolution',
      alt: 'Main Hall',
      desc:
        'From your first step, living matter surrounds you. Rivers of light flow across the floor ' +
        'and walls, flare into starfields and fold back into primordial chaos. ' +
        'The hall breathes and shifts colour with you.',
      specs: ['360° projection', 'floor & walls', 'generative light'],
    },
    hall2: {
      name: 'Portal',
      alt: 'Corridor',
      desc:
        'A narrow corridor of light — a passage between worlds. Neon lines draw you into the depth, ' +
        'slowly shift colour and dissolve the very sense of walls. ' +
        'Here you leave the previous hall behind.',
      specs: ['passage', 'light + haze', 'colour shift'],
    },
    hall3: {
      name: 'Mirror',
      alt: 'Küzgü',
      desc:
        'Thousands of glowing spheres reflect one another into infinity. You stand inside a ' +
        'reflection that has no bottom — and cannot tell at once where you end and the light begins.',
      specs: ['infinite reflection', 'mirror spheres'],
    },
    hall4: {
      name: 'Colouring',
      alt: 'Interactive · for kids',
      desc:
        'Children colour the snow leopard, the golden eagle and the mountains — and the drawing ' +
        'comes alive on a giant wall: it soars, runs and circles above yurts and peaks. ' +
        'Art that responds to touch.',
      specs: ['interactive', 'augmented reality', 'drawing scan'],
    },
    hall5: {
      name: 'Issyk-Kul',
      alt: 'Ysyk-Köl',
      desc:
        'Water enters the hall. Waves and waterfalls run down the surfaces, ice breathes cold, ' +
        'light ripples as on a lake bed. ' +
        'The sacred sea of Kyrgyzstan — within arm’s reach.',
      specs: ['water & ice', 'projection on 4 walls'],
    },
    hall6: {
      name: 'AkylAI',
      alt: 'Artificial intelligence',
      desc:
        'A face made of thousands of points of light looks at you and answers. Here technology ' +
        'finds a voice — and speaks Kyrgyz. The point where heritage meets the future.',
      specs: ['living portrait', 'voice AI', 'Kyrgyz language'],
    },
    hall7: {
      name: 'Flowers',
      alt: 'Güldör',
      desc:
        'Giant flowers open all around, butterflies rise into the air, a snow-leopard cub sleeps ' +
        'among the petals. A hall you don’t want to leave — and the one that ends the journey.',
      specs: ['garden of light', 'interactive butterflies'],
    },
  },

  visit: {
    title: [{ t: 'Plan your ' }, { t: 'visit', em: true }],
    whereH: 'Where',
    whereBig: 'High Technology Park',
    whereCity: 'Bishkek, Kyrgyz Republic',
    addrPlaceholder: '— exact address to be added —',
    openMap: 'Open in 2GIS →',
    hoursH: 'Opening hours',
    days: [
      ['Tuesday — Friday', '10:00–20:00'],
      ['Saturday — Sunday', '10:00–21:00'],
      ['Monday', 'closed'],
    ],
    ticketsH: 'Tickets',
    pricePending: '— som',
    buy: 'Buy a ticket',
    route: 'Get directions',
    duration: 'Duration · ~60 min · 7 halls',
  },

  checkout: {
    eyebrow: 'Tickets',
    close: 'Close',
    som: 'som',
    tariffs: {
      adult: 'Adult',
      reduced: 'Child / student',
      family: 'Family (2+2)',
    },

    cartTitle: 'How many of you?',
    minus: 'Remove',
    plus: 'Add',
    emailLabel: 'E-mail',
    emailPlaceholder: 'you@example.com',
    emailHint: 'Your ticket with a QR code goes to this address',
    total: 'Total',
    pay: 'Continue to payment',
    creating: 'Creating QR…',

    qrTitle: 'Scan the QR',
    qrHint: 'With your phone camera or your banking app — payment runs through KICB.',
    qrProcessingTitle: 'Payment is processing',
    qrProcessingHint: 'Keep this window open — the bank is confirming the transaction.',
    qrAlt: 'Payment QR code',
    openApp: 'Open banking app',
    statusWaiting: 'Waiting for payment',
    statusProcessing: 'Confirming',
    expiresIn: 'QR valid for',
    cancel: 'Cancel payment',

    doneTitle: 'The ticket is yours',
    doneHint: 'We sent it to {email}. Show the QR at the entrance — no need to print it.',
    ticketCode: 'Ticket code',
    doneCta: 'Done',

    errorTitle: 'Something went wrong',
    retry: 'Try again',
    errors: {
      create: 'Could not start the payment. Please try again.',
      network: 'No connection to the server. Check your internet.',
      bank: 'The bank is temporarily unavailable. Try again in a minute.',
      throttled: 'Too many attempts. Please wait a couple of minutes.',
      declined: 'The payment did not go through — you were not charged.',
      expired: 'The payment window has closed. Create a new QR.',
      lost: 'Order not found. Please start over.',
    },
  },

  footer: {
    colMuseum: 'Museum',
    linkHalls: 'Halls',
    linkVisit: 'Visit',
    linkTickets: 'Tickets',
    linkGroups: 'Groups & schools',
    colContacts: 'Contacts',
    bottom1: '© 2026 High Technology Park of the Kyrgyz Republic',
    bottom2: 'Light · Water · Memory · Technology',
  },

  ticket: {
    eyebrow: 'Ticket',
    checking: 'Checking the ticket…',
    validTitle: 'Ticket is valid',
    validNote: 'Show this screen at the entrance. Valid for a single visit.',
    unknownTitle: 'Ticket not found',
    unknownNote: 'No such ticket, or it has not been paid. Check the code in your email.',
    errorTitle: 'Could not verify',
    errorNote: 'No connection to the server. Refresh the page in a minute.',
    seats: 'Seats',
    paid: 'Paid',
    paidAt: 'Payment date',
    toSite: 'To the museum site',
  },

  loader: { intro: 'Intro', hero: 'Memory written in light' },

  rail: { caption: 'Route' },

  backToTop: 'Top',
  carousel: { slide: 'Slide' },

  a11y: { openMenu: 'Open menu', closeMenu: 'Close menu' },
  meta: {
    title: 'AI Museum · High Technology Park KR',
    description:
      'An immersive museum of seven halls where the ancient images of Kyrgyzstan — ' +
      'petroglyphs, the snow leopard, the golden eagle, Ysyk-Köl — come alive in digital light.',
  },
};

export const translations = { ru, ky, en };
export const LANGS = [
  { code: 'ru', label: 'RU' },
  { code: 'ky', label: 'KG' },
  { code: 'en', label: 'EN' },
];
