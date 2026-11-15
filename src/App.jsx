import React from 'react';
import { BallotProvider } from './state/BallotContext.jsx';
import { useRoute } from './lib/router.js';
import { Header, NetworkBanner, NetworkUnavailableBanner } from './components/Header.jsx';
import { Footer } from './components/Footer.jsx';
import { Toasts } from './components/Toast.jsx';
import { WalletPicker } from './components/WalletPicker.jsx';
import { Assistant } from './components/Assistant.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { PollsPage } from './pages/PollsPage.jsx';
import { PollPage } from './pages/PollPage.jsx';
import { CreatePage } from './pages/CreatePage.jsx';
import { ReceiptPage } from './pages/ReceiptPage.jsx';
import { ActivityPage } from './pages/ActivityPage.jsx';
import { HowItWorksPage } from './pages/HowItWorksPage.jsx';
import { UnderTheHoodPage } from './pages/UnderTheHoodPage.jsx';
import { FaqPage } from './pages/FaqPage.jsx';
import { ContractPage } from './pages/ContractPage.jsx';
import { WalletPage } from './pages/WalletPage.jsx';

const ROUTES = {
  '': HomePage,
  polls: PollsPage,
  poll: PollPage,
  create: CreatePage,
  receipt: ReceiptPage,
  activity: ActivityPage,
  'how-it-works': HowItWorksPage,
  'under-the-hood': UnderTheHoodPage,
  faq: FaqPage,
  contract: ContractPage,
  wallet: WalletPage,
};

function NotFound() {
  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Page not found</h1>
        <p className="page-lede">
          There is nothing at this address. <a href="#/polls">See live polls</a>
        </p>
      </header>
    </div>
  );
}

function Shell() {
  const route = useRoute();
  const Page = ROUTES[route.segments[0] || ''] || NotFound;
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <Header route={route} />
      <NetworkBanner />
      <NetworkUnavailableBanner />
      <main id="main" className="main">
        <Page route={route} key={route.segments[0] === 'poll' ? route.path : route.segments[0] || 'home'} />
      </main>
      <Footer />
      <Assistant route={route} />
      <WalletPicker />
      <Toasts />
    </>
  );
}

export default function App() {
  return (
    <BallotProvider>
      <Shell />
    </BallotProvider>
  );
}
