export const SOUND_MUTED_KEY = 'demos.assistant.sound-muted.v1';

function getStorage(storage) {
  return storage ?? globalThis.window?.localStorage;
}

export function readSoundMuted(storage) {
  try {
    return getStorage(storage)?.getItem(SOUND_MUTED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveSoundMuted(muted, storage) {
  try {
    getStorage(storage)?.setItem(SOUND_MUTED_KEY, muted ? 'true' : 'false');
  } catch {
    // Sound controls still work for this visit when storage is unavailable.
  }
}
