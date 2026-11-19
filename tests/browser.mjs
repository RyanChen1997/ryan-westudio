import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { load } from 'cheerio';
import { createEditorServer } from '../modules/editor/tools/server.mjs';
import { semantics } from '../modules/editor/core/markdown.mjs';
import { DEFAULT_TEMPLATE_ID, TECH_TEMPLATE_ID, getTemplate } from '../modules/templates/registry.mjs';
const project = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-browser-'));
const evidence = process.env.EVIDENCE_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-browser-evidence-'));
await fs.mkdir(evidence, { recursive: true });
let runtime, browser;
try {
  const sourceMarkdown = await fs.readFile('fixtures/editor-smoke.md', 'utf8');
  runtime = await createEditorServer({ project, port: 0, markdown: sourceMarkdown, sourceMarkdown, templateId: DEFAULT_TEMPLATE_ID });
  const changedMargin = getTemplate(DEFAULT_TEMPLATE_ID).layout.pageMargin + 1;
  const chrome = process.env.CHROME_PATH || (await fs.stat('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome').then(() => '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', () => undefined));
  browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = [], externalRequests = [];
  let exportRequests = 0;
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(runtime.url + '/')) externalRequests.push(request.url());
    if (request.url() === `${runtime.url}/api/export`) exportRequests++;
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__clipboardHTML = null;
    Object.defineProperty(navigator, 'clipboard', { value: { write: async items => { window.__clipboardHTML = await (await items[0].getType('text/html')).text(); } } });
  });
  const auth = { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' };
  const request = async (route, body) => {
    const res = await fetch(`${runtime.url}/api/tools/${route}`, { headers: auth, ...(body !== undefined ? { method: 'POST', body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json() };
  };
  const snapshot = async () => { const res = await request('snapshot'); assert.equal(res.status, 200); return res.data; };
  const op = async (...operations) => { const current = await snapshot(); const res = await request('operations', { expectedRevision: current.revision, operations }); assert.equal(res.status, 200, JSON.stringify(res.data)); return res.data; };
  const click = name => page.getByRole('button', { name, exact: true }).click();
  await page.goto(`${runtime.url}/#token=${runtime.token}`);
  await page.locator('.tiptap').waitFor();
  const initialView = await snapshot();
  assert.equal(initialView.sourceValidation?.stage, 'initial-structuring');
  assert.equal(initialView.sourceValidation.passed, true);
  assert.equal(await page.getByRole('button', { name: '校验并准备复制', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '查看发布预览', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '复制到公众号', exact: true }).isEnabled(), true);
  assert.equal(await page.locator('.studio').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(248, 250, 255)');
  assert.equal(await page.locator('.inspector').evaluate(el => getComputedStyle(el).borderRadius), '19px');
  await click('手机版'); assert.ok((await page.locator('.studio-paper').boundingBox()).width <= 390);
  await click('夜间模式'); await page.getByLabel('夜间阅读显示').waitFor();
  assert.equal(await page.locator('.studio').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(248, 250, 255)');
  await click('白天模式'); await click('电脑版');
  assert.equal((await snapshot()).revision, initialView.revision, 'display choices must not edit the document');
  await page.getByLabel('文章标题', { exact: true }).fill('界面核验标题');
  assert.equal((await snapshot()).doc.attrs.title, '界面核验标题');
  // Real keyboard input probe on the document, not a title/hidden textarea.
  await page.locator('.tiptap > p').first().click({ position: { x: 24, y: 12 } });
  await page.keyboard.insertText('GUI文字探针');
  let current = await snapshot(); assert.match(current.markdown, /GUI文字探针/);
  for (let i = 0; i < 7; i++) await page.keyboard.press('Shift+ArrowLeft');
  const initiallyBold = current.doc.content.some(n => n.content?.some(t => t.text?.includes('GUI文字探针') && t.marks?.some(m => m.type === 'bold')));
  await click('加粗');
  if (initiallyBold) await click('加粗');
  current = await snapshot();
  assert.ok(current.doc.content.some(n => n.content?.some(t => t.text?.includes('GUI文字探针') && t.marks?.some(m => m.type === 'bold'))));
  const markdownBeforeLocalSize = current.markdown;
  await page.getByLabel('局部字号', { exact: true }).click();
  await click('20px');
  current = await snapshot();
  assert.equal(current.markdown, markdownBeforeLocalSize);
  assert.ok(current.doc.content.some(n => n.content?.some(t => t.text?.includes('GUI文字探针') && t.marks?.some(m => m.type === 'visual' && m.attrs.fontSize === 20))));
  const markdownBeforeStyle = current.markdown;
  await page.getByRole('tab', { name: '样式调整', exact: true }).click();
  assert.equal(await page.getByLabel('当前节点字号').count(), 0);
  assert.equal(await page.getByLabel('文字颜色（#RRGGBB）').count(), 0);
  await click('页边距增大');
  current = await snapshot();
  assert.equal(current.markdown, markdownBeforeStyle);
  assert.equal(current.doc.attrs.pageMargin, changedMargin);
  assert.equal(await page.locator('.tiptap').evaluate(el => getComputedStyle(el).paddingLeft), `${changedMargin}px`);
  await click('撤销'); assert.equal((await snapshot()).doc.attrs.pageMargin, null);
  await click('重做'); assert.equal((await snapshot()).doc.attrs.pageMargin, changedMargin);
  const styled = current.nodes.find(n => n.type === 'paragraph'); assert.ok(styled);
  const inlineFrom = styled.text.indexOf('GUI文字探针');
  current = await op({ type: 'style', nodeId: styled.id, style: { fontSize: 18, color: '#005fc7' } },
    { type: 'style', nodeId: styled.id, range: true, from: inlineFrom, to: inlineFrom + 7, style: { color: '#c05285' } });
  assert.equal(current.markdown, markdownBeforeStyle);
  assert.equal(await page.locator(`.tiptap [data-node-id="${styled.id}"]`).evaluate(el => el.style.fontSize), '18px');
  // Tool writes are visible on this exact page; no second editor instance.
  const stale = current.revision;
  current = await op({ type: 'replaceText', nodeId: styled.id, from: 0, to: 0, text: 'AI同页可见：' });
  await page.getByText(/AI同页可见：/).first().waitFor();
  assert.equal((await request('operations', { expectedRevision: stale, operations: [{ type: 'title', text: '不能覆盖' }] })).status, 409);
  const beforeFailure = current;
  const failure = await request('operations', { expectedRevision: current.revision, operations: [{ type: 'replaceText', nodeId: styled.id, from: 0, to: 1, text: '不应出现' }, { type: 'style', style: { position: 'fixed' } }] });
  assert.equal(failure.status, 422); assert.deepEqual((await snapshot()).doc, beforeFailure.doc);
  const saved = await snapshot();
  await request('save', { expectedRevision: saved.revision });
  await page.reload(); await page.locator('.tiptap').waitFor();
  const restored = await snapshot(); assert.equal(restored.revision, saved.revision); assert.deepEqual(restored.doc, saved.doc); assert.equal(restored.markdown, saved.markdown);
  assert.equal(await page.locator('.tiptap').evaluate(el => getComputedStyle(el).paddingRight), `${changedMargin}px`);
  // Custom content NodeView edits and non-tail decoration insertion.
  await page.locator('.tiptap [data-article-node="card"] p').first().click(); await page.keyboard.insertText('卡片GUI');
  assert.match((await snapshot()).markdown, /卡片GUI/);
  await op({ type: 'insertBlock', block: 'decoration', afterId: styled.id });
  assert.equal(await page.locator('.tiptap [data-article-node="decoration"]').count(), 1);
  assert.doesNotMatch((await snapshot()).markdown, /butterfly|🦋/);
  const red = path.join(project, 'red.png'), blue = path.join(project, 'blue.png');
  await sharp({ create: { width: 20, height: 16, channels: 3, background: '#ff0000' } }).png().toFile(red);
  await sharp({ create: { width: 24, height: 16, channels: 3, background: '#0000ff' } }).png().toFile(blue);
  const imageSelector = '.tiptap img[data-article-node="image"]';
  await page.getByLabel('上传图片').setInputFiles(red);
  await page.locator(imageSelector).waitFor();
  const imageId = (await snapshot()).nodes.find(n => n.type === 'image').id;
  const oldRef = (await snapshot()).nodes.find(n => n.id === imageId).attrs.src;
  await page.locator(imageSelector).click();
  await page.getByLabel('上传图片').setInputFiles(blue);
  await page.waitForFunction(({ selector, old }) => document.querySelector(selector)?.src !== old, { selector: imageSelector, old: `${runtime.url}/assets/${oldRef.slice(6)}` });
  current = await snapshot(); assert.notEqual(current.nodes.find(n => n.id === imageId).attrs.src, oldRef);
  const newRef = current.nodes.find(n => n.id === imageId).attrs.src;

  // Reject image operations before applying even the valid members of the batch.
  const beforeImageTools = await snapshot();
  const empty = await op({ type: 'insertBlock', block: 'paragraph', afterId: styled.id });
  const nodeId = empty.nodes.find(node => node.type === 'paragraph' && node.text === '').id;
  const assetId = newRef.slice(6);
  for (const imageOp of [
    { type: 'insertBlock', block: 'image', assetId, afterId: styled.id },
    { type: 'convertBlock', block: 'image', nodeId, assetId },
    { type: 'replaceImage', nodeId: imageId, assetId },
  ]) {
    const result = await request('operations', { expectedRevision: empty.revision, operations: [
      { type: 'title', text: '不可部分提交' }, imageOp,
    ] });
    assert.equal(result.status, 422);
    assert.match(result.data.error, /不能插入或替换图片/);
    const after = await snapshot();
    for (const key of ['revision', 'doc', 'markdown', 'assets']) assert.deepEqual(after[key], empty[key]);
    assert.equal(runtime.store.current.revision, empty.revision);
  }
  current = await op({ type: 'undo' });
  assert.deepEqual(current.doc, beforeImageTools.doc);
  await page.reload(); await page.locator(imageSelector).waitFor();
  assert.deepEqual((await snapshot()).doc, current.doc);

  const list = current.nodes.find(n => n.type === 'bulletList');
  const listParagraph = current.nodes.find(n => n.type === 'paragraph' && n.position > list.position && n.position < list.position + list.size);
  current = await op({ type: 'toggleList', nodeId: listParagraph.id, kind: 'ordered' });
  assert.equal(await page.locator('.tiptap [data-article-node="orderedList"]').count(), 1);
  assert.equal(exportRequests, 0, 'opening and editing must not run background export/validation');
  await click('复制到公众号');
  await page.waitForFunction(() => window.__clipboardHTML !== null);
  const clipboard = await page.evaluate(() => window.__clipboardHTML); assert.ok(clipboard?.includes('data:image/png;base64,')); assert.doesNotMatch(clipboard, /<(script|style|iframe|form|svg|ul|ol|li)\b/i);
  const exported = await request('export', { expectedRevision: current.revision }); assert.equal(exported.status, 200); assert.equal(exported.data.html, clipboard);
  assert.equal('validation' in exported.data, false);
  // Development-only visual contract: compare the live editor with the very HTML just copied.
  const compareView = html => page.evaluate(async html => {
    const live = document.querySelector('.tiptap'), frame = document.createElement('iframe');
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${live.getBoundingClientRect().width}px;height:2400px;border:0;visibility:hidden;`;
    const loaded = new Promise(resolve => frame.onload = resolve);
    frame.srcdoc = `<!doctype html><html><body style="margin:0">${html}</body></html>`;
    document.body.append(frame); await loaded;
    try {
      const output = frame.contentDocument.body.firstElementChild;
      await Promise.all([...live.querySelectorAll('img'), ...output.querySelectorAll('img')].map(img => img.decode()));
      // ProseMirror may reuse adjacent inline mark wrappers; compare their actual text
      // runs separately instead of mistaking a different number of wrappers for reflow.
      const blocks = root => [root, ...root.querySelectorAll('*')].filter(el => !el.matches('a,strong,em,span:not([data-decorative]):not([aria-level]),:not(pre)>code,.ProseMirror-trailingBreak,.ProseMirror-separator'));
      const active = blocks(live), published = blocks(output);
      const pairs = active.map((el, i) => [el.dataset.articleNode || el.localName, el, published[i]]);
      const properties = ['fontSize', 'lineHeight', 'fontWeight', 'fontFamily', 'color', 'backgroundColor', 'whiteSpace', 'paddingTop', 'paddingBottom', 'marginTop', 'marginBottom', 'paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderTopWidth'];
      const differences = active.length === published.length ? [] : [{ elementCounts: [active.length, published.length] }];
      for (const [name, a, b] of pairs) {
        if (!a || !b) { differences.push({ name, missing: true }); continue; }
        const x = getComputedStyle(a), y = frame.contentWindow.getComputedStyle(b);
        for (const property of properties) if (x[property] !== y[property]) differences.push({ name, property, editor: x[property], copied: y[property] });
        for (const property of ['width', 'height']) if (Math.abs(a.getBoundingClientRect()[property] - b.getBoundingClientRect()[property]) > 1) differences.push({ name, property, editor: a.getBoundingClientRect()[property], copied: b.getBoundingClientRect()[property] });
      }
      function textRuns(root, win) {
        const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const offset = root.getBoundingClientRect(), runs = [], segmenter = new Intl.Segmenter('zh-CN');
        while (walker.nextNode()) {
          const text = walker.currentNode, range = root.ownerDocument.createRange();
          const style = win.getComputedStyle(text.parentElement);
          const styles = Object.fromEntries(['fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'color'].map(key => [key, style[key]]));
          for (const { segment, index } of segmenter.segment(text.data)) {
            range.setStart(text, index); range.setEnd(text, index + segment.length);
            runs.push({ text: segment, styles, boxes: [...range.getClientRects()].map(({ x, y, width, height }) => [x - offset.x, y - offset.y, width, height]) });
          }
        }
        return runs;
      }
      const onPage = textRuns(live, window), onClipboard = textRuns(output, frame.contentWindow);
      if (onPage.length !== onClipboard.length) differences.push({ textRunCounts: [onPage.length, onClipboard.length] });
      for (let i = 0; i < Math.min(onPage.length, onClipboard.length); i++) {
        const a = onPage[i], b = onClipboard[i];
        if (a.text !== b.text || JSON.stringify(a.styles) !== JSON.stringify(b.styles) || a.boxes.length !== b.boxes.length
          || a.boxes.some((box, j) => box.some((value, axis) => Math.abs(value - b.boxes[j][axis]) > 1))) differences.push({ liveText: a, copiedText: b });
      }
      const butterfly = live.querySelector('[data-article-node="decoration"] img');
      const editorPNG = new Uint8Array(await (await fetch(butterfly.src)).arrayBuffer());
      const copiedButterfly = output.querySelector('section[data-decorative="true"] > img');
      const copiedPNG = Uint8Array.from(atob(copiedButterfly.src.split(',')[1]), char => char.charCodeAt(0));
      return { differences, sameDecorationBytes: editorPNG.length === copiedPNG.length && editorPNG.every((value, i) => value === copiedPNG[i]) };
    } finally { frame.remove(); }
  }, html);
  const viewAgreement = await compareView(clipboard);
  assert.deepEqual(viewAgreement.differences, [], 'live editor and copied HTML must share visual styles/geometry');
  assert.equal(viewAgreement.sameDecorationBytes, true);
  await fs.writeFile(path.join(evidence, 'wysiwyg.json'), JSON.stringify(viewAgreement, null, 2));
  await fs.writeFile(path.join(evidence, 'clipboard.html'), clipboard);
  await click('夜间模式'); await page.screenshot({ path: path.join(evidence, 'desktop-night.png') });
  await click('白天模式');
  const beforeSwitch = await snapshot();
  await page.getByRole('tab', { name: '模板选择', exact: true }).click();
  await click(getTemplate(TECH_TEMPLATE_ID).name);
  const switched = await snapshot();
  assert.equal(switched.markdown, beforeSwitch.markdown); assert.deepEqual(semantics(switched.doc), semantics(beforeSwitch.doc));
  assert.equal(switched.nodes.find(n => n.id === styled.id).attrs.color, null);
  assert.equal(switched.doc.attrs.pageMargin, null);
  assert.equal(switched.nodes.filter(n => n.type === 'decoration').length, 0);
  assert.equal(switched.nodes.find(n => n.id === imageId).attrs.src, newRef);
  await page.locator(imageSelector).first().evaluate(img => img.decode());
  assert.equal(await page.getByRole('button', { name: '复制到公众号', exact: true }).isEnabled(), true);
  await op({ type: 'replaceText', nodeId: styled.id, from: 0, to: 0, text: '切换后立即复制：' });
  const currentText = (await snapshot()).nodes.find(n => n.id === styled.id).text;
  const visualStart = currentText.indexOf('GUI文字探针');
  await op({ type: 'style', nodeId: styled.id, range: true, from: visualStart, to: visualStart + 7, style: { fontSize: 22, color: '#c05285' } },
    { type: 'insertBlock', block: 'decoration', afterId: styled.id });
  await page.evaluate(() => { window.__clipboardHTML = null; });
  await click('复制到公众号');
  await page.waitForFunction(() => window.__clipboardHTML?.includes('切换后立即复制：'));
  const secondView = await compareView(await page.evaluate(() => window.__clipboardHTML));
  assert.deepEqual(secondView.differences, [], 'the template switched from the gallery also matches the copied output');
  assert.equal(secondView.sameDecorationBytes, true);
  await fs.writeFile(path.join(evidence, `wysiwyg-${TECH_TEMPLATE_ID}.json`), JSON.stringify(secondView, null, 2));
  await page.screenshot({ path: path.join(evidence, 'desktop-editor.png') });
  const purchaseURL = 'https://westudio.airyanchen.cc/';
  const dialog = page.getByRole('dialog', { name: '升级到 Ryan-WeStudio-Pro' });
  const cta = dialog.getByRole('link', { name: '前往官网购买 Pro' });
  const beforePromo = await snapshot();
  const initialExternal = externalRequests.length;
  const promoTab = page.getByRole('button', { name: 'WeStudio Pro · 查看更多功能', exact: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const trigger = page.getByRole('button', { name: '推送到草稿箱', exact: true });
    await trigger.click(); await dialog.waitFor();
    assert.deepEqual(await dialog.locator('li').allTextContents(), [
      '复刻喜欢的排版：给一篇公众号文章的链接，把它的排版做成可复用的专属模板。',
      '一键推送到草稿箱：确认后，将排好的文章送到公众号草稿箱。',
      '更多风格的内置模板', '享受永久更新',
    ]);
    assert.equal(await cta.getAttribute('href'), purchaseURL);
    assert.equal(await cta.getAttribute('target'), '_blank');
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await promoTab.focus(); await promoTab.press('Enter'); await dialog.waitFor();
    await page.screenshot({ animations: 'disabled', path: path.join(evidence, `promotion-${width}.png`) });
    await dialog.getByRole('button', { name: '继续编辑' }).click();
    await dialog.waitFor({ state: 'hidden' });
    const tab = await promoTab.boundingBox();
    await promoTab.click({ position: { x: tab.width / 2, y: 12 } }); await dialog.waitFor();
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
  }
  assert.equal(externalRequests.length, initialExternal, 'promotion triggers must not cause external requests');
  // Verify the real link navigation without making an external network request.
  await context.route(purchaseURL, route => route.fulfill({ body: 'Official page navigation check' }));
  await page.getByRole('button', { name: '推送到草稿箱', exact: true }).click(); await dialog.waitFor();
  const popupReady = page.waitForEvent('popup');
  await cta.click();
  const popup = await popupReady;
  await popup.waitForURL(purchaseURL); await popup.close();
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
  await context.unroute(purchaseURL);
  const afterPromo = await snapshot();
  for (const key of ['doc', 'markdown', 'revision']) assert.deepEqual(afterPromo[key], beforePromo[key]);
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    const layout = await page.evaluate(() => {
      const paper = document.querySelector('.studio-paper'), inspector = document.querySelector('.inspector');
      return { overflow: document.documentElement.scrollWidth > innerWidth, paperRadius: getComputedStyle(paper).borderRadius,
        panelRadius: getComputedStyle(inspector).borderRadius, stageTop: document.querySelector('.editor-stage').getBoundingClientRect().top,
        panelTop: inspector.getBoundingClientRect().top, headerHeight: document.querySelector('.editor-header').getBoundingClientRect().height };
    });
    assert.equal(layout.overflow, false, `${width}px horizontal overflow`);
    assert.equal(layout.paperRadius, layout.panelRadius, `${width}px matching panel corners`);
    assert.equal(layout.paperRadius, width <= 820 ? '16px' : '19px');
    if (width > 670) assert.equal(layout.stageTop, layout.panelTop, `${width}px panel top alignment`);
    assert.equal(await page.getByRole('button', { name: '保存项目', exact: true }).isVisible(), true);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    // The app owns its scroll regions; capture the viewport rather than resizing it to document height.
    await page.screenshot({ path: path.join(evidence, `editor-${width}.png`) });
  }
  await page.screenshot({ path: path.join(evidence, 'mobile-editor.png') });
  await page.locator('.inspector').scrollIntoViewIfNeeded();
  await page.getByRole('tab', { name: '样式调整', exact: true }).click();
  await page.screenshot({ path: path.join(evidence, 'mobile-inspector.png') });
  assert.equal(await page.getByRole('button', { name: '页边距增大', exact: true }).isVisible(), true);
  // A failed disk/API save must never be shown as a successful save; retry recovers.
  const beforeSaveFailure = runtime.store.current.revision;
  await page.route('**/api/project', route => route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: '模拟保存失败' }) }));
  await page.locator('.tiptap > p').first().click({ position: { x: 24, y: 12 } });
  await page.keyboard.insertText('保存重试');
  await page.getByText(/保存失败：模拟保存失败/).waitFor();
  assert.equal(runtime.store.current.revision, beforeSaveFailure);
  assert.match((await snapshot()).markdown, /保存重试/);
  await page.unroute('**/api/project');
  await click('保存项目');
  await page.getByText(/已保存 · Markdown 已同步/).waitFor();
  const afterRetry = await snapshot();
  await page.reload(); await page.locator('.tiptap').waitFor();
  assert.deepEqual((await snapshot()).doc, afterRetry.doc);
  // Restart at the same URL: disconnected toolbar rejects edits and a new hash token reconnects.
  const port = runtime.server.address().port;
  await runtime.close(); runtime = null;
  await page.waitForFunction(() => document.querySelector('.tiptap')?.contentEditable === 'false');
  const disconnectedHTML = await page.locator('.tiptap').innerHTML();
  await page.getByRole('tab', { name: '样式调整', exact: true }).click();
  await click('页边距增大');
  await page.getByText(/连接已断开，不能继续编辑/).waitFor();
  assert.equal(await page.locator('.tiptap').innerHTML(), disconnectedHTML);
  runtime = await createEditorServer({ project, port });
  auth.Authorization = `Bearer ${runtime.token}`;
  await page.goto(`${runtime.url}/#token=${runtime.token}`);
  await page.waitForFunction(() => location.hash === '' && document.querySelector('.tiptap')?.contentEditable === 'true');
  assert.deepEqual((await snapshot()).doc, afterRetry.doc);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(errors, []);
  // A separate clean context exercises Chromium's actual clipboard permission/write/read path.
  await context.close();
  const clipboardContext = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const clipboardPage = await clipboardContext.newPage();
  clipboardPage.on('pageerror', error => errors.push(error.message));
  await clipboardPage.goto(`${runtime.url}/#token=${runtime.token}`);
  await clipboardPage.locator('.tiptap').waitFor();
  await clipboardPage.getByRole('button', { name: '复制到公众号', exact: true }).click();
  await clipboardPage.getByText(/已复制 r/).waitFor();
  const actualClipboard = await clipboardPage.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return (await items[0].getType('text/html')).text();
  });
  const latestClipboardExport = await request('export', { expectedRevision: (await snapshot()).revision });
  assert.equal(latestClipboardExport.status, 200);
  assert.equal(load(actualClipboard, null, false).html(), load(latestClipboardExport.data.html, null, false).html());
  assert.match(actualClipboard, /GUI文字探针/); assert.match(actualClipboard, /data:image\/png;base64,/);
  await fs.writeFile(path.join(evidence, 'real-clipboard.html'), actualClipboard);
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(evidence, 'results.json'), JSON.stringify({ passed: true, revision: (await snapshot()).revision, pageErrors: errors, checks: ['GUI text/bold/page margin', 'reference palette and panel geometry', 'device/night display without revision', 'AI same page', 'stale revision', 'atomic failed batch', 'GUI undo/redo', 'save/refresh exact state', 'card/decorations', 'image insert/replace', 'copy latest state without validation or publication preview', 'template switch semantic retention and visual reset', 'mobile overflow', 'save failure/retry', 'no external requests', 'server restart/new hash token', 'disconnected edits rejected', 'Chromium actual clipboard write/read'], clipboard: 'Payload equality plus real Chromium clipboard write/read passed; not a WeChat paste test' }, null, 2));
  console.log(`Browser acceptance PASSED. Evidence: ${evidence}`);
} finally {
  await browser?.close(); await runtime?.close(); await fs.rm(project, { recursive: true, force: true });
}
