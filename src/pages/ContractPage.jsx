import React, { useEffect, useState } from 'react';
import { useBallot } from '../state/BallotContext.jsx';
import { Address, ExternalLink } from '../components/Address.jsx';
import { getNetworkInfo, etherscan, SEPOLIA } from '../services/votingService.js';
import { formatDateTime } from '../utils/formatters.js';

function NetworkInfo() {
  const { latestBlock } = useBallot();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(null);
    getNetworkInfo().then((i) => active && setInfo(i)).catch((e) => active && setError(e));
    return () => { active = false; };
  }, [latestBlock, attempt]);

  return (
    <section className="network-info" aria-labelledby="net-title">
      <h2 id="net-title" className="section-title">Network information</h2>
      {error && <p className="field-error" role="alert">Could not read network information: {error.message}{' '}
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
      </p>}
      <dl className="facts boxed">
        <div><dt>Network</dt><dd>{SEPOLIA.name}</dd></div>
        <div><dt>Chain ID</dt><dd>{info?.chainId ?? SEPOLIA.chainId}{info?.chainId === SEPOLIA.chainId && <span className="muted"> confirmed by the RPC</span>}</dd></div>
        <div><dt>Latest block</dt><dd>{info?.latestBlock ? <><a href={etherscan.block(info.latestBlock)} target="_blank" rel="noreferrer">{info.latestBlock.toLocaleString()}</a><span className="muted"> at {formatDateTime(info.latestBlockTime)}</span></> : '…'}</dd></div>
        <div><dt>Explorer</dt><dd><ExternalLink href={etherscan.home()}>Sepolia Etherscan</ExternalLink></dd></div>
      </dl>
    </section>
  );
}

export function ContractPage() {
  const { contract, stats } = useBallot();
  return (
    <div className="page">
      <header className="page-head">
        <h1>The contract behind the polls</h1>
        <p className="page-lede">Demos reads every poll and vote from one built-in VotingDApp contract on Sepolia.</p>
      </header>
      <div className="two-col" data-tour-target="contract-setup">
        <section aria-labelledby="current-title">
          <h2 id="current-title" className="section-title">Built-in contract</h2>
          <dl className="facts boxed">
            <div><dt>Address</dt><dd><Address value={contract?.address} full /></dd></div>
            <div><dt>Network</dt><dd>{SEPOLIA.name} (chain ID {SEPOLIA.chainId})</dd></div>
            <div><dt>Deployment block</dt><dd>{contract?.deploymentBlock ? <a href={etherscan.block(contract.deploymentBlock)} target="_blank" rel="noreferrer">{contract.deploymentBlock.toLocaleString()}</a> : 'Unknown'}</dd></div>
            <div><dt>Polls</dt><dd>{stats?.totalPolls?.toLocaleString() ?? '…'}</dd></div>
            <div><dt>Votes</dt><dd>{stats?.totalVotes?.toLocaleString() ?? '…'}</dd></div>
            <div><dt>Etherscan</dt><dd>{contract && <ExternalLink href={etherscan.code(contract.address)}>Contract on Sepolia Etherscan</ExternalLink>}</dd></div>
          </dl>
        </section>
        <section aria-labelledby="info-title">
          <h2 id="info-title" className="section-title">About this contract</h2>
          <p>
            This is a smart contract on the Ethereum Sepolia test network. It stores every poll and every vote. There is no
            server or database: the contract is the only source of truth. Demos reads it, and sends your vote through your
            wallet.
          </p>
          <p>
            Anyone can create a poll with 2 to 10 options. A poll can last from 1 minute to 30 days. The question can be up to
            280 bytes, the description up to 1,000 bytes, and each option up to 100 bytes.
          </p>
          <p>
            Each wallet address can vote once in a poll. A vote cannot be changed or withdrawn. Voting ends automatically at
            the deadline, and only the poll creator can close it early.
          </p>
          <p>
            Poll creation, votes, and early closing are public transactions recorded as events that anyone can check on
            Etherscan. Votes reveal the wallet address and the selected choice.
          </p>
          <p>
            The contract has no owner or admin, cannot be upgraded, and makes no external calls. After deployment, nobody can
            edit results or change its rules. It allows one vote per wallet, not per person, so someone with several wallets
            could vote several times. Votes are public, not anonymous. Sepolia test ETH has no real value.
          </p>
          <dl className="facts">
            <div><dt>Address</dt><dd><Address value={contract?.address} full /></dd></div>
            <div><dt>Network</dt><dd>{SEPOLIA.name} (chain ID {SEPOLIA.chainId})</dd></div>
            <div><dt>Deployment block</dt><dd>{contract?.deploymentBlock ? <a href={etherscan.block(contract.deploymentBlock)} target="_blank" rel="noreferrer">{contract.deploymentBlock.toLocaleString()}</a> : 'Unknown'}</dd></div>
            <div><dt>Polls</dt><dd>{stats?.totalPolls?.toLocaleString() ?? '…'}</dd></div>
            <div><dt>Votes</dt><dd>{stats?.totalVotes?.toLocaleString() ?? '…'}</dd></div>
            <div><dt>Etherscan</dt><dd>{contract && <ExternalLink href={etherscan.code(contract.address)}>Contract on Sepolia Etherscan</ExternalLink>}</dd></div>
          </dl>
        </section>
      </div>
      <NetworkInfo />
    </div>
  );
}
