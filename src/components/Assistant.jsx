import React, { useEffect, useRef, useState } from 'react';

const TOUR_KEY = 'demos.tutorial.v1';
const STEPS = [
  {
    title: 'Welcome to Demos',
    message: 'Demos is a community polling app. Browse questions, cast one vote per wallet, and follow results recorded on the blockchain.',
    route: '#/',
    target: 'home-hero',
    bubble: 'Welcome to Demos!',
  },
  {
    title: 'Connect your wallet',
    message: 'Connect MetaMask or another browser wallet when you are ready to vote or create a poll. Choose Ethereum Sepolia in your wallet; Demos never sees your keys.',
    route: '#/wallet',
    target: 'wallet-action',
    bubble: 'Wallets stay in your control.',
  },
  {
    title: 'Explore polls',
    message: 'Browse all polls or filter to open and closed ones. Open a poll to read its question, answer choices, deadline, and current results.',
    route: '#/polls',
    target: 'poll-filters',
    bubble: 'Find a poll to explore.',
  },
  {
    title: 'Create a poll',
    message: 'Write a clear question, add 2–10 answer options, then choose how long the poll stays open. Your wallet asks you to confirm its creation transaction.',
    route: '#/create',
    target: 'poll-question',
    bubble: 'Your question starts here.',
  },
  {
    title: 'Cast your vote',
    message: 'Open an available poll, choose one answer, and confirm the transaction in MetaMask on Sepolia. Each wallet can vote once per poll.',
    route: '#/polls?filter=open',
    target: 'poll-list',
    bubble: 'One choice, one vote.',
  },
  {
    title: 'View results',
    message: 'Open a poll to compare the vote counts and percentages beside each answer. Closed polls keep their final results available.',
    route: '#/polls?filter=closed',
    target: 'poll-list',
    bubble: 'See how the votes add up.',
  },
  {
    title: 'Activity & receipts',
    message: 'Activity lists poll and vote transactions. Use a vote’s receipt link to review its choice, block, timestamp, wallet, and transaction hash.',
    route: '#/activity',
    target: 'activity-feed',
    bubble: 'Every vote leaves a receipt.',
  },
  {
    title: 'Smart contract',
    message: 'Link an existing VotingDApp contract to read its polls, or deploy a new one to start a separate set. Deployment and poll creation require wallet confirmation.',
    route: '#/contract',
    target: 'contract-setup',
    bubble: 'The contract keeps the record.',
  },
];

function readTourState() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(TOUR_KEY) || 'null');
    if (stored && ['in-progress', 'completed', 'skipped'].includes(stored.status)) {
      return {
        status: stored.status,
        step: Number.isInteger(stored.step) ? Math.min(Math.max(stored.step, 0), STEPS.length - 1) : 0,
      };
    }
  } catch {
    // Keep the tour available when storage is disabled or contains invalid data.
  }
  return { status: 'new', step: 0 };
}

function getStepForRoute(route) {
  const page = route.segments[0] || '';
  if (!page) return 0;
  if (page === 'wallet') return 1;
  if (page === 'polls') {
    if (route.query.filter === 'closed') return 5;
    if (route.query.filter === 'open') return 4;
    return 2;
  }
  if (page === 'create') return 3;
  if (page === 'poll') return 4;
  if (page === 'activity' || page === 'receipt') return 6;
  if (page === 'contract') return 7;
  return null;
}

