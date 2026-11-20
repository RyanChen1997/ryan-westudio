import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { checkUpdate } from '../scripts/check-update.mjs';
import { installUpdate } from '../scripts/install-update.mjs';

const fixture = async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'westudio-open-update-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
};

test('open-source checker reports only newer GitHub releases with pinned tags', async t => {
  const root = await fixture(t), packageFile = path.join(root, 'package.json');
  await fs.writeFile(packageFile, '{"version":"2.0.3"}');
  const fetcher = version => async url => {
    assert.equal(url, 'https://api.github.com/repos/RyanChen1997/ryan-westudio/releases/latest');
    return Response.json({ tag_name: `v${version}`, body: 'Release notes' });
  };
  const release = await checkUpdate({ packageFile, fetcher: fetcher('2.0.11') });
  assert.equal(release.status, 'update_available');
  assert.equal(release.tag, 'v2.0.11');
  assert.equal(release.notes, 'Release notes');
  assert.match(release.archiveUrl, /\/refs\/tags\/v2\.0\.11\.zip$/);
  assert.equal((await checkUpdate({ packageFile, fetcher: fetcher('2.0.2') })).status, 'up_to_date');
  assert.equal((await checkUpdate({ packageFile, fetcher: fetcher('2.0.4-beta') })).error, 'INVALID_RELEASE');
});

test('open updater preserves original checkout files in a backup and never replaces before build', async t => {
  const root = await fixture(t), dest = path.join(root, 'skills', 'ryan-westudio');
  await fs.mkdir(path.join(dest, 'article'), { recursive: true });
  await fs.writeFile(path.join(dest, 'package.json'), '{"name":"ryan-westudio","version":"2.0.0"}');
  await fs.writeFile(path.join(dest, 'article/project.json'), 'my article');
  await assert.rejects(installUpdate('v2.0.1', { directory: dest, download() { throw new Error('offline'); } }), /offline/);
  assert.ok(await fs.stat(path.join(dest, 'article/project.json')));
  const result = await installUpdate('v2.0.1', {
    directory: dest,
    download(tag) { assert.equal(tag, 'v2.0.1'); },
    runCommand(dir, command, args) {
      if (command === 'unzip' || command === 'tar.exe') {
        const sub = path.join(dir, 'repo-2.0.1');
        mkdirSync(sub);
        writeFileSync(path.join(sub, 'package.json'), '{"name":"ryan-westudio","version":"2.0.1"}');
        writeFileSync(path.join(sub, 'SKILL.md'), '# open');
      } else if (args[0] === 'run') {
        mkdirSync(path.join(dir, 'dist'));
        writeFileSync(path.join(dir, 'dist/index.html'), 'editor');
      }
    },
  });
  assert.equal(await fs.readFile(path.join(result.backup, 'article/project.json'), 'utf8'), 'my article');
  assert.equal(await fs.readFile(path.join(dest, 'dist/index.html'), 'utf8'), 'editor');
});
