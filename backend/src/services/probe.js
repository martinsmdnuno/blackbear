import * as sonarr from './sonarr.js';
import * as radarr from './radarr.js';
import * as prowlarr from './prowlarr.js';
import * as bazarr from './bazarr.js';
import * as qbit from './qbittorrent.js';
import * as tmdb from './tmdb.js';

// A connectivity probe per service, returning a normalised
// { ok, version, error } shape. Shared by the settings "Test connection"
// button and the diagnostics health panel.
const probes = {
  sonarr: async () => {
    const s = await sonarr.systemStatus();
    return s?.version;
  },
  radarr: async () => {
    const s = await radarr.systemStatus();
    return s?.version;
  },
  prowlarr: async () => {
    const s = await prowlarr.systemStatus();
    return s?.version;
  },
  bazarr: async () => {
    const s = await bazarr.systemStatus();
    return s?.data?.bazarr_version || s?.bazarr_version;
  },
  qbittorrent: async () => qbit.version(),
  tmdb: async () => {
    await tmdb.ping();
    return null;
  }
};

export const SERVICE_NAMES = Object.keys(probes);

export async function probeService(name) {
  const probe = probes[name];
  if (!probe) return { service: name, ok: false, error: 'Unknown service' };
  try {
    const version = await probe();
    return { service: name, ok: true, version: version || null };
  } catch (err) {
    return { service: name, ok: false, error: err.message };
  }
}
