// Mic capture: mono float input -> 16 kHz PCM16, posted to the main thread in 40 ms chunks (640 samples).
// If the AudioContext could not be opened at 16 kHz, a linear-interpolation resampler is used.
const TARGET_RATE = 16000;
const CHUNK = 640;

class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.pos = 0;
    this.prev = 0;
    this.out = new Int16Array(CHUNK);
    this.n = 0;
  }

  push(v) {
    const s = v < -1 ? -1 : v > 1 ? 1 : v;
    this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    if (this.n === CHUNK) {
      const buf = this.out;
      this.port.postMessage(buf, [buf.buffer]);
      this.out = new Int16Array(CHUNK);
      this.n = 0;
    }
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    if (this.ratio === 1) {
      for (let i = 0; i < ch.length; i++) this.push(ch[i]);
      return true;
    }
    const len = ch.length;
    let pos = this.pos;
    for (;;) {
      const i = Math.floor(pos);
      if (i + 1 >= len) break;
      const x0 = i < 0 ? this.prev : ch[i];
      const x1 = ch[i + 1];
      this.push(x0 + (x1 - x0) * (pos - i));
      pos += this.ratio;
    }
    this.prev = ch[len - 1];
    this.pos = pos - len;
    return true;
  }
}

registerProcessor('mic-processor', MicProcessor);
