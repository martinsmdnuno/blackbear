import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlan,
  detectPrivacy,
  estimateFreed,
  executePlan,
  hashOwners,
  hostInList,
  indexImports,
  matchTorrents,
  summarizeTorrent,
  torrentIndex
} from '../src/services/library.js';

const HASH_A = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const HASH_B = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const HASH_C = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
const NOW = 1_800_000_000;
const DAY = 86400;

describe('item ↔ torrent association', () => {
  test('indexes import history by item, lowercasing the uppercase downloadId', () => {
    const index = indexImports(
      [
        { movieId: 1, downloadId: HASH_A, eventType: 'downloadFolderImported' },
        { movieId: 2, downloadId: HASH_B, eventType: 'downloadFolderImported' }
      ],
      'movieId'
    );
    assert.deepEqual([...index.get(1)], [HASH_A.toLowerCase()]);
    assert.deepEqual([...index.get(2)], [HASH_B.toLowerCase()]);
  });

  test('a series keeps every distinct torrent, deduplicating repeated imports', () => {
    const index = indexImports(
      [
        { seriesId: 7, downloadId: HASH_A, eventType: 'downloadFolderImported' },
        { seriesId: 7, downloadId: HASH_A, eventType: 'downloadFolderImported' },
        { seriesId: 7, downloadId: HASH_B.toLowerCase(), eventType: 'downloadFolderImported' }
      ],
      'seriesId'
    );
    assert.equal(index.get(7).size, 2);
  });

  test('ignores non-import events and records without a downloadId', () => {
    const index = indexImports(
      [
        { movieId: 1, downloadId: HASH_A, eventType: 'grabbed' },
        { movieId: 1, downloadId: '', eventType: 'downloadFolderImported' },
        { movieId: 1, eventType: 'downloadFolderImported' },
        { movieId: 3, downloadId: HASH_C, eventType: 3 }
      ],
      'movieId'
    );
    assert.equal(index.has(1), false);
    assert.equal(index.has(3), true);
  });

  test('matches torrents case-insensitively and skips torrents already removed', () => {
    const index = torrentIndex([
      { hash: HASH_A.toLowerCase(), name: 'a', added_on: 2 },
      { hash: HASH_B.toLowerCase(), name: 'b', added_on: 1 }
    ]);
    const found = matchTorrents(new Set([HASH_A, HASH_B, HASH_C]), index);
    assert.deepEqual(
      found.map((t) => t.name),
      ['b', 'a'] // oldest first; HASH_C is no longer in qBittorrent
    );
  });

  test('finds a hybrid torrent by its v1 infohash', () => {
    const index = torrentIndex([
      { hash: 'ffff'.repeat(10), infohash_v1: HASH_C.toLowerCase(), name: 'hybrid' }
    ]);
    assert.equal(matchTorrents([HASH_C], index)[0]?.name, 'hybrid');
  });

  test('matching without history returns nothing', () => {
    assert.deepEqual(matchTorrents(undefined, torrentIndex([{ hash: HASH_A }])), []);
  });

  test('counts owners so a torrent imported into two items is flagged', () => {
    const movies = indexImports(
      [
        { movieId: 1, downloadId: HASH_A, eventType: 'downloadFolderImported' },
        { movieId: 2, downloadId: HASH_A, eventType: 'downloadFolderImported' }
      ],
      'movieId'
    );
    const owners = hashOwners([movies, new Map()]);
    const t = summarizeTorrent(
      { hash: HASH_A, ratio: 2, state: 'uploading' },
      { isPrivate: false, tracker: null, trackerUrls: ['udp://open.example:80'] },
      { owners, nowSec: NOW }
    );
    assert.equal(t.sharedWithOthers, true);
  });
});

