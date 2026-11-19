import MarkdownIt from 'markdown-it';
import tableRule from 'markdown-it/lib/rules_block/table.mjs';
import { MarkdownSerializer, MarkdownSerializerState, defaultMarkdownSerializer as defaults } from 'prosemirror-markdown';
import { DEFAULT_TEMPLATE_ID } from '../../templates/registry.mjs';
import { schema } from './schema.mjs';
const parser = new MarkdownIt({ html: false, breaks: false });
// markdown-it pads short rows, but would silently discard extra cells. Reject those rows.
parser.block.ruler.at('table', (state, start, end, silent) => {
  const begin = state.tokens.length;
  if (!tableRule(state, start, end, silent)) return false;
  if (!silent) {
    const width = line => {
      const text = state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]).trim();
      let count = 1;
      for (let i = 0; i < text.length; i++) if (text[i] === '|' && text[i - 1] !== '\\') count++;
      return count - Number(text.startsWith('|')) - Number(text.endsWith('|') && text.at(-2) !== '\\');
    };
    const columns = width(start);
    for (const token of state.tokens.slice(begin)) if (token.type === 'tr_open' && width(token.map[0]) > columns) throw new Error('表格数据行的列数超过表头');
  }
  return true;
}, { alt: ['paragraph', 'reference'] });
// Parse wiki images only in prose; preprocessing the whole source also rewrites code.
parser.inline.ruler.before('image', 'wiki_image', (state, silent) => {
  const match = state.src.slice(state.pos).match(/^!\[\[([^\]\n]+)\]\]/);
  if (!match) return false;
  const [rawSrc, ...parts] = match[1].split('|');
  const src = rawSrc.trim(), caption = parts.join('|').trim();
  if (!src) return false;
  if (!silent) {
    const token = state.push('image', 'img', 0);
    token.attrs = [['src', parser.normalizeLink(src)], ['title', caption]];
    token.content = caption;
    token.children = [];
  }
  state.pos += match[0].length;
  return true;
});
parser.block.ruler.before('fence', 'semantic_card', (state, start, end, silent) => {
  const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]);
  if (line !== ':::card') return false;
  let close = start + 1, depth = 1, fence = null;
  for (; close < end; close++) {
    const text = state.src.slice(state.bMarks[close] + state.tShift[close], state.eMarks[close]);
    const marker = text.match(/^(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    if (text === ':::card') depth++;
    if (text === ':::' && --depth === 0) break;
  }
  if (close === end) throw new Error('卡片缺少 ::: 结束标记');
  if (!silent) {
    state.push('card_open', 'section', 1);
    const inner = state.getLines(start + 1, close, state.blkIndent, false);
    const innerTokens = parser.parse(inner, state.env);
    for (const token of innerTokens) if (token.type === 'inline') token.children = [];
    state.tokens.push(...innerTokens);
    state.push('card_close', 'section', -1);
    state.line = close + 1;
  }
  return true;
}, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });

