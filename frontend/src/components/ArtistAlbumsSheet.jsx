import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Loader2, Check, Disc3, Download, Search } from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';
import { artwork, bytes } from '../lib/format.js';

const GROUPS = [
  { id: 'album', label: 'Albums' },
  { id: 'ep', label: 'EPs' },
  { id: 'live', label: 'Live' },
  { id: 'compilation', label: 'Compilations' },
  { id: 'single', label: 'Singles' },
  { id: 'other', label: 'Other' }
];

function Cover({ src }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-night-800">
      {src && !broken ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-silver/60">
          <Disc3 size={18} />
        </div>
      )}
    </div>
  );
}

function LibraryState({ lib }) {
  if (!lib) return null;
  if (lib.complete) {
    return (
      <span className="flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
        <Check size={11} /> On disk{lib.sizeOnDisk > 0 ? ` · ${bytes(lib.sizeOnDisk)}` : ''}
      </span>
    );
  }
  return (
    <span className="text-[11px] text-silver">
      {lib.trackFileCount > 0 ? `${lib.trackFileCount}/${lib.totalTrackCount} tracks · ` : ''}
      {lib.monitored ? 'monitored' : 'not monitored'}
    </span>
  );
}

// An artist's discography, to pick from. You search the band — the thing you
// remember — and choose the records here, instead of having to know the album
// title up front. A new artist goes on to the add sheet with just the ticked
// albums; one already in Lidarr gets them monitored and searched straight away.
export default function ArtistAlbumsSheet({ artist, onClose, onAddAlbums, onAddAll }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [shown, setShown] = useState(new Set(['album']));
  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.artistAlbums(artist.foreignArtistId));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [artist.foreignArtistId]);

  useEffect(() => {
    load();
  }, [load]);

  const inLibrary = Boolean(data?.artist?.id);
  const albums = data?.albums || [];

  const counts = useMemo(() => {
    const c = {};
    for (const a of albums) c[a.group] = (c[a.group] || 0) + 1;
    return c;
  }, [albums]);

  // An artist with no studio albums (a singles act, a live band) would open on
  // an empty list — start on whatever they do have instead.
  useEffect(() => {
    if (!albums.length || counts.album) return;
    const first = GROUPS.find((g) => counts[g.id]);
    if (first) setShown(new Set([first.id]));
  }, [albums, counts]);

  const needle = filter.trim().toLowerCase();
  const visible = albums.filter(
    (a) => (needle ? a.title.toLowerCase().includes(needle) : shown.has(a.group))
  );

  // In the library, only albums Lidarr actually created can be grabbed; the
  // rest were filtered out by the artist's metadata profile.
  const selectable = (a) => !inLibrary || Boolean(a.library);
  const visibleSelectable = visible.filter(selectable);
  const allVisiblePicked =
    visibleSelectable.length > 0 && visibleSelectable.every((a) => picked.has(a.foreignAlbumId));

  function toggle(a) {
    if (!selectable(a)) return;
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(a.foreignAlbumId)) next.delete(a.foreignAlbumId);
      else next.add(a.foreignAlbumId);
      return next;
    });
  }

  function toggleAllVisible() {
    setPicked((p) => {
      const next = new Set(p);
      for (const a of visibleSelectable) {
        if (allVisiblePicked) next.delete(a.foreignAlbumId);
        else next.add(a.foreignAlbumId);
      }
      return next;
    });
  }

  function toggleGroup(id) {
    setFilter('');
    setShown((s) => {
      const next = new Set(s);
      if (next.has(id) && next.size > 1) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const chosen = albums.filter((a) => picked.has(a.foreignAlbumId));

  async function grabInLibrary() {
    setBusy(true);
    try {
      await api.grabArtistAlbums(
        data.artist.id,
        chosen.map((a) => a.library.id)
      );
      toast.success(
        `Searching ${chosen.length === 1 ? `“${chosen[0].title}”` : `${chosen.length} albums`} by ${data.artist.artistName}`
      );
      setPicked(new Set());
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const name = data?.artist?.artistName || artist.artistName;
  const photo = artwork(artist.images);

  // z-40 like the other sheets, so it sits above the bottom nav. The add sheet
  // is rendered after this one in SearchTab, so it still stacks on top.
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg animate-fade-in flex-col rounded-t-3xl border border-night-700/60 bg-night-850 shadow-card md:rounded-3xl">
        <div className="flex items-start gap-3 p-5 pb-3">
          {photo && <img src={photo} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-bold text-parchment">{name}</h3>
            <p className="text-sm text-silver">
              {inLibrary ? 'Already in Lidarr — pick albums to grab' : 'Pick the albums you want'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-silver hover:text-parchment">
            <X size={20} />
          </button>
        </div>

        {data && albums.length > 0 && (
          <div className="space-y-2.5 px-5 pb-3">
            <div className="flex flex-wrap gap-1.5">
              {GROUPS.filter((g) => counts[g.id]).map((g) => {
                const on = !needle && shown.has(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => toggleGroup(g.id)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition
                                ${on ? 'bg-gold/20 text-gold' : 'bg-night-900 text-silver'}`}
                  >
                    {g.label} <span className="opacity-60">{counts[g.id]}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-silver" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by title…"
                className="input py-2 pl-9 text-sm"
              />
            </div>
            {visibleSelectable.length > 0 && (
              <button
                onClick={toggleAllVisible}
                className="text-xs font-semibold text-gold underline-offset-2 hover:underline"
              >
                {allVisiblePicked ? 'Clear these' : `Select all ${visibleSelectable.length}`}
              </button>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-5 pb-3">
          {error && (
            <p className="rounded-xl border border-blood/40 bg-blood/10 px-3 py-2.5 text-sm text-blood-light">
              {error}
            </p>
          )}
          {!data && !error && (
            <div className="flex items-center gap-2 py-6 text-sm text-silver">
              <Loader2 size={16} className="animate-spin" /> Loading discography…
            </div>
          )}
          {data && visible.length === 0 && (
            <p className="py-6 text-center text-sm text-silver">
              {albums.length ? 'Nothing matches.' : 'No releases listed for this artist.'}
            </p>
          )}

          {visible.map((a) => {
            const on = picked.has(a.foreignAlbumId);
            const can = selectable(a);
            const flavour = [a.albumType, ...(a.secondaryTypes || [])].filter(Boolean).join(' · ');
            return (
              <button
                key={a.foreignAlbumId}
                type="button"
                onClick={() => toggle(a)}
                disabled={!can}
                title={can ? undefined : "Not tracked by Lidarr — the artist's metadata profile excludes it"}
                className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition
                            ${on ? 'bg-gold/15' : 'bg-night-900 hover:bg-night-800'}
                            ${can ? '' : 'opacity-50'}`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border
                              ${on ? 'border-gold bg-gold text-night-950' : 'border-night-700'}`}
                >
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
                <Cover src={a.cover} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-semibold ${on ? 'text-gold' : 'text-parchment'}`}>
                    {a.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-silver">
                    {a.year && <span>{a.year}</span>}
                    {flavour && <span>{flavour}</span>}
                    <LibraryState lib={a.library} />
                    {!can && <span>not tracked by Lidarr</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {data && albums.length > 0 && (
          <div className="space-y-2 border-t border-night-700/60 p-4">
            {inLibrary ? (
              <button
                onClick={grabInLibrary}
                disabled={!chosen.length || busy}
                className="btn-gold w-full"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                {chosen.length ? `Grab ${chosen.length} album${chosen.length > 1 ? 's' : ''}` : 'Pick albums to grab'}
              </button>
            ) : (
              <>
                <button
                  onClick={() => onAddAlbums(chosen)}
                  disabled={!chosen.length}
                  className="btn-gold w-full"
                >
                  <Download size={18} />
                  {chosen.length ? `Add ${chosen.length} album${chosen.length > 1 ? 's' : ''}…` : 'Pick albums to add'}
                </button>
                <button onClick={onAddAll} className="btn-ghost w-full text-sm">
                  Add the whole discography…
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
