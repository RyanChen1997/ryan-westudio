import { load } from 'cheerio';
import { toMarkdown, parseMarkdown, semantics } from '../modules/editor/core/markdown.mjs';
// Development regression assertions only. Never called by the editor or a copy operation.
export function inspectExportContract(snapshot, html) {
  const $ = load(html, null, false), errors = [];
  const normalize = value => value.replace(/\s+/g, ' ').trim();
  const text = node => {
    if (node.type === 'decoration') return '';
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'image') return node.attrs.caption || '';
    return (node.text || '') + (node.content || []).map(text).join('');
  };
  const visible = load(html, null, false);
  visible('[data-list-marker], [data-decorative]').remove();
  visible('br').replaceWith('\n');
  if (normalize(visible.root().text()) !== normalize(text(snapshot.doc))) errors.push('内容一致性：发布 HTML 与当前文档文字不同');
  if (toMarkdown(snapshot.doc) !== snapshot.markdown || JSON.stringify(semantics(parseMarkdown(snapshot.markdown))) !== JSON.stringify(semantics(snapshot.doc))) errors.push('内容一致性：Markdown 与编辑状态不同');
  const allowed = new Set(['section', 'div', 'p', 'h1', 'h2', 'h3', 'h4', 'strong', 'em', 'span', 'br', 'img', 'hr', 'pre', 'code', 'a', 'table', 'tbody', 'tr', 'th', 'td']);
  const png = /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/;
  $('*').each((_, el) => {
    if (!allowed.has(el.name)) errors.push(`微信兼容：禁止标签 ${el.name}`);
    for (const [key, value] of Object.entries(el.attribs || {})) {
      if (/^on/i.test(key) || ['class', 'srcdoc'].includes(key)) errors.push(`微信兼容：禁止属性 ${key}`);
      if (key === 'style') {
        const declarations = value.replace(/url\s*\(\s*(["']?)(.*?)\1\s*\)/gi, (_url, _quote, ref) => {
          if (!png.test(ref)) errors.push('图片存在性：装饰背景必须是已验证的内联 PNG');
          return '';
        });
        if (/(?:position\s*:\s*(?:fixed|sticky)|float\s*:|z-index\s*:|filter\s*:|url\s*\()/i.test(declarations)) errors.push('微信兼容：禁止 CSS');
      }
      if (['src', 'data-src'].includes(key) && !png.test(value)) errors.push('图片存在性：必须是已验证的内联 PNG');
      if (key === 'href' && !/^(https?:|mailto:)/i.test(value)) errors.push('微信兼容：不安全链接');
    }
    if (el.name === 'img' && (!el.attribs.src || el.attribs['data-src'] !== el.attribs.src)) errors.push('图片存在性：图片引用缺失或不一致');
  });
  const outer = $.root().children().first().attr('style') || '';
  const fixed = outer.match(/background-color:#([\da-f]{6})(?:;|$)/i)?.[1];
  if (fixed && fixed.match(/../g).every(value => parseInt(value, 16) >= 200)) errors.push('微信兼容：浅色页面背景缺少夜间变量');
  return { revision: snapshot.revision, passed: errors.length === 0, gates: { content: !errors.some(e => e.startsWith('内容')), wechat: !errors.some(e => e.startsWith('微信')), images: !errors.some(e => e.startsWith('图片')) }, errors };
}
