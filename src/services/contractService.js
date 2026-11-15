/**
 * contractService — everything that reads the chain.
 *
 * Reads go through public Sepolia RPC endpoints, so visitors can browse without a
 * wallet. If one endpoint fails with a network error, the next one is tried.
 *
 * Events: public RPCs often drop server-side filters (eth_newFilter), so instead of
 * contract.on() Demos asks for new logs with eth_getLogs once per block interval.
 * The same code pages backwards through history for the activity feed.
 *
 * IMPORTANT: the live watcher (watchChain) only reports events from the moment it starts
 * watching a contract. History (poll list, activity feed) is loaded separately with
 * fetchAllPolls() and LogIndex.loadOlder(); never expect the watcher to provide it.
 */
import { Contract, FetchRequest, Interface, JsonRpcProvider, Network, getAddress, zeroPadValue } from 'ethers';
import abi from '../config/VotingDAppABI.json';
import {
  READ_RPC_URLS,
  SEPOLIA,
  LOG_CHUNK_SIZE,
  POLL_INTERVAL_MS,
  UNKNOWN_DEPLOY_LOOKBACK,
  getActiveContract,
} from '../config/contractConfig.js';

export const votingInterface = new Interface(abi);

export class ChainError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'ChainError';
    this.code = code; // NO_CONTRACT | NOT_VOTING_CONTRACT | WRONG_CHAIN | NETWORK_UNREACHABLE | NOT_FOUND | READ_NOT_READY
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Read provider with fallback
// ---------------------------------------------------------------------------
const REQUEST_TIMEOUT_MS = 8000; // enforced by ethers per HTTP request
const sepoliaNetwork = Network.from(SEPOLIA.chainId);
const providers = READ_RPC_URLS.map((url) => {
  const request = new FetchRequest(url);
  request.timeout = REQUEST_TIMEOUT_MS;
  return new JsonRpcProvider(request, sepoliaNetwork, { staticNetwork: sepoliaNetwork, batchMaxCount: 20 });
});
let providerIndex = 0;
const verifiedChain = new Map(); // index -> true | Error
const RETRIES_PER_PROVIDER = 1;
const BACKOFF_BASE_MS = 250;
const BACKOFF_MAX_MS = 2000;
// Attempt deadline: checked BEFORE each new attempt and it caps backoff sleeps. It does NOT
// cancel a request already in flight; each in-flight request is bounded only by
// REQUEST_TIMEOUT_MS. Worst case for one withRead call is therefore roughly
// READ_ATTEMPT_DEADLINE_MS + REQUEST_TIMEOUT_MS (more if fn itself makes several calls).
const READ_ATTEMPT_DEADLINE_MS = 20000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Exponential backoff with a cap and jitter (50-100% of the step): 250, 500, 1000, 2000, 2000... ms. */
function backoffDelay(failures) {
  const step = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1));
  return Math.round(step / 2 + Math.random() * (step / 2));
}

export function getReadProvider() {
  return providers[providerIndex];
}

export function getReadRpcUrl() {
  return READ_RPC_URLS[providerIndex];
}

function errorStatus(err) {
  return err?.status ?? err?.response?.status ?? err?.info?.response?.status ?? err?.error?.status;
}

function errorText(err) {
  const body = typeof err?.info?.responseBody === 'string' ? err.info.responseBody : '';
  return [
    err?.message,
    err?.shortMessage,
    err?.error?.message,
    err?.info?.error?.message,
    body,
    err?.cause?.message,
    err?.cause?.error?.message,
    err?.cause?.info?.error?.message,
  ]
    .filter(Boolean)
    .join(' ');
}

function isRateLimit(err) {
  return (
    Number(errorStatus(err)) === 429 ||
    /rate limit|too many requests|compute units|requests per second|daily request/i.test(errorText(err))
  );
}

