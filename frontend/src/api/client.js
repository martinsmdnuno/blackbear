const BASE = '/api';

async function req(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
  } catch (err) {
    throw new Error('Cannot reach BlackBeard backend');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  search: (type, term) => req(`/search?type=${type}&term=${encodeURIComponent(term)}`),
  searchPerson: (q) => req(`/search/person?q=${encodeURIComponent(q)}`),
  personCredits: (id) => req(`/search/person/${id}`),
  qualityProfiles: (type) => req(`/add/quality-profiles?type=${type}`),
  rootFolders: (type) => req(`/add/root-folders?type=${type}`),
  add: (payload) => req('/add', { method: 'POST', body: JSON.stringify(payload) }),

  pipeline: () => req('/pipeline'),
  trending: (mode = 'trending') => req(`/trending?mode=${mode}`),
  recommended: () => req('/trending/recommended'),
  markSeen: (type, tmdbId) =>
    req('/trending/seen', { method: 'POST', body: JSON.stringify({ type, tmdbId }) }),

  downloads: () => req('/downloads'),
  bazarrSearchWanted: () => req('/downloads/bazarr/search-wanted', { method: 'POST' }),
  torrentPause: (hash) => req(`/downloads/torrents/${hash}/pause`, { method: 'POST' }),
  torrentResume: (hash) => req(`/downloads/torrents/${hash}/resume`, { method: 'POST' }),
  torrentDelete: (hash, deleteFiles) =>
    req(`/downloads/torrents/${hash}?deleteFiles=${deleteFiles ? 'true' : 'false'}`, {
      method: 'DELETE'
    }),

  settings: () => req('/settings'),
  saveSettings: (payload) => req('/settings', { method: 'POST', body: JSON.stringify(payload) }),
  testConnection: (service) =>
    req('/settings/test', { method: 'POST', body: JSON.stringify({ service }) }),

  diagnostics: () => req('/diagnostics'),
  logs: (service, tail = 200) => req(`/diagnostics/logs/${service}?tail=${tail}`),
  restart: (service) => req(`/diagnostics/restart/${service}`, { method: 'POST' })
};
