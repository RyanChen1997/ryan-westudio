import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'cheerio';
import { EditorSession } from '../modules/editor/core/session.mjs';
import { parseMarkdown, toMarkdown, semantics } from '../modules/editor/core/markdown.mjs';
import { ProjectStore } from '../modules/editor/core/store.mjs';
import { assertSourceMarkdown } from '../modules/editor/core/source-validation.mjs';
import { exportArticle } from '../modules/editor/export/index.mjs';
import { renderArticle } from '../modules/editor/render/article.mjs';
import { readDesignAsset } from '../modules/templates/assets.mjs';
import { templates } from '../modules/templates/registry.mjs';
import { inspectExportContract } from './export-contract.mjs';
import { installDOM, snapshot } from './helpers.mjs';

installDOM();
const run = (session, ...operations) => session.execute({ expectedRevision: session.revision, operations });

test('table: source gate and lossless Markdown projection preserve empty cells, alignment, pipes and inline marks', () => {
  const original = '| 甲 | 乙 | 丙 |\n| :--- | :---: | ---: |\n| `a\\|b` | **重\\|点** | [站点](https://example.com/) |\n| 空格 | | *尾项* |\n';
  const doc = parseMarkdown(original), markdown = toMarkdown(doc);
  assert.deepEqual(semantics(parseMarkdown(markdown)), semantics(doc));
  assert.ok(assertSourceMarkdown(original, markdown).passed);
  assert.throws(() => assertSourceMarkdown(original, markdown.replace('尾项', '新内容')), /原文文字一致性校验未通过/);
  assert.throws(() => parseMarkdown('| 左 | 右 |\n| --- | --- |\n| 一 | 二 | 第三列不允许丢失 |'), /列数超过表头/);
  assert.throws(() => parseMarkdown('| 左 | 右 |\n| --- | --- |\n| ![alt](image.png) | 二 |'), /图片需位于段落中/);
  const nested = '> | 左 | 右 |\n> | --- | --- |\n> | 一 | 二 |\n';
  assert.deepEqual(semantics(parseMarkdown(toMarkdown(parseMarkdown(nested)))), semantics(parseMarkdown(nested)));
});

