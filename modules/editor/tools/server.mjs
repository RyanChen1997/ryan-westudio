import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProjectStore } from '../core/store.mjs';
import { exportArticle, butterflyPNG } from '../export/index.mjs';
import { readDesignAsset } from '../../templates/assets.mjs';
const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));
export async function createEditorServer({ project, port = 4318, ...input }) {
  const store = new ProjectStore(project);
  await fs.mkdir(store.directory, { recursive: true, mode: 0o700 });
  const lockPath = path.join(store.directory, '.editor.lock');
  let lock;
  try { lock = await fs.open(lockPath, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(await fs.readFile(lockPath, 'utf8'));
    try { process.kill(pid, 0); throw new Error(`此项目已由进程 ${pid} 打开`); }
    catch (check) { if (check.code !== 'ESRCH') throw check; }
    await fs.unlink(lockPath); lock = await fs.open(lockPath, 'wx', 0o600);
  }
  await lock.writeFile(String(process.pid)); await lock.close();
  try { await store.open(input); } catch (error) { await fs.unlink(lockPath); throw error; }
  const token = randomBytes(32).toString('hex');
  const app = express(), server = createServer(app), wss = new WebSocketServer({ noServer: true });
  let active = null, lease = null;
  const pending = new Map();
  const matches = value => {
    if (typeof value !== 'string') return false;
    const supplied = Buffer.from(value), expected = Buffer.from(token);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  };
  // Cookies ignore ports; isolate names so opening another project cannot log this one out.
  const cookieName = () => `wechat_editor_${server.address()?.port}`;
  const hasBearer = req => req.headers.authorization?.startsWith('Bearer ') && matches(req.headers.authorization.slice(7));
  const authenticated = req => hasBearer(req) || matches(req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${cookieName()}=([^;]+)`))?.[1]);
  const validOrigin = req => !req.headers.origin || req.headers.origin === `http://127.0.0.1:${server.address()?.port}`;
  app.use((req, res, next) => {
    if (!['127.0.0.1', `127.0.0.1:${server.address()?.port}`].includes(req.headers.host)) return res.status(403).json({ error: '只允许本地回环地址' });
    if (!validOrigin(req)) return res.status(403).json({ error: '拒绝跨域请求' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' ws://127.0.0.1:*; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'none'");
    next();
  });
  app.post('/api/auth', express.json(), (req, res) => {
    if (!matches(req.body?.token)) return res.status(401).json({ error: '无效令牌' });
    res.setHeader('Set-Cookie', `${cookieName()}=${token}; HttpOnly; SameSite=Strict; Path=/`); res.json({ ok: true });
  });
  app.use(['/api', '/assets'], (req, res, next) => authenticated(req) ? next() : res.status(401).json({ error: '需要本地会话令牌' }));
  const requireLease = (req, res, next) => active?.readyState === WebSocket.OPEN && req.headers['x-editor-lease'] === lease ? next() : res.status(409).json({ error: '不是当前活跃编辑页' });
  app.get('/api/project', (_req, res) => res.json(store.current));
  app.get('/api/design-assets/butterfly.png', (_req, res) => res.type('image/png').send(butterflyPNG));
  app.get('/api/design-assets/:templateId/:role.png', async (req, res) => {
    res.type('image/png').send(await readDesignAsset(req.params.templateId, req.params.role));
  });
  app.put('/api/project', requireLease, express.json({ limit: '30mb' }), async (req, res) => {
    const result = await store.save(req.body.snapshot, req.body.baseRevision); res.json({ revision: result.revision, assets: store.assets });
  });
  app.post('/api/assets', requireLease, express.raw({ type: '*/*', limit: '25mb' }), async (req, res) => res.json(await store.addAsset(req.body)));
  app.get('/assets/:id', async (req, res) => { res.type('image/png').send(await store.readAsset(req.params.id)); });
  app.post('/api/export', requireLease, express.json(), async (req, res) => {
    if (req.body.expectedRevision !== store.current.revision) return res.status(409).json({ error: '导出版本冲突' });
    res.json(await exportArticle(store.current, store));
  });
  function requireActivePage(page = active) {
    if (page !== active || page?.readyState !== WebSocket.OPEN) throw Object.assign(new Error('请先打开编辑器；不会创建服务端编辑副本'), { status: 409 });
    return page;
  }
  function rpc(method, payload, page = active) {
    requireActivePage(page);
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(Object.assign(new Error('活跃页面未响应；操作结果未知，请重新读取快照，勿盲目重试'), { status: 504 })); }, 20000);
      pending.set(id, { resolve, reject, timer }); page.send(JSON.stringify({ id, method, payload }));
    });
  }
  app.get('/api/tools/snapshot', async (_req, res) => res.json(await rpc('snapshot')));
  app.post('/api/tools/operations', express.json({ limit: '1mb' }), async (req, res) => {
    const { operations } = req.body ?? {};
    if (!Array.isArray(operations)) return res.status(422).json({ error: '操作必须是数组' });
    // Reject the whole batch before dispatching to the only active editor.
    if (operations.some(op => op?.type === 'replaceImage' ||
      (op?.block === 'image' && ['insertBlock', 'convertBlock'].includes(op.type)))) {
      return res.status(422).json({ error: '开源版 AI 工具不能插入或替换图片，请在编辑器中手动操作' });
    }
    res.json(await rpc('operations', req.body));
  });
  for (const method of ['save', 'export']) app.post(`/api/tools/${method}`, express.json(), async (req, res) => res.json(await rpc(method, req.body)));
  app.use(express.static(dist));
  app.get('/', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  app.use((error, _req, res, _next) => res.status(error.status || 422).json({ error: error.message }));
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/bridge' || !authenticated(req) || !validOrigin(req) || req.headers.host !== `127.0.0.1:${server.address().port}`) return socket.destroy();
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    if (active) { ws.send(JSON.stringify({ method: 'blocked', error: '已有活跃编辑页，请关闭另一页后刷新。' })); ws.close(1008); return; }
    active = ws; lease = randomUUID(); ws.send(JSON.stringify({ method: 'welcome', lease, snapshot: store.current }));
    ws.on('message', data => {
      try {
        const response = JSON.parse(data), request = pending.get(response.id);
        if (!request) return;
        clearTimeout(request.timer); pending.delete(response.id);
        if (response.error) request.reject(Object.assign(new Error(response.error), { status: response.status || 422 }));
        else request.resolve(response.result);
      } catch { ws.close(1008); }
    });
    ws.on('close', () => {
      if (active !== ws) return;
      active = null; lease = null;
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(Object.assign(new Error('编辑页断开，结果未知，请恢复后读取快照'), { status: 409 })); }
      pending.clear();
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }).catch(async error => { await fs.unlink(lockPath); throw error; });
  const url = `http://127.0.0.1:${server.address().port}`;
  return { store, token, url, server, async close() {
    for (const client of wss.clients) client.terminate();
    await new Promise(resolve => wss.close(resolve)); await new Promise(resolve => server.close(resolve));
    await fs.rm(lockPath, { force: true });
  } };
}
