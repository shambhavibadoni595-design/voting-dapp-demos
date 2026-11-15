import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

let server;
let toTxError;

test('toTxError maps transaction errors without changing established messages', async () => {
  server = await createServer({
    configFile: 'vite.config.js',
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  ({ toTxError } = await server.ssrLoadModule('/src/services/transactionService.js'));
  const { getLocalHistory } = await server.ssrLoadModule('/src/services/transactionService.js');
  const { byteLength, validatePollInput } = await server.ssrLoadModule('/src/services/votingService.js');
  const { shouldRetryRead } = await server.ssrLoadModule('/src/services/contractService.js');
  const { saveLinkedContract } = await server.ssrLoadModule('/src/config/contractConfig.js');

  const cases = [
    {
      input: { code: 'UNPREDICTABLE_GAS_LIMIT' },
      code: 'UNPREDICTABLE_GAS_LIMIT',
      message: 'Could not estimate gas for this transaction. The contract may reject it.',
    },
    {
      input: { code: 'NONCE_EXPIRED' },
      code: 'NONCE_EXPIRED',
      message: 'This transaction nonce was already used. Check your wallet activity.',
    },
    {
      input: { code: 'REPLACEMENT_UNDERPRICED' },
      code: 'REPLACEMENT_UNDERPRICED',
      message: 'The replacement transaction fee is too low. The original transaction may still be pending.',
    },
    {
      input: { code: 'TIMEOUT' },
      code: 'TIMEOUT',
      message: 'The Sepolia network did not respond. Check your connection and try again.',
    },
    {
      input: { code: 'INSUFFICIENT_FUNDS' },
      code: 'INSUFFICIENT_FUNDS',
      message: 'You need Sepolia test ETH to pay the network gas fee.',
    },
    {
      input: { code: 'ACTION_REJECTED' },
      code: 'REJECTED',
      message: 'You rejected the transaction in your wallet. Nothing was sent.',
    },
    {
      input: { code: 'CALL_EXCEPTION', reason: 'Poll is closed' },
      code: 'REVERTED',
      message: 'Poll is closed',
    },
  ];

  for (const { input, code, message } of cases) {
    const mapped = toTxError(input);
    assert.equal(mapped.code, code);
    assert.equal(mapped.message, message);
  }

  const fractionalDuration = validatePollInput({
    question: 'Question?',
    description: '',
    options: ['A', 'B'],
    durationSeconds: 60.5,
  });
  assert.equal(fractionalDuration.ok, false);
  assert.equal(fractionalDuration.errors.duration, 'Duration must be a whole number of seconds.');
  assert.equal(byteLength('💡'), 4);
  assert.equal(
    validatePollInput({
      question: `${'q'.repeat(276)}💡`,
      description: '',
      options: ['A', 'B'],
      durationSeconds: 60,
    }).ok,
    true
  );
  assert.equal(
    validatePollInput({
      question: `${'q'.repeat(277)}💡`,
      description: '',
      options: ['A', 'B'],
      durationSeconds: 60,
    }).errors.question,
    'Keep the question under 280 bytes.'
  );

  assert.equal(shouldRetryRead({ code: 'TIMEOUT' }), true);
  assert.equal(shouldRetryRead({ status: 429 }), true);
  assert.equal(shouldRetryRead({ code: 'CALL_EXCEPTION', message: 'execution reverted' }), false);

  const originalWindow = globalThis.window;
  const history = Array.from({ length: 102 }, (_, index) => ({
    type: 'vote',
    hash: `0x${String(index + 1).padStart(64, '0')}`,
    status: 'confirmed',
    blockNumber: index + 1,
    timestamp: index + 1,
    from: '0x0000000000000000000000000000000000000001',
    contract: '0x0000000000000000000000000000000000000002',
    pollId: 1,
    optionIndex: 0,
    chainId: 11155111,
  }));
  history.unshift({ ...history[0], type: 'pending', hash: 'invalid' });
  globalThis.window = { localStorage: { getItem: () => JSON.stringify(history) } };
  try {
    assert.equal(getLocalHistory().length, 100);
    globalThis.window.localStorage.setItem = () => {
      throw new Error('storage disabled');
    };
    assert.throws(
      () => saveLinkedContract('0x0000000000000000000000000000000000000003', 1),
      /Could not save the linked contract/
    );
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

after(async () => {
  if (server) await server.close();
});
