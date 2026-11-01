import { store } from "./storage";

let ctx: AudioContext | null = null;
let muted = store.get<boolean>("initle:muted", false);
const listeners = new Set<(m: boolean) => void>();

export const sound = {
  get muted() {
    return muted;
  },
  setMuted(m: boolean) {
    muted = m;
    store.set("initle:muted", m);
    listeners.forEach((l) => l(m));
  },
  subscribe(l: (m: boolean) => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

function audio(): AudioContext | null {
  if (muted || typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.12) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function vibrate(pattern: number | number[]) {
  try {
    if (!muted) navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

/** Synthesized sound effects: no audio files to load. */
export const sfx = {
  tap: () => tone(660, 0, 0.06, "triangle", 0.06),
  lock: () => {
    tone(523, 0, 0.1, "triangle");
    tone(784, 0.07, 0.14, "triangle");
    vibrate(20);
  },
  miss: () => {
    tone(220, 0, 0.14, "sawtooth", 0.05);
    vibrate([10, 40, 10]);
  },
  solve: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.22, "triangle"));
    vibrate([30, 30, 60]);
  },
  stage: () => tone(440, 0, 0.08, "sine", 0.07),
  tick: () => tone(880, 0, 0.04, "square", 0.03),
  reveal: () => {
    tone(392, 0, 0.18, "triangle");
    tone(587, 0.12, 0.3, "triangle");
  },
  fanfare: () => [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, "triangle", 0.1)),
  join: () => tone(740, 0, 0.08, "sine", 0.06),
};
