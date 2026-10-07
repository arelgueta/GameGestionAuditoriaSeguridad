import type { Cue } from '@ciberjunta/shared';
import { keys, load, save } from './storage';

/** Sonidos sintetizados con Web Audio: no se descargan archivos externos. */
let ctx: AudioContext | null = null;
let muted = load<boolean>(keys.muted) ?? false;
const listeners = new Set<(m: boolean) => void>();

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Llamar en un gesto del usuario para habilitar el audio en móviles. */
export function unlockAudio() {
  audio();
}

function tone(
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = 'sine',
  gain = 0.15,
) {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = a.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function play(cue: Cue) {
  if (muted) return;
  switch (cue) {
    case 'bell':
      tone(880, 0, 0.9);
      tone(1320, 0.02, 0.7, 'sine', 0.08);
      tone(880, 0.35, 0.9);
      break;
    case 'tick':
      tone(1200, 0, 0.06, 'square', 0.05);
      break;
    case 'dice':
      for (let i = 0; i < 6; i++) tone(300 + Math.random() * 500, i * 0.07, 0.05, 'triangle', 0.08);
      break;
    case 'success':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3, 'sine', 0.1));
      break;
    case 'alert':
      tone(440, 0, 0.25, 'sawtooth', 0.07);
      tone(330, 0.25, 0.35, 'sawtooth', 0.07);
      break;
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  save(keys.muted, m);
  listeners.forEach((l) => l(m));
}

export function onMutedChange(fn: (m: boolean) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
