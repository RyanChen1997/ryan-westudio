import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createEditorServer } from '../modules/editor/tools/server.mjs';
import { templates } from '../modules/templates/registry.mjs';
import { semantics } from '../modules/editor/core/markdown.mjs';

const project = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-paiban-editor-'));
const evidence = process.env.PAIBAN_EVIDENCE_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-paiban-wysiwyg-'));
await fs.mkdir(evidence, { recursive: true });
let runtime, browser;
try {
  const markdown = await fs.readFile('fixtures/article.md', 'utf8');
  runtime = await createEditorServer({ project, port: 0, markdown, sourceMarkdown: markdown, assetDirs: ['fixtures'] });
  const chrome = process.env.CHROME_PATH || await fs.stat('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    .then(() => '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', () => undefined);
  browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__clipboardHTML = null;
    Object.defineProperty(navigator, 'clipboard', { value: { write: async items => { window.__clipboardHTML = await (await items[0].getType('text/html')).text(); } } });
  });
  const headers = { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' };
  async function request(route, payload) {
    const response = await fetch(`${runtime.url}/api/tools/${route}`, { headers, ...(payload ? { method: 'POST', body: JSON.stringify(payload) } : {}) });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  const snapshot = () => request('snapshot');
  const op = async (...operations) => request('operations', { expectedRevision: (await snapshot()).revision, operations });
  const button = name => page.getByRole('button', { name, exact: true });
  await page.goto(`${runtime.url}/#token=${runtime.token}`);
  await page.locator('.tiptap').waitFor();
  const initial = await snapshot();
  assert.equal(initial.sourceValidation.passed, true);
  const gallery = page.getByRole('group', { name: '排版模板卡片' });
  assert.equal(await gallery.getByRole('button').count(), templates.length);
  assert.equal(await gallery.getByRole('button', { name: /极简雅致|公众号蓝黄线框/ }).count(), 0);
  const apricot = gallery.getByRole('button', { name: '杏暖手记', exact: true });
  const hoverStyle = () => apricot.evaluate(button => {
    const card = button.closest('.template-card');
    const tint = card.querySelector('.template-card-tint'), check = card.querySelector('.template-card-check');
    const a = card.getBoundingClientRect(), b = check.getBoundingClientRect();
    return { tint: getComputedStyle(tint).opacity, color: getComputedStyle(tint).backgroundColor,
      check: getComputedStyle(check).opacity, upperRight: b.right > a.left + a.width / 2 && b.bottom < a.top + a.height / 2,
      buttonBackground: getComputedStyle(button).backgroundColor };
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal((await hoverStyle()).tint, '0');
  await apricot.hover();
  assert.deepEqual(await snapshot(), initial, 'hovering does not switch templates or edit the article');
  const hovered = await hoverStyle();
  assert.equal(hovered.tint, '1');
  assert.match(hovered.color, /\/ 0\.2\)|rgba\(.*,\s*0\.2\)/);
  assert.equal(hovered.buttonBackground, 'rgba(0, 0, 0, 0)');
  assert.equal(hovered.check, '1'); assert.equal(hovered.upperRight, true);
  await page.screenshot({ path: path.join(evidence, 'gallery-hover.png') });
  await page.mouse.move(5, 5);
  assert.equal((await hoverStyle()).tint, '0'); assert.equal((await hoverStyle()).check, '0');
  await apricot.focus(); await page.keyboard.press('Enter');
  await page.locator('.tiptap [data-article-node="designPanel"]').first().waitFor();
  assert.equal((await snapshot()).doc.attrs.templateId, 'apricot-notes');
  assert.equal(await apricot.getAttribute('aria-pressed'), 'true');
  await page.locator('.tiptap').focus();
  assert.equal((await hoverStyle()).tint, '0'); assert.equal((await hoverStyle()).check, '1');

  // Editing the imported layout is still native Tiptap text, including table cells.
  const cell = page.locator('.tiptap td').first();
  await cell.click();
  await page.keyboard.insertText('表格实打');
  let edited = await snapshot();
  assert.match(edited.markdown, /表格实打/);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => getSelection().anchorNode.parentElement.closest('td')?.cellIndex), 1);
  assert.equal((await snapshot()).revision, edited.revision, 'Tab navigates without changing the document');
  const heading = edited.nodes.find(node => node.type === 'heading');
  edited = await op({ type: 'replaceText', nodeId: heading.id, from: 0, to: 0, text: '同页修改：' });
  await page.locator(`.tiptap [data-node-id="${heading.id}"]`).getByText(/同页修改/).waitFor();
  await request('save', { expectedRevision: edited.revision });
  await page.reload();
  await page.locator('.tiptap [data-article-node="designPanel"]').first().waitFor();
  assert.deepEqual((await snapshot()).doc, edited.doc);
  await button('复制到公众号').click();
  await page.waitForFunction(() => window.__clipboardHTML?.includes('同页修改：'));
  const copied = await page.evaluate(() => window.__clipboardHTML);
  assert.match(copied, /表格实打/);

  async function geometry(html) {
    return page.evaluate(async html => {
      const root = document.querySelector('.tiptap'), frame = document.createElement('iframe');
      frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${root.getBoundingClientRect().width}px;height:4200px;border:0;visibility:hidden;`;
      frame.srcdoc = `<!doctype html><body style="margin:0">${html}</body>`;
      const loaded = new Promise(resolve => frame.onload = resolve);
      document.body.append(frame); await loaded;
      try {
        const published = frame.contentDocument.body.firstElementChild;
        await Promise.all([document.fonts.ready, frame.contentDocument.fonts.ready]);
        await Promise.all([...root.querySelectorAll('img'), ...published.querySelectorAll('img')].map(img => img.decode()));
        const a = root.getBoundingClientRect(), b = published.getBoundingClientRect();
        const elements = (parent, editor) => [parent, ...parent.querySelectorAll('*')].filter(el => !editor || !el.matches('.ProseMirror-trailingBreak, .ProseMirror-separator'));
        const live = elements(root, true), output = elements(published, false), differences = [];
        if (live.length !== output.length) differences.push({ count: [live.length, output.length] });
        const properties = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'color', 'lineHeight', 'letterSpacing', 'whiteSpace', 'backgroundColor', 'borderTopWidth', 'borderLeftWidth', 'textAlign', 'textIndent'];
        for (let i = 0; i < Math.min(live.length, output.length); i++) {
          const l = live[i], r = output[i];
          const s = getComputedStyle(l), t = frame.contentWindow.getComputedStyle(r);
          const dx = l.getBoundingClientRect(), dy = r.getBoundingClientRect();
          const actual = [dx.left - a.left, dx.top - a.top, dx.width, dx.height];
          const expected = [dy.left - b.left, dy.top - b.top, dy.width, dy.height];
          const styles = properties.filter(key => s[key] !== t[key]).map(key => [key, s[key], t[key]]);
          if (styles.length || actual.some((value, j) => Math.abs(value - expected[j]) > 0.05)) differences.push({ index: i, tag: l.tagName, text: l.textContent.slice(0, 26), styles, actual, expected });
        }
        return { differences, width: a.width };
      } finally { frame.remove(); }
    }, html);
  }
  const results = [];
  for (const [device, name] of [['mobile', '手机版'], ['desktop', '电脑版']]) {
    await button(name).click();
    for (const template of templates) {
      const state = await op({ type: 'template', templateId: template.id });
      assert.equal(state.markdown, edited.markdown);
      assert.deepEqual(semantics(state.doc), semantics(edited.doc));
      assert.deepEqual(state.sourceValidation, initial.sourceValidation);
      const output = await request('export', { expectedRevision: state.revision });
      assert.match(output.text, /表格实打/);
      assert.doesNotMatch(output.html, /<(script|style|iframe|form|svg|ul|ol|li)\b/i);
      const agreement = await geometry(output.html);
      results.push({ id: template.id, device, ...agreement });
    }
  }
  const report = path.join(evidence, 'results.json');
  await fs.writeFile(report, JSON.stringify({ results, errors }, null, 2));
  assert.deepEqual(errors, []);
  assert.deepEqual(results.filter(result => result.differences.length).map(({ id, device }) => `${device}:${id}`), [], `live ≠ copied geometry: ${report}`);
  console.log(`Template layouts: ${results.length} live/copy browser comparisons passed. Evidence: ${report}`);
} finally {
  await browser?.close(); await runtime?.close(); await fs.rm(project, { recursive: true, force: true });
}
