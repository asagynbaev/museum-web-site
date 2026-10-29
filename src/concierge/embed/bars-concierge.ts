// Copied from ai-concierge/web/src/embed/bars-concierge.ts by scripts/export-museum.mjs - edit it there and export again.
// The snow leopard concierge for another site's page (the museum site's /bars; scripts/export-museum.mjs copies it
// there with its modules): the bars avatar and the Gemini Live conversation of main.ts - captions, emotions, the
// reply guards, forgetting after 3 min - without the kiosk's other engines, settings and metrics.
// The page gives the elements and the asset folder; the backend is the same Java server behind /api/live and /api/tools.
import { TalkingAvatar } from '@interviewflowai/talking-avatar';
import { asset, setAssetBase } from '../assets';
import { BarsAvatar } from '../avatar/bars';
import { EmotionDriver, isEmotion } from '../avatar/emotions';
import { Mic } from '../audio/mic';
import { PcmPlayer } from '../audio/player';
import { replyFix } from '../live/reply-guards';
import { LiveSession, type ConnState, type Lang } from '../live/session';

export type { ConnState, Lang };

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
  /** The conversation started (true) or ended (false), by the button, an error or 3 min of silence. */
  onRunning?(running: boolean): void;
  onLog?(line: string): void;
}

/** A conversation is forgotten after this long without speech (main.ts FORGET_MS). */
const FORGET_MS = 180_000;

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
      });

    this.live = new LiveSession({
      onState: (s, d) => {
        if (s === 'error') this.halt();   // (the session closed itself: a fatal close or reconnects ran out)
        o.onState?.(s, d);
      },
      onAudio: (pcm) => {
        this.beginBotTurn();
        this.talked();
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
      onChunk: (pcm) => this.live.sendAudio(pcm),
      onSpeechStart: () => {
        this.userText = '';
        if (o.userCaption) o.userCaption.textContent = '';
      },
      onSpeechEnd: () => this.thinking(6000),
    });
    this.forgetTimer = setInterval(() => {
      if (!this.running || performance.now() - this.lastTalk <= FORGET_MS) return;
      this.log('3 мин без разговора — завершаю и забываю');
      this.stop();
      this.forget();
    }, 5000);
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Starts (or, after stop(), resumes) the conversation. Call it from a click: the browser needs a gesture for sound. */
  async start(): Promise<void> {
    if (this.running || this.busy) return;
    this.busy = true;
    if (performance.now() - this.lastTalk > FORGET_MS) this.forget();
    this.talked();   // (a guest who starts and says nothing still gets the full wait)
    try {
      await this.player.init(24000, 120, false);
      await this.player.resume();
      await this.avatar.ready;
      await this.avatar.attachStream(this.player.stream);
      await this.mic.start();
      await this.live.connect(this.lang);
      this.running = true;
      this.o.onRunning?.(true);
    } catch (e) {
      this.log(`старт не удался: ${e}`);
      this.stop();
      this.o.onState?.('error', String(e).slice(0, 120));   // (after stop(): its 'closed' would hide the reason)
    } finally {
      this.busy = false;
    }
  }

  stop(): void {
    this.live.close();
    this.halt();
  }

  /** Everything stop() does but closing the session. */
  private halt(): void {
    this.mic.stop();
    this.avatar.detachStream();
    this.player.flush();
    void this.player.suspend();
    this.inTurn = false;
    this.listening();
    if (this.running) {
      this.running = false;
      this.o.onRunning?.(false);
    }
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
    this.stop();
    clearInterval(this.forgetTimer);
    this.bars.pause();
    this.avatar.dispose();
    this.barsEl.remove();
    this.sdkEl.remove();
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
