import React, { useEffect, useState } from 'react';
import { useBallot, useTransaction } from '../state/BallotContext.jsx';
import { Address, CopyButton, ExternalLink, TxHash } from '../components/Address.jsx';
import { TxProgress } from '../components/TxProgress.jsx';
import { GasAssistPanel } from '../components/GasAssistPanel.jsx';
import {
  buildShareLink,
  deployNewContract,
  getNetworkInfo,
  getSiteDefaultContract,
  linkContract,
  revertToSiteDefault,
  etherscan,
  SEPOLIA,
  FAUCET,
} from '../services/votingService.js';
import { formatDateTime } from '../utils/formatters.js';

const SOURCE_LABEL = {
  'site-config': 'Site default (from the deployment config)',
  linked: 'Linked in this browser',
  'shared-link': 'Opened from a shared link',
};

function NetworkInfo() {
  const { contract, latestBlock } = useBallot();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(null);
    getNetworkInfo()
      .then((i) => active && (setInfo(i), setError(null)))
      .catch((e) => active && setError(e));
    return () => {
      active = false;
    };
  }, [latestBlock, attempt]);

  return (
    <section className="network-info" aria-labelledby="net-title">
      <h2 id="net-title" className="section-title">Network information</h2>
      {error && (
        <p className="field-error" role="alert">
          {error.code === 'NETWORK_UNREACHABLE' ? 'Sepolia is unreachable: ' : 'Could not read network information: '}
          {error.message}{' '}
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </button>
        </p>
      )}
      <dl className="facts boxed">
        <div><dt>Network</dt><dd>Sepolia testnet</dd></div>
        <div>
          <dt>Chain ID</dt>
          <dd>
            {info ? info.chainId : SEPOLIA.chainId}
            {info && info.chainId === SEPOLIA.chainId && <span className="muted"> confirmed by the RPC</span>}
          </dd>
        </div>
        <div><dt>Contract</dt><dd>{contract ? <Address value={contract.address} full /> : 'Not linked'}</dd></div>
        <div>
          <dt>Latest block</dt>
          <dd>
            {info?.latestBlock ? (
              <>
                <a href={etherscan.block(info.latestBlock)} target="_blank" rel="noreferrer">{info.latestBlock.toLocaleString()}</a>
                <span className="muted"> at {formatDateTime(info.latestBlockTime)}</span>
              </>
            ) : (
              '…'
            )}
          </dd>
        </div>
        <div><dt>Read through</dt><dd className="break">{info?.rpcUrl || '…'}</dd></div>
        <div><dt>Explorer</dt><dd><ExternalLink href={etherscan.home()}>Sepolia Etherscan</ExternalLink></dd></div>
      </dl>
    </section>
  );
}

function LinkForm() {
  const { toast } = useBallot();
  const [address, setAddress] = useState('');
  const [block, setBlock] = useState('');
  const [state, setState] = useState({ status: 'idle' });

  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'checking' });
    try {
      const linked = await linkContract(address, block);
      setState({ status: 'idle' });
      setAddress('');
      setBlock('');
      toast(`Linked ${linked.address}. It has ${linked.pollCount} polls.`, 'success');
    } catch (err) {
      setState({ status: 'error', error: err });
    }
  };

  return (
    <form className="link-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="link-addr">Contract address</label>
        <input id="link-addr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" spellCheck="false" autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="link-block">
          Deployment block <span className="optional">optional</span>
        </label>
        <input id="link-block" value={block} onChange={(e) => setBlock(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="Found automatically if left blank" />
      </div>
      <button type="submit" className="btn btn-secondary" disabled={!address || state.status === 'checking'}>
        {state.status === 'checking' ? 'Checking Sepolia…' : state.error?.code === 'NETWORK_UNREACHABLE' ? 'Try again' : 'Link contract'}
      </button>
      {state.status === 'error' && <p className="field-error" role="alert">{state.error.message}</p>}
      <p className="fine">Demos checks that the address holds a VotingDApp contract on Sepolia before using it. The link is saved in this browser only.</p>
    </form>
  );
}

function DeployCopy() {
  const { wallet, requestConnect, toast } = useBallot();
  const { tx, run, reset } = useTransaction();
  const [deployed, setDeployed] = useState(null);
  const [confirm, setConfirm] = useState(false);

  const deploy = async () => {
    const record = await run((onStatus) => deployNewContract(onStatus));
    if (record) {
      setDeployed(record);
      setConfirm(false);
      toast('Contract deployed to Sepolia.', 'success');
    }
  };

  if (deployed) {
    return (
      <div className="notice success">
        <h3>Your contract is deployed</h3>
        <dl className="facts">
          <div><dt>Address</dt><dd><Address value={deployed.contract} full /></dd></div>
          <div><dt>Deployment block</dt><dd>{deployed.blockNumber.toLocaleString()}</dd></div>
          <div><dt>Transaction</dt><dd><TxHash value={deployed.hash} /></dd></div>
        </dl>
        <div className="hero-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              try {
                await linkContract(deployed.contract, deployed.blockNumber);
                toast('This browser now uses your new contract.', 'success');
              } catch (err) {
                toast(err.message, 'error');
              }
            }}
          >
            Use it on this site
          </button>
        </div>
        <p className="fine">
          To make it the default for everyone who opens your copy of the site, put the address and block in <code>.env</code> as
          VITE_CONTRACT_ADDRESS and VITE_DEPLOYMENT_BLOCK, then rebuild.
        </p>
      </div>
    );
  }

  return (
    <div className="deploy-copy">
      <p>
        Deploys a fresh, empty VotingDApp from your wallet. It costs about 1.2 million gas in test ETH, and your wallet asks you
        to approve it. Useful for running your own separate set of polls.
      </p>
      {!wallet.address ? (
        <button type="button" className="btn btn-secondary" onClick={requestConnect}>Connect wallet to deploy</button>
      ) : !confirm ? (
        <button type="button" className="btn btn-secondary" onClick={() => setConfirm(true)}>Deploy a new copy</button>
      ) : (
        <div className="ballot-actions">
          <button type="button" className="btn btn-primary" onClick={deploy}>Deploy from {wallet.walletName || 'my wallet'}</button>
          <button type="button" className="btn btn-quiet" onClick={() => { setConfirm(false); reset(); }}>Cancel</button>
        </div>
      )}
      {tx.status === 'insufficient' && <GasAssistPanel action="deploy the contract" preflight={tx.preflight} onRetry={deploy} onClose={reset} />}
      <TxProgress tx={tx} verb="deploy the contract" onRetry={deploy} onDismiss={reset} />
    </div>
  );
}

