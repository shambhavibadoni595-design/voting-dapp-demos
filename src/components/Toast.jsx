import React from 'react';
import { useBallot } from '../state/BallotContext.jsx';
import { CloseIcon } from './Icons.jsx';

export function Toasts() {
  const { toasts, dismissToast } = useBallot();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
          <span>{t.message}</span>
          <button type="button" className="icon-btn" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <CloseIcon width={14} height={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
