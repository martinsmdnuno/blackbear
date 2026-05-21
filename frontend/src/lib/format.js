export function bytes(n) {
  if (n == null || n < 0) return '—';
  if (n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function speed(n) {
  if (!n || n <= 0) return '0 B/s';
  return `${bytes(n)}/s`;
}

export function eta(seconds) {
  // qBittorrent uses 8640000 as "infinite" / unknown ETA.
  if (seconds == null || seconds < 0 || seconds >= 8640000) return '∞';
  if (seconds === 0) return 'done';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function percent(fraction) {
  return `${Math.round((fraction || 0) * 100)}%`;
}

export function truncate(str, max = 60) {
  if (!str) return '';
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

// "in 3 days", "tomorrow", "today", or "2 weeks ago" for a date string.
export function untilLabel(dateStr) {
  if (!dateStr) return '';
  const days = Math.round((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (days < -1) return `${Math.abs(days)} days ago`;
  if (days === -1) return 'yesterday';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  if (days < 30) return `in ${Math.round(days / 7)} weeks`;
  if (days < 365) return `in ${Math.round(days / 30)} months`;
  return `in ${Math.round(days / 365)} years`;
}

export function shortDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
