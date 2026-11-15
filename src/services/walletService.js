/**
 * walletService — wallet discovery, connection, account/network tracking.
 *
 * - Discovers browser wallets with EIP-6963 (MetaMask, Rabby, Coinbase Wallet, Brave…),
 *   and falls back to the legacy injected window.ethereum provider.
 * - Never simulates a connection: the address always comes from the wallet itself.
 * - Never asks for, reads or stores a private key or recovery phrase.
 */
import { BrowserProvider, getAddress } from 'ethers';
import { SEPOLIA } from '../config/contractConfig.js';
import { withRead } from './contractService.js';

const REMEMBER_KEY = 'ballot.wallet.v1';

export class WalletError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'WalletError';
    this.code = code; // NO_WALLET | REJECTED | PENDING | WRONG_NETWORK | NOT_CONNECTED | UNKNOWN
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// EIP-6963 discovery
// ---------------------------------------------------------------------------
const discovered = new Map(); // uuid -> { info, provider }
const discoveryListeners = new Set();
let discoveryStarted = false;

function legacyInjected() {
  if (typeof window === 'undefined' || !window.ethereum) return null;
  const eth = window.ethereum;
  return {
    info: {
      uuid: 'legacy-injected',
      name: eth.isMetaMask ? 'MetaMask' : eth.isRabby ? 'Rabby' : eth.isCoinbaseWallet ? 'Coinbase Wallet' : 'Browser wallet',
      icon: '',
      rdns: 'injected',
    },
    provider: eth,
    legacy: true,
  };
}

export function listWallets() {
  const list = Array.from(discovered.values());
  if (list.length === 0) {
    const legacy = legacyInjected();
    if (legacy) list.push(legacy);
  }
  return list;
}

function emitDiscovery() {
  const list = listWallets();
  discoveryListeners.forEach((l) => l(list));
}

