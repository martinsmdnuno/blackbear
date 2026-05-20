import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Trash2,
  ArrowDown,
  ArrowUp,
  Clock,
  Users,
  RefreshCw,
  Loader2,
  X
} from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';
import { bytes, speed, eta, percent, truncate } from '../lib/format.js';

const STATE_META = {
  downloading: { label: 'Downloading', cls: 'text-sky-300 bg-sky-500/15' },
  metaDL: { label: 'Fetching metadata', cls: 'text-sky-300 bg-sky-500/15' },
  forcedDL: { label: 'Downloading', cls: 'text-sky-300 bg-sky-500/15' },
  stalledDL: { label: 'Stalled', cls: 'text-amber-300 bg-amber-500/15' },
  uploading: { label: 'Seeding', cls: 'text-emerald-300 bg-emerald-500/15' },
  forcedUP: { label: 'Seeding', cls: 'text-emerald-300 bg-emerald-500/15' },
  stalledUP: { label: 'Seeding', cls: 'text-emerald-300 bg-emerald-500/15' },
  pausedDL: { label: 'Paused', cls: 'text-slate-400 bg-night-700' },
  pausedUP: { label: 'Paused', cls: 'text-slate-400 bg-night-700' },
  stoppedDL: { label: 'Paused', cls: 'text-slate-400 bg-night-700' },
  stoppedUP: { label: 'Paused', cls: 'text-slate-400 bg-night-700' },
  queuedDL: { label: 'Queued', cls: 'text-slate-400 bg-night-700' },
  queuedUP: { label: 'Queued', cls: 'text-slate-400 bg-night-700' },
  checkingDL: { label: 'Checking', cls: 'text-gold-light bg-gold/15' },
  checkingUP: { label: 'Checking', cls: 'text-gold-light bg-gold/15' },
  checkingResumeData: { label: 'Checking', cls: 'text-gold-light bg-gold/15' },
  error: { label: 'Error', cls: 'text-blood-light bg-blood/15' },
  missingFiles: { label: 'Missing files', cls: 'text-blood-light bg-blood/15' }
};

function stateMeta(state) {
  return STATE_META[state] || { label: state, cls: 'text-slate-400 bg-night-700' };
}

function isPaused(state) {
  return state?.startsWith('paused') || state?.startsWith('stopped');
}

