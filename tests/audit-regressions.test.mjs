import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { load } from 'cheerio';
import { installDOM, snapshot } from './helpers.mjs';
import { EditorSession } from '../modules/editor/core/session.mjs';
import { ProjectStore } from '../modules/editor/core/store.mjs';
import { validateSourceMarkdown } from '../modules/editor/core/source-validation.mjs';
import { parseMarkdown, semantics } from '../modules/editor/core/markdown.mjs';
import { exportArticle } from '../modules/editor/export/index.mjs';
import { renderArticle, editorCSS } from '../modules/editor/render/article.mjs';
installDOM();
const run = (session, ...operations) => session.execute({ expectedRevision: session.revision, operations });

test('audit R1: image versions reject stale/ABA replacements without invalidating unrelated text edits', () => {
  const session = new EditorSession(snapshot('原段落。'));
  try {
    session.assets = { blue: {}, green: {} };
    run(session, { type: 'insertBlock', block: 'image', assetId: 'blue' });
    const id = session.snapshot().nodes.find(node => node.type === 'image').id;
    const version = session.imageVersion(id);
    run(session, { type: 'title', text: '无关的标题修改' }); assert.equal(session.imageVersion(id), version);
    run(session, { type: 'replaceImage', nodeId: id, assetId: 'green', expectedImageVersion: version });
    assert.equal(session.imageVersion(id), version + 1);
    const before = session.snapshot();
    assert.throws(() => run(session, { type: 'title', text: '不能部分提交' }, { type: 'replaceImage', nodeId: id, assetId: 'blue', expectedImageVersion: version }), /过期替换/);
    assert.deepEqual(session.snapshot().doc, before.doc); assert.equal(session.revision, before.revision);
    // Even a newer explicit replacement with identical bytes is a newer intent.
    const sameSource = session.imageVersion(id);
    run(session, { type: 'replaceImage', nodeId: id, assetId: 'green' }); assert.equal(session.imageVersion(id), sameSource + 1);
    const deleted = session.imageVersion(id);
    run(session, { type: 'deleteNode', nodeId: id }); run(session, { type: 'undo' });
    assert.equal(session.imageVersion(id), deleted + 2);
    assert.throws(() => run(session, { type: 'replaceImage', nodeId: id, assetId: 'blue', expectedImageVersion: deleted }), /过期替换/);
  } finally { session.destroy(); }
});

for (const block of ['paragraph', 'card', 'quote']) test(`audit R2: ${block} multiline CR/LF input is a saveable hardBreak sequence`, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-audit-lines-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new ProjectStore(directory), session = new EditorSession(await store.open({ markdown: '原文。' }));
  t.after(() => session.destroy());
  run(session, { type: 'title', text: '整批正常提交' }, { type: 'insertBlock', block, text: '甲\r\n\r\n乙\r丙' });
  await store.save(session.snapshot(), 0);
  assert.deepEqual(semantics(parseMarkdown(session.markdown)), semantics(session.snapshot().doc));
  const result = await exportArticle(store.current, store);
  assert.match(result.html, /甲<br\/><br\/>乙<br\/>丙/);
  const reopened = await new ProjectStore(directory).open(); assert.deepEqual(reopened.doc, session.snapshot().doc);
  run(session, { type: 'undo' }); assert.equal(session.snapshot().doc.attrs.title, '');
});

test('audit R2: linebreak-only blocks preserve JSON layout without phantom Markdown paragraphs', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-audit-blank-lines-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new ProjectStore(directory), initial = await store.open({ markdown: '原文。' });
  const session = new EditorSession(initial); t.after(() => session.destroy());
  const original = session.snapshot().doc;
  for (const block of ['paragraph', 'card', 'quote']) {
    run(session, { type: 'insertBlock', block, text: '\r\n\r' });
    await store.save(session.snapshot(), store.current.revision);
    assert.deepEqual(semantics(parseMarkdown(session.markdown)), semantics(session.snapshot().doc));
    const reopened = await new ProjectStore(directory).open(); assert.deepEqual(reopened.doc, session.snapshot().doc);
    run(session, { type: 'undo' }); await store.save(session.snapshot(), store.current.revision);
    assert.deepEqual(session.snapshot().doc, original);
  }
});

test('audit R2: unsupported inline CR and unrepresentable characters reject the whole batch before dispatch', () => {
  const session = new EditorSession(snapshot('原文。'));
  try {
    const id = session.snapshot().nodes[0].id, before = session.snapshot();
    for (const text of ['甲\r乙', '甲\r\n乙', '甲\n乙', '甲\0乙', '\ud800']) {
      assert.throws(() => run(session, { type: 'title', text: '不应被提交' }, { type: 'replaceText', nodeId: id, text }));
      assert.deepEqual(session.snapshot().doc, before.doc); assert.equal(session.revision, before.revision);
    }
  } finally { session.destroy(); }
});

