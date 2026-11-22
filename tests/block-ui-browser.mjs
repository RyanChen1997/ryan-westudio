import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { createEditorServer } from '../modules/editor/tools/server.mjs';

const project = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-block-browser-'));
const evidence = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-block-ui-evidence-'));
let runtime, browser;
try {
  runtime = await createEditorServer({ project, port: 0, templateId: 'blue-sequence', markdown: await fs.readFile('fixtures/editor-smoke.md', 'utf8') });
  const executablePath = process.env.CHROME_PATH || await fs.stat('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome').then(() => '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', () => undefined);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const headers = { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' };
  const snapshot = async () => {
    const response = await fetch(`${runtime.url}/api/tools/snapshot`, { headers });
    assert.equal(response.status, 200); return response.json();
  };
  const op = async (...operations) => {
    const current = await snapshot();
    const response = await fetch(`${runtime.url}/api/tools/operations`, { method: 'POST', headers, body: JSON.stringify({ expectedRevision: current.revision, operations }) });
    assert.equal(response.status, 200, await response.clone().text()); return response.json();
  };
  const button = name => page.getByRole('button', { name, exact: true });
  const item = name => page.getByRole('menuitem', { name, exact: true });
  const block = id => page.locator(`.tiptap [data-node-id="${id}"]`);
  const openMenu = async (id, padding = false) => {
    await page.mouse.move(5, 5);
    await block(id).hover(padding ? { position: { x: 4, y: 4 } } : {});
    await page.waitForFunction(id => document.querySelector('.block-handle')?.dataset.blockId === id, id);
    const rect = await button('区块操作菜单').boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, { steps: 12 });
    assert.equal(await button('区块操作菜单').getAttribute('data-block-id'), id, 'text-to-handle corridor must retain target');
    await button('区块操作菜单').click();
    await page.getByRole('menu', { name: '块操作', exact: true }).waitFor();
  };
  const insert = async (anchor, where = 'after') => {
    await openMenu(anchor);
    const before = await snapshot(), ids = new Set(before.nodes.map(node => node.id));
    await item(where === 'after' ? '在下方插入块' : '在上方插入块').click();
    await page.getByRole('menu', { name: '新增区块样式', exact: true }).waitFor();
    const after = await snapshot(), added = after.nodes.find(node => node.type === 'paragraph' && !ids.has(node.id));
    assert.ok(added); assert.equal(added.text, '');
    assert.deepEqual(await page.getByRole('menu', { name: '新增区块样式', exact: true }).getByRole('menuitem').allTextContents(), ['普通段落', '引用块', '提示块', '图片', '装饰条']);
    assert.equal(await item('其他样式').count(), 0);
    assert.equal(await item('普通段落').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(244, 240, 255)');
    return { id: added.id, before, after };
  };
  const waitEditorFocus = () => page.waitForFunction(() => document.activeElement?.classList.contains('tiptap'));
  const headingTop = async id => block(id).evaluate(el => el.getBoundingClientRect().top);

  await page.goto(`${runtime.url}/#token=${runtime.token}`); await page.locator('.tiptap').waitFor();
  const initial = await snapshot(), paragraph = initial.nodes.find(node => node.type === 'paragraph');
  await openMenu(paragraph.id);
  assert.deepEqual(await page.getByRole('menu', { name: '块操作', exact: true }).getByRole('menuitem').allTextContents(), ['删除此块', '在上方插入块', '在下方插入块']);
  assert.equal((await snapshot()).revision, initial.revision);
  await page.screenshot({ path: path.join(evidence, 'block-actions.png') });
  await page.keyboard.press('Escape');
  assert.equal((await snapshot()).revision, initial.revision);

  // A default empty paragraph is inserted immediately; dismissing the picker keeps it.
  const cancelled = await insert(paragraph.id);
  assert.equal(cancelled.after.markdown, cancelled.before.markdown);
  await page.screenshot({ path: path.join(evidence, 'basic-style-picker.png') });
  await page.keyboard.press('Escape'); await waitEditorFocus();
  assert.ok((await snapshot()).nodes.some(node => node.id === cancelled.id));
  await button('撤销').click(); assert.deepEqual((await snapshot()).doc, initial.doc);
  const outside = await insert(paragraph.id);
  await page.getByRole('tab', { name: '模板选择', exact: true }).click();
  await page.getByRole('menu', { name: '新增区块样式', exact: true }).waitFor({ state: 'hidden' });
  assert.ok((await snapshot()).nodes.some(node => node.id === outside.id));
  assert.equal((await snapshot()).revision, outside.after.revision);
  await button('撤销').click();

  // Above the very first heading, ordinary paragraph finishes without a second block.
  const firstHeading = initial.nodes.find(node => node.type === 'heading');
  const above = await insert(firstHeading.id, 'before');
  assert.equal(above.after.doc.content[0].attrs.id, above.id);
  assert.equal(above.after.doc.content[1].attrs.id, firstHeading.id);
  await item('普通段落').click(); await waitEditorFocus();
  await page.keyboard.insertText('新增普通');
  await page.keyboard.insertText('段落。');
  assert.equal((await snapshot()).nodes.find(node => node.id === above.id).text, '新增普通段落。');
  await openMenu(above.id); await item('删除此块').click();
  assert.equal((await snapshot()).nodes.some(node => node.id === above.id), false);
  await button('撤销').click(); assert.equal((await snapshot()).nodes.find(node => node.id === above.id).text, '新增普通段落。');
  await button('重做').click();

  const quote = await insert(paragraph.id);
  await item('引用块').click(); await waitEditorFocus(); await page.keyboard.insertText('新增引用块。');
  let current = await snapshot();
  assert.equal(current.nodes.find(node => node.id === quote.id).type, 'blockquote');
  assert.equal(current.doc.content.length, quote.after.doc.content.length, 'style conversion must not insert another sibling');
  assert.match(current.markdown, /> 新增引用块/);

  const callout = await insert(paragraph.id, 'before');
  await item('提示块').click(); await waitEditorFocus(); await page.keyboard.insertText('新增提示块。');
  current = await snapshot(); assert.equal(current.nodes.find(node => node.id === callout.id).type, 'card');
  assert.match(current.markdown, /:::card\n新增提示块/);
  const inner = current.nodes.find(node => node.type === 'paragraph' && node.text === '新增提示块。');
  await openMenu(inner.id); await page.keyboard.press('Escape'); // Nested text must not switch to its parent en route to the handle.

  const divider = await insert(paragraph.id); await item('装饰条').click();
  assert.equal((await snapshot()).nodes.find(node => node.id === divider.id).type, 'horizontalRule');

  const picture = path.join(project, 'local-image.png');
  await sharp({ create: { width: 32, height: 24, channels: 3, background: '#4477aa' } }).png().toFile(picture);
  const image = await insert(paragraph.id);
  const chooserEvent = page.waitForEvent('filechooser'); await item('图片').click(); await (await chooserEvent).setFiles(picture);
  await page.locator(`.tiptap img[data-node-id="${image.id}"]`).waitFor();
  current = await snapshot(); assert.equal(current.nodes.find(node => node.id === image.id).type, 'image');
  assert.equal(current.doc.content.length, image.after.doc.content.length);

  // One drag = one visually identical edit/export transaction, with untouched Markdown and PNG.
  const beforeResize = current;
  const imageBox = () => block(image.id).boundingBox();
  const resized = () => page.getByRole('slider', { name: '调整图片大小', exact: true });
  const original = await imageBox();
  await openMenu(image.id);
  assert.deepEqual(await page.getByRole('menu', { name: '块操作', exact: true }).getByRole('menuitem').allTextContents(),
    ['删除此块', '在上方插入块', '在下方插入块', '调整图片大小']);
  await item('调整图片大小').click();
  assert.equal(await resized().getAttribute('aria-valuemin'), '10');
  assert.equal(await resized().getAttribute('aria-valuemax'), '100');
  assert.equal(await resized().getAttribute('aria-valuetext'), '100%');
  await page.screenshot({ path: path.join(evidence, 'image-scale-slider.png') });
  const thumb = await resized().boundingBox();
  const track = await page.locator('.astryx-slider-track').boundingBox();
  const thumbX = thumb.x + thumb.width / 2, thumbY = thumb.y + thumb.height / 2;
  await page.mouse.move(thumbX, thumbY); await page.mouse.down();
  await page.mouse.move(track.x - 20, thumbY, { steps: 10 });
  assert.equal((await snapshot()).revision, beforeResize.revision, 'partial drags do not write');
  await page.mouse.up();
  current = await snapshot();
  assert.equal(current.nodes.find(n => n.id === image.id).attrs.scale, 10, `drag stopped at ${await resized().getAttribute('aria-valuetext')}`);
  assert.equal(current.revision, beforeResize.revision + 1);
  assert.equal(current.markdown, beforeResize.markdown);
  assert.equal(current.nodes.find(n => n.id === image.id).attrs.src, beforeResize.nodes.find(n => n.id === image.id).attrs.src);
  assert.equal(await resized().getAttribute('aria-valuetext'), '10%');
  const compact = await imageBox();
  const near = (actual, target) => assert.ok(Math.abs(actual - target) < 1, `${actual} not near ${target}`);
  near(compact.width, original.width * 0.1); near(compact.height, original.height * 0.1);
  near(compact.x + compact.width / 2, original.x + original.width / 2);
  const resizeExport = await fetch(`${runtime.url}/api/tools/export`, { method: 'POST', headers, body: JSON.stringify({ expectedRevision: current.revision }) });
  assert.equal(resizeExport.status, 200, await resizeExport.clone().text());
  const preview = await context.newPage();
  await preview.setViewportSize(page.viewportSize());
  const canvas = await page.locator('.tiptap').boundingBox();
  const { html } = await resizeExport.json();
  await preview.setContent(`<main style="width:${canvas.width}px">${html}</main>`);
  const published = preview.locator('img[alt="local-image.png"]'); await published.waitFor();
  await published.evaluate(img => img.decode());
  const exportedBox = await published.boundingBox();
  near(exportedBox.width, compact.width); near(exportedBox.height, compact.height);
  assert.doesNotMatch(html, /调整图片大小|astryx-slider/);
  await preview.close();
  await resized().focus(); await page.keyboard.press('ArrowRight');
  assert.equal((await snapshot()).nodes.find(n => n.id === image.id).attrs.scale, 20);
  await page.keyboard.press('Home');
  assert.equal((await snapshot()).nodes.find(n => n.id === image.id).attrs.scale, 10);
  await page.keyboard.press('End');
  assert.equal((await snapshot()).nodes.find(n => n.id === image.id).attrs.scale, null);
  await page.keyboard.press('Escape'); await waitEditorFocus();
  await button('撤销').click();
  assert.equal((await snapshot()).nodes.find(n => n.id === image.id).attrs.scale, 10);
  await button('撤销').click();
  assert.equal((await snapshot()).nodes.find(n => n.id === image.id).attrs.scale, 20);

  // A template with intrinsic image width also scales down small images (never enlarges them).
  const templateId = current.doc.attrs.templateId;
  await op({ type: 'template', templateId: 'seneasy-blue-rule' });
  const intrinsicImage = page.locator('.tiptap img[alt="local-image.png"]');
  await intrinsicImage.evaluate(img => img.decode());
  const intrinsic = await intrinsicImage.boundingBox();
  await op({ type: 'resizeImage', nodeId: image.id, scale: 50 });
  const half = await intrinsicImage.boundingBox();
  near(half.width, intrinsic.width * 0.5); near(half.height, intrinsic.height * 0.5);
  await op({ type: 'template', templateId }, { type: 'resizeImage', nodeId: image.id, scale: 20 });

  const cancelledImage = await insert(paragraph.id);
  const cancelledChooser = page.waitForEvent('filechooser'); await item('图片').click(); await (await cancelledChooser).setFiles([]);
  await page.getByRole('menu', { name: '新增区块样式', exact: true }).waitFor({ state: 'hidden' });
  assert.equal((await snapshot()).nodes.find(node => node.id === cancelledImage.id).type, 'paragraph');
  await button('撤销').click();

  // A concurrent edit of the placeholder must not be silently replaced by a chosen style.
  const changed = await insert(paragraph.id);
  await op({ type: 'replaceText', nodeId: changed.id, text: 'AI刚刚写入，必须保留。' });
  await item('提示块').click();
  assert.equal((await snapshot()).nodes.find(node => node.id === changed.id).text, 'AI刚刚写入，必须保留。');
  await page.getByRole('alert').filter({ hasText: '新增段落已被修改' }).waitFor();

  // Lists are one block even when their child text is under the pointer.
  current = await snapshot();
  const list = current.nodes.find(node => node.type === 'bulletList');
  const listParagraph = current.nodes.find(node => node.type === 'paragraph' && node.position > list.position && node.position < list.position + list.size);
  await page.mouse.move(5, 5); await block(listParagraph.id).hover();
  await page.waitForFunction(id => document.querySelector('.block-handle')?.dataset.blockId === id, list.id);
  await button('区块操作菜单').click(); await item('删除此块').click();
  assert.equal((await snapshot()).nodes.some(node => node.id === list.id), false);
  await button('撤销').click(); assert.ok((await snapshot()).nodes.some(node => node.id === list.id));

  // Reading outline: real headings, a continuous hover bridge, view-only chapter navigation.
  const beforeOutline = await snapshot();
  await button('展开文章目录').hover(); await page.locator('.outline-popover').waitFor();
  const headings = beforeOutline.nodes.filter(node => node.type === 'heading');
  assert.deepEqual(await page.locator('.outline-items button').allTextContents(), headings.map(node => node.text));
  const rail = await button('展开文章目录').boundingBox(), destination = await page.locator('.outline-items button').last().boundingBox();
  await page.mouse.move(rail.x + 10, rail.y + 12);
  await page.mouse.move(destination.x + 30, destination.y + destination.height / 2, { steps: 16 });
  assert.equal(await page.locator('.outline-popover').isVisible(), true, 'hovering across the gap must not collapse the outline');
  await page.locator('.outline-items button').last().click();
  assert.equal((await snapshot()).revision, beforeOutline.revision); assert.equal((await snapshot()).markdown, beforeOutline.markdown);
  assert.ok((await headingTop(headings.at(-1).id)) >= 80);
  await page.screenshot({ path: path.join(evidence, 'reading-outline.png') });
  await page.keyboard.press('Escape'); assert.equal(await page.locator('.outline-popover').count(), 0);
  await button('展开文章目录').focus(); await page.keyboard.press('ArrowDown');
  await page.locator('.outline-popover').waitFor(); await page.keyboard.press('Escape');

  // Tiptap title edits are reflected in the directory without a second model.
  const first = headings[0];
  await op({ type: 'replaceText', nodeId: first.id, text: '目录同步后的标题' });
  await button('展开文章目录').click();
  assert.equal(await page.locator('.outline-items button').first().innerText(), '目录同步后的标题');
  await page.keyboard.press('Escape');

  // Keyboard entry opens the exact same three actions, not another editing channel.
  await block(paragraph.id).click({ position: { x: 20, y: 10 } });
  const beforeShortcut = await snapshot();
  await page.keyboard.press('Alt+Shift+Enter'); await page.getByRole('menu', { name: '块操作', exact: true }).waitFor();
  assert.equal((await snapshot()).revision, beforeShortcut.revision);
  await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitem');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await page.getByRole('menu', { name: '新增区块样式', exact: true }).waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitem' && document.activeElement.closest('[data-block-menu="styles"]') && document.activeElement.textContent.includes('普通段落'));
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await waitEditorFocus(); await page.keyboard.insertText('键盘插入引用。');
  assert.match((await snapshot()).markdown, /> 键盘插入引用/);

  // Small viewport: both layers stay in view and the touch/click directory path remains usable.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.studio').evaluate(el => { el.scrollTop = 0; });
  await button('展开文章目录').click(); await page.locator('.outline-popover').waitFor();
  const popup = await page.locator('.outline-popover').boundingBox();
  assert.ok(popup.x >= 0 && popup.x + popup.width <= 390);
  await page.locator('.outline-items button').last().click();
  const headerBottom = await page.locator('.editor-header').evaluate(el => el.getBoundingClientRect().bottom);
  const toolsBottom = await page.locator('.editor-tools').evaluate(el => el.getBoundingClientRect().bottom);
  assert.ok((await headingTop(headings.at(-1).id)) >= Math.max(headerBottom, toolsBottom), 'mobile chapter heading must not hide behind either sticky bar');
  await page.screenshot({ path: path.join(evidence, 'mobile-outline.png') });
  await page.keyboard.press('Escape');
  const mobile = await insert(paragraph.id);
  const menu = await page.getByRole('menu', { name: '新增区块样式', exact: true }).boundingBox();
  assert.ok(menu.x >= 0 && menu.x + menu.width <= 390 && menu.y >= 0 && menu.y + menu.height <= 844);
  await page.screenshot({ path: path.join(evidence, 'mobile-style-picker.png') });
  await page.keyboard.press('Escape');
  assert.ok((await snapshot()).nodes.some(node => node.id === mobile.id));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

  const saved = await snapshot();
  await fetch(`${runtime.url}/api/tools/save`, { method: 'POST', headers, body: JSON.stringify({ expectedRevision: saved.revision }) });
  await page.reload(); await page.locator('.tiptap').waitFor();
  assert.deepEqual((await snapshot()).doc, saved.doc);
  const exported = await fetch(`${runtime.url}/api/tools/export`, { method: 'POST', headers, body: JSON.stringify({ expectedRevision: saved.revision }) }).then(res => res.json());
  assert.doesNotMatch(exported.html, /data-block-ui|data-outline-ui|选择区块样式|区块操作菜单/);
  assert.deepEqual(errors, []);
  await context.close();
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const touchPage = await touch.newPage(); touchPage.on('pageerror', error => errors.push(error.message));
  await touchPage.goto(`${runtime.url}/#token=${runtime.token}`); await touchPage.locator('.tiptap').waitFor();
  const beforeTouch = await snapshot();
  await touchPage.getByRole('button', { name: '展开文章目录', exact: true }).tap();
  await touchPage.locator('.outline-popover').waitFor();
  await touchPage.locator('.outline-items button').last().tap();
  await touchPage.getByRole('button', { name: '收起文章目录', exact: true }).tap();
  assert.equal((await snapshot()).revision, beforeTouch.revision);
  await touchPage.getByRole('button', { name: '夜间模式', exact: true }).tap();
  await touchPage.getByLabel('夜间阅读显示').waitFor();
  await touchPage.getByRole('button', { name: '展开文章目录', exact: true }).tap();
  await touchPage.locator('.outline-items button').last().tap();
  await touchPage.getByRole('button', { name: '收起文章目录', exact: true }).tap();
  await touchPage.getByRole('button', { name: '白天模式', exact: true }).tap();
  assert.equal((await snapshot()).revision, beforeTouch.revision);
  await touchPage.locator(`.tiptap [data-node-id="${image.id}"]`).tap();
  await touchPage.getByRole('button', { name: '区块操作菜单', exact: true }).tap();
  await touchPage.getByRole('menuitem', { name: '调整图片大小', exact: true }).tap();
  const touchControl = touchPage.getByRole('group', { name: '调整图片大小', exact: true });
  const controlRect = await touchControl.boundingBox();
  assert.ok(controlRect.x >= 0 && controlRect.x + controlRect.width <= 390);
  await touchPage.screenshot({ path: path.join(evidence, 'touch-image-scale-slider.png') });
  const marks = touchControl.getByTestId('slider-mark');
  assert.equal(await marks.count(), 10);
  const lastMark = await marks.last().boundingBox();
  await touchPage.touchscreen.tap(lastMark.x + lastMark.width / 2, lastMark.y + lastMark.height / 2);
  await touchPage.waitForFunction(id => document.querySelector(`[data-node-id="${id}"]`).style.width === '100%', image.id, { timeout: 3000 });
  assert.equal((await snapshot()).revision, beforeTouch.revision + 1);
  await touchPage.keyboard.press('Escape');
  await touchPage.locator(`.tiptap [data-node-id="${paragraph.id}"]`).tap({ position: { x: 20, y: 12 } });
  await touchPage.getByRole('button', { name: '区块操作菜单', exact: true }).tap();
  await touchPage.getByRole('menuitem', { name: '在下方插入块', exact: true }).tap();
  await touchPage.getByRole('menu', { name: '新增区块样式', exact: true }).waitFor();
  await touchPage.screenshot({ path: path.join(evidence, 'touch-style-picker.png') });
  await touchPage.getByRole('menuitem', { name: '普通段落', exact: true }).tap();
  assert.equal((await snapshot()).revision, beforeTouch.revision + 2);
  const beforeMany = await snapshot(), oldIds = new Set(beforeMany.nodes.map(node => node.id));
  await op(...Array.from({ length: 36 }, (_, i) => ({ type: 'insertBlock', block: 'paragraph', text: `更多章节 ${i + 1}` })));
  const additional = (await snapshot()).nodes.filter(node => node.type === 'paragraph' && !oldIds.has(node.id));
  await op(...additional.map(node => ({ type: 'setBlock', nodeId: node.id, block: 'h2' })));
  await touchPage.getByRole('button', { name: '展开文章目录', exact: true }).tap();
  assert.equal(await touchPage.locator('.outline-items button').count(), (await snapshot()).nodes.filter(node => node.type === 'heading').length);
  assert.equal(await touchPage.locator('.outline-rail i').count(), 16);
  await touchPage.locator('.outline-items button').last().tap();
  assert.equal(await touchPage.locator('.outline-rail i[data-current="true"]').count(), 1, 'later chapters still have a current marker on a compressed rail');
  await touchPage.getByRole('button', { name: '收起文章目录', exact: true }).tap();

  // Long articles keep the wrapping formatting bar usable in both scroll layouts.
  const tools = touchPage.getByRole('toolbar', { name: '文字与段落工具' });
  for (const width of [1440, 390]) {
    await touchPage.setViewportSize({ width, height: 844 });
    const scroller = touchPage.locator(width === 390 ? '.studio' : '.editor-stage');
    await scroller.evaluate(el => { el.scrollTop = 0; });
    const headerY = (await touchPage.locator('.editor-header').boundingBox()).y;
    const before = await touchPage.locator('.tiptap').boundingBox();
    await scroller.evaluate(el => { el.scrollTop = 480; });
    const after = await touchPage.locator('.tiptap').boundingBox();
    assert.ok(before.y - after.y > 400, 'body actually scrolls');
    assert.equal((await touchPage.locator('.editor-header').boundingBox()).y, headerY);
    const anchor = touchPage.locator(width === 390 ? '.editor-header' : '.editor-stage');
    const rect = await anchor.boundingBox(), { y } = await tools.boundingBox();
    assert.ok(Math.abs(y - (width === 390 ? rect.y + rect.height : rect.y)) <= 1, 'formatting toolbar stays at the top of the reading area');
    await tools.locator('summary').tap();
    await tools.getByRole('button', { name: '16', exact: true }).waitFor();
    await touchPage.keyboard.press('Escape');
    const heading = '.tiptap [role="heading"], .tiptap :is(h1,h2,h3,h4)';
    await touchPage.getByRole('button', { name: '展开文章目录', exact: true }).tap();
    await touchPage.locator('.outline-items button').nth(14).tap();
    const dest = await touchPage.locator(heading).nth(14).boundingBox(), toolBox = await tools.boundingBox();
    assert.ok(dest.y >= toolBox.y + toolBox.height && dest.y < 844, 'chapter jump lands below the toolbar and inside the viewport');
    await touchPage.getByRole('button', { name: '收起文章目录', exact: true }).tap();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(evidence, 'results.json'), JSON.stringify({ passed: true, checks: ['three block actions', 'text/handle hover corridor', 'insert before/after', 'picker dismiss preserves blank', 'five basic styles only', 'same-node conversion', 'local image chooser/cancel', 'concurrent content protection', 'undo/redo', 'nested blocks/lists', 'hover/click/keyboard outline', 'real-time headings', 'view-only navigation', 'mobile bounds/sticky header', 'sticky formatting bar and unoccluded chapter jumps on desktop/mobile', 'save/restore', 'UI excluded from copy', 'real touch emulation', 'long outline compressed current marker'], errors }, null, 2));
  console.log(`Block UI acceptance PASSED. Evidence: ${evidence}`);
} finally {
  await browser?.close(); await runtime?.close(); await fs.rm(project, { recursive: true, force: true });
}
