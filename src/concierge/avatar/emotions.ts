// Copied from ai-concierge/web/src/avatar/emotions.ts by scripts/export-museum.mjs - edit it there and export again.
// Emotions as a model-agnostic description: ARKit blend-shape weights (the de-facto standard every engine here
// understands or can map: GLB avatars have ARKit morphs, LAM takes ARKit weights, the snow leopard maps them to its
// eye shader and mouth morphs) plus head pose and ear hints for bodies that have them.
// The names match the server's set_emotion tool (AgentDefinition.EMOTIONS).

export const EMOTIONS = ['calm', 'happy', 'laugh', 'surprised', 'wow', 'smug', 'angry', 'sad', 'thinking'] as const;
export type Emotion = (typeof EMOTIONS)[number];
export const isEmotion = (v: unknown): v is Emotion => EMOTIONS.includes(v as Emotion);

export const EMOTION_LABELS: Record<Emotion, string> = {
  calm: 'спокойствие', happy: 'радость', laugh: 'смех', surprised: 'удивление', wow: 'восхищение',
  smug: 'хитрость', angry: 'возмущение', sad: 'грусть', thinking: 'раздумье',
};

export type Arkit = Record<string, number>;

export interface Expression {
  /** ARKit blend-shape weights, 0..1. */
  face: Arkit;
  /** Head pose offset, degrees: pitch > 0 looks down, yaw > 0 turns to its left, roll > 0 tilts to its left. */
  head: { pitch: number; yaw: number; roll: number };
  /** Ears: -1 flattened back … 0 relaxed … 1 perked up. */
  ears: number;
  /** How much of 'calm' this is (1 = fully calm): models with a resting look of their own (the leopard keeps its
   * eyes closed) use it; others ignore it. */
  rest: number;
}

type Spec = { face: Arkit; head?: Partial<Expression['head']>; ears?: number };
const both = (name: string, v: number): Arkit => ({ [`${name}Left`]: v, [`${name}Right`]: v });

export const EXPRESSIONS: Record<Emotion, Spec> = {
  // Content resting face: a soft smile (the leopard also closes its eyes at rest, see Expression.rest).
  calm: { face: { ...both('mouthSmile', 0.3), ...both('cheekSquint', 0.15), ...both('eyeSquint', 0.12) } },
  happy: {
    face: { ...both('mouthSmile', 0.95), ...both('cheekSquint', 0.6), ...both('eyeSquint', 0.6), ...both('mouthStretch', 0.3) },
    head: { roll: 4, pitch: -2 },
    ears: 0.4,
  },
  laugh: {
    face: {
      ...both('eyeBlink', 1), ...both('cheekSquint', 1), ...both('mouthSmile', 1), ...both('mouthStretch', 0.6),
      jawOpen: 0.85, tongueOut: 0.4,
    },
    head: { pitch: -5, roll: 3 },
    ears: 0.5,
  },
  surprised: {
    face: {
      ...both('eyeWide', 1), browInnerUp: 0.7, ...both('browOuterUp', 0.8), jawOpen: 0.6, mouthFunnel: 1, mouthPucker: 0.5,
      tongueOut: 0.25,
    },
    head: { pitch: -5 },
    ears: 1,
  },
  wow: {
    face: { ...both('eyeWide', 0.85), ...both('browOuterUp', 0.5), browInnerUp: 0.3, jawOpen: 0.4, mouthFunnel: 1, mouthPucker: 0.6 },
    head: { pitch: -3, roll: -3 },
    ears: 0.8,
  },
  smug: {
    // heavy upper lids over the top of the iris, the lower ones barely raised (the art's 'smug')
    face: {
      ...both('eyeBlink', 0.65), mouthSmileLeft: 1, mouthSmileRight: 0.8, ...both('cheekSquint', 0.1),
    },
    head: { roll: -5, yaw: 6, pitch: 2 },
    ears: 0,
  },
  angry: {
    face: {
      ...both('browDown', 1), ...both('eyeSquint', 0.35), ...both('mouthFrown', 1), ...both('noseSneer', 0.3),
      mouthPressLeft: 0.3, mouthPressRight: 0.3,
    },
    head: { pitch: 6 },
    ears: -1,
  },
  sad: {
    face: {
      browInnerUp: 0.9, ...both('eyeBlink', 0.3), ...both('mouthFrown', 0.55), ...both('eyeLookDown', 0.35),
    },
    head: { pitch: 7, roll: 5 },
    ears: -0.6,
  },
  thinking: {
    face: {
      ...both('eyeLookUp', 0.6), eyeLookOutLeft: 0.35, eyeLookInRight: 0.35, browInnerUp: 0.3,
      browOuterUpLeft: 0.3, mouthLeft: 0.3, ...both('mouthPress', 0.3),
    },
    head: { pitch: -6, roll: -6, yaw: 6 },
    ears: -0.2,
  },
};

