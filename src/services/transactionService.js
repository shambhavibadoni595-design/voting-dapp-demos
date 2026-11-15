/**
 * transactionService — the life of one transaction, from gas check to receipt.
 *
 * Before the wallet opens:
 *   1. a wallet must be connected,
 *   2. it must be on Sepolia (chain 11155111) — we ask it to switch if not,
 *   3. the call is simulated with eth_estimateGas, which also catches a revert
 *      such as "You have already voted" before the user pays anything,
 *   4. the Sepolia ETH balance is read,
 *   5. balance is compared with gas limit × max fee per gas.
 * If the balance is short, an InsufficientFundsError carries the numbers the
 * gas assistance panel shows. Success is only reported from a mined receipt.
 */
import { Contract, ContractFactory } from 'ethers';
import abi from '../config/VotingDAppABI.json';
import bytecodeJson from '../config/VotingDAppBytecode.json';
import { SEPOLIA, etherscan } from '../config/contractConfig.js';
import { getWalletState, getSigner, switchToSepolia, refreshBalance, isRejection, WalletError } from './walletService.js';
import { withRead, readContract, requireContract, parseLog, pokeWatcher, waitForReadBlock } from './contractService.js';

export const TX = Object.freeze({
  CHECKING: 'checking',
  AWAITING_SIGNATURE: 'awaiting_signature',
  SUBMITTED: 'submitted',
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

export class TxError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'TxError';
    this.code = code;
    Object.assign(this, extra);
  }
}

// Fallback gas limits if estimation is unavailable (from the Hardhat gas report, with headroom).
const FALLBACK_GAS = { createPoll: 1_000_000n, vote: 150_000n, closePoll: 60_000n, deploy: 1_500_000n };
const GAS_BUFFER_PERCENT = 125n; // estimate × 1.25
const PENDING_TIMEOUT_MS = 120_000;

let activeTransactionLock = null;
const pendingPollLocks = new Set();

function acquireTransactionLock(pollId = null) {
  if (activeTransactionLock) {
    throw new TxError('BUSY', 'A transaction is already waiting. Finish or reject it in your wallet first.');
  }
  if (pollId !== null && pendingPollLocks.has(pollId)) {
    throw new TxError('BUSY', 'A vote for this poll is still pending. Wait for it to resolve before submitting again.');
  }
  const lock = { released: false };
  activeTransactionLock = lock;
  if (pollId !== null) pendingPollLocks.add(pollId);
  return {
    release: () => {
      if (lock.released) return;
      lock.released = true;
      if (activeTransactionLock === lock) activeTransactionLock = null;
    },
    releasePoll: () => {
      if (pollId !== null) pendingPollLocks.delete(pollId);
    },
  };
}

export function isTransactionInFlight() {
  return activeTransactionLock !== null;
}

function revertReason(err) {
  return (
    err?.reason ||
    err?.revert?.args?.[0] ||
    err?.info?.error?.data?.message ||
    (err?.shortMessage && /reverted/.test(err.shortMessage) ? err.shortMessage : null) ||
    null
  );
}

function isRevert(err) {
  return err?.code === 'CALL_EXCEPTION' || /execution reverted|revert/i.test(err?.message || '');
}

/** Turn wallet / RPC / contract errors into one predictable shape for the UI. */
export function toTxError(err) {
  if (err instanceof TxError) return err;
  if (err instanceof WalletError) {
    const map = { REJECTED: 'REJECTED', NOT_CONNECTED: 'NOT_CONNECTED', WRONG_NETWORK: 'WRONG_NETWORK' };
    return new TxError(map[err.code] || 'FAILED', err.message, { cause: err });
  }
  if (isRejection(err)) return new TxError('REJECTED', 'You rejected the transaction in your wallet. Nothing was sent.', { cause: err });
  if (err?.code === 'INSUFFICIENT_FUNDS' || /insufficient funds/i.test(err?.message || '')) {
    return new TxError('INSUFFICIENT_FUNDS', 'You need Sepolia test ETH to pay the network gas fee.', { cause: err });
  }
  if (err?.code === 'UNPREDICTABLE_GAS_LIMIT') {
    return new TxError(
      'UNPREDICTABLE_GAS_LIMIT',
      'Could not estimate gas for this transaction. The contract may reject it.',
      { cause: err }
    );
  }
  if (err?.code === 'NONCE_EXPIRED') {
    return new TxError('NONCE_EXPIRED', 'This transaction nonce was already used. Check your wallet activity.', { cause: err });
  }
  if (err?.code === 'REPLACEMENT_UNDERPRICED') {
    return new TxError(
      'REPLACEMENT_UNDERPRICED',
      'The replacement transaction fee is too low. The original transaction may still be pending.',
      { cause: err }
    );
  }
  if (err?.code === 'TIMEOUT') {
    return new TxError('TIMEOUT', 'The Sepolia network did not respond. Check your connection and try again.', { cause: err });
  }
  if (isRevert(err)) {
    const reason = revertReason(err);
    return new TxError('REVERTED', reason || 'The contract rejected this transaction.', { reason, cause: err });
  }
  if (err?.code === 'NO_CONTRACT') return new TxError('NO_CONTRACT', err.message, { cause: err });
  if (err?.code === 'NETWORK_UNREACHABLE' || err?.code === 'NETWORK_ERROR' || err?.code === 'RPC') {
    return new TxError('NETWORK_UNREACHABLE', 'The Sepolia network did not respond. Check your connection and try again.', { cause: err });
  }
  return new TxError('FAILED', err?.shortMessage || err?.message || 'The transaction failed.', { cause: err });
}

