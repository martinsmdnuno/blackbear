import { useState } from 'react';
import { Link2, Loader2, DownloadCloud, Film, Tv } from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';

const LINK_RE = /^(magnet:|https?:\/\/)/i;

// Pull a release name out of a magnet's `dn` (display name) so Radarr/Sonarr have
// something to parse; .torrent URLs carry no name, so the user types it there.
function titleFromMagnet(url) {
  const m = /[?&]dn=([^&]+)/i.exec(url);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
  } catch {
    return '';
  }
}

const TYPES = [
  { id: 'movie', label: 'Filme', icon: Film },
  { id: 'series', label: 'Série', icon: Tv }
];

// Deliberate, targeted grab: paste a specific Portugas torrent link (magnet or a
// .torrent URL) and push it through Radarr/Sonarr so it gets grabbed, downloaded
// and imported into the library — not just dropped into qBittorrent.
export default function LinkGrab() {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [type, setType] = useState('series');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const link = url.trim();
  const valid = LINK_RE.test(link) && title.trim().length > 0;

  function onUrlChange(next) {
    setUrl(next);
    // Prefill the title from the magnet name, but never clobber what the user typed.
    if (!title.trim()) {
      const fromMagnet = titleFromMagnet(next.trim());
      if (fromMagnet) setTitle(fromMagnet);
    }
  }

  async function grab() {
    if (!valid) return;
    setBusy(true);
    try {
      const res = await api.grabLink(link, type, title.trim());
      toast.success(`Enviado para o ${res.service === 'movie' ? 'Radarr' : 'Sonarr'}`);
      setUrl('');
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
        Cola o link do torrent do Portugas (magnet ou .torrent) que queres mesmo ir buscar. É
        empurrado pelo Radarr/Sonarr, por isso o título tem de já estar na biblioteca.
      </p>

      <input
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="magnet:?xt=… ou https://…/file.torrent"
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
              onClick={() => setType(t.id)}
              className={`flex items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold transition
                          ${active ? 'bg-gold text-night-950' : 'text-silver'}`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && grab()}
          placeholder="Nome do release (ex.: Bluey.S01.1080p…)"
          className="input flex-1"
        />
        <button onClick={grab} disabled={!valid || busy} className="btn-gold sm:w-auto">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <DownloadCloud size={18} />}
          Descarregar
        </button>
      </div>
    </div>
  );
}