const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10));   // quintic

function expressionOf(e: Emotion, k = 1, rest = 0): Expression {
  const s = EXPRESSIONS[e];
  const face: Arkit = {};
  for (const [n, v] of Object.entries(s.face)) face[n] = v * k;
  return {
    face,
    head: { pitch: (s.head?.pitch ?? 0) * k, yaw: (s.head?.yaw ?? 0) * k, roll: (s.head?.roll ?? 0) * k },
    ears: (s.ears ?? 0) * k,
    rest,
  };
}

// Overlapping action, as an animator times a change of expression: the eyes and brows lead, the mouth follows a
// beat later, the head and ears settle last - the whole face sliding into the new pose in unison read as a morph
// slider. Each part: [delay, duration] as shares of the fade.
const TIMING = { eyes: [0, 0.75], mouth: [0.14, 0.8], head: [0.22, 0.78] } as const;
const partOf = (n: string): keyof typeof TIMING =>
  /^(eye|brow|cheek|nose)/.test(n) ? 'eyes' : 'mouth';

function mix(a: Expression, b: Expression, u: number): Expression {
  const t = (p: keyof typeof TIMING): number => ease((u - TIMING[p][0]) / TIMING[p][1]);
  const face: Arkit = {};
  for (const n of new Set([...Object.keys(a.face), ...Object.keys(b.face)])) {
    const k = t(partOf(n));
    face[n] = (a.face[n] ?? 0) * (1 - k) + (b.face[n] ?? 0) * k;
  }
  const h = t('head');
  return {
    face,
    head: {
      pitch: a.head.pitch * (1 - h) + b.head.pitch * h,
      yaw: a.head.yaw * (1 - h) + b.head.yaw * h,
      roll: a.head.roll * (1 - h) + b.head.roll * h,
    },
    ears: a.ears * (1 - h) + b.ears * h,
    rest: a.rest * (1 - t('eyes')) + b.rest * t('eyes'),
  };
}

/**
 * Current emotion with smooth cross-fades. set() switches (e.g. from the set_emotion tool); after the reply,
 * release() lets it fall back to the resting emotion a little later.
 */
export class EmotionDriver {
  private from: Expression;
  private to: Expression;
  private startedAt = 0;
  private fadeMs = 700;
  private releaseAt = Infinity;
  current: Emotion;
  /** Emotion between replies. */
  rest: Emotion;

  constructor(rest: Emotion = 'calm') {
    this.rest = this.current = rest;
    this.from = this.to = expressionOf(rest, 1, rest === 'calm' ? 1 : 0);
  }

  set(e: Emotion, intensity = 1, fadeMs = 700): void {
    this.from = this.sample();
    this.to = expressionOf(e, intensity, e === 'calm' ? 1 : 0);
    this.current = e;
    this.startedAt = performance.now();
    this.fadeMs = fadeMs;
    this.releaseAt = Infinity;
  }

  /** Back to the resting emotion after `afterMs` (cancelled by the next set()). */
  release(afterMs = 2500): void {
    if (this.current === this.rest) return;
    this.releaseAt = performance.now() + afterMs;
  }

  sample(): Expression {
    const now = performance.now();
    if (now >= this.releaseAt) {
      this.releaseAt = Infinity;
      this.set(this.rest, 1, 1100);
    }
    return mix(this.from, this.to, (now - this.startedAt) / this.fadeMs);
  }
}

/**
 * Adds an expression to engine-produced ARKit weights (lip sync, blinks): mouth shapes the speech also drives
 * take the max, so talking still articulates; everything else is the expression's value where it is stronger.
 */
export function blendArkit(target: Arkit, face: Arkit, speaking: boolean): void {
  for (const [n, v] of Object.entries(face)) {
    if (!(n in target)) continue;
    if (speaking && (n === 'jawOpen' || n === 'mouthFunnel' || n === 'mouthPucker' || n === 'tongueOut')) {
      target[n] = Math.min(1, Math.max(target[n], v * 0.6));
    } else {
      target[n] = Math.max(target[n], v);
    }
  }
}