export function ContractPage() {
  const { contract } = useBallot();
  const siteDefault = getSiteDefaultContract();
  const share = contract ? buildShareLink(contract) : '';

  return (
    <div className="page">
      <header className="page-head">
        <h1>The contract behind the polls</h1>
        <p className="page-lede">
          Demos has no centralized server controlling the polls. One VotingDApp contract on Sepolia stores every poll and
          enforces the rules, and this page reads it directly.
        </p>
      </header>

      <div className="two-col" data-tour-target="contract-setup">
        <section aria-labelledby="current-title">
          <h2 id="current-title" className="section-title">Current contract</h2>
          {contract ? (
            <>
              <dl className="facts boxed">
                <div><dt>Address</dt><dd><Address value={contract.address} full /></dd></div>
                <div>
                  <dt>Deployment block</dt>
                  <dd>
                    {contract.deploymentBlock ? (
                      <a href={etherscan.block(contract.deploymentBlock)} target="_blank" rel="noreferrer">{contract.deploymentBlock.toLocaleString()}</a>
                    ) : (
                      'Unknown (activity history limited to recent blocks)'
                    )}
                  </dd>
                </div>
                <div><dt>Source</dt><dd>{SOURCE_LABEL[contract.source]}</dd></div>
                <div><dt>Etherscan</dt><dd><ExternalLink href={etherscan.code(contract.address)}>Code and Read Contract tab</ExternalLink></dd></div>
              </dl>
              <div className="hero-actions">
                <CopyButton value={share} label="Copy share link" showLabel className="btn btn-secondary" />
                {contract.source !== 'site-config' && siteDefault && (
                  <button type="button" className="btn btn-quiet" onClick={revertToSiteDefault}>Use the site default instead</button>
                )}
                {contract.source !== 'site-config' && !siteDefault && (
                  <button type="button" className="btn btn-quiet" onClick={revertToSiteDefault}>Unlink</button>
                )}
              </div>
              <p className="fine">The share link opens Demos pointed at this contract, for anyone.</p>
            </>
          ) : (
            <div className="notice">
              <h3>No contract linked</h3>
              <p>This copy of the site has no deployment configured yet. Deploy one with the steps below, or link an existing contract.</p>
            </div>
          )}

          <details>
            <summary>Advanced</summary>
            <h3 className="sub-title">Link a contract</h3>
            <LinkForm />

            <h3 className="sub-title">Deploy a new copy</h3>
            <DeployCopy />
          </details>
        </section>

        <section aria-labelledby="steps-title">
          <h2 id="steps-title" className="section-title">Set it up</h2>
          <ol className="steps">
            <li>
              <h3>Deploy it once.</h3>
              <p>
                Deploy <code>VotingDApp.sol</code> with Hardhat (<code>npm run deploy:sepolia</code> in the <code>blockchain</code>{' '}
                folder) or from this page, with MetaMask connected to Sepolia. Either way a wallet you control signs the
                deployment.
              </p>
            </li>
            <li>
              <h3>Make it the site’s default.</h3>
              <p>
                The Hardhat script writes the real address and deployment block into <code>src/config/deployment.json</code>. If you
                deployed from the browser, set <code>VITE_CONTRACT_ADDRESS</code> and <code>VITE_DEPLOYMENT_BLOCK</code> in{' '}
                <code>.env</code> instead.
              </p>
            </li>
            <li>
              <h3>Verify the source on Etherscan.</h3>
              <p>
                Run <code>npm run verify:sepolia</code> with an Etherscan API key in <code>.env</code>. It submits the source with
                the exact settings used to compile it: Solidity 0.8.28, optimizer on with 200 runs, EVM version cancun.
              </p>
            </li>
            <li>
              <h3>Share the link.</h3>
              <p>Anyone can read the polls. Voting requires a Sepolia wallet with enough test ETH to cover gas.</p>
            </li>
          </ol>
          <h3 className="sub-title">Sepolia Test ETH Faucet</h3>
          <p>
            Get test ETH for Sepolia transactions from the{' '}
            <ExternalLink href={FAUCET.url}>Google Cloud Web3 Faucet</ExternalLink>.
          </p>
        </section>
      </div>

      <NetworkInfo />
    </div>
  );
}
