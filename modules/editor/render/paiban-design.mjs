import { getTemplate } from '../../templates/registry.mjs';
import { arrangePanels } from './panels.mjs';
import { codeBlockInnerStyle, decorationImageStyle, joinCSS, visualCSS } from './visual-style.mjs';
import { cellAlignment, tableStyles } from '../core/table.mjs';

// A slot tree contains only renderer-owned elements, declared CSS, and named slots.
// Neither the template nor user content supplies executable HTML or selects the writing path.
const element = (tag, css, children = [], attrs = {}) => [tag, css, children, attrs];
// Shared styles for semantic elements not available in the source template protocol.
const fallbackTokens = {
  code: 'font-family:monospace;background-color:var(--weui-BG-3,#f0f2f4);padding:2px 4px;',
  codeBlock: 'font-family:monospace;white-space:pre-wrap;background-color:var(--weui-BG-3,#f0f2f4);padding:16px;margin:20px 0;line-height:1.7;',
  caption: 'font-size:13px;color:#777777;text-align:center;margin:8px 0 20px;',
  link: 'color:#325d7a;text-decoration:underline;',
};
const isTextSlot = node => typeof node !== 'string' && node[2].includes('$text');
const mapTree = (tree, fn) => typeof tree === 'string' ? tree : fn([tree[0], tree[1], tree[2].map(child => mapTree(child, fn)), tree[3]]);
const swapSlot = (tree, name, replacement) => typeof tree === 'string' ? tree === name ? replacement : tree : [tree[0], tree[1], tree[2].map(child => swapSlot(child, name, replacement)), tree[3]];
const listTypes = { bulletList: 'list', orderedList: 'steps' };
const romanDigits = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
function romanNumeral(number) {
  if (!Number.isInteger(number) || number < 1 || number > 3999) return String(number);
  let result = '';
  for (const [value, digit] of romanDigits) {
    result += digit.repeat(Math.floor(number / value));
    number %= value;
  }
  return result;
}
const renderAssetRef = (id, role) => `template:${id}:${role}`;
export const liveImage = ref => {
  if (ref === 'builtin:butterfly') return '/api/design-assets/butterfly.png';
  if (ref.startsWith('asset:')) return `/assets/${ref.slice(6)}`;
  if (ref.startsWith('template:')) {
    const [, id, role] = ref.split(':');
    return `/api/design-assets/${id}/${role}.png`;
  }
  return ref;
};

export function importedOuterCSS(doc, template) {
  const margin = doc.attrs.pageMargin ?? template.layout.pageMargin;
  return joinCSS(template.tokens.outer, `padding-left:${margin}px;padding-right:${margin}px;white-space:normal;tab-size:8`);
}

export function importedMarks(template) {
  const { strong, em, link, code } = template.tokens.inline;
  return { bold: strong, italic: em, link: link ?? fallbackTokens.link, code: code ?? fallbackTokens.code };
}

