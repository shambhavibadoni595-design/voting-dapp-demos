/**
 * Network, contract and external-link configuration for Demos.
 *
 * The baked-in deployment is the default for every visitor. VITE_ values are
 * optional developer overrides for local builds.
 */
import { getAddress, isAddress } from 'ethers';
import deployment from './deployment.json';
import { LEGACY_CONTRACT_KEY, selectConfiguredContract } from './contractSelection.js';

const env = import.meta.env || {};

export const SEPOLIA = Object.freeze({
  chainId: 11155111,
  chainIdHex: '0xaa36a7',
  name: 'Ethereum Sepolia',
  shortName: 'Sepolia',
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  explorer: 'https://sepolia.etherscan.io',
  // Offered to the wallet when Sepolia has to be added to it.
  walletRpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com', 'https://sepolia.drpc.org'],
});

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Public RPC endpoints used for reading (no wallet needed). Tried in order. */
export const READ_RPC_URLS = splitList(env.VITE_SEPOLIA_RPC_URL).length
  ? splitList(env.VITE_SEPOLIA_RPC_URL)
  : ['https://ethereum-sepolia-rpc.publicnode.com', 'https://sepolia.drpc.org', 'https://1rpc.io/sepolia'];

export const FAUCET = Object.freeze({
  url: env.VITE_SEPOLIA_FAUCET_URL || 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia',
  name: env.VITE_SEPOLIA_FAUCET_NAME || 'Google Cloud Web3 faucet',
  backupUrl: env.VITE_SEPOLIA_FAUCET_BACKUP_URL || '',
  backupName: env.VITE_SEPOLIA_FAUCET_BACKUP_NAME || 'another Sepolia faucet',
});

/** Largest block range asked of the RPC in one eth_getLogs call. Shrinks automatically on errors. */
export const LOG_CHUNK_SIZE = Number(env.VITE_LOG_CHUNK_SIZE || 10000);
/** How often the site checks for new blocks and contract events (Sepolia makes a block about every 12 s). */
export const POLL_INTERVAL_MS = Number(env.VITE_POLL_INTERVAL_MS || 12000);
/** How many blocks to scan when the deployment block is unknown (about one week on Sepolia). */
export const UNKNOWN_DEPLOY_LOOKBACK = 50000;

export const SOLIDITY_DOCS_URL = 'https://docs.soliditylang.org/en/v0.8.28/';

// ---------------------------------------------------------------------------
// Etherscan links
// ---------------------------------------------------------------------------
export const etherscan = {
  tx: (hash) => `${SEPOLIA.explorer}/tx/${hash}`,
  address: (addr) => `${SEPOLIA.explorer}/address/${addr}`,
  block: (n) => `${SEPOLIA.explorer}/block/${n}`,
  code: (addr) => `${SEPOLIA.explorer}/address/${addr}#code`,
  home: () => SEPOLIA.explorer,
};

// ---------------------------------------------------------------------------
// Active contract selection
// ---------------------------------------------------------------------------
const listeners = new Set();

function normalise(address, block, source) {
  if (!address || !isAddress(address)) return null;
  const n = Number(block);
  return {
    address: getAddress(address),
    deploymentBlock: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0,
    source,
  };
}

/** The deployment this copy of the site ships with, if any. */
export function getSiteDefaultContract() {
  return (
    normalise(env.VITE_CONTRACT_ADDRESS, env.VITE_DEPLOYMENT_BLOCK, 'site-config') ||
    normalise(deployment.address, deployment.deploymentBlock, 'site-config')
  );
}

let current = selectConfiguredContract(getSiteDefaultContract());
stripContractFromUrl();

export function getActiveContract() {
  return current;
}

export function onActiveContractChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  current = getSiteDefaultContract();
  listeners.forEach((l) => {
    try {
      l(current);
    } catch (err) {
      console.error(err);
    }
  });
}

/** Save a contract as this browser's default. */
export function saveLinkedContract(address, deploymentBlock) {
  const value = normalise(address, deploymentBlock, 'linked');
  if (!value) throw new Error('That is not a valid Ethereum address.');
  try {
    window.localStorage.setItem(LEGACY_CONTRACT_KEY, JSON.stringify({ ...value, explicit: true }));
  } catch (cause) {
    const error = new Error('Could not save the linked contract in this browser. Check your storage settings and try again.');
    error.cause = cause;
    throw error;
  }
  stripContractFromUrl();
  emit();
  return value;
}

/** Forget the linked or shared contract and go back to the site's default. */
export function resetToSiteDefault() {
  try {
    window.localStorage.removeItem(LEGACY_CONTRACT_KEY);
  } catch {
    /* ignore */
  }
  stripContractFromUrl();
  emit();
}

function stripContractFromUrl() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('contract') || url.searchParams.has('from')) {
      url.searchParams.delete('contract');
      url.searchParams.delete('from');
      window.history.replaceState(null, '', url.toString());
    }
  } catch {
    /* ignore */
  }
}

/** A link that opens this site pointed at the given contract. */
export function buildShareLink(contract, hashRoute = '#/polls') {
  if (!contract) return '';
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('contract', contract.address);
  if (contract.deploymentBlock) url.searchParams.set('from', String(contract.deploymentBlock));
  return `${url.toString()}${hashRoute}`;
}