// ethers reports "call returned 0x" against a wrong or empty address as BAD_DATA.
function isBadDecode(err) {
  return err?.code === 'BAD_DATA' && /could not decode result data/i.test(err?.message || '');
}

function isNetworkError(err) {
  const code = err?.code;
  const status = errorStatus(err);
  if (status === 429 || (status >= 500 && status <= 599)) return true;
  // A bad decode means "no contract here", not "network down": do not rotate or retry.
  if (isBadDecode(err)) return false;
  if (['NETWORK_ERROR', 'SERVER_ERROR', 'TIMEOUT', 'UNKNOWN_ERROR', 'BAD_DATA', 'NETWORK_UNREACHABLE'].includes(code)) return true;
  return /failed to fetch|network|timeout|429|rate limit|ECONNREFUSED|503|502/i.test(err?.message || '');
}

/** Kept for compatibility: transient failures worth a retry. */
export function shouldRetryRead(err) {
  const status = errorStatus(err);
  return (
    err?.code === 'TIMEOUT' ||
    Number(status) === 429 ||
    /timed out|timeout|429|too many requests|rate limit/i.test(err?.message || '')
  );
}

// The same endpoint is retried only for timeouts. Rate limits rotate to the next endpoint.
function shouldRetrySameEndpoint(err) {
  if (isRateLimit(err)) return false;
  return err?.code === 'TIMEOUT' || /timed out|timeout/i.test(err?.message || '');
}

function isRangeError(err) {
  if (isRateLimit(err)) return false;
  return /range|too many|limit|exceed|10000|block count|query returned more|-32005|-32600|-32602|response size/i.test(errorText(err));
}

// Errors that mean "this RPC cannot answer historical state queries".
function isHistoryUnavailable(err) {
  return /missing trie node|archive|historical|pruned|header not found|state.*not available|not supported|unsupported/i.test(errorText(err));
}

async function verifyChain(index) {
  if (verifiedChain.get(index) === true) return;
  const hex = await providers[index].send('eth_chainId', []);
  const chainId = Number.parseInt(hex, 16);
  if (chainId !== SEPOLIA.chainId) {
    throw new ChainError('WRONG_CHAIN', `RPC ${READ_RPC_URLS[index]} is on chain ${chainId}, not Sepolia.`);
  }
  verifiedChain.set(index, true);
}

/**
 * Run fn(provider), retrying transient read failures and rotating RPC endpoints.
 * - Waits between attempts with exponential backoff (capped, with jitter).
 * - Rate limits rotate to the next endpoint (and move the default endpoint forward);
 *   with a single endpoint they are retried on it after backoff.
 * - Options: { passRangeErrors: true } rethrows "block range too large" style errors
 *   untouched so the caller (LogIndex) can split the range instead of rotating RPCs.
 * Reads only: never use this to send a transaction.
 */
export async function withRead(fn, opts = {}) {
  const startedAt = Date.now();
  const remaining = () => READ_ATTEMPT_DEADLINE_MS - (Date.now() - startedAt);
  const startIndex = providerIndex;
  let lastErr;
  let failures = 0;
  outer: for (let endpointAttempt = 0; endpointAttempt < providers.length; endpointAttempt++) {
    const index = (startIndex + endpointAttempt) % providers.length;
    for (let retry = 0; retry <= RETRIES_PER_PROVIDER; retry++) {
      if (remaining() <= 0) break outer;
      try {
        await verifyChain(index);
        const result = await fn(providers[index]);
        providerIndex = index;
        return result;
      } catch (err) {
        lastErr = err;
        if (opts.passRangeErrors && isRangeError(err)) throw err;
        if (isBadDecode(err)) {
          throw new ChainError('NOT_VOTING_CONTRACT', 'The contract at the configured address could not be read. Check the address and network.', err);
        }
        if (!(isNetworkError(err) || err?.code === 'WRONG_CHAIN')) throw err;

        failures++;
        const rateLimited = isRateLimit(err);
        if (rateLimited) providerIndex = (index + 1) % providers.length;
        const retrySame =
          retry < RETRIES_PER_PROVIDER && (shouldRetrySameEndpoint(err) || (rateLimited && providers.length === 1));
        const hasNext = retrySame || endpointAttempt < providers.length - 1;
        if (!hasNext) break outer;

        const wait = Math.min(backoffDelay(failures), Math.max(0, remaining()));
        if (wait > 0) await sleep(wait);
        if (retrySame) continue;
        break;
      }
    }
  }
  throw new ChainError(
    lastErr?.code === 'WRONG_CHAIN' ? 'WRONG_CHAIN' : 'NETWORK_UNREACHABLE',
    'Could not reach the Sepolia network. Check your connection, or set VITE_SEPOLIA_RPC_URL to a working RPC.',
    lastErr
  );
}

