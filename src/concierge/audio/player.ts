// Copied from ai-concierge/web/src/audio/player.ts by scripts/export-museum.mjs - edit it there and export again.
// 24 kHz PCM player. Output goes to a MediaStream (not to the speakers directly): the avatar plays that stream
// itself, delayed by `streamDelayMs`, so lips and sound stay in sync and the mouth anticipates each sound.
import { asset } from '../assets';

export interface PlayerStats {
  bufferedMs: number;
  underruns: number;
  dropped: number;
  playing: boolean;
}

export class PcmPlayer {
  private ctx?: AudioContext;
  private node?: AudioWorkletNode;
  private dest?: MediaStreamAudioDestinationNode;
  private direct = false;
  onStats?: (s: PlayerStats) => void;
  /** Last reported stream position: samples played (left the worklet) and when, for interpolation. */
  private pos = { played: 0, pushed: 0, at: 0 };
  /** Samples handed to the worklet so far (exact, unlike the periodic position reports). */
  pushedTotal = 0;
  readonly sampleRate: number;

  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
  }

  /** Stream sample that is leaving the worklet right now (interpolated between position reports). */
  get playedNow(): number {
    if (!this.pos.at) return 0;
    const elapsed = (performance.now() - this.pos.at) / 1000;
    return Math.min(this.pos.pushed, this.pos.played + elapsed * this.sampleRate);
  }

  /** True while the worklet exists and the context is running (audio actually drains). */
  get active(): boolean {
    return !!this.node && this.ctx?.state === 'running';
  }

  /** Samples (24 kHz) between a sample leaving the worklet and it reaching the speaker, when direct output is on. */
  get outputDelaySamples(): number {
    if (!this.ctx || !this.direct) return 0;
    const c = this.ctx as AudioContext & { outputLatency?: number };
    return Math.round(((c.baseLatency || 0) + (c.outputLatency || 0)) * this.sampleRate);
  }

  /**
   * Route the worklet straight to the speakers (video engines: the frames are timed against this player, so no
   * extra delay may sit between it and the ear). Off: only the MediaStream output, played by the 3D avatar SDK.
   */
  setDirectOutput(on: boolean): void {
    if (!this.ctx || !this.node || on === this.direct) return;
    if (on) this.node.connect(this.ctx.destination);
    else this.node.disconnect(this.ctx.destination);
    this.direct = on;
  }

  get stream(): MediaStream {
    if (!this.dest) throw new Error('player not initialised');
    return this.dest.stream;
  }

  async init(sampleRate = 24000, prebufferMs = 120, direct = false): Promise<void> {
    if (this.ctx) {
      this.setDirectOutput(direct);
      return;
    }
    const ctx = new AudioContext({ sampleRate });
    await ctx.audioWorklet.addModule(asset('/worklets/pcm-player-processor.js'));
    const node = new AudioWorkletNode(ctx, 'pcm-player', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { prebufferMs, capacitySeconds: 60 },
    });
    const dest = ctx.createMediaStreamDestination();
    node.connect(dest);
    node.port.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'stats') this.onStats?.(e.data as PlayerStats);
      else if (e.data?.type === 'pos') this.pos = { played: e.data.played, pushed: e.data.pushed, at: performance.now() };
    };
    this.ctx = ctx;
    this.node = node;
    this.dest = dest;
    this.setDirectOutput(direct);
  }

  async resume(): Promise<void> {
    await this.ctx?.resume();
  }

  async suspend(): Promise<void> {
    await this.ctx?.suspend();
  }

  push(pcm: Int16Array): void {
    // Dropped while stopped: nothing may pile up in the ring for later, and the pushed count must only ever
    // describe audio that will actually be heard (the video engines map frames to it).
    const node = this.node;
    if (!node || !this.active) return;
    this.pushedTotal += pcm.length;
    node.port.postMessage({ type: 'push', pcm }, [pcm.buffer as ArrayBuffer]);
  }

  flush(): void {
    this.node?.port.postMessage({ type: 'flush' });
  }

  setPrebuffer(ms: number): void {
    this.node?.port.postMessage({ type: 'prebuffer', ms });
  }
}
