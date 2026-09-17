import { Router } from 'express';
import * as sonarr from '../services/sonarr.js';
import * as radarr from '../services/radarr.js';
import * as lidarr from '../services/lidarr.js';
import { findArtist, rankAlbums, stripArtist } from '../services/musicSearch.js';
import * as tmdb from '../services/tmdb.js';

const router = Router();

// GET /api/search/person?q=...  — people (actors/directors) via TMDb
router.get('/person', async (req, res) => {
  const q = req.query.q;
  if (!q || !q.trim()) return res.status(400).json({ error: 'Missing search query' });
  try {
    res.json(await tmdb.searchPerson(q));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/search/person/:id  — that person's movies + series
router.get('/person/:id', async (req, res) => {
  try {
    res.json(await tmdb.personCredits(req.params.id));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/search?type=movie|series|artist&term=...
// Album search, the way people actually type it. Lidarr matches album titles
// only, so "Pink Floyd The Wall" finds tribute records while "The Wall" finds
// the real one. We look the term up as-is, work out which artist it names, then
// look up again without that name — and rank the union.
async function albumSearch(term) {
  const [direct, artist] = await Promise.all([
    lidarr.lookupAlbum(term).catch(() => []),
    findArtist(term, (t) => lidarr.lookupArtist(t).catch(() => [])).catch(() => null)
  ]);
  const termTitle = artist ? stripArtist(term, artist.artistName) : term;

  let extra = [];
  if (artist && termTitle && termTitle !== term) {
    extra = await lidarr.lookupAlbum(termTitle).catch(() => []);
  }

  const items = rankAlbums([...(direct || []), ...extra], {
    termTitle,
    artistName: artist?.artistName || null,
    fullTerm: term
  });

  // Searching an album by an artist's name alone leaves no title to match — so
  // say so, and let the UI offer the artist's discography instead of whatever
  // happens to have their name in the title.
  return {
    items,
    // The whole lookup result, so the UI can open this artist's discography
    // and add them from it.
    artist: artist || null,
    artistOnly: Boolean(artist) && !termTitle
  };
}

const LOOKUP = {
  movie: (term) => radarr.lookup(term),
  series: (term) => sonarr.lookup(term),
  artist: (term) => lidarr.lookupArtist(term),
  album: albumSearch
};

router.get('/', async (req, res) => {
  const { type, term } = req.query;
  if (!term || !term.trim()) return res.status(400).json({ error: 'Missing search term' });
  const lookup = LOOKUP[type];
  if (!lookup) {
    return res.status(400).json({ error: `type must be one of: ${Object.keys(LOOKUP).join(', ')}` });
  }
  try {
    const results = await lookup(term);
    // Album search answers with { items, artist, artistOnly }; the others with
    // a plain array of lookup results.
    res.json(Array.isArray(results) ? results : results || []);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
