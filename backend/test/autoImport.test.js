import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isIdMatchBlocked, planRadarrImport, planSonarrImport } from '../src/services/autoImport.js';

const RADARR_MSG =
  'Found matching movie via grab history, but release was matched to movie by ID. Manual Import required.';
const SONARR_MSG =
  'Found matching series via grab history, but release was matched to series by ID. Automatic import is not possible. See the FAQ for details.';

const blocked = (msgs, extra = {}) => ({
  trackedDownloadState: 'importBlocked',
  downloadId: 'ABC',
  statusMessages: [{ title: 'x', messages: msgs }],
  ...extra
});

describe('auto import of by-ID matches', () => {
  test('only the by-ID warning on an importBlocked item qualifies', () => {
    assert.equal(isIdMatchBlocked(blocked([RADARR_MSG])), true);
    assert.equal(isIdMatchBlocked(blocked([SONARR_MSG])), true);
    assert.equal(
      isIdMatchBlocked(blocked(['Series title mismatch; automatic import is not possible.'])),
      false
    );
    // a second, unrelated problem → leave it for a human
    assert.equal(isIdMatchBlocked(blocked([RADARR_MSG, 'Not an upgrade for existing movie file'])), false);
    assert.equal(isIdMatchBlocked({ ...blocked([RADARR_MSG]), trackedDownloadState: 'importPending' }), false);
    assert.equal(isIdMatchBlocked(blocked([])), false);
  });

  test('Radarr: imports the video as the queued movie, skips samples and other movies', () => {
    const record = blocked([RADARR_MSG], { movieId: 7 });
    const { files, skipped } = planRadarrImport(record, [
      { path: '/d/Animales.mkv', movie: { id: 7 }, quality: { q: 1 }, languages: [], rejections: [] },
      { path: '/d/sample.mkv', movie: { id: 7 }, rejections: [{ reason: 'Sample', type: 'permanent' }] },
      { path: '/d/other.mkv', movie: { id: 9 }, rejections: [] },
      { path: '/d/unparsed.mkv', rejections: [{ reason: 'Unknown Movie', type: 'permanent' }] }
    ]);
    assert.deepEqual(files.map((f) => [f.path, f.movieId, f.downloadId]), [
      ['/d/Animales.mkv', 7, 'ABC'],
      ['/d/unparsed.mkv', 7, 'ABC']
    ]);
    assert.equal(skipped.length, 2);
  });

  test('Radarr: no movieId on the queue item → nothing', () => {
    assert.equal(planRadarrImport(blocked([RADARR_MSG]), [{ path: '/d/a.mkv' }]).files.length, 0);
  });

  test('Sonarr: each file goes to its own queued episodes', () => {
    const records = [1, 2].map((ep) => blocked([SONARR_MSG], { seriesId: 3, episodeId: ep }));
    const { files } = planSonarrImport(records, [
      { path: '/d/e1.mkv', series: { id: 3 }, episodes: [{ id: 1 }], rejections: [] },
      { path: '/d/e2.mkv', series: { id: 3 }, episodes: [{ id: 2 }, { id: 99 }], rejections: [] }
    ]);
    assert.deepEqual(files.map((f) => [f.path, f.seriesId, f.episodeIds]), [
      ['/d/e1.mkv', 3, [1]],
      ['/d/e2.mkv', 3, [2]]
    ]);
  });

  test('Sonarr: a single unparsed file is the queued episode', () => {
    const records = [blocked([SONARR_MSG], { seriesId: 3, episodeId: 5 })];
    const { files } = planSonarrImport(records, [{ path: '/d/x.mkv', episodes: [], rejections: [] }]);
    assert.deepEqual(files[0].episodeIds, [5]);
  });
});
