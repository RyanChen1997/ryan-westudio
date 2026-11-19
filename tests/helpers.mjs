import { JSDOM } from 'jsdom';
import { assignIds, schema } from '../modules/editor/core/schema.mjs';
import { parseMarkdown, toMarkdown } from '../modules/editor/core/markdown.mjs';
export function installDOM() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://127.0.0.1', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'DOMParser', 'getComputedStyle']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  globalThis.requestAnimationFrame = cb => setTimeout(cb, 0); globalThis.cancelAnimationFrame = clearTimeout;
  return dom;
}
export function snapshot(markdown = '---\ntitle: "中文标题"\n---\n\n# 第一章\n\n中文 **重点** 与 *斜体*。\n', templateId) {
  const doc = schema().nodeFromJSON(assignIds(parseMarkdown(markdown, templateId))).toJSON();
  return { formatVersion: 1, projectId: 'test-project', revision: 0, doc, markdown: toMarkdown(doc), assets: {} };
}