function getGuidance(route) {
  const page = route.segments[0] || '';
  if (!page) {
    return {
      title: 'Welcome to Demos',
      message: 'Explore a poll, cast one vote with your wallet, and follow the results recorded on-chain.',
      bubble: 'Welcome to Demos!',
    };
  }
  if (page === 'create') {
    return {
      title: 'Creating a poll',
      message: 'Write a clear question, add 2–10 answer options, choose a duration, then connect a Sepolia wallet and confirm the transaction.',
      bubble: 'Ready to create a poll?',
    };
  }
  if (page === 'poll') {
    return {
      title: 'Poll details & results',
      message: 'Choose one answer and confirm with your wallet. Each address can vote once per poll. The bars show each option’s vote count and share; after the poll closes, the results are final.',
      bubble: 'Need help with this poll?',
    };
  }
  if (page === 'polls') {
    return {
      title: route.query.filter === 'closed' ? 'Reading poll results' : 'Finding a poll',
      message: route.query.filter === 'closed'
        ? 'Closed polls keep their results available. Compare the counts and percentages beside each answer; the contract remains the source of truth.'
        : 'Browse all polls or filter to open and closed polls. Open a poll to see its answer choices and results.',
      bubble: 'Explore polls and results',
    };
  }
  if (page === 'wallet') {
    return {
      title: 'Your wallet',
      message: 'Connect a browser wallet to vote or create polls. Demos needs Ethereum Sepolia; your wallet approves each transaction and keeps your keys.',
      bubble: 'Wallet help',
    };
  }
  if (page === 'contract') {
    return {
      title: 'Contracts on Sepolia',
      message: 'Deploy a new VotingDApp contract from a connected Sepolia wallet, or link an existing contract by address. Linking lets Demos read its polls; it does not change the contract.',
      bubble: 'Contract setup help',
    };
  }
  if (page === 'activity' || page === 'receipt') {
    return {
      title: 'Activity & receipts',
      message: 'Follow poll and vote transactions in Activity. Vote receipts include the choice, block, timestamp, wallet, and transaction hash.',
      bubble: 'Track votes and receipts',
    };
  }
  return {
    title: 'Demos assistant',
    message: 'Demos polls are read from the blockchain. You can browse without connecting a wallet; a wallet on Sepolia is needed to vote or create a poll.',
    bubble: 'How can I help?',
  };
}

function TechCat({ mood = 'explaining' }) {
  return (
    <svg className="tech-cat" viewBox="0 0 76 76" data-expression={mood} aria-hidden="true">
      <path className="tech-cat-shadow" d="M13 68h50" />
      <path className="tech-cat-tail" d="M49 57c12 7 19 1 17-7-1-3-4-4-6-2" />
      <path className="tech-cat-body" d="M23 47c-6 4-8 12-7 19h44c1-8-2-15-8-19" />
      <path className="tech-cat-paw" d="M27 58v7m21-7v7" />
      <g className="tech-cat-ears">
        <path className="tech-cat-ear tech-cat-ear-left" d="M18 34 20 9c0-2 2-3 4-1l15 15" />
        <path className="tech-cat-ear-inner" d="m23 15-1 12 10-5" />
        <path className="tech-cat-ear tech-cat-ear-right" d="m38 23 14-15c2-2 4-1 4 1l2 25" />
        <path className="tech-cat-ear-inner" d="m51 15 1 12-10-5" />
      </g>
      <path className="tech-cat-head" d="M17 33c0-12 8-18 21-18s21 6 21 18v9c0 12-9 18-21 18s-21-6-21-18v-9Z" />
      <path className="tech-cat-whiskers" d="M25 43 12 40m13 7-12 2m38-6 13-3m-13 7 12 2" />
      <path className="tech-cat-eyes" d="M27 37c2-3 5-3 7 0m8 0c2-3 5-3 7 0" />
      <path className="tech-cat-nose" d="m35 43 3 2 3-2-3-2-3 2Z" />
      <path className="tech-cat-mouth cat-mouth-greeting" d="M34 48c2 4 6 4 8 0" />
      <path className="tech-cat-mouth cat-mouth-explaining" d="M35 49h6" />
      <path className="tech-cat-mouth cat-mouth-loading" d="M35 50c2-2 4-2 6 0" />
      <path className="tech-cat-mouth cat-mouth-complete" d="M33 48c2 5 8 5 10 0" />
      <path className="tech-cat-circuit" d="M34 26h-4v3m12-3h4v3m-6-4v4" />
      <circle className="tech-cat-led" cx="38" cy="27" r="1.5" />
      <path className="tech-cat-sparkle" d="M62 24v5m-2.5-2.5h5" />
      <path className="tech-cat-orbit" d="M58 31a7 7 0 1 1-2 10" />
    </svg>
  );
}

function getTourTarget(step, route) {
  if (step === 1) return ['wallet-action', 'wallet-connect'];
  if (step === 4 && route.segments[0] !== 'poll') return ['poll-list', 'poll-filters'];
  if (step === 5 && route.segments[0] !== 'poll') return ['poll-list', 'poll-filters'];
  if (step === 6) return ['activity-feed', 'activity-page'];
  if (step === 4 && route.segments[0] === 'poll') {
    return ['vote-options', 'vote-action', 'poll-details'];
  }
  if (step === 5 && route.segments[0] === 'poll') {
    return ['poll-results', 'poll-details'];
  }
  return [STEPS[step].target];
}

