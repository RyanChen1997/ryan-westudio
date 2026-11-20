import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createWriteStream, realpathSync } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const target = fileURLToPath(new URL('../', import.meta.url));
const tagPattern = /^v?(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
const semver = value => typeof value === 'string' && tagPattern.test(value) && !value.startsWith('v');
const compare = (a, b) => a.split('.').map(Number).reduce((cmp, n, i) => cmp || n - Number(b.split('.')[i]), 0);
const windows = process.platform === 'win32';
const exists = file => fs.lstat(file).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
const manifest = async dir => JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
function run(cwd, program, args, capture = false) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', shell: windows && program === 'npm.cmd' });
  if (result.status !== 0 || result.error) throw new Error(`${program} ${args.join(' ')} failed`, { cause: result.error });
  return result.stdout;
}
async function fetchArchive(tag, zip) {
  const signal = AbortSignal.timeout(120_000);
  const response = await fetch(`https://codeload.github.com/RyanChen1997/ryan-westudio/zip/refs/tags/${tag}`, { signal, redirect: 'error' });
  if (!response.ok || !response.body) throw new Error(`GitHub archive unavailable (${response.status}).`);
  let size = 0;
  await pipeline(response.body, new Transform({ transform(chunk, _enc, done) {
    size += chunk.length;
    if (size > 150 * 1024 * 1024) done(new Error('Archive exceeds 150 MB.')); else done(null, chunk);
  } }), createWriteStream(zip, { mode: 0o600, flags: 'wx' }), { signal });
}

export async function installUpdate(tag, { directory = target, download = fetchArchive, runCommand = run } = {}) {
  if (typeof tag !== 'string' || !tagPattern.test(tag)) throw new Error('Use a version tag returned by check-update.mjs.');
  const version = tag.replace(/^v/, '');
  const dest = await fs.realpath(directory);
  const parent = path.dirname(dest);
  const lock = path.join(parent, `.${path.basename(dest)}-update.lock`);
  await fs.mkdir(lock, { mode: 0o700 });
  let work, preserveBackup = false;
  try {
    const current = await manifest(dest);
    if (current.name !== 'ryan-westudio' || !semver(current.version) || await exists(path.join(dest, 'scripts/user-preset.mjs'))) throw new Error('Target is not an open-source Westudio Skill installation.');
    if (compare(version, current.version) <= 0) throw new Error('The requested release must be newer than the installed version.');
    if (await exists(path.join(dest, '.git'))) {
      if (runCommand(dest, 'git', ['status', '--porcelain', '--untracked-files=all'], true).trim()) throw new Error('The current checkout contains local changes. Back them up before updating.');
      if ((await exists(path.join(dest, '.git')))?.isFile()) throw new Error('A linked Git worktree cannot be replaced by the installer.');
    }
    const cwd = path.relative(dest, await fs.realpath(process.cwd()));
    if (!cwd || (!path.isAbsolute(cwd) && cwd !== '..' && !cwd.startsWith(`..${path.sep}`))) throw new Error('Run the updater from outside the Skill directory.');
    work = await fs.mkdtemp(path.join(path.dirname(parent), '.westudio-update-'));
    const zip = path.join(work, 'release.zip'), unpacked = path.join(work, 'expanded'), backup = path.join(work, 'previous');
    await download(tag, zip);
    await fs.mkdir(unpacked);
    runCommand(unpacked, windows ? 'tar.exe' : 'unzip', windows ? ['-xf', zip] : ['-q', zip]);
    const files = await fs.readdir(unpacked, { withFileTypes: true });
    if (files.length !== 1 || !files[0].isDirectory()) throw new Error('Unexpected GitHub source archive layout.');
    const next = path.join(unpacked, files[0].name), release = await manifest(next);
    if (release.name !== current.name || release.version !== version || !(await exists(path.join(next, 'SKILL.md')))?.isFile() || await exists(path.join(next, 'scripts/user-preset.mjs'))) throw new Error('The archive does not match the selected open-source version.');
    runCommand(next, windows ? 'npm.cmd' : 'npm', ['ci', '--include=dev']);
    runCommand(next, windows ? 'npm.cmd' : 'npm', ['run', 'build']);
    if (!(await exists(path.join(next, 'dist', 'index.html')))?.isFile()) throw new Error('The editor build did not produce dist/index.html.');
    await fs.rename(dest, backup);
    try { await fs.rename(next, dest); }
    catch (error) {
      try { await fs.rename(backup, dest); }
      catch { preserveBackup = true; throw new Error(`Could not restore old Skill automatically. Backup: ${backup}`, { cause: error }); }
      throw error;
    }
    preserveBackup = true;
    return { version, dest, backup };
  } finally {
    if (work && !preserveBackup) await fs.rm(work, { recursive: true, force: true }).catch(() => {});
    await fs.rmdir(lock);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/install-update.mjs <confirmed-release-tag>');
    const { version, dest, backup } = await installUpdate(process.argv[2]);
    console.log(`Updated ryan-westudio (${version}) at ${dest}\nPrevious Skill backup: ${backup}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
