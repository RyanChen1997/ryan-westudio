import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { schema, assignIds, validateStyle, validatePageMargin, visualKeys } from './schema.mjs';
import { parseMarkdown, toMarkdown, semantics } from './markdown.mjs';
import { getTemplate, recommendTemplate, replacementTemplateId } from '../../templates/registry.mjs';
import { assertSourceMarkdown } from './source-validation.mjs';
import { arrangePanels } from '../render/panels.mjs';
import { validateTable } from './table.mjs';
const idPattern = /^[a-f0-9]{64}$/;
async function atomicWrite(file, content) {
  const temp = `${file}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temp, 'wx', 0o600);
    await handle.writeFile(content); await handle.sync(); await handle.close(); handle = null;
    await fs.rename(temp, file);
    const dir = await fs.open(path.dirname(file), 'r');
    try { await dir.sync(); } finally { await dir.close(); }
  } catch (error) { await handle?.close(); await fs.rm(temp, { force: true }); throw error; }
}
export function atomicJSON(file, value) { return atomicWrite(file, JSON.stringify(value, null, 2) + '\n'); }
export class ProjectStore {
  constructor(directory) { this.directory = path.resolve(directory); this.assets = {}; this.queue = Promise.resolve(); }
  async open({ markdown, source, sourceMarkdown, templateId, assetDirs = [] } = {}) {
    await fs.mkdir(path.join(this.directory, 'assets'), { recursive: true, mode: 0o700 });
    const file = path.join(this.directory, 'project.json');
    const raw = await fs.readFile(file, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (raw !== undefined) {
      let saved = JSON.parse(raw);
      const replacement = replacementTemplateId(saved.doc?.attrs?.templateId);
      if (replacement) {
        // A retired design is replaced only on project open, never on an active editor's save.
        const doc = arrangePanels({ ...saved.doc, attrs: { ...saved.doc.attrs, templateId: replacement } }, getTemplate(replacement).layout);
        saved = { ...saved, doc };
      }
      this.validate(saved);
      for (const id of Object.keys(saved.assets)) await this.readAsset(id);
      if (replacement) {
        if (!Number.isSafeInteger(saved.revision + 1)) throw new Error('项目版本无效');
        saved.revision++;
        await atomicJSON(file, saved);
      }
      this.assets = saved.assets; this.current = saved;
      return saved;
    }
    if (markdown === undefined) throw new Error('新项目必须提供 --md 或 --docx');
    // This gate runs only before the first editor session, against an independently frozen source.
    const sourceValidation = sourceMarkdown === undefined ? null : assertSourceMarkdown(sourceMarkdown, markdown);
    const preset = getTemplate(templateId ?? recommendTemplate(markdown));
    const doc = assignIds(arrangePanels(parseMarkdown(markdown, preset.id), preset.layout));
    const walk = async node => {
      if (node.type === 'image') {
        const ref = node.attrs.src;
        if (ref.startsWith('asset:')) { await this.readAsset(ref.slice(6)); }
        else if (!/^https?:/i.test(ref)) {
          let data;
          for (const root of assetDirs) {
            try { data = await fs.readFile(path.resolve(root, decodeURI(ref))); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
          }
          if (!data) throw new Error(`输入图片不存在: ${ref}`);
          const asset = await this.addAsset(data); node.attrs.src = `asset:${asset.id}`;
        }
      }
      for (const child of node.content || []) await walk(child);
    };
    await walk(doc);
    const normalized = schema().nodeFromJSON(doc).toJSON();
    const snapshot = { formatVersion: 1, projectId: randomUUID(), revision: 0, doc: normalized, markdown: toMarkdown(normalized), assets: this.assets, sourceValidation };
    this.validate(snapshot);
    // Original user input is immutable; project.json is the sole current-state commit.
    await fs.writeFile(path.join(this.directory, 'original.md'), sourceMarkdown ?? markdown, { flag: 'wx', mode: 0o400 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    if (sourceValidation) await fs.writeFile(path.join(this.directory, 'structured-input.md'), markdown, { flag: 'wx', mode: 0o400 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    if (source) {
      const backup = path.join(this.directory, `original${path.extname(source)}`);
      await fs.copyFile(source, backup, (await import('node:fs')).constants.COPYFILE_EXCL).then(() => fs.chmod(backup, 0o400)).catch(error => { if (error.code !== 'EEXIST') throw error; });
    }
    await atomicJSON(file, snapshot); this.current = snapshot; return snapshot;
  }
  validate(snapshot) {
    if (snapshot.formatVersion !== 1 || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 || !snapshot.projectId) throw new Error('项目格式/版本无效');
    const node = schema().nodeFromJSON(snapshot.doc); node.check();
    const { layout } = getTemplate(node.attrs.templateId);
    const normalized = node.toJSON();
    if (JSON.stringify(arrangePanels(normalized, layout)) !== JSON.stringify(normalized)) throw new Error('章节版式与模板不一致');
    validatePageMargin(node.attrs.pageMargin);
    if (snapshot.markdown !== toMarkdown(snapshot.doc) || JSON.stringify(semantics(parseMarkdown(snapshot.markdown))) !== JSON.stringify(semantics(snapshot.doc))) throw new Error('快照 Markdown 不一致');
    const ids = new Set();
    node.descendants(n => {
      if (n.type.name === 'table') validateTable(n);
      if (n.isBlock && n.type.name !== 'designPanel') {
        if (!n.attrs.id || ids.has(n.attrs.id)) throw new Error('节点 ID 缺失或重复'); ids.add(n.attrs.id);
        validateStyle(Object.fromEntries(visualKeys.map(key => [key, n.attrs[key] ?? null])));
      }
      for (const mark of n.marks) if (mark.type.name === 'visual') validateStyle(mark.attrs);
      if (n.type.name === 'image' && n.attrs.src.startsWith('asset:') && !snapshot.assets?.[n.attrs.src.slice(6)]) throw new Error('图片未登记在资源表');
    });
    if (!snapshot.assets || typeof snapshot.assets !== 'object') throw new Error('资源映射无效');
  }
  save(snapshot, baseRevision) {
    const save = async () => {
      if (baseRevision !== this.current.revision || snapshot.revision < baseRevision || snapshot.projectId !== this.current.projectId) throw Object.assign(new Error('磁盘版本冲突'), { status: 409 });
      const persisted = { formatVersion: 1, projectId: snapshot.projectId, revision: snapshot.revision, doc: snapshot.doc, markdown: snapshot.markdown, assets: this.assets, sourceValidation: this.current.sourceValidation ?? null };
      this.validate(persisted);
      const check = async node => { if (node.type === 'image' && node.attrs.src.startsWith('asset:')) await this.readAsset(node.attrs.src.slice(6)); for (const child of node.content || []) await check(child); };
      await check(persisted.doc);
      // Compare canonical documents so newly introduced default attrs do not break old projects.
      const canonical = doc => JSON.stringify(schema().nodeFromJSON(doc).toJSON());
      if (persisted.revision === baseRevision && canonical(persisted.doc) !== canonical(this.current.doc)) throw Object.assign(new Error('相同版本内容不同'), { status: 409 });
      await atomicJSON(path.join(this.directory, 'project.json'), persisted); this.current = persisted; return persisted;
    };
    const result = this.queue.then(save); this.queue = result.catch(() => {}); return result;
  }
  async addAsset(data) {
    if (!Buffer.isBuffer(data) || !data.length) throw new Error('请提供非空的图片字节');
    if (data.length > 25 * 1024 * 1024) throw new Error('图片不能超过 25MB');
    // Rasterize trusted SVG design sources separately; user SVG is not accepted.
    const image = sharp(data, { limitInputPixels: 40_000_000 });
    const { format } = await image.metadata();
    if (!['png', 'jpeg', 'webp', 'gif'].includes(format)) throw new Error('用户图片请使用 PNG/JPEG/WebP/GIF，SVG 仅用于源码设计');
    const png = await image.rotate().resize({ width: 1080, withoutEnlargement: true }).png().toBuffer();
    const id = createHash('sha256').update(png).digest('hex');
    await atomicWrite(path.join(this.directory, 'assets', `${id}.png`), png);
    const metadata = { id, path: `assets/${id}.png`, mime: 'image/png', bytes: png.length };
    this.assets[id] = metadata;
    return metadata;
  }
  async readAsset(id) {
    if (!idPattern.test(id)) throw new Error('无效资源 ID');
    const png = await fs.readFile(path.join(this.directory, 'assets', `${id}.png`));
    if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || createHash('sha256').update(png).digest('hex') !== id) throw new Error('图片资源已损坏');
    return png;
  }
  async writeExport(bundle) {
    if (bundle.revision !== this.current.revision) throw Object.assign(new Error('导出版本已失效'), { status: 409 });
    await atomicJSON(path.join(this.directory, 'export.json'), bundle);
  }
}
