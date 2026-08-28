import type { AccessDecision } from '@pulso/contracts/access';

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

let audioContext: AudioContext | null = null;

export function playAccessTone(decision: AccessDecision): void {
  if (typeof window === 'undefined') return;

  const AudioContextConstructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return;

  try {
    audioContext ??= new AudioContextConstructor();
    const context = audioContext;
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
  const notes = decision === 'ALLOWED' ? [659, 880] : [220, 165];
  const startAt = context.currentTime;
  const gain = context.createGain();

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.34);
  gain.connect(context.destination);

  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const noteStart = startAt + index * 0.11;
    oscillator.type = decision === 'ALLOWED' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    oscillator.connect(gain);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.16);
  });
}
