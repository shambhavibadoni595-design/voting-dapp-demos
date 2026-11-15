import React, { useEffect, useState } from 'react';
import { BallotReceipt } from '../components/BallotReceipt.jsx';
import { LoadError, NoContract } from '../components/States.jsx';
import { useBallot } from '../state/BallotContext.jsx';
import { getReceipt, isHiddenPoll } from '../services/votingService.js';

export function ReceiptPage({ route }) {
  const hash = route.segments[1] || '';
  const { contract } = useBallot();
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const hiddenPoll = state.status === 'ready' && isHiddenPoll(state.receipt.pollId, contract?.address);

  useEffect(() => {
    let active = true;
    if (!contract) return undefined;
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      setState({ status: 'error', message: 'That is not a transaction hash.' });
      return undefined;
    }
    setState({ status: 'loading' });
    getReceipt(hash)
      .then((r) => active && setState({ status: 'ready', receipt: r }))
      .catch((err) => active && setState({ status: 'error', message: err.message, error: err }));
    return () => {
      active = false;
    };
  }, [hash, contract, attempt]);

  if (!contract) return <div className="page"><NoContract /></div>;

  return (
    <div className="page receipt-page">
      <header className="page-head">
        <h1>Vote receipt</h1>
        <p className="page-lede">Rebuilt from Sepolia each time you open it: the transaction, its block, the Voted event and the poll.</p>
      </header>
      {state.status === 'loading' && <p className="fine" aria-busy="true">Reading the transaction from Sepolia…</p>}
      {state.status === 'error' && (
        state.error?.code === 'NETWORK_UNREACHABLE' ? (
          <LoadError error={state.error} onRetry={() => setAttempt((value) => value + 1)} />
        ) : (
          <div className="notice warn" role="alert">
            <h3>No receipt for this transaction</h3>
            <p>{state.message}</p>
            <a href="#/activity">See recent votes</a>
          </div>
        )
      )}
      {state.status === 'ready' && (
        <div className="receipt-center">
          <BallotReceipt receipt={state.receipt} />
          <p className="fine">
            {state.receipt.confirmations.toLocaleString()} {state.receipt.confirmations === 1 ? 'block has' : 'blocks have'} been
            built on top of this vote.{' '}
            {hiddenPoll ? (
              <>Poll #{state.receipt.pollId} is hidden on this site.</>
            ) : (
              <a href={`#/poll/${state.receipt.pollId}`}>Open poll #{state.receipt.pollId}</a>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