async function ensureReady() {
  const wallet = getWalletState();
  if (!wallet.address) throw new TxError('NOT_CONNECTED', 'Connect a wallet to continue.');
  if (!wallet.isSepolia) {
    try {
      await switchToSepolia();
    } catch (err) {
      throw new TxError('WRONG_NETWORK', 'Switch your wallet to Ethereum Sepolia to continue.', { cause: err });
    }
  }
  return getWalletState().address;
}

/**
 * Gas and balance check for a call. Does not open the wallet.
 * @param {{ method?: string, args?: any[], deploy?: boolean }} call
 */
export async function preflight({ method, args = [], deploy = false }) {
  const from = await ensureReady();

  let gasEstimate = null;
  let estimated = true;
  try {
    gasEstimate = await withRead(async (provider) => {
      if (deploy) {
        const factory = new ContractFactory(abi, bytecodeJson.bytecode);
        const tx = await factory.getDeployTransaction();
        return provider.estimateGas({ ...tx, from });
      }
      const contract = readContract(provider);
      return contract[method].estimateGas(...args, { from });
    });
  } catch (err) {
    if (isRevert(err)) throw toTxError(err); // the contract would reject it — stop before the wallet opens
    if (err?.code === 'NETWORK_UNREACHABLE') throw err;
    estimated = false;
    gasEstimate = FALLBACK_GAS[deploy ? 'deploy' : method] ?? 300_000n;
  }
  const gasLimit = estimated ? (gasEstimate * GAS_BUFFER_PERCENT) / 100n : gasEstimate;

  const [feeData, balanceWei] = await withRead((p) => Promise.all([p.getFeeData(), p.getBalance(from)]));
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
  const likelyFeePerGas = feeData.gasPrice ?? maxFeePerGas;
  const maxCostWei = gasLimit * maxFeePerGas;
  const likelyCostWei = gasEstimate * likelyFeePerGas;

  return {
    from,
    gasEstimate: gasEstimate.toString(),
    gasLimit: gasLimit.toString(),
    estimated,
    maxFeePerGas: maxFeePerGas.toString(),
    likelyFeePerGas: likelyFeePerGas.toString(),
    maxCostWei: maxCostWei.toString(),
    likelyCostWei: likelyCostWei.toString(),
    balanceWei: balanceWei.toString(),
    sufficient: balanceWei >= maxCostWei,
  };
}

function sameTransactionAction(original, replacement) {
  if (!replacement) return false;
  const to = (address) => (address ? address.toLowerCase() : null);
  const data = (value) => (value || '0x').toLowerCase();
  const value = (amount) => BigInt(amount ?? 0).toString();
  return (
    to(original.to) === to(replacement.to) &&
    data(original.data) === data(replacement.data) &&
    value(original.value) === value(replacement.value)
  );
}

function waitDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMined(tx, onPending, releaseLock) {
  let pendingReported = false;
  const reportPending = () => {
    if (!pendingReported) {
      pendingReported = true;
      onPending();
    }
    releaseLock();
  };
  const pendingTimer = setTimeout(reportPending, PENDING_TIMEOUT_MS);
  try {
    while (true) {
      try {
        const receipt = await tx.wait(1);
        return { receipt, hash: tx.hash };
      } catch (err) {
        if (err?.code === 'TIMEOUT') {
          reportPending();
          await waitDelay(1000);
          continue;
        }
        if (err?.code === 'TRANSACTION_REPLACED') {
          if (err.cancelled) {
            throw new TxError('CANCELLED', 'The transaction was cancelled in your wallet.', {
              hash: err.replacement?.hash || tx.hash,
              cause: err,
            });
          }
          if (!sameTransactionAction(tx, err.replacement)) {
            throw new TxError('REPLACED', 'A different transaction replaced this one. Check its status on Etherscan.', {
              hash: err.replacement?.hash || tx.hash,
              cause: err,
            });
          }
          return {
            receipt: err.receipt,
            hash: err.replacement?.hash || err.receipt?.hash || tx.hash,
          };
        }
        if (err?.receipt && err.receipt.status === 0) {
          throw new TxError('FAILED', 'The transaction was mined but reverted. No vote or poll was recorded.', {
            hash: tx.hash,
            blockNumber: err.receipt.blockNumber,
            cause: err,
          });
        }
        throw err;
      }
    }
  } finally {
    clearTimeout(pendingTimer);
  }
}

async function blockTimestamp(blockNumber) {
  try {
    const block = await withRead((p) => p.getBlock(blockNumber));
    if (block) return Number(block.timestamp);
  } catch {
    /* fall through */
  }
  const signer = await getSigner();
  const block = await signer.provider.getBlock(blockNumber);
  return block ? Number(block.timestamp) : null;
}

/**
 * Send a VotingDApp transaction through the connected wallet.
 * @param {object} opts
 * @param {'createPoll'|'vote'|'closePoll'} opts.method
 * @param {any[]} opts.args
 * @param {'create'|'vote'|'close'} opts.type
 * @param {(update: object) => void} [opts.onStatus]
 */
export async function sendContractTransaction({ method, args, type, onStatus = () => {} }) {
  const pollLock = acquireTransactionLock(method === 'vote' ? String(args[0]) : null);
  let hash = null;
  let confirmedRecord = null;
  try {
    const { address: contractAddress } = requireContract();
    onStatus({ status: TX.CHECKING });

    const check = await preflight({ method, args });
    if (!check.sufficient) {
      throw new TxError('INSUFFICIENT_FUNDS', 'You need Sepolia test ETH to pay the network gas fee.', { preflight: check });
    }

    onStatus({ status: TX.AWAITING_SIGNATURE, preflight: check });
    const signer = await getSigner();
    const contract = new Contract(contractAddress, abi, signer);
    const tx = await contract[method](...args, { gasLimit: check.gasLimit });
    hash = tx.hash;
    onStatus({ status: TX.SUBMITTED, hash, preflight: check });

    const mined = await waitForMined(
      tx,
      () => onStatus({ status: TX.PENDING, hash, etherscanUrl: etherscan.tx(hash) }),
      pollLock.release
    );
    hash = mined.hash;
    const { receipt } = mined;
    if (!receipt || receipt.status !== 1) {
      throw new TxError('FAILED', 'The transaction was mined but reverted.', { hash, blockNumber: receipt?.blockNumber });
    }

    const events = receipt.logs
      .filter((l) => l.address.toLowerCase() === contractAddress.toLowerCase())
      .map(parseLog)
      .filter(Boolean);
    const main = events[0] || null;
    const timestamp = main?.timestamp ?? (await blockTimestamp(receipt.blockNumber));

    const record = {
      type,
      hash,
      status: 'confirmed',
      blockNumber: Number(receipt.blockNumber),
      timestamp,
      from: receipt.from,
      contract: contractAddress,
      pollId: main ? main.pollId : null,
      optionIndex: main?.type === 'voted' ? main.optionIndex : null,
      gasUsed: receipt.gasUsed?.toString(),
      feeWei: (receipt.fee ?? receipt.gasUsed * (receipt.gasPrice ?? 0n)).toString(),
      etherscanUrl: etherscan.tx(hash),
      chainId: SEPOLIA.chainId,
    };
    confirmedRecord = record;
    saveToHistory(record);
    await waitForReadBlock(record.blockNumber);
    onStatus({ status: TX.CONFIRMED, hash, record });
    refreshBalance();
    pokeWatcher();
    return record;
  } catch (raw) {
    if (raw?.code === 'READ_NOT_READY' && confirmedRecord) {
      onStatus({ status: TX.CONFIRMED, hash, record: confirmedRecord, freshnessError: raw });
      throw raw;
    }
    const err = toTxError(raw);
    if (hash && !err.hash) err.hash = hash;
    const status = err.code === 'REJECTED' ? TX.REJECTED : err.code === 'CANCELLED' ? TX.CANCELLED : TX.FAILED;
    onStatus({ status, error: err, hash: err.hash || hash });
    throw err;
  } finally {
    pollLock.release();
    pollLock.releasePoll();
  }
}

