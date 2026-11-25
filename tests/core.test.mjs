import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { load } from 'cheerio';
import { renderArticle, editorCSS, getPageMargin } from '../modules/editor/render/article.mjs';
import { installDOM, snapshot } from './helpers.mjs';
import { EditorSession } from '../modules/editor/core/session.mjs';
import { parseMarkdown, toMarkdown, semantics } from '../modules/editor/core/markdown.mjs';
import { ProjectStore } from '../modules/editor/core/store.mjs';
import { exportArticle } from '../modules/editor/export/index.mjs';
import { inspectExportContract } from './export-contract.mjs';
import { DEFAULT_TEMPLATE_ID, TECH_TEMPLATE_ID, getTemplate, recommendTemplate, templates } from '../modules/templates/registry.mjs';
installDOM();
const run = (session, ...operations) => session.execute({ expectedRevision: session.revision, operations });
const firstParagraph = session => session.snapshot().nodes.find(n => n.type === 'paragraph');

test('registry ships exactly the 19 selected templates', async () => {
  assert.deepEqual(templates.map(t => t.id), [
    'apricot-notes', 'bci-weekly', 'beijing-art-calendar', 'blue-sequence', 'ceramic-exhibition',
    'cinnabar-chapters', 'coffee-dialogue', 'cosmos-story', 'cyan-report', 'moonlit-copybook',
    'palace-guide', 'pingshan-blue-gold', 'sakura-campus', 'spring-art-guide', 'wycombe-picnic',
    'xiaomi-keynote', 'seneasy-lilac-notes', 'seneasy-blue-rule', 'violet-field-notes',
  ]);
  for (const id of ['elegant-minimal', 'wechat-blue-yellow', 'user-seneasy-starlight', 'user-violet-field-notes']) assert.throws(() => getTemplate(id), /未知模板/);
  assert.equal(recommendTemplate('日常笔记'), DEFAULT_TEMPLATE_ID);
  assert.equal(recommendTemplate('科技资讯'), TECH_TEMPLATE_ID);
  assert.deepEqual((await fs.readdir('modules/templates/presets')).sort(), templates.map(t => t.id).sort());
  await assert.rejects(fs.stat('scripts/presets'));
});
test('markdown: semantic roundtrip title, Chinese, nested lists, code, captions and cards', () => {
  const md = '---\ntitle: "中文：标题"\n---\n\n# 一级\n\n## 二级\n\n### 三级\n\n中文 **加粗** 与 *斜体* 及 `a*b` [链接](https://example.com)。\n\n> 引用 **重点**\n>\n> 第二段\n\n- 列表\n  - 内层\n\n3. 有序\n4. 第二项\n\n```js\nconsole.log("中文");\n```\n\n![替代文字](<asset:abc> "中文图注")\n\n---\n\n:::card\n卡片 **正文**\n\n第二段\n:::\n';
  const doc = parseMarkdown(md), again = parseMarkdown(toMarkdown(doc));
  assert.deepEqual(semantics(again), semantics(doc));
  assert.equal(toMarkdown(again), toMarkdown(doc));
});
test('session: layout lock filters native transactions but allows authenticated AI execution', t => {
  const session = new EditorSession(snapshot(), { layoutLocked: true });
  t.after(() => session.destroy());
  const initial = session.snapshot(), node = firstParagraph(session);
  session.editor.view.dispatch(session.editor.state.tr.insertText('禁止原生写入', node.position + 1));
  assert.equal(session.revision, initial.revision);
  assert.throws(() => run(session, { type: 'template', templateId: TECH_TEMPLATE_ID }), /AI 正在排版/);
  session.executeFromAI({ expectedRevision: initial.revision, operations: [{ type: 'template', templateId: TECH_TEMPLATE_ID }] });
  assert.equal(session.snapshot().doc.attrs.templateId, TECH_TEMPLATE_ID);
  assert.equal(session.editor.isEditable, false);
  assert.equal(session.markdown, initial.markdown);
  session.setLayoutLocked(false);
  run(session, { type: 'undo' });
  assert.deepEqual(session.snapshot().doc, initial.doc);
  assert.equal(session.editor.isEditable, true);
  session.disconnect();
  assert.throws(() => session.executeFromAI({ expectedRevision: session.revision, operations: [{ type: 'title', text: '断开后不可写入' }] }), /连接已断开/);
});

