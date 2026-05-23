import { getService } from '../config.js';
import { httpJson, trimUrl } from './http.js';

const IMG = 'https://image.tmdb.org/t/p/w342';

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

// mode: 'trending' (this week) | 'popular' (current popularity)
export async function discover(mode = 'trending') {
  const [movie, tv] =
    mode === 'popular'
      ? ['/movie/popular', '/tv/popular']
      : ['/trending/movie/week', '/trending/tv/week'];
  const [mv, series] = await Promise.all([get(movie), get(tv)]);
  return {
    movies: (mv?.results || []).map(mapMovie),
    series: (series?.results || []).map(mapTv)
  };
}

export const movieRecommendations = (id) =>
  get(`/movie/${id}/recommendations`).then((r) => (r?.results || []).map(mapMovie));

export const tvRecommendations = (id) =>
  get(`/tv/${id}/recommendations`).then((r) => (r?.results || []).map(mapTv));

export { mapMovie, mapTv };

// Cheap call to validate the API key for the diagnostics/test probe.
export const ping = () => get('/configuration');

export default { discover, ping, movieRecommendations, tvRecommendations };
