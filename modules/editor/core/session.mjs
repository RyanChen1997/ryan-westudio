import { Editor } from '@tiptap/core';
import { TextSelection, NodeSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { extensions, assignIds, validateStyle, validatePageMargin, visualKeys } from './schema.mjs';
import { toMarkdown } from './markdown.mjs';
import { getTemplate } from '../../templates/registry.mjs';
import { arrangePanels } from '../render/panels.mjs';
import { importedViewsPlugin } from './template-layout.mjs';
import { validateTables } from './table.mjs';

export class SessionError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}
function locate(doc, id) {
  let found;
  doc.descendants((node, pos) => { if (node.attrs.id === id) found = { node, pos }; });
  if (!found) throw new SessionError(`节点不存在: ${id}`);
  return found;
}
function range(tr, op) {
  if (!op.nodeId) return { from: tr.selection.from, to: tr.selection.to };
  const { node, pos } = locate(tr.doc, op.nodeId);
  if (!node.isTextblock) throw new SessionError('目标必须是文字块');
  const from = op.from ?? 0, to = op.to ?? node.content.size;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > node.content.size) throw new SessionError('文字范围无效（UTF-16 偏移）');
  return { from: pos + 1 + from, to: pos + 1 + to };
}
function target(tr, op) {
  if (op.nodeId) return locate(tr.doc, op.nodeId);
  if (tr.selection instanceof NodeSelection) return { node: tr.selection.node, pos: tr.selection.from };
  for (let depth = tr.selection.$from.depth; depth > 0; depth--) {
    const node = tr.selection.$from.node(depth);
    if (node.isTextblock) return { node, pos: tr.selection.$from.before(depth) };
  }
  throw new SessionError('请先选择正文节点');
}
const requireString = value => {
  if (typeof value !== 'string') throw new SessionError('需要字符串');
  if (value.includes('\0') || (value.isWellFormed && !value.isWellFormed())) throw new SessionError('文本包含无法表示的字符');
  return value;
};
function inlineText(value) {
  return value.replace(/\r\n?/g, '\n').split('\n').flatMap((line, index) => [
    ...(index ? [{ type: 'hardBreak' }] : []), ...(line ? [{ type: 'text', text: line }] : []),
  ]);
}
const hasImageAsset = (assets, id) => typeof id === 'string' && Object.hasOwn(assets, id);
function blockJSON(op, assets) {
  const text = op.text === undefined ? '' : requireString(op.text);
  const paragraph = { type: 'paragraph', content: inlineText(text) };
  if (op.block === 'paragraph') return paragraph;
  if (op.block === 'card' || op.block === 'quote') return { type: op.block === 'quote' ? 'blockquote' : 'card', content: [paragraph] };
  if (op.block === 'decoration') return { type: 'decoration', attrs: { kind: 'butterfly' } };
  if (op.block === 'horizontalRule') return { type: 'horizontalRule' };
  if (op.block === 'image' && hasImageAsset(assets, op.assetId)) return { type: 'image', attrs: { src: `asset:${op.assetId}`, caption: op.caption === undefined ? '' : requireString(op.caption), alt: op.alt === undefined ? '' : requireString(op.alt) } };
  throw new SessionError('不支持的新块或资源不存在');
}
function focusBlock(tr, pos, node) {
  tr.setSelection(node.isAtom ? NodeSelection.create(tr.doc, pos) : TextSelection.near(tr.doc.resolve(pos + 1)));
  tr.scrollIntoView();
}
export class EditorSession {
  constructor(snapshot, { element, onChange = () => {}, onSelection = () => {} } = {}) {
    this.projectId = snapshot.projectId;
    this.revision = snapshot.revision;
    this.assets = snapshot.assets || {};
    this.markdown = snapshot.markdown;
    this.sourceValidation = snapshot.sourceValidation ?? null;
    const doc = assignIds(arrangePanels(snapshot.doc, getTemplate(snapshot.doc.attrs.templateId).layout));
    this.imageStates = new Map();
    const register = node => {
      if (node.type === 'image') this.imageStates.set(node.attrs.id, { src: node.attrs.src, version: 0, exists: true });
      node.content?.forEach(register);
    };
    register(doc);
    this.editor = new Editor({
      element: element || document.createElement('div'), extensions: extensions(), content: doc,
      editorProps: { attributes: { 'aria-label': '文章正文', role: 'textbox', 'aria-multiline': 'true' } },
      onTransaction: ({ transaction }) => {
        if (!transaction.docChanged) return;
        this.revision++;
        this.trackImages(transaction);
        this.markdown = toMarkdown(this.editor.getJSON());
        onChange(this.snapshot());
      },
      onSelectionUpdate: () => onSelection(this.snapshot()),
    });
    this.editor.view.setProps({ plugins: [importedViewsPlugin] });
    this.markdown = toMarkdown(this.editor.getJSON());
  }
  imageVersion(id) {
    const { node } = locate(this.editor.state.doc, id);
    if (node.type.name !== 'image') throw new SessionError('目标不是图片');
    if (!this.imageStates.has(id)) this.imageStates.set(id, { src: node.attrs.src, version: 0, exists: true });
    return this.imageStates.get(id).version;
  }
  trackImages(transaction) {
    const present = new Set(), writes = new Set(transaction.getMeta('imageWrites') || []);
    this.editor.state.doc.descendants(node => {
      if (node.type.name !== 'image') return;
      const id = node.attrs.id, previous = this.imageStates.get(id);
      present.add(id);
      if (!previous) this.imageStates.set(id, { src: node.attrs.src, version: 0, exists: true });
      else {
        if (!previous.exists || previous.src !== node.attrs.src || writes.has(id)) previous.version++;
        previous.src = node.attrs.src; previous.exists = true;
      }
    });
    for (const [id, state] of this.imageStates) if (state.exists && !present.has(id)) { state.exists = false; state.version++; }
  }
  snapshot() {
    const nodes = [];
    this.editor.state.doc.descendants((node, pos) => {
      if (node.attrs.id) nodes.push({ id: node.attrs.id, type: node.type.name, position: pos, size: node.nodeSize, text: node.textContent, attrs: node.attrs, ...(node.type.name === 'image' ? { imageVersion: this.imageStates.get(node.attrs.id)?.version ?? 0 } : {}) });
    });
    const { from, to, anchor, head } = this.editor.state.selection;
    return { formatVersion: 1, projectId: this.projectId, revision: this.revision, doc: JSON.parse(JSON.stringify(this.editor.getJSON())), markdown: this.markdown, assets: this.assets, sourceValidation: this.sourceValidation, nodes, selection: { from, to, anchor, head } };
  }
  execute({ expectedRevision, operations }) {
    if (!this.editor.isEditable) throw new SessionError('连接已断开，不能继续编辑；请先恢复会话', 409);
    if (expectedRevision !== this.revision) throw new SessionError(`版本冲突：当前 ${this.revision}，请求 ${expectedRevision}`, 409);
    if (!Array.isArray(operations) || !operations.length || operations.length > 100) throw new SessionError('operations 需要 1–100 项');
    if (operations.some(op => ['undo', 'redo'].includes(op?.type))) {
      if (operations.length !== 1) throw new SessionError('撤销/重做必须单独提交');
      const changed = this.editor.commands[operations[0].type]();
      if (!changed) throw new SessionError('没有可撤销/重做的操作');
      return this.snapshot();
    }
    // Build one unpublished transaction. Any validation/command failure throws before dispatch.
    const chain = this.editor.chain();
    chain.command(({ tr }) => { closeHistory(tr); return true; });
    for (const op of operations) {
      if (!op || typeof op !== 'object') throw new SessionError('无效操作');
      chain.command(({ tr, commands, state }) => {
        const selectRange = () => { const r = range(tr, op); tr.setSelection(TextSelection.create(tr.doc, r.from, r.to)); void state.tr; return r; };
        switch (op.type) {
          case 'replaceText': {
            const r = selectRange(), text = requireString(op.text);
            if (/[\r\n]/.test(text)) throw new SessionError('replaceText 仅改行内文字；多行请用 insertBlock');
            tr.insertText(text, r.from, r.to); break;
          }
          case 'select': {
            if (op.nodeId && op.node === true) { const t = locate(tr.doc, op.nodeId); tr.setSelection(NodeSelection.create(tr.doc, t.pos)); }
            else selectRange();
            break;
          }
          case 'setBlock': {
            if (!['paragraph', 'h1', 'h2', 'h3', 'h4'].includes(op.block)) throw new SessionError('无效标题层级');
            selectRange();
            if (!commands.setNode(op.block === 'paragraph' ? 'paragraph' : 'heading', op.block === 'paragraph' ? {} : { level: Number(op.block[1]) })) throw new SessionError('不能转换当前节点');
            break;
          }
          case 'toggleQuote': case 'toggleList': {
            if (op.nodeId) selectRange();
            if (op.type === 'toggleList' && !['bullet', 'ordered'].includes(op.kind)) throw new SessionError('列表类型无效');
            const command = op.type === 'toggleQuote' ? 'toggleBlockquote' : op.kind === 'ordered' ? 'toggleOrderedList' : 'toggleBulletList';
            if (!commands[command]()) throw new SessionError('不能转换当前节点');
            break;
          }
          case 'mark': {
            if (!['bold', 'italic', 'code'].includes(op.mark)) throw new SessionError('不支持的语义标记');
            if (op.nodeId) selectRange();
            const command = op.enabled === undefined ? 'toggleMark' : op.enabled ? 'setMark' : 'unsetMark';
            if (!commands[command](op.mark)) throw new SessionError('不能应用标记');
            break;
          }
          case 'style': {
            validateStyle(op.style);
            if (op.range) {
              if (Object.keys(op.style).some(k => !['fontSize', 'color'].includes(k))) throw new SessionError('文字范围不支持边框');
              selectRange();
              if (!commands.setMark('visual', op.style)) throw new SessionError('当前文字范围不支持视觉样式');
            } else {
              const t = target(tr, op); tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, ...op.style });
            }
            break;
          }
          case 'title': tr.setDocAttribute('title', requireString(op.text)); break;
          case 'digest': tr.setDocAttribute('digest', requireString(op.text)); break;
          case 'pageMargin': {
            validatePageMargin(op.value);
            tr.setDocAttribute('pageMargin', op.value); break;
          }
          case 'template': {
            getTemplate(op.templateId);
            // Delete from the end so all other positions remain valid.
            const decorations = [];
            tr.doc.descendants((node, pos) => {
              if (node.type.name === 'decoration') decorations.push({ pos, size: node.nodeSize });
              else if (node.attrs.id) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...Object.fromEntries(visualKeys.map(k => [k, null])) });
            });
            decorations.reverse().forEach(t => tr.delete(t.pos, t.pos + t.size));
            tr.removeMark(0, tr.doc.content.size, this.editor.schema.marks.visual);
            tr.setDocAttribute('templateId', op.templateId);
            tr.setDocAttribute('pageMargin', null); break;
          }
          case 'replaceImage': {
            const t = locate(tr.doc, op.nodeId);
            if (t.node.type.name !== 'image') throw new SessionError('目标不是图片');
            if (!hasImageAsset(this.assets, op.assetId)) throw new SessionError('资源不存在，请先上传');
            if (op.expectedImageVersion !== undefined && op.expectedImageVersion !== this.imageVersion(op.nodeId)) throw new SessionError('图片已被较新的操作更新，忽略过期替换', 409);
            tr.setMeta('imageWrites', [...(tr.getMeta('imageWrites') || []), op.nodeId]);
            tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, src: `asset:${op.assetId}`, ...(op.caption !== undefined ? { caption: requireString(op.caption) } : {}), ...(op.alt !== undefined ? { alt: requireString(op.alt) } : {}) }); break;
          }
          case 'insertBlock': {
            if (op.beforeId && op.afterId) throw new SessionError('beforeId 与 afterId 不能同时提供');
            const anchor = op.beforeId || op.afterId ? locate(tr.doc, op.beforeId || op.afterId) : null;
            const pos = anchor ? anchor.pos + (op.beforeId ? 0 : anchor.node.nodeSize) : tr.doc.content.size;
            const node = this.editor.schema.nodeFromJSON(assignIds(blockJSON(op, this.assets))); node.check();
            const resolved = tr.doc.resolve(pos), index = resolved.index();
            if (!resolved.parent.canReplaceWith(index, index, node.type)) throw new SessionError('当前位置不能插入该块');
            tr.insert(pos, node);
            if (op.focus) focusBlock(tr, pos, node);
            break;
          }
          case 'convertBlock': {
            const target = locate(tr.doc, op.nodeId);
            if (target.node.type.name !== 'paragraph' || target.node.content.size) throw new SessionError('新增段落已被修改，不能覆盖其内容');
            if (!['paragraph', 'quote', 'card', 'image', 'horizontalRule'].includes(op.block)) throw new SessionError('不支持的基础区块样式');
            if (op.block === 'paragraph') { if (op.focus) focusBlock(tr, target.pos, target.node); break; }
            const json = blockJSON(op, this.assets); json.attrs = { ...json.attrs, id: target.node.attrs.id };
            const node = this.editor.schema.nodeFromJSON(assignIds(json)); node.check();
            const resolved = tr.doc.resolve(target.pos), index = resolved.index();
            if (!resolved.parent.canReplaceWith(index, index + 1, node.type)) throw new SessionError('当前位置不能转换为该样式');
            tr.replaceWith(target.pos, target.pos + target.node.nodeSize, node);
            if (op.focus) focusBlock(tr, target.pos, node);
            break;
          }
          case 'deleteNode': {
            const t = locate(tr.doc, op.nodeId); tr.delete(t.pos, t.pos + t.node.nodeSize); break;
          }
          default: throw new SessionError(`未知操作: ${op.type}`);
        }
        return true;
      });
    }
    chain.command(({ tr }) => {
      tr.doc.check();
      validateTables(tr.doc);
      return true;
    });
    const revision = this.revision;
    chain.run();
    // A following native keystroke must not merge into this explicit operation's undo step.
    if (this.revision !== revision) this.editor.view.dispatch(closeHistory(this.editor.state.tr));
    return this.snapshot();
  }
  destroy() { this.editor.destroy(); }
}