describe('private tracker detection', () => {
  const noCall = () => {
    throw new Error('should not be called');
  };

  test('uses the `private` field from torrents/info when present (no extra calls)', async () => {
    const p = await detectPrivacy(
      { hash: 'x', private: true, tracker: 'https://portugas.org/announce/abc' },
      { properties: noCall, trackers: noCall }
    );
    assert.equal(p.isPrivate, true);
    assert.equal(p.source, 'info');
    assert.equal(p.tracker, 'portugas.org');
  });

  test('falls back to is_private from torrents/properties', async () => {
    const p = await detectPrivacy(
      { hash: 'x', tracker: 'https://tracker.example.org:443/announce' },
      { properties: async () => ({ is_private: true }), trackers: noCall }
    );
    assert.equal(p.isPrivate, true);
    assert.equal(p.source, 'properties');
    assert.equal(p.tracker, 'tracker.example.org');
  });

  test('is_private=false from properties wins over the host list', async () => {
    const p = await detectPrivacy(
      { hash: 'x', tracker: 'https://tracker.example.org/announce' },
      { properties: async () => ({ is_private: false }), privateHosts: ['example.org'] }
    );
    assert.equal(p.isPrivate, false);
  });

  test('falls back to PRIVATE_TRACKERS when qBittorrent cannot tell', async () => {
    const p = await detectPrivacy(
      { hash: 'x', tracker: '' },
      {
        properties: async () => ({}), // older qBittorrent: no is_private
        trackers: async () => [
          { url: '** [DHT] **' },
          { url: 'udp://open.tracker.net:1337/announce' },
          { url: 'https://announce.privatehd.to/abc/announce' }
        ],
        privateHosts: ['privatehd.to']
      }
    );
    assert.equal(p.isPrivate, true);
    assert.equal(p.source, 'list');
    assert.equal(p.tracker, 'announce.privatehd.to'); // the private one, not the first
  });

  test('a public tracker not on the list is not private', async () => {
    const p = await detectPrivacy(
      { hash: 'x', tracker: 'udp://tracker.opentrackr.org:1337/announce' },
      { properties: async () => null, privateHosts: ['privatehd.to'] }
    );
    assert.equal(p.isPrivate, false);
  });

  test('a failing properties call degrades to the list instead of throwing', async () => {
    const p = await detectPrivacy(
      { hash: 'x', tracker: 'https://privatehd.to/announce' },
      {
        properties: async () => {
          throw new Error('qBittorrent timed out');
        },
        privateHosts: ['privatehd.to']
      }
    );
    assert.equal(p.isPrivate, true);
  });

  test('reads announce URLs from the magnet before calling the trackers endpoint', async () => {
    const magnet = `magnet:?xt=urn:btih:${HASH_A}&tr=${encodeURIComponent('https://portugas.org/announce/k')}`;
    const p = await detectPrivacy(
      { hash: 'x', private: true, tracker: '', magnet_uri: magnet },
      { trackers: noCall }
    );
    assert.equal(p.tracker, 'portugas.org');
  });

  test('host list matching: exact, subdomain, and entries with scheme/port', () => {
    assert.equal(hostInList('portugas.org', ['portugas.org']), true);
    assert.equal(hostInList('tracker.portugas.org', ['portugas.org']), true);
    assert.equal(hostInList('portugas.org', ['https://portugas.org:443/']), true);
    assert.equal(hostInList('notportugas.org', ['portugas.org']), false);
    assert.equal(hostInList(null, ['portugas.org']), false);
  });

  test('a private torrent with no known tracker is protected (never guess)', () => {
    const t = summarizeTorrent(
      { hash: HASH_A, ratio: 0.2, state: 'stoppedUP' },
      { isPrivate: true, tracker: null, trackerUrls: [] },
      { nowSec: NOW }
    );
    assert.equal(t.protected, true);
  });
});

// --- Plan & guards -------------------------------------------------------------

function torrent(overrides = {}) {
  const { privacy, ...raw } = overrides;
  return summarizeTorrent(
    { hash: HASH_A, name: 'Movie.2020.1080p', size: 10e9, ratio: 2, seeding_time: 0, state: 'uploading', ...raw },
    privacy || { isPrivate: false, tracker: 'open.example', trackerUrls: ['udp://open.example:80'] },
    { nowSec: NOW }
  );
}

const PORTUGAS = {
  isPrivate: true,
  tracker: 'portugas.org',
  trackerUrls: ['https://portugas.org/announce/k']
};
const OTHER_PRIVATE = {
  isPrivate: true,
  tracker: 'privatehd.to',
  trackerUrls: ['https://privatehd.to/announce']
};

function movieItem(torrents, files = [{ size: 10e9, nlink: 2 }]) {
  return {
    type: 'movie',
    id: 5,
    title: 'Movie',
    files,
    torrents,
    hasImports: torrents === null || torrents.length > 0
  };
}

const ALL = { deleteFiles: true, deleteTorrent: true, addExclusion: false };