export function presentation(input, { arrange = true } = {}) {
  const template = getTemplate(input.attrs.templateId);
  const t = template.tokens;
  const blocks = t.blocks ?? {};
  const doc = arrange ? arrangePanels(input, template.layout) : input;
  const counts = new Map();
  function sequence(items, context, { end = true, wrapper = null, list = null } = {}) {
    return items.map((node, index) => plan(node, context, end && index === items.length - 1, wrapper, list && { ...list, index }));
  }
  function plan(node, context, last, wrapper, list) {
    const { type, attrs: a = {}, content: children = [] } = node;
    const role = t.roles[context] ?? t.roles.card;
    let tree, inside = [], number = 0, itemNumber = 0;
    if (type === 'designPanel') {
      const frames = template.layout.panel?.frames ?? [['section', '']];
      tree = frames.reduceRight((inner, [tag, css]) => element(tag, css, [inner]), '$children');
      inside = sequence(children, context, { end: last });
    } else if (type === 'heading') {
      if (t.numbered.includes(a.level)) { number = (counts.get(a.level) || 0) + 1; counts.set(a.level, number); }
      const key = `h${a.level}`, cycle = role[`${key}Cycle`];
      const [tag, css, parts, attrs] = cycle ? cycle[(number - 1) % cycle.length] : role[key];
      tree = element(tag, css, parts, { ...attrs, role: 'heading', 'aria-level': a.level });
      if (a.fontSize || a.color) tree = mapTree(tree, item => isTextSlot(item) ? element(item[0], joinCSS(item[1], visualCSS({ fontSize: a.fontSize, color: a.color })), item[2], item[3]) : item);
    } else if (type === 'paragraph') {
      tree = list?.first ? element('span', 'display:inline;', ['$text']) : role[last ? 'paragraphLast' : 'paragraph'];
    } else if (type === 'blockquote' || type === 'card') {
      const kind = type === 'blockquote' ? 'quote' : 'card';
      const childContext = kind === 'card' && (context === 'quote' || context === 'quotedCard') ? 'quotedCard' : kind;
      const [outer, perChild] = t.containers[kind];
      tree = outer;
      inside = sequence(children, childContext, { wrapper: perChild });
    } else if (listTypes[type]) {
      tree = role[listTypes[type]];
      inside = sequence(children, context, { list: { type: listTypes[type], start: a.start ?? 1 } });
    } else if (type === 'listItem') {
      itemNumber = list.start + list.index;
      tree = mapTree(role[`${list.type}Item${last ? 'Last' : ''}`], item => isTextSlot(item)
        ? element('section', item[1], ['$children'], { ...item[3], 'data-list-content': '' }) : item);
      inside = children.map((child, index) => plan(child, context, index === children.length - 1, null, { first: index === 0 }));
    } else if (type === 'image') {
      // The source image has no figure. Add a neutral wrapper only for optional caption and selection.
      tree = a.caption ? element('section', '', [role.image, element('p', joinCSS(fallbackTokens.caption, blocks.caption), ['$caption'])]) : role.image;
    } else if (type === 'horizontalRule') tree = role.divider;
    else if (type === 'codeBlock') tree = element('pre', joinCSS(fallbackTokens.codeBlock, blocks.codeBlock), [element('code', joinCSS(codeBlockInnerStyle, blocks.codeBlockInner), ['$text'])]);
    else if (type === 'decoration') tree = element('section', 'text-align:center;margin:20px 0;', [element('img', decorationImageStyle, [], { src: 'builtin:butterfly', 'aria-hidden': 'true' })], { 'data-decorative': 'true' });
    else if (type === 'table') { tree = element('table', joinCSS(tableStyles.table, blocks.table), [element('tbody', '', ['$children'])]); inside = sequence(children, context); }
    else if (type === 'tableRow') { tree = element('tr', '', ['$children']); inside = sequence(children, context); }
    else if (type === 'tableCell' || type === 'tableHeader') {
      const header = type === 'tableHeader';
      tree = element(header ? 'th' : 'td', joinCSS(tableStyles.cell, blocks.tableCell, header && (blocks.tableHeader ?? tableStyles.header), cellAlignment(a.align)), ['$text'], header ? { scope: 'col' } : {});
    } else throw new Error(`无迁入模板样式的节点: ${type}`);
    const [tag, css, parts, attributes] = tree;
    tree = element(tag, joinCSS(css, visualCSS(a)), parts, attributes);
    if (wrapper) tree = swapSlot(wrapper, '$children', tree);
    return { node, tree, inside, number, itemNumber, templateId: template.id };
  }
  // The parent's last index is significant; partitioning into panels does not reset it.
  return { template, doc, children: sequence(doc.content || [], 'main') };
}

export function resolveTree(tree, spec, resolveImage) {
  if (typeof tree === 'string') {
    if (tree === '$itemNumber') return String(spec.itemNumber);
    if (tree === '$itemRoman') return romanNumeral(spec.itemNumber);
    if (tree.startsWith('$chapterNumber:')) return String(spec.number).padStart(Number(tree.split(':')[1]), '0');
    if (tree === '$caption') return spec.node.attrs.caption;
    return tree;
  }
  const [tag, rawStyle, children, attributes] = tree;
  const ref = role => resolveImage(renderAssetRef(spec.templateId, role));
  const style = rawStyle.replace(/@asset:([a-zA-Z\d]+)/g, (_value, role) => ref(role));
  const attrs = { ...attributes };
  if (tag === 'img') {
    const role = attrs.src;
    attrs.alt = role === '$image' ? spec.node.attrs.alt || '' : '';
    attrs.src = role === '$image' ? resolveImage(spec.node.attrs.src) : role.startsWith('@asset:') ? ref(role.slice(7)) : resolveImage(role);
    attrs['data-src'] = attrs.src;
  }
  return element(tag, style, children.map(child => resolveTree(child, spec, resolveImage)), attrs);
}