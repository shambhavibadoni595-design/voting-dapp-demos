import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useBallot } from '../state/BallotContext.jsx';
import { NoContract } from '../components/States.jsx';
import { Address, TxHash } from '../components/Address.jsx';
import { createActivityFeed, isHiddenPoll } from '../services/votingService.js';
import { formatDateTime, formatRelative } from '../utils/formatters.js';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'voted', label: 'Votes' },
  { key: 'created', label: 'New polls' },
  { key: 'closed', label: 'Closed' },
];
const TYPE_LABEL = { voted: 'Vote', created: 'New poll', closed: 'Closed' };

function Detail({ ev, polls, contract }) {
  const poll = polls.find((p) => p.id === ev.pollId);
  if (ev.type === 'voted') {
    const option = poll?.options[ev.optionIndex];
    return (
      <>
        voted for <strong>{option ?? `answer ${ev.optionIndex + 1}`}</strong>
        {ev.txHash && (
          <>
            {' '}
            <a href={`#/receipt/${ev.txHash}`} className="fine-link">receipt</a>
          </>
        )}
      </>
    );
  }
  if (ev.type === 'created') {
    return isHiddenPoll(ev.pollId, contract?.address)
      ? <>created a hidden poll with {ev.optionCount} answers</>
      : <>created “{ev.question}” with {ev.optionCount} answers</>;
  }
  return <>closed the poll early</>;
}

/**
 * Event feed from contract logs. `actor` limits it to one address.
 */
export function ActivityFeed({ actor = null, pageSize = 25, showFilters = true }) {
  const { contract, polls, lastEvents } = useBallot();
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const feedRef = useRef(null);
  const [, force] = useState(0);

  const loadMore = useCallback(async () => {
    const feed = feedRef.current;
    if (!feed) return false;
    setStatus('loading');
    try {
      await feed.loadOlder(pageSize);
      setItems([...feed.items]);
      setStatus('ready');
      setError(null);
      return true;
    } catch (err) {
      setError(err);
      setStatus('error');
      return false;
    }
  }, [pageSize]);

  const retry = useCallback(async () => {
    if (!(await loadMore())) return;
    const feed = feedRef.current;
    if (!feed) return;
    try {
      const fresh = await feed.syncNewer();
      if (fresh.length) setItems([...feed.items]);
      setError(null);
      setStatus('ready');
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  }, [loadMore]);

  useEffect(() => {
    if (!contract) return;
    feedRef.current = createActivityFeed({ actor });
    setItems([]);
    loadMore();
  }, [contract, actor, loadMore]);

  // Live: pull in newer events whenever the watcher sees contract events
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed || !lastEvents.seq || status === 'loading') return;
    feed.syncNewer().then((fresh) => {
      if (fresh.length) setItems([...feed.items]);
    }).catch((err) => {
      setError(err);
      setStatus('error');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvents.seq]);

  // Re-render relative times every 30 s
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  if (!contract) return <NoContract />;
  const feed = feedRef.current;
  const shown = items.filter((e) => filter === 'all' || e.type === filter);

  return (
    <div className="activity" data-tour-target="activity-feed">
      {showFilters && (
        <div className="toolbar">
          <div className="segmented" role="tablist" aria-label="Filter activity">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={filter === f.key ? 'active' : ''} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {shown.length > 0 && (
        <ol className="activity-list">
          {shown.map((ev) => (
            <li key={ev.key} className={`activity-item type-${ev.type}`}>
              <span className="act-type">{TYPE_LABEL[ev.type]}</span>
              <span className="act-main">
                <Address value={ev.actor} copy={false} /> <Detail ev={ev} polls={polls} contract={contract} />
              </span>
              {isHiddenPoll(ev.pollId, contract?.address) ? (
                <span className="act-poll">Poll hidden</span>
              ) : (
                <a className="act-poll" href={`#/poll/${ev.pollId}`}>Poll #{ev.pollId}</a>
              )}
              <time className="act-time" dateTime={new Date(ev.timestamp * 1000).toISOString()} title={formatDateTime(ev.timestamp)}>
                {formatRelative(ev.timestamp)}
              </time>
              <span className="act-tx">
                <TxHash value={ev.txHash} copy={false} />
              </span>
            </li>
          ))}
        </ol>
      )}

      {status === 'ready' && shown.length === 0 && (
        <div className="notice">
          <h3>{actor ? 'No transactions from this address yet' : 'Nothing here yet'}</h3>
          <p>
            {actor
              ? 'Polls you create, votes you cast and polls you close on this contract will be listed here.'
              : 'When someone creates a poll, votes or closes a poll, the contract emits an event and it appears here.'}
          </p>
        </div>
      )}
      {status === 'error' && (
        <div className="notice warn" role="alert">
          <h3>{error?.code === 'NETWORK_UNREACHABLE' ? 'Sepolia is unreachable' : 'Could not load contract events'}</h3>
          <p>
            {error?.message}. Public RPCs limit how many blocks one log query may cover; Demos already splits queries into
            smaller ranges, so this usually means the RPC is down or rate-limiting. Try again, or set VITE_SEPOLIA_RPC_URL to
            another endpoint.
          </p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>Try again</button>
        </div>
      )}

      <div className="activity-foot">
        {status === 'loading' && <span className="fine" aria-busy="true">Reading contract events from Sepolia…</span>}
        {status === 'ready' && feed && !feed.reachedStart && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={loadMore}>
            Load older activity
          </button>
        )}
        {status === 'ready' && feed?.reachedStart && (
          <span className="fine">
            {feed.historyComplete
              ? `That is everything since the contract was deployed in block ${contract.deploymentBlock.toLocaleString()}.`
              : 'The deployment block of this contract is unknown, so only about the last week of blocks was scanned. Set the deployment block on the Contract page to see full history.'}
          </span>
        )}
      </div>
    </div>
  );
}

export function ActivityPage() {
  return (
    <div className="page" data-tour-target="activity-page">
      <header className="page-head">
        <h1>Activity</h1>
        <p className="page-lede">Every poll created, vote cast and poll closed, newest first.</p>
      </header>
      <ActivityFeed />
    </div>
  );
}
