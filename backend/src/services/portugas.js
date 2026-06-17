import * as radarr from './radarr.js';
import * as sonarr from './sonarr.js';

// The Portugas guard. Portugas is a private PT tracker with strict Hit & Run
// rules, so we don't want it grabbed for everything — only for the few titles
// (cartoons) we deliberately route there.
//
// The mechanism is native *arr indexer tagging: an indexer that carries tags is
// only ever queried for media that shares one of those tags. So once the
// Portugas indexer is tagged with TAG_LABEL, it is invisible to every untagged
// movie/series — including automatic and RSS grabs, not just manual clicks.
// Default-off protection falls out for free; the AddSheet only adds the tag to
// an item when the user explicitly opts in.
//
// Caveat the UI surfaces: Prowlarr's app sync can overwrite indexer fields. If
// the Portugas → Radarr/Sonarr sync level is "Full Sync", Prowlarr may strip the
// tag on its next sync. Set that connection to "Add and Remove Only" (or tag the
// indexer in Prowlarr itself) so the tag persists. The status endpoint lets the
// user verify the tag is actually applied rather than trusting a green check.

export const TAG_LABEL = 'portugas';
const INDEXER_MATCH = 'portugas';

const svcByName = { radarr, sonarr };

const matchesPortugas = (name) => (name || '').toLowerCase().includes(INDEXER_MATCH);

async function findTag(svc) {
  const all = await svc.tags();
  return (all || []).find((t) => (t.label || '').toLowerCase() === TAG_LABEL) || null;
}

async function ensureTag(svc) {
  const existing = await findTag(svc);
  if (existing) return existing.id;
  const created = await svc.createTag(TAG_LABEL);
  return created.id;
}

// Resolve (creating if needed) the Portugas tag id for one service — used by the
// add flow to tag an item the user is routing to Portugas.
export async function tagIdFor(serviceName) {
  const svc = svcByName[serviceName];
  if (!svc) throw new Error(`Unknown service "${serviceName}"`);
  return ensureTag(svc);
}

async function serviceStatus(svc) {
  const [tag, indexerList] = await Promise.all([findTag(svc), svc.indexers()]);
  const indexers = (indexerList || [])
    .filter((i) => matchesPortugas(i.name))
    .map((i) => ({
      id: i.id,
      name: i.name,
      tagged: tag ? (i.tags || []).includes(tag.id) : false
    }));
  return {
    tagExists: Boolean(tag),
    indexersFound: indexers.length,
    indexers,
    // Protected only when we found the indexer AND every match carries the tag.
    protected: indexers.length > 0 && indexers.every((i) => i.tagged)
  };
}

async function serviceSetup(svc) {
  const tagId = await ensureTag(svc);
  const matches = (await svc.indexers()).filter((i) => matchesPortugas(i.name));
  for (const idx of matches) {
    const current = idx.tags || [];
    if (!current.includes(tagId)) {
      await svc.updateIndexer({ ...idx, tags: [...current, tagId] });
    }
  }
  return serviceStatus(svc);
}

// Run an action for both services independently — one being down or
// misconfigured must not hide the other's result.
async function bothServices(fn) {
  const out = {};
  for (const [name, svc] of Object.entries(svcByName)) {
    try {
      out[name] = await fn(svc);
    } catch (err) {
      out[name] = { error: err.message };
    }
  }
  return out;
}

export const status = () => bothServices(serviceStatus);
export const setup = () => bothServices(serviceSetup);
