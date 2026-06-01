import { getService } from '../config.js';
import { httpJson, trimUrl } from './http.js';

const IMG = 'https://image.tmdb.org/t/p/w342';
const PROFILE = 'https://image.tmdb.org/t/p/w185';

function base() {
  const cfg = getService('tmdb');
  if (!cfg?.apiKey) throw new Error('TMDb API key not configured');
  return { url: trimUrl(cfg.url || 'https://api.themoviedb.org/3'), apiKey: cfg.apiKey };
}

function get(path) {
  const { url, apiKey } = base();
  const sep = path.includes('?') ? '&' : '?';
  return httpJson(`${url}${path}${sep}api_key=${apiKey}`, { label: 'TMDb' });
}

function mapMovie(m) {
  return {
    tmdbId: m.id,
    type: 'movie',
    title: m.title || m.original_title,
    year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
    overview: m.overview,
    poster: m.poster_path ? IMG + m.poster_path : null,
    rating: m.vote_average ? Math.round(m.vote_average * 10) / 10 : null
  };
}

function mapTv(t) {
  return {
    tmdbId: t.id,
    type: 'series',
    title: t.name || t.original_name,
    year: t.first_air_date ? Number(t.first_air_date.slice(0, 4)) : null,
    overview: t.overview,
    poster: t.poster_path ? IMG + t.poster_path : null,
    rating: t.vote_average ? Math.round(t.vote_average * 10) / 10 : null
  };
}

// mode: 'trending' (this week) | 'recent' (now playing / on the air) | 'popular' (current popularity)
export async function discover(mode = 'trending') {
  const [movie, tv] =
    mode === 'popular'
      ? ['/movie/popular', '/tv/popular']
      : mode === 'recent'
        ? ['/movie/now_playing', '/tv/on_the_air']
        : ['/trending/movie/week', '/trending/tv/week'];
  const [mv, series] = await Promise.all([get(movie), get(tv)]);
  return {
    movies: (mv?.results || []).map(mapMovie),
    series: (series?.results || []).map(mapTv)
  };
}

// Search people (actors, directors, …) by name.
export async function searchPerson(query) {
  const r = await get(`/search/person?include_adult=false&query=${encodeURIComponent(query)}`);
  return (r?.results || [])
    .map((p) => ({
      id: p.id,
      name: p.name,
      profile: p.profile_path ? PROFILE + p.profile_path : null,
      department: p.known_for_department || null,
      knownFor: (p.known_for || [])
        .map((k) => k.title || k.name)
        .filter(Boolean)
        .slice(0, 3),
      popularity: p.popularity || 0
    }))
    .sort((a, b) => b.popularity - a.popularity);
}

function mapCredit(c, role) {
  const isMovie = c.media_type === 'movie';
  return {
    tmdbId: c.id,
    type: isMovie ? 'movie' : 'series',
    title: c.title || c.name || c.original_title || c.original_name,
    year: (c.release_date || c.first_air_date || '').slice(0, 4) || null,
    poster: c.poster_path ? IMG + c.poster_path : null,
    rating: c.vote_average ? Math.round(c.vote_average * 10) / 10 : null,
    role,
    popularity: c.popularity || 0
  };
}

// A person's filmography: titles they acted in + titles they directed,
// deduped, newest/most-popular first.
export async function personCredits(id) {
  const data = await get(`/person/${id}/combined_credits`);
  const byKey = new Map();
  const add = (c, role) => {
    if (c.media_type !== 'movie' && c.media_type !== 'tv') return;
    const key = `${c.media_type}:${c.id}`;
    const existing = byKey.get(key);
    if (existing) {
      if (role && !existing.role.includes(role)) existing.role += `, ${role}`;
    } else {
      byKey.set(key, mapCredit(c, role));
    }
  };
  for (const c of data?.cast || []) add(c, c.character ? 'Actor' : 'Actor');
  for (const c of data?.crew || []) if (c.job === 'Director') add(c, 'Director');

  const items = [...byKey.values()].sort(
    (a, b) => (Number(b.year) || 0) - (Number(a.year) || 0) || b.popularity - a.popularity
  );
  return {
    movies: items.filter((i) => i.type === 'movie').map(({ popularity, ...r }) => r),
    series: items.filter((i) => i.type === 'series').map(({ popularity, ...r }) => r)
  };
}

export const movieRecommendations = (id) =>
  get(`/movie/${id}/recommendations`).then((r) => (r?.results || []).map(mapMovie));

export const tvRecommendations = (id) =>
  get(`/tv/${id}/recommendations`).then((r) => (r?.results || []).map(mapTv));

// Minimal details for one title, to label a hidden item by id.
export async function details(type, id) {
  const d = await get(type === 'movie' ? `/movie/${id}` : `/tv/${id}`);
  if (!d) return null;
  return type === 'movie'
    ? {
        title: d.title || d.original_title,
        poster: d.poster_path ? IMG + d.poster_path : null,
        year: d.release_date ? Number(d.release_date.slice(0, 4)) : null
      }
    : {
        title: d.name || d.original_name,
        poster: d.poster_path ? IMG + d.poster_path : null,
        year: d.first_air_date ? Number(d.first_air_date.slice(0, 4)) : null
      };
}

export { mapMovie, mapTv };

// Cheap call to validate the API key for the diagnostics/test probe.
export const ping = () => get('/configuration');

export default { discover, ping, movieRecommendations, tvRecommendations };
