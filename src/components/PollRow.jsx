import React from 'react';
import { Countdown, StatusTag } from './Countdown.jsx';
import { ResultBars } from './ResultBars.jsx';

/** One poll in a list: header line, question, every option with count and share. */
export function PollRow({ poll, myVote }) {
  const voted = myVote?.voted;
  return (
    <article className="poll-row">
      <header className="poll-row-meta">
        <span className="poll-id">Poll #{poll.id}</span>
        <StatusTag poll={poll} />
        <Countdown poll={poll} compact />
        {voted && <span className="voted-tag">You voted</span>}
      </header>
      <h3 className="poll-row-q">
        <a href={`#/poll/${poll.id}`}>{poll.question}</a>
      </h3>
      <ResultBars poll={poll} myChoice={voted ? myVote.optionIndex : -1} dense />
      <footer className="poll-row-foot">
        <span>
          {poll.totalVotes.toLocaleString()} {poll.totalVotes === 1 ? 'vote' : 'votes'} in total
        </span>
        <a href={`#/poll/${poll.id}`} className="poll-row-open">
          {voted ? 'View your vote' : 'View poll'}
        </a>
      </footer>
    </article>
  );
}