test('audit R2 extension: image filenames/captions with syntax, entities and control whitespace remain saveable', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-audit-image-text-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new ProjectStore(directory), initial = await store.open({ markdown: '原文。' });
  const session = new EditorSession(initial); t.after(() => session.destroy());
  const asset = await store.addAsset(await sharp({ create: { width: 8, height: 8, channels: 3, background: '#334455' } }).png().toBuffer());
  session.assets = store.assets;
  for (const metadata of [
    { alt: '图 [1] (样例).png', caption: '图\t注 "引用" \\ &#10;' },
    { alt: '甲\n\n乙\r丙', caption: '甲\r\n\n乙 &lt;' },
    { alt: '原图', caption: 'A&B &unknown; "双引号" \\路径' },
  ]) {
    run(session, { type: 'insertBlock', block: 'image', assetId: asset.id, ...metadata });
    await store.save(session.snapshot(), store.current.revision);
    assert.deepEqual(semantics(parseMarkdown(session.markdown)), semantics(session.snapshot().doc));
  }
  assert.ok(session.markdown.includes('A&B &unknown;'), 'previously valid ampersands keep their canonical spelling');
  const reopened = await new ProjectStore(directory).open(); assert.deepEqual(reopened.doc, session.snapshot().doc);
  await exportArticle(reopened, store);
});

test('audit R5: source fidelity binds each href to its original text and range', () => {
  for (const [source, changed] of [
    ['[甲](https://example.invalid/a) 乙', '甲 [乙](https://example.invalid/a)'],
    ['[甲](https://example.invalid/a) 甲', '甲 [甲](https://example.invalid/a)'],
    ['[甲](https://example.invalid/a) [乙](https://example.invalid/b)', '[甲](https://example.invalid/b) [乙](https://example.invalid/a)'],
  ]) assert.equal(validateSourceMarkdown(source, changed).passed, false);
  const source = '# 原标题\n\n这里是 [**甲😀**](https://example.invalid/a) 和乙。';
  const structured = '---\ntitle: "原标题"\n---\n\n> 这里是 [*甲😀*](https://example.invalid/a) 和**乙**。';
  const report = validateSourceMarkdown(source, structured);
  assert.equal(report.passed, true, JSON.stringify(report)); assert.equal(report.policyVersion, 2);
});

for (const kind of ['empty', 'image-only', 'nested-image']) test(`audit R6: valid ${kind} list imports without losing its required paragraph or image`, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-audit-list-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await sharp({ create: { width: 8, height: 8, channels: 3, background: '#334455' } }).png().toFile(path.join(directory, 'tiny.png'));
  const markdown = kind === 'empty' ? '-\n- 文字\n' : kind === 'image-only' ? '- ![图](tiny.png "图注")\n' : '- 外层\n  - ![图](tiny.png "图注")\n';
  const store = new ProjectStore(path.join(directory, 'project')), initial = await store.open({ markdown, assetDirs: [directory] });
  const session = new EditorSession(initial); t.after(() => session.destroy()); session.editor.state.doc.check();
  session.editor.state.doc.descendants(node => { if (node.type.name === 'listItem') assert.equal(node.firstChild.type.name, 'paragraph'); });
  const html = (await exportArticle(initial, store)).html, $ = load(html, null, false);
  if (kind !== 'empty') { assert.equal($('img').length, 1); assert.match($.root().text(), /图注/); }
  else assert.match($.root().text(), /文字/);
  assert.deepEqual(semantics(parseMarkdown(initial.markdown)), semantics(initial.doc));
});

test('audit R3/R4: templates fold ordinary whitespace visually but preserve text and code whitespace', () => {
  const doc = parseMarkdown('A  B\tC\n\n```js\nconst x = "A  B";\n```');
  const $ = load(renderArticle(doc, () => ''), null, false), css = editorCSS(doc);
  assert.equal($.root().children().first().css('white-space'), 'normal');
  assert.match($('p').text(), /A  B/);
  assert.equal($('pre').css('white-space'), 'pre-wrap');
  assert.equal($('pre > code').text(), 'const x = "A  B";');
  assert.match(css, /:not\(pre\) > code/);
  assert.equal($('pre > code').css('padding'), '0'); assert.equal($('pre > code').css('background'), 'transparent');
});

test('audit R8: existing UTF-8 installation path gives the actionable refusal, not an unbound-variable error', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-audit-install-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const skills = path.join(directory, '测试安装路径'); await fs.mkdir(path.join(skills, 'ryan-westudio'), { recursive: true });
  const result = spawnSync(path.resolve('install.sh'), [skills], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stdout, /需要显式 --force/); assert.doesNotMatch(result.stderr, /unbound variable/);
});
