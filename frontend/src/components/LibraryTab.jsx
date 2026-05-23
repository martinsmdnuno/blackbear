import { useCallback, useEffect, useMemo, useState } from 'react';
import { Film, Tv, Trash2, Loader2, RefreshCw, Search, CheckCircle2 } from 'lucide-react';
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
        <p className="mt-1 text-sm text-silver">{truncate(item.title, 80)}{item.year ? ` (${item.year})` : ''}</p>
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
              {deleteFiles ? 'Permanently removes the files from /Volumes/ALBATROZ.' : 'Removes the entry but keeps the files on disk.'}
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
      {item.monitored && <CheckCircle2 size={15} className="shrink-0 text-emerald-400/70" title="Monitored" />}
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
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
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
  }, [load]);

  const section = kind === 'movie' ? data?.movies : data?.series;
  const items = useMemo(() => {
    const list = section?.items || [];
    const q = filter.trim().toLowerCase();
    return q ? list.filter((i) => i.title.toLowerCase().includes(q)) : list;
  }, [section, filter]);

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

  return (
    <div className="space-y-4">
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
