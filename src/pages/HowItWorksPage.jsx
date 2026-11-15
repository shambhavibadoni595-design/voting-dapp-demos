import React from 'react';
import { FAUCET } from '../services/votingService.js';

export function HowItWorksPage() {
  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Three steps, about a minute</h1>
        <p className="page-lede">No account, no password. Your wallet does the signing and the contract does the counting.</p>
      </header>

      <ol className="steps big">
        <li>
          <h2>Connect your wallet</h2>
          <p>Click Connect wallet and pick MetaMask or any browser wallet. Your address becomes your voter ID.</p>
          <ul className="what-you-see">
            <li>Your wallet opens and asks whether to share your address with this site. Demos sees only the public address.</li>
            <li>
              If the wallet is on another network, it asks to switch to Ethereum Sepolia (chain 11155111). If Sepolia is not in
              the wallet yet, it asks to add it first.
            </li>
          </ul>
        </li>
        <li>
          <h2>Cast your vote</h2>
          <p>Choose an option and press Vote. The contract accepts one vote per address per poll.</p>
          <ul className="what-you-see">
            <li>
              Before your wallet opens, Demos simulates the vote and checks your balance. If you already voted, or the poll
              has closed, you find out here without paying anything.
            </li>
            <li>
              Your wallet shows the transaction and a small gas fee, paid in free Sepolia test ETH. Out of test ETH? Get some
              from the <a href={FAUCET.url} target="_blank" rel="noreferrer">{FAUCET.name}</a>.
            </li>
          </ul>
        </li>
        <li>
          <h2>Check the record</h2>
          <p>Once the vote is mined, the count updates and your receipt links to the transaction.</p>
          <ul className="what-you-see">
            <li>The receipt shows the block number your vote was mined in, your voter address and the transaction hash.</li>
            <li>
              On Etherscan, the transaction page shows the same block, your address as the sender, the contract as the
              recipient, and a Voted event with the poll ID and the option you picked.
            </li>
          </ul>
        </li>
      </ol>

      <div className="hero-actions">
        <a href="#/polls?filter=open" className="btn btn-primary">See open polls</a>
        <a href="#/faq" className="btn btn-quiet">Read the FAQ</a>
      </div>
    </div>
  );
}
