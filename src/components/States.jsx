import React from 'react';
import { useBallot } from '../state/BallotContext.jsx';

/** Fallback shown only if the built-in contract configuration is unavailable. */
export function NoContract({ compact = false }) {
  return (
    <div className={`notice ${compact ? 'compact' : ''}`}>
      <h3>The built-in contract is unavailable</h3>
      <p>Demos could not load its configured VotingDApp contract on Sepolia.</p>
    </div>
  );
}

export function LoadError({ error, onRetry }) {
  const unreachable = error?.code === 'NETWORK_UNREACHABLE';
  return (
    <div className="notice warn" role="alert">
      <h3>{unreachable ? 'Sepolia is unreachable' : 'Could not read the contract'}</h3>
      <p>{error?.message || 'The Sepolia RPC did not respond.'}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Renders children only when polls are loaded; otherwise the right empty/error state. */
export function PollsGate({ children, skeleton }) {
  const { pollsStatus, pollsError, refreshPolls } = useBallot();
  if (pollsStatus === 'no-contract') return <NoContract />;
  if (pollsStatus === 'error') return <LoadError error={pollsError} onRetry={refreshPolls} />;
  if (pollsStatus === 'loading') return skeleton;
  return children;
}
