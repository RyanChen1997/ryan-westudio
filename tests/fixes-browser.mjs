import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { createEditorServer } from '../modules/editor/tools/server.mjs';
import { templates } from '../modules/templates/registry.mjs';
import categories from '../modules/templates/gallery-categories.json' with { type: 'json' };

const project = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-fixes-browser-'));
const evidence = process.env.FIX_EVIDENCE_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-fixes-evidence-'));
await fs.mkdir(evidence, { recursive: true });
let runtime, browser;
try {
  runtime = await createEditorServer({ project, port: 0, markdown: '# 标题\n\n普通段落用于焦点测试。\n\n---\n\n后段保留。' });
  const executablePath = process.env.CHROME_PATH || await fs.stat('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome').then(() => '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', () => undefined);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const headers = { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' };
  const snapshot = async () => { const response = await fetch(`${runtime.url}/api/tools/snapshot`, { headers }); assert.equal(response.status, 200); return response.json(); };
  const op = async (...operations) => {
    const before = await snapshot(), response = await fetch(`${runtime.url}/api/tools/operations`, { method: 'POST', headers, body: JSON.stringify({ expectedRevision: before.revision, operations }) });
    assert.equal(response.status, 200, await response.clone().text()); return response.json();
  };
  const button = name => page.getByRole('button', { name, exact: true });
  const block = id => page.locator(`.tiptap [data-node-id="${id}"]`);
  const chooser = page.getByLabel('上传图片', { exact: true });
  await page.goto(`${runtime.url}/#token=${runtime.token}`); await page.locator('.tiptap').waitFor();
  const make = color => sharp({ create: { width: 96, height: 64, channels: 3, background: color } }).png().toBuffer();
  const [blue, red, green] = await Promise.all(['#2255ff', '#ff2200', '#00aa33'].map(make));
  const file = (name, buffer) => ({ name, mimeType: 'image/png', buffer });
  await chooser.setInputFiles(file('blue.png', blue)); await page.locator('.tiptap img[data-article-node="image"]').waitFor();
  const image = (await snapshot()).nodes.find(node => node.type === 'image');
  const source = state => state.nodes.find(node => node.id === image.id).attrs.src;
  async function holdOld(replaceWithNewer) {
    await block(image.id).click();
    let release, began, first = true;
    const gate = new Promise(resolve => release = resolve), held = new Promise(resolve => began = resolve);
    await page.route('**/api/assets', async route => { if (first) { first = false; began(); await gate; } await route.continue(); });
    await chooser.setInputFiles(file('old-red.png', red)); await held;
    await replaceWithNewer();
    const before = await snapshot(); release();
    await page.waitForResponse(response => response.url() === `${runtime.url}/api/assets`);
    await page.waitForTimeout(100); await page.unroute('**/api/assets');
    const after = await snapshot();
    assert.equal(source(after), source(before), 'old upload must not replace newer accepted content');
    assert.equal(after.revision, before.revision, 'ignoring an old upload must not create a document transaction');
  }
  await holdOld(async () => {
    await chooser.setInputFiles(file('new-green.png', green));
    await page.waitForFunction(({ id, old }) => document.querySelector(`img[data-node-id="${id}"]`).getAttribute('src') !== old, { id: image.id, old: '/assets/' + image.attrs.src.slice(6) });
  });
  await holdOld(async () => { await op({ type: 'deleteNode', nodeId: image.id }); await op({ type: 'undo' }); });
  await page.screenshot({ path: path.join(evidence, 'latest-image-preserved.png') });

  // The sample previews don't use the user's article. A visible PNG still loads with auth in its scriptless frame.
  const filters = page.getByRole('group', { name: '模板分类', exact: true });
  const category = name => filters.getByRole('button', { name, exact: true });
  await category(categories.labels[categories.assignments['spring-art-guide']]).click();
  const preview = page.locator('.template-cover iframe[title="春日观展模板缩略图"]');
  await preview.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const frame = document.querySelector('.template-cover iframe[title="春日观展模板缩略图"]');
    const images = [...(frame?.contentDocument?.images || [])];
    return images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0);
  });
  const frames = [];
  for (const label of Object.values(categories.labels)) {
    await category(label).click();
    frames.push(...await page.locator('.template-cover iframe').evaluateAll(frames => frames.map(frame => frame.getAttribute('sandbox'))));
  }
  assert.equal(frames.length, templates.length);
  assert.ok(frames.every(sandbox => sandbox === 'allow-same-origin'));
  assert.equal((await fetch(`${runtime.url}/assets/${source(await snapshot()).slice(6)}`)).status, 401, 'resource auth must remain enforced');

  // UI hover envelopes do not change the divider's actual published box.
  async function dividerControls(id) {
    const before = await snapshot();
    await block(id).evaluate(element => element.scrollIntoView({ block: 'center' }));
    const rect = await block(id).boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y - 8); // Empty margin, not just the 1px border.
    await page.waitForFunction(id => document.querySelector('.block-handle')?.dataset.blockId === id, id);
    const handle = await button('区块操作菜单').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2, { steps: 30 });
    assert.equal(await button('区块操作菜单').getAttribute('data-block-id'), id);
    await button('区块操作菜单').click(); await page.getByRole('menu', { name: '块操作', exact: true }).waitFor();
    const highlight = page.locator(`[data-block-highlight="${id}"]`); await highlight.waitFor();
    const box = await highlight.boundingBox(); assert.ok(box.height >= 27 && box.width >= rect.width - 1);
    assert.equal(await highlight.evaluate(element => getComputedStyle(element).pointerEvents), 'none');
    const current = await snapshot(); assert.equal(current.revision, before.revision); assert.deepEqual(current.doc, before.doc);
    const exported = await fetch(`${runtime.url}/api/tools/export`, { method: 'POST', headers, body: JSON.stringify({ expectedRevision: current.revision }) }).then(response => response.json());
    assert.doesNotMatch(exported.html, /block-highlight|data-block-ui/);
    await page.waitForTimeout(250); // Capture the final, opaque Popover rather than its entrance frame.
    await page.screenshot({ path: path.join(evidence, `divider-${page.viewportSize().width}px-${before.doc.attrs.pageMargin ?? 24}-${id.slice(0, 6)}.png`) });
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.block-highlight').count(), 0);
  }
  const existingDivider = (await snapshot()).nodes.find(node => node.type === 'horizontalRule').id;
  for (const margin of [0, 80, 24]) { await op({ type: 'pageMargin', value: margin }); await dividerControls(existingDivider); }
  const paragraph = (await snapshot()).nodes.find(node => node.type === 'paragraph' && node.text.includes('普通段落'));
  await block(paragraph.id).hover(); await button('区块操作菜单').click();
  const highlightId = await page.locator('.block-highlight').getAttribute('data-block-highlight'); assert.equal(highlightId, paragraph.id);
  await page.getByRole('menuitem', { name: '在下方插入块', exact: true }).click();
  const newId = await page.locator('.block-highlight').getAttribute('data-block-highlight'); assert.notEqual(newId, paragraph.id);
  await page.getByRole('menuitem', { name: '装饰条', exact: true }).click();
  await dividerControls(newId);
  await page.setViewportSize({ width: 390, height: 844 }); await dividerControls(newId);

  // Correctly modelled multiline input must save and directly export through the real bridge.
  const changed = await op({ type: 'title', text: '多行批次正常' }, { type: 'insertBlock', block: 'paragraph', text: '甲\r\n\r\n乙' });
  const exported = await fetch(`${runtime.url}/api/tools/export`, { method: 'POST', headers, body: JSON.stringify({ expectedRevision: changed.revision }) });
  assert.equal(exported.status, 200); assert.match((await exported.json()).html, /甲<br\/><br\/>乙/);
  const persisted = JSON.parse(await fs.readFile(path.join(project, 'project.json'), 'utf8')); assert.equal(persisted.revision, changed.revision);

  // Scrolled dark article must not show through the sticky toolbar's rounded corners.
  await op({ type: 'template', templateId: 'wycombe-picnic' }, ...Array.from({ length: 16 }, (_, i) => ({
    type: 'insertBlock', block: 'paragraph', text: `圆角滚动用段落 ${i + 1}。`.repeat(6),
  })));
  for (const { width, night } of [{ width: 1440, night: false }, { width: 390, night: false }, { width: 390, night: true }]) {
    await page.setViewportSize({ width, height: 844 });
    if (night) await button('夜间模式').click();
    const scroller = page.locator(width === 390 ? '.studio' : '.editor-stage');
    await scroller.evaluate(el => { el.scrollTop = 600; });
    const tools = page.getByRole('toolbar', { name: '文字与段落工具' });
    const bar = await tools.boundingBox(), paper = await page.locator('.studio-paper').boundingBox();
    assert.ok(bar.y - paper.y > 200, 'assert corners after the dark article has scrolled behind the toolbar');
    const image = await page.screenshot({ path: path.join(evidence, `sticky-corners-${width}-${night ? 'night' : 'day'}.png`), scale: 'css' });
    const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (x, y) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
    const distance = (a, b) => Math.max(...a.map((v, channel) => Math.abs(v - b[channel])));
    const left = Math.ceil(bar.x), right = Math.floor(bar.x + bar.width), top = Math.ceil(bar.y);
    const backdrop = pixel(left - 8, top + 3);
    const surface = pixel(Math.floor((left + right) / 2), top + 3);
    assert.ok(distance(backdrop, surface) > 3, 'toolbar is still visually rounded, not a square white bar');
    for (const x of [left + 3, right - 3]) assert.ok(distance(pixel(x, top + 3), backdrop) <= 3, 'rounded corner shows the workspace backdrop');
    assert.ok(distance(pixel(left + 5, Math.ceil(bar.y + bar.height) + 5), backdrop) > 80, 'test actually displays a dark article');
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(evidence, 'results.json'), JSON.stringify({ passed: true, checks: ['GUI upload ordering', 'delete/undo ABA', 'authenticated sandbox thumbnails', 'divider expanded hit region', 'margin 0/80', 'new divider and mobile', 'UI-only block highlight', 'no highlight in copy', 'real bridge multiline persistence', 'rounded sticky toolbar over a dark article'], frames, pageErrors: errors }, null, 2));
  console.log(`Fix regression acceptance PASSED. Evidence: ${evidence}`);
} finally {
  await browser?.close(); await runtime?.close(); await fs.rm(project, { recursive: true, force: true });
}
