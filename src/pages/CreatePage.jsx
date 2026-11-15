import React, { useMemo, useState } from 'react';
import { useBallot, useTransaction } from '../state/BallotContext.jsx';
import { TxProgress } from '../components/TxProgress.jsx';
import { GasAssistPanel } from '../components/GasAssistPanel.jsx';
import { NoContract } from '../components/States.jsx';
import { TxHash } from '../components/Address.jsx';
import { MinusIcon, PlusIcon } from '../components/Icons.jsx';
import { LIMITS, byteLength, createPoll, validatePollInput, switchToSepolia } from '../services/votingService.js';
import { formatDateTime, formatDuration } from '../utils/formatters.js';

const UNITS = { minutes: 60, hours: 3600, days: 86400 };
const PRESETS = [
  { label: '10 minutes', amount: 10, unit: 'minutes' },
  { label: '1 hour', amount: 1, unit: 'hours' },
  { label: '1 day', amount: 1, unit: 'days' },
  { label: '1 week', amount: 7, unit: 'days' },
  { label: '30 days', amount: 30, unit: 'days' },
];

function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Counter({ value, max }) {
  const n = byteLength(value);
  return <span className={`counter ${n > max ? 'over' : ''}`}>{n}/{max}</span>;
}

export function CreatePage() {
  const { contract, wallet, requestConnect, refreshPolls, toast, txBusy } = useBallot();
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [mode, setMode] = useState('duration');
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState('days');
  const [deadline, setDeadline] = useState(() => toLocalInput(new Date(Date.now() + 86400000)));
  const [touched, setTouched] = useState(false);
  const [created, setCreated] = useState(null);
  const { tx, run, reset } = useTransaction();

  const durationSeconds = useMemo(() => {
    if (mode === 'duration') return Math.round(Number(amount) * UNITS[unit]);
    const ms = new Date(deadline).getTime();
    return Number.isFinite(ms) ? Math.round((ms - Date.now()) / 1000) : NaN;
  }, [mode, amount, unit, deadline]);

  const validation = validatePollInput({ question, description, options, durationSeconds });
  const show = (key) => touched && validation.errors[key];
  const busy = txBusy || ['checking', 'awaiting_signature', 'submitted'].includes(tx.status);

  if (!contract) {
    return (
      <div className="page" data-tour-target="poll-question">
        <header className="page-head"><h1>Create a poll</h1></header>
        <NoContract />
      </div>
    );
  }

  const setOption = (i, v) => setOptions((o) => o.map((x, j) => (j === i ? v : x)));
  const addOption = () => setOptions((o) => (o.length < LIMITS.maxOptions ? [...o, ''] : o));
  const removeOption = (i) => setOptions((o) => (o.length > LIMITS.minOptions ? o.filter((_, j) => j !== i) : o));

  const submit = async (e) => {
    e?.preventDefault();
    setTouched(true);
    if (!validation.ok) return;
    if (!wallet.address) return requestConnect();
    if (!wallet.isSepolia) {
      try {
        await switchToSepolia();
      } catch (err) {
        toast(err.message, 'error');
        return;
      }
    }
    const result = await run((onStatus) => createPoll({ question, description, options, durationSeconds }, onStatus));
    if (result) {
      setCreated(result);
      refreshPolls();
      toast(`Poll #${result.pollId} created.`, 'success');
    }
  };

  const startOver = () => {
    setQuestion('');
    setDescription('');
    setOptions(['', '']);
    setTouched(false);
    setCreated(null);
    reset();
  };

  if (created) {
    return (
      <div className="page narrow">
        <header className="page-head">
          <h1>Poll #{created.pollId} is live</h1>
          <p className="page-lede">The contract stored your poll in block {created.record.blockNumber.toLocaleString()}. Anyone can vote on it now.</p>
        </header>
        <dl className="facts boxed">
          <div><dt>Poll ID</dt><dd>#{created.pollId}</dd></div>
          <div><dt>Transaction</dt><dd><TxHash value={created.record.hash} /></dd></div>
          <div><dt>Block</dt><dd>{created.record.blockNumber.toLocaleString()}</dd></div>
          <div><dt>Mined at</dt><dd>{formatDateTime(created.record.timestamp)}</dd></div>
        </dl>
        <div className="hero-actions">
          <a className="btn btn-primary" href={`#/poll/${created.pollId}`}>Open poll #{created.pollId}</a>
          <button type="button" className="btn btn-secondary" onClick={startOver}>Create another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Create a poll</h1>
        <p className="page-lede">
          Your poll is stored by the contract on Sepolia. Once it is created, nobody can edit it, including you. You can only
          close it early.
        </p>
      </header>

      <form className="create-form" onSubmit={submit} noValidate>
        <div className="field" data-tour-target="poll-question">
          <label htmlFor="q">Question</label>
          <input id="q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What should we decide?" disabled={busy} aria-invalid={Boolean(show('question'))} />
          <div className="field-foot">
            {show('question') ? <span className="field-error">{validation.errors.question}</span> : <span />}
            <Counter value={question.trim()} max={LIMITS.maxQuestionBytes} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="d">
            Description <span className="optional">optional</span>
          </label>
          <textarea id="d" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Context voters should know." disabled={busy} />
          <div className="field-foot">
            {show('description') ? <span className="field-error">{validation.errors.description}</span> : <span />}
            <Counter value={description.trim()} max={LIMITS.maxDescriptionBytes} />
          </div>
        </div>

        <fieldset className="field" data-tour-target="poll-answers">
          <legend>Answers</legend>
          <p className="field-hint">Between two and ten. Voters pick one.</p>
          <ol className="option-inputs">
            {options.map((o, i) => (
              <li key={i}>
                <span className="opt-num">{i + 1}</span>
                <input
                  value={o}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`Answer ${i + 1}`}
                  aria-label={`Answer ${i + 1}`}
                  disabled={busy}
                  aria-invalid={Boolean(touched && validation.optionErrors[i])}
                />
                <button type="button" className="icon-btn" onClick={() => removeOption(i)} disabled={busy || options.length <= LIMITS.minOptions} aria-label={`Remove answer ${i + 1}`}>
                  <MinusIcon />
                </button>
                {touched && validation.optionErrors[i] && <span className="field-error">{validation.optionErrors[i]}</span>}
              </li>
            ))}
          </ol>
          {show('options') && <span className="field-error">{validation.errors.options}</span>}
          <button type="button" className="btn btn-quiet btn-sm" onClick={addOption} disabled={busy || options.length >= LIMITS.maxOptions}>
            <PlusIcon /> Add an answer {options.length >= LIMITS.maxOptions ? '(ten is the limit)' : ''}
          </button>
        </fieldset>

        <fieldset className="field" data-tour-target="poll-duration">
          <legend>How long it stays open</legend>
          <div className="segmented small" role="tablist" aria-label="Duration type">
            <button type="button" role="tab" aria-selected={mode === 'duration'} className={mode === 'duration' ? 'active' : ''} onClick={() => setMode('duration')}>
              Open for
            </button>
            <button type="button" role="tab" aria-selected={mode === 'deadline'} className={mode === 'deadline' ? 'active' : ''} onClick={() => setMode('deadline')}>
              Close at
            </button>
          </div>

          {mode === 'duration' ? (
            <>
              <div className="duration-row">
                <input type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" disabled={busy} />
                <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit" disabled={busy}>
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
              </div>
              <div className="presets">
                {PRESETS.map((p) => (
                  <button key={p.label} type="button" className={`chip ${Number(amount) === p.amount && unit === p.unit ? 'active' : ''}`} onClick={() => { setAmount(p.amount); setUnit(p.unit); }} disabled={busy}>
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <input type="datetime-local" value={deadline} min={toLocalInput(new Date(Date.now() + 120000))} onChange={(e) => setDeadline(e.target.value)} disabled={busy} aria-label="Closing date and time" />
          )}
          {show('duration') ? (
            <span className="field-error">{validation.errors.duration}</span>
          ) : (
            Number.isFinite(durationSeconds) &&
            durationSeconds > 0 && (
              <p className="field-hint">
                Open for {formatDuration(durationSeconds)}, until about {formatDateTime(Math.floor(Date.now() / 1000) + durationSeconds)}. The
                exact deadline is set from the block your poll lands in.
              </p>
            )
          )}
        </fieldset>

        <div className="form-submit">
          {!wallet.address ? (
            <>
              <button type="button" className="btn btn-primary btn-lg" onClick={requestConnect}>Connect wallet to create</button>
              <span className="fine">Creating a poll is a transaction, so it needs a wallet and a little Sepolia test ETH for gas.</span>
            </>
          ) : (
            <>
              <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
                {busy ? 'Creating…' : wallet.isSepolia ? 'Create poll' : 'Switch to Sepolia and create'}
              </button>
              <span className="fine">Your wallet will show the gas fee before anything is sent.</span>
            </>
          )}
        </div>

        {tx.status === 'insufficient' && <GasAssistPanel action="create this poll" preflight={tx.preflight} onRetry={submit} onClose={reset} />}
        <TxProgress tx={tx} verb="create the poll" onRetry={submit} onDismiss={reset} />
      </form>
    </div>
  );
}
