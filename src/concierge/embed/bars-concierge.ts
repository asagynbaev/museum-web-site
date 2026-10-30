// Copied from ai-concierge/web/src/embed/bars-concierge.ts by scripts/export-museum.mjs - edit it there and export again.
// The snow leopard concierge for another site's page (the museum site's /bars; scripts/export-museum.mjs copies it
// there with its modules): the bars avatar and the Gemini Live conversation of main.ts - captions, emotions, the
// reply guards, forgetting after 3 min - without the kiosk's other engines, settings and metrics. Optionally it
// waits for its name like a smart speaker (wakeWord): "Кокурок, сколько стоит билет?" starts the conversation.
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
/**
 * With the wake word the leopard answers like a smart speaker: once a reply has been heard out the microphone stops
 * going to Gemini and the page waits for the name again - FOLLOW_MS later if the reply ended with a question (a
 * ticket code to dictate, a choice). The session stays open but "parked" (no audio in, nothing billed), so the next
 * "Кокурок, …" goes on with the same conversation at once, without reconnecting.
 */
const FOLLOW_MS = 8000;
/** ... and parked anyway when no reply comes this long (the name, then silence or chatter the model lets pass). */
const IDLE_MS = 15_000;

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
  /** Wake mode: the session is open but gets no microphone while the page waits for the name (see FOLLOW_MS). */
  private parked = false;
  private spokeInTurn = false;   // (set_emotion ends a turn of its own before the voice: only a voiced one is a reply)
  private toolPending = false;   // (a museum tool's call ends the turn too; the answer comes in the next one)
  private restTimer?: ReturnType<typeof setTimeout>;
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
        if (this.parked) {
          // (a parked session's own reconnects are not the guest's business; one that died is simply gone)
          if (s === 'error') {
            this.parked = false;
            this.log(`сессия в ожидании закрылась: ${d ?? ''}`);
          }
          return;
        }
        if (s === 'error') this.halt();   // (the session closed itself: a fatal close or reconnects ran out)
        o.onState?.(s, d);
      },
      onAudio: (pcm) => {
        if (this.parked) this.unpark();   // (a late reply to the last phrase: the guest hears it out, not the name)
        this.beginBotTurn();
        this.talked();
        this.lastBot = performance.now();
        this.spokeInTurn = true;
        this.toolPending = false;
        this.player.push(pcm);
        this.listening();
      },
      onInterrupted: () => {
        this.emotion.release(800);
        this.player.flush();
        this.inTurn = false;
        clearTimeout(this.restTimer);   // (the guest talks over the reply)
      },
      onTurnComplete: () => {
        const spoke = this.spokeInTurn;
        this.spokeInTurn = false;
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
        if (spoke && !this.toolPending) this.afterReply();
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
        this.toolPending = true;
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
      const now = performance.now();
      if (this.parked && now - this.lastTalk > FORGET_MS) {
        this.log('3 мин без разговора — закрываю сессию и забываю');
        this.parked = false;
        this.live.close();
        this.forget();
        return;
      }
      if (!this.running) return;
      if (now - this.lastTalk > FORGET_MS) {
        this.log('3 мин без разговора — завершаю и забываю');
        this.stop();
        this.forget();
      } else if (this.wake && !this.inTurn && now - this.lastBot > IDLE_MS && now - this.lastUser > IDLE_MS / 2) {
        this.log('ответа нет — жду имени');
        this.park();
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
    if (this.parked && this.live.connected) {
      this.wake?.stop();
      this.unpark();   // (the button while the session waits: the guest just talks on)
      return;
    }
    this.parked = false;
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
    this.parked = false;   // (first: the session's 'closed' must reach the page)
    this.live.close();
    this.halt();
  }

  /** Everything stop() does but closing the session; with the wake word, back to waiting for the name. */
  private halt(): void {
    if (!this.wake || this.disposed) this.mic.stop();
    this.parked = false;
    clearTimeout(this.restTimer);
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
    if (this.parked) {
      this.parked = false;   // (a waiting session speaks the old language: the name opens one in the new)
      this.live.close();
    }
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
    this.pending = this.preroll;
    this.preroll = [];
    this.prerollLen = 0;
    if (this.parked && this.live.connected) {
      this.log('услышал имя — продолжаю разговор');
      this.unpark();
      return;
    }
    this.log('услышал имя — начинаю разговор');
    // A closed conversation is not resumed: a resumed session now and then comes back deaf, and only the continue
    // trigger's watchdog notices that (live/session.ts) - a conversation opened by the name sends no trigger.
    this.parked = false;
    this.forget();
    void this.start(true);
  }

  /** Wake mode: once the reply has been heard out, park - FOLLOW_MS later if it ended with a question. */
  private afterReply(): void {
    if (!this.wake || !this.running) return;
    clearTimeout(this.restTimer);
    // (still playing: what was pushed and has not left the player, plus the avatar's stream delay)
    const left = ((this.player.pushedTotal - this.player.playedNow) / this.player.sampleRate) * 1000 + 300;
    const question = /[?？]\s*$/.test(this.botText.trim());
    this.restTimer = setTimeout(() => this.park(), Math.max(0, left) + (question ? FOLLOW_MS : 300));
  }

  /** The microphone stops going to Gemini (the session stays open) and the page waits for the name again. */
  private park(): void {
    if (!this.wake || !this.running || this.inTurn) return;   // (a reply under way parks itself when done)
    if (performance.now() - this.lastUser < 1500) {
      this.restTimer = setTimeout(() => this.park(), 1500);   // (the guest is still answering the question)
      return;
    }
    this.running = false;
    this.parked = true;
    this.listening();
    this.o.onRunning?.(false);
    this.o.onState?.('idle');
    this.log('ответил — жду имени');
    void this.listenForName();
  }

  /** The name (or the button) with a parked session: the phrase kept so far goes in, the microphone follows. */
  private unpark(): void {
    this.parked = false;
    const phrase = this.pending ?? [];
    this.pending = undefined;
    for (const pcm of phrase) this.live.sendAudio(pcm);
    this.talked();
    this.lastBot = performance.now();
    this.running = true;
    this.o.onRunning?.(true);
    this.o.onState?.('connected');
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
    clearTimeout(this.restTimer);
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