function getNavigationBlocker() {
  if (document.querySelector('.modal-backdrop')) {
    return 'Finish with the wallet selection before moving to another tutorial page.';
  }
  if (document.querySelector('[data-tour-target="wallet-connect"]:disabled')) {
    return 'Your wallet is connecting. Wait for it to finish before moving to another tutorial page.';
  }
  const pendingTransaction = document.querySelector(
    '.tx-progress:not(.is-done):not(.is-failed):not(.is-rejected):not(.is-cancelled)'
  );
  if (pendingTransaction) {
    return 'Your wallet transaction is in progress. Finish or cancel it before moving to another tutorial page.';
  }
  const form = document.querySelector('.create-form');
  const changedInput = form && [...form.querySelectorAll('input, textarea, select')]
    .some((input) => input.value !== input.defaultValue);
  const addedAnswer = form?.querySelectorAll('.option-inputs input').length > 2;
  const durationTabs = form?.querySelectorAll('.segmented[role="tablist"] button[role="tab"]');
  const changedDurationMode = durationTabs?.length && durationTabs[0].getAttribute('aria-selected') !== 'true';
  if (changedInput || addedAnswer || changedDurationMode) {
    return 'You have a poll draft on this page. Finish it or copy your text before moving to another tutorial step.';
  }
  return '';
}

