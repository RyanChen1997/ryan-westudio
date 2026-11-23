import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sourceHash } from '../modules/editor/core/source-validation.mjs';
const runCLI = promisify(execFile);
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
async function start(args) {
  const child = spawn(process.execPath, ['scripts/editor.mjs', ...args, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('CLI startup timeout: ' + output)); }, 20000);
    child.on('exit', code => { clearTimeout(timer); if (code) reject(new Error(output)); });
    child.stderr.on('data', data => { output += data; });
    child.stdout.on('data', data => { output += data; if (output.includes('AI_BASE=')) { clearTimeout(timer); resolve(); } });
  });
  return { child, output, async close() { const done = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); await done; } };
}
test('CLI: real Word import, immutable original backup and project restart without reimport', async t => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-cli-')); t.after(() => fs.rm(project, { recursive: true, force: true }));
  const first = await start(['--project', project, '--docx', 'fixtures/word-smoke.docx']);
  let saved;
  try {
    saved = JSON.parse(await fs.readFile(path.join(project, 'project.json'), 'utf8'));
    assert.match(saved.markdown, /中文 Word 正文。\*\*保留加粗\*\*/);
    assert.deepEqual(await fs.readFile(path.join(project, 'original.docx')), await fs.readFile('fixtures/word-smoke.docx'));
  } finally { await first.close(); }
  const second = await start(['--project', project, '--md', 'nonexistent-not-reimported.md']);
  try { assert.deepEqual(JSON.parse(await fs.readFile(path.join(project, 'project.json'), 'utf8')), saved); }
  finally { await second.close(); }
});

test('CLI: freeze Word before AI structuring, then check source before starting the editor', async t => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-prepare-'));
  t.after(() => fs.rm(project, { recursive: true, force: true }));
  const prepared = await runCLI(process.execPath, ['scripts/editor.mjs', '--project', project, '--docx', 'fixtures/word-smoke.docx', '--prepare-only']);
  assert.match(prepared.stdout, /原文基准已冻结/);
  await assert.rejects(fs.stat(path.join(project, 'project.json')), { code: 'ENOENT' });
  const sourceFile = path.join(project, 'source.md'), source = await fs.readFile(sourceFile, 'utf8');
  const manifest = JSON.parse(await fs.readFile(path.join(project, 'source-manifest.json'), 'utf8'));
  assert.equal(manifest.sourceHash, sourceHash(source));
  const structuredFile = path.join(project, 'structured.md');
  await fs.writeFile(structuredFile, '---\ntitle: "结构化后的标题"\n---\n\n' + source.replace(/^# /m, '## '));
  const running = await start(['--project', project, '--md', structuredFile, '--source-md', sourceFile, '--ai-layout-lock']);
  try {
    assert.match(running.output, /原文文字一致性：通过/);
    assert.match(running.output, /^AI_LAYOUT_LOCK_ID=[0-9a-f-]{36}$/m);
    const saved = JSON.parse(await fs.readFile(path.join(project, 'project.json'), 'utf8'));
    assert.equal(saved.sourceValidation.passed, true);
    assert.equal(saved.sourceValidation.sourceHash, manifest.sourceHash);
    assert.equal(await fs.readFile(path.join(project, 'original.md'), 'utf8'), source);
  } finally { await running.close(); }
});

test('CLI: modifying both the frozen source and structure cannot bypass the captured source hash', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-frozen-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const input = path.join(root, 'input.md'), project = path.join(root, 'project');
  await fs.writeFile(input, '原始内容不能被替换。');
  await runCLI(process.execPath, ['scripts/editor.mjs', '--project', project, '--md', input, '--prepare-only']);
  const source = path.join(project, 'source.md'), structured = path.join(project, 'structured.md');
  await fs.chmod(source, 0o644);
  await fs.writeFile(source, '原文与结构稿同时被错误修改。');
  await fs.writeFile(structured, '原文与结构稿同时被错误修改。');
  await assert.rejects(runCLI(process.execPath, ['scripts/editor.mjs', '--project', project, '--md', structured, '--source-md', source], { timeout: 5000 }), error => /原文基准哈希不符/.test(error.stderr));
  await assert.rejects(fs.stat(path.join(project, 'project.json')), { code: 'ENOENT' });
});
