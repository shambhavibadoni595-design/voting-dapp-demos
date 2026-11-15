import React, { useState } from 'react';
import { useBallot } from '../state/BallotContext.jsx';
import { CopyButton, ExternalLink } from '../components/Address.jsx';
import { GasAssistPanel } from '../components/GasAssistPanel.jsx';
import { ActivityFeed } from './ActivityPage.jsx';
import { disconnectWallet, refreshBalance, switchToSepolia, etherscan, FAUCET } from '../services/votingService.js';
import { formatEth } from '../utils/formatters.js';

export function WalletPage() {
  const { wallet, requestConnect, toast } = useBallot();
  const [busy, setBusy] = useState(false);
  const [showFaucet, setShowFaucet] = useState(false);

  if (!wallet.address) {
    return (
      <div className="page narrow">
        <header className="page-head">
          <h1>Your wallet</h1>
          <p className="page-lede">Not connected. You can read every poll without a wallet; you need one to vote or create a poll.</p>
        </header>
        <button type="button" className="btn btn-primary" onClick={requestConnect} data-tour-target="wallet-action">Connect wallet</button>
      </div>
    );
  }

  const act = async (fn, success) => {
    setBusy(true);
    try {
      await fn();
      if (success) toast(success, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const lowBalance = wallet.balanceWei !== null && BigInt(wallet.balanceWei) < 1_000_000_000_000_000n; // < 0.001 ETH

  return (
    <div className="page">
      <header className="page-head">
        <h1>Your wallet</h1>
        <p className="page-lede">Your address is your voter ID. Demos sees only this public address, never your keys.</p>
      </header>

      <div className="two-col wallet-layout">
        <section>
          <dl className="facts boxed" data-tour-target="wallet-action">
            <div>
              <dt>Address</dt>
              <dd className="mono-inline">
                <span className="break">{wallet.address}</span>
                <CopyButton value={wallet.address} label="Copy address" />
              </dd>
            </div>
            <div><dt>Wallet</dt><dd>{wallet.walletName || 'Browser wallet'}</dd></div>
            <div><dt>Status</dt><dd>Connected</dd></div>
            <div>
              <dt>Network</dt>
              <dd>
                {wallet.isSepolia ? 'Ethereum Sepolia (11155111)' : `Chain ${wallet.chainId}, not Sepolia`}
                {!wallet.isSepolia && (
                  <button type="button" className="btn btn-warn btn-sm inline-btn" disabled={busy} onClick={() => act(switchToSepolia, 'Switched to Sepolia.')}>
                    Switch to Sepolia
                  </button>
                )}
              </dd>
            </div>
            <div>
              <dt>Sepolia balance</dt>
              <dd>
                {wallet.balanceWei === null ? (wallet.balanceError || 'Reading…') : `${formatEth(wallet.balanceWei, 6)} ETH`}
                <button type="button" className="btn btn-quiet btn-sm inline-btn" disabled={busy} onClick={() => act(refreshBalance)}>
                  Refresh
                </button>
              </dd>
            </div>
          </dl>
          <div className="hero-actions">
            <ExternalLink href={etherscan.address(wallet.address)} className="btn btn-secondary">Your address on Etherscan</ExternalLink>
            <button type="button" className="btn btn-quiet" onClick={() => setShowFaucet((s) => !s)}>
              {showFaucet ? 'Hide faucet help' : 'Get test ETH'}
            </button>
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => act(disconnectWallet, 'Disconnected. Demos no longer has access to your address.')}>
              Disconnect
            </button>
          </div>
          {(showFaucet || lowBalance) && (
            <GasAssistPanel action="vote or create polls" onClose={lowBalance ? undefined : () => setShowFaucet(false)} />
          )}
          {!showFaucet && !lowBalance && (
            <p className="fine">Running low later? Request free test ETH from the <a href={FAUCET.url} target="_blank" rel="noreferrer">{FAUCET.name}</a>.</p>
          )}
        </section>

        <section className="wallet-transactions">
          <h2 className="section-title">Your transactions on this contract</h2>
          <p className="fine">Found from contract events that name your address, so they show up on any device.</p>
          <ActivityFeed actor={wallet.address} pageSize={15} showFilters={false} />
        </section>
      </div>
    </div>
  );
}
