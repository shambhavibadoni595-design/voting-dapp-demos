import React, { useEffect, useMemo, useState } from 'react';
import { useBallot, useTransaction } from '../state/BallotContext.jsx';
import { Countdown, StatusTag, usePollOpen } from '../components/Countdown.jsx';
import { ResultBars } from '../components/ResultBars.jsx';
import { BallotReceipt } from '../components/BallotReceipt.jsx';
import { TxProgress } from '../components/TxProgress.jsx';
import { GasAssistPanel } from '../components/GasAssistPanel.jsx';
import { Address } from '../components/Address.jsx';
import { LoadError, NoContract } from '../components/States.jsx';
import { formatDateTime, formatPercent, percent } from '../utils/formatters.js';
import {
  getPoll,
  isHiddenPoll,
  getVoterChoice,
  vote,
  closePoll,
  getReceipt,
  findVoteTransaction,
  getTransactionHistory,
  switchToSepolia,
} from '../services/votingService.js';

function usePoll(id) {
  const { polls, pollsStatus, contract } = useBallot();
  const fromList = polls.find((p) => p.id === id && !isHiddenPoll(p.id, contract?.address)) || null;
  const [fetched, setFetched] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    if (!contract || !Number.isInteger(id) || id < 0) return undefined;
    if (fromList) return undefined;
    if (pollsStatus === 'loading') return undefined;
    getPoll(id)
      .then((p) => active && setFetched(p))
      .catch((err) => active && setError(err));
    return () => {
      active = false;
    };
  }, [id, contract, fromList, pollsStatus, attempt]);

  return { poll: fromList || fetched, error, retry: () => setAttempt((value) => value + 1) };
}

