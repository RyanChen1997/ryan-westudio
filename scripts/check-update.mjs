import { open, mkdir, rename, writeFile, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const edition = 'open-source';
const repository = 'RyanChen1997/ryan-westudio';
const endpoint = `https://api.github.com/repos/${repository}/releases/latest`;
const maxAge = 86_400_000;
const maxBody = 256 * 1024;
const versionPattern = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
const valid = value => typeof value === 'string' && versionPattern.test(value);
const newer = (latest, current) => {
  const a = latest.split('.').map(Number), b = current.split('.').map(Number);
  return (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) > 0;
};
async function readJSON(file, signal) {
  const handle = await open(file, 'r');
  try {
    const stat = await handle.stat(), limit = 64 * 1024;
    if (!stat.isFile() || stat.size > limit) throw new Error('Invalid local JSON size');
    const bytes = Buffer.alloc(limit + 1);
    let offset = 0;
    while (offset <= limit) {
      signal.throwIfAborted();
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) return JSON.parse(bytes.subarray(0, offset).toString('utf8'));
      offset += bytesRead;
    }
    throw new Error('Invalid local JSON size');
  } finally { await handle.close(); }
}

function report(current, release, cached = false) {
  const { version: latest, notes } = release;
  const available = newer(latest, current);
  return { ok: true, edition, status: available ? 'update_available' : 'up_to_date', current, latest, cached,
    ...(available && { notes, tag: release.tag, url: `https://github.com/${repository}/releases/tag/${release.tag}`,
      archiveUrl: `https://github.com/${repository}/archive/refs/tags/${release.tag}.zip` }) };
}

export async function checkUpdate({ useCache = false, cachePath = resolve(homedir(), '.ryan-westudio', 'open-source-update-check.json'),
  fetcher = fetch, timeoutMs = 10_000, packageFile = new URL('../package.json', import.meta.url) } = {}) {
  let current = null;
  const failure = error => ({ ok: false, edition, status: 'check_failed', current, error });
  const signal = AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, 10_000)));
  try {
    current = (await readJSON(packageFile, signal)).version ?? null;
    if (!valid(current)) return failure('INVALID_LOCAL_VERSION');
    if (useCache) {
      const cached = await readJSON(cachePath, signal).catch(() => null);
      const age = Date.now() - cached?.checkedAt;
      if (age >= 0 && age < maxAge && valid(cached.version) && (cached.tag === cached.version || cached.tag === `v${cached.version}`) && typeof cached.notes === 'string') return report(current, cached, true);
    }
    const res = await fetcher(endpoint, { signal, redirect: 'error', headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ryan-westudio-update' } });
    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      if (res.status === 404) return { ok: true, edition, status: 'no_release', current, latest: null };
      return failure(`HTTP_${res.status}`);
    }
    let size = 0;
    const chunks = [];
    for await (const part of res.body) {
      size += part.length;
      if (size > maxBody) return failure('RESPONSE_TOO_LARGE');
      chunks.push(part);
    }
    const info = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const tag = info?.tag_name;
    const version = typeof tag === 'string' ? tag.replace(/^v/, '') : null;
    if (!valid(version) || info.draft || info.prerelease || (info.body != null && typeof info.body !== 'string')) return failure('INVALID_RELEASE');
    const release = { version, tag, notes: (info.body || '').slice(0, 12_000) };
    if (useCache && !signal.aborted) {
      const tmp = `${cachePath}.${randomUUID()}.tmp`;
      try {
        await mkdir(dirname(cachePath), { recursive: true, mode: 0o700 });
        await writeFile(tmp, JSON.stringify({ ...release, checkedAt: Date.now() }), { mode: 0o600, flag: 'wx', signal });
        await rename(tmp, cachePath);
      } catch { /* Cache failures must not suppress a valid release. */ }
      finally { await rm(tmp, { force: true }).catch(() => {}); }
    }
    return report(current, release);
  } catch {
    return failure(signal.aborted ? 'TIMEOUT' : 'CHECK_FAILED');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  let finished = false;
  const output = result => {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    process.stdout.write(JSON.stringify(result) + '\n', () => process.exit(result.ok ? 0 : 1));
  };
  const deadline = setTimeout(() => output({ ok: false, edition, status: 'check_failed', current: null, error: 'TIMEOUT' }), 10_000);
  output(await checkUpdate({ useCache: process.argv.includes('--cached') }));
}
