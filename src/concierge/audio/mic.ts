// Copied from ai-concierge/web/src/audio/mic.ts by scripts/export-museum.mjs - edit it there and export again.
// Microphone -> 16 kHz PCM16 chunks (via AudioWorklet) + a tiny local energy VAD used only for UI/metrics
// (Gemini does the real turn-taking server-side).
import { asset } from '../assets';

export interface MicEvents {
  onChunk(pcm: Int16Array): void;
  onSpeechStart?(): void;
  onSpeechEnd?(): void;
}

const RATE = 16000;

export class Mic {
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private speaking = false;
  private speechMs = 0;
  private silenceMs = 0;

  constructor(private readonly ev: MicEvents, private readonly threshold = 0.012) {}

  get running(): boolean {
    return !!this.ctx;
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ sampleRate: RATE });
    } catch {
      ctx = new AudioContext();
    }
    await ctx.audioWorklet.addModule(asset('/worklets/mic-processor.js'));
    const source = ctx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(ctx, 'mic-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
    });
    node.port.onmessage = (e: MessageEvent<Int16Array>) => {
      this.vad(e.data);
      this.ev.onChunk(e.data);
    };
    source.connect(node);
    node.connect(ctx.destination); // keeps the worklet pulled; it outputs silence
    await ctx.resume();
    this.ctx = ctx;
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.ctx = undefined;
    this.stream = undefined;
    this.speaking = false;
    this.speechMs = 0;
    this.silenceMs = 0;
  }

  private vad(pcm: Int16Array): void {
    let sum = 0;
    for (let i = 0; i < pcm.length; i++) {
      const s = pcm[i] / 32768;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / pcm.length);
    const ms = (pcm.length / RATE) * 1000;
    if (rms > this.threshold) {
      this.speechMs += ms;
      this.silenceMs = 0;
      if (!this.speaking && this.speechMs >= 150) {
        this.speaking = true;
        this.ev.onSpeechStart?.();
      }
    } else {
      this.silenceMs += ms;
      if (this.speaking && this.silenceMs >= 350) {
        this.speaking = false;
        this.speechMs = 0;
        this.ev.onSpeechEnd?.();
      } else if (!this.speaking && this.silenceMs >= 200) {
        this.speechMs = 0;
      }
    }
  }
}
