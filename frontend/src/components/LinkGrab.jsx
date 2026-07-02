import { useState } from 'react';
import { Link2, Loader2, DownloadCloud } from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';

const LINK_RE = /portugas\.org\/.*?\d/i;

// Paste a Portugas link, nothing else. The backend resolves the torrent via the
// Portugas API (with the token Prowlarr already holds), figures out whether it's
// a movie or a series, adds it to Radarr/Sonarr if needed, and grabs it.
export default function LinkGrab() {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const link = url.trim();
  const valid = LINK_RE.test(link) && !busy;

  async function grab() {
    if (!valid) return;
    setBusy(true);
    try {
      const res = await api.grabLink(link);
      const service = res.service === 'series' ? 'Sonarr' : 'Radarr';
      toast.success(
        `${res.added ? 'Adicionado e enviado' : 'Enviado'} para o ${service}: ${res.title}`
      );
      setUrl('');
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
        Cola o link de um torrent do <span className="text-parchment/80">Portugas</span> e a app trata
        do resto — descobre se é filme ou série, adiciona ao Radarr/Sonarr se ainda não estiver, e
        descarrega.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && grab()}
          placeholder="https://portugas.org/torrents/130418"
          className="input flex-1"
        />
        <button onClick={grab} disabled={!valid} className="btn-gold sm:w-auto">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <DownloadCloud size={18} />}
          Descarregar
        </button>
      </div>
    </div>
  );
}
