import React from 'react';

const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

export const BallotMark = (p) => (
  <svg {...base} width={26} height={26} viewBox="0 0 32 32" {...p}>
    <rect x="5" y="12" width="22" height="15" rx="2" />
    <path d="M11 12V6.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1V12" />
    <path d="M12.8 9.2l2 2 4-4" />
    <path d="M10 17h12" />
  </svg>
);
export const ContractIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M7 3h7l5 5v13H7z" />
    <path d="M14 3v5h5" />
    <path d="M10 13l-2 2 2 2M14 13l2 2-2 2" />
  </svg>
);
export const OneVoteIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M8 12.5l2.7 2.7L16 9.5" />
  </svg>
);
export const ExplorerIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5" />
  </svg>
);
export const CopyIcon = (p) => (
  <svg {...base} width={15} height={15} {...p}>
    <rect x="9" y="9" width="11" height="11" rx="1.5" />
    <path d="M5 15V5a1 1 0 0 1 1-1h10" />
  </svg>
);
export const CheckIcon = (p) => (
  <svg {...base} width={15} height={15} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const ExternalIcon = (p) => (
  <svg {...base} width={13} height={13} {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
export const RefreshIcon = (p) => (
  <svg {...base} width={15} height={15} {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
  </svg>
);
export const MenuIcon = (p) => (
  <svg {...base} width={20} height={20} {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
export const CloseIcon = (p) => (
  <svg {...base} width={18} height={18} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const PlusIcon = (p) => (
  <svg {...base} width={16} height={16} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const MinusIcon = (p) => (
  <svg {...base} width={16} height={16} {...p}>
    <path d="M5 12h14" />
  </svg>
);
export const WalletIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 7a2 2 0 0 1 2-2h12v4" />
    <rect x="4" y="7" width="16" height="12" rx="2" />
    <circle cx="16" cy="13" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);
