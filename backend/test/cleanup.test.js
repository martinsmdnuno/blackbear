import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { seedingDone } from '../src/services/cleanup.js';
import { isProtectedTorrent } from '../src/services/portugas.js';

const NOW = 1_800_000_000;
const HOUR = 3600;
const rule = { minRatio: 5, maxSeedSeconds: 336 * HOUR, nowSec: NOW };

describe('auto cleanup', () => {
  test('a torrent is done at the ratio or after the seed time, whichever first', () => {
    assert.equal(seedingDone({ ratio: 5.2, completion_on: NOW - HOUR }, rule), 'ratio');
    assert.equal(seedingDone({ ratio: 0.1, completion_on: NOW - 337 * HOUR }, rule), 'time');
    assert.equal(seedingDone({ ratio: 0.1, completion_on: NOW - 52 * HOUR }, rule), null);
    // never completed → no seed time counted
    assert.equal(seedingDone({ ratio: 0, completion_on: 0 }, rule), null);
  });

  test('Portugas torrents are never removed automatically', () => {
    assert.equal(isProtectedTorrent(['https://portugas.org/announce.php?passkey=x']), true);
    assert.equal(
      isProtectedTorrent(['udp://tracker.opentrackr.org:1337/announce', 'https://PORTUGAS.org/a']),
      true
    );
  });

  test('a torrent whose tracker is unknown counts as protected', () => {
    assert.equal(isProtectedTorrent([]), true);
    assert.equal(isProtectedTorrent(undefined), true);
  });

  test('a public-tracker torrent may be removed', () => {
    assert.equal(isProtectedTorrent(['udp://tracker.opentrackr.org:1337/announce']), false);
  });
});
