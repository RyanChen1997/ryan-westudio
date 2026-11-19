import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateSourceMarkdown, sourceHash } from '../modules/editor/core/source-validation.mjs';
import { ProjectStore } from '../modules/editor/core/store.mjs';
import { EditorSession } from '../modules/editor/core/session.mjs';
import { exportArticle } from '../modules/editor/export/index.mjs';
import { installDOM } from './helpers.mjs';
installDOM();

test('source fidelity: formatting and heading levels do not change text; first title stays accounted for', () => {
  const original = '# 原文章标题\n\n## 第一节\n\n正文有 25 个 Example，标点不能改。\n\n- 项目甲\n- 项目乙\n';
  const structured = '---\ntitle: "原文章标题"\n---\n\n# 第一节\n\n正文有 **25** 个 *Example*，标点不能改。\n\n> 项目甲\n>\n> 项目乙\n';
  const report = validateSourceMarkdown(original, structured);
  assert.equal(report.passed, true, JSON.stringify(report));
  assert.equal(report.titleHandling, 'first-title-to-metadata');
  assert.equal(report.sourceHash, sourceHash(original));
  assert.notEqual(report.sourceHash, report.structuredHash, 'raw Markdown hashes are not text equality');
});

for (const [name, changed] of [
  ['deleted sentence', '正文有 25 个 Example。'],
  ['rewritten heading', '# 概括后的标题\n\n正文有 25 个 Example，标点不能改。\n\n结尾原句。'],
  ['number', '# 原文章标题\n\n正文有 26 个 Example，标点不能改。\n\n结尾原句。'],
  ['letter case', '# 原文章标题\n\n正文有 25 个 example，标点不能改。\n\n结尾原句。'],
  ['punctuation', '# 原文章标题\n\n正文有 25 个 Example,标点不能改。\n\n结尾原句。'],
  ['order', '# 原文章标题\n\n结尾原句。\n\n正文有 25 个 Example，标点不能改。'],
  ['new body heading', '# 原文章标题\n\n## 新增的概括性小标题\n\n正文有 25 个 Example，标点不能改。\n\n结尾原句。'],
]) test(`source fidelity rejects ${name}`, () => {
  const original = '# 原文章标题\n\n正文有 25 个 Example，标点不能改。\n\n结尾原句。';
  const report = validateSourceMarkdown(original, changed);
  assert.equal(report.passed, false);
  assert.ok(report.difference?.character >= 1);
});

test('source fidelity preserves an authored metadata title, code whitespace, captions, and URLs', () => {
  const source = '---\ntitle: "已有标题"\n---\n\n正文 [链接](https://example.com/a)。\n\n```js\nconst x = "a  b";\n```\n\n![原替代文字](image.png "原图注")';
  assert.equal(validateSourceMarkdown(source, source).passed, true);
  for (const changed of [source.replace('已有标题', '另一个标题'), source.replace('a  b', 'a b'), source.replace('原图注', '新图注'), source.replace('/a)', '/b)')]) {
    assert.equal(validateSourceMarkdown(source, changed).passed, false);
  }
  assert.equal(validateSourceMarkdown('now here', 'nowhere').passed, false);
});

test('source fidelity: a new metadata-only title is explicit, not an exemption for changed body headings', () => {
  const original = '原始正文和命令 echo hello。';
  const structured = '---\ntitle: "新拟文章标题"\n---\n\n原始正文和命令 `echo hello`。';
  const report = validateSourceMarkdown(original, structured);
  assert.equal(report.passed, true);
  assert.equal(report.titleHandling, 'new-metadata');
  assert.equal(validateSourceMarkdown(original, structured + '\n\n## 擅自新增的小标题').passed, false);
  assert.equal(validateSourceMarkdown('> 开头引用\n\n正文', '---\ntitle: "开头引用"\n---\n\n正文').passed, false, 'a leading quote cannot silently become title metadata');
});

test('source fidelity: source H4 can be demoted without excluding its heading words', () => {
  assert.equal(validateSourceMarkdown('#### 原四级标题\n\n正文', '## 原四级标题\n\n**正文**').passed, true);
});

test('source gate blocks first import, but never blocks accepted user edits or rechecks them on export', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-source-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const original = '# 标题\n\n原始正文。', structured = '---\ntitle: "标题"\n---\n\n**原始正文。**';
  const store = new ProjectStore(directory);
  await assert.rejects(store.open({ sourceMarkdown: original, markdown: structured.replace('原始正文', '被AI改写') }), /原文文字一致性校验未通过/);
  await assert.rejects(fs.stat(path.join(directory, 'project.json')), { code: 'ENOENT' });
  // Use a fresh store: failed creation cannot masquerade as an existing accepted project.
  const accepted = new ProjectStore(directory), snapshot = await accepted.open({ sourceMarkdown: original, markdown: structured });
  assert.equal(snapshot.sourceValidation.passed, true);
  assert.equal(await fs.readFile(path.join(directory, 'original.md'), 'utf8'), original);
  const session = new EditorSession(snapshot); t.after(() => session.destroy());
  const node = session.snapshot().nodes.find(n => n.type === 'paragraph');
  session.execute({ expectedRevision: session.revision, operations: [{ type: 'replaceText', nodeId: node.id, text: '用户主动修改的正文。' }] });
  await accepted.save(session.snapshot(), 0);
  const result = await exportArticle(accepted.current, accepted);
  assert.match(result.text, /用户主动修改的正文/);
  assert.equal('validation' in result, false);
  assert.equal(accepted.current.sourceValidation.structuredHash, sourceHash(structured), 'initial proof is not overwritten with current user edits');
  assert.equal((await new ProjectStore(directory).open()).markdown, session.markdown);
});
