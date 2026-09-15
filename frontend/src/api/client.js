const BASE = '/api';

async function req(path, options = {}) {
  // Optional client-side timeout, so a stuck backend can't hang the UI forever.
  const { timeout, ...fetchOptions } = options;
  const controller = timeout ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...fetchOptions,
      signal: controller?.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`BlackBeard backend didn't answer within ${Math.round(timeout / 1000)}s`);
    }
    throw new Error('Cannot reach BlackBeard backend');
  } finally {
    if (timer) clearTimeout(timer);
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
  // Lidarr only: decides whether an artist brings in albums, or albums plus
  // every single, live bootleg and remix compilation.
  metadataProfiles: () => req('/add/metadata-profiles'),
  add: (payload) => req('/add', { method: 'POST', body: JSON.stringify(payload) }),

  pipeline: () => req('/pipeline'),
  trending: (mode = 'trending') => req(`/trending?mode=${mode}`),
  recommended: () => req('/trending/recommended'),

  renewEpisode: (id) => req(`/renew/episode/${id}`, { method: 'POST' }),
  renewSeason: (seriesId, seasonNumber) =>
    req('/renew/season', { method: 'POST', body: JSON.stringify({ seriesId, seasonNumber }) }),
  renewMovie: (id) => req(`/renew/movie/${id}`, { method: 'POST' }),
  renewAlbum: (id) => req(`/renew/album/${id}`, { method: 'POST' }),
  renewQueue: (service, id, downloadId) =>
    req(`/renew/queue/${service}/${id}`, {
      method: 'POST',
      body: JSON.stringify({ downloadId })
    }),

  movieReleases: (id) => req(`/releases/movie/${id}`),
  albumReleases: (id) => req(`/releases/album/${id}`),
  episodeReleases: (id) => req(`/releases/episode/${id}`),
  seasonReleases: (seriesId, seasonNumber) =>
    req(`/releases/season?seriesId=${seriesId}&seasonNumber=${seasonNumber}`),
  grabRelease: (service, release) =>
    req('/releases/grab', {
      method: 'POST',
      body: JSON.stringify({ service, guid: release.guid, indexerId: release.indexerId })
    }),

  settings: () => req('/settings'),
  saveSettings: (payload) => req('/settings', { method: 'POST', body: JSON.stringify(payload) }),
  testConnection: (service) =>
    req('/settings/test', { method: 'POST', body: JSON.stringify({ service }) }),

  portugasStatus: () => req('/portugas/status'),
  portugasSetup: () => req('/portugas/setup', { method: 'POST' }),
  grabLink: (url) => req('/portugas/grab', { method: 'POST', body: JSON.stringify({ url }) }),

  library: () => req('/library', { timeout: 60000 }),
  libraryIds: () => req('/library/ids'),
  // A real delete runs qBittorrent + Radarr/Sonarr calls back to back (up to 60s
  // for a big series folder), so allow well beyond the backend's own timeouts.
  libraryDelete: (type, id, options) =>
    req(`/library/${type}/${id}/delete`, {
      method: 'POST',
      body: JSON.stringify(options),
      timeout: 150000
    }),

  seeding: () => req('/seeding'),
  seedingDelete: (hashes) =>
    req('/seeding/delete', { method: 'POST', body: JSON.stringify({ hashes }) }),

  diagnostics: () => req('/diagnostics'),
  logs: (service, tail = 200) => req(`/diagnostics/logs/${service}?tail=${tail}`),
  restart: (service) => req(`/diagnostics/restart/${service}`, { method: 'POST' })
};