/**
 * Wait (bounded, about 16 s) for the read RPC to reach a block already confirmed by the wallet.
 * READ_NOT_READY means "confirmed, but the read RPC is still catching up": never a failed transaction.
 */
export async function waitForReadBlock(blockNumber) {
  const ATTEMPTS = 11;
  const DELAY_MS = 1500;
  let lastError = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const latest = await withRead((provider) => provider.getBlockNumber());
      if (latest >= blockNumber) return latest;
      lastError = null;
    } catch (err) {
      lastError = err;
      if (err?.code === 'NETWORK_UNREACHABLE') break;
    }
    if (attempt < ATTEMPTS - 1) await sleep(DELAY_MS);
  }
  throw new ChainError(
    'READ_NOT_READY',
    `The transaction is confirmed in block ${blockNumber}, but the read RPC has not caught up yet.`,
    lastError
  );
}

// ---------------------------------------------------------------------------
// Contract access
// ---------------------------------------------------------------------------
export function requireContract() {
  const active = getActiveContract();
  if (!active) {
    throw new ChainError('NO_CONTRACT', 'No VotingDApp contract is linked to this site yet.');
  }
  return active;
}

export function readContract(provider = getReadProvider()) {
  return new Contract(requireContract().address, abi, provider);
}

/**
 * Confirm an address holds a VotingDApp-compatible contract on Sepolia.
 * Only genuine incompatibility (no code, empty/undecodable answers, reverts) becomes
 * NOT_VOTING_CONTRACT. RPC and network failures propagate so withRead can retry or rotate.
 */
export async function inspectContract(address) {
  return withRead(async (provider) => {
    const code = await provider.getCode(address);
    if (!code || code === '0x') {
      throw new ChainError('NOT_VOTING_CONTRACT', 'There is no contract at that address on Sepolia.');
    }
    const c = new Contract(address, abi, provider);
    try {
      const [pollCount, stats, maxOptions] = await Promise.all([c.pollCount(), c.getStats(), c.MAX_OPTIONS()]);
      return {
        address: getAddress(address),
        pollCount: Number(pollCount),
        totalVotes: Number(stats[1]),
        maxOptions: Number(maxOptions),
      };
    } catch (err) {
      if (isBadDecode(err) || err?.code === 'CALL_EXCEPTION') {
        throw new ChainError('NOT_VOTING_CONTRACT', 'The contract at that address is not a VotingDApp contract.', err);
      }
      throw err; // network, rate limit, timeout, anything else: let withRead handle it
    }
  });
}

/**
 * Find the block a contract was deployed in by binary search on eth_getCode.
 * Needs an archive-capable RPC; returns 0 when the RPC cannot answer historical queries.
 */
export async function findDeploymentBlock(address) {
  try {
    return await withRead(async (provider) => {
      try {
        let hi = await provider.getBlockNumber();
        if ((await provider.getCode(address, hi)) === '0x') return 0;
        let lo = 0;
        while (lo < hi) {
          const mid = Math.floor((lo + hi) / 2);
          const code = await provider.getCode(address, mid);
          if (code && code !== '0x') hi = mid;
          else lo = mid + 1;
        }
        return lo;
      } catch (err) {
        // "missing trie node" and similar: this RPC has no history, so report unknown (0).
        if (isHistoryUnavailable(err)) return 0;
        throw err;
      }
    });
  } catch (err) {
    if (err?.code === 'NETWORK_UNREACHABLE' || err?.code === 'WRONG_CHAIN') throw err;
    return 0;
  }
}

