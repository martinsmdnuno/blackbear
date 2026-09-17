import { Router } from 'express';
import * as lidarr from '../services/lidarr.js';
import { fetchArtist, mapDiscography } from '../services/discography.js';

const router = Router();

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/music/artist/:mbid/albums — an artist's discography, whether or not
// Lidarr tracks them yet. For an artist in the library each album also carries
// its Lidarr id and what is on disk.
router.get('/artist/:mbid/albums', async (req, res) => {
  const { mbid } = req.params;
  if (!MBID.test(mbid)) return res.status(400).json({ error: 'Not a MusicBrainz artist id' });
  try {
    const [raw, artists] = await Promise.all([fetchArtist(mbid), lidarr.allArtists()]);
    const inLibrary = (artists || []).find((a) => a.foreignArtistId === mbid) || null;
    const libraryAlbums = inLibrary ? (await lidarr.albums(inLibrary.id)) || [] : [];
    res.json({
      artist: {
        foreignArtistId: mbid,
        artistName: inLibrary?.artistName || raw?.artistname || null,
        id: inLibrary?.id ?? null,
        monitored: inLibrary ? Boolean(inLibrary.monitored) : null
      },
      albums: mapDiscography(raw, libraryAlbums)
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/music/artist/:id/albums  { albumIds, search }
// For an artist already in Lidarr: monitor these albums (nothing else changes)
// and optionally search for them. There is no add here, so none of the refresh
// race that adding an artist has.
router.post('/artist/:id/albums', async (req, res) => {
  const id = Number(req.params.id);
  const albumIds = (req.body?.albumIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Bad artist id' });
  if (!albumIds.length) return res.status(400).json({ error: 'Pick at least one album' });

  try {
    const known = new Set(((await lidarr.albums(id)) || []).map((a) => a.id));
    const stray = albumIds.filter((a) => !known.has(a));
    if (stray.length) return res.status(400).json({ error: 'Some of those albums belong to another artist' });

    // Lidarr's wanted/missing and its searches skip albums whose artist isn't
    // monitored, so monitoring the album alone would do nothing.
    const artist = await lidarr.artist(id);
    if (!artist.monitored) await lidarr.updateArtist({ ...artist, monitored: true });
    await lidarr.setAlbumsMonitored(albumIds, true);
    if (req.body?.search === true) await lidarr.searchAlbums(albumIds);
    res.json({ ok: true, count: albumIds.length });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
