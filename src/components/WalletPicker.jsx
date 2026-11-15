import React, { useEffect, useRef, useState } from 'react';
import { useBallot } from '../state/BallotContext.jsx';
import { connectWallet } from '../services/votingService.js';
import { CloseIcon, WalletIcon } from './Icons.jsx';

export function WalletPicker() {
  const { pickerOpen, setPickerOpen, wallets, toast, finishUserConnect } = useBallot();
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    setError('');
    const onKey = (e) => e.key === 'Escape' && setPickerOpen(false);
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [pickerOpen, setPickerOpen]);

  if (!pickerOpen) return null;

  const choose = async (w) => {
    setPending(w.info.uuid);
    setError('');
    try {
      await connectWallet(w);
      setPickerOpen(false);
      finishUserConnect();
      toast(`Connected with ${w.info.name}.`, 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setPickerOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="picker-title" tabIndex={-1} ref={dialogRef}>
        <div className="modal-head">
          <h2 id="picker-title">Connect a wallet</h2>
          <button type="button" className="icon-btn" onClick={() => setPickerOpen(false)} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        {wallets.length === 0 ? (
          <div className="picker-empty">
            <p>No browser wallet was found in this browser.</p>
            <p>
              Install <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">MetaMask</a> or another Ethereum
              wallet extension, then reload this page. You can keep browsing polls without one.
            </p>
          </div>
        ) : (
          <>
            <p className="modal-lede">Your wallet will ask you to approve the connection. Demos only sees your public address.</p>
            <ul className="picker-list">
              {wallets.map((w) => (
                <li key={w.info.uuid}>
                  <button type="button" className="picker-item" onClick={() => choose(w)} disabled={Boolean(pending)}>
                    {w.info.icon ? <img src={w.info.icon} alt="" width="28" height="28" /> : <WalletIcon width={28} height={28} />}
                    <span className="picker-name">{w.info.name}</span>
                    <span className="picker-meta">{pending === w.info.uuid ? 'Check your wallet…' : w.legacy ? 'Injected' : 'Detected'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