export function formatPoll(raw) {
  const closedEarly = Boolean(raw.closedEarly);
  return {
    id: Number(raw.id),
    question: raw.question,
    description: raw.description || '',
    options: Array.from(raw.options),
    votes: Array.from(raw.votes).map(Number),
    creator: raw.creator,
    createdAt: Number(raw.createdAt),
    endTime: Number(raw.endTime),
    closedAt: Number(raw.closedAt),
    totalVotes: Number(raw.totalVotes),
    isOpenOnChain: Boolean(raw.isOpen),
    closedEarly,
  };
}

/** Whether a poll accepts votes right now, by the same rule as the contract. */
export function isPollOpen(poll, latestBlockTimestamp = null) {
  if (!poll || poll.closedEarly || poll.isOpenOnChain === false) return false;
  if (latestBlockTimestamp === null || latestBlockTimestamp === undefined) return poll.isOpenOnChain !== false;
  return Number(latestBlockTimestamp) < poll.endTime;
}

const PAGE = 50;
const MAX_COUNT_REREADS = 3; // how many times to re-check pollCount for polls created while paging

/**
 * Loads every poll, one page at a time (no request bursts).
 * - The contract address is captured once, so a contract switch mid-load cannot mix polls
 *   from two contracts.
 * - Each page is its own withRead call, so a failure retries or rotates only that page.
 * - pollCount is re-read after paging; polls created meanwhile are fetched in a further
 *   pass (bounded by MAX_COUNT_REREADS). Polls are de-duplicated by id.
 */
export async function fetchAllPolls() {
  const address = requireContract().address;
  const contractFor = (provider) => new Contract(address, abi, provider);
  const byId = new Map();
  let offset = 0;
  for (let round = 0; round < MAX_COUNT_REREADS; round++) {
    const count = Number(await withRead((provider) => contractFor(provider).pollCount()));
    if (offset >= count) break; // nothing new since the last pass
    while (offset < count) {
      const page = await withRead((provider) => contractFor(provider).getPolls(offset, PAGE));
      if (!page.length) break; // the RPC gave nothing more; the next pass re-checks the count
      for (const raw of page) {
        const poll = formatPoll(raw);
        byId.set(poll.id, poll);
      }
      offset += page.length;
    }
  }
  return Array.from(byId.values());
}

export async function fetchPoll(pollId) {
  return withRead(async (provider) => {
    try {
      return formatPoll(await readContract(provider).getPoll(pollId));
    } catch (err) {
      if (/Poll does not exist/.test(err?.reason || err?.message || '')) {
        throw new ChainError('NOT_FOUND', `Poll #${pollId} does not exist on this contract.`, err);
      }
      throw err;
    }
  });
}

export async function fetchVoterChoice(pollId, address) {
  if (!address) return { voted: false, optionIndex: -1 };
  return withRead(async (provider) => {
    const [voted, optionIndex] = await readContract(provider).getVoterChoice(pollId, address);
    return { voted: Boolean(voted), optionIndex: voted ? Number(optionIndex) : -1 };
  });
}

export async function fetchStats() {
  return withRead(async (provider) => {
    const [totalPolls, totalVotes] = await readContract(provider).getStats();
    return { totalPolls: Number(totalPolls), totalVotes: Number(totalVotes) };
  });
}

export async function fetchLatestBlock() {
  return withRead((provider) => provider.getBlock('latest'));
}

export async function fetchChainId() {
  return withRead(async (provider) => Number.parseInt(await provider.send('eth_chainId', []), 16));
}

