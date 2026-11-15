import React, { useState } from 'react';
import { CodeBlock } from '../components/CodeBlock.jsx';
import { ExternalLink } from '../components/Address.jsx';
import { useBallot } from '../state/BallotContext.jsx';
import { etherscan, SEPOLIA } from '../services/votingService.js';
import { SOLIDITY_DOCS_URL, READ_RPC_URLS, POLL_INTERVAL_MS } from '../config/contractConfig.js';

// The vote function exactly as it appears in blockchain/contracts/VotingDApp.sol
const VOTE_SOURCE = `function vote(uint256 pollId, uint256 optionIndex) external pollExists(pollId) {
    Poll storage p = _polls[pollId];
    require(_isOpen(p), "Poll is closed");
    require(_choicePlusOne[pollId][msg.sender] == 0, "You have already voted");
    require(optionIndex < p.options.length, "Invalid option");

    _choicePlusOne[pollId][msg.sender] = optionIndex + 1;
    p.votes[optionIndex] += 1;
    p.totalVotes += 1;
    totalVotesCast += 1;

    emit Voted(pollId, msg.sender, optionIndex, block.timestamp);
}

function _isOpen(Poll storage p) private view returns (bool) {
    return p.closedAt == 0 && block.timestamp < p.endTime;
}`;

function SmartContract() {
  const { contract } = useBallot();
  return (
    <>
      <p>
        <code>VotingDApp.sol</code> is the backend of Demos. There is no centralized server or database controlling the voting
        results. The contract stores every poll, vote count and voter record. Its rules enforce the voting process on-chain.
      </p>
      <h3>The rules it enforces</h3>
      <ul className="rules">
        <li>2 to 10 options per poll, none of them empty.</li>
        <li>Poll duration between 1 minute and 30 days, counted from the block the poll is created in.</li>
        <li>One vote per address per poll. A vote cannot be changed or withdrawn.</li>
        <li>The creator can close a poll early. Nobody else can, and nothing can reopen it.</li>
        <li>Results are read from the blockchain. There is no owner or admin who can edit them.</li>
      </ul>
      <CodeBlock code={VOTE_SOURCE} caption="vote() from VotingDApp.sol. Each require() line is a rule; if one fails, the whole transaction is reverted." />
      <p>
        The contract stores each voter’s choice as option + 1, so zero means “has not voted” and a single storage write
        records both the vote and the choice. That saves about 20,000 gas per vote over a separate mapping.
      </p>
      <div className="link-row">
        <ExternalLink href={SOLIDITY_DOCS_URL}>Solidity 0.8.28 documentation</ExternalLink>
        {contract && <ExternalLink href={etherscan.code(contract.address)}>This contract on Etherscan</ExternalLink>}
      </div>
    </>
  );
}

function NetworkTech() {
  return (
    <>
      <p>
        Sepolia is Ethereum’s main public test network. It runs the same software and rules as Ethereum mainnet, with a new
        block about every 12 seconds, but its ETH is free test currency with no monetary value.
      </p>
      <dl className="facts">
        <div><dt>Chain ID</dt><dd>{SEPOLIA.chainId} (hex {SEPOLIA.chainIdHex})</dd></div>
        <div><dt>Currency</dt><dd>Sepolia ETH, from faucets</dd></div>
        <div><dt>Why a testnet</dt><dd>Anyone can try Demos without spending real money, while still using a real, public blockchain.</dd></div>
      </dl>
    </>
  );
}

function EthersTech() {
  return (
    <>
      <p>
        ethers.js v6 is the library between this page and the chain. Demos uses it two ways, so you can browse without a wallet
        and still sign with one.
      </p>
      <ul className="rules">
        <li>
          Reading: a <code>JsonRpcProvider</code> talks to a public Sepolia RPC ({READ_RPC_URLS.length} configured, tried in
          order). Polls, counts and events load before you connect anything.
        </li>
        <li>
          Writing: a <code>BrowserProvider</code> wraps your wallet and returns a signer. Every transaction is signed inside your
          wallet; the page never sees a key.
        </li>
        <li>
          Live updates: every {Math.round(POLL_INTERVAL_MS / 1000)} seconds Demos asks for new <code>PollCreated</code>,{' '}
          <code>Voted</code> and <code>PollClosed</code> logs with <code>eth_getLogs</code>. Many public RPCs drop server-side
          filters, so polling for logs is the dependable choice.
        </li>
        <li>
          History: activity pages backwards through logs from the deployment block, shrinking the block range automatically
          when an RPC refuses a large query.
        </li>
      </ul>
    </>
  );
}

