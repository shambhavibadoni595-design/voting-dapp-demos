import React from 'react';
import { formatPercent, percent } from '../utils/formatters.js';

/** Read-only results: one line per option with count, share and a thin bar. */
export function ResultBars({ poll, myChoice = -1, dense = false, tourTarget }) {
  const max = Math.max(0, ...poll.votes);
  return (
    <ol className={`results ${dense ? 'dense' : ''}`} data-tour-target={tourTarget}>
      {poll.options.map((option, i) => {
        const votes = poll.votes[i] || 0;
        const leading = poll.totalVotes > 0 && votes === max;
        return (
          <li key={i} className={`result ${leading ? 'leading' : ''} ${myChoice === i ? 'mine' : ''}`}>
            <div className="result-line">
              <span className="result-label">
                {option}
                {myChoice === i && <span className="mine-tag">Your vote</span>}
              </span>
              <span className="result-figures">
                <span className="result-pct">{formatPercent(votes, poll.totalVotes)}</span>
                <span className="result-count">
                  {votes.toLocaleString()} {votes === 1 ? 'vote' : 'votes'}
                </span>
              </span>
            </div>
            <div className="bar" aria-hidden="true">
              <span style={{ width: `${percent(votes, poll.totalVotes)}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