test('session: visual styles do not alter Markdown, template resets visual not semantics, undo restores', () => {
  const session = new EditorSession(snapshot());
  const id = firstParagraph(session).id, original = session.markdown;
  run(session, { type: 'style', nodeId: id, style: { color: '#ff0000', fontSize: 24, borderWidth: 2 } });
  assert.equal(session.markdown, original);
  run(session, { type: 'style', nodeId: id, from: 0, to: 2, range: true, style: { color: '#00ff00' } });
  assert.equal(session.markdown, original);
  run(session, { type: 'insertBlock', block: 'decoration', afterId: id });
  const semantic = semantics(session.snapshot().doc);
  run(session, { type: 'template', templateId: TECH_TEMPLATE_ID });
  assert.deepEqual(semantics(session.snapshot().doc), semantic);
  assert.equal(session.markdown, original);
  assert.equal(firstParagraph(session).attrs.color, null);
  assert.equal(session.snapshot().nodes.filter(n => n.type === 'decoration').length, 0);
  run(session, { type: 'undo' });
  assert.equal(session.snapshot().doc.attrs.templateId, DEFAULT_TEMPLATE_ID);
  assert.equal(firstParagraph(session).attrs.color, '#ff0000');
  assert.equal(session.snapshot().nodes.filter(n => n.type === 'decoration').length, 1);
  session.destroy();
});
test('session: expectedRevision conflicts, unknown/invalid/failed batch is atomic and undoable', () => {
  const session = new EditorSession(snapshot()), id = firstParagraph(session).id;
  const before = session.snapshot();
  assert.throws(() => session.execute({ expectedRevision: -1, operations: [{ type: 'title', text: '覆盖' }] }), /版本冲突/);
  for (const operation of [{ type: 'eval', code: 'alert(1)' }, { type: 'style', nodeId: id, style: { color: 'url(bad)' } }, { type: 'replaceText', nodeId: 'missing', text: '错误' }, { type: 'replaceText', nodeId: id, from: -1, text: '错误' }]) {
    assert.throws(() => run(session, { type: 'replaceText', nodeId: id, from: 0, to: 2, text: '先改' }, operation));
    assert.deepEqual(session.snapshot().doc, before.doc); assert.equal(session.revision, before.revision);
  }
  run(session, { type: 'replaceText', nodeId: id, from: 0, to: 2, text: '新文' }, { type: 'style', nodeId: id, style: { fontSize: 20 } });
  assert.equal(session.revision, before.revision + 1);
  run(session, { type: 'undo' }); assert.deepEqual(session.snapshot().doc, before.doc);
  run(session, { type: 'redo' }); assert.match(session.markdown, /新文/);
  session.destroy();
});
test('session: headings, marks, quote/list conversion, card NodeView and decoration semantics', () => {
  const session = new EditorSession(snapshot()), id = firstParagraph(session).id;
  run(session, { type: 'setBlock', nodeId: id, block: 'h3' }, { type: 'mark', nodeId: id, from: 0, to: 2, mark: 'bold', enabled: true });
  assert.match(session.markdown, /### \*\*中文\*\*/);
  run(session, { type: 'setBlock', nodeId: id, block: 'paragraph' }, { type: 'toggleQuote', nodeId: id });
  assert.match(session.markdown, /> \*\*中文/);
  run(session, { type: 'toggleQuote', nodeId: id }, { type: 'toggleList', kind: 'bullet', nodeId: id });
  assert.match(session.markdown, /- \*\*中文/);
  run(session, { type: 'insertBlock', block: 'card', text: '语义卡片' });
  assert.match(session.markdown, /:::card\n语义卡片/);
  const before = session.markdown;
  run(session, { type: 'insertBlock', block: 'decoration', afterId: id });
  assert.equal(session.markdown, before);
  run(session, { type: 'template', templateId: TECH_TEMPLATE_ID }); assert.match(session.markdown, /语义卡片/);
  session.destroy();
});
test('store/export: save/restore exact revision, images replace and offline output contracts', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-store-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new ProjectStore(directory);
  const initial = await store.open({ markdown: '---\ntitle: "保存恢复"\n---\n\n# 标题\n\n正文 **重点**\n\n:::card\n卡片正文\n:::\n' });
  const session = new EditorSession(initial); t.after(() => session.destroy());
  const imageA = await store.addAsset(await sharp({ create: { width: 12, height: 10, channels: 3, background: '#ff0000' } }).png().toBuffer());
  const imageB = await store.addAsset(await sharp({ create: { width: 15, height: 10, channels: 3, background: '#0000ff' } }).png().toBuffer());
  session.assets = store.assets;
  run(session, { type: 'insertBlock', block: 'image', assetId: imageA.id, caption: '图注中文' }, { type: 'insertBlock', block: 'decoration' });
  const imageNode = session.snapshot().nodes.find(n => n.type === 'image');
  const resize = scale => ({ type: 'resizeImage', nodeId: imageNode.id, scale });
  const image = () => session.snapshot().nodes.find(n => n.id === imageNode.id);
  const beforeResize = session.snapshot();
  for (const scale of [0, 15, 55.5, 110, '60', null, undefined]) {
    assert.throws(() => run(session, { type: 'title', text: '不应保存' }, resize(scale)), /图片大小/);
    assert.deepEqual(session.snapshot().doc, beforeResize.doc);
    assert.equal(session.revision, beforeResize.revision);
  }
  assert.throws(() => run(session, { ...resize(50), nodeId: firstParagraph(session).id }), /目标不是图片/);
  run(session, resize(50));
  assert.equal(image().attrs.scale, 50);
  assert.equal(session.markdown, beforeResize.markdown);
  assert.equal(image().imageVersion, imageNode.imageVersion, 'resizing does not change the source image');
  run(session, { type: 'undo' }); assert.equal(image().attrs.scale, null);
  run(session, { type: 'redo' }); assert.equal(image().attrs.scale, 50);
  run(session, resize(100)); assert.equal(image().attrs.scale, null);
  run(session, { type: 'undo' }); assert.equal(image().attrs.scale, 50);
  run(session, { type: 'replaceImage', nodeId: imageNode.id, assetId: imageB.id });
  assert.equal(image().attrs.scale, 50);
  const markdown = session.markdown;
  assert.match(markdown, new RegExp(imageB.id));
  run(session, { type: 'style', nodeId: firstParagraph(session).id, style: { fontSize: 24, color: '#234567' } });
  await store.save(session.snapshot(), 0);
  const restored = await new ProjectStore(directory).open();
  assert.deepEqual(restored.doc, session.snapshot().doc); assert.equal(restored.revision, session.revision); assert.equal(restored.markdown, markdown);
  await assert.rejects(store.save(session.snapshot(), 0), /冲突/);
  const invalid = structuredClone(restored);
  invalid.doc.content.find(n => n.type === 'image').attrs.scale = 65;
  assert.throws(() => store.validate(invalid), /图片大小/);
  const sized = await exportArticle(store.current, store);
  assert.equal(inspectExportContract(store.current, sized.html).passed, true);
  assert.match(load(sized.html)('img[alt=""]').first().attr('style'), /width:50%;height:auto;margin-left:auto;margin-right:auto/);
  for (const template of templates) {
    const baseRevision = session.revision;
    run(session, { type: 'template', templateId: template.id });
    assert.equal(image().attrs.scale, null, 'switching template clears image sizing');
    assert.equal(image().attrs.src, `asset:${imageB.id}`);
    await store.save(session.snapshot(), baseRevision);
    const result = await exportArticle(store.current, store);
    const contract = inspectExportContract(store.current, result.html);
    assert.equal(contract.passed, true, `${template.id}: ${contract.errors.join('; ')}`);
    assert.deepEqual(contract.gates, { content: true, wechat: true, images: true });
    assert.equal('validation' in result, false, 'copy/export is not a validation workflow');
    assert.match(result.text, /正文 重点/);
    assert.doesNotMatch(result.text, /^---|\*\*|:::card/);
    assert.doesNotMatch(result.html, /<(script|style|iframe|form|svg|ul|ol|li)\b/i);
    assert.match(result.html, /data:image\/png;base64/);
    assert.equal(inspectExportContract(store.current, result.html.replace('正文', '丢字')).gates.content, false);
    assert.equal(inspectExportContract(store.current, result.html + '<script>alert(1)</script>').gates.wechat, false);
    assert.equal(inspectExportContract(store.current, result.html.replace(/data:image\/png;base64,/g, 'missing:')).gates.images, false);
  }
  await fs.unlink(path.join(directory, 'assets', `${imageB.id}.png`));
  await assert.rejects(exportArticle(store.current, store), /ENOENT/);
});

