// Copied from ai-concierge/web/src/embed/bars-concierge.ts by scripts/export-museum.mjs - edit it there and export again.
// The snow leopard concierge for another site's page (the museum site's /bars; scripts/export-museum.mjs copies it
// there with its modules): the bars avatar and the Gemini Live conversation of main.ts - captions, emotions, the
// reply guards, forgetting after 3 min - without the kiosk's other engines, settings and metrics. Optionally it
// waits for its name like a smart speaker (wakeWord): "Батай, сколько стоит билет?" starts the conversation.
// The page gives the elements and the asset folder; the backend is the same Java server behind /api/live and /api/tools.
import { TalkingAvatar } from '@interviewflowai/talking-avatar';
import { asset, setAssetBase } from '../assets';
import { BarsAvatar } from '../avatar/bars';
import { EmotionDriver, isEmotion } from '../avatar/emotions';
import { Mic } from '../audio/mic';
import { PcmPlayer } from '../audio/player';
import { replyFix } from '../live/reply-guards';
import { LiveSession, type ConnState, type Lang } from '../live/session';
import { WakeWord } from '../live/wake-word';

export type { ConnState, Lang };
/** The wake word: listening for the name; waiting for a tap (the browser starts no sound before one); off. */
export type WakeState = 'listening' | 'tap' | 'off';

export interface BarsConciergeOptions {
  /** The leopard fills it (it needs a size). */
  stage: HTMLElement;
  /** What the guest said / what the leopard answers, as they are recognised. */
  userCaption?: HTMLElement;
  botCaption?: HTMLElement;
  /** Folder with bars.glb, viseme-carrier.glb, viseme-model.bin, env/, worklets/ (default: the site root). */
  assetBase?: string;
  lang?: Lang;
  onState?(state: ConnState, detail?: string): void;
  /** The conversation started (true) or ended (false), by the button, the name, an error or silence. */
  onRunning?(running: boolean): void;
  /** Listen for the leopard's name while idle and start talking when it is heard (live/wake-word.ts). */
  wakeWord?: boolean;
  onWake?(state: WakeState): void;
  onLog?(line: string): void;
}

/** A conversation is forgotten after this long without speech (main.ts FORGET_MS). */
const FORGET_MS = 180_000;
/** The microphone kept while waiting for the name (recognised ~1 s late): the phrase reaches Gemini whole. */
const PREROLL_MS = 2500;
/** With the wake word a conversation "falls asleep" (back to waiting for the name; an open session's microphone is
 * billed by the second): this long after the leopard last spoke, if the guest has been quiet for SLEEP_QUIET_MS ... */
const SLEEP_MS = 30_000;
const SLEEP_QUIET_MS = 10_000;
/** ... and after this long in any case (the museum's chatter keeps the transcript going). */
const SLEEP_MAX_MS = 60_000;

/** Can the page start sound now? After any tap on it, or when the browser allows autoplay (a kiosk started with
 * --autoplay-policy=no-user-gesture-required, or Chrome's media engagement for a site visited often). */
function soundAllowed(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (ua?.hasBeenActive) return true;
  const probe = new AudioContext();
  const ok = probe.state === 'running';
  void probe.close();
  return ok;
}

export class BarsConcierge {
  private readonly player = new PcmPlayer();
  private readonly emotion = new EmotionDriver('calm');
  private readonly avatar: TalkingAvatar;
  private readonly bars: BarsAvatar;
  private readonly live: LiveSession;
  private readonly mic: Mic;
  private readonly sdkEl: HTMLDivElement;
  private readonly barsEl: HTMLDivElement;
  private readonly forgetTimer: ReturnType<typeof setInterval>;
  private readonly wake?: WakeWord;
  private wakeState: WakeState = 'off';
  private preroll: Int16Array[] = [];
  private prerollLen = 0;
  /** The microphone while a conversation opened by the name connects (sent to Gemini once it is up). */
  private pending?: Int16Array[];
  private lastBot = 0;
  private lastUser = 0;
  private disposed = false;
  private lang: Lang;
  private running = false;
  private busy = false;
  private inTurn = false;
  private nudged = false;
  private userText = '';
  private botText = '';
  private lastTalk = 0;
  private thinkingTimer?: ReturnType<typeof setTimeout>;
  /** Resolves when the leopard is on screen; rejects if it fails to load. */
  readonly ready: Promise<void>;

