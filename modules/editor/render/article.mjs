import { getTemplate } from '../../templates/registry.mjs';
import { visualCSS } from './visual-style.mjs';
import { importedMarks, importedOuterCSS, presentation, resolveTree } from './paiban-design.mjs';
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function getPageMargin(doc) {
  return doc.attrs.pageMargin ?? getTemplate(doc.attrs.templateId).layout.pageMargin;
}
const element = (tag, style, body, extra = '') => `<${tag} style="${escapeHTML(style)}"${extra}>${body}</${tag}>`;
function renderText(node, t) {
  if (node.type === 'hardBreak') return '<br/>';
  let html = escapeHTML(node.text).replace(/\n/g, '<br/>');
  // ProseMirror's first mark is outermost; wrap from the inside out.
  for (const mark of [...(node.marks || [])].reverse()) {
    if (mark.type === 'bold') html = element('strong', t.bold, html);
    else if (mark.type === 'italic') html = element('em', t.italic, html);
    else if (mark.type === 'code') html = element('code', t.code, html);
    else if (mark.type === 'visual') html = element('span', visualCSS(mark.attrs), html);
    else if (mark.type === 'link') {
      const href = mark.attrs.href;
      if (!/^(https?:|mailto:)/i.test(href)) throw new Error('不安全的链接协议');
      html = element('a', t.link, html, ` href="${escapeHTML(href)}"`);
    } else throw new Error(`无法导出的标记: ${mark.type}`);
  }
  return html;
}
export function renderArticle(doc, resolveImage) {
  const { template, children } = presentation(doc);
  const marks = importedMarks(template);
  function nodeHTML(spec) {
    const render = tree => {
      if (tree === '$children') return spec.inside.map(nodeHTML).join('');
      if (tree === '$text') {
        const nodes = spec.node.content || [];
        return spec.node.type === 'codeBlock' ? escapeHTML(nodes.map(n => n.text).join('')) : nodes.map(n => renderText(n, marks)).join('') || '<br/>';
      }
      if (typeof tree === 'string') return escapeHTML(tree);
      const [tag, style, children, attrs] = tree;
      const attributes = Object.entries(attrs).map(([key, value]) => ` ${key}="${escapeHTML(value)}"`).join('');
      if (tag === 'img' || tag === 'br') return `<${tag} style="${escapeHTML(style)}"${attributes}/>`;
      return element(tag, style, children.map(render).join(''), attributes);
    };
    return render(resolveTree(spec.tree, spec, resolveImage));
  }
  return element('section', importedOuterCSS(doc, template), children.map(nodeHTML).join(''));
}
export function editorCSS(doc) {
  const template = getTemplate(doc.attrs.templateId);
  const base = `.tiptap{min-height:0;outline:none;}.tiptap :is(p,h1,h2,h3,h4,blockquote,ul,ol,li,pre,code,span,strong,em,a,th,td){font-family:inherit;font-size:inherit;color:inherit;line-height:inherit;}.tiptap [contenteditable="false"]{white-space:inherit}.tiptap .ProseMirror-selectednode{outline:2px solid #3278c7}`;
  const inlineSelectors = { bold: 'strong', italic: 'em', code: ':not(pre) > code', link: 'a' };
  const marks = importedMarks(template);
  const rules = Object.entries(inlineSelectors).map(([key, selector]) => `.tiptap ${selector}{${marks[key] || ''}}`).join('');
  return base + `.studio .tiptap{${importedOuterCSS(doc, template)}}.studio .tiptap *{box-sizing:revert}` + rules;
}
