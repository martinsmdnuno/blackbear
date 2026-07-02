import { httpRequest } from './http.js';

// Resolve the real release name for a torrent link. The *arr push pipeline reads
// quality (1080p, WEB-DL, …) straight out of the release *title*, so a bare
// "Enola Holmes 3 2026" parses as Unknown quality and gets rejected by the
// profile. The actual scene name lives inside the .torrent (its `info.name`) or,
// for a magnet, in the `dn` parameter — this pulls it out so the UI can seed the
// title field with something the *arr can actually parse.

// Minimal bencode decoder — just enough to pull `info.name` out of a .torrent.
// Dict keys come back as utf8 strings; byte-string values stay Buffers so binary
// fields (e.g. `pieces`) survive intact and callers decode only what they need.
function bdecode(buf) {
  let pos = 0;

  function decode() {
    const c = buf[pos];
    if (c === 0x69) return decodeInt(); // 'i'
    if (c === 0x6c) return decodeList(); // 'l'
    if (c === 0x64) return decodeDict(); // 'd'
    if (c >= 0x30 && c <= 0x39) return decodeStr(); // 0-9
    throw new Error('Malformed torrent bencode');
  }

  function decodeInt() {
    pos++; // skip 'i'
    const end = buf.indexOf(0x65, pos); // 'e'
    if (end < 0) throw new Error('Malformed torrent bencode');
    const n = Number(buf.toString('ascii', pos, end));
    pos = end + 1;
    return n;
  }

  function decodeStr() {
    const colon = buf.indexOf(0x3a, pos); // ':'
    if (colon < 0) throw new Error('Malformed torrent bencode');
    const len = Number(buf.toString('ascii', pos, colon));
    const start = colon + 1;
    pos = start + len;
    if (!Number.isFinite(len) || pos > buf.length) throw new Error('Malformed torrent bencode');
    return buf.subarray(start, pos);
  }

  function decodeList() {
    pos++; // skip 'l'
    const out = [];
    while (buf[pos] !== 0x65) out.push(decode());
    pos++; // skip 'e'
    return out;
  }

  function decodeDict() {
    pos++; // skip 'd'
    const out = {};
    while (buf[pos] !== 0x65) {
      const key = decodeStr().toString('utf8');
      out[key] = decode();
    }
    pos++; // skip 'e'
    return out;
  }

  return decode();
}

function nameFromMagnet(url) {
  const dn = new URL(url).searchParams.get('dn');
  if (!dn) throw new Error('Magnet sem nome (dn)');
  return dn.trim();
}

async function nameFromTorrentFile(url) {
  const res = await httpRequest(url, { label: 'Portugas', timeout: 15000 });
  const buf = Buffer.from(await res.arrayBuffer());
  // A .torrent is a bencoded dict, so it starts with 'd'. Anything else (an HTML
  // login/passkey page, an error) isn't parseable — say so rather than dumping a
  // cryptic bencode error.
  if (buf[0] !== 0x64) throw new Error('Link não devolveu um .torrent (passkey/login?)');
  const meta = bdecode(buf);
  const name = meta?.info?.name;
  if (!name) throw new Error('.torrent sem info.name');
  return (Buffer.isBuffer(name) ? name.toString('utf8') : String(name)).trim();
}

// Best-effort: return the parseable release name for a magnet or .torrent URL.
export async function resolveReleaseName(url) {
  const link = (url || '').trim();
  if (/^magnet:/i.test(link)) return nameFromMagnet(link);
  if (/^https?:\/\//i.test(link)) return nameFromTorrentFile(link);
  throw new Error('Link inválido');
}
