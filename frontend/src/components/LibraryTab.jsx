import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Trash2,
  RefreshCw,
  Loader2,
  HardDrive,
  Film,
  Tv,
  Search,
  FlaskConical,
  AlertTriangle,
  Upload
} from 'lucide-react';
import { api } from '../api/client.js';
import PrivateTrackerBadge from './PrivateTrackerBadge.jsx';
import DeleteItemSheet from './DeleteItemSheet.jsx';
import SeedingCleanup from './SeedingCleanup.jsx';
import { bytes, shortDate } from '../lib/format.js';

const SIMULATE_KEY = 'blackbeard.library.simulate';

const SORTS = {
  'size-desc': (a, b) => b.sizeOnDisk - a.sizeOnDisk,
  'size-asc': (a, b) => a.sizeOnDisk - b.sizeOnDisk,
  'added-desc': (a, b) => (b.added || '').localeCompare(a.added || ''),
  'added-asc': (a, b) => (a.added || '').localeCompare(b.added || '')
};

// Radarr hands out TMDb "original" posters (several MB each); a row thumbnail
// only needs the small size.
const thumb = (url) => url?.replace('/t/p/original/', '/t/p/w185/') || null;

function readSimulate() {
  try {
    return localStorage.getItem(SIMULATE_KEY) !== 'off';
  } catch {
    return true;
  }
}

// One badge per private tracker, each carrying that tracker's torrents.
function privateGroups(torrents) {
  const map = new Map();
  for (const t of torrents || []) {
    if (!t.isPrivate) continue;
    const key = t.tracker || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  }
  return [...map.entries()];
}

function Select({ value, onChange, children, label }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input py-2"
    >
      {children}
    </select>
  );
}

function Pill({ tone, children, title }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      {children}
    </span>
  );
}

