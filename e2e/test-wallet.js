/**
 * TEST-ONLY browser wallet for the local end-to-end rehearsal.
 *
 * It behaves like an EIP-1193 wallet (announced through EIP-6963), but instead of
 * asking a human it forwards requests to a local Hardhat node whose accounts are
 * unlocked. It exists only so the real website code can be driven headlessly.
 * It is injected by e2e/run-local.mjs and is never bundled into the app.
 *
 * Hooks for tests, on window.__testWallet:
 *   rejectNextTx, rejectConnect, rejectSwitch  – make the next request fail with code 4001
 *   switchAccount(addr)                         – emits accountsChanged
 *   setChain(id)                                – emits chainChanged
 *   log                                         – list of methods requested
 */
export function testWalletScript({ rpcUrl, account, chainId }) {
  return `(() => {
  const RPC = ${JSON.stringify(rpcUrl)};
  const SEPOLIA = 11155111;
  const listeners = {};
  const state = { accounts: [], selected: ${JSON.stringify(account)}, chainId: ${Number(chainId)},
    rejectNextTx: false, rejectConnect: false, rejectSwitch: false, log: [] };
  window.__testWallet = state;
  let id = 0;
  const reject = (msg) => { const e = new Error(msg); e.code = 4001; return e; };
  async function rpc(method, params) {
    const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params: params || [] }) });
    const json = await res.json();
    if (json.error) { const e = new Error(json.error.message); e.code = json.error.code; e.data = json.error.data; throw e; }
    return json.result;
  }
  function emit(ev, arg) { (listeners[ev] || []).slice().forEach((f) => { try { f(arg); } catch (e) { console.error(e); } }); }
  const provider = {
    isMetaMask: false,
    async request({ method, params }) {
      state.log.push(method);
      switch (method) {
        case 'eth_requestAccounts':
          if (state.rejectConnect) { state.rejectConnect = false; throw reject('User rejected the request.'); }
          state.accounts = [state.selected];
          return state.accounts.slice();
        case 'eth_accounts': return state.accounts.slice();
        case 'eth_chainId': return '0x' + state.chainId.toString(16);
        case 'net_version': return String(state.chainId);
        case 'wallet_switchEthereumChain': {
          if (state.rejectSwitch) { state.rejectSwitch = false; throw reject('User rejected the request.'); }
          const target = parseInt(params[0].chainId, 16);
          if (target !== SEPOLIA) { const e = new Error('Unrecognized chain ID'); e.code = 4902; throw e; }
          state.chainId = target; emit('chainChanged', params[0].chainId); return null;
        }
        case 'wallet_addEthereumChain': return null;
        case 'wallet_revokePermissions': state.accounts = []; return null;
        case 'eth_sendTransaction':
          if (state.chainId !== SEPOLIA) { const e = new Error('Wallet is not on Sepolia'); e.code = -32000; throw e; }
          if (state.rejectNextTx) { state.rejectNextTx = false; throw reject('MetaMask Tx Signature: User denied transaction signature.'); }
          return rpc(method, params);
        default:
          return rpc(method, params);
      }
    },
    on(ev, f) { (listeners[ev] = listeners[ev] || []).push(f); return provider; },
    removeListener(ev, f) { listeners[ev] = (listeners[ev] || []).filter((x) => x !== f); return provider; },
  };
  state.switchAccount = (a) => { state.selected = a; if (state.accounts.length) { state.accounts = [a]; emit('accountsChanged', [a]); } };
  state.setChain = (c) => { state.chainId = c; emit('chainChanged', '0x' + c.toString(16)); };
  const info = Object.freeze({ uuid: '6f1c3c0e-e2e0-4a11-9d00-ba11075e2e00', name: 'Test wallet (local)', rdns: 'local.ballot.testwallet',
    icon: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#1f2328"/><path d="M6 12.5l4 4 8-9" stroke="#fff" stroke-width="2.4" fill="none"/></svg>') });
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
  window.addEventListener('eip6963:requestProvider', announce);
  window.ethereum = provider;
  announce();
})();`;
}