/** The connected wallet's vote on this poll, and its receipt if we can find the transaction. */
function useMyBallot(pollId, refreshKey) {
  const { wallet, contract } = useBallot();
  const [choice, setChoice] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [receiptState, setReceiptState] = useState('idle');
  const [readError, setReadError] = useState(null);
  const [receiptError, setReceiptError] = useState(null);

  useEffect(() => {
    let active = true;
    setChoice(null);
    setReceipt(null);
    setReceiptState('idle');
    setReadError(null);
    setReceiptError(null);
    if (!wallet.address || !contract) return undefined;
    (async () => {
      let c;
      try {
        c = await getVoterChoice(pollId, wallet.address);
      } catch (err) {
        if (active) setReadError(err);
        return;
      }
      if (!active) return;
      setChoice(c);
      if (!c?.voted) return;
      setReceiptState('loading');
      try {
        const local = getTransactionHistory(wallet.address).find(
          (r) => r.type === 'vote' && r.pollId === pollId && r.contract?.toLowerCase() === contract.address.toLowerCase()
        );
        const hash = local?.hash || (await findVoteTransaction(pollId, wallet.address));
        if (!hash) {
          if (active) setReceiptState('missing');
          return;
        }
        const r = await getReceipt(hash);
        if (active) {
          setReceipt(r);
          setReceiptState('ready');
        }
      } catch (err) {
        if (active) {
          setReceiptError(err);
          setReceiptState('error');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [pollId, wallet.address, contract, refreshKey]);

  return { choice, receipt, receiptState, readError, receiptError, setReceipt, setChoice };
}

function BallotOptions({ poll, selected, onSelect, disabled }) {
  return (
    <fieldset className="ballot-options" disabled={disabled} data-tour-target="vote-options">
      <legend className="sr-only">Choose one answer</legend>
      {poll.options.map((option, i) => {
        const votes = poll.votes[i] || 0;
        return (
          <label key={i} className={`ballot-option ${selected === i ? 'selected' : ''}`}>
            <input type="radio" name={`poll-${poll.id}`} value={i} checked={selected === i} onChange={() => onSelect(i)} />
            <span className="opt-num">{i + 1}</span>
            <span className="opt-body">
              <span className="opt-text">{option}</span>
              <span className="opt-bar" aria-hidden="true">
                <span style={{ width: `${percent(votes, poll.totalVotes)}%` }} />
              </span>
              <span className="opt-figures">
                {votes.toLocaleString()} {votes === 1 ? 'vote' : 'votes'}, {formatPercent(votes, poll.totalVotes)}
              </span>
            </span>
            <span className="opt-box" aria-hidden="true">
              {selected === i ? '✕' : ''}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export function PollPage({ route }) {
  const id = Number(route.segments[1]);
  const { contract, wallet, requestConnect, refreshPolls, refreshMyVotes, toast, txBusy, pollsStatus, pollsError } = useBallot();
  const { poll, error, retry: retryPoll } = usePoll(id);
  const { open } = usePollOpen(poll);
  const [refreshKey, setRefreshKey] = useState(0);
  const { choice, receipt, receiptState, readError, receiptError, setReceipt, setChoice } = useMyBallot(id, refreshKey);
  const [selected, setSelected] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const voteTx = useTransaction();
  const closeTx = useTransaction();

  useEffect(() => {
    setSelected(null);
    setPrinting(false);
    setConfirmClose(false);
    voteTx.reset();
    closeTx.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, wallet.address]);

  const isCreator = useMemo(
    () => Boolean(poll && wallet.address && poll.creator.toLowerCase() === wallet.address.toLowerCase()),
    [poll, wallet.address]
  );

  if (!contract) return <div className="page" data-tour-target="poll-details"><NoContract /></div>;
  if (!Number.isInteger(id) || id < 0) {
    return (
      <div className="page">
        <div className="notice"><h3>That is not a poll number</h3><a href="#/polls">Back to live polls</a></div>
      </div>
    );
  }
  if (pollsStatus === 'error') {
    return (
      <div className="page">
        <LoadError error={pollsError} onRetry={refreshPolls} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="page">
        {error.code === 'NETWORK_UNREACHABLE' ? (
          <LoadError error={error} onRetry={retryPoll} />
        ) : (
          <div className="notice warn" role="alert">
            <h3>Poll #{id} could not be loaded</h3>
            <p>{error.message}</p>
            <a href="#/polls">Back to live polls</a>
          </div>
        )}
      </div>
    );
  }
  if (!poll) {
    return (
      <div className="page">
        {pollsStatus === 'error' ? (
          <LoadError error={pollsError} onRetry={refreshPolls} />
        ) : (
          <p className="fine" aria-busy="true">Reading poll #{id} from Sepolia…</p>
        )}
      </div>
    );
  }

  const voted = choice?.voted;
  const busy = txBusy || ['checking', 'awaiting_signature', 'submitted'].includes(voteTx.tx.status);

  const submitVote = async () => {
    if (selected === null) return;
    const result = await voteTx.run((onStatus) => vote(poll.id, selected, onStatus));
    if (result) {
      setReceipt(result.receipt);
      setChoice({ voted: true, optionIndex: selected });
      setPrinting(true);
      toast(`Vote recorded in block ${result.record.blockNumber.toLocaleString()}.`, 'success');
      refreshPolls();
      refreshMyVotes([poll.id]);
    }
  };

  const submitClose = async () => {
    const result = await closeTx.run((onStatus) => closePoll(poll.id, onStatus));
    if (result) {
      setConfirmClose(false);
      toast(`Poll #${poll.id} closed in block ${result.record.blockNumber.toLocaleString()}.`, 'success');
      refreshPolls();
      setRefreshKey((k) => k + 1);
    }
  };

  let action;
  if (readError) {
    action = <p className="ballot-state">Your on-chain voting status could not be checked. Retry the read before voting.</p>;
  } else if (voted) {
    action = (
      <p className="ballot-state done">
        You voted for <strong>{poll.options[choice.optionIndex]}</strong>. The contract accepts one vote per address, so this
        your vote is final.
      </p>
    );
  } else if (!open) {
    action = <p className="ballot-state">This poll is closed. The results below are final.</p>;
  } else if (!wallet.address) {
    action = (
      <div className="ballot-actions">
        <button type="button" className="btn btn-primary" onClick={requestConnect}>
          Connect wallet to vote
        </button>
        <span className="fine">You can read the poll without a wallet. Voting needs one.</span>
      </div>
    );
  } else if (!wallet.isSepolia) {
    action = (
      <div className="ballot-actions">
        <button
          type="button"
          className="btn btn-warn"
          onClick={() => switchToSepolia().catch((err) => toast(err.message, 'error'))}
        >
          Switch to Sepolia to vote
        </button>
      </div>
    );
  } else {
    action = (
      <div className="ballot-actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={submitVote} disabled={selected === null || busy}>
          {busy ? 'Voting…' : 'Vote'}
        </button>
        <span className="fine">
          {selected === null ? 'Mark one answer first.' : `You are voting for “${poll.options[selected]}”. Your wallet will ask you to confirm.`}
        </span>
      </div>
    );
  }

  const showInputs = open && !voted && wallet.address && wallet.isSepolia;

  return (
    <div className="page poll-page">
      <a href="#/polls" className="back-link">All polls</a>

      <div className="poll-layout">
        {readError && (
          <LoadError error={readError} onRetry={() => setRefreshKey((key) => key + 1)} />
        )}
        <article className="ballot-paper" data-tour-target="poll-details">
          <header className="ballot-head">
            <span className="poll-id">Poll #{poll.id}</span>
            <StatusTag poll={poll} />
            <Countdown poll={poll} />
            {voted && <span className="voted-tag">You voted</span>}
          </header>
          <h1 className="ballot-q">{poll.question}</h1>
          {poll.description && <p className="ballot-desc">{poll.description}</p>}

          {showInputs ? (
            <BallotOptions poll={poll} selected={selected} onSelect={setSelected} disabled={busy} />
          ) : (
            <ResultBars poll={poll} myChoice={voted ? choice.optionIndex : -1} tourTarget="poll-results" />
          )}

          <p className="ballot-total">
            {poll.totalVotes.toLocaleString()} {poll.totalVotes === 1 ? 'vote' : 'votes'} counted by the contract
          </p>

          {action}

          {voteTx.tx.status === 'insufficient' && (
            <GasAssistPanel action="cast your vote" preflight={voteTx.tx.preflight} onRetry={submitVote} onClose={voteTx.reset} />
          )}
          <TxProgress tx={voteTx.tx} verb="vote" onRetry={submitVote} onDismiss={voteTx.reset} />

          {isCreator && open && (
            <section className="creator-tools">
              <h2>You created this poll</h2>
              {!confirmClose ? (
                <>
                  <p>You can close it before its deadline. Nobody can vote after that, and it cannot be reopened.</p>
                  <button type="button" className="btn btn-secondary" onClick={() => setConfirmClose(true)} disabled={txBusy}>
                    Close poll early
                  </button>
                </>
              ) : (
                <>
                  <p>Close poll #{poll.id} now? This sends a transaction and cannot be undone.</p>
                  <div className="ballot-actions">
                    <button type="button" className="btn btn-danger" onClick={submitClose} disabled={txBusy}>
                      Close poll now
                    </button>
                    <button type="button" className="btn btn-quiet" onClick={() => { setConfirmClose(false); closeTx.reset(); }}>
                      Keep it open
                    </button>
                  </div>
                </>
              )}
              {closeTx.tx.status === 'insufficient' && (
                <GasAssistPanel action="close this poll" preflight={closeTx.tx.preflight} onRetry={submitClose} onClose={closeTx.reset} />
              )}
              <TxProgress tx={closeTx.tx} verb="close the poll" onRetry={submitClose} onDismiss={closeTx.reset} />
            </section>
          )}
        </article>

        <aside className="poll-aside">
          {voted && receipt && <BallotReceipt receipt={receipt} printing={printing} />}
          {voted && receiptState === 'loading' && <p className="fine">Finding your vote transaction on Sepolia…</p>}
          {voted && receiptState === 'error' && (
            <LoadError error={receiptError} onRetry={() => setRefreshKey((key) => key + 1)} />
          )}
          {voted && receiptState === 'missing' && (
            <p className="fine">
              The contract confirms you voted, but the transaction could not be located in the scanned block range. It is
              still listed under your address on Etherscan.
            </p>
          )}

          <section className="record">
            <h2>On-chain record</h2>
            <dl className="facts">
              <div><dt>Creator</dt><dd><Address value={poll.creator} /></dd></div>
              <div><dt>Created</dt><dd>{formatDateTime(poll.createdAt)}</dd></div>
              <div>
                <dt>{poll.closedEarly ? 'Closed early' : open ? 'Closes' : 'Closed'}</dt>
                <dd>{formatDateTime(poll.closedEarly ? poll.closedAt : poll.endTime)}</dd>
              </div>
              <div><dt>Answers</dt><dd>{poll.options.length}</dd></div>
              <div><dt>Contract</dt><dd><Address value={contract.address} /></dd></div>
            </dl>
            <p className="fine">
              These values are read from the contract, not from a server. Once the contract source is verified, you can
              check them yourself on Etherscan’s Read Contract tab with <code>getPoll({poll.id})</code>.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