/**
 * Deploy a fresh VotingDApp from the visitor's wallet. Requires their approval in the wallet.
 */
export async function deployVotingContract({ onStatus = () => {} } = {}) {
  const transactionLock = acquireTransactionLock();
  let hash = null;
  try {
    onStatus({ status: TX.CHECKING });
    const check = await preflight({ deploy: true });
    if (!check.sufficient) {
      throw new TxError('INSUFFICIENT_FUNDS', 'You need Sepolia test ETH to pay the network gas fee.', { preflight: check });
    }
    onStatus({ status: TX.AWAITING_SIGNATURE, preflight: check });
    const signer = await getSigner();
    const factory = new ContractFactory(abi, bytecodeJson.bytecode, signer);
    const contract = await factory.deploy({ gasLimit: check.gasLimit });
    const tx = contract.deploymentTransaction();
    hash = tx.hash;
    onStatus({ status: TX.SUBMITTED, hash, preflight: check });
    const { receipt, hash: finalHash } = await waitForMined(
      tx,
      () => onStatus({ status: TX.PENDING, hash, etherscanUrl: etherscan.tx(hash) }),
      transactionLock.release
    );
    hash = finalHash;
    if (!receipt || receipt.status !== 1 || !receipt.contractAddress) {
      throw new TxError('FAILED', 'The deployment was mined but failed.', { hash });
    }
    const record = {
      type: 'deploy',
      hash,
      status: 'confirmed',
      blockNumber: Number(receipt.blockNumber),
      timestamp: await blockTimestamp(receipt.blockNumber),
      from: receipt.from,
      contract: receipt.contractAddress,
      pollId: null,
      etherscanUrl: etherscan.tx(hash),
      chainId: SEPOLIA.chainId,
    };
    saveToHistory(record);
    onStatus({ status: TX.CONFIRMED, hash, record });
    refreshBalance();
    return record;
  } catch (raw) {
    const err = toTxError(raw);
    if (hash && !err.hash) err.hash = hash;
    const status = err.code === 'REJECTED' ? TX.REJECTED : err.code === 'CANCELLED' ? TX.CANCELLED : TX.FAILED;
    onStatus({ status, error: err, hash: err.hash || hash });
    throw err;
  } finally {
    transactionLock.release();
    transactionLock.releasePoll();
  }
}

// ---------------------------------------------------------------------------
// This browser's confirmed transactions (convenience only — the chain is the record)
// ---------------------------------------------------------------------------
const HISTORY_KEY = 'ballot.txHistory.v2';
const HISTORY_LIMIT = 100;

function isHistoryRecord(record) {
  return (
    record !== null &&
    typeof record === 'object' &&
    !Array.isArray(record) &&
    ['create', 'vote', 'close', 'deploy'].includes(record.type) &&
    record.status === 'confirmed' &&
    typeof record.hash === 'string' &&
    /^0x[0-9a-fA-F]{64}$/.test(record.hash) &&
    Number.isInteger(record.blockNumber) &&
    record.blockNumber > 0 &&
    (record.timestamp === null || Number.isFinite(record.timestamp)) &&
    typeof record.from === 'string' &&
    /^0x[0-9a-fA-F]{40}$/.test(record.from) &&
    typeof record.contract === 'string' &&
    /^0x[0-9a-fA-F]{40}$/.test(record.contract) &&
    record.chainId === SEPOLIA.chainId &&
    (record.type === 'deploy'
      ? record.pollId === null
      : Number.isInteger(record.pollId) && record.pollId >= 0) &&
    (record.type === 'vote'
      ? Number.isInteger(record.optionIndex) && record.optionIndex >= 0
      : record.optionIndex === null || record.optionIndex === undefined)
  );
}

export function getLocalHistory(address = null) {
  try {
    const all = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || '[]');
    if (!Array.isArray(all)) return [];
    const valid = all.filter(isHistoryRecord).slice(0, HISTORY_LIMIT);
    return address ? valid.filter((r) => r.from.toLowerCase() === address.toLowerCase()) : valid;
  } catch {
    return [];
  }
}

function saveToHistory(record) {
  try {
    const all = getLocalHistory().filter((r) => r.hash !== record.hash);
    all.unshift(record);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(all.slice(0, HISTORY_LIMIT)));
  } catch {
    /* storage unavailable — the chain still has the record */
  }
}
