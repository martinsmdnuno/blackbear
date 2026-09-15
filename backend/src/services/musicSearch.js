// Lidarr's /album/lookup matches on the album *title* only. So "Pink Floyd The
// Wall" — the way anyone actually searches — returns tribute records and string
// quartets, while "The Wall" alone returns the real thing first. These helpers
// close that gap: find the artist inside the term, search again without them,
// and rank what comes back. Kept pure so the ranking is unit-testable.

const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export { normalize };

// The artist whose name appears in the search term, longest name first so
// "Pink Floyd" wins over a hypothetical "Pink". Returns null when the term
// names no artist we were offered — the common case for a plain title search.
export function artistInTerm(term, artists) {
  const t = normalize(term);
  const hits = (artists || [])
    .map((a) => ({ artist: a, name: normalize(a.artistName) }))
    .filter((x) => x.name && t.includes(x.name))
    .sort((a, b) => b.name.length - a.name.length);
  return hits[0]?.artist || null;
}

// Prefixes of the term, longest first: "pink floyd the wall" → "pink floyd the",
// "pink floyd", "pink". The full term is not included; the caller has already
// tried it.
export function termPrefixes(term, max = 3) {
  const words = normalize(term).split(' ').filter(Boolean);
  const out = [];
  for (let n = words.length - 1; n >= 1 && out.length < max; n--) {
    out.push(words.slice(0, n).join(' '));
  }
  return out;
}

// Lidarr's artist lookup is matched against the *whole* string, so searching
// "Pink Floyd The Wall" returns tribute bands and never Pink Floyd themselves.
// When the full term finds nobody, walk back a word at a time until a prefix
// names an artist exactly. `lookup` is injected so this stays testable.
export async function findArtist(term, lookup) {
  const direct = artistInTerm(term, await lookup(term));
  if (direct) return direct;

  for (const prefix of termPrefixes(term)) {
    const artists = await lookup(prefix);
    const exact = (artists || []).find((a) => normalize(a.artistName) === prefix);
    if (exact) return exact;
  }
  return null;
}

// What's left of the term once the artist's name is removed. Empty when the
// user searched for the artist alone, which means "no album title to look up".
export function stripArtist(term, artistName) {
  const t = normalize(term);
  const n = normalize(artistName);
  if (!n || !t.includes(n)) return normalize(term);
  return t.replace(n, ' ').replace(/\s+/g, ' ').trim();
}

// Secondary types are the noise that buries a studio album: live bootlegs,
// remix editions, compilations, soundtracks. Penalised, never excluded — a
// live album is sometimes exactly what you want.
const SECONDARY_PENALTY = {
  Live: 40,
  Remix: 45,
  Compilation: 30,
  Soundtrack: 25,
  Demo: 35,
  Mixtape: 35,
  Bootleg: 60,
  Interview: 70,
  Spokenword: 60,
  Audiobook: 70
};

const TYPE_PENALTY = { Album: 0, EP: 15, Single: 35, Broadcast: 50, Other: 40 };

// Score an album against what the user typed. Higher is better.
export function scoreAlbum(album, { termTitle, artistName } = {}) {
  let score = 100;

  const albumArtist = normalize(album?.artist?.artistName);
  if (artistName) {
    // The artist the term named is the strongest signal there is: an album by
    // someone else that happens to share a title is almost never the answer.
    score += albumArtist === normalize(artistName) ? 120 : -60;
  }

  const title = normalize(album?.title);
  const wanted = normalize(termTitle);
  if (wanted) {
    if (title === wanted) score += 80;
    else if (title.startsWith(wanted)) score += 45;
    else if (title.includes(wanted)) score += 25;
    else score -= 20;
    // A title far longer than what was asked for is usually an expanded
    // edition, a tribute, or a bootleg with a date bolted on.
    score -= Math.min(30, Math.max(0, title.length - wanted.length) / 3);
  }

  score -= TYPE_PENALTY[album?.albumType] ?? 20;
  for (const t of album?.secondaryTypes || []) score -= SECONDARY_PENALTY[t] ?? 20;

  // How many people rated it, on a log scale. This is what separates Pink
  // Floyd's "The Dark Side of the Moon" from the six other records with that
  // title when the term names no artist at all — a famous album has hundreds of
  // votes, an obscure one has none. Capped so it can never outweigh an exact
  // artist match.
  const votes = album?.ratings?.votes || 0;
  score += Math.min(50, Math.round(12 * Math.log10(1 + votes)));

  return score;
}

// Merge the two lookups (by title as typed, and by title minus the artist),
// drop duplicates, and order by score. Ties keep the earlier release first.
//
// Every album is scored under BOTH readings of the term and keeps its better
// score: "the artist is X, the title is the rest" and "the whole thing is a
// title". That matters because artist detection has false positives — there is
// an artist literally called "OK", so "OK Computer" would otherwise be read as
// the album "Computer" by OK, burying Radiohead's record. Under the second
// reading it matches the title exactly and wins anyway.
export function rankAlbums(albums, { termTitle, artistName, fullTerm, limit = 30 } = {}) {
  const readings = [{ termTitle, artistName }];
  if (fullTerm && normalize(fullTerm) !== normalize(termTitle)) {
    readings.push({ termTitle: fullTerm, artistName: null });
  }

  const seen = new Set();
  const unique = [];
  for (const a of albums || []) {
    const key = a?.foreignAlbumId || `${normalize(a?.artist?.artistName)}|${normalize(a?.title)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(a);
  }

  return unique
    .map((a) => ({ album: a, score: Math.max(...readings.map((r) => scoreAlbum(a, r))) }))
    .sort((x, y) => y.score - x.score || String(x.album.releaseDate).localeCompare(String(y.album.releaseDate)))
    .slice(0, limit)
    .map((x) => x.album);
}
