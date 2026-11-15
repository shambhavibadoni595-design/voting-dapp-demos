import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routePathFromHash, shouldNavigateToCreateAfterConnect } from '../src/lib/connectNavigation.js';

const successfulHomeConnect = {
  userInitiated: true,
  routeAtStart: '/',
  routeAtCompletion: '/',
  connected: true,
  isSepolia: true,
  hasDefaultContract: true,
};

test('a successful user-initiated home connection navigates to Create a poll', () => {
  assert.equal(shouldNavigateToCreateAfterConnect(successfulHomeConnect), true);
});

test('a connection from the wallet page does not navigate away from wallet activity', () => {
  assert.equal(
    shouldNavigateToCreateAfterConnect({
      ...successfulHomeConnect,
      routeAtStart: '/wallet',
      routeAtCompletion: '/wallet',
    }),
    false
  );
});

test('auto-reconnect never navigates to Create a poll', () => {
  assert.equal(shouldNavigateToCreateAfterConnect({ ...successfulHomeConnect, userInitiated: false }), false);
});

test('connections from polls, receipts, and activity never redirect', () => {
  for (const route of ['/poll/3', '/receipt/0xabc', '/activity']) {
    assert.equal(
      shouldNavigateToCreateAfterConnect({
        ...successfulHomeConnect,
        routeAtStart: route,
        routeAtCompletion: route,
      }),
      false
    );
  }
});

test('failed, wrong-network, and no-default connections stay on the current page', () => {
  assert.equal(shouldNavigateToCreateAfterConnect({ ...successfulHomeConnect, connected: false }), false);
  assert.equal(shouldNavigateToCreateAfterConnect({ ...successfulHomeConnect, isSepolia: false }), false);
  assert.equal(shouldNavigateToCreateAfterConnect({ ...successfulHomeConnect, hasDefaultContract: false }), false);
});

test('leaving an allowed page while the wallet request is open prevents redirect', () => {
  assert.equal(
    shouldNavigateToCreateAfterConnect({ ...successfulHomeConnect, routeAtCompletion: '/poll/3' }),
    false
  );
});

test('hash route parsing ignores query parameters', () => {
  assert.equal(routePathFromHash('#/wallet?next=create'), '/wallet');
  assert.equal(routePathFromHash(''), '/');
});