// ---------------------------------------------------------------------------
// Event logs
// ---------------------------------------------------------------------------
const TOPICS = {
  PollCreated: votingInterface.getEvent('PollCreated').topicHash,
  Voted: votingInterface.getEvent('Voted').topicHash,
  PollClosed: votingInterface.getEvent('PollClosed').topicHash,
};
const ALL_TOPICS = [TOPICS.PollCreated, TOPICS.Voted, TOPICS.PollClosed];

export function parseLog(log) {
  let parsed;
  try {
    parsed = votingInterface.parseLog({ topics: log.topics, data: log.data });
  } catch {
    return null;
  }
  if (!parsed) return null;
  const base = {
    key: `${log.transactionHash}:${log.index ?? log.logIndex}`,
    txHash: log.transactionHash,
    blockNumber: Number(log.blockNumber),
    logIndex: Number(log.index ?? log.logIndex),
    pollId: Number(parsed.args.pollId),
  };
  switch (parsed.name) {
    case 'PollCreated':
      return {
        ...base,
        type: 'created',
        actor: parsed.args.creator,
        question: parsed.args.question,
        optionCount: Number(parsed.args.optionCount),
        timestamp: Number(parsed.args.createdAt),
        endTime: Number(parsed.args.endTime),
      };
    case 'Voted':
      return {
        ...base,
        type: 'voted',
        actor: parsed.args.voter,
        optionIndex: Number(parsed.args.optionIndex),
        timestamp: Number(parsed.args.timestamp),
      };
    case 'PollClosed':
      return { ...base, type: 'closed', actor: parsed.args.closer, timestamp: Number(parsed.args.timestamp) };
    default:
      return null;
  }
}

/**
 * Pages through a contract's logs, newest first.
 * Keeps an adaptive chunk size because public RPCs cap eth_getLogs block ranges
 * at different sizes (some at 10,000 blocks, some much less).
 */
export class LogIndex {
  constructor({ address, fromBlock, actor = null }) {
    this.address = address;
    this.floor = fromBlock || 0;
    this.floorKnown = Boolean(fromBlock);
    this.actorTopic = actor ? zeroPadValue(getAddress(actor), 32) : null;
    this.chunk = LOG_CHUNK_SIZE;
    this.items = [];
    this.keys = new Set();
    this.oldestScanned = null; // lowest block already covered
    this.newestScanned = null; // highest block already covered
    this.reachedStart = false;
  }

  filter(from, to) {
    const topics = this.actorTopic ? [ALL_TOPICS, null, this.actorTopic] : [ALL_TOPICS];
    return { address: this.address, topics, fromBlock: from, toBlock: to };
  }

  async getRange(from, to) {
    // Try the range; if the RPC refuses it, split it and retry the halves.
    try {
      return await withRead((p) => p.getLogs(this.filter(from, to)), { passRangeErrors: true });
    } catch (err) {
      if (to - from + 1 > 100 && isRangeError(err)) {
        this.chunk = Math.max(500, Math.floor((to - from + 1) / 2));
        const mid = from + Math.floor((to - from) / 2);
        const a = await this.getRange(from, mid);
        const b = await this.getRange(mid + 1, to);
        return a.concat(b);
      }
      throw err;
    }
  }

  add(logs) {
    const fresh = [];
    for (const log of logs) {
      const ev = parseLog(log);
      if (ev && !this.keys.has(ev.key)) {
        this.keys.add(ev.key);
        this.items.push(ev);
        fresh.push(ev);
      }
    }
    this.items.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
    return fresh;
  }

