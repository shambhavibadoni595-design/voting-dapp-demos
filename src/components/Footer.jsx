import React from 'react';
import { useBallot } from '../state/BallotContext.jsx';
import { etherscan } from '../services/votingService.js';
import { shortAddress } from '../utils/formatters.js';

export function Footer() {
  const { contract, latestBlock } = useBallot();
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <p className="footer-brand">Demos</p>
        <dl className="footer-facts">
          <div>
            <dt>Network</dt>
            <dd>Ethereum Sepolia, chain 11155111</dd>
          </div>
          <div>
            <dt>Contract</dt>
            <dd>
              {contract ? (
                <a href={etherscan.address(contract.address)} target="_blank" rel="noreferrer" title={contract.address}>
                  {shortAddress(contract.address)}
                </a>
              ) : (
                <a href="#/contract">Not linked</a>
              )}
            </dd>
          </div>
          <div>
            <dt>Latest block</dt>
            <dd>{latestBlock ? latestBlock.toLocaleString() : '…'}</dd>
          </div>
        </dl>
        <p className="footer-note">
          A testnet app. Votes are public and use free test ETH with no monetary value.{' '}
          <a href="#/faq">Questions</a>
        </p>
      </div>
    </footer>
  );
}