test('table: cell changes are normal transactions; deleting one cell and changing its type are atomic rejections', () => {
  const session = new EditorSession(snapshot('| 标题 | 状态 |\n| --- | ---: |\n| 测试 | 运行中 |\n', 'apricot-notes'));
  try {
    const before = session.snapshot(), cell = before.nodes.find(node => node.type === 'tableCell');
    assert.throws(() => run(session, { type: 'replaceText', nodeId: cell.id, text: '不会提交' }, { type: 'deleteNode', nodeId: cell.id }), /列数必须一致/);
    assert.throws(() => run(session, { type: 'setBlock', nodeId: cell.id, block: 'h4' }), /不能转换/);
    assert.deepEqual(session.snapshot(), before);
    const changed = run(session, { type: 'replaceText', nodeId: cell.id, text: '  `<左>|`  ' });
    assert.deepEqual(semantics(parseMarkdown(changed.markdown)), semantics(changed.doc));
    assert.match(changed.markdown, /&#32;/);
    assert.deepEqual(run(session, { type: 'undo' }).doc, before.doc);
  } finally { session.destroy(); }
});

test('chapter panels: template switch, heading split, undo and restoration preserve node IDs and cursor', () => {
  const session = new EditorSession(snapshot('开头\n\n# 第一篇\n\n段一\n\n## 小节\n\n段二\n\n# 第二篇\n\n段三\n'));
  try {
    const initial = session.snapshot();
    const paragraph = initial.nodes.find(node => node.text === '段一');
    run(session, { type: 'style', nodeId: paragraph.id, style: { fontSize: 20, color: '#917733' } });
    run(session, { type: 'pageMargin', value: 40 });
    run(session, { type: 'select', nodeId: paragraph.id, from: 1, to: 2 });
    const before = session.snapshot();
    const warm = run(session, { type: 'template', templateId: 'apricot-notes' });
    assert.equal(warm.doc.content.filter(node => node.type === 'designPanel').length, 3);
    assert.equal(warm.doc.attrs.pageMargin, null);
    assert.equal(warm.nodes.find(node => node.id === paragraph.id).attrs.fontSize, null);
    assert.deepEqual(warm.nodes.map(node => node.id), before.nodes.map(node => node.id));
    assert.equal(session.editor.state.doc.textBetween(warm.selection.from, warm.selection.to), '一');
    assert.equal(warm.markdown, before.markdown);
    const restored = new EditorSession(warm);
    try { assert.deepEqual(restored.snapshot().doc, warm.doc); } finally { restored.destroy(); }
    const art = run(session, { type: 'template', templateId: 'spring-art-guide' });
    assert.deepEqual(art.doc.content.map(node => node.type), ['paragraph', 'heading', 'designPanel', 'designPanel', 'heading', 'designPanel']);
    const subheading = art.nodes.find(node => node.text === '小节');
    const merged = run(session, { type: 'setBlock', nodeId: subheading.id, block: 'paragraph' });
    assert.equal(merged.doc.content.filter(node => node.type === 'designPanel').length, 2);
    assert.deepEqual(run(session, { type: 'undo' }).doc, art.doc);
    assert.deepEqual(run(session, { type: 'undo' }).doc, warm.doc);
    assert.deepEqual(run(session, { type: 'undo' }).doc, before.doc);
  } finally { session.destroy(); }
});

test('pastel section badges cycle across top-level, card and quote headings and reset on each render', () => {
  const markdown = '## 第一\n\n## 第二\n\n:::card\n## 第三\n:::\n\n> ## 第四\n\n## 第五\n\n> :::card\n> ## 第六\n> :::\n';
  for (const templateId of ['wycombe-picnic']) {
    const doc = parseMarkdown(markdown, templateId);
    const renderBadges = () => {
      const $ = load(renderArticle(doc, () => 'fixture.png'), null, false);
      return $('[aria-level="2"]').toArray().map(heading => {
        const badge = $(heading).find('[data-decorative]').first();
        return [badge.text(), badge.attr('style').match(/#(?:ffeea8|a9caf7|8ec965)\b/i)?.[0]];
      });
    };
    const expected = [['01', '#ffeea8'], ['02', '#a9caf7'], ['03', '#8ec965'], ['04', '#ffeea8'], ['05', '#a9caf7'], ['06', '#8ec965']];
    assert.deepEqual(renderBadges(), expected);
    assert.deepEqual(renderBadges(), expected);
  }
});

test('selected Seneasy layouts: distinct decorative roles without introducing article content', () => {
  const markdown = '# 正文标题\n\n## 第一章\n\n内容。\n\n---\n\n## 第二章\n\n4. 原有序号\n';
  const cases = [
    ['seneasy-lilac-notes', 'h2', /border-radius:0 20px 20px 0/],
    ['seneasy-blue-rule', 'h1', /border-bottom:2px solid #3c7076/],
  ];
  for (const [id, selector, signature] of cases) {
    const doc = parseMarkdown(markdown, id);
    const html = renderArticle(doc, () => assert.fail(`${id} cannot request an image without a document image`));
    const $ = load(html, null, false);
    assert.match($(selector).first().attr('style'), signature, id);
    assert.deepEqual($('h2 > [data-decorative][aria-hidden="true"]').map((_i, el) => $(el).text()).get(), ['01｜', '02｜']);
    assert.equal($('[data-list-content]').prev().text(), '4.', id);
    assert.equal(inspectExportContract({ doc, markdown: toMarkdown(doc) }, html).passed, true, id);
    assert.deepEqual(semantics(doc), semantics(parseMarkdown(markdown)), id);
    const prose = renderArticle(parseMarkdown('只有正文。', id), () => assert.fail('unexpected asset'));
    assert.doesNotMatch(prose, /data-decorative|aria-level|END/, id);
  }
});

test('all presets: full fixture, hash-verified local PNGs, first-source report and publication contract', async t => {
  const project = await mkdtemp(join(tmpdir(), 'wechat-paiban-test-'));
  t.after(() => rm(project, { force: true, recursive: true }));
  const markdown = await readFile('fixtures/article.md', 'utf8');
  const store = new ProjectStore(project);
  const original = await store.open({ markdown, sourceMarkdown: markdown, assetDirs: ['fixtures'] });
  const session = new EditorSession(original); t.after(() => session.destroy());
  const anchor = session.snapshot().nodes.find(node => node.type === 'heading');
  const assetId = Object.keys(original.assets)[0];
  const added = run(session, { type: 'insertBlock', block: 'image', afterId: anchor.id, assetId, alt: '后插入的正文配图', caption: '图注随正文保存' });
  await store.save(added, original.revision);
  const imageIndex = added.nodes.findIndex(node => node.attrs.alt === '后插入的正文配图');
  assert.ok(imageIndex > 0);
  assert.equal(added.nodes[imageIndex - 1].id, anchor.id);
  const images = state => state.nodes.filter(node => node.type === 'image').map(({ id, attrs: { src, alt, caption } }) => ({ id, src, alt, caption }));
  const articleImagesBeforeSwitch = images(added);
  const common = semantics(added.doc);
  for (const template of templates) {
    const base = session.revision;
    const current = run(session, { type: 'template', templateId: template.id });
    assert.deepEqual(semantics(current.doc), common, template.id);
    assert.equal(current.markdown, added.markdown, template.id);
    assert.deepEqual(images(current), articleImagesBeforeSwitch, template.id);
    assert.equal(current.nodes[imageIndex - 1].id, anchor.id, template.id);
    await store.save(current, base);
    const output = await exportArticle(store.current, store);
    const contract = inspectExportContract(store.current, output.html);
    assert.equal(contract.passed, true, `${template.id}: ${contract.errors.join('; ')}`);
    assert.match(output.html, /<table\b/);
    assert.match(output.html, /aria-level="4"/);
    assert.match(output.text, /转义竖线 a\|b\t左\|右\t3/);
    assert.deepEqual(store.current.sourceValidation, original.sourceValidation);
    const $ = load(output.html, null, false);
    const image = $('img[alt="后插入的正文配图"]');
    assert.equal(image.length, 1, template.id);
    assert.equal(image.attr('src'), `data:image/png;base64,${(await store.readAsset(assetId)).toString('base64')}`, template.id);
    assert.match(output.text, /图注随正文保存/);
    const articleImages = new Set($('img').map((_index, element) => $(element).attr('src')).get());
    for (const role of Object.keys(template.provenance.assets)) {
      const bytes = await readDesignAsset(template.id, role);
      const data = `data:image/png;base64,${bytes.toString('base64')}`;
      if (output.html.includes(data) && !articleImages.has(data)) assert.match(output.html, new RegExp('url\\('));
    }
  }
});
