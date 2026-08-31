import type { AccessDecision } from '@pulso/contracts/access';

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextConstructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContextConstructor();
  }
  return audioContext;
}

/**
 * Los navegadores requieren una interacción del usuario antes de habilitar
 * WebAudio. Se llama desde el primer click/tecla y no reproduce nada.
 */
export function primeAccessAudio(): void {
  try {
    const context = getAudioContext();
    if (context?.state === 'suspended') void context.resume().catch(() => undefined);
  } catch {
    // El resultado visual sigue disponible si la PC no expone WebAudio.
  }
}

/** Prepara el audio con la primera interacción y luego retira los listeners. */
export function installAccessAudioUnlock(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let listening = true;
  const cleanup = () => {
    if (!listening) return;
    listening = false;
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  const unlock = () => {
    primeAccessAudio();
    cleanup();
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  return cleanup;
}

/** Sólo para tests: simula una navegación o recarga que descarta WebAudio. */
export function resetAccessAudioForTests(): void {
  audioContext = null;
}

export function playAccessTone(decision: AccessDecision): void {
  try {
    const context = getAudioContext();
    if (!context) return;
    const play = () => playSequence(context, decision);

    if (context.state === 'suspended') {
      void context
        .resume()
        .then(play)
        .catch(() => undefined);
    } else {
      play();
    }
  } catch {
    // El feedback visual sigue siendo suficiente si el navegador bloquea audio.
  }
}

function playSequence(context: AudioContext, decision: AccessDecision): void {
  const startAt = context.currentTime;
  if (decision === 'ALLOWED') {
    // Tick corto y limpio: confirma sin molestar a toda la recepción.
    schedulePulse(context, {
      frequency: 1_100,
      startAt,
      duration: 0.08,
      volume: 0.18,
      type: 'sine',
    });
    return;
  }

  // Doble alarma grave, más larga y fuerte. Es imposible confundirla con la
  // confirmación aun cuando haya ruido ambiente en el gimnasio.
  schedulePulse(context, {
    frequency: 165,
    startAt,
    duration: 0.22,
    volume: 0.42,
    type: 'sawtooth',
  });
  schedulePulse(context, {
    frequency: 110,
    startAt: startAt + 0.27,
    duration: 0.3,
    volume: 0.46,
    type: 'sawtooth',
  });
}

function schedulePulse(
  context: AudioContext,
  pulse: {
    frequency: number;
    startAt: number;
    duration: number;
    volume: number;
    type: OscillatorType;
  },
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const attackEnd = pulse.startAt + Math.min(0.012, pulse.duration / 4);
  const releaseStart = pulse.startAt + pulse.duration * 0.65;
  const stopAt = pulse.startAt + pulse.duration;

  oscillator.type = pulse.type;
  oscillator.frequency.setValueAtTime(pulse.frequency, pulse.startAt);
  gain.gain.setValueAtTime(0.0001, pulse.startAt);
  gain.gain.exponentialRampToValueAtTime(pulse.volume, attackEnd);
  gain.gain.setValueAtTime(pulse.volume, releaseStart);
  gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(pulse.startAt);
  oscillator.stop(stopAt);
}
