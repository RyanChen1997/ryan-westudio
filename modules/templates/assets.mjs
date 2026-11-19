import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getTemplate } from './registry.mjs';

export async function readDesignAsset(templateId, role) {
  const { provenance } = getTemplate(templateId);
  const resource = provenance && Object.hasOwn(provenance.assets, role) && provenance.assets[role];
  if (!resource) throw Object.assign(new Error('模板装饰资源不存在'), { status: 404 });
  return readPNG(new URL(`./presets/${templateId}/${resource.path}`, import.meta.url), resource.hash, `${templateId}/${role}`);
}

export async function readPNG(file, expectedHash, label) {
  const bytes = await readFile(file);
  const hash = `sha256-${createHash('sha256').update(bytes).digest('hex')}`;
  if (hash !== expectedHash || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`模板装饰 PNG 损坏: ${label}`);
  return bytes;
}