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
