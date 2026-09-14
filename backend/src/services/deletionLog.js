import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Audit trail for Library deletions: logs/deletions.json, a JSON array with one
// entry per real (non-dry-run) delete. In Docker, ./logs is mounted at
// /app/logs so it survives rebuilds.
const LOG_DIR = resolve(process.env.LOGS_PATH || './logs');
export const DELETIONS_LOG = join(LOG_DIR, 'deletions.json');

async function append(entry) {
  await mkdir(LOG_DIR, { recursive: true });
  let list = [];
  try {
    list = JSON.parse(await readFile(DELETIONS_LOG, 'utf8'));
    if (!Array.isArray(list)) throw new Error('not an array');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Unreadable log: keep it aside instead of silently overwriting history.
      await rename(DELETIONS_LOG, `${DELETIONS_LOG}.corrupt-${Date.now()}`).catch(() => {});
    }
    list = [];
  }
  list.push(entry);
  // Write-then-rename so a crash mid-write can't truncate the log.
  const tmp = `${DELETIONS_LOG}.tmp`;
  await writeFile(tmp, JSON.stringify(list, null, 2));
  await rename(tmp, DELETIONS_LOG);
}

// Serialise writes: two deletes finishing together must not race on the file.
let chain = Promise.resolve();

export function logDeletion(entry) {
  const run = chain.then(() => append(entry));
  chain = run.catch(() => {});
  return run;
}
