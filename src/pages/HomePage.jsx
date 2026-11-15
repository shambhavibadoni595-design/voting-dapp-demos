import React, { useEffect, useState } from 'react';
import { useBallot } from '../state/BallotContext.jsx';
import { BallotReceipt, BlankReceipt } from '../components/BallotReceipt.jsx';
import { PollRow } from '../components/PollRow.jsx';
import { LoadError, PollsGate } from '../components/States.jsx';
import { SkeletonRows } from '../components/Skeleton.jsx';
import { ContractIcon, OneVoteIcon, ExplorerIcon } from '../components/Icons.jsx';
import { getReceipt, getTransactionHistory, isHiddenPoll, isPollOpen } from '../services/votingService.js';
import { shortAddress } from '../utils/formatters.js';

/** The newest vote this browser sent from the connected wallet, re-read from the chain. */
function useLatestReceipt() {
  const { wallet, contract, lastEvents } = useBallot();
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setReceipt(null);
    setError(null);
    if (!wallet.address || !contract) return undefined;
    const mine = getTransactionHistory(wallet.address).find(
      (r) => r.type === 'vote' && r.contract?.toLowerCase() === contract.address.toLowerCase()
    );
    if (!mine) return undefined;
    getReceipt(mine.hash)
      .then((r) => active && setReceipt(r))
      .catch((err) => active && setError(err));
    return () => {
      active = false;
    };
  }, [wallet.address, contract, lastEvents.seq, attempt]);
  return { receipt, error, retry: () => setAttempt((value) => value + 1) };
}

function Stat({ value, label }) {
  return (
    <div className="stat">
      <dd>{value === null || value === undefined ? '—' : value.toLocaleString()}</dd>
      <dt>{label}</dt>
    </div>
  );
}

export function HomePage() {
  const { stats, polls, contract, latestBlock, latestBlockTime, myVotes, pollsStatus, refreshPolls } = useBallot();
  const { receipt, error: receiptError, retry: retryReceipt } = useLatestReceipt();
  const open = polls
    .filter((p) => !isHiddenPoll(p.id, contract?.address) && isPollOpen(p, latestBlockTime))
    .slice(0, 3);

  return (
    <div className="page home">
      <section className="hero" data-tour-target="home-hero">
        <div className="hero-copy">
          <h1>Demos: the poll everyone can recount.</h1>
          <p className="hero-lede">
            Demos puts polls on the Ethereum blockchain. Connect a wallet, cast one vote and watch the count update. Every
            every vote is a public transaction that anyone can check on Etherscan.
          </p>
          <div className="hero-actions">
            <a href="#/create" className="btn btn-primary btn-lg">
              Create a poll
            </a>
            <a href="#/polls" className="btn btn-secondary btn-lg">
              See live polls
            </a>
          </div>
          <ul className="indicators">
            <li>
              <ContractIcon /> Smart contract on Sepolia
            </li>
            <li>
              <OneVoteIcon /> One vote per wallet
            </li>
            <li>
              <ExplorerIcon /> Every vote on Etherscan
            </li>
          </ul>
        </div>
        <div className="hero-slip">
          {receipt ? (
            <BallotReceipt receipt={receipt} />
          ) : receiptError ? (
            <LoadError error={receiptError} onRetry={retryReceipt} />
          ) : (
            <BlankReceipt />
          )}
          <p className="slip-caption">
            {receipt
              ? 'Your latest vote, re-read from Sepolia just now.'
              : 'After you vote, its contract record prints here: poll, choice, block and transaction.'}
          </p>
        </div>
      </section>

      <section className="stats-band" aria-labelledby="stats-title">
        <h2 id="stats-title" className="section-title">
          The count right now
        </h2>
        {contract ? (
          <>
            <dl className="stats">
              <Stat value={stats?.totalPolls} label="Polls created" />
              <Stat value={stats?.totalVotes} label="Votes cast" />
              <Stat value={stats?.openPolls} label="Open now" />
            </dl>
            <p className="fine">
              {pollsStatus === 'ready'
                ? `Read from contract ${shortAddress(contract.address)} on Sepolia${latestBlock ? `, block ${latestBlock.toLocaleString()}` : ''}. Updates with every new block.`
                : pollsStatus === 'error'
                  ? `Could not read contract ${shortAddress(contract.address)}.`
                  : 'Reading the contract…'}
              {pollsStatus === 'error' && (
                <>
                  {' '}
                  <button type="button" className="btn btn-quiet btn-sm" onClick={refreshPolls}>
                    Retry
                  </button>
                </>
              )}
            </p>
          </>
        ) : (
          <p className="fine">These numbers come from the contract. Link one on the Contract page and they appear here.</p>
        )}
      </section>

      <section className="home-open" aria-labelledby="open-title">
        <div className="section-head">
          <h2 id="open-title" className="section-title">
            Open for voting
          </h2>
          <a href="#/polls?filter=open">All open polls</a>
        </div>
        <PollsGate skeleton={<SkeletonRows count={2} />}>
          {open.length ? (
            <div className="poll-list">
              {open.map((p) => (
                <PollRow key={p.id} poll={p} myVote={myVotes[p.id]} />
              ))}
            </div>
          ) : (
            <div className="notice">
              <h3>No open polls</h3>
              <p>Nobody has a poll running on this contract right now. Start one; it takes about a minute.</p>
              <a href="#/create" className="btn btn-secondary btn-sm">
                Create a poll
              </a>
            </div>
          )}
        </PollsGate>
      </section>
    </div>
  );
}
