import React, { useState } from 'react';
import { copyText, shortAddress, shortHash } from '../utils/formatters.js';
import { etherscan } from '../services/votingService.js';
import { CheckIcon, CopyIcon, ExternalIcon } from './Icons.jsx';

export function CopyButton({ value, label = 'Copy', className = '', showLabel = false }) {
  const [done, setDone] = useState(false);
  const onClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (await copyText(value)) {
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    }
  };
  return (
    <button
      type="button"
      className={`copy-btn ${showLabel ? 'with-label' : ''} ${className}`}
      onClick={onClick}
      aria-label={done ? 'Copied' : label}
      title={done ? 'Copied' : label}
    >
      {done ? <CheckIcon /> : <CopyIcon />}
      {showLabel && <span>{done ? 'Copied' : label}</span>}
      <span className="sr-only" aria-live="polite">{done ? 'Copied' : ''}</span>
    </button>
  );
}

/** Shortened address with the full value in the link, title and copy button. */
export function Address({ value, link = true, copy = true, full = false }) {
  if (!value) return <span className="muted">—</span>;
  const text = full ? value : shortAddress(value);
  return (
    <span className="mono-inline">
      {link ? (
        <a href={etherscan.address(value)} target="_blank" rel="noreferrer" title={value}>
          {text}
        </a>
      ) : (
        <span title={value}>{text}</span>
      )}
      {copy && <CopyButton value={value} label="Copy address" />}
    </span>
  );
}

export function TxHash({ value, copy = true }) {
  if (!value) return <span className="muted">—</span>;
  return (
    <span className="mono-inline">
      <a href={etherscan.tx(value)} target="_blank" rel="noreferrer" title={value}>
        {shortHash(value)}
      </a>
      {copy && <CopyButton value={value} label="Copy transaction hash" />}
    </span>
  );
}

export function BlockLink({ value }) {
  if (value === null || value === undefined) return <span className="muted">—</span>;
  return (
    <a className="mono-inline" href={etherscan.block(value)} target="_blank" rel="noreferrer">
      {Number(value).toLocaleString()}
    </a>
  );
}

export function ExternalLink({ href, children, className = '' }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`ext-link ${className}`}>
      {children}
      <ExternalIcon />
    </a>
  );
}