function LibraryRow({ item, onDelete }) {
  const TypeIcon = item.type === 'movie' ? Film : Tv;
  const meta = [
    bytes(item.sizeOnDisk),
    item.quality,
    item.type === 'series' ? `${item.fileCount} ep${item.fileCount === 1 ? '' : 's'}` : null,
    item.added ? `added ${shortDate(item.added)}` : null
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="card flex min-w-0 gap-3 p-2.5">
      <div className="flex h-[4.5rem] w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-night-800">
        {item.poster ? (
          <img src={thumb(item.poster)} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <TypeIcon size={18} className="text-silver" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-parchment" title={item.title}>
          {item.title}
          {item.year && <span className="font-normal text-silver"> ({item.year})</span>}
        </p>
        <p className="truncate text-xs text-silver">{meta}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Pill tone="bg-night-700 text-silver">
            <TypeIcon size={11} /> {item.type === 'movie' ? 'Movie' : 'Series'}
          </Pill>
          {privateGroups(item.torrents).map(([tracker, torrents]) => (
            <PrivateTrackerBadge key={tracker} tracker={tracker} torrents={torrents} />
          ))}
          {item.seeding && (
            <Pill tone="bg-emerald-500/15 text-emerald-300">
              <Upload size={11} /> Seeding
            </Pill>
          )}
          {item.torrents?.length === 0 && <Pill tone="bg-night-800 text-silver">No torrent</Pill>}
          {item.torrents === null && (
            <Pill tone="bg-night-800 text-silver" title={item.torrentsError || ''}>
              Torrent unknown
            </Pill>
          )}
        </div>
      </div>

      <button
        onClick={() => onDelete(item)}
        className="btn-danger shrink-0 self-center px-2.5 py-1.5 text-xs"
        title="Delete…"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function LibraryItems() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [privacy, setPrivacy] = useState('any');
  const [seeding, setSeeding] = useState('any');
  const [sort, setSort] = useState('size-desc');
  const [simulate, setSimulate] = useState(readSimulate);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.library());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleSimulate() {
    setSimulate((v) => {
      try {
        localStorage.setItem(SIMULATE_KEY, v ? 'off' : 'on');
      } catch {
        // storage unavailable — the toggle still works for this visit
      }
      return !v;
    });
  }

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.items || [])
      .filter((i) => type === 'all' || i.type === type)
      .filter((i) => privacy === 'any' || i.isPrivate === (privacy === 'yes'))
      .filter((i) => seeding === 'any' || i.seeding === (seeding === 'yes'))
      .filter((i) => !q || i.title.toLowerCase().includes(q))
      .sort(SORTS[sort]);
  }, [data, query, type, privacy, seeding, sort]);

  const filtered = items.length !== (data?.items?.length || 0);
  const shownSize = items.reduce((s, i) => s + (i.sizeOnDisk || 0), 0);
  const serviceErrors = Object.entries(data?.errors || {}).filter(([, e]) => e);

  if (loading && !data) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton h-20" />
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-blood/40 bg-blood/10 px-3 py-2.5 text-sm text-blood-light">
          {error}
        </p>
        <button onClick={load} className="btn-ghost text-sm">
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-parchment">
          <HardDrive size={15} className="shrink-0 text-gold" />
          <span className="font-semibold">{bytes(data?.totals?.sizeOnDisk || 0)}</span>
          <span className="text-silver">· {data?.totals?.count || 0} titles</span>
        </span>
        {filtered && (
          <span className="text-silver">
            showing {items.length} · {bytes(shownSize)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={toggleSimulate}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
              simulate ? 'bg-gold/20 text-gold-light ring-1 ring-gold/40' : 'bg-night-700/70 text-silver'
            }`}
            aria-pressed={simulate}
            title="In simulation mode, deletes only show what would happen"
          >
            <FlaskConical size={13} /> Simulation {simulate ? 'on' : 'off'}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="btn-ghost px-2.5 py-1.5 text-xs"
            title="Refresh"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </button>
        </div>
      </div>

      {serviceErrors.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
          {serviceErrors.map(([svc, e]) => (
            <p key={svc} className="flex gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                <span className="font-semibold capitalize">{svc}</span>: {e}
              </span>
            </p>
          ))}
        </div>
      )}

      {/* Search, filters, sort */}
      <div className="space-y-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-silver" />
          <input
            className="input pl-9"
            placeholder="Search titles"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Select label="Type" value={type} onChange={setType}>
            <option value="all">Movies &amp; series</option>
            <option value="movie">Movies</option>
            <option value="series">Series</option>
          </Select>
          <Select label="Private tracker" value={privacy} onChange={setPrivacy}>
            <option value="any">Any tracker</option>
            <option value="yes">Private tracker</option>
            <option value="no">Not private</option>
          </Select>
          <Select label="Seeding" value={seeding} onChange={setSeeding}>
            <option value="any">Seeding or not</option>
            <option value="yes">Still seeding</option>
            <option value="no">Not seeding</option>
          </Select>
          <Select label="Sort" value={sort} onChange={setSort}>
            <option value="size-desc">Largest first</option>
            <option value="size-asc">Smallest first</option>
            <option value="added-desc">Newest first</option>
            <option value="added-asc">Oldest first</option>
          </Select>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg bg-night-900 px-3 py-3 text-sm text-silver">
          {data?.items?.length ? 'Nothing matches these filters.' : 'No movies or series on disk.'}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <LibraryRow key={item.key} item={item} onDelete={setDeleting} />
          ))}
        </div>
      )}

      {deleting && (
        <DeleteItemSheet
          item={deleting}
          simulate={simulate}
          onClose={(changed) => {
            setDeleting(null);
            if (changed) load();
          }}
        />
      )}
    </div>
  );
}

// Library tab: every title on disk (default), plus the torrent-centric cleanup
// of finished torrents under "Torrents".
export default function LibraryTab() {
  const [view, setView] = useState('library');
  const tabs = [
    { id: 'library', label: 'Library' },
    { id: 'torrents', label: 'Torrents' }
  ];
  return (
    <div className="space-y-4">
      <div className="flex rounded-lg border border-gold/20 bg-night-850 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              view === t.id ? 'bg-gold text-night-950' : 'text-silver hover:text-parchment'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {view === 'library' ? <LibraryItems /> : <SeedingCleanup />}
    </div>
  );
}
