import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readSoundMuted, saveSoundMuted, SOUND_MUTED_KEY } from '../src/lib/soundPreference.js';

test('mute preference is saved and read from storage', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(readSoundMuted(storage), false);
  saveSoundMuted(true, storage);
  assert.equal(values.get(SOUND_MUTED_KEY), 'true');
  assert.equal(readSoundMuted(storage), true);
  saveSoundMuted(false, storage);
  assert.equal(readSoundMuted(storage), false);
});

test('localStorage failures do not crash mute preference reads or writes', () => {
  const storage = {
    getItem() { throw new Error('storage unavailable'); },
    setItem() { throw new Error('storage unavailable'); },
  };
  assert.doesNotThrow(() => saveSoundMuted(true, storage));
  assert.doesNotThrow(() => readSoundMuted(storage));
  assert.equal(readSoundMuted(storage), false);
});