test('markdown: literal syntax/entities, overlapping emphasis and marked whitespace retain semantics', () => {
  for (const text of ['1. text', '- text', ':::card', 'plain &amp; & <tag>', '**literal**']) {
    const session = new EditorSession(snapshot('段落\n'));
    const id = firstParagraph(session).id;
    run(session, { type: 'replaceText', nodeId: id, text });
    assert.deepEqual(semantics(parseMarkdown(session.markdown)), semantics(session.snapshot().doc));
    session.destroy();
  }
  const session = new EditorSession(snapshot('hello world 中文\n'));
  const id = firstParagraph(session).id;
  run(session, { type: 'mark', nodeId: id, from: 5, to: 14, mark: 'bold', enabled: true });
  run(session, { type: 'mark', nodeId: id, from: 7, to: 12, mark: 'italic', enabled: true });
  assert.deepEqual(semantics(parseMarkdown(session.markdown)), semantics(session.snapshot().doc));
  session.destroy();
});

test('markdown: nested cards, fenced marker text, soft/hard breaks and BOM frontmatter', () => {
  const doc = parseMarkdown('\uFEFF---\ntitle: "换行"\n---\n\n:::card\n外层\n\n:::card\n内层\n:::\n\n```text\n:::\n```\n\n普通\n软换行  \n硬换行\n:::');
  assert.deepEqual(semantics(parseMarkdown(toMarkdown(doc))), semantics(doc));
});
test('markdown: wiki image paths with spaces import without rewriting literal code', () => {
  const md = '代码 `![[inline.png|示例]]`。\n\n```md\n![[fenced.png|不应改写]]\n```\n\n![[my images/图 1.png|中文图注]]\n';
  const doc = parseMarkdown(md);
  assert.equal(doc.content[0].content.find(n => n.marks?.some(m => m.type === 'code')).text, '![[inline.png|示例]]');
  assert.equal(doc.content.find(n => n.type === 'codeBlock').content[0].text, '![[fenced.png|不应改写]]');
  assert.deepEqual(doc.content.find(n => n.type === 'image').attrs, { src: encodeURI('my images/图 1.png'), alt: '中文图注', caption: '中文图注' });
  assert.deepEqual(semantics(parseMarkdown(toMarkdown(doc))), semantics(doc));
});
test('session: unsupported range styling rejects the entire batch', () => {
  const session = new EditorSession(snapshot('`code`\n'));
  try {
    const before = session.snapshot(), id = firstParagraph(session).id;
    assert.throws(() => run(session, { type: 'title', text: '不能部分修改' }, { type: 'style', nodeId: id, from: 0, to: 4, range: true, style: { color: '#123456' } }), /不支持视觉样式/);
    assert.equal(session.revision, before.revision);
    assert.deepEqual(session.snapshot().doc, before.doc);
  } finally { session.destroy(); }
});
test('render: list item visual overrides survive publication without altering Markdown', () => {
  const session = new EditorSession(snapshot('- 列表正文\n'));
  try {
    const before = session.markdown, item = session.snapshot().nodes.find(n => n.type === 'listItem');
    run(session, { type: 'style', nodeId: item.id, style: { fontSize: 24, color: '#234567', borderColor: '#123456', borderWidth: 3 } });
    const $ = load(renderArticle(session.snapshot().doc, () => ''), null, false);
    const style = $('[data-decorative]').parent().attr('style');
    for (const declaration of ['font-size:24px', 'color:#234567', 'border-color:#123456', 'border-width:3px']) assert.ok(style.includes(declaration), declaration);
    assert.equal(session.markdown, before);
  } finally { session.destroy(); }
});
test('page margin: visual-only, undoable, durable, exported and reset on template change', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-margin-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new ProjectStore(directory), initial = await store.open({ markdown: '# 标题\n\n页边距不改变正文。\n' });
  const session = new EditorSession(initial); t.after(() => session.destroy());
  const original = session.markdown;
  assert.equal(getPageMargin(session.snapshot().doc), getTemplate(DEFAULT_TEMPLATE_ID).layout.pageMargin);
  run(session, { type: 'pageMargin', value: 31 });
  assert.equal(session.markdown, original);
  assert.equal(getPageMargin(session.snapshot().doc), 31);
  assert.match(editorCSS(session.snapshot().doc), /padding-left:31px;padding-right:31px/);
  run(session, { type: 'undo' }); assert.equal(getPageMargin(session.snapshot().doc), getTemplate(DEFAULT_TEMPLATE_ID).layout.pageMargin);
  run(session, { type: 'redo' }); assert.equal(getPageMargin(session.snapshot().doc), 31);
  for (const value of [-1, 81, 1.5, '20', undefined]) {
    const before = session.snapshot();
    assert.throws(() => run(session, { type: 'title', text: '不能部分提交' }, { type: 'pageMargin', value }), /页边距/);
    assert.deepEqual(session.snapshot().doc, before.doc); assert.equal(session.revision, before.revision);
  }
  await store.save(session.snapshot(), 0);
  const reopened = await new ProjectStore(directory).open();
  assert.equal(reopened.doc.attrs.pageMargin, 31); assert.equal(reopened.markdown, original);
  const bundle = await exportArticle(reopened, store), $ = load(bundle.html, null, false);
  assert.equal($.root().children().first().css('padding-left'), '31px');
  assert.equal(inspectExportContract(reopened, bundle.html).passed, true);
  run(session, { type: 'template', templateId: TECH_TEMPLATE_ID });
  assert.equal(session.snapshot().doc.attrs.pageMargin, null);
  assert.equal(getPageMargin(session.snapshot().doc), getTemplate(TECH_TEMPLATE_ID).layout.pageMargin); assert.equal(session.markdown, original);
});
test('store: retired presets migrate once without rewriting article content or user styles', async t => {
  for (const [retired, replacement] of [
    ['elegant-minimal', DEFAULT_TEMPLATE_ID], ['wechat-blue-yellow', TECH_TEMPLATE_ID], ['user-seneasy-starlight', DEFAULT_TEMPLATE_ID], ['jade-docs', DEFAULT_TEMPLATE_ID],
    ['user-violet-field-notes', 'violet-field-notes'],
  ]) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-retired-preset-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const markdown = '# 标题\n\n保留的正文。\n';
    const store = new ProjectStore(directory), initial = await store.open({ markdown, sourceMarkdown: markdown });
    const asset = await store.addAsset(await fs.readFile('fixtures/article-sample.png'));
    const session = new EditorSession(initial);
    const id = firstParagraph(session).id;
    run(session, { type: 'style', nodeId: id, style: { color: '#345678' } }, { type: 'pageMargin', value: 32 },
      { type: 'insertBlock', block: 'image', assetId: asset.id }, { type: 'insertBlock', block: 'decoration' });
    await store.save(session.snapshot(), initial.revision);
    session.destroy();
    const old = structuredClone(store.current);
    old.doc.attrs.templateId = retired;
    await fs.writeFile(path.join(directory, 'project.json'), JSON.stringify(old));
    const reopened = new ProjectStore(directory), restored = await reopened.open();
    assert.deepEqual(restored, { ...old, revision: old.revision + 1, doc: { ...old.doc, attrs: { ...old.doc.attrs, templateId: replacement } } });
    assert.deepEqual(await new ProjectStore(directory).open(), restored, 'second open does not migrate or increment again');
    assert.equal(inspectExportContract(restored, (await exportArticle(restored, reopened)).html).passed, true);
  }
});