export function startWalletDiscovery() {
  if (discoveryStarted || typeof window === 'undefined') return;
  discoveryStarted = true;
  window.addEventListener('eip6963:announceProvider', (event) => {
    const { info, provider } = event.detail || {};
    if (!info?.uuid || !provider) return;
    discovered.set(info.uuid, { info, provider });
    emitDiscovery();
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  // Some wallets inject late; ask again shortly after load.
  setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 600);
  setTimeout(emitDiscovery, 700);
}

export function onWalletsDiscovered(listener) {
  discoveryListeners.add(listener);
  listener(listWallets());
  return () => discoveryListeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------
const initialState = Object.freeze({
  status: 'disconnected', // disconnected | connecting | connected
  address: null,
  chainId: null,
  isSepolia: false,
  balanceWei: null,
  balanceError: null,
  walletName: '',
  walletIcon: '',
});

let state = { ...initialState };
let raw = null; // EIP-1193 provider of the connected wallet
let rawHandlers = null;
const stateListeners = new Set();

function stateSnapshot(source = state) {
  return {
    ...source,
    balanceWei: source.balanceWei === null ? null : source.balanceWei.toString(),
  };
}

function setState(patch) {
  state = { ...state, ...patch };
  state.isSepolia = state.chainId === SEPOLIA.chainId;
  stateListeners.forEach((l) => {
    try {
      l(stateSnapshot());
    } catch (err) {
      console.error(err);
    }
  });
}

export function getWalletState() {
  return stateSnapshot();
}

export function onWalletStateChange(listener) {
  stateListeners.add(listener);
  listener(stateSnapshot());
  return () => stateListeners.delete(listener);
}

export function getActiveAddress() {
  return state.address;
}

function isRejection(err) {
  const code = err?.code ?? err?.error?.code ?? err?.info?.error?.code;
  return code === 4001 || code === 'ACTION_REJECTED' || /user (rejected|denied)/i.test(err?.message || '');
}

function attach(provider, info) {
  detach();
  raw = provider;
  const onAccounts = (accounts) => {
    if (!accounts || accounts.length === 0) {
      teardown();
      return;
    }
    setState({ address: getAddress(accounts[0]), balanceWei: null });
    refreshBalance();
  };
  const onChain = (chainIdHex) => {
    setState({ chainId: Number.parseInt(chainIdHex, 16) });
  };
  const onDisconnect = () => teardown();
  if (typeof provider.on === 'function') {
    provider.on('accountsChanged', onAccounts);
    provider.on('chainChanged', onChain);
    provider.on('disconnect', onDisconnect);
  }
  rawHandlers = { onAccounts, onChain, onDisconnect };
  setState({ walletName: info?.name || 'Wallet', walletIcon: info?.icon || '' });
}

function detach() {
  if (raw && rawHandlers && typeof raw.removeListener === 'function') {
    raw.removeListener('accountsChanged', rawHandlers.onAccounts);
    raw.removeListener('chainChanged', rawHandlers.onChain);
    raw.removeListener('disconnect', rawHandlers.onDisconnect);
  }
  raw = null;
  rawHandlers = null;
}

function teardown() {
  detach();
  forget();
  state = { ...initialState };
  setState({});
}

function remember(info) {
  try {
    window.localStorage.setItem(REMEMBER_KEY, JSON.stringify({ uuid: info?.uuid, rdns: info?.rdns, name: info?.name }));
  } catch {
    /* ignore */
  }
}

function forget() {
  try {
    window.localStorage.removeItem(REMEMBER_KEY);
  } catch {
    /* ignore */
  }
}

async function readChainId(provider) {
  const hex = await provider.request({ method: 'eth_chainId' });
  return Number.parseInt(hex, 16);
}

/**
 * Ask a wallet for access. Opens the wallet's own approval prompt.
 * @param {{info, provider}} [wallet] one of listWallets(); defaults to the first found.
 */
export async function connectWallet(wallet) {
  const choice = wallet || listWallets()[0];
  if (!choice) {
    throw new WalletError(
      'NO_WALLET',
      'No browser wallet found. Install MetaMask (or another Ethereum wallet extension) and reload this page.'
    );
  }
  setState({ status: 'connecting' });
  try {
    const accounts = await choice.provider.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      throw new WalletError('REJECTED', 'The wallet did not share an account.');
    }
    attach(choice.provider, choice.info);
    const chainId = await readChainId(choice.provider);
    setState({ status: 'connected', address: getAddress(accounts[0]), chainId });
    remember(choice.info);
    refreshBalance();
    return stateSnapshot();
  } catch (err) {
    setState({ status: state.address ? 'connected' : 'disconnected' });
    if (err instanceof WalletError) throw err;
    if (isRejection(err)) throw new WalletError('REJECTED', 'You declined the connection request in your wallet.', err);
    if (err?.code === -32002) {
      throw new WalletError('PENDING', 'Your wallet already has a request waiting. Open the wallet extension to answer it.', err);
    }
    throw new WalletError('UNKNOWN', err?.message || 'Could not connect to the wallet.', err);
  }
}

/** Reconnect silently (no prompt) if this browser connected before and the wallet still allows it. */
export async function restoreConnection() {
  let saved = null;
  try {
    saved = JSON.parse(window.localStorage.getItem(REMEMBER_KEY) || 'null');
  } catch {
    saved = null;
  }
  if (!saved) return null;
  const list = listWallets();
  const match = list.find((w) => w.info.uuid === saved.uuid) || list.find((w) => w.info.rdns === saved.rdns) || null;
  if (!match) return null;
  try {
    const accounts = await match.provider.request({ method: 'eth_accounts' });
    if (!accounts || accounts.length === 0) return null;
    attach(match.provider, match.info);
    const chainId = await readChainId(match.provider);
    setState({ status: 'connected', address: getAddress(accounts[0]), chainId });
    refreshBalance();
    return stateSnapshot();
  } catch {
    return null;
  }
}

/**
 * Disconnect this site. Where the wallet supports it (MetaMask does), the site's
 * permission is revoked so the next visit asks again.
 */
export async function disconnectWallet() {
  const provider = raw;
  if (provider) {
    try {
      await provider.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
    } catch {
      // Not every wallet supports revoking; the site still forgets the connection.
    }
  }
  teardown();
}

/** Ask the wallet to switch to Sepolia, adding the network first if the wallet does not know it. */
export async function switchToSepolia() {
  if (!raw) throw new WalletError('NOT_CONNECTED', 'Connect a wallet first.');
  try {
    await raw.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: SEPOLIA.chainIdHex }] });
  } catch (err) {
    const code = err?.code ?? err?.data?.originalError?.code;
    if (code === 4902 || /unrecognized chain|not been added|unknown chain/i.test(err?.message || '')) {
      try {
        await raw.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: SEPOLIA.chainIdHex,
              chainName: SEPOLIA.name,
              nativeCurrency: SEPOLIA.nativeCurrency,
              rpcUrls: SEPOLIA.walletRpcUrls,
              blockExplorerUrls: [SEPOLIA.explorer],
            },
          ],
        });
      } catch (addErr) {
        if (isRejection(addErr)) throw new WalletError('REJECTED', 'You declined adding Sepolia to your wallet.', addErr);
        throw new WalletError('UNKNOWN', addErr?.message || 'Could not add Sepolia to the wallet.', addErr);
      }
    } else if (isRejection(err)) {
      throw new WalletError('REJECTED', 'You declined the network switch. Demos only works on Sepolia.', err);
    } else {
      throw new WalletError('UNKNOWN', err?.message || 'Could not switch network.', err);
    }
  }
  const chainId = await readChainId(raw);
  setState({ chainId });
  if (chainId !== SEPOLIA.chainId) {
    throw new WalletError('WRONG_NETWORK', 'Your wallet is still on another network. Switch to Sepolia in the wallet.');
  }
  refreshBalance();
}

/** Re-read the connected address's Sepolia ETH balance from the public RPC. */
export async function refreshBalance() {
  const address = state.address;
  if (!address) return null;
  try {
    const wei = BigInt(await withRead((provider) => provider.send('eth_getBalance', [address, 'latest'])));
    if (state.address === address) setState({ balanceWei: wei, balanceError: null });
    return wei.toString();
  } catch (err) {
    setState({ balanceError: 'Could not read balance' });
    throw err;
  }
}

/** A signer for the connected account, created fresh so it always reflects the current network. */
export async function getSigner() {
  if (!raw || !state.address) throw new WalletError('NOT_CONNECTED', 'Connect a wallet first.');
  const provider = new BrowserProvider(raw, 'any');
  return provider.getSigner(state.address);
}

export function getRawProvider() {
  return raw;
}

export { isRejection };
