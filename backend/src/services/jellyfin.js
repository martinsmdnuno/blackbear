import { getService } from '../config.js';
import { httpJson, httpRequest, trimUrl } from './http.js';

function base() {
  const cfg = getService('jellyfin');
  if (!cfg?.url) throw new Error('Jellyfin URL not configured');
  if (!cfg?.apiKey) throw new Error('Jellyfin API key not configured');
  return { url: trimUrl(cfg.url), apiKey: cfg.apiKey, userId: cfg.userId || '' };
}

function get(path) {
  const { url, apiKey } = base();
  return httpJson(`${url}${path}`, { label: 'Jellyfin', headers: { 'X-Emby-Token': apiKey } });
}

let cachedUid = null;
async function userId() {
  const { userId: configured } = base();
  if (configured) return configured;
  if (cachedUid) return cachedUid;
  const users = await get('/Users');
  cachedUid = users?.[0]?.Id;
  if (!cachedUid) throw new Error('No Jellyfin user found');
  return cachedUid;
}

function mapItem(it) {
  const isEpisode = it.Type === 'Episode';
  const isSeries = it.Type === 'Series' || isEpisode || Boolean(it.SeriesName);
  const pct =
    it.UserData?.PlayedPercentage != null
      ? Math.round(it.UserData.PlayedPercentage)
      : it.RunTimeTicks && it.UserData?.PlaybackPositionTicks
        ? Math.round((it.UserData.PlaybackPositionTicks / it.RunTimeTicks) * 100)
        : null;
  return {
    imageId: it.Id, // image is fetched per item via the proxy
    title: it.SeriesName || it.Name,
    sub: isEpisode
      ? `S${String(it.ParentIndexNumber || 0).padStart(2, '0')}E${String(it.IndexNumber || 0).padStart(2, '0')} · ${it.Name}`
      : it.ProductionYear || '',
    type: isSeries ? 'series' : 'movie',
    tmdbId: it.ProviderIds?.Tmdb ? Number(it.ProviderIds.Tmdb) : null,
    progress: pct
  };
}

export async function resume(limit = 20) {
  const uid = await userId();
  const r = await get(
    `/Users/${uid}/Items/Resume?Limit=${limit}&MediaTypes=Video&Recursive=true&Fields=ProviderIds,UserData&EnableImages=true`
  );
  return (r?.Items || []).map(mapItem);
}

export async function latest(limit = 20) {
  const uid = await userId();
  const r = await get(
    `/Users/${uid}/Items/Latest?Limit=${limit}&IncludeItemTypes=Movie,Series&Fields=ProviderIds&EnableImages=true`
  );
  // /Items/Latest returns a bare array.
  return (Array.isArray(r) ? r : []).map(mapItem);
}

// Cached set of TMDb ids the user has fully played, per type. Powers the Library
// "watched" badge and Trending auto-hide.
let watchedCache = { at: 0, data: null };
export async function watchedTmdb() {
  if (watchedCache.data && Date.now() - watchedCache.at < 5 * 60 * 1000) return watchedCache.data;
  const uid = await userId();
  const r = await get(
    `/Users/${uid}/Items?Recursive=true&IsPlayed=true&IncludeItemTypes=Movie,Series&Fields=ProviderIds&EnableImages=false`
  );
  const movie = new Set();
  const series = new Set();
  for (const it of r?.Items || []) {
    const t = it.ProviderIds?.Tmdb ? Number(it.ProviderIds.Tmdb) : null;
    if (!t) continue;
    if (it.Type === 'Movie') movie.add(t);
    else if (it.Type === 'Series') series.add(t);
  }
  watchedCache = { at: Date.now(), data: { movie, series } };
  return watchedCache.data;
}

// Stream a poster through the backend so it works remotely (Jellyfin itself is
// only reachable on the LAN).
export async function image(itemId) {
  const { url, apiKey } = base();
  const res = await httpRequest(
    `${url}/Items/${encodeURIComponent(itemId)}/Images/Primary?maxHeight=450&quality=90`,
    { label: 'Jellyfin image', headers: { 'X-Emby-Token': apiKey } }
  );
  const ab = await res.arrayBuffer();
  return { contentType: res.headers.get('content-type') || 'image/jpeg', buffer: Buffer.from(ab) };
}

export const systemInfo = () => get('/System/Info');

// Kick off a full library scan so deleted files disappear right away.
export const refreshLibrary = () => {
  const { url, apiKey } = base();
  return httpRequest(`${url}/Library/Refresh`, {
    method: 'POST',
    label: 'Jellyfin',
    headers: { 'X-Emby-Token': apiKey }
  });
};

export default { resume, latest, watchedTmdb, image, systemInfo, refreshLibrary };
