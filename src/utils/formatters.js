import { formatEther } from 'ethers';

export function shortAddress(address, head = 6, tail = 4) {
  if (!address) return '';
  return address.length <= head + tail + 1 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function shortHash(hash) {
  return shortAddress(hash, 10, 8);
}

/** Format wei as ETH with a sensible number of decimals. */
export function formatEth(wei, maxDecimals = 4) {
  if (wei === null || wei === undefined) return '—';
  const value = Number(formatEther(BigInt(wei)));
  if (value === 0) return '0';
  if (value < 10 ** -maxDecimals) return `<${(10 ** -maxDecimals).toFixed(maxDecimals)}`;
  return value.toLocaleString(undefined, { maximumFractionDigits: maxDecimals });
}

export function formatGwei(wei) {
  if (wei === null || wei === undefined) return '—';
  return (Number(wei) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatNumber(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString();
}

export function formatDateTime(seconds) {
  if (!seconds) return '—';
  return new Date(seconds * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Compact 24-hour local time for the receipt slip, e.g. "14 Nov 2026, 16:39:53". */
export function formatSlipTime(seconds) {
  if (!seconds) return '—';
  return new Date(seconds * 1000).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatUtc(seconds) {
  if (!seconds) return '';
  return new Date(seconds * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

export function formatDuration(totalSeconds) {
  let s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatRelative(seconds, now = Date.now() / 1000) {
  if (!seconds) return '';
  const diff = Math.round(now - seconds);
  // Block timestamps can run slightly ahead of the visitor's clock.
  if (diff > -120 && diff < 5) return 'just now';
  const abs = Math.abs(diff);
  let text;
  if (abs < 45) text = `${abs} s`;
  else if (abs < 3600) text = `${Math.round(abs / 60)} min`;
  else if (abs < 86400) text = `${Math.round(abs / 3600)} h`;
  else text = `${Math.round(abs / 86400)} d`;
  return diff >= 0 ? `${text} ago` : `in ${text}`;
}

export function percent(votes, total) {
  if (!total) return 0;
  return (votes / total) * 100;
}

export function formatPercent(votes, total) {
  if (!total) return '0%';
  const p = percent(votes, total);
  return `${p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1)}%`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  }
}
