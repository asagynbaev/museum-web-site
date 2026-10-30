// Copied from ai-concierge/web/src/live/wake-word.ts by scripts/export-museum.mjs - edit it there and export again.
// Wake word: while no conversation runs, the browser's own speech recognition (Web Speech API; in Chrome it is
// Google's cloud recogniser - free, no key) listens for the leopard's name and fires once it is heard. Only the name
// is looked for: the question around it reaches Gemini as audio (embed/bars-concierge.ts keeps the last seconds of
// the microphone), so the question itself may be in any of the leopard's languages.
// Two recognisers listen together (CHANNELS), through start(track), to a 16 kHz copy of the page's microphone
// (audio/mic.ts): Chrome hears a fake / chosen microphone only that way, and Edge garbled the 48 kHz capture track but
// recognised the 16 kHz copy as well as Chrome. Measured on the leopard saying his name (Chrome 156):
//   Russian «Меня зовут Кокурок» - ru-RU: «кокурок», «кокурак»; kk-KZ: «көкурак»
//   Kyrgyz «Менин атым Көкүрөк» - ru-RU: nothing («меню натум»); kk-KZ: «көкірек», «гүкірек», «гүү күрек»
//   English «I am Kokurok», Japanese «コクロクと申します» - ru-RU: nothing; kk-KZ: «көкірек», «крокурок»
// Chrome has no Kyrgyz model (its ky-KG writes English: «mini Lotto gokulak»; Edge's fails with 'network'); Kazakh,
// a Turkic language with ө and ү, knows «көкірек» - Kyrgyz «көкүрөк» ('chest'). Chrome's Kazakh gives no interim
// results, and in continuous mode nothing before stop(): it listens phrase by phrase (a final ~0.5 s after the
// phrase). Edge's Kazakh loses the Kyrgyz «Көкүрөк» («Менің атым беру керек») but its Turkish has it («Menin atın
// gökürök»; Chrome's: «benim atım gökyürek»), so Turkish listens too.

interface Alternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  length: number;
  [k: number]: Alternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [i: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(track?: MediaStreamTrack): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

const recognitionCtor = (): RecognitionCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

/** The recognisers listening at once (see the top): Russian and Turkish continuously, Kazakh phrase by phrase. */
const CHANNELS = [
  { lang: 'ru-RU', continuous: true },
  { lang: 'kk-KZ', continuous: false },
  { lang: 'tr-TR', continuous: true },
];

const V = 'аоуыэеёюяиөүұіә';   // vowels, Russian and Kazakh
const W = `а-яё${V}қғңһa-z`;    // word letters
/**
 * The name as the recognisers write it: K-V-K-V-р-V-K, with к/г/қ and any vowel - Russian кокурок, кокурак, кукурук,
 * кокорок; Kazakh көкірек, гүкірек, гөкірек, гүкірақ, a doubled «гүү күрек»; English heard as «крокурок»; split «коку
 * рок»; without the last к when that sticks to the next word («я кокура кваш гид») - and case forms (Кокурока,
 * Кокуроку); Edge's «Гюк рок» and «gökürk» (the vowel before р swallowed); not the rooster's «кукареку», «кукуруза»
 * nor «как рок…»; plus Latin spellings.
 */
const NAME_SOURCE =
  `(?:^|[^${W}])(?!кукарек|как\\s)[кгқ]р?[${V}]{1,2}\\s?[кгқ][${V}]?\\s?р[${V}][кгқ]?(?:а|у|ом|ам|е|і|гі|ке|ка|қа|ға)?(?=$|[^${W}])`
    + '|\\b[kgc]r?[oöuüa]{1,2}[kgc]{1,2}[oöuüay]{0,2}\\s?r[oöuüae]{0,2}[kc]';
const NAME = new RegExp(NAME_SOURCE, 'i');
const NAMES = new RegExp(NAME_SOURCE, 'gi');

/** The guest said only the name («Кокурок!», «kokurak.»): the leopard's «Да, слушаю» waits for the question. */
export function onlyName(text: string): boolean {
  return NAME.test(text) && text.replace(NAMES, ' ').replace(/[\s.,!?…«»"'-]+/g, '').length < 3;
}
/** Errors after which a recogniser stops for good: no microphone permission, the service is off, its language
 * unsupported; and MAX_FAILS other failures in a row (the service out of reach). */
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported']);
const MAX_FAILS = 5;

interface Channel {
  lang: string;
  continuous: boolean;
  rec?: Recognition;
  fails: number;
  dead: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

export class WakeWord {
  private on = false;
  private track?: MediaStreamTrack;
  private channels: Channel[] = [];

  /** onName: the name was heard (listening has stopped); onFatal: no recogniser can listen (see FATAL). */
  constructor(private readonly onName: () => void, private readonly onFatal: (why: string) => void) {}

  static get supported(): boolean {
    return !!recognitionCtor();
  }

  /** Listens to `track` (the page's microphone) until the name is heard or stop(). */
  start(track?: MediaStreamTrack): void {
    if (this.on) return;
    this.on = true;
    this.track = track;
    this.channels = CHANNELS.map((c) => ({ ...c, fails: 0, dead: false }));
    for (const c of this.channels) this.run(c);
  }

  stop(): void {
    this.on = false;
    for (const c of this.channels) this.kill(c);
  }

  private kill(c: Channel): void {
    clearTimeout(c.timer);
    const r = c.rec;
    c.rec = undefined;
    if (!r) return;
    r.onresult = r.onerror = r.onend = null;
    try {
      r.abort();
    } catch {
      // (already ended)
    }
  }

  /** A recogniser that cannot listen stops; the others go on - only when none is left is the wake word off. */
  private drop(c: Channel, why: string): void {
    this.kill(c);
    c.dead = true;
    if (this.on && this.channels.every((x) => x.dead)) {
      this.on = false;
      this.onFatal(why);
    }
  }

  private run(c: Channel): void {
    const Ctor = recognitionCtor();
    if (!Ctor || !this.on || c.dead) return;
    const r = new Ctor();
    r.lang = c.lang;
    r.continuous = c.continuous;
    r.interimResults = true;
    r.maxAlternatives = 5;   // (the name is often only in a lower hypothesis: «курок Меня зовут кокурок | кукурок …»)
    r.onresult = (e) => {
      c.fails = 0;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        for (let k = 0; k < res.length; k++) {
          if (!NAME.test(res[k].transcript)) continue;
          this.stop();
          this.onName();
          return;
        }
      }
    };
    r.onerror = (e) => {
      if (FATAL.has(e.error)) this.drop(c, `${c.lang}: ${e.error}`);
      else if (e.error !== 'no-speech' && e.error !== 'aborted' && ++c.fails >= MAX_FAILS) {
        this.drop(c, `${c.lang}: ${e.error} ×${MAX_FAILS}`);
      }   // (network and the like, fewer times: the restart backs off)
    };
    // A continuous session ends every so often and after a silence, a phrase-by-phrase one after each phrase.
    r.onend = () => {
      if (c.rec !== r || c.dead || !this.on) return;
      const wait = c.fails ? Math.min(30_000, 1000 * 2 ** c.fails) : c.continuous ? 250 : 50;
      c.timer = setTimeout(() => this.run(c), wait);
    };
    c.rec = r;
    try {
      r.start(this.track);   // (a browser without start(track) ignores it and takes the default microphone)
    } catch (err) {
      this.drop(c, `${c.lang}: ${err}`);
    }
  }
}
