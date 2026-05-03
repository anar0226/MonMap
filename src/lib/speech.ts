import * as Speech from 'expo-speech';

let mongolianAvailable: boolean | null = null;
let preferredLang = 'mn-MN';
let muted = false;

export async function initSpeech(): Promise<{ language: string; available: boolean }> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const mnVoice = voices.find(v => v.language?.toLowerCase().startsWith('mn'));
    if (mnVoice) {
      mongolianAvailable = true;
      preferredLang = mnVoice.language;
    } else {
      mongolianAvailable = false;
      const ru = voices.find(v => v.language?.toLowerCase().startsWith('ru'));
      preferredLang = ru?.language ?? 'en-US';
    }
  } catch {
    mongolianAvailable = false;
    preferredLang = 'en-US';
  }
  return { language: preferredLang, available: mongolianAvailable };
}

export function isMongolianAvailable(): boolean {
  return mongolianAvailable === true;
}

export function speak(text: string) {
  if (muted || !text) return;
  Speech.stop();
  Speech.speak(text, {
    language: preferredLang,
    rate: 0.95,
    pitch: 1.0,
  });
}

export function setMuted(value: boolean) {
  muted = value;
  if (value) Speech.stop();
}

export function isMuted(): boolean {
  return muted;
}

export function stopSpeech() {
  Speech.stop();
}
