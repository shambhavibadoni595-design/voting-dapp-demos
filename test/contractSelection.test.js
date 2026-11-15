import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEGACY_CONTRACT_KEY, selectConfiguredContract } from '../src/config/contractSelection.js';

test('a stale saved browser address is cleared and ignored in favor of the configured contract', () => {
  const values = new Map([[LEGACY_CONTRACT_KEY, JSON.stringify({ address: '0x0000000000000000000000000000000000000001', deploymentBlock: 1 })]]);
  const storage = { getItem: (key) => values.get(key), removeItem: (key) => values.delete(key) };
  const configured = { address: '0x9E5cA66E99dA712c6A709a6C916b2ca8068BD30E', deploymentBlock: 12140019 };
  assert.equal(selectConfiguredContract(configured, storage), configured);
  assert.equal(storage.getItem(LEGACY_CONTRACT_KEY), undefined);
});
