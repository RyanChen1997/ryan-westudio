import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { load } from 'cheerio';
import { renderArticle } from '../render/article.mjs';
import { getTemplate } from '../../templates/registry.mjs';
import { readDesignAsset } from '../../templates/assets.mjs';
export const butterflyPNG = new Resvg(await fs.readFile(fileURLToPath(new URL('./assets/butterfly.svg', import.meta.url)))).render().asPng();
export async function articleImages(snapshot, store) {
  const images = new Map([['builtin:butterfly', butterflyPNG]]);
  const refs = new Set();
  const walk = node => { if (node.type === 'image') refs.add(node.attrs.src); node.content?.forEach(walk); };
  walk(snapshot.doc);
  for (const ref of refs) {
    if (!ref.startsWith('asset:')) throw new Error('图片存在性：请先导入本地图片，不会自动抓取外链');
    const buffer = await store.readAsset(ref.slice(6));
    images.set(ref, buffer);
  }
  const template = getTemplate(snapshot.doc.attrs.templateId);
  for (const role of Object.keys(template.provenance?.assets || {})) {
    const buffer = await readDesignAsset(template.id, role);
    images.set(`template:${template.id}:${role}`, buffer);
  }
  return images;
}
export async function exportArticle(snapshot, store) {
  const images = await articleImages(snapshot, store);
  const html = renderArticle(snapshot.doc, ref => {
    if (!images.has(ref)) throw new Error(`图片存在性：资源不存在 ${ref}`);
    return `data:image/png;base64,${images.get(ref).toString('base64')}`;
  });
  // Export the accepted current state. Initial source fidelity is not rerun on user edits.
  await store.writeExport({ revision: snapshot.revision, html, markdown: snapshot.markdown });
  // Clipboard plaintext is visible prose, not Markdown source/frontmatter.
  const plain = load(html, null, false);
  plain('[data-decorative]').remove();
  plain('br').replaceWith('\n');
  plain('td,th').not(':last-child').append('\t');
  plain('p,h1,h2,h3,h4,pre,section,tr').append('\n');
  const text = plain.root().text().replace(/\n{3,}/g, '\n\n').trim();
  return { revision: snapshot.revision, html, text };
}
