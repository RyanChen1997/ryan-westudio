import { createHash } from 'node:crypto';
import { markdownInput, imageAlt } from './markdown.mjs';

export const sourceHash = text => createHash('sha256').update(text).digest('hex');
const normalize = text => text.replace(/\s+/g, ' ').trim();

function projection(markdown) {
  const { title, tokens } = markdownInput(markdown);
  const blocks = [], code = [], images = [], links = [], openLinks = [];
  let offset = 0;
  const append = text => { blocks.push(text); offset += text.length + 1; };
  for (const token of tokens) {
    if (token.type === 'inline') {
      let text = '';
      for (const child of token.children || []) {
        if (child.type === 'image') {
          const alt = imageAlt(child), caption = child.attrGet('title') || '';
          images.push({ alt, caption }); text += caption;
        } else if (child.type === 'link_open') {
          const link = { href: child.attrGet('href'), start: offset + text.length, end: offset + text.length };
          links.push(link); openLinks.push(link);
        } else if (child.type === 'link_close') {
          const link = openLinks.pop(); if (link) link.end = offset + text.length;
        } else if (child.type === 'softbreak' || child.type === 'hardbreak') text += ' ';
        else if (child.nesting === 0) {
          text += child.content;
          if (child.type === 'code_inline') code.push({ type: 'inline', text: child.content });
        }
      }
      append(text);
    } else if (token.type === 'fence' || token.type === 'code_block') {
      code.push({ type: 'block', text: token.content }); append(token.content);
    }
  }
  const raw = blocks.join('\n'), text = normalize(raw);
  const position = index => Math.min(text.length, raw.slice(0, index).replace(/\s+/g, ' ').trimStart().length);
  return { title, text, firstBlock: normalize(blocks[0] || ''),
    titleCandidate: ['heading_open', 'paragraph_open'].includes(tokens[0]?.type), code, images,
    links: links.map(link => ({ href: link.href, text: normalize(raw.slice(link.start, link.end)), start: position(link.start), end: position(link.end) })) };
}

function firstDifference(original, structured) {
  const a = Array.from(original), b = Array.from(structured);
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) index++;
  return {
    character: index + 1,
    original: a.slice(Math.max(0, index - 24), index + 48).join(''),
    structured: b.slice(Math.max(0, index - 24), index + 48).join(''),
  };
}

/** Initial AI structuring only. Never rerun this against user edits in an active editor. */
export function validateSourceMarkdown(originalMarkdown, structuredMarkdown) {
  const original = projection(originalMarkdown), structured = projection(structuredMarkdown);
  const errors = [];
  let actual = structured.text, titleOffset = 0;
  let titleHandling = original.title ? 'existing-metadata' : structured.title ? 'new-metadata' : 'unchanged';
  if (original.title && original.title !== structured.title) errors.push('原文章标题被修改或遗漏');
  // Moving the first complete title to frontmatter is allowed, but its words are still compared.
  // Never strip all heading text: that would conceal edits disguised as headings.
  if (actual !== original.text && original.titleCandidate && structured.title && original.firstBlock === normalize(structured.title)) {
    const withTitle = normalize(`${structured.title}\n${actual}`);
    if (withTitle === original.text) {
      actual = withTitle; titleHandling = 'first-title-to-metadata';
      titleOffset = normalize(structured.title).length + (structured.text ? 1 : 0);
    }
  }
  let difference = null;
  if (actual !== original.text) {
    difference = firstDifference(original.text, actual);
    errors.push(`正文文字不一致，第 ${difference.character} 字符附近：原文 ${JSON.stringify(difference.original)}；结构稿 ${JSON.stringify(difference.structured)}`);
  }
  let codeIndex = 0;
  for (const code of original.code) {
    const found = structured.code.findIndex((candidate, index) => index >= codeIndex && candidate.type === code.type && candidate.text === code.text);
    if (found < 0) { errors.push('原有代码未被逐字保留（包括代码空白）'); break; }
    codeIndex = found + 1;
  }
  if (JSON.stringify(original.images) !== JSON.stringify(structured.images)) errors.push('图片替代文字或图注发生变化');
  const actualLinks = structured.links.map(link => ({ ...link, start: link.start + titleOffset, end: link.end + titleOffset }));
  if (JSON.stringify(original.links) !== JSON.stringify(actualLinks)) errors.push('正文链接地址或对应文字范围发生变化');
  return {
    policyVersion: 2, stage: 'initial-structuring', initialRevision: 0, passed: errors.length === 0,
    sourceHash: sourceHash(originalMarkdown), structuredHash: sourceHash(structuredMarkdown),
    titleHandling, difference, errors,
    policy: '保留正文顺序、标点、数字及大小写；仅归一排版空白和格式；代码逐字比较；不豁免新增或改写的小标题。',
  };
}

export function assertSourceMarkdown(originalMarkdown, structuredMarkdown) {
  const report = validateSourceMarkdown(originalMarkdown, structuredMarkdown);
  if (!report.passed) throw Object.assign(new Error(`原文文字一致性校验未通过：\n${report.errors.join('\n')}`), { status: 422, sourceValidation: report });
  return report;
}
