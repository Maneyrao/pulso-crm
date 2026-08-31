import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installAccessAudioUnlock,
  playAccessTone,
  resetAccessAudioForTests,
} from './access-feedback';

interface ScheduledOscillator {
  type: OscillatorType;
  frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
}

const oscillators: ScheduledOscillator[] = [];
const gainValues: number[] = [];
const resume = vi.fn(async () => undefined);

class FakeAudioContext {
  static instances = 0;
  currentTime = 4;
  destination = {} as AudioDestinationNode;
  state: AudioContextState = 'running';

  constructor() {
    FakeAudioContext.instances += 1;
  }

  resume = resume;

  createOscillator(): OscillatorNode {
    const oscillator: ScheduledOscillator = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      start: vi.fn(),
      stop: vi.fn(),
      connect: vi.fn(),
    };
    oscillators.push(oscillator);
    return oscillator as unknown as OscillatorNode;
  }

  createGain(): GainNode {
    return {
      gain: {
        setValueAtTime: vi.fn((value: number) => gainValues.push(value)),
        exponentialRampToValueAtTime: vi.fn((value: number) => gainValues.push(value)),
      },
      connect: vi.fn(),
    } as unknown as GainNode;
  }
}

beforeEach(() => {
  oscillators.length = 0;
  gainValues.length = 0;
  resume.mockClear();
  FakeAudioContext.instances = 0;
  resetAccessAudioForTests();
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: FakeAudioContext,
  });
});

afterEach(() => {
  Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
});

describe('access feedback', () => {
  it('permitido reproduce un único tick agudo de 80 ms', () => {
    playAccessTone('ALLOWED');

    expect(oscillators).toHaveLength(1);
    expect(oscillators[0]!.type).toBe('sine');
    expect(oscillators[0]!.frequency.setValueAtTime).toHaveBeenCalledWith(1_100, 4);
    expect(oscillators[0]!.start).toHaveBeenCalledWith(4);
    expect(oscillators[0]!.stop).toHaveBeenCalledWith(4.08);
    expect(gainValues).toContain(0.18);
  });

  it('denegado reproduce una doble alarma grave y más fuerte', () => {
    playAccessTone('DENIED');

    expect(oscillators).toHaveLength(2);
    expect(oscillators.map((item) => item.type)).toEqual(['sawtooth', 'sawtooth']);
    expect(oscillators[0]!.frequency.setValueAtTime).toHaveBeenCalledWith(165, 4);
    expect(oscillators[1]!.frequency.setValueAtTime).toHaveBeenCalledWith(110, 4.27);
    expect(gainValues).toContain(0.42);
    expect(gainValues).toContain(0.46);
  });

  it('habilita WebAudio con la primera interacción y retira los listeners', () => {
    const cleanup = installAccessAudioUnlock();
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(FakeAudioContext.instances).toBe(1);
    cleanup();
  });
});
