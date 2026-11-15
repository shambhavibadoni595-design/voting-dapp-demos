import React from 'react';
import { FAUCET } from '../services/votingService.js';

const FAQ = [
  {
    q: 'What is Demos?',
    a: (
      <p>
        A polling site whose results live in a smart contract on the Ethereum Sepolia test network. The website only displays
        and submits; the contract stores polls, counts votes and enforces the rules, so anyone can recount from the chain.
      </p>
    ),
  },
  {
    q: 'Do I need real money to vote?',
    a: (
      <p>
        No. Voting and creating polls cost a small gas fee paid in Sepolia ETH, which is free test currency with no monetary
        value. Request some from the <a href={FAUCET.url} target="_blank" rel="noreferrer">{FAUCET.name}</a>. Never send real ETH
        to a testnet app.
      </p>
    ),
  },
  {
    q: 'Which wallets can I use?',
    a: (
      <p>
        MetaMask, and any Ethereum browser wallet that supports EIP-6963 (such as Rabby, Coinbase Wallet’s extension or Brave
        Wallet). Wallets that only inject <code>window.ethereum</code> also work. Reading polls needs no wallet at all.
      </p>
    ),
  },
  {
    q: 'Why does my wallet ask to switch networks?',
    a: (
      <p>
        The contract exists only on Sepolia (chain ID 11155111). A transaction sent on any other network would not reach it, so
        Demos asks your wallet to switch, and to add Sepolia first if the wallet does not have it.
      </p>
    ),
  },
  {
    q: 'Are votes anonymous?',
    a: (
      <p>
        No. Every vote is a public transaction. Anyone can see which address voted and which option it chose, on Etherscan or in
        Demos’ activity feed. Your name is not recorded, but if your address can be linked to you, so can your vote. Use a
        fresh address if that matters to you.
      </p>
    ),
  },
  {
    q: 'Can I change my vote?',
    a: <p>No. The contract has no function for changing or withdrawing a vote. Once your vote is mined, it is final.</p>,
  },
  {
    q: 'Can one person vote twice?',
    a: (
      <p>
        One address can vote once per poll; the contract rejects a second vote from it. But the contract cannot tell whether
        two addresses belong to the same person, so someone with several funded wallets could vote several times. Treat results
        as one vote per wallet, not one vote per human.
      </p>
    ),
  },
  {
    q: 'What happens when a poll ends?',
    a: (
      <p>
        From the deadline’s block onward, or from the moment its creator closes it, the contract rejects new votes. The results
        stay readable in the contract and on Etherscan for as long as the Sepolia network runs.
      </p>
    ),
  },
  {
    q: 'Where are the polls stored?',
    a: (
      <p>
        In the VotingDApp contract’s storage on Sepolia. There is no database behind this site. Your browser reads the contract
        through a public RPC endpoint, and keeps only a small list of your own recent transaction hashes for convenience.
      </p>
    ),
  },
  {
    q: 'Who can create a poll?',
    a: (
      <p>
        Anyone with a connected wallet and enough Sepolia ETH for the gas. The creator can close their own poll early, but
        cannot edit its question or answers, delete it, or change any votes.
      </p>
    ),
  },
];

export function FaqPage() {
  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Questions</h1>
        <p className="page-lede">Short answers about how Demos works, and what it cannot do.</p>
      </header>
      <div className="faq">
        {FAQ.map((item, i) => (
          <details key={i} className="faq-item" open={i === 0}>
            <summary>{item.q}</summary>
            <div className="faq-a">{item.a}</div>
          </details>
        ))}
      </div>
    </div>
  );
}
