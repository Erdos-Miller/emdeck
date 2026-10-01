import type { NotificationEvent } from '../../shared/contracts/notifications';

const tones: Record<NotificationEvent, number[]> = {
  waiting: [660, 880],
  done: [523.25, 659.25, 783.99],
  error: [392, 261.63],
};

let context: AudioContext | undefined;
const playing = new Set<OscillatorNode>();

export const activateNotificationAudio = async (): Promise<boolean> => {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') await context.resume();
    return context.state === 'running';
  } catch {
    return false;
  }
};

export const playNotificationSound = (event: NotificationEvent, volume: number): boolean => {
  if (!context || context.state !== 'running' || volume <= 0) return false;
  for (const oscillator of playing) oscillator.stop();
  playing.clear();
  const start = context.currentTime;
  tones[event].forEach((frequency, index) => {
    const oscillator = context!.createOscillator();
    const gain = context!.createGain();
    const at = start + index * 0.16;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime((Math.min(100, volume) / 100) * 0.18, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
    oscillator.connect(gain);
    gain.connect(context!.destination);
    oscillator.onended = () => {
      playing.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    playing.add(oscillator);
    oscillator.start(at);
    oscillator.stop(at + 0.15);
  });
  return true;
};

export const previewNotificationSound = async (event: NotificationEvent, volume: number) =>
  (await activateNotificationAudio()) && playNotificationSound(event, volume);

export const disposeNotificationAudio = () => {
  for (const oscillator of playing) oscillator.stop();
  playing.clear();
  if (context) void context.close().catch(() => {});
  context = undefined;
};
