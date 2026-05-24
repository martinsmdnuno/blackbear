import { useCallback, useEffect, useMemo, useState } from 'react';
import { Film, Tv, Trash2, Loader2, RefreshCw, Search, CheckCircle2, Eye } from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';
import { bytes, truncate } from '../lib/format.js';

function DeleteDialog({ kind, item, onCancel, onConfirm }) {
  const [deleteFiles, setDeleteFiles] = useState(true);
  const [busy, setBusy] = useState(false);
  const svc = kind === 'movie' ? 'Radarr' : 'Sonarr';
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : onCancel} />
      <div className="card relative z-10 w-full max-w-sm animate-fade-in p-5">
        <h3 className="text-lg font-bold text-parchment">Delete from {svc}?</h3>
        <p className="mt-1 text-sm text-silver">
          {truncate(item.title, 80)}
          {item.year ? ` (${item.year})` : ''}
        </p>
        <label className="mt-4 flex items-start gap-2.5 text-sm text-parchment/90">
          <input
            type="checkbox"
            checked={deleteFiles}
            onChange={(e) => setDeleteFiles(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-blood"
          />
          <span>
            Also delete files from disk
            {item.sizeOnDisk > 0 && <span className="text-silver"> ({bytes(item.sizeOnDisk)})</span>}
            <span className="mt-0.5 block text-[11px] text-silver">
              {deleteFiles
                ? 'Permanently removes the files from /Volumes/ALBATROZ.'
                : 'Removes the entry but keeps the files on disk.'}
            </span>
          </span>
        </label>
        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} disabled={busy} className="btn-ghost flex-1">
            Cancel
          </button>
          <button
            onClick={async () => {
              setBusy(true);
              await onConfirm(deleteFiles);
              setBusy(false);
            }}
            disabled={busy}
            className="btn-danger flex-1"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// Horizontal poster strip for Jellyfin rows (Continue watching / Recently added).
function JellyRow({ title, items }) {
  return (
    <section className="space-y-2">
      <h3 className="px-1 text-sm font-bold uppercase tracking-wide text-parchment/90">{title}</h3>
      <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">
        {items.map((it, i) => (
          <div key={`${it.imageId}-${i}`} className="w-[92px] shrink-0">
            <div className="relative h-[138px] w-[92px] overflow-hidden rounded-md bg-night-800">
              <img
                src={`/api/jellyfin/image/${it.imageId}`}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              {it.progress > 0 && (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                  <div className="h-full bg-gold" style={{ width: `${Math.min(it.progress, 100)}%` }} />
                </div>
              )}
            </div>
            <p className="mt-1 truncate text-[11px] text-parchment">{it.title}</p>
            {it.sub ? <p className="truncate text-[10px] text-silver">{it.sub}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function Row({ item, kind, onDelete }) {
  return (
    <div className="card flex items-center gap-3 p-2.5">
      <div className="h-16 w-11 shrink-0 overflow-hidden rounded bg-night-800">
        {item.poster ? (
          <img src={item.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-silver/60">
            {kind === 'movie' ? <Film size={16} /> : <Tv size={16} />}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-parchment">{item.title}</p>
        <p className="text-xs text-silver">
          {item.year || '—'}
          {item.sizeOnDisk > 0 && <span> · {bytes(item.sizeOnDisk)}</span>}
          {kind === 'series' && item.episodes != null && <span> · {item.episodes} eps</span>}
        </p>
      </div>
      {item.watched && (
        <span className="flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-300">
          <Eye size={12} /> Watched
        </span>
      )}
      {item.monitored && !item.watched && (
        <CheckCircle2 size={15} className="shrink-0 text-emerald-400/60" title="Monitored" />
      )}
      <button onClick={onDelete} className="btn-danger shrink-0 px-2.5 py-2">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

export default function LibraryTab() {
  const toast = useToast();
  const [kind, setKind] = useState('movie');
  const [data, setData] = useState(null);
  const [jelly, setJelly] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [watchedOnly, setWatchedOnly] = useState(false);
  const [pending, setPending] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.library();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Jellyfin is best-effort: if not configured, the rows simply don't appear.
    api
      .jellyfin()
      .then(setJelly)
      .catch(() => setJelly(null));
  }, [load]);

  const section = kind === 'movie' ? data?.movies : data?.series;
  const items = useMemo(() => {
    let list = section?.items || [];
    if (watchedOnly) list = list.filter((i) => i.watched);
    const q = filter.trim().toLowerCase();
    return q ? list.filter((i) => i.title.toLowerCase().includes(q)) : list;
  }, [section, filter, watchedOnly]);

  async function confirmDelete(deleteFiles) {
    const it = pending;
    try {
      if (kind === 'movie') await api.deleteMovie(it.id, deleteFiles);
      else await api.deleteSeries(it.id, deleteFiles);
      toast.success(`${it.title} deleted${deleteFiles ? ' (with files)' : ''}`);
      setData((d) => ({
        ...d,
        [kind === 'movie' ? 'movies' : 'series']: {
          ...section,
          items: section.items.filter((x) => x.id !== it.id)
        }
      }));
      setPending(null);
    } catch (err) {
      toast.error(err.message);
    }
  }

  const hasJelly = jelly && (jelly.continueWatching?.length || jelly.recentlyAdded?.length);

  return (
    <div className="space-y-4">
      {hasJelly ? (
        <>
          {jelly.continueWatching?.length > 0 && (
            <JellyRow title="Continue watching" items={jelly.continueWatching} />
          )}
          {jelly.recentlyAdded?.length > 0 && (
            <JellyRow title="Recently added" items={jelly.recentlyAdded} />
          )}
        </>
      ) : null}

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-night-850 p-1">
        {[
          { id: 'movie', label: 'Movies', icon: Film },
          { id: 'series', label: 'Series', icon: Tv }
        ].map((t) => {
          const Icon = t.icon;
          const active = kind === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setKind(t.id)}
              className={`flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-semibold transition
                          ${active ? 'bg-gold text-night-950' : 'text-silver'}`}
            >
              <Icon size={18} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-silver" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by title…"
            className="input pl-9"
          />
        </div>
        <button
          onClick={() => setWatchedOnly((v) => !v)}
          title="Show only titles watched in Jellyfin"
          className={`btn shrink-0 px-3 py-2.5 ${watchedOnly ? 'bg-gold text-night-950' : 'bg-night-700/70 text-parchment'}`}
        >
          <Eye size={16} /> Watched
        </button>
        <button onClick={load} disabled={loading} className="btn-ghost px-3 py-2.5">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <p className="rounded-md border border-blood/40 bg-blood/10 px-3 py-2.5 text-sm text-blood-light">
          {error}
        </p>
      )}
      {section?.error && (
        <p className="rounded-md border border-blood/30 bg-blood/10 px-3 py-2 text-xs text-blood-light">
          {section.error}
        </p>
      )}

      {!data && !error ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-[76px] w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <p className="px-1 text-xs text-silver">
            {items.length} {kind === 'movie' ? 'movies' : 'series'}
            {watchedOnly && ' watched'}
            {filter && ` matching “${filter}”`}
          </p>
          <div className="space-y-2">
            {items.map((it) => (
              <Row key={it.id} item={it} kind={kind} onDelete={() => setPending(it)} />
            ))}
            {items.length === 0 && (
              <p className="card p-4 text-center text-sm text-silver">Nothing here.</p>
            )}
          </div>
        </>
      )}

      {pending && (
        <DeleteDialog
          kind={kind}
          item={pending}
          onCancel={() => setPending(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
