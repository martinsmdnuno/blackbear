import * as tmdb from './tmdb.js';
import * as radarr from './radarr.js';
import * as sonarr from './sonarr.js';
import { seenSet } from './seen.js';

// Sample sizes: how many recent library titles to seed recommendations from.
const MOVIE_SEEDS = 15;
const SERIES_SEEDS = 10;
const OUT_LIMIT = 20;
const CACHE_MS = 30 * 60 * 1000;

let cache = { at: 0, data: null };

function recent(items, dateKey, n) {
  return [...(items || [])]
    .filter((x) => x)
    .sort((a, b) => new Date(b[dateKey] || 0) - new Date(a[dateKey] || 0))
    .slice(0, n);
}

// Aggregate recommendation lists: rank by how often a title is recommended
// across the seeds, then by rating. Drop anything already owned or seen.
function aggregate(lists, ownedIds, seen) {
  const byId = new Map();
  for (const list of lists) {
    for (const item of list || []) {
      if (!item?.tmdbId) continue;
      if (ownedIds.has(item.tmdbId) || seen.has(item.tmdbId)) continue;
      const cur = byId.get(item.tmdbId);
      if (cur) cur.score += 1;
      else byId.set(item.tmdbId, { ...item, score: 1 });
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.score - a.score || (b.rating || 0) - (a.rating || 0))
    .slice(0, OUT_LIMIT)
    .map(({ score, ...rest }) => rest);
}

export async function recommend({ refresh = false } = {}) {
  if (!refresh && cache.data && Date.now() - cache.at < CACHE_MS) {
    return cache.data;
  }

  const [moviesRes, seriesRes] = await Promise.allSettled([radarr.allMovies(), sonarr.allSeries()]);
  const library = {
    movies: moviesRes.status === 'fulfilled' ? moviesRes.value || [] : [],
    series: seriesRes.status === 'fulfilled' ? seriesRes.value || [] : []
  };

  const ownedMovieIds = new Set(library.movies.map((m) => m.tmdbId).filter(Boolean));
  const ownedSeriesIds = new Set(library.series.map((s) => s.tmdbId).filter(Boolean));

  const movieSeeds = recent(library.movies, 'added', MOVIE_SEEDS).filter((m) => m.tmdbId);
  const seriesSeeds = recent(library.series, 'added', SERIES_SEEDS).filter((s) => s.tmdbId);

  const [movieLists, seriesLists] = await Promise.all([
    Promise.all(movieSeeds.map((m) => tmdb.movieRecommendations(m.tmdbId).catch(() => []))),
    Promise.all(seriesSeeds.map((s) => tmdb.tvRecommendations(s.tmdbId).catch(() => [])))
  ]);

  const data = {
    movies: aggregate(movieLists, ownedMovieIds, seenSet('movie')),
    series: aggregate(seriesLists, ownedSeriesIds, seenSet('series')),
    basedOn: { movies: movieSeeds.length, series: seriesSeeds.length }
  };

  cache = { at: Date.now(), data };
  return data;
}

export function invalidate() {
  cache = { at: 0, data: null };
}
