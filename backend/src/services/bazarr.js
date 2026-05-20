import { getService } from '../config.js';
import { httpJson, trimUrl } from './http.js';

// Bazarr's API differs from the *arr trio: header is X-API-KEY (uppercase) and
// the base path is just /api with no version segment.
function resolveBase() {
  const cfg = getService('bazarr');
  if (!cfg?.url) throw new Error('Bazarr URL not configured');
  if (!cfg?.apiKey) throw new Error('Bazarr API key not configured');
  return { base: `${trimUrl(cfg.url)}/api`, apiKey: cfg.apiKey };
}

function request(path, options = {}) {
  const { base, apiKey } = resolveBase();
  return httpJson(`${base}${path}`, {
    ...options,
    label: 'Bazarr',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
}

export const systemStatus = () => request('/system/status');

export const providers = () => request('/providers');

export const wantedMovies = () => request('/movies/wanted?start=0&length=1');

export const wantedEpisodes = () => request('/episodes/wanted?start=0&length=1');

export default { request };
