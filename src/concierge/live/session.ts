// Copied from ai-concierge/web/src/live/session.ts by scripts/export-museum.mjs - edit it there and export again.
// Gemini Live transport. The browser only moves audio: the real session config (system prompt, tools, voice,
// VAD, transcription, resumption) is baked into the ephemeral token by the Java backend and cannot be changed here.
import { GoogleGenAI, Modality, type FunctionCall, type LiveServerMessage, type Session } from '@google/genai';

export type ConnState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error';
export type Lang = 'auto' | 'ky' | 'ru' | 'en';

export interface LiveEvents {
  onState(state: ConnState, detail?: string): void;
  onAudio(pcm: Int16Array): void;
  onInterrupted(): void;
  onTurnComplete(): void;
  onInputTranscript(text: string): void;
  onOutputTranscript(text: string): void;
  onToolCall(name: string, args: unknown): void;
  /** set_emotion from the model: answered locally, never sent to the server. */
  onEmotion(emotion: string): void;
  onLog(line: string): void;
}

interface TokenResponse {
  token: string;
  model: string;
  apiVersion?: string;
  expiresAt: string;
}

/** Service message that makes the agent greet first (handled by the system prompt, never spoken aloud). */
const GREETING_TRIGGER = '[гость подошёл]';
/** ... and the one for "Начать разговор" again after "Завершить": the same conversation goes on, no new greeting. */
const CONTINUE_TRIGGER = '[разговор продолжен]';

export class LiveSession {
  private session?: Session;
  private handle?: string;
  private lang: Lang = 'auto';
  private closedByUser = false;
  private attempts = 0;
  private goAway = false;
  private trigger?: string;     // sent once the session is set up
  private resuming = false;     // this socket was opened with a resumption handle ...
  private ready = false;        // ... and got its setupComplete
  private gen = 0;              // the current socket's number: the callbacks of a replaced socket are ignored
  private watchdog?: ReturnType<typeof setTimeout>;

  constructor(private readonly ev: LiveEvents) {}

  get connected(): boolean {
    return !!this.session;
  }

  /**
   * Starts a conversation in the given language mode. "Завершить" keeps the resumption handle, so the next start
   * goes on with the same conversation (Gemini keeps it ~2 h; the handle lives in memory, a page reload starts
   * over); a new language starts a fresh one (the language is in the token's system prompt).
   */
  async connect(lang: Lang = 'auto'): Promise<void> {
    if (lang !== this.lang) this.handle = undefined;
    this.lang = lang;
    this.closedByUser = false;
    this.trigger = this.handle ? CONTINUE_TRIGGER : GREETING_TRIGGER;
    await this.open();
  }

  /** The next connect() starts a new conversation (with a greeting) instead of resuming this one. */
  forget(): void {
    this.handle = undefined;
  }

  sendAudio(pcm: Int16Array): void {
    if (!this.session) return;
    this.session.sendRealtimeInput({ audio: { data: toBase64(pcm), mimeType: 'audio/pcm;rate=16000' } });
  }