  constructor(private readonly o: BarsConciergeOptions) {
    if (o.assetBase !== undefined) setAssetBase(o.assetBase);
    this.lang = o.lang ?? 'auto';
    // The SDK only plays the answer and computes the visemes: its own avatar is a single triangle carrying the
    // viseme shape keys (scripts/make-viseme-carrier.mjs), drawn 1×1 px out of sight.
    this.sdkEl = document.createElement('div');
    this.sdkEl.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    o.stage.append(this.sdkEl);
    this.avatar = new TalkingAvatar({
      container: this.sdkEl,
      avatarUrl: asset('/viseme-carrier.glb'),
      modelUrl: asset('/viseme-model.bin'),
      streamDelayMs: 150,
      onError: (e) => this.log(`avatar: ${e.message}`),
    });
    const barsEl = document.createElement('div');
    barsEl.style.cssText = 'position:absolute;inset:0';
    o.stage.append(barsEl);
    this.bars = new BarsAvatar(barsEl);
    this.bars.jawGain = 1.25;
    this.bars.expression = () => this.emotion.sample();
    this.bars.emotionName = () => this.emotion.current;
    this.bars.framing = { fill: 0.78, centerY: 0.47, pitch: -2, yaw: 0 };
    this.barsEl = barsEl;
    this.ready = this.avatar.ready
      .then(() => this.disposed ? undefined : this.bars.start(asset('/bars.glb'), this.avatar, asset('/env/studio_small_09_1k.hdr')))
      .then(() => {
        if (this.disposed) this.bars.pause();   // (disposed while the model was loading: start() began drawing)
        else void this.listenForName();
      });

    this.live = new LiveSession({
      onState: (s, d) => {
        if (s === 'error') this.halt();   // (the session closed itself: a fatal close or reconnects ran out)
        o.onState?.(s, d);
      },
      onAudio: (pcm) => {
        this.beginBotTurn();
        this.talked();
        this.lastBot = performance.now();
        this.player.push(pcm);
        this.listening();
      },
      onInterrupted: () => {
        this.emotion.release(800);
        this.player.flush();
        this.inTurn = false;
      },
      onTurnComplete: () => {
        this.inTurn = false;
        this.emotion.release(2500);
        this.listening();
        const fix = replyFix(this.botText, this.userText, this.lang);
        if (fix && !this.nudged) {
          this.nudged = true;
          this.log(`исправляю ответ: ${fix}`);
          this.live.sendText(`[Система: ${fix}]`);
          this.thinking(8000);
          return;
        }
        this.nudged = false;
      },
      onInputTranscript: (t) => {
        this.talked();
        this.lastUser = performance.now();
        this.userText += t;
        if (o.userCaption) o.userCaption.textContent = this.userText;
      },
      onOutputTranscript: (t) => {
        this.beginBotTurn();
        this.botText += t;
        if (o.botCaption) o.botCaption.textContent = this.botText;
      },
      onEmotion: (e) => {
        if (isEmotion(e)) this.emotion.set(e);
      },
      onToolCall: (name, args) => {
        this.log(`tool ${name} ${JSON.stringify(args)}`);
        this.thinking(8000);   // a tool call ends the model's turn before it answers
      },
      onLog: (line) => this.log(line),
    });
    this.mic = new Mic({
      onChunk: (pcm) => this.micChunk(pcm),
      onSpeechStart: () => {
        if (!this.running) return;   // (the wake word keeps the microphone open between conversations)
        this.userText = '';
        if (o.userCaption) o.userCaption.textContent = '';
      },
      onSpeechEnd: () => {
        if (this.running) this.thinking(6000);
      },
    });
    if (o.wakeWord && WakeWord.supported) {
      this.wake = new WakeWord(
        () => this.heardName(),
        (why) => {
          this.log(`имя не слушаю: ${why}`);
          if (!this.running) this.mic.stop();
          this.setWake('off');
        },
      );
      document.addEventListener('pointerdown', this.onTap);
    }
    this.forgetTimer = setInterval(() => {
      if (!this.running) return;
      const now = performance.now();
      if (now - this.lastTalk > FORGET_MS) {
        this.log('3 мин без разговора — завершаю и забываю');
        this.stop();
        this.forget();
      } else if (this.wake && !this.inTurn && (now - this.lastBot > SLEEP_MAX_MS
          || (now - this.lastBot > SLEEP_MS && now - this.lastUser > SLEEP_QUIET_MS))) {
        this.log('тишина — засыпаю, жду имени');
        this.stop();
        this.forget();   // (the captions go; the name opens a new conversation anyway, see heardName)
      }
    }, 5000);
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Starts (or, after stop(), resumes) the conversation. Call it from a click: the browser needs a gesture for sound.
   * byName: opened by the wake word - no greeting; the guest's phrase (kept in `pending`) goes to Gemini instead.
   */
  async start(byName = false): Promise<void> {
    if (this.running || this.busy) return;
    this.busy = true;
    this.wake?.stop();
    if (performance.now() - this.lastTalk > FORGET_MS) this.forget();
    this.talked();   // (a guest who starts and says nothing still gets the full wait)
    this.lastBot = performance.now();
    try {
      await this.player.init(24000, 120, false);
      await this.player.resume();
      await this.avatar.ready;
      await this.avatar.attachStream(this.player.stream);
      if (!this.mic.running) await this.mic.start();
      await this.live.connect(this.lang, byName);
      const phrase = this.pending ?? [];
      this.pending = undefined;
      for (const pcm of phrase) this.live.sendAudio(pcm);
      this.running = true;
      this.o.onRunning?.(true);
    } catch (e) {
      this.log(`старт не удался: ${e}`);
      this.stop();
      this.o.onState?.('error', String(e).slice(0, 120));   // (after stop(): its 'closed' would hide the reason)
    } finally {
      this.busy = false;
      if (!this.running) void this.listenForName();
    }
  }

  stop(): void {
    this.live.close();
    this.halt();
  }

  /** Everything stop() does but closing the session; with the wake word, back to waiting for the name. */
  private halt(): void {
    if (!this.wake || this.disposed) this.mic.stop();
    this.pending = undefined;
    this.avatar.detachStream();
    this.player.flush();
    void this.player.suspend();
    this.inTurn = false;
    this.listening();
    if (this.running) {
      this.running = false;
      this.o.onRunning?.(false);
    }
    void this.listenForName();
  }

  /** The language lives in the token, so a running conversation restarts in the new one. */
  async setLang(next: Lang): Promise<void> {
    if (next === this.lang) return;
    this.lang = next;
    if (!this.running) return;
    this.live.close();
    this.player.flush();
    this.inTurn = false;
    try {
      await this.live.connect(this.lang);
    } catch (e) {
      this.stop();
      this.o.onState?.('error', String(e).slice(0, 120));
    }
  }

  /** Ends the conversation, stops drawing and takes the canvases out of the stage (the page goes away). */
  dispose(): void {
    this.disposed = true;
    this.wake?.stop();
    document.removeEventListener('pointerdown', this.onTap);
    this.stop();
    clearInterval(this.forgetTimer);
    this.bars.pause();
    this.avatar.dispose();
    this.barsEl.remove();
    this.sdkEl.remove();
  }

  /** Opens the microphone (the browser asks for it on the first visit) and listens for the name. */
  private async listenForName(): Promise<void> {
    if (!this.wake || this.disposed || this.running || this.busy) return;
    try {
      if (!this.mic.running) await this.mic.start();
    } catch (e) {
      this.log(`микрофон для имени: ${e}`);
      this.setWake('off');
      return;
    }
    if (this.running || this.busy || this.disposed) return;   // (the button was faster than the microphone)
    if (!soundAllowed()) {
      this.setWake('tap');   // (onTap comes back here)
      return;
    }
    this.wake.start(this.mic.track);
    this.setWake('listening');
  }

  private readonly onTap = (): void => {
    if (this.wakeState === 'tap') void this.listenForName();
  };

  private heardName(): void {
    if (this.running || this.busy || this.disposed) return;
    this.log('услышал имя — начинаю разговор');
    // Always a new conversation: a resumed session now and then comes back deaf, and only the continue trigger's
    // watchdog notices that (live/session.ts) - a conversation opened by the name sends no trigger.
    this.forget();
    this.pending = this.preroll;
    this.preroll = [];
    this.prerollLen = 0;
    void this.start(true);
  }

  /** The microphone: to Gemini while talking; kept while connecting after the name; the last PREROLL_MS when idle. */
  private micChunk(pcm: Int16Array): void {
    if (this.pending) {
      this.pending.push(pcm);
    } else if (this.running) {
      this.live.sendAudio(pcm);
    } else if (this.wake) {
      this.preroll.push(pcm);
      this.prerollLen += pcm.length;
      while (this.prerollLen - this.preroll[0].length >= PREROLL_MS * 16) this.prerollLen -= this.preroll.shift()!.length;
    }
  }

  private setWake(state: WakeState): void {
    if (state === this.wakeState) return;
    this.wakeState = state;
    this.o.onWake?.(state);
  }

  private forget(): void {
    this.live.forget();
    this.userText = this.botText = '';
    if (this.o.userCaption) this.o.userCaption.textContent = '';
    if (this.o.botCaption) this.o.botCaption.textContent = '';
  }

  private talked(): void {
    this.lastTalk = performance.now();
  }

  private beginBotTurn(): void {
    if (this.inTurn) return;
    this.inTurn = true;
    this.botText = '';
    if (this.o.botCaption) this.o.botCaption.textContent = '';
  }

  private listening(): void {
    this.avatar.setStatus('listening');
    clearTimeout(this.thinkingTimer);
    this.thinkingTimer = undefined;
  }

  private thinking(ms: number): void {
    this.avatar.setStatus('thinking');
    clearTimeout(this.thinkingTimer);
    this.thinkingTimer = setTimeout(() => this.listening(), ms);
  }

  private log(line: string): void {
    this.o.onLog?.(line);
    console.log('[concierge]', line);
  }
}