test('store: old projects missing new default attrs save without a false revision conflict', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-old-schema-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new ProjectStore(directory), initial = await store.open({ markdown: '旧项目正文。\n' });
  delete initial.doc.attrs.pageMargin;
  await fs.writeFile(path.join(directory, 'project.json'), JSON.stringify(initial));
  const reopened = new ProjectStore(directory), old = await reopened.open();
  const session = new EditorSession(old); t.after(() => session.destroy());
  await reopened.save(session.snapshot(), 0);
  assert.equal(reopened.current.revision, 0);
  assert.equal(reopened.current.doc.attrs.pageMargin, null);
  const modifiedWithoutRevision = session.snapshot(); modifiedWithoutRevision.doc.attrs.pageMargin = 30;
  await assert.rejects(reopened.save(modifiedWithoutRevision, 0), /相同版本内容不同/);
});
test('store: failed atomic save does not report success or replace prior commit', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-failed-save-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new ProjectStore(directory), initial = await store.open({ markdown: '原始正文\n' });
  const session = new EditorSession(initial); t.after(() => session.destroy());
  run(session, { type: 'replaceText', nodeId: firstParagraph(session).id, text: '新的正文' });
  const originalRename = fs.rename;
  try {
    fs.rename = async () => { throw Object.assign(new Error('模拟磁盘提交失败'), { code: 'EACCES' }); };
    await assert.rejects(store.save(session.snapshot(), 0), /模拟磁盘提交失败/);
  } finally { fs.rename = originalRename; }
  assert.equal(store.current.revision, 0);
  assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'project.json'), 'utf8')).revision, 0);
  assert.equal((await fs.readdir(directory)).some(name => name.endsWith('.tmp')), false);
  await store.save(session.snapshot(), 0);
  assert.equal((await new ProjectStore(directory).open()).revision, session.revision);
});
