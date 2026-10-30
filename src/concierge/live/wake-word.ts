// Copied from ai-concierge/web/src/live/wake-word.ts by scripts/export-museum.mjs - edit it there and export again.
// Wake word: while no conversation runs, the browser's own speech recognition (Web Speech API; in Chrome it is
// Google's cloud recogniser - free, no key) listens for the leopard's name and fires once it is heard. Only the name
// is looked for: the question around it reaches Gemini as audio (embed/bars-concierge.ts keeps the last seconds of
// the microphone), so Kyrgyz and English questions work although the recogniser runs in Russian.
// Measured on a recording of "Здравствуйте, я Батай, ваш цифровой консьерж": Chrome 156 writes the name «ботай»
// (the unstressed о/а), in an interim result ~1 s after it was said. Chrome hears a fake / chosen microphone only
// through start(track); Edge returned nonsense from the same track ("Я сейчас когда?"), so it listens to the
// default microphone itself.

interface Alternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  0: Alternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [i: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
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

/** The name as the recogniser writes it - батай, ботай, бадай, потай, батаи - and its case forms (Батая, Батаю). */
const NAME = /(?:^|[^а-яёa-z])(?:[бп][аоы][тд][аоя][йияю]|batai|batay)(?=$|[^а-яёa-z])/i;
const USE_TRACK = !/\bEdg\//.test(navigator.userAgent);
/** Errors after which listening is pointless: no microphone permission, the service is off, no Russian. */
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported']);

export class WakeWord {
  private rec?: Recognition;
  private on = false;
  private fails = 0;
  private restartTimer?: ReturnType<typeof setTimeout>;

  /** onName: the name was heard (listening has stopped); onFatal: listening is impossible (see FATAL). */
  constructor(private readonly onName: () => void, private readonly onFatal: (why: string) => void) {}

  static get supported(): boolean {
    return !!recognitionCtor();
  }

  /** Listens to `track` (the page's microphone) until the name is heard or stop(). */
  start(track?: MediaStreamTrack): void {
    if (this.on) return;
    this.on = true;
    this.fails = 0;
    this.run(track);
  }

  stop(): void {
    this.on = false;
    clearTimeout(this.restartTimer);
    const r = this.rec;
    this.rec = undefined;
    if (!r) return;
    r.onresult = r.onerror = r.onend = null;
    try {
      r.abort();
    } catch {
      // (already ended)
    }
  }

  private run(track?: MediaStreamTrack): void {
    const Ctor = recognitionCtor();
    if (!Ctor || !this.on) return;
    const r = new Ctor();
    r.lang = 'ru-RU';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      this.fails = 0;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!NAME.test(e.results[i][0].transcript)) continue;
        this.stop();
        this.onName();
        return;
      }
    };
    r.onerror = (e) => {
      if (FATAL.has(e.error)) {
        this.stop();
        this.onFatal(e.error);
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        this.fails++;   // (network and the like: the restart backs off)
      }
    };
    // Chrome ends a continuous session every so often and after a silence: start a new one.
    r.onend = () => {
      if (this.rec !== r) return;
      const wait = this.fails ? Math.min(30_000, 1000 * 2 ** this.fails) : 250;
      this.restartTimer = setTimeout(() => this.run(track), wait);
    };
    this.rec = r;
    try {
      r.start(USE_TRACK ? track : undefined);   // (a browser without start(track) ignores it: the default microphone)
    } catch (err) {
      this.stop();
      this.onFatal(String(err));
    }
  }
}
