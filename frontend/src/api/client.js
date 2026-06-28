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
  novidades: (days = 30) => req(`/novidades?days=${days}`),

  renewEpisode: (id) => req(`/renew/episode/${id}`, { method: 'POST' }),
  renewSeason: (seriesId, seasonNumber) =>
    req('/renew/season', { method: 'POST', body: JSON.stringify({ seriesId, seasonNumber }) }),
  renewMovie: (id) => req(`/renew/movie/${id}`, { method: 'POST' }),
  renewQueue: (service, id, downloadId) =>
    req(`/renew/queue/${service}/${id}`, {
      method: 'POST',
      body: JSON.stringify({ downloadId })
    }),

  movieReleases: (id) => req(`/releases/movie/${id}`),
  episodeReleases: (id) => req(`/releases/episode/${id}`),
  seasonReleases: (seriesId, seasonNumber) =>
    req(`/releases/season?seriesId=${seriesId}&seasonNumber=${seasonNumber}`),
  grabRelease: (service, release) =>
    req('/releases/grab', {
      method: 'POST',
      body: JSON.stringify({ service, guid: release.guid, indexerId: release.indexerId })
    }),

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

  portugasStatus: () => req('/portugas/status'),
  portugasSetup: () => req('/portugas/setup', { method: 'POST' }),

  library: () => req('/library'),
  libraryIds: () => req('/library/ids'),
  jellyfin: () => req('/jellyfin'),
  deleteMovie: (id, deleteFiles) =>
    req(`/library/movie/${id}?deleteFiles=${deleteFiles ? 'true' : 'false'}`, { method: 'DELETE' }),
  deleteSeries: (id, deleteFiles) =>
    req(`/library/series/${id}?deleteFiles=${deleteFiles ? 'true' : 'false'}`, { method: 'DELETE' }),

  diagnostics: () => req('/diagnostics'),
  logs: (service, tail = 200) => req(`/diagnostics/logs/${service}?tail=${tail}`),
  restart: (service) => req(`/diagnostics/restart/${service}`, { method: 'POST' })
};