  /** Sends a text turn (service messages like "[Система: ...]"); the model answers with audio. */
  sendText(text: string): void {
    this.session?.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true });
  }

  close(): void {
    this.closedByUser = true;
    this.stopWatchdog();
    const s = this.session;
    this.session = undefined;
    this.gen++;   // (a socket still connecting closes as soon as it opens)
    s?.close();   // (the handle stays: the next connect() resumes this conversation)
    this.ev.onState('closed');
  }

  private async open(): Promise<void> {
    const resumed = !!this.handle;
    this.resuming = resumed;
    this.ready = false;
    this.ev.onState(resumed ? 'reconnecting' : 'connecting');
    const res = await fetch('/api/live/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resumeHandle: this.handle ?? null, lang: this.lang }),
    });
    if (!res.ok) throw new Error(`токен: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const tok = (await res.json()) as TokenResponse;
    const ai = new GoogleGenAI({ apiKey: tok.token, httpOptions: { apiVersion: tok.apiVersion ?? 'v1beta' } });
    const gen = ++this.gen;
    const session = await ai.live.connect({
      model: tok.model,
      // Placeholder only: the token's bidiGenerateContentSetup replaces this setup server-side.
      config: { responseModalities: [Modality.AUDIO] },
      callbacks: {
        onopen: () => {
          if (gen !== this.gen) return;
          this.attempts = 0;
          this.ev.onState('connected');
        },
        onmessage: (m: LiveServerMessage) => {
          if (gen === this.gen) this.onMessage(m);
        },
        onerror: (e: ErrorEvent) => this.ev.onLog(`ws error: ${e.message ?? e.type}`),
        onclose: (e: CloseEvent) => {
          if (gen === this.gen) this.onClose(e);
        },
      },
    });
    if (gen !== this.gen) {
      session.close();   // (replaced or closed while connecting)
      return;
    }
    this.session = session;
    this.sendTrigger();
  }

  /**
   * The greeting / continue message, once the session is both set up and in hand: in the browser connect() resolves
   * only after setupComplete has been handled, so sending from the setupComplete handler went nowhere (the greeting
   * was lost).
   */
  private sendTrigger(): void {
    const t = this.trigger;
    if (!t || !this.ready || !this.session) return;
    this.trigger = undefined;
    this.sendText(t);
    // Now and then a session closed in the middle of an answer comes back deaf: set up, an 'interrupted' at most,
    // and no reply to anything (2 of ~10 runs of scripts/resume-smoke.mjs). A healthy one answers within 1-3 s.
    if (t === CONTINUE_TRIGGER) {
      this.watchdog = setTimeout(() => this.startOver('продолженная сессия не отвечает'), 8000);
    }
  }

  /** Drops the conversation and opens a fresh one, with a greeting (a resumption that failed). */
  private startOver(why: string): void {
    this.stopWatchdog();
    this.ev.onLog(`${why} — начинаю новый разговор`);
    this.handle = undefined;
    this.trigger = GREETING_TRIGGER;
    const s = this.session;
    this.session = undefined;
    this.gen++;   // (the old socket's close is not a drop to reconnect from)
    s?.close();
    this.open().catch((err) => this.ev.onState('error', String(err).slice(0, 120)));
  }

  private stopWatchdog(): void {
    clearTimeout(this.watchdog);
    this.watchdog = undefined;
  }

  private onMessage(m: LiveServerMessage): void {
    if (m.setupComplete) {
      this.ready = true;
      this.ev.onLog(`сессия готова (язык: ${this.lang}${this.resuming ? ', разговор продолжен' : ''})`);
      // (a reconnect after a dropped socket or a goAway resumes silently: no trigger is pending then)
      this.sendTrigger();
    }
    const sc = m.serverContent;
    if (this.watchdog && (sc?.modelTurn || sc?.outputTranscription || sc?.turnComplete || m.toolCall)) {
      this.stopWatchdog();
    }
    if (sc) {
      if (sc.interrupted) this.ev.onInterrupted();
      for (const p of sc.modelTurn?.parts ?? []) {
        if (p.inlineData?.data) this.ev.onAudio(fromBase64(p.inlineData.data));
      }
      if (sc.inputTranscription?.text) this.ev.onInputTranscript(sc.inputTranscription.text);
      if (sc.outputTranscription?.text) this.ev.onOutputTranscript(sc.outputTranscription.text);
      if (sc.turnComplete) this.ev.onTurnComplete();
    }
    if (m.toolCall?.functionCalls?.length) void this.handleTools(m.toolCall.functionCalls);
    if (m.toolCallCancellation) this.ev.onLog(`tool cancelled: ${m.toolCallCancellation.ids?.join(',')}`);
    const upd = m.sessionResumptionUpdate;
    if (upd?.resumable && upd.newHandle) this.handle = upd.newHandle;
    if (m.goAway) {
      this.goAway = true;
      this.ev.onLog(`goAway, осталось ${m.goAway.timeLeft}`);
    }
  }

  private async handleTools(calls: FunctionCall[]): Promise<void> {
    const functionResponses = await Promise.all(
      calls.map(async (fc) => {
        const name = fc.name ?? '';
        if (name === 'set_emotion') {
          this.ev.onEmotion(String((fc.args as { emotion?: unknown } | undefined)?.emotion ?? ''));
          return { id: fc.id, name, response: { ok: true } };
        }
        this.ev.onToolCall(name, fc.args);
        let response: Record<string, unknown>;
        try {
          const r = await fetch(`/api/tools/${encodeURIComponent(name)}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(fc.args ?? {}),
          });
          response = r.ok ? ((await r.json()) as Record<string, unknown>) : { error: `HTTP ${r.status}` };
        } catch (e) {
          response = { error: String(e) };
        }
        return { id: fc.id, name, response };
      }),
    );
    this.session?.sendToolResponse({ functionResponses });
  }

  private onClose(e: CloseEvent): void {
    this.ev.onLog(`ws закрыт: ${e.code} ${e.reason}`);
    this.session = undefined;
    if (this.closedByUser) return;
    if (this.resuming && !this.ready) {
      // the handle was refused before the setup (expired after ~2 h idle: 1008 "session not found")
      this.startOver('продолжить разговор не удалось');
      return;
    }
    this.stopWatchdog();
    // Fatal closes (billing, quota, policy, bad config) must not loop: surface the reason and stop.
    const reason = e.reason || '';
    const fatal = e.code === 1008 || (e.code === 1011 && /credit|billing|quota|exceeded|invalid|not supported/i.test(reason))
      || /credits are depleted|billing|quota/i.test(reason);
    if (fatal || this.attempts >= 6) {
      this.closedByUser = true;
      this.ev.onState('error', reason ? reason.slice(0, 90) : `закрыто с кодом ${e.code}`);
      return;
    }
    const delay = this.goAway ? 0 : Math.min(500 * 2 ** this.attempts++, 5000);
    this.goAway = false;
    this.ev.onState('reconnecting', `через ${delay} мс`);
    setTimeout(() => {
      this.open().catch((err) => this.ev.onState('error', String(err).slice(0, 120)));
    }, delay);
  }
}

function toBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  }
  return btoa(s);
}

function fromBase64(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, bytes.length >> 1);
}