function WalletTech() {
  const { wallets } = useBallot();
  return (
    <>
      <p>
        EIP-6963 lets every installed wallet announce itself to the page, so you can choose between MetaMask, Rabby, Coinbase
        Wallet and others instead of whichever one grabbed <code>window.ethereum</code> first. Older wallets that only inject{' '}
        <code>window.ethereum</code> still work as a fallback.
      </p>
      <h3>Wallets found in this browser</h3>
      {wallets.length ? (
        <ul className="wallet-found">
          {wallets.map((w) => (
            <li key={w.info.uuid}>
              {w.info.icon && <img src={w.info.icon} alt="" width="20" height="20" />}
              {w.info.name} <span className="muted">{w.legacy ? 'legacy injected provider' : w.info.rdns}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">None found. Install a wallet extension to vote.</p>
      )}
    </>
  );
}

function ExplorerTech() {
  return (
    <>
      <p>
        Etherscan is an independent explorer. Anything Demos shows, you can check there without trusting this site.
      </p>
      <ul className="rules">
        <li>A vote’s transaction page shows its block, sender address, the contract it called and the Voted event.</li>
        <li>Once the source is verified, the contract’s Read Contract tab lets you call <code>getPoll</code> and <code>getVoterChoice</code> yourself.</li>
        <li>The Events tab lists every PollCreated, Voted and PollClosed log, the same data as Demos’ activity feed.</li>
      </ul>
      <ExternalLink href={etherscan.home()}>Open Sepolia Etherscan</ExternalLink>
    </>
  );
}

function DeployTech() {
  return (
    <>
      <p>Developer deployment notes (visitors use the built-in Demos contract): deploying a new contract needs a wallet with Sepolia test ETH and explicit approval.</p>
      <ul className="rules">
        <li>
          Hardhat: <code>npm run deploy:sepolia</code> in the <code>blockchain</code> folder. It runs only after the 33 contract
          tests pass, checks the deployer balance, deploys, and writes the real address into the site’s config.
        </li>
        <li>
          Remix IDE: paste <code>VotingDApp.sol</code> into remix.ethereum.org, compile with 0.8.28 (optimizer 200 runs, EVM
          cancun), choose Injected Provider with MetaMask on Sepolia, and deploy.
        </li>
      </ul>
    </>
  );
}

const TECH = [
  { key: 'contract', name: 'Smart contract', value: 'Solidity 0.8.x', Panel: SmartContract },
  { key: 'network', name: 'Network', value: 'Ethereum Sepolia Testnet', Panel: NetworkTech },
  { key: 'ethers', name: 'Blockchain interaction', value: 'ethers.js v6', Panel: EthersTech },
  { key: 'wallet', name: 'Wallet connection', value: 'EIP-6963', Panel: WalletTech },
  { key: 'explorer', name: 'Explorer', value: 'Etherscan', Panel: ExplorerTech },
  { key: 'deploy', name: 'Deployment', value: 'Remix IDE / Hardhat', Panel: DeployTech },
];

export function UnderTheHoodPage() {
  const [active, setActive] = useState('contract');
  const current = TECH.find((t) => t.key === active);
  return (
    <div className="page">
      <header className="page-head">
        <h1>Under the hood</h1>
        <p className="page-lede">What runs Demos, and how each piece can be checked independently. Pick a part to read about it.</p>
      </header>
      <div className="tech">
        <div className="tech-list" role="tablist" aria-label="Technology">
          {TECH.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={active === t.key}
              aria-controls={`panel-${t.key}`}
              className={`tech-item ${active === t.key ? 'active' : ''}`}
              onClick={() => setActive(t.key)}
            >
              <span className="tech-name">{t.name}</span>
              <span className="tech-value">{t.value}</span>
            </button>
          ))}
        </div>
        <section className="tech-panel" role="tabpanel" id={`panel-${current.key}`} aria-labelledby={`tab-${current.key}`}>
          <h2>{current.value}</h2>
          <current.Panel />
        </section>
      </div>
    </div>
  );
}
