import React, { useState } from 'react';
import { CopyButton } from './Address.jsx';
import { ExternalIcon, RefreshIcon } from './Icons.jsx';
import { FAUCET, refreshBalance } from '../services/votingService.js';
import { formatEth } from '../utils/formatters.js';
import { useBallot } from '../state/BallotContext.jsx';

/**
 * Shown when the wallet's Sepolia balance is below the transaction's maximum gas cost.
 * It links out to a faucet; it never requests funds on the user's behalf.
 */
export function GasAssistPanel({ action = 'cast your vote', preflight, onRetry, onClose }) {
  const { wallet, toast } = useBallot();
  const [refreshing, setRefreshing] = useState(false);
  const address = wallet.address || preflight?.from;
  const balance = wallet.balanceWei ?? preflight?.balanceWei ?? null;
  const required = preflight?.maxCostWei ?? null;
  const enough = balance !== null && required !== null && BigInt(balance) >= BigInt(required);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshBalance();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="gas-panel" aria-labelledby="gas-title">
      <div className="gas-head">
        <h3 id="gas-title">Need test ETH to {action}?</h3>
        {onClose && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={onClose}>
            Not now
          </button>
        )}
      </div>
      <p className="gas-lede">You need Sepolia test ETH to pay the network gas fee.</p>
      <p>
        Demos runs on Ethereum Sepolia. Transactions require a small amount of test ETH to pay network gas fees. You can
        request free Sepolia test ETH from a faucet.
      </p>
      <p>
        You can get your ETH on{' '}
        <a href={FAUCET.url} target="_blank" rel="noreferrer">this website</a>.
      </p>

      <dl className="gas-figures">
        <div>
          <dt>Your address</dt>
          <dd className="mono-inline">
            <span className="break">{address}</span>
            {address && <CopyButton value={address} label="Copy address" />}
          </dd>
        </div>
        <div>
          <dt>Sepolia balance</dt>
          <dd>
            {balance === null ? 'Unknown' : `${formatEth(balance, 6)} ETH`}
            <button type="button" className="icon-btn" onClick={onRefresh} disabled={refreshing} aria-label="Refresh balance" title="Refresh balance">
              <RefreshIcon className={refreshing ? 'spin' : ''} />
            </button>
          </dd>
        </div>
        <div>
          <dt>Needed for this transaction</dt>
          <dd>
            {required === null ? 'Could not estimate' : `up to ${formatEth(required, 6)} ETH`}
            {preflight && !preflight.estimated && <span className="muted"> (rough, estimation unavailable)</span>}
          </dd>
        </div>
      </dl>

      <div className="gas-actions">
        <a className="btn btn-primary" href={FAUCET.url} target="_blank" rel="noreferrer">
          Get free Sepolia ETH <ExternalIcon />
        </a>
        {address && <CopyButton value={address} label="Copy address" showLabel className="btn btn-secondary" />}
        <button type="button" className="btn btn-secondary" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh balance'}
        </button>
        {onRetry && (
          <button type="button" className={`btn ${enough ? 'btn-primary' : 'btn-secondary'}`} onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
      {enough && <p className="gas-ok">Your balance now covers this transaction. Press Try again.</p>}

      <details className="gas-notes">
        <summary>How the faucet works</summary>
        <ul>
          <li>
            The button opens the {FAUCET.name} in a new tab. Paste your address there and request Sepolia ETH, then come back
            and refresh your balance.
          </li>
          <li>Sepolia ETH is test currency. It has no real-world monetary value and cannot be sold or moved to Ethereum mainnet.</li>
          <li>
            Google's faucet asks you to sign in with a Google account. Google sets how much it sends and how often you can
            ask; the faucet page shows the current amount and limit.
          </li>
          <li>Receiving test ETH is not guaranteed. A faucet can run dry, rate-limit you or turn down a request.</li>
          <li>Clicking the button does not fund your wallet by itself. Demos never sends faucet requests for you.</li>
          <li>Demos will never ask for your recovery phrase or private key, and neither should a faucet.</li>
        </ul>
        {FAUCET.backupUrl && (
          <p>
            If that faucet is unavailable, try{' '}
            <a href={FAUCET.backupUrl} target="_blank" rel="noreferrer">
              {FAUCET.backupName}
            </a>
            .
          </p>
        )}
      </details>
    </section>
  );
}
