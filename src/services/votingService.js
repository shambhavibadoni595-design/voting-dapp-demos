/**
 * votingService — the one module the UI talks to.
 *
 * Components never touch ethers, the ABI or the wallet directly, so the interface can
 * be redesigned without rewriting blockchain code. Every function here returns real
 * chain data or throws; there are no mock fallbacks.
 */
import {
  getActiveContract,
  onActiveContractChange,
  saveLinkedContract,
  resetToSiteDefault,
  buildShareLink,
  getSiteDefaultContract,
  etherscan,
  SEPOLIA,
  FAUCET,
} from '../config/contractConfig.js';
import * as wallet from './walletService.js';
import * as chain from './contractService.js';
import * as txs from './transactionService.js';

export const LIMITS = Object.freeze({
  minOptions: 2,
  maxOptions: 10,
  minDurationSeconds: 60,
  maxDurationSeconds: 30 * 24 * 60 * 60,
  maxQuestionBytes: 280,
  maxDescriptionBytes: 1000,
  maxOptionBytes: 100,
});

export { TX } from './transactionService.js';
export { SEPOLIA, FAUCET, etherscan };
export const isPollOpen = chain.isPollOpen;

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------
export const startWalletDiscovery = wallet.startWalletDiscovery;
export const listWallets = wallet.listWallets;
export const onWalletsDiscovered = wallet.onWalletsDiscovered;
export const onWalletChange = wallet.onWalletStateChange;
export const getWalletState = wallet.getWalletState;
export const restoreConnection = wallet.restoreConnection;
export const disconnectWallet = wallet.disconnectWallet;
export const switchToSepolia = wallet.switchToSepolia;
export const refreshBalance = wallet.refreshBalance;

/** Connect a wallet (opens the wallet's approval prompt). Returns the address. */
export async function connectWallet(chosen) {
  const s = await wallet.connectWallet(chosen);
  return s.address;
}

export async function getAccount() {
  return wallet.getActiveAddress();
}

// ---------------------------------------------------------------------------
// Contract selection
// ---------------------------------------------------------------------------
export { getActiveContract, onActiveContractChange, getSiteDefaultContract, buildShareLink };

/** Check an address on Sepolia and, if it is a VotingDApp, make it this browser's default. */
export async function linkContract(address, deploymentBlock) {
  const info = await chain.inspectContract(address.trim());
  let block = Number(deploymentBlock) || 0;
  if (!block) block = await chain.findDeploymentBlock(info.address);
  chain.resetWatcher();
  return { ...saveLinkedContract(info.address, block), ...info };
}

export function revertToSiteDefault() {
  chain.resetWatcher();
  resetToSiteDefault();
}

export const inspectContract = chain.inspectContract;

// ---------------------------------------------------------------------------
// Polls
// ---------------------------------------------------------------------------

// Hide only poll #0 from the recorded localhost deployment; the chain data remains unchanged.
const HIDDEN_POLL = Object.freeze({
  contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  id: 0,
});

export function isHiddenPoll(pollId, contractAddress = getActiveContract()?.address) {
  return (
    Number(pollId) === HIDDEN_POLL.id &&
    String(contractAddress || '').toLowerCase() === HIDDEN_POLL.contractAddress.toLowerCase()
  );
}

/** All polls, newest first. */
export async function getAllPolls() {
  const polls = await chain.fetchAllPolls();
  return polls.sort((a, b) => b.id - a.id);
}

export async function getPoll(pollId) {
  const id = Number(pollId);
  if (isHiddenPoll(id)) {
    throw new chain.ChainError('NOT_FOUND', `Poll #${id} is hidden on this site.`);
  }
  return chain.fetchPoll(id);
}

/** { voted, optionIndex } for an address; optionIndex is -1 when not voted. */
export const getVoterChoice = (pollId, address) => chain.fetchVoterChoice(Number(pollId), address);

/** Totals from the contract, plus the open count derived from the polls the contract returned. */
export async function getStats(polls) {
  const [stats, latestBlock] = await Promise.all([chain.fetchStats(), chain.fetchLatestBlock()]);
  const list = polls || (await getAllPolls());
  const latestBlockTimestamp = latestBlock ? Number(latestBlock.timestamp) : null;
  return { ...stats, openPolls: list.filter((p) => chain.isPollOpen(p, latestBlockTimestamp)).length };
}

