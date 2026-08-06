import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2, RefreshCw, Loader2, ShieldCheck, Hourglass, HardDrive } from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';
import { bytes, truncate } from '../lib/format.js';

function seededLabel(hours) {
  if (hours >= 48) return `${Math.round(hours / 24)}d`;
  return `${hours}h`;
}

function reasonPill(item) {
  if (item.importing) {
    return (
      <span className="shrink-0 rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
        Importing
      </span>
    );
  }
  if (item.reason === 'ratio') {
    return (
      <span className="shrink-0 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
        Ratio met
      </span>
    );
  }
  if (item.reason === 'time') {
    return (
      <span className="shrink-0 rounded-md bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
        Seed time met
      </span>
    );
  }
  return null;
}

function TorrentRow({ item, thresholds, action }) {
  const meta = [
    bytes(item.size),
    `ratio ${item.ratio.toFixed(2)} / ${thresholds.ratio.toFixed(1)}`,
    `seeded ${seededLabel(item.seededHours)} / ${seededLabel(thresholds.seedHours)}`,
    item.trackerHost
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="flex items-center gap-3 rounded-lg bg-night-900 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-parchment" title={item.name}>
          {truncate(item.name, 80)}
        </p>
        <p className="mt-0.5 text-xs text-silver">{meta}</p>
      </div>
      {reasonPill(item)}
      {action}
    </div>
  );
}

export default function LibraryTab() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null); // hash currently deleting, or 'all'

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.seeding());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ready = useMemo(() => (data?.items || []).filter((i) => i.eligible), [data]);
  const seeding = useMemo(() => (data?.items || []).filter((i) => !i.eligible), [data]);
  const readySize = useMemo(() => ready.reduce((s, i) => s + (i.size || 0), 0), [ready]);

  async function remove(items, key) {
    const label =
      items.length === 1 ? `“${truncate(items[0].name, 60)}”` : `${items.length} torrents`;
    const total = bytes(items.reduce((s, i) => s + (i.size || 0), 0));
    if (
      !window.confirm(
        `Delete ${label} from qBittorrent including downloaded files (${total})?\n\n` +
          'The imported copy in your library (Radarr/Sonarr/Jellyfin) is not touched.'
      )
    )
      return;
    setDeleting(key);
    try {
      const res = await api.seedingDelete(items.map((i) => i.hash));
      if (res.deleted.length) {
        toast.success(
          `Removed ${res.deleted.length} torrent(s) — freed up to ${bytes(
            res.deleted.reduce((s, d) => s + (d.size || 0), 0)
          )}`
        );
      }
      if (res.skipped.length) {
        toast.error(`Skipped ${res.skipped.length}: ${res.skipped[0].reason}`);
      }
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-16" />
        ))}
      </div>
    );
  }

  if (error) {
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

  const th = data?.thresholds || { ratio: 1, seedHours: 168 };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="card flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-parchment">
          <HardDrive size={15} className="text-gold" />
          {ready.length} ready · up to {bytes(readySize)}
        </span>
        <span className="inline-flex items-center gap-1.5 text-silver">
          <Hourglass size={15} />
          {seeding.length} still seeding
        </span>
        <span className="inline-flex items-center gap-1.5 text-silver">
          <ShieldCheck size={15} className="text-emerald-300" />
          {data?.protectedCount ?? 0} Portugas protected
        </span>
        <button
          onClick={load}
          disabled={loading}
          className="btn-ghost ml-auto px-2.5 py-1.5 text-xs"
          title="Refresh"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        </button>
      </div>

      {/* Ready to remove */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-silver">
            Ready to remove
          </h3>
          {ready.length > 1 && (
            <button
              onClick={() => remove(ready, 'all')}
              disabled={deleting !== null}
              className="btn-danger px-3 py-1.5 text-xs"
            >
              {deleting === 'all' ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Trash2 size={13} />
              )}
              Delete all ({ready.length})
            </button>
          )}
        </div>
        {ready.length === 0 ? (
          <p className="rounded-lg bg-night-900 px-3 py-3 text-sm text-silver">
            Nothing to clean up — every finished torrent is still earning its seed time or ratio.
          </p>
        ) : (
          ready.map((item) => (
            <TorrentRow
              key={item.hash}
              item={item}
              thresholds={th}
              action={
                <button
                  onClick={() => remove([item], item.hash)}
                  disabled={deleting !== null}
                  className="btn-danger px-2.5 py-1.5 text-xs"
                  title="Delete torrent and downloaded files"
                >
                  {deleting === item.hash ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Trash2 size={13} />
                  )}
                </button>
              }
            />
          ))
        )}
      </section>

      {/* Still seeding */}
      {seeding.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-silver">
            Still seeding
          </h3>
          {seeding.map((item) => (
            <TorrentRow key={item.hash} item={item} thresholds={th} action={null} />
          ))}
        </section>
      )}

      <p className="text-xs leading-relaxed text-silver">
        Torrents appear here once they hit ratio {th.ratio.toFixed(1)} or{' '}
        {Math.round(th.seedHours / 24)} days of seeding — the same Hit &amp; Run-safe floors the
        auto cleanup uses. Portugas torrents are <span className="text-parchment">never</span>{' '}
        listed or deletable from this screen, and every delete is re-checked on the server.
        Deleting removes the torrent and its files from the Torrents folder; your imported
        library copy stays.
      </p>
    </div>
  );
}
