import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { albumGroup, mapDiscography } from '../src/services/discography.js';

const raw = {
  artistname: 'Linkin Park',
  Albums: [
    { Id: 'hybrid', OldIds: ['hybrid-old'], Title: 'Hybrid Theory', Type: 'Album', SecondaryTypes: [], ReleaseStatuses: ['Official'], ReleaseDate: '2000-05-07' },
    { Id: 'meteora', OldIds: [], Title: 'Meteora', Type: 'Album', SecondaryTypes: [], ReleaseStatuses: ['Official', 'Bootleg'], ReleaseDate: '2003-03-24' },
    { Id: 'boot', OldIds: [], Title: '2012-08-11: Jiffy Lube Live', Type: 'Album', SecondaryTypes: ['Live'], ReleaseStatuses: ['Bootleg'], ReleaseDate: '2012-08-11' },
    { Id: 'live', OldIds: [], Title: 'Road to Revolution', Type: 'Album', SecondaryTypes: ['Live'], ReleaseStatuses: ['Official'], ReleaseDate: '2008-11-24' },
    { Id: 'cookies', OldIds: [], Title: 'Mmm...Cookies', Type: 'EP', SecondaryTypes: [], ReleaseStatuses: ['Official'], ReleaseDate: '2008-12-04' },
    { Id: 'numb', OldIds: [], Title: 'Numb', Type: 'Single', SecondaryTypes: [], ReleaseStatuses: ['Official'], ReleaseDate: '2003-09-08' }
  ]
};

describe('artist discography', () => {
  test('shelves live and compilations before the EP/single distinction', () => {
    assert.equal(albumGroup('Album', []), 'album');
    assert.equal(albumGroup('EP', ['Live']), 'live');
    assert.equal(albumGroup('Album', ['Compilation', 'Remix']), 'compilation');
    assert.equal(albumGroup('Album', ['Remix']), 'other');
    assert.equal(albumGroup('Single', []), 'single');
    assert.equal(albumGroup('Broadcast', []), 'other');
  });

  test('drops bootleg-only release groups and orders studio albums first, newest first', () => {
    const albums = mapDiscography(raw);
    assert.deepEqual(
      albums.map((a) => a.foreignAlbumId),
      ['meteora', 'hybrid', 'cookies', 'live', 'numb']
    );
    assert.equal(albums[0].year, 2003);
    assert.equal(albums[0].library, null);
    assert.match(albums[0].cover, /coverartarchive\.org\/release-group\/meteora\//);
  });

  test('matches library albums on merged-away ids and keeps Lidarr\'s id', () => {
    const albums = mapDiscography(raw, [
      {
        id: 7,
        foreignAlbumId: 'hybrid-old',
        title: 'Hybrid Theory',
        monitored: true,
        statistics: { trackFileCount: 12, totalTrackCount: 12, sizeOnDisk: 400 }
      }
    ]);
    const hybrid = albums.find((a) => a.title === 'Hybrid Theory');
    assert.equal(hybrid.foreignAlbumId, 'hybrid-old');
    assert.deepEqual(hybrid.library, {
      id: 7,
      monitored: true,
      trackFileCount: 12,
      totalTrackCount: 12,
      sizeOnDisk: 400,
      complete: true
    });
    assert.equal(albums.filter((a) => a.title === 'Hybrid Theory').length, 1);
  });

  test('keeps a library album the metadata server no longer lists', () => {
    const albums = mapDiscography(raw, [
      { id: 9, foreignAlbumId: 'gone', title: 'Old Record', albumType: 'Album', secondaryTypes: [], releaseDate: '1999-01-01T00:00:00Z', monitored: false, statistics: {} }
    ]);
    const gone = albums.find((a) => a.foreignAlbumId === 'gone');
    assert.equal(gone.group, 'album');
    assert.equal(gone.releaseDate, '1999-01-01');
    assert.equal(gone.library.id, 9);
  });
});
