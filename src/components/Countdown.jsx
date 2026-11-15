import React, { useEffect, useState } from 'react';
import { formatDateTime, formatDuration, formatRelative } from '../utils/formatters.js';
import { useBallot } from '../state/BallotContext.jsx';

function useNow(intervalMs) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Live open/closed state for a poll, by the contract's rule (closed early, or now >= endTime). */
export function usePollOpen(poll) {
  const { latestBlockTime } = useBallot();
  if (!poll) return { open: false, now: latestBlockTime };
  const open =
    poll.isOpenOnChain !== false &&
    !poll.closedEarly &&
    (latestBlockTime === null ? true : latestBlockTime < poll.endTime);
  return { open, now: latestBlockTime };
}

export function Countdown({ poll, compact = false }) {
  const wallNow = useNow(1000);
  const { now: latestBlockTime } = usePollOpen(poll);
  if (!poll) return null;
  const now = latestBlockTime ?? poll.createdAt;
  if (poll.closedEarly) {
    return (
      <span className="countdown" title={formatDateTime(poll.closedAt)}>
        Closed early by its creator {formatRelative(poll.closedAt, wallNow)}
      </span>
    );
  }
  const left = poll.endTime - now;
  if (left > 0 && poll.isOpenOnChain === false) {
    return (
      <span className="countdown" title={formatDateTime(poll.endTime)}>
        Ended, according to the latest block
      </span>
    );
  }
  if (left <= 0) {
    return (
      <span className="countdown" title={formatDateTime(poll.endTime)}>
        Ended {formatRelative(poll.endTime, wallNow)}
      </span>
    );
  }
  return (
    <span className={`countdown ${left < 3600 ? 'soon' : ''}`} title={`Closes ${formatDateTime(poll.endTime)}`}>
      {compact ? `${formatDuration(left)} left` : `Closes in ${formatDuration(left)}`}
    </span>
  );
}

export function StatusTag({ poll }) {
  const { open } = usePollOpen(poll);
  return <span className={`status-tag ${open ? 'is-open' : 'is-closed'}`}>{open ? 'Open' : 'Closed'}</span>;
}
