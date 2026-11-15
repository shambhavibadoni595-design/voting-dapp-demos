import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as ballot from '../services/votingService.js';
import { routePathFromHash, shouldNavigateToCreateAfterConnect } from '../lib/connectNavigation.js';
import { navigate } from '../lib/router.js';

const BallotContext = createContext(null);

export function BallotProvider({ children }) {
  const [walletState, setWalletState] = useState(ballot.getWalletState());
  const [wallets, setWallets] = useState([]);
  const [contract, setContract] = useState(ballot.getActiveContract());
  const [polls, setPolls] = useState([]);
  const [pollsStatus, setPollsStatus] = useState(contract ? 'loading' : 'no-contract');
  const [pollsError, setPollsError] = useState(null);
  const [stats, setStats] = useState(null);
  const [latestBlock, setLatestBlock] = useState(null);
  const [latestBlockTime, setLatestBlockTime] = useState(null);
  const [chainError, setChainError] = useState(null);
  const [myVotes, setMyVotes] = useState({});
  const [lastEvents, setLastEvents] = useState({ seq: 0, events: [] });
  const [toasts, setToasts] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [txBusy, setTxBusy] = useState(false);
  const loadSeq = useRef(0);
  const connectRoute = useRef(null);

  const toast = useCallback((message, tone = 'neutral') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  // Wallet discovery and state
  useEffect(() => {
    ballot.startWalletDiscovery();
    const offWallets = ballot.onWalletsDiscovered(setWallets);
    const offState = ballot.onWalletChange((s) => setWalletState({ ...s }));
    const t = setTimeout(() => ballot.restoreConnection(), 800);
    return () => {
      offWallets();
      offState();
      clearTimeout(t);
    };
  }, []);

  useEffect(() => ballot.onActiveContractChange(setContract), []);

  const refreshPolls = useCallback(async () => {
    if (!ballot.getActiveContract()) {
      setPolls([]);
      setStats(null);
      setPollsStatus('no-contract');
      return;
    }
    const seq = ++loadSeq.current;
    try {
      const list = await ballot.getAllPolls();
      const s = await ballot.getStats(list);
      if (seq !== loadSeq.current) return;
      setPolls(list);
      setStats(s);
      setPollsStatus('ready');
      setPollsError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setPollsError(err);
      setPollsStatus('error');
    }
  }, []);

  // Load polls whenever the active contract changes
  useEffect(() => {
    setPolls([]);
    setStats(null);
    setMyVotes({});
    setPollsStatus(contract ? 'loading' : 'no-contract');
    refreshPolls();
  }, [contract, refreshPolls]);

  // Live updates: new blocks and contract events
  useEffect(() => {
    let lastFull = Date.now();
    const off = ballot.watchChain(({ blockNumber, blockTimestamp, events, error }) => {
      if (error) {
        setChainError(error);
        return;
      }
      setChainError(null);
      setLatestBlock(blockNumber);
      setLatestBlockTime(blockTimestamp);
      if (events && events.length) {
        setLastEvents((prev) => ({ seq: prev.seq + 1, events }));
        refreshPolls();
        lastFull = Date.now();
      } else if (Date.now() - lastFull > 60000) {
        refreshPolls(); // picks up polls that expired by time (no event is emitted for that)
        lastFull = Date.now();
      }
    });
    return off;
  }, [refreshPolls]);

  // Which polls the connected wallet voted on
  const address = walletState.address;
  const refreshMyVotes = useCallback(
    async (ids) => {
      if (!address || !ballot.getActiveContract()) {
        setMyVotes({});
        return;
      }
      const list = ids || polls.map((p) => p.id);
      try {
        const results = await Promise.all(list.map((id) => ballot.getVoterChoice(id, address)));
        setMyVotes((prev) => {
          const next = { ...prev };
          list.forEach((id, i) => {
            next[id] = results[i];
          });
          return next;
        });
      } catch {
        /* non-fatal: polls still show */
      }
    },
    [address, polls]
  );

  useEffect(() => {
    setMyVotes({});
  }, [address]);

  useEffect(() => {
    if (address && polls.length) refreshMyVotes();
  }, [address, polls, refreshMyVotes]);

  const finishUserConnect = useCallback(() => {
    const routeAtStart = connectRoute.current;
    connectRoute.current = null;
    const connectedWallet = ballot.getWalletState();
    const shouldNavigate = shouldNavigateToCreateAfterConnect({
      userInitiated: routeAtStart !== null,
      routeAtStart,
      routeAtCompletion: routePathFromHash(window.location.hash),
      connected: connectedWallet.status === 'connected',
      isSepolia: connectedWallet.isSepolia,
      hasDefaultContract: Boolean(ballot.getSiteDefaultContract()),
    });
    if (shouldNavigate) navigate('/create');
  }, []);

  const requestConnect = useCallback(async () => {
    connectRoute.current = routePathFromHash(window.location.hash);
    const list = ballot.listWallets();
    if (list.length === 1) {
      try {
        await ballot.connectWallet(list[0]);
        finishUserConnect();
      } catch (err) {
        connectRoute.current = null;
        toast(err.message, 'error');
      }
    } else {
      setPickerOpen(true);
    }
  }, [finishUserConnect, toast]);

  const value = useMemo(
    () => ({
      wallet: walletState,
      wallets,
      contract,
      polls,
      pollsStatus,
      pollsError,
      stats,
      latestBlock,
      latestBlockTime,
      chainError,
      myVotes,
      lastEvents,
      toasts,
      pickerOpen,
      txBusy,
      setTxBusy,
      setPickerOpen,
      toast,
      dismissToast,
      refreshPolls,
      refreshMyVotes,
      requestConnect,
      finishUserConnect,
    }),
    [
      walletState,
      wallets,
      contract,
      polls,
      pollsStatus,
      pollsError,
      stats,
      latestBlock,
      latestBlockTime,
      chainError,
      myVotes,
      lastEvents,
      toasts,
      pickerOpen,
      txBusy,
      toast,
      dismissToast,
      refreshPolls,
      refreshMyVotes,
      requestConnect,
      finishUserConnect,
    ]
  );

  return <BallotContext.Provider value={value}>{children}</BallotContext.Provider>;
}

export function useBallot() {
  const ctx = useContext(BallotContext);
  if (!ctx) throw new Error('useBallot must be used inside BallotProvider');
  return ctx;
}

/**
 * Track one transaction's lifecycle for a component.
 * run(fn) calls fn(onStatus) and keeps { status, hash, error, preflight, record } current.
 */
export function useTransaction() {
  const { setTxBusy } = useBallot();
  const [state, setState] = useState({ status: 'idle' });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (fn) => {
      setTxBusy(true);
      setState({ status: 'checking' });
      try {
        const result = await fn((update) => {
          if (mounted.current) setState((prev) => ({ ...prev, ...update }));
        });
        return result;
      } catch (err) {
        if (mounted.current) {
          setState((prev) => {
            if (err.code === 'READ_NOT_READY' && prev.status === 'confirmed') {
              return { ...prev, freshnessError: err };
            }
            const status =
              err.code === 'REJECTED'
                ? 'rejected'
                : err.code === 'CANCELLED'
                  ? 'cancelled'
                  : err.code === 'INSUFFICIENT_FUNDS'
                    ? 'insufficient'
                    : 'failed';
            return {
              ...prev,
              status,
              error: err,
              preflight: err.preflight || prev.preflight,
              hash: err.hash || prev.hash,
            };
          });
        }
        return null;
      } finally {
        setTxBusy(false);
      }
    },
    [setTxBusy]
  );

  const reset = useCallback(() => setState({ status: 'idle' }), []);
  return { tx: state, run, reset };
}