  /** Load events going backwards until at least `want` more are found or the start is reached. */
  async loadOlder(want = 25) {
    if (this.newestScanned === null) {
      const latest = await withRead((p) => p.getBlockNumber());
      if (!this.floorKnown) this.floor = Math.max(0, latest - UNKNOWN_DEPLOY_LOOKBACK);
      this.newestScanned = latest;
      this.oldestScanned = latest + 1;
    }
    const before = this.items.length;
    while (!this.reachedStart && this.items.length - before < want) {
      const to = this.oldestScanned - 1;
      if (to < this.floor) {
        this.reachedStart = true;
        break;
      }
      const from = Math.max(this.floor, to - this.chunk + 1);
      const logs = await this.getRange(from, to);
      this.add(logs);
      this.oldestScanned = from;
      if (from <= this.floor) this.reachedStart = true;
    }
    return this.items;
  }

  /** Fetch events in blocks newer than anything seen so far. Returns only the new ones. */
  async syncNewer(latest) {
    if (this.newestScanned === null) return [];
    const head = latest ?? (await withRead((p) => p.getBlockNumber()));
    if (head <= this.newestScanned) return [];
    const from = this.newestScanned + 1;
    const logs = await this.getRange(from, head);
    this.newestScanned = head;
    return this.add(logs);
  }
}

// ---------------------------------------------------------------------------
// Live watcher: one timer for the whole app, started while anyone is listening.
//
// It reports only NEW events, from the block where it started watching the active
// contract. It never provides history. When the active contract changes, listeners get
// one update with { contractChanged: true, events: [] }: they must reload the poll list
// (fetchAllPolls) and the activity feed (a fresh LogIndex.loadOlder) themselves.
// ---------------------------------------------------------------------------
const watchListeners = new Set();
let watchTimer = null;
let watchIndex = null;
let watchAddress = null;
let lastBlock = null;
let ticking = false;

async function tick() {
  if (ticking) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  const active = getActiveContract();
  ticking = true;
  try {
    const latest = await withRead((p) => p.getBlock('latest'));
    if (!latest) throw new ChainError('NETWORK_UNREACHABLE', 'The latest Sepolia block is unavailable.');
    const blockNumber = Number(latest.number);
    const blockTimestamp = Number(latest.timestamp);

    const address = active?.address ?? null;
    const switched = address !== watchAddress;
    // A contract switch is reported even if no new block arrived since the last tick.
    if (blockNumber === lastBlock && !switched) return;

    let events = [];
    let contractChanged = false;
    if (switched) {
      contractChanged = watchAddress !== null; // false for the very first start
      watchAddress = address;
      watchIndex = null;
      if (active) {
        watchIndex = new LogIndex({ address: active.address, fromBlock: active.deploymentBlock });
        watchIndex.newestScanned = blockNumber; // watch from now; history is loaded elsewhere
        watchIndex.oldestScanned = blockNumber + 1;
      }
    } else if (watchIndex) {
      events = await watchIndex.syncNewer(blockNumber);
    }
    // Only mark the block as handled after its events were synced, so a failed sync is retried.
    lastBlock = blockNumber;
    watchListeners.forEach((l) => {
      try {
        l({ blockNumber, blockTimestamp, events, contractChanged });
      } catch (err) {
        console.error(err);
      }
    });
  } catch (err) {
    watchListeners.forEach((l) => {
      try {
        l({ error: err });
      } catch {
        /* ignore */
      }
    });
  } finally {
    ticking = false;
  }
}

/**
 * Subscribe to new blocks and new PollCreated / Voted / PollClosed events.
 * Returns an unsubscribe function; the timer stops when nobody is listening.
 */
export function watchChain(listener) {
  watchListeners.add(listener);
  if (!watchTimer) {
    tick();
    watchTimer = setInterval(tick, POLL_INTERVAL_MS);
  }
  return () => {
    watchListeners.delete(listener);
    if (watchListeners.size === 0 && watchTimer) {
      clearInterval(watchTimer);
      watchTimer = null;
    }
  };
}

/** Force an immediate check (after the user's own transaction, for example). */
export function pokeWatcher() {
  return tick();
}

export function resetWatcher() {
  watchIndex = null;
  watchAddress = null;
  lastBlock = null;
}

export { TOPICS };
