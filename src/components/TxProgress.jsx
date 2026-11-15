import React from 'react';
import { TxHash } from './Address.jsx';
import { formatEth, formatGwei } from '../utils/formatters.js';

const STEPS = [
  { key: 'checking', label: 'Check network and gas' },
  { key: 'awaiting_signature', label: 'Approve in your wallet' },
  { key: 'submitted', label: 'Wait for a Sepolia block' },
  { key: 'confirmed', label: 'Recorded on-chain' },
];
const ORDER = {
  idle: -1,
  checking: 0,
  awaiting_signature: 1,
  submitted: 2,
  pending: 2,
  cancelled: 2,
  rejected: 1,
  confirmed: 3,
};

function stepState(index, status, failedAt) {
  if (status === 'confirmed') return 'done';
  if (failedAt !== null) {
    if (index < failedAt) return 'done';
    if (index === failedAt) return 'failed';
    return 'todo';
  }
  const at = ORDER[status] ?? -1;
  if (index < at) return 'done';
  if (index === at) return 'active';
  return 'todo';
}

/**
 * Inline lifecycle for one transaction. `tx` comes from useTransaction().
 * @param {string} verb  e.g. "vote", "create the poll"
 */
export function TxProgress({ tx, verb = 'continue', onRetry, onDismiss }) {
  if (!tx || tx.status === 'idle' || tx.status === 'insufficient') return null;
  const failed = tx.status === 'failed';
  const rejected = tx.status === 'rejected';
  const cancelled = tx.status === 'cancelled';
  const terminal = failed || rejected || cancelled;
  let failedAt = null;
  if (failed) {
    if (tx.hash) failedAt = 2;
    else failedAt = 0;
  }

  return (
    <section
      className={`tx-progress ${failed ? 'is-failed' : ''} ${rejected ? 'is-rejected' : ''} ${cancelled ? 'is-cancelled' : ''} ${tx.status === 'confirmed' ? 'is-done' : ''}`}
      aria-live="polite"
    >
      <ol className="tx-steps">
        {STEPS.map((s, i) => (
          <li key={s.key} className={`tx-step ${stepState(i, tx.status, failedAt)}`}>
            <span className="tx-dot" aria-hidden="true" />
            <span>{s.label}</span>
          </li>
        ))}
      </ol>

      {tx.status === 'checking' && <p className="tx-note">Checking your network, simulating the transaction and reading your Sepolia balance.</p>}
      {tx.status === 'awaiting_signature' && (
        <p className="tx-note">
          Your wallet should be open. Review the transaction and confirm to {verb}.
          {tx.preflight && (
            <>
              {' '}
              Estimated network fee about {formatEth(tx.preflight.likelyCostWei, 6)} test ETH at {formatGwei(tx.preflight.likelyFeePerGas)} gwei.
            </>
          )}
        </p>
      )}
      {tx.status === 'submitted' && (
        <p className="tx-note">
          Sent. Waiting for it to be mined, usually 12 to 30 seconds. Transaction <TxHash value={tx.hash} />
        </p>
      )}
      {tx.status === 'pending' && (
        <p className="tx-note" role="status">
          Still pending; this is not a failure. The app is still tracking it. Check Etherscan for updates: <TxHash value={tx.hash} />
        </p>
      )}
      {tx.status === 'confirmed' && tx.record && (
        <>
          <p className="tx-note">
            Mined in block {tx.record.blockNumber.toLocaleString()}. Transaction <TxHash value={tx.record.hash} />
          </p>
          {tx.freshnessError && (
            <p className="tx-note" role="status">
              The transaction is confirmed, but updated poll data is not available from the read RPC yet.
            </p>
          )}
        </>
      )}
      {terminal && (
        <div className={`tx-error ${rejected || cancelled ? 'is-neutral' : ''}`} role="alert">
          <p>{tx.error?.message || 'The transaction did not go through.'}</p>
          {tx.hash && (
            <p>
              Transaction <TxHash value={tx.hash} />
            </p>
          )}
          <div className="tx-error-actions">
            {onRetry && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
                Try again
              </button>
            )}
            {onDismiss && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={onDismiss}>
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
