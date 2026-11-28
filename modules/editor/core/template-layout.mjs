import { Extension, Node } from '@tiptap/core';
import { NodeRange } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { getTemplate } from '../../templates/registry.mjs';
import { panelRanges } from '../render/panels.mjs';
import { liveImage, presentation, resolveTree } from '../render/paiban-design.mjs';

export const DesignPanel = Node.create({
  name: 'designPanel', content: 'block+', selectable: false,
  // A saved layout panel is transparent to clipboard parsing and has no editor-facing identity.
  renderHTML: () => ['section', 0],
});

function reconcilePanels(state) {
  const layout = getTemplate(state.doc.attrs.templateId).layout;
  const blocks = [], ranges = [], original = [];
  const add = node => blocks.push({ type: node.type.name, attrs: node.attrs });
  state.doc.forEach((node, pos) => {
    if (node.type.name !== 'designPanel') { add(node); return; }
    const start = blocks.length;
    node.forEach(add);
    ranges.push([start, blocks.length]);
    original.push({ pos, size: node.nodeSize });
  });
  const desired = panelRanges(blocks, layout);
  if (ranges.length === desired.length && ranges.every(([from, to], i) => desired[i][0] === from && desired[i][1] === to)) return null;
  const tr = state.tr;
  // ReplaceAround steps preserve live text selections, mapped anchors and history.
  for (const { pos, size } of original.reverse()) {
    tr.lift(new NodeRange(tr.doc.resolve(pos + 1), tr.doc.resolve(pos + size - 1), 1), 0);
  }
  const positions = [];
  tr.doc.forEach((_node, pos) => positions.push(pos));
  positions.push(tr.doc.content.size);
  for (const [from, to] of desired.reverse()) {
    tr.wrap(new NodeRange(tr.doc.resolve(positions[from]), tr.doc.resolve(positions[to]), 0), [{ type: state.schema.nodes.designPanel }]);
  }
  return tr;
}

const layoutKey = new PluginKey('articleTemplatePresentation');
function decorations(doc) {
  const design = presentation(doc.toJSON(), { arrange: false });
  const descriptors = [];
  function children(container, start, plans) {
    container.forEach((node, offset, index) => {
      const current = plans[index], pos = start + offset;
      descriptors.push(Decoration.node(pos, pos + node.nodeSize, {}, { articlePresentation: current }));
      if (current.inside.length) children(node, pos + 1, current.inside);
    });
  }
  children(doc, 0, design.children);
  return DecorationSet.create(doc, descriptors);
}

export const TemplateLayout = Extension.create({
  name: 'templateLayout',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: layoutKey,
      state: { init: (_config, state) => decorations(state.doc), apply: (tr, previous) => tr.docChanged ? decorations(tr.doc) : previous },
      props: { decorations: state => layoutKey.getState(state) },
      appendTransaction: (transactions, _old, state) => transactions.some(tr => tr.docChanged) ? reconcilePanels(state) : null,
    })];
  },
});

function importedNodeView(node, _view, _getPos, descriptors) {
  const design = descriptors.find(d => d.spec.articlePresentation)?.spec.articlePresentation;
  if (!design) return undefined;
  const tree = resolveTree(design.tree, design, liveImage);
  let contentDOM;
  const mount = data => {
    if (typeof data === 'string') return document.createTextNode(data);
    const [tag, style, children, attrs] = data;
    const el = document.createElement(tag);
    if (style) el.setAttribute('style', style);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    for (const child of children) {
      if (child === '$text' || child === '$children') contentDOM = el;
      else {
        const member = mount(child);
        if (member instanceof HTMLElement) member.contentEditable = 'false';
        el.append(member);
      }
    }
    return el;
  };
  const dom = mount(tree);
  // Heading mark styles target only the editable text hole, never sibling ornaments.
  if (node.type.name === 'heading' && contentDOM) contentDOM.dataset.headingContent = '';
  // Only sibling ornaments are noneditable. Ancestors of the content hole must inherit editability.
  for (let ancestor = contentDOM; ancestor && ancestor !== dom; ancestor = ancestor.parentElement) ancestor.removeAttribute('contenteditable');
  if (node.attrs.id) dom.dataset.nodeId = node.attrs.id;
  dom.dataset.articleNode = node.type.name;
  const signature = JSON.stringify(tree);
  return {
    dom, contentDOM,
    update(current, nextDescriptors) {
      if (current.type !== node.type || current.attrs.id !== node.attrs.id) return false;
      const next = nextDescriptors.find(d => d.spec.articlePresentation)?.spec.articlePresentation;
      return !!next && signature === JSON.stringify(resolveTree(next.tree, next, liveImage));
    },
    ignoreMutation(record) { return record.type !== 'selection' && (!contentDOM || !contentDOM.contains(record.target)); },
  };
}

const importedNodeViews = Object.fromEntries([
  'designPanel', 'paragraph', 'heading', 'blockquote', 'card', 'orderedList', 'bulletList', 'listItem',
  'image', 'horizontalRule', 'codeBlock', 'table', 'tableRow', 'tableHeader', 'tableCell', 'decoration',
].map(name => [name, importedNodeView]));

// Direct view plugins survive React EditorContent's createNodeViews() remount.
export const importedViewsPlugin = new Plugin({ props: { nodeViews: importedNodeViews } });
export { importedNodeView };