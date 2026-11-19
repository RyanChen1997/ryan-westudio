import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { installDOM, snapshot } from './helpers.mjs';
import { EditorSession } from '../modules/editor/core/session.mjs';
import { parseMarkdown, semantics } from '../modules/editor/core/markdown.mjs';
import { assignIds, schema } from '../modules/editor/core/schema.mjs';
import { ProjectStore } from '../modules/editor/core/store.mjs';
import { exportArticle } from '../modules/editor/export/index.mjs';
installDOM();
const run = (session, ...operations) => session.execute({ expectedRevision: session.revision, operations });
const roots = session => session.snapshot().doc.content;

function insert(session, anchor, where = 'after') {
  const before = new Set(session.snapshot().nodes.map(node => node.id));
  const result = run(session, { type: 'insertBlock', block: 'paragraph', [where === 'after' ? 'afterId' : 'beforeId']: anchor, focus: true });
  return result.nodes.find(node => node.type === 'paragraph' && !before.has(node.id)).id;
}

test('blocks: insertion above first and below middle uses exact siblings; each step is undoable', () => {
  const session = new EditorSession(snapshot('# 标题\n\n甲段。\n\n乙段。'));
  try {
    const original = roots(session), markdown = session.markdown;
    const first = insert(session, original[0].attrs.id, 'before');
    const middle = insert(session, original[1].attrs.id);
    assert.deepEqual(roots(session).map(node => node.attrs.id), [first, original[0].attrs.id, original[1].attrs.id, middle, original[2].attrs.id]);
    assert.equal(session.markdown, markdown, 'empty layout paragraphs add no fake body text');
    run(session, { type: 'undo' }); assert.equal(roots(session).some(node => node.attrs.id === middle), false);
    assert.equal(roots(session)[0].attrs.id, first);
    run(session, { type: 'redo' }); assert.equal(roots(session)[3].attrs.id, middle);
  } finally { session.destroy(); }
});

for (const [block, type] of [['quote', 'blockquote'], ['card', 'card'], ['horizontalRule', 'horizontalRule']]) {
  test(`blocks: choosing ${block} converts the new paragraph, not a second insertion`, () => {
    const session = new EditorSession(snapshot('原段落。'));
    try {
      const original = roots(session)[0], id = insert(session, original.attrs.id);
      run(session, { type: 'convertBlock', nodeId: id, block, focus: true });
      assert.equal(roots(session).length, 2); assert.equal(roots(session)[1].type, type);
      assert.equal(roots(session)[1].attrs.id, id);
      assert.deepEqual(semantics(parseMarkdown(session.markdown)), semantics(session.snapshot().doc));
      schema().nodeFromJSON(assignIds(parseMarkdown(session.markdown))).check();
      const ids = session.snapshot().nodes.map(node => node.id); assert.equal(new Set(ids).size, ids.length);
      run(session, { type: 'undo' }); assert.equal(roots(session)[1].type, 'paragraph');
      assert.equal(roots(session)[1].attrs.id, id);
      run(session, { type: 'undo' }); assert.equal(roots(session).length, 1);
      run(session, { type: 'redo' }); run(session, { type: 'redo' }); assert.equal(roots(session)[1].type, type);
    } finally { session.destroy(); }
  });
}

test('blocks: paragraph default creates no extra undo entry; edited placeholders and invalid anchors reject atomically', () => {
  const session = new EditorSession(snapshot('原文。'));
  try {
    const anchor = roots(session)[0].attrs.id, id = insert(session, anchor), revision = session.revision;
    run(session, { type: 'convertBlock', nodeId: id, block: 'paragraph', focus: true }); assert.equal(session.revision, revision);
    run(session, { type: 'replaceText', nodeId: id, text: '已输入，不能被样式选择覆盖。' });
    const before = session.snapshot();
    assert.throws(() => run(session, { type: 'title', text: '不能部分提交' }, { type: 'convertBlock', nodeId: id, block: 'card' }), /已被修改/);
    assert.throws(() => run(session, { type: 'insertBlock', block: 'paragraph', beforeId: anchor, afterId: anchor }), /不能同时/);
    assert.throws(() => run(session, { type: 'insertBlock', block: 'paragraph', beforeId: 'missing' }), /不存在/);
    assert.deepEqual(session.snapshot().doc, before.doc); assert.equal(session.revision, before.revision);
  } finally { session.destroy(); }
});

test('blocks: native typing after style selection is a separate undo step', () => {
  const session = new EditorSession(snapshot('原段落。'));
  try {
    const id = insert(session, roots(session)[0].attrs.id);
    run(session, { type: 'convertBlock', nodeId: id, block: 'card', focus: true });
    session.editor.commands.insertContent('用户随后输入的文字');
    run(session, { type: 'undo' });
    assert.equal(roots(session)[1].type, 'card'); assert.equal(roots(session)[1].content[0].content, undefined);
    run(session, { type: 'undo' }); assert.equal(roots(session)[1].type, 'paragraph');
    run(session, { type: 'undo' }); assert.equal(roots(session).length, 1);
  } finally { session.destroy(); }
});

test('blocks: deleting the last block leaves a valid writable document', () => {
  const session = new EditorSession(snapshot('唯一段落。'));
  try {
    run(session, { type: 'deleteNode', nodeId: roots(session)[0].attrs.id });
    session.editor.state.doc.check();
    const remaining = session.snapshot().nodes.find(node => node.type === 'paragraph'); assert.ok(remaining);
    run(session, { type: 'replaceText', nodeId: remaining.id, text: '仍然可以继续输入。' });
    assert.match(session.markdown, /仍然可以继续输入/);
  } finally { session.destroy(); }
});

test('blocks: local image converts the placeholder and survives save/restore/export', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-block-image-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new ProjectStore(directory), initial = await store.open({ markdown: '原段落。' });
  const session = new EditorSession(initial); t.after(() => session.destroy());
  const asset = await store.addAsset(await sharp({ create: { width: 20, height: 16, channels: 3, background: '#4477aa' } }).png().toBuffer());
  session.assets = store.assets;
  const id = insert(session, roots(session)[0].attrs.id);
  run(session, { type: 'convertBlock', nodeId: id, block: 'image', assetId: asset.id, alt: '本地图', focus: true });
  assert.equal(roots(session).length, 2); assert.equal(roots(session)[1].type, 'image');
  assert.equal(roots(session)[1].attrs.id, id);
  await store.save(session.snapshot(), 0);
  const restored = await new ProjectStore(directory).open();
  assert.deepEqual(restored.doc, session.snapshot().doc);
  assert.match((await exportArticle(restored, store)).html, /data:image\/png;base64/);
});
