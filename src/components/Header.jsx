import React, { useEffect, useState } from 'react';
import { useBallot } from '../state/BallotContext.jsx';
import { BallotMark, MenuIcon, CloseIcon } from './Icons.jsx';
import { formatEth, shortAddress } from '../utils/formatters.js';
import { pokeChain, switchToSepolia } from '../services/votingService.js';

const NAV = [
  { href: '#/polls', label: 'Live polls', match: ['polls', 'poll', 'receipt'] },
  { href: '#/create', label: 'Create a poll', match: ['create'] },
  { href: '#/activity', label: 'Activity', match: ['activity'] },
  { href: '#/how-it-works', label: 'How it works', match: ['how-it-works'] },
  { href: '#/under-the-hood', label: 'Under the hood', match: ['under-the-hood'] },
  { href: '#/faq', label: 'FAQ', match: ['faq'] },
  { href: '#/contract', label: 'Contract', match: ['contract'] },
];

function NetworkIndicator() {
  const { wallet, chainError, latestBlock } = useBallot();
  let tone = 'ok';
  let text = 'Sepolia';
  let title = latestBlock ? `Reading Sepolia, block ${latestBlock.toLocaleString()}` : 'Reading Sepolia';
  if (chainError?.code === 'NETWORK_UNREACHABLE') {
    tone = 'bad';
    text = 'Sepolia unreachable';
    title = chainError.message;
  } else if (wallet.address && !wallet.isSepolia) {
    tone = 'warn';
    text = 'Wrong network';
    title = `Your wallet is on chain ${wallet.chainId}`;
  }
  return (
    <a href="#/contract" className={`net-indicator ${tone}`} title={title}>
      <span className="net-dot" aria-hidden="true" />
      {text}
    </a>
  );
}

function WalletButton() {
  const { wallet, requestConnect } = useBallot();
  if (wallet.status === 'connecting') {
    return (
      <button type="button" className="btn btn-secondary btn-wallet" disabled data-tour-target="wallet-connect">
        Check your wallet…
      </button>
    );
  }
  if (!wallet.address) {
    return (
      <button type="button" className="btn btn-primary btn-wallet" onClick={requestConnect} data-tour-target="wallet-connect">
        Connect wallet
      </button>
    );
  }
  return (
    <a href="#/wallet" className="wallet-chip" title={wallet.address} data-tour-target="wallet-connect">
      {wallet.walletIcon ? <img src={wallet.walletIcon} alt="" width="18" height="18" /> : null}
      <span className="wallet-chip-addr">{shortAddress(wallet.address)}</span>
      <span className="wallet-chip-bal">
        {wallet.balanceWei === null ? '…' : `${formatEth(wallet.balanceWei, 3)} ETH`}
      </span>
    </a>
  );
}

export function Header({ route }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route.path]);
  const current = route.segments[0] || '';

  return (
    <header className="site-header">
      <div className="header-inner">
        <a href="#/" className="wordmark" aria-label="Demos home">
          <BallotMark />
          <span>Demos</span>
        </a>

        <nav className={`site-nav ${open ? 'open' : ''}`} aria-label="Main">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className={item.match.includes(current) ? 'active' : ''} aria-current={item.match.includes(current) ? 'page' : undefined}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="header-tools">
          <NetworkIndicator />
          <WalletButton />
          <button type="button" className="icon-btn nav-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>
    </header>
  );
}

export function NetworkUnavailableBanner() {
  const { chainError, refreshPolls } = useBallot();
  const [retrying, setRetrying] = useState(false);
  if (chainError?.code !== 'NETWORK_UNREACHABLE') return null;

  const retry = async () => {
    setRetrying(true);
    try {
      await Promise.all([refreshPolls(), pokeChain()]);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="network-banner" role="alert">
      <p>Sepolia is unreachable. Poll and transaction data may be out of date.</p>
      <button type="button" className="btn btn-sm btn-warn" onClick={retry} disabled={retrying}>
        {retrying ? 'Retrying…' : 'Retry connection'}
      </button>
    </div>
  );
}

export function NetworkBanner() {
  const { wallet, toast } = useBallot();
  const [busy, setBusy] = useState(false);
  if (!wallet.address || wallet.isSepolia) return null;
  const onSwitch = async () => {
    setBusy(true);
    try {
      await switchToSepolia();
      toast('Switched to Ethereum Sepolia.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="network-banner" role="alert">
      <p>
        Your wallet is on chain {wallet.chainId}. Demos runs on Ethereum Sepolia (chain 11155111), so voting and creating
        polls are paused until you switch.
      </p>
      <button type="button" className="btn btn-sm btn-warn" onClick={onSwitch} disabled={busy}>
        {busy ? 'Check your wallet…' : 'Switch to Sepolia'}
      </button>
    </div>
  );
}