// ---------------------------------------------------------------------------
// Validation (mirrors the contract's require() checks)
// ---------------------------------------------------------------------------
const encoder = new TextEncoder();
export const byteLength = (s) => encoder.encode(s || '').length;

/**
 * @returns {{ ok: boolean, errors: Record<string,string>, optionErrors: string[] }}
 */
export function validatePollInput({ question, description, options, durationSeconds }) {
  const errors = {};
  const optionErrors = [];
  const q = (question || '').trim();
  if (!q) errors.question = 'Write the question voters will answer.';
  else if (byteLength(q) > LIMITS.maxQuestionBytes) errors.question = `Keep the question under ${LIMITS.maxQuestionBytes} bytes.`;

  if (byteLength((description || '').trim()) > LIMITS.maxDescriptionBytes) {
    errors.description = `Keep the description under ${LIMITS.maxDescriptionBytes} bytes.`;
  }

  const opts = (options || []).map((o) => (o || '').trim());
  if (opts.length < LIMITS.minOptions) errors.options = 'Add at least two answers.';
  if (opts.length > LIMITS.maxOptions) errors.options = 'A poll can have at most ten answers.';
  const seen = new Map();
  opts.forEach((o, i) => {
    if (!o) optionErrors[i] = 'Fill in this answer or remove it.';
    else if (byteLength(o) > LIMITS.maxOptionBytes) optionErrors[i] = `Keep answers under ${LIMITS.maxOptionBytes} bytes.`;
    else if (seen.has(o.toLowerCase())) optionErrors[i] = `Same as answer ${seen.get(o.toLowerCase()) + 1}.`;
    else seen.set(o.toLowerCase(), i);
  });

  const d = Number(durationSeconds);
  if (!Number.isFinite(d) || d < LIMITS.minDurationSeconds) errors.duration = 'A poll must stay open for at least one minute.';
  else if (!Number.isInteger(d)) errors.duration = 'Duration must be a whole number of seconds.';
  else if (d > LIMITS.maxDurationSeconds) errors.duration = 'A poll can stay open for at most 30 days.';

  const ok = Object.keys(errors).length === 0 && optionErrors.filter(Boolean).length === 0;
  return { ok, errors, optionErrors };
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
export const preflight = txs.preflight;
export const isTransactionInFlight = txs.isTransactionInFlight;

/**
 * Create a poll on-chain.
 * @returns {Promise<{ pollId: number, record: object }>}
 */
export async function createPoll({ question, description = '', options, durationSeconds }, onStatus) {
  const check = validatePollInput({ question, description, options, durationSeconds });
  if (!check.ok) {
    const first = Object.values(check.errors)[0] || check.optionErrors.find(Boolean);
    throw new txs.TxError('INVALID', first);
  }
  const record = await txs.sendContractTransaction({
    method: 'createPoll',
    args: [question.trim(), description.trim(), options.map((o) => o.trim()), BigInt(durationSeconds)],
    type: 'create',
    onStatus,
  });
  return { pollId: record.pollId, record };
}

/**
 * Cast a vote. Resolves only after the vote is mined; the result includes a
 * receipt built from the mined transaction and the poll as stored on-chain.
 */
export async function vote(pollId, optionIndex, onStatus) {
  const record = await txs.sendContractTransaction({
    method: 'vote',
    args: [BigInt(pollId), BigInt(optionIndex)],
    type: 'vote',
    onStatus,
  });
  let receipt;
  try {
    receipt = await getReceipt(record.hash);
  } catch (err) {
    if (err?.code === 'NOT_FOUND' || err?.code === 'NETWORK_UNREACHABLE') {
      throw new chain.ChainError(
        'READ_NOT_READY',
        'Your vote is confirmed, but the read RPC has not indexed its receipt yet.',
        err
      );
    }
    throw err;
  }
  return { record, receipt };
}

export async function closePoll(pollId, onStatus) {
  const record = await txs.sendContractTransaction({
    method: 'closePoll',
    args: [BigInt(pollId)],
    type: 'close',
    onStatus,
  });
  return { record };
}

export async function deployNewContract(onStatus) {
  return txs.deployVotingContract({ onStatus });
}

/** Confirmed transactions sent from this browser (newest first). */
export function getTransactionHistory(address = null) {
  return txs.getLocalHistory(address);
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

/**
 * Build a vote receipt from a transaction on Sepolia:
 * the transaction receipt, its Voted event, its block, and the poll.
 */
async function buildReceipt(txHash) {
  const active = chain.requireContract();
  const receipt = await chain.withRead((p) => p.getTransactionReceipt(txHash));
  if (!receipt) {
    throw new chain.ChainError('NOT_FOUND', 'This transaction is not mined yet, or it is not on Sepolia.');
  }
  if (receipt.status !== 1) {
    throw new chain.ChainError('NOT_FOUND', 'This transaction reverted, so no vote was recorded.');
  }
  const voted = receipt.logs
    .filter((l) => l.address.toLowerCase() === active.address.toLowerCase())
    .map(chain.parseLog)
    .find((e) => e && e.type === 'voted');
  if (!voted) {
    throw new chain.ChainError('NOT_FOUND', 'This transaction is not a vote on the linked Demos contract.');
  }
  const [poll, latest] = await Promise.all([chain.fetchPoll(voted.pollId), chain.withRead((p) => p.getBlockNumber())]);
  return {
    network: SEPOLIA.name,
    chainId: SEPOLIA.chainId,
    contract: active.address,
    pollId: voted.pollId,
    question: poll.question,
    optionIndex: voted.optionIndex,
    choice: poll.options[voted.optionIndex],
    voter: voted.actor,
    blockNumber: Number(receipt.blockNumber),
    timestamp: voted.timestamp,
    confirmations: Math.max(1, latest - Number(receipt.blockNumber) + 1),
    txHash: receipt.hash,
    etherscanUrl: etherscan.tx(receipt.hash),
    status: 'Recorded on-chain',
  };
}

export async function getReceipt(txHash) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await buildReceipt(txHash);
    } catch (err) {
      if (err?.code !== 'NOT_FOUND') throw err;
      lastError = err;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}

/** The vote transaction for (pollId, voter), found from the Voted event. */
export async function findVoteTransaction(pollId, voter) {
  const active = chain.requireContract();
  const index = new chain.LogIndex({ address: active.address, fromBlock: active.deploymentBlock, actor: voter });
  while (!index.reachedStart) {
    await index.loadOlder(10);
    const hit = index.items.find((e) => e.type === 'voted' && e.pollId === Number(pollId));
    if (hit) return hit.txHash;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

/**
 * A paged, newest-first feed of PollCreated / Voted / PollClosed events.
 * Pass `actor` to see only one address's activity.
 */
export function createActivityFeed({ actor = null } = {}) {
  const active = chain.requireContract();
  const index = new chain.LogIndex({ address: active.address, fromBlock: active.deploymentBlock, actor });
  return {
    get items() {
      return index.items;
    },
    get reachedStart() {
      return index.reachedStart;
    },
    get historyComplete() {
      return index.floorKnown;
    },
    get oldestScannedBlock() {
      return index.oldestScanned;
    },
    loadOlder: (n = 25) => index.loadOlder(n),
    syncNewer: (latest) => index.syncNewer(latest),
  };
}

// ---------------------------------------------------------------------------
// Network & live updates
// ---------------------------------------------------------------------------
export async function getNetworkInfo() {
  const [chainId, block] = await Promise.all([chain.fetchChainId(), chain.fetchLatestBlock()]);
  return {
    chainId,
    latestBlock: block ? Number(block.number) : null,
    latestBlockTime: block ? Number(block.timestamp) : null,
    rpcUrl: chain.getReadRpcUrl(),
  };
}

/** Called with { blockNumber, events } on each new block, or { error }. Returns unsubscribe. */
export const watchChain = chain.watchChain;
export const pokeChain = chain.pokeWatcher;
