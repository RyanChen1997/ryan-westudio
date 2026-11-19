import { Extension, Node, Mark, mergeAttributes, getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Plugin } from '@tiptap/pm/state';
import { DesignPanel, TemplateLayout, importedNodeView } from './template-layout.mjs';
import { tableExtensions, tableNames } from './table.mjs';
import { DEFAULT_TEMPLATE_ID } from '../../templates/registry.mjs';
import { visualCSS, decorationImageStyle } from '../render/visual-style.mjs';
export { visualCSS } from '../render/visual-style.mjs';
export const blockTypes = ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'codeBlock', 'horizontalRule', 'image', 'card', 'decoration', ...tableNames];
export const visualKeys = ['fontSize', 'color', 'borderColor', 'borderWidth'];
export const MAX_PAGE_MARGIN = 80;
export function validatePageMargin(value) {
  if (value !== null && (!Number.isInteger(value) || value < 0 || value > MAX_PAGE_MARGIN)) throw new Error(`页边距必须是 0–${MAX_PAGE_MARGIN}px 的整数`);
}
export function validateStyle(style) {
  if (!style || typeof style !== 'object' || Array.isArray(style)) throw new Error('样式必须是对象');
  for (const [key, value] of Object.entries(style)) {
    if (!visualKeys.includes(key)) throw new Error(`不支持样式: ${key}`);
    if (value === null) continue;
    if (['color', 'borderColor'].includes(key)) {
      if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('颜色必须为 #RRGGBB');
    } else if (!Number.isFinite(value) || value < (key === 'fontSize' ? 10 : 0) || value > (key === 'fontSize' ? 72 : 12)) throw new Error('字号/边框超出范围');
  }
}
const IdentityAndDesign = Extension.create({
  name: 'identityAndDesign',
  addGlobalAttributes() {
    return [{ types: blockTypes, attributes: {
      id: { default: null, parseHTML: el => el.getAttribute('data-node-id'), renderHTML: attrs => attrs.id ? { 'data-node-id': attrs.id } : {} },
      ...Object.fromEntries(visualKeys.map(key => [key, { default: null, rendered: false }])),
      design: { default: null, parseHTML: () => null, renderHTML: attrs => ({ style: visualCSS(attrs) + (Number.isInteger(attrs.start) ? `;counter-reset:article-item ${attrs.start - 1};` : '') }) },
    } }];
  },
  addProseMirrorPlugins() {
    return [new Plugin({ props: { nodeViews: {
      listItem(node) {
        const dom = document.createElement('li'), contentDOM = document.createElement('section');
        contentDOM.dataset.listContent = ''; dom.append(contentDOM);
        const update = current => {
          if (current.type.name !== 'listItem') return false;
          dom.dataset.nodeId = current.attrs.id || ''; dom.style.cssText = visualCSS(current.attrs); return true;
        };
        update(node); return { dom, contentDOM, update };
      },
    } }, appendTransaction: (transactions, _old, state) => {
      if (!transactions.some(tr => tr.docChanged)) return null;
      const seen = new Set(), tr = state.tr;
      state.doc.descendants((node, pos) => {
        if (!blockTypes.includes(node.type.name)) return;
        if (!node.attrs.id || seen.has(node.attrs.id)) tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: crypto.randomUUID() });
        seen.add(tr.doc.nodeAt(pos).attrs.id);
      });
      return tr.docChanged ? tr : null;
    } })];
  },
});
const ArticleDocument = Node.create({
  name: 'doc', topNode: true, content: '(block | designPanel)+',
  addAttributes: () => ({
    title: { default: '' }, digest: { default: '' },
    templateId: { default: DEFAULT_TEMPLATE_ID }, pageMargin: { default: null },
  }),
});
const ArticleImage = Node.create({
  name: 'image', group: 'block', atom: true, draggable: true,
  addAttributes: () => ({ src: { default: '' }, alt: { default: '' }, caption: { default: '' } }),
  parseHTML: () => [{ tag: 'figure[data-article-image]' }],
  renderHTML({ HTMLAttributes }) {
    const { src, alt, caption, ...rest } = HTMLAttributes;
    return ['figure', mergeAttributes(rest, { 'data-article-image': '' }), ['img', { src: src.startsWith('asset:') ? `/assets/${src.slice(6)}` : src, alt }], ['figcaption', {}, caption]];
  },
});
const SemanticCard = Node.create({
  name: 'card', group: 'block', content: 'block+', defining: true, isolating: true,
  parseHTML: () => [{ tag: 'section[data-card]' }],
  renderHTML: ({ HTMLAttributes }) => ['section', mergeAttributes(HTMLAttributes, { 'data-card': '' }), 0],
  addNodeView() {
    return ({ node, editor, getPos, decorations }) => {
      const imported = importedNodeView(node, editor.view, getPos, decorations);
      if (imported) return imported;
      const dom = document.createElement('section'); dom.dataset.card = ''; dom.className = 'semantic-card';
      const contentDOM = document.createElement('article');
      dom.append(contentDOM);
      const update = current => {
        if (current.type.name !== 'card') return false;
        dom.dataset.nodeId = current.attrs.id || ''; dom.style.cssText = visualCSS(current.attrs); return true;
      };
      update(node); return { dom, contentDOM, update };
    };
  },
});
const Decoration = Node.create({
  name: 'decoration', group: 'block', atom: true, selectable: true, draggable: true,
  addAttributes: () => ({ kind: { default: 'butterfly' } }),
  parseHTML: () => [{ tag: 'section[data-decoration]' }],
  renderHTML: ({ HTMLAttributes }) => ['section', mergeAttributes(HTMLAttributes, { 'data-decoration': 'butterfly' }), ['img', { src: '/api/design-assets/butterfly.png', alt: '', style: decorationImageStyle }]],
  addNodeView() {
    return ({ node, editor, getPos, decorations }) => {
      const imported = importedNodeView(node, editor.view, getPos, decorations);
      if (imported) return imported;
      const dom = document.createElement('section'); dom.dataset.decoration = 'butterfly'; dom.dataset.nodeId = node.attrs.id || '';
      dom.contentEditable = 'false'; dom.setAttribute('aria-label', '蝴蝶装饰');
      const image = document.createElement('img'); image.src = '/api/design-assets/butterfly.png'; image.alt = ''; image.style.cssText = decorationImageStyle;
      dom.append(image);
      const update = current => {
        if (current.type.name !== 'decoration') return false;
        dom.dataset.nodeId = current.attrs.id || ''; dom.style.cssText = visualCSS(current.attrs); return true;
      };
      update(node); return { dom, update };
    };
  },
});
const VisualMark = Mark.create({
  name: 'visual',
  addAttributes: () => ({ fontSize: { default: null }, color: { default: null } }),
  parseHTML: () => [{ tag: 'span[data-visual]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', { 'data-visual': '', style: visualCSS(HTMLAttributes) }, 0],
});
export function extensions() {
  return [StarterKit.configure({ document: false, trailingNode: false, heading: { levels: [1, 2, 3, 4] }, strike: false, underline: false, link: { openOnClick: false } }), ArticleDocument, IdentityAndDesign, ArticleImage, SemanticCard, Decoration, VisualMark, ...tableExtensions, DesignPanel, TemplateLayout];
}
export function schema() { return getSchema(extensions()); }
export function assignIds(json) {
  const copy = structuredClone(json), seen = new Set();
  const walk = node => {
    if (blockTypes.includes(node.type)) {
      node.attrs ||= {};
      if (!node.attrs.id || seen.has(node.attrs.id)) node.attrs.id = crypto.randomUUID();
      seen.add(node.attrs.id);
    }
    node.content?.forEach(walk);
  };
  walk(copy); return copy;
}
