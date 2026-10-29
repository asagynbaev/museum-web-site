// Gap-free PCM player: ring buffer fed with Int16 chunks at the context sample rate.
// - waits for `prebufferMs` of audio before (re)starting, so network jitter never reaches the speaker
// - `flush` drops everything instantly (barge-in)
// - reports buffer level / underruns every 200 ms
const FADE = 64;

class PcmPlayerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.capacity = Math.floor(sampleRate * (o.capacitySeconds || 60));
    this.ring = new Float32Array(this.capacity);
    this.readIdx = 0;
    this.writeIdx = 0;
    this.size = 0;
    // Stream position counters (samples since the worklet started), for syncing facial animation to audio.
    this.pushed = 0;
    this.lastPos = 0;
    this.prebuffer = Math.floor((sampleRate * (o.prebufferMs || 120)) / 1000);
    this.playing = false;
    this.underruns = 0;
    this.dropped = 0;
    this.drainedAt = -1;
    this.fade = 0;
    this.lastStats = 0;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    if (m.type === 'push') {
      const pcm = m.pcm;
      // Data arriving shortly after the buffer ran dry means the gap was a real underrun, not the end of a turn.
      if (!this.playing && this.drainedAt >= 0 && currentTime - this.drainedAt < 0.4) this.underruns++;
      this.drainedAt = -1;
      for (let i = 0; i < pcm.length; i++) {
        if (this.size === this.capacity) {
          this.readIdx = (this.readIdx + 1) % this.capacity;
          this.size--;
          this.dropped++;
        }
        this.ring[this.writeIdx] = pcm[i] / 32768;
        this.writeIdx = (this.writeIdx + 1) % this.capacity;
        this.size++;
      }
      this.pushed += pcm.length;
    } else if (m.type === 'flush') {
      this.readIdx = this.writeIdx;
      this.size = 0;
      this.playing = false;
      this.drainedAt = -1;
    } else if (m.type === 'prebuffer') {
      this.prebuffer = Math.floor((sampleRate * m.ms) / 1000);
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    const n = out.length;
    if (!this.playing) {
      if (this.size >= this.prebuffer) {
        this.playing = true;
        this.fade = FADE;
      } else {
        out.fill(0);
        this.stats();
        return true;
      }
    }
    const avail = Math.min(n, this.size);
    for (let i = 0; i < avail; i++) {
      let s = this.ring[this.readIdx];
      this.readIdx = (this.readIdx + 1) % this.capacity;
      if (this.fade > 0) {
        s *= 1 - this.fade / FADE;
        this.fade--;
      }
      out[i] = s;
    }
    this.size -= avail;
    if (avail < n) {
      for (let i = avail; i < n; i++) out[i] = 0;
      this.playing = false;
      this.drainedAt = currentTime;
    }
    this.stats();
    this.position();
    return true;
  }

  // played = pushed - size: the stream sample now leaving the worklet (before any downstream delay).
  position() {
    if (currentTime - this.lastPos < 0.04) return;
    this.lastPos = currentTime;
    this.port.postMessage({ type: 'pos', played: this.pushed - this.size, pushed: this.pushed, t: currentTime });
  }

  stats() {
    if (currentTime - this.lastStats < 0.2) return;
    this.lastStats = currentTime;
    this.port.postMessage({
      type: 'stats',
      bufferedMs: Math.round((this.size / sampleRate) * 1000),
      underruns: this.underruns,
      dropped: this.dropped,
      playing: this.playing,
    });
  }
}

registerProcessor('pcm-player', PcmPlayerProcessor);