describe('delete plan', () => {
  test('deletes the torrent first, then the *arr', () => {
    const plan = buildPlan(movieItem([torrent()]), ALL);
    assert.equal(plan.blocked, null);
    assert.deepEqual(plan.steps.map((s) => s.kind), ['torrent', 'arr']);
  });

  test('Portugas below the HnR floors: torrent deletion blocked', () => {
    const item = movieItem([torrent({ ratio: 0.4, seeding_time: 3 * DAY, privacy: PORTUGAS })]);
    const plan = buildPlan(item, ALL);
    assert.equal(plan.torrentGuard.allowed, false);
    assert.equal(plan.torrentGuard.reason, 'hnr');
    assert.ok(plan.blocked);
  });

  test('Portugas below the floors can still be removed from the *arr, keeping the torrent', () => {
    const item = movieItem([torrent({ ratio: 0.4, privacy: PORTUGAS })]);
    const plan = buildPlan(item, { ...ALL, deleteTorrent: false });
    assert.equal(plan.blocked, null);
    assert.deepEqual(plan.steps.map((s) => s.kind), ['arr']);
    assert.equal(plan.freed.bytes, 0); // hardlinked: the torrent still holds the blocks
  });

  test('Portugas with 168h seeded is allowed, but ratio < 1 still requires the title', () => {
    const item = movieItem([torrent({ ratio: 0.5, seeding_time: 7 * DAY, privacy: PORTUGAS })]);
    const plan = buildPlan(item, ALL);
    assert.equal(plan.blocked, null);
    assert.equal(plan.requiresTitle, true);
  });

  test('Portugas at ratio 1 is allowed without typing the title', () => {
    const plan = buildPlan(movieItem([torrent({ ratio: 1, privacy: PORTUGAS })]), ALL);
    assert.equal(plan.blocked, null);
    assert.equal(plan.requiresTitle, false);
    assert.equal(plan.isPrivate, true);
  });

  test('ratio 0.996 is not rounded up to 1.00', () => {
    const plan = buildPlan(movieItem([torrent({ ratio: 0.996, privacy: OTHER_PRIVATE })]), ALL);
    assert.equal(plan.requiresTitle, true);
  });

  test('another private tracker below ratio 1 needs the title but is not HnR-locked', () => {
    const plan = buildPlan(movieItem([torrent({ ratio: 0.3, privacy: OTHER_PRIVATE })]), ALL);
    assert.equal(plan.blocked, null);
    assert.equal(plan.requiresTitle, true);
  });

  test('a torrent still importing blocks the whole deletion', () => {
    const t = summarizeTorrent(
      { hash: HASH_A, ratio: 2, state: 'uploading' },
      { isPrivate: false, tracker: null, trackerUrls: ['udp://x:1'] },
      { busy: new Set([HASH_A.toLowerCase()]), nowSec: NOW }
    );
    assert.ok(buildPlan(movieItem([t]), { ...ALL, deleteTorrent: false }).blocked);
  });

  test('unverifiable torrents (qBittorrent down) block torrent deletion only', () => {
    const item = { ...movieItem(null), torrentsError: 'qBittorrent unavailable' };
    assert.ok(buildPlan(item, ALL).blocked);
    assert.equal(buildPlan(item, { ...ALL, deleteTorrent: false }).blocked, null);
  });
});

describe('space estimate', () => {
  test('hardlinked library + torrent counts the blocks once', () => {
    const freed = estimateFreed({
      files: [{ size: 10e9, nlink: 2 }],
      torrents: [{ size: 10.2e9 }] // + sample/nfo
    });
    assert.equal(freed.bytes, 10.2e9);
    assert.equal(freed.hardlinked, true);
  });

  test('keeping the torrent seeding frees only unlinked library files', () => {
    const freed = estimateFreed({
      files: [
        { size: 10e9, nlink: 2 },
        { size: 1e9, nlink: 1 }
      ],
      torrents: [{ size: 10e9 }],
      deleteTorrent: false
    });
    assert.equal(freed.bytes, 1e9);
    assert.equal(freed.heldBySeeding, 10e9);
  });

  test('no torrent: every unlinked library byte is freed', () => {
    const freed = estimateFreed({ files: [{ size: 4e9, nlink: 1 }], torrents: [] });
    assert.equal(freed.bytes, 4e9);
    assert.equal(freed.hardlinked, false);
  });

  test('files we could not stat make the estimate inexact and hardlinked unknown', () => {
    const freed = estimateFreed({ files: [{ size: 4e9, nlink: null }], torrents: [{ size: 4e9 }] });
    assert.equal(freed.exact, false);
    assert.equal(freed.hardlinked, null);
    assert.equal(freed.bytes, 4e9);
  });
});

describe('plan execution', () => {
  const plan = {
    steps: [
      { kind: 'torrent', hash: 'a' },
      { kind: 'torrent', hash: 'b' },
      { kind: 'arr', id: 5 }
    ]
  };

  test('runs every step in order when all succeed', async () => {
    const calls = [];
    const res = await executePlan(plan, {
      removeTorrent: async (h) => calls.push(`t:${h}`),
      deleteItem: async (s) => calls.push(`arr:${s.id}`)
    });
    assert.equal(res.ok, true);
    assert.deepEqual(calls, ['t:a', 't:b', 'arr:5']);
  });

  test('a failed torrent delete stops before the *arr and reports each step', async () => {
    let arrCalled = false;
    const res = await executePlan(plan, {
      removeTorrent: async (h) => {
        if (h === 'b') throw new Error('qBittorrent responded 500');
      },
      deleteItem: async () => {
        arrCalled = true;
      }
    });
    assert.equal(res.ok, false);
    assert.equal(arrCalled, false);
    assert.deepEqual(res.steps.map((s) => s.status), ['ok', 'error', 'skipped']);
    assert.match(res.steps[1].error, /500/);
  });

  test('an *arr failure after a successful torrent delete is reported, not swallowed', async () => {
    const res = await executePlan(plan, {
      removeTorrent: async () => {},
      deleteItem: async () => {
        throw new Error('Radarr 503');
      }
    });
    assert.equal(res.ok, false);
    assert.deepEqual(res.steps.map((s) => s.status), ['ok', 'ok', 'error']);
  });
});