export function Assistant({ route }) {
  const [tour, setTour] = useState(readTourState);
  const [open, setOpen] = useState(() => {
    const initial = readTourState();
    return initial.status === 'new' || initial.status === 'in-progress';
  });
  const [panelMounted, setPanelMounted] = useState(() => {
    const initial = readTourState();
    return initial.status === 'new' || initial.status === 'in-progress';
  });
  const [notice, setNotice] = useState('');
  const [reacting, setReacting] = useState(false);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const pendingStep = useRef(null);
  const launcherRef = useRef(null);
  const reactionTimer = useRef(null);
  const tourActive = tour.status === 'new' || tour.status === 'in-progress';
  const context = getGuidance(route);
  const currentStep = STEPS[tour.step] || STEPS[0];
  const mood = reacting
    ? 'reacting'
    : tourActive
      ? 'explaining'
      : tour.status === 'completed'
        ? 'complete'
        : 'greeting';

  const saveTour = (next) => {
    setTour(next);
    try {
      window.localStorage.setItem(TOUR_KEY, JSON.stringify(next));
    } catch {
      setNotice('Tutorial progress could not be saved in this browser.');
    }
  };

  const react = () => {
    setReacting(true);
    window.clearTimeout(reactionTimer.current);
    reactionTimer.current = window.setTimeout(() => setReacting(false), 650);
  };

  const closePanel = () => {
    setOpen(false);
    window.requestAnimationFrame(() => launcherRef.current?.focus());
  };

  const goToStep = (index, { force = false } = {}) => {
    if (!force) {
      const blocker = getNavigationBlocker();
      if (blocker) {
        setNotice(blocker);
        return;
      }
    }
    setNotice('');
    if (index >= STEPS.length) {
      saveTour({ status: 'completed', step: STEPS.length - 1 });
      setOpen(true);
      return;
    }
    const safeIndex = Math.max(0, index);
    const nextTour = { status: 'in-progress', step: safeIndex };
    saveTour(nextTour);
    setOpen(true);
    const destination = STEPS[safeIndex].route;
    const currentRoute = `${route.path}${route.query.filter ? `?filter=${route.query.filter}` : ''}`;
    if (currentRoute !== destination.slice(1)) {
      pendingStep.current = safeIndex;
      window.location.hash = destination.slice(1);
    } else {
      pendingStep.current = null;
    }
  };

  const startTour = () => {
    const blocker = getNavigationBlocker();
    if (blocker) {
      setNotice(blocker);
      return;
    }
    goToStep(0, { force: true });
  };

  const skipTour = () => {
    saveTour({ status: 'skipped', step: tour.step });
    setOpen(false);
    setNotice('');
    window.requestAnimationFrame(() => launcherRef.current?.focus());
  };

  useEffect(() => {
    if (!tourActive) return;
    const matchedStep = getStepForRoute(route);
    if (pendingStep.current !== null) {
      if (matchedStep === pendingStep.current) {
        pendingStep.current = null;
        setNotice('');
      }
      return;
    }
    if (matchedStep !== null && matchedStep !== tour.step) {
      const next = { status: 'in-progress', step: matchedStep };
      setNotice('');
      setTour(next);
      try {
        window.localStorage.setItem(TOUR_KEY, JSON.stringify(next));
      } catch {
        setNotice('Tutorial progress could not be saved in this browser.');
      }
    }
  }, [route.path, route.query.filter, tourActive, tour.step]);

  useEffect(() => {
    if (!tourActive) return undefined;
    const target = getTourTarget(tour.step, route)
      .map((name) => document.querySelector(`[data-tour-target="${name}"]`))
      .find(Boolean);
    if (!target) return undefined;
    target.setAttribute('data-tour-highlight', 'true');
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start', inline: 'nearest' });
    return () => target.removeAttribute('data-tour-highlight');
  }, [route.path, route.query.filter, tour.step, tourActive]);

  useEffect(() => {
    if (open || tourActive || tour.status === 'new' || tour.status === 'in-progress') return undefined;
    try {
      if (window.sessionStorage.getItem('demos.assistant.bubble-seen') === '1') return undefined;
    } catch {
      return undefined;
    }
    setBubbleVisible(true);
    const timer = window.setTimeout(() => {
      setBubbleVisible(false);
      try {
        window.sessionStorage.setItem('demos.assistant.bubble-seen', '1');
      } catch {
        // The bubble remains dismissible even when session storage is unavailable.
      }
    }, 6500);
    return () => window.clearTimeout(timer);
  }, [open, tourActive, tour.status]);

  useEffect(() => {
    if (open) {
      setPanelMounted(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setPanelMounted(false), 180);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => () => window.clearTimeout(reactionTimer.current), []);

  return (
    <aside
      id="demos-assistant"
      className={`assistant ${open ? 'is-open' : ''} ${reacting ? 'is-reacting' : ''}`}
      data-mood={tourActive && pendingStep.current !== null ? 'loading' : mood}
      aria-label="Demos tech cat assistant"
    >
      {panelMounted && (
        <section
          className={`assistant-panel ${open ? 'is-visible' : 'is-closing'}`}
          aria-hidden={!open}
          aria-labelledby="assistant-title"
          aria-describedby="assistant-message"
        >
          <header className="assistant-panel-head">
            <div className="assistant-panel-identity">
              <TechCat mood={tourActive && pendingStep.current !== null ? 'loading' : mood} />
              <div>
                <h2 id="assistant-title">{tourActive ? currentStep.title : context.title}</h2>
                <span>Demos tech cat</span>
              </div>
            </div>
            <button type="button" className="assistant-close" onClick={closePanel} aria-label="Close assistant">
              <span aria-hidden="true">×</span>
            </button>
          </header>

          {tourActive ? (
            <div className="assistant-tour">
              <p className="assistant-progress" aria-live="polite">Step {tour.step + 1} of {STEPS.length}</p>
              <p id="assistant-message" className="assistant-message" aria-live="polite" aria-atomic="true">{currentStep.message}</p>
              {notice && <p className="assistant-notice" role="status">{notice}</p>}
              <div className="assistant-tour-controls">
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => goToStep(tour.step - 1)} disabled={tour.step === 0}>
                  Previous
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => goToStep(tour.step + 1)}>
                  {tour.step === STEPS.length - 1 ? 'Finish' : 'Next'}
                </button>
              </div>
              <button type="button" className="assistant-skip" onClick={skipTour}>Skip Tutorial</button>
            </div>
          ) : (
            <div className="assistant-context">
              <p id="assistant-message" className="assistant-message" aria-live="polite">{tour.status === 'completed'
                ? 'You’re all set! I’ll be here if you need a hand exploring Demos.'
                : context.message}</p>
              {notice && <p className="assistant-notice" role="status">{notice}</p>}
              <button type="button" className="btn btn-secondary btn-sm" onClick={startTour}>Start tutorial</button>
            </div>
          )}
        </section>
      )}
      {!open && bubbleVisible && !tourActive && (
        <p className="assistant-bubble" aria-hidden="true">{context.bubble}</p>
      )}
      <button
        ref={launcherRef}
        type="button"
        className="assistant-launcher"
        aria-label={open ? 'Close Demos assistant' : 'Open Demos assistant'}
        aria-expanded={open}
        aria-controls="demos-assistant"
        onClick={() => {
          react();
          setBubbleVisible(false);
          setOpen((value) => !value);
        }}
      >
        <TechCat mood={mood} />
      </button>
    </aside>
  );
}
