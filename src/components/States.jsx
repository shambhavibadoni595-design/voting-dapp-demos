import React from 'react';
import { useBallot } from '../state/BallotContext.jsx';

/** Shown wherever polls would appear but no contract is linked yet. */
export function NoContract({ compact = false }) {
  return (
    <div className={`notice ${compact ? 'compact' : ''}`}>
      <h3>No contract linked yet</h3>
      <p>
        Demos is not connected to a VotingDApp contract on Sepolia, so there are no polls to show. Deploy the
        contract once, or link one that already exists, on the Contract page.
      </p>
      <a className="btn btn-secondary btn-sm" href="#/contract">
        Set up the contract
      </a>
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