function Section({ title, count, children }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2 px-1">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-300">{title}</h3>
        {count != null && (
          <span className="rounded-full bg-night-700 px-2 py-0.5 text-xs font-semibold text-slate-300">
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function TorrentCard({ t, busy, onToggle, onDelete }) {
  const meta = stateMeta(t.state);
  const paused = isPaused(t.state);
  return (
    <div className="card p-3.5">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold text-slate-100">{truncate(t.name, 64)}</p>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>
          {meta.label}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
        {t.category && <span className="rounded bg-night-800 px-1.5 py-0.5">{t.category}</span>}
        <span>{bytes(t.completed)} / {bytes(t.size)}</span>
      </div>

      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-night-800">
        <div
          className={`h-full rounded-full transition-all ${
            t.state === 'error' ? 'bg-blood' : paused ? 'bg-slate-500' : 'bg-gold'
          }`}
          style={{ width: percent(t.progress) }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
        <span className="font-semibold text-slate-300">{percent(t.progress)}</span>
        <span className="flex items-center gap-1">
          <ArrowDown size={13} className="text-sky-400" /> {speed(t.dlspeed)}
        </span>
        <span className="flex items-center gap-1">
          <ArrowUp size={13} className="text-emerald-400" /> {speed(t.upspeed)}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={13} /> {eta(t.eta)}
        </span>
        <span className="flex items-center gap-1">
          <Users size={13} /> {t.numSeeds}/{t.numLeechs}
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        <button onClick={onToggle} disabled={busy} className="btn-ghost flex-1 py-2">
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : paused ? (
            <Play size={16} />
          ) : (
            <Pause size={16} />
          )}
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button onClick={onDelete} disabled={busy} className="btn-danger px-3 py-2">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function QueueCard({ item }) {
  return (
    <div className="card p-3">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium text-slate-200">{truncate(item.title, 60)}</p>
        <span className="shrink-0 rounded-md bg-night-700 px-2 py-0.5 text-[11px] text-slate-300">
          {item.trackedDownloadState || item.status}
        </span>
      </div>
      {item.errorMessage && (
        <p className="mt-1 text-xs text-blood-light">{truncate(item.errorMessage, 100)}</p>
      )}
    </div>
  );
}

function DeleteDialog({ torrent, onCancel, onConfirm }) {
  const [deleteFiles, setDeleteFiles] = useState(false);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="card relative z-10 w-full max-w-sm animate-fade-in p-5">
        <h3 className="text-lg font-bold text-slate-100">Delete torrent?</h3>
        <p className="mt-1 text-sm text-slate-400">{truncate(torrent.name, 80)}</p>
        <label className="mt-4 flex items-center gap-2.5 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={deleteFiles}
            onChange={(e) => setDeleteFiles(e.target.checked)}
            className="h-4 w-4 accent-blood"
          />
          Also delete downloaded files
        </label>
        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="btn-ghost flex-1">
            Cancel
          </button>
          <button onClick={() => onConfirm(deleteFiles)} className="btn-danger flex-1">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DownloadsTab() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyHash, setBusyHash] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pull, setPull] = useState(0);
  const pullStart = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await api.downloads();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 5000);
    return () => clearInterval(id);
  }, [load]);

  // Lightweight pull-to-refresh: only engages when the page is scrolled to top.
  useEffect(() => {
    function onStart(e) {
      if (window.scrollY <= 0) pullStart.current = e.touches[0].clientY;
    }
    function onMove(e) {
      if (pullStart.current == null) return;
      const delta = e.touches[0].clientY - pullStart.current;
      if (delta > 0) setPull(Math.min(delta * 0.4, 70));
    }
    function onEnd() {
      if (pull > 50) load();
      pullStart.current = null;
      setPull(0);
    }
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [pull, load]);

  async function toggleTorrent(t) {
    setBusyHash(t.hash);
    try {
      if (isPaused(t.state)) await api.torrentResume(t.hash);
      else await api.torrentPause(t.hash);
      await load(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyHash(null);
    }
  }

  async function confirmDelete(deleteFiles) {
    const t = pendingDelete;
    setPendingDelete(null);
    setBusyHash(t.hash);
    try {
      await api.torrentDelete(t.hash, deleteFiles);
      toast.success('Torrent removed');
      await load(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyHash(null);
    }
  }

  const torrents = data?.torrents?.items || [];
  const sonarrQ = data?.sonarrQueue?.items || [];
  const radarrQ = data?.radarrQueue?.items || [];
  const bazarr = data?.bazarr;

  return (
    <div className="space-y-6">
      {pull > 0 && (
        <div className="flex justify-center" style={{ height: pull }}>
          <RefreshCw
            size={20}
            className={`text-gold ${pull > 50 ? 'animate-spin' : ''}`}
            style={{ transform: `rotate(${pull * 4}deg)` }}
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Auto-refreshing every 5s</p>
        <button
          onClick={() => load()}
          className="btn-ghost px-3 py-1.5 text-xs"
          disabled={refreshing}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-blood/40 bg-blood/10 px-3 py-2.5 text-sm text-blood-light">
          {error}
        </p>
      )}

      {!data && !error && (
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card space-y-2 p-4">
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-2 w-full" />
              <div className="skeleton h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          <Section title="Torrents" count={torrents.length}>
            {data.torrents.error && (
              <p className="rounded-xl border border-blood/30 bg-blood/10 px-3 py-2 text-xs text-blood-light">
                qBittorrent: {data.torrents.error}
              </p>
            )}
            {torrents.length === 0 && !data.torrents.error && (
              <p className="card p-4 text-center text-sm text-slate-500">No active torrents.</p>
            )}
            {torrents.map((t) => (
              <TorrentCard
                key={t.hash}
                t={t}
                busy={busyHash === t.hash}
                onToggle={() => toggleTorrent(t)}
                onDelete={() => setPendingDelete(t)}
              />
            ))}
          </Section>

          <Section title="Radarr Queue" count={radarrQ.length}>
            {data.radarrQueue.error ? (
              <p className="rounded-xl border border-blood/30 bg-blood/10 px-3 py-2 text-xs text-blood-light">
                {data.radarrQueue.error}
              </p>
            ) : radarrQ.length === 0 ? (
              <p className="card p-3 text-center text-sm text-slate-500">Nothing awaiting import.</p>
            ) : (
              radarrQ.map((item) => <QueueCard key={item.id} item={item} />)
            )}
          </Section>

          <Section title="Sonarr Queue" count={sonarrQ.length}>
            {data.sonarrQueue.error ? (
              <p className="rounded-xl border border-blood/30 bg-blood/10 px-3 py-2 text-xs text-blood-light">
                {data.sonarrQueue.error}
              </p>
            ) : sonarrQ.length === 0 ? (
              <p className="card p-3 text-center text-sm text-slate-500">Nothing awaiting import.</p>
            ) : (
              sonarrQ.map((item) => <QueueCard key={item.id} item={item} />)
            )}
          </Section>

          <Section title="Bazarr — Wanted Subtitles">
            {bazarr?.error ? (
              <p className="rounded-xl border border-blood/30 bg-blood/10 px-3 py-2 text-xs text-blood-light">
                {bazarr.error}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="card p-4 text-center">
                  <p className="text-3xl font-extrabold text-gold">{bazarr?.wantedMovies ?? 0}</p>
                  <p className="text-xs text-slate-400">Movies</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-3xl font-extrabold text-gold">{bazarr?.wantedEpisodes ?? 0}</p>
                  <p className="text-xs text-slate-400">Episodes</p>
                </div>
              </div>
            )}
          </Section>
        </>
      )}

      {pendingDelete && (
        <DeleteDialog
          torrent={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