export function imageAlt(token) {
  if (!token.children?.length) return token.content || '';
  return token.children.map(child => child.type === 'image' ? imageAlt(child) :
    ['softbreak', 'hardbreak'].includes(child.type) ? '\n' : child.nesting === 0 ? child.content : '').join('');
}
function attributeText(value) {
  // Keep previously valid Markdown byte-stable; protect only entities that would decode.
  const entities = value.replace(/&(?:#x[\da-f]+|#\d+|[a-z][\da-z]*);/gi, entity =>
    parser.utils.unescapeAll(entity) === entity ? entity : '&amp;' + entity.slice(1));
  return entities.replace(/["\\\x00-\x1f]/g, char => char === '"' || char === '\\' ? '\\' + char : `&#${char.charCodeAt(0)};`);
}
function inline(tokens) {
  const result = [], marks = [];
  for (const token of tokens || []) {
    if (token.type.endsWith('_open')) {
      const type = { strong_open: 'bold', em_open: 'italic', link_open: 'link' }[token.type];
      if (!type) throw new Error(`不支持行内语法: ${token.type}`);
      marks.push(type === 'link' ? { type, attrs: { href: token.attrGet('href'), target: null } } : { type });
    } else if (token.type.endsWith('_close')) marks.pop();
    else if (token.type === 'image') {
      result.push({ type: 'image', attrs: { src: token.attrGet('src'), alt: imageAlt(token), caption: token.attrGet('title') || '' } });
    } else if (token.type === 'hardbreak') result.push({ type: 'hardBreak' });
    else {
      const text = token.type === 'softbreak' ? '\n' : token.content;
      if (!text) continue;
      const nodeMarks = [...marks, ...(token.type === 'code_inline' ? [{ type: 'code' }] : [])];
      result.push({ type: 'text', text, ...(nodeMarks.length ? { marks: nodeMarks } : {}) });
    }
  }
  return result;
}

// Shared lexical input, also used before constructing the editor schema for source fidelity.
export function markdownInput(markdown) {
  let source = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const front = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  function metadata(key) {
    const value = front?.[1].match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'))?.[1].trim() ?? '';
    const text = value.startsWith('"') ? JSON.parse(value) : value.replace(/^'(.*)'$/, '$1').replace(/''/g, "'");
    if (typeof text !== 'string' || text.includes('\0') || !text.isWellFormed()) throw new Error(`无效的文章元信息：${key}`);
    return text;
  }
  if (front) source = source.slice(front[0].length);
  return { title: metadata('title'), publishTitle: metadata('publish-title'), digest: metadata('digest'), tokens: parser.parse(source, {}) };
}

export function parseMarkdown(markdown, templateId = DEFAULT_TEMPLATE_ID) {
  const { title, publishTitle, digest, tokens } = markdownInput(markdown);
  const doc = { type: 'doc', attrs: { title: publishTitle || title, ...(digest && { digest }), templateId }, content: [] };
  const stack = [doc];
  const add = node => stack.at(-1).content.push(node);
  for (const token of tokens) {
    if (['thead_open', 'thead_close', 'tbody_open', 'tbody_close'].includes(token.type)) continue;
    const block = { paragraph_open: 'paragraph', heading_open: 'heading', blockquote_open: 'blockquote', bullet_list_open: 'bulletList', ordered_list_open: 'orderedList', list_item_open: 'listItem', card_open: 'card', table_open: 'table', tr_open: 'tableRow', th_open: 'tableHeader', td_open: 'tableCell' }[token.type];
    if (block) {
      const node = { type: block, content: [] };
      if (block === 'heading') {
        const level = Number(token.tag.slice(1));
        if (level > 4) throw new Error('只支持 H1–H4，请先明确更深层标题的处理方式');
        node.attrs = { level };
      }
      if (block === 'orderedList') node.attrs = { start: Number(token.attrGet('start') || 1) };
      if (block === 'tableHeader' || block === 'tableCell') node.attrs = { align: token.attrGet('style')?.split(':')[1] ?? null };
      add(node); stack.push(node);
    } else if (token.nesting === -1) {
      const closed = stack.pop();
      if (['card', 'blockquote'].includes(closed.type) && !closed.content.length) closed.content.push({ type: 'paragraph' });
      // Images remain block nodes; listItem still needs its required leading paragraph.
      if (closed.type === 'listItem' && closed.content[0]?.type !== 'paragraph') closed.content.unshift({ type: 'paragraph' });
    }
    else if (token.type === 'inline') {
      const children = inline(token.children);
      const current = stack.at(-1);
      if (children.some(n => n.type === 'image')) {
        if (current.type !== 'paragraph') throw new Error('图片需位于段落中');
        const parent = stack.at(-2);
        parent.content.pop();
        let paragraph = { type: 'paragraph', content: [] };
        for (const node of children) {
          if (node.type === 'image') {
            if (paragraph.content.length) parent.content.push(paragraph);
            parent.content.push(node); paragraph = { type: 'paragraph', content: [] };
          } else paragraph.content.push(node);
        }
        if (paragraph.content.length) parent.content.push(paragraph);
      } else current.content.push(...children);
    } else if (token.type === 'fence' || token.type === 'code_block') {
      add({ type: 'codeBlock', attrs: { language: token.info.trim() || null }, content: token.content ? [{ type: 'text', text: token.content.replace(/\n$/, '') }] : [] });
    } else if (token.type === 'hr') add({ type: 'horizontalRule' });
    else throw new Error(`不支持 Markdown 语法: ${token.type}`);
  }
  if (!doc.content.length) doc.content.push({ type: 'paragraph' });
  return doc;
}
const serializer = new MarkdownSerializer({
  paragraph: defaults.nodes.paragraph, heading: defaults.nodes.heading,
  blockquote: defaults.nodes.blockquote, horizontalRule: defaults.nodes.horizontal_rule,
  hardBreak: defaults.nodes.hard_break, text: defaults.nodes.text,
  listItem: defaults.nodes.list_item,
  bulletList(state, node) { state.renderList(node, '  ', () => '- '); },
  orderedList(state, node) {
    const start = node.attrs.start ?? 1, width = String(start + node.childCount - 1).length;
    state.renderList(node, ' '.repeat(width + 2), i => String(start + i).padStart(width) + '. ');
  },
  codeBlock(state, node) {
    const fence = '\x60'.repeat(Math.max(2, ...(node.textContent.match(/\x60+/g) || []).map(s => s.length)) + 1);
    state.write(fence + (node.attrs.language || '') + '\n'); state.text(node.textContent, false);
    state.write('\n' + fence); state.closeBlock(node);
  },
  image(state, node) {
    const alt = state.esc(node.attrs.alt || '').replace(/[\r\n\t]/g, char => `&#${char.charCodeAt(0)};`);
    const caption = node.attrs.caption ? ' "' + attributeText(node.attrs.caption) + '"' : '';
    state.write('![' + alt + '](<' + node.attrs.src + '>' + caption + ')'); state.closeBlock(node);
  },
  card(state, node) { state.write(':::card\n'); state.renderContent(node); state.ensureNewLine(); state.write(':::'); state.closeBlock(node); },
  table(state, node) {
    const writeRow = cells => { state.write('| ' + cells.join(' | ') + ' |'); state.ensureNewLine(); };
    node.forEach((row, _rowOffset, index) => {
      const cells = [], alignment = [];
      row.forEach(cell => {
        const inline = new MarkdownSerializerState(state.nodes, state.marks, state.options);
        inline.renderInline(cell, false);
        cells.push(inline.out.replace(/\|/g, '\\|').replace(/^\s+|\s+$/g, spaces => Array.from(spaces, char => `&#${char.charCodeAt(0)};`).join('')));
        alignment.push({ left: ':---', center: ':---:', right: '---:' }[cell.attrs.align] || '---');
      });
      writeRow(cells);
      if (index === 0) writeRow(alignment);
    });
    state.closeBlock(node);
  },
}, { bold: defaults.marks.strong, italic: defaults.marks.em, code: defaults.marks.code, link: defaults.marks.link }, { hardBreakNodeName: 'hardBreak', escapeExtraCharacters: /[&:]/g });
export function toMarkdown(doc) {
  const content = schema().nodeFromJSON(semantics(doc, { stripWhitespaceMarks: false }));
  const digest = doc.attrs?.digest ? `\ndigest: ${JSON.stringify(doc.attrs.digest)}` : '';
  return '---\ntitle: ' + JSON.stringify(doc.attrs?.title || '') + digest + '\n---\n\n' + serializer.serialize(content, { tightLists: true }) + '\n';
}
// Pure visual attributes, IDs and decorations never participate in semantic equality.
export function semantics(doc, { stripWhitespaceMarks = true } = {}) {
  const clean = node => {
    if (node.type === 'decoration' || (node.type === 'paragraph' && !node.content?.length)) return null;
    const result = { type: node.type };
    for (const key of ['text']) if (node[key] !== undefined) result[key] = node[key];
    const attrs = {};
    for (const key of ['level', 'start', 'language', 'src', 'alt', 'caption', 'title', 'digest', 'align']) if (node.attrs?.[key] != null && node.attrs[key] !== '') attrs[key] = node.attrs[key];
    if (Object.keys(attrs).length) result.attrs = attrs;
    const marks = (node.marks || []).filter(m => m.type !== 'visual').map(m => m.type === 'link' ? { type: m.type, attrs: { href: m.attrs.href } } : { type: m.type }).sort((a,b) => a.type.localeCompare(b.type));
    if (marks.length) result.marks = marks;
    const content = [];
    const children = (node.content || []).flatMap(child => child.type === 'designPanel' ? child.content || [] : [child]);
    for (const child of children.map(clean).filter(Boolean)) {
      const pieces = stripWhitespaceMarks && child.type === 'text' && child.marks?.some(m => ['bold', 'italic'].includes(m.type))
        ? child.text.split(/(\s+)/).filter(Boolean).map(text => {
          const marks = /^\s+$/.test(text) ? child.marks.filter(m => !['bold', 'italic'].includes(m.type)) : child.marks;
          return { type: 'text', text, ...(marks.length ? { marks } : {}) };
        }) : [child];
      for (const piece of pieces) {
        const last = content.at(-1);
        if (piece.type === 'text' && last?.type === 'text' && JSON.stringify(piece.marks) === JSON.stringify(last.marks)) last.text += piece.text;
        else content.push(piece);
      }
    }
    while (content.at(-1)?.type === 'hardBreak') content.pop();
    if (node.type === 'paragraph' && !content.length) return null;
    if (content.length) result.content = content;
    return result;
  };
  return clean(doc);
}
