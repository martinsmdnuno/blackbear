import Docker from 'dockerode';
import { existsSync } from 'node:fs';
import { getService } from '../config.js';

const SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';

let docker = null;
function client() {
  if (!docker) docker = new Docker({ socketPath: SOCKET });
  return docker;
}

function containerName(service) {
  const cfg = getService(service);
  if (!cfg?.container) throw new Error(`No container name configured for ${service}`);
  return cfg.container;
}

export function dockerAvailable() {
  return existsSync(SOCKET);
}

export async function ping() {
  await client().ping();
  return true;
}

export async function restart(service) {
  const name = containerName(service);
  await client().getContainer(name).restart();
  return { container: name, restarted: true };
}

// Docker multiplexes stdout/stderr into frames: an 8-byte header
// [stream, 0,0,0, size(4 BE)] precedes each payload chunk. Strip the headers so
// the UI gets clean text. (TTY containers send raw bytes with no header.)
function demux(buffer) {
  const lines = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const type = buffer[offset];
    const size = buffer.readUInt32BE(offset + 4);
    // Heuristic: a valid frame header has stream type 0-2 and a sane size.
    if (type > 2 || offset + 8 + size > buffer.length + 4) {
      return buffer.toString('utf8');
    }
    lines.push(buffer.toString('utf8', offset + 8, offset + 8 + size));
    offset += 8 + size;
  }
  return lines.join('') || buffer.toString('utf8');
}

export async function logs(service, tail = 200) {
  const name = containerName(service);
  const buffer = await client()
    .getContainer(name)
    .logs({ stdout: true, stderr: true, tail, timestamps: false });
  return demux(Buffer.from(buffer));
}
