import React from 'react';
import { CopyButton } from './Address.jsx';
import { BallotMark, ExternalIcon } from './Icons.jsx';
import { formatSlipTime, formatUtc, shortAddress, shortHash } from '../utils/formatters.js';
import { etherscan, isHiddenPoll } from '../services/votingService.js';

/** Bars derived from the transaction hash: each hex digit sets one bar's width. */
export function HashBarcode({ hash }) {
  const hex = (hash || '').replace(/^0x/, '');
  if (!hex) return null;
  let x = 0;
  const bars = [];
  for (let i = 0; i < hex.length; i++) {
    const n = Number.parseInt(hex[i], 16);
    const w = 1 + (n % 4); // 1–4 units
    if (i % 2 === 0) bars.push(<rect key={i} x={x} y="0" width={w} height="34" />);
    x += w + (n >> 2 === 0 ? 1 : 0.6);
  }
  return (
    <svg className="barcode" viewBox={`0 0 ${x} 34`} preserveAspectRatio="none" role="img" aria-label={`Barcode of transaction ${hash}`}>
      {bars}
    </svg>
  );
}

function Row({ label, children, wide = false }) {
  return (
    <div className={`slip-row ${wide ? 'wide' : ''}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * The vote receipt. Pass a receipt object from votingService.getReceipt() —
 * every value comes from the mined transaction and the contract.
 */
export function BallotReceipt({ receipt, printing = false }) {
  const receiptLink = `${window.location.origin}${window.location.pathname}#/receipt/${receipt.txHash}`;
  const question = isHiddenPoll(receipt.pollId, receipt.contract) ? 'Hidden poll' : receipt.question;
  return (
    <figure className={`slip-wrap ${printing ? 'printing' : ''}`} aria-label="Vote receipt">
      <div className="slip">
        <header className="slip-head">
          <span className="slip-brand">
            <BallotMark width={20} height={20} /> Demos
          </span>
          <span className="slip-kind">Voter receipt</span>
        </header>

        <dl className="slip-rows">
          <Row label="Network">Sepolia, chain {receipt.chainId}</Row>
          <Row label="Poll">#{receipt.pollId}</Row>
          <Row label="Question" wide>
            {question}
          </Row>
        </dl>

        <div className="slip-choice">
          <span className="slip-choice-label">Marked</span>
          <span className="slip-choice-box" aria-hidden="true">✕</span>
          <span className="slip-choice-text">{receipt.choice}</span>
        </div>

        <dl className="slip-rows">
          <Row label="Voter">
            <a href={etherscan.address(receipt.voter)} target="_blank" rel="noreferrer" title={receipt.voter}>
              {shortAddress(receipt.voter)}
            </a>
          </Row>
          <Row label="Block">
            <a href={etherscan.block(receipt.blockNumber)} target="_blank" rel="noreferrer">
              {receipt.blockNumber.toLocaleString()}
            </a>
          </Row>
          <Row label="Time">
            <span title={formatUtc(receipt.timestamp)}>{formatSlipTime(receipt.timestamp)}</span>
          </Row>
          <Row label="Transaction">
            <a href={receipt.etherscanUrl} target="_blank" rel="noreferrer" title={receipt.txHash}>
              {shortHash(receipt.txHash)}
            </a>
          </Row>
        </dl>

        <div className="slip-stamp" role="status">
          <span>Recorded on-chain</span>
        </div>

        <HashBarcode hash={receipt.txHash} />
        <p className="slip-hash">{receipt.txHash}</p>
      </div>

      <figcaption className="slip-actions">
        <a className="btn btn-quiet" href={receipt.etherscanUrl} target="_blank" rel="noreferrer">
          View on Etherscan <ExternalIcon />
        </a>
        <CopyButton value={receipt.txHash} label="Copy hash" showLabel className="btn btn-quiet" />
        <CopyButton value={receiptLink} label="Copy receipt link" showLabel className="btn btn-quiet" />
      </figcaption>
    </figure>
  );
}

/** The empty slip shown before a vote exists. Contains no data, only the layout. */
export function BlankReceipt({ note = 'Your receipt prints here once your vote is mined.' }) {
  return (
    <figure className="slip-wrap blank" aria-label="Empty vote receipt">
      <div className="slip">
        <header className="slip-head">
          <span className="slip-brand">
            <BallotMark width={20} height={20} /> Demos
          </span>
          <span className="slip-kind">Voter receipt</span>
        </header>
        <dl className="slip-rows">
          {['Network', 'Poll', 'Question'].map((l) => (
            <div className="slip-row" key={l}>
              <dt>{l}</dt>
              <dd>
                <span className="slip-blank" />
              </dd>
            </div>
          ))}
        </dl>
        <div className="slip-choice">
          <span className="slip-choice-label">Marked</span>
          <span className="slip-choice-box" aria-hidden="true" />
          <span className="slip-choice-text">
            <span className="slip-blank" />
          </span>
        </div>
        <dl className="slip-rows">
          {['Voter', 'Block', 'Time', 'Transaction'].map((l) => (
            <div className="slip-row" key={l}>
              <dt>{l}</dt>
              <dd>
                <span className="slip-blank" />
              </dd>
            </div>
          ))}
        </dl>
        <p className="slip-note">{note}</p>
      </div>
    </figure>
  );
}
