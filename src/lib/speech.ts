import * as Speech from 'expo-speech';

let muted = false;

export async function initSpeech(): Promise<{ language: string; available: boolean }> {
  return { language: 'en-US', available: true };
}

// Always true — English TTS is built into every device.
export function isMongolianAvailable(): boolean { return false; }
export function isMuted(): boolean { return muted; }

export function setMuted(value: boolean) {
  muted = value;
  if (value) Speech.stop();
}

export function speak(text: string) {
  if (muted || !text) return;
  Speech.stop();
  Speech.speak(text, { language: 'en-US', rate: 0.95, pitch: 1.0 });
}

export function stopSpeech() {
  Speech.stop();
}
