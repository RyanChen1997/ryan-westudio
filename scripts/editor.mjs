#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { createEditorServer } from '../modules/editor/tools/server.mjs';
import { sourceHash } from '../modules/editor/core/source-validation.mjs';

const { values } = parseArgs({ options: {
  project: { type: 'string' }, md: { type: 'string' }, docx: { type: 'string' },
  'source-md': { type: 'string' }, 'prepare-only': { type: 'boolean' },
  preset: { type: 'string' }, port: { type: 'string', default: '4318' },
  'asset-dir': { type: 'string', multiple: true }, open: { type: 'boolean' }, help: { type: 'boolean' },
} });
if (values.help || !values.project) {
  console.log('用法: npm start -- --project <持久项目目录> [--md <文章.md> | --docx <文章.docx>] [--source-md <原文快照.md>] [--prepare-only] [--preset <模板>] [--asset-dir <目录>] [--port 4318] [--open]\nAI 整理前：--prepare-only 冻结原文；整理后：--md structured.md --source-md source.md，文字对照通过才启动。已有项目直接 --project 恢复，不重新校验用户编辑。');
  process.exit(values.help ? 0 : 1);
}

async function main() {
  if (values.md && values.docx) throw new Error('--md 与 --docx 不能同时使用');
  const project = path.resolve(values.project), source = values.md || values.docx;
  const exists = await fs.stat(path.join(project, 'project.json')).then(() => true, () => false);
  if (values['prepare-only']) {
    if (exists) throw new Error('已有编辑项目不能重新冻结原文');
    if (!source) throw new Error('--prepare-only 需要 --md 或 --docx');
    if (await fs.stat(path.join(project, 'source.md')).then(() => true, () => false)) throw new Error('原文基准已存在，拒绝覆盖 source.md');
  }
  let markdown, sourceMarkdown;
  const assetDirs = (values['asset-dir'] || []).map(dir => path.resolve(dir));
  if (!exists && values.md) {
    markdown = await fs.readFile(values.md, 'utf8');
    assetDirs.unshift(path.dirname(path.resolve(values.md)));
  }
  if (!exists && values.docx) {
    const mammoth = (await import('mammoth')).default, TurndownService = (await import('turndown')).default;
    const inputDir = path.join(project, 'input-images'); await fs.mkdir(inputDir, { recursive: true });
    let index = 0;
    const result = await mammoth.convertToHtml({ path: values.docx }, { convertImage: mammoth.images.imgElement(async image => {
      const name = `word-${++index}.${image.contentType.split('/')[1]}`;
      await fs.writeFile(path.join(inputDir, name), await image.read()); return { src: name };
    }) });
    result.messages.forEach(message => console.warn(`Word: ${message.message}`));
    const body = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', emDelimiter: '*', strongDelimiter: '**' }).turndown(result.value);
    // Filename metadata is not part of the original Word text. Do not freeze it as an authored title.
    markdown = (values['prepare-only'] ? '' : `---\ntitle: ${JSON.stringify(path.basename(values.docx, path.extname(values.docx)))}\n---\n\n`) + body + '\n';
    assetDirs.unshift(inputDir);
  }
  if (values['prepare-only']) {
    await fs.mkdir(project, { recursive: true, mode: 0o700 });
    const originalFile = `original${path.extname(source)}`;
    if (path.resolve(source) !== path.join(project, originalFile)) {
      await fs.copyFile(source, path.join(project, originalFile), constants.COPYFILE_EXCL);
      await fs.chmod(path.join(project, originalFile), 0o400);
    }
    await fs.writeFile(path.join(project, 'source.md'), markdown, { flag: 'wx', mode: 0o400 });
    await fs.writeFile(path.join(project, 'source-manifest.json'), JSON.stringify({ formatVersion: 1, sourceHash: sourceHash(markdown), originalFile, assetDirs }, null, 2) + '\n', { flag: 'wx', mode: 0o400 });
    console.log(`原文基准已冻结: ${path.join(project, 'source.md')}\n请另写 structured.md，不修改 source.md。整理后使用 --md <structured.md> --source-md <source.md> 启动，程序先对照原文。`);
    return;
  }
  if (!exists && values['source-md']) {
    const sourcePath = path.resolve(values['source-md']);
    sourceMarkdown = await fs.readFile(sourcePath, 'utf8');
    assetDirs.push(path.dirname(sourcePath));
    let manifest;
    try { manifest = JSON.parse(await fs.readFile(path.join(path.dirname(sourcePath), 'source-manifest.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (manifest) {
      if (manifest.formatVersion !== 1 || manifest.sourceHash !== sourceHash(sourceMarkdown)) throw new Error('原文基准哈希不符：source.md 已被修改，不能用修改后的文件证明一致性');
      assetDirs.push(...manifest.assetDirs);
    }
  }
  const runtime = await createEditorServer({ project, port: Number(values.port), markdown, source, sourceMarkdown, templateId: values.preset, assetDirs });
  if (!exists) console.log(runtime.store.current.sourceValidation ? '原文文字一致性：通过（仅首次结构化阶段，后续编辑不重跑）' : '直接导入：未提供独立原文基准，不声称已验证 AI 结构化前后的一致性');
  console.log(`编辑器 PID: ${process.pid}\n项目: ${runtime.store.directory}\nURL: ${runtime.url}/#token=${runtime.token}\nAI_TOKEN=${runtime.token}\nAI_BASE=${runtime.url}/api/tools\n仅监听本机；令牌只授予可信的本机 AI。Ctrl+C 停止。`);
  if (values.open) {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    spawn(command, process.platform === 'win32' ? ['/c', 'start', '', `${runtime.url}/#token=${runtime.token}`] : [`${runtime.url}/#token=${runtime.token}`], { stdio: 'ignore' }).on('error', error => console.error('请手动打开 URL:', error.message));
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await runtime.close(); process.exit(0); });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
