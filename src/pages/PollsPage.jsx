import React, { useState } from 'react';
import { useBallot } from '../state/BallotContext.jsx';
import { PollRow } from '../components/PollRow.jsx';
import { PollsGate } from '../components/States.jsx';
import { SkeletonRows } from '../components/Skeleton.jsx';
import { RefreshIcon } from '../components/Icons.jsx';
import { isHiddenPoll, isPollOpen } from '../services/votingService.js';
import { navigate } from '../lib/router.js';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
];

export function PollsPage({ route }) {
  const { contract, polls, myVotes, refreshPolls, latestBlock, latestBlockTime, pollsStatus } = useBallot();
  const filter = FILTERS.some((f) => f.key === route.query.filter) ? route.query.filter : 'all';
  const [refreshing, setRefreshing] = useState(false);
  const visiblePolls = polls.filter((poll) => !isHiddenPoll(poll.id, contract?.address));

  const counts = {
    all: visiblePolls.length,
    open: visiblePolls.filter((p) => isPollOpen(p, latestBlockTime)).length,
  };
  counts.closed = counts.all - counts.open;
  const shown = visiblePolls.filter((p) =>
    filter === 'all' ? true : filter === 'open' ? isPollOpen(p, latestBlockTime) : !isPollOpen(p, latestBlockTime)
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshPolls();
    setRefreshing(false);
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Live polls</h1>
        <p className="page-lede">Every poll on the contract, newest first. Counts come straight from Sepolia and update with each block.</p>
      </header>

      <div className="toolbar" data-tour-target="poll-filters">
        <div className="segmented" role="tablist" aria-label="Filter polls">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              className={filter === f.key ? 'active' : ''}
              onClick={() => navigate(f.key === 'all' ? '/polls' : `/polls?filter=${f.key}`)}
            >
              {f.label} <span className="count">{pollsStatus === 'ready' ? counts[f.key] : ''}</span>
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          {latestBlock && <span className="fine">Block {latestBlock.toLocaleString()}</span>}
          <button type="button" className="btn btn-quiet btn-sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshIcon className={refreshing ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <PollsGate skeleton={<SkeletonRows count={3} />}>
        {shown.length ? (
          <div className="poll-list" data-tour-target="poll-list">
            {shown.map((p) => (
              <PollRow key={p.id} poll={p} myVote={myVotes[p.id]} />
            ))}
          </div>
        ) : (
          <div className="notice" data-tour-target="poll-list">
            <h3>{filter === 'closed' ? 'No closed polls yet' : filter === 'open' ? 'No open polls' : 'No polls yet'}</h3>
            <p>
              {filter === 'closed'
                ? 'Polls show up here once their deadline passes or their creator closes them.'
                : 'This contract has no polls taking votes. Anyone with a wallet and a little test ETH can start one.'}
            </p>
            {filter !== 'closed' && (
              <a href="#/create" className="btn btn-secondary btn-sm">
                Create a poll
              </a>
            )}
          </div>
        )}
      </PollsGate>
    </div>
  );
}
