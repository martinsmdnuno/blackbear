import { useEffect, useRef, useState } from 'react';
import { Link2, Loader2, DownloadCloud, Film, Tv, Search, X, Check } from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';

const LINK_RE = /^(magnet:|https?:\/\/)/i;

const TYPES = [
  { id: 'movie', label: 'Filme', icon: Film },
  { id: 'series', label: 'Série', icon: Tv }
];

const posterOf = (item) => item.images?.find((i) => i.coverType === 'poster')?.remoteUrl || null;

// Deliberate, targeted grab: paste a specific Portugas .torrent link, pick the
// exact title it's for, and push it through Radarr/Sonarr. The title is added to
// the library if it isn't there yet, then the torrent is grabbed and imported.
export default function LinkGrab() {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [type, setType] = useState('series');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const debounce = useRef(null);

  const link = url.trim();
  const valid = LINK_RE.test(link) && selected && title.trim().length > 0;

  // Search Radarr/Sonarr as the user types, so they can pick the exact title
  // (and resolve same-name/same-year ambiguity) before grabbing.
  useEffect(() => {
    if (selected) return; // already picked — no need to keep searching
    clearTimeout(debounce.current);
    if (!term.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(() => {
      api
        .search(type, term.trim())
        .then((r) => setResults(r || []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 450);
    return () => clearTimeout(debounce.current);
  }, [term, type, selected]);

  function switchType(next) {
    setType(next);
    setSelected(null);
    setResults([]);
    setTerm('');
    setTitle('');
  }

  function pick(item) {
    setSelected(item);
    setResults([]);
    setTerm('');
    // Seed a parseable release name; the user can paste the exact Portugas name.
    setTitle(`${item.title}${item.year ? ` ${item.year}` : ''}`);
  }

  async function grab() {
    if (!valid) return;
    setBusy(true);
    try {
      const res = await api.grabLink(link, type, selected, title.trim());
      toast.success(
        `${res.added ? 'Adicionado e enviado' : 'Enviado'} para o ${
          res.service === 'movie' ? 'Radarr' : 'Sonarr'
        }`
      );
      setUrl('');
      setSelected(null);
      setTitle('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-2.5 p-4">
      <div className="flex items-center gap-2">
        <Link2 size={16} className="text-gold" />
        <h3 className="text-sm font-bold uppercase tracking-wide text-parchment/90">
          Descarregar por link
        </h3>
      </div>
      <p className="text-xs leading-snug text-silver">
        Cola o link direto do <span className="text-parchment/80">.torrent</span> do Portugas (com a
        tua passkey), escolhe o título e é empurrado pelo Radarr/Sonarr — adicionado à biblioteca se
        ainda não estiver, e importado no fim.
      </p>

      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://portugas.org/download.php?id=…&passkey=…"
        className="input"
      />

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-night-850 p-1">
        {TYPES.map((t) => {
          const Icon = t.icon;
          const active = type === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => switchType(t.id)}
              className={`flex items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold transition
                          ${active ? 'bg-gold text-night-950' : 'text-silver'}`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Title picker: search → pick, then show the chosen title as a chip. */}
      {selected ? (
        <div className="flex items-center gap-2.5 rounded-lg bg-night-900 p-2">
          <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-night-800">
            {posterOf(selected) && (
              <img src={posterOf(selected)} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-sm font-semibold text-parchment">
              <Check size={13} className="text-emerald-400" />
              <span className="truncate">{selected.title}</span>
            </p>
            <p className="text-xs text-silver">
              {selected.year || '—'} · {selected.id ? 'já na biblioteca' : 'será adicionado'}
            </p>
          </div>
          <button
            onClick={() => {
              setSelected(null);
              setTitle('');
            }}
            className="rounded-lg p-1 text-silver hover:text-parchment"
          >
            <X size={18} />
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-silver" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={`Procurar ${type === 'movie' ? 'o filme' : 'a série'}…`}
              className="input pl-9"
            />
            {searching && (
              <Loader2
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gold"
              />
            )}
          </div>
          {results.length > 0 && (
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {results.slice(0, 8).map((item) => (
                <button
                  key={item.tmdbId || item.tvdbId || item.titleSlug}
                  onClick={() => pick(item)}
                  className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition hover:bg-night-800"
                >
                  <div className="h-12 w-8 shrink-0 overflow-hidden rounded bg-night-800">
                    {posterOf(item) && (
                      <img src={posterOf(item)} alt="" loading="lazy" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-parchment">{item.title}</p>
                    <p className="text-xs text-silver">
                      {item.year || '—'}
                      {item.id ? ' · já na biblioteca' : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selected && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && grab()}
            placeholder="Nome do release (ex.: Obsession.2026.1080p.WEB-DL…)"
            className="input flex-1"
          />
          <button onClick={grab} disabled={!valid || busy} className="btn-gold sm:w-auto">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <DownloadCloud size={18} />}
            Descarregar
          </button>
        </div>
      )}
    </div>
  );
}
