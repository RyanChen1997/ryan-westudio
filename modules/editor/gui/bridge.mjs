import { EditorSession, SessionError } from '../core/session.mjs';
export async function connectEditor({ onReady, onState, onStatus }) {
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  if (token) {
    const auth = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    if (!auth.ok) throw new Error('会话令牌无效');
    history.replaceState(null, '', location.pathname);
  }
  let session, lease, savedRevision, saveQueue = Promise.resolve(), disposed = false, saveError = null;
  const request = async (url, body, method = 'POST') => {
    const result = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Editor-Lease': lease }, body: JSON.stringify(body) });
    const data = result.status === 204 ? null : await result.json();
    if (!result.ok) throw Object.assign(new Error(data?.error || '本地请求失败'), { status: result.status, code: data?.code });
    return data;
  };
  function enqueue(snapshot) {
    onStatus(`正在保存 r${snapshot.revision}…`);
    const job = saveQueue.catch(() => {}).then(async () => {
      const result = await request('/api/project', { snapshot, baseRevision: savedRevision }, 'PUT');
      // Assets are append-only: an older save response must not discard a just-finished upload.
      savedRevision = result.revision; session.assets = { ...session.assets, ...result.assets }; saveError = null;
      onStatus(savedRevision === session.revision ? `已保存 · Markdown 已同步 · r${savedRevision}` : `正在保存 r${session.revision}…`);
      return result;
    });
    saveQueue = job;
    job.catch(error => { saveError = error; onStatus(`保存失败：${error.message}。请勿刷新，点击保存重试。`); });
    return job;
  }
  async function flush(expectedRevision) {
    if (expectedRevision !== session.revision) throw new SessionError('版本冲突', 409);
    await enqueue(session.snapshot());
    if (session.revision !== expectedRevision) throw new SessionError('保存期间文章已变化，请重试', 409);
    return { revision: savedRevision, saved: true };
  }
  async function exportCurrent(expectedRevision) {
    await flush(expectedRevision);
    const result = await request('/api/export', { expectedRevision });
    if (session.revision !== result.revision) throw new SessionError('导出期间内容已变化，请重新复制或导出', 409);
    return result;
  }
  const ws = new WebSocket(`ws://${location.host}/bridge`);
  ws.onmessage = async ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'blocked') { onStatus(message.error); return; }
    if (message.method === 'welcome') {
      lease = message.lease; savedRevision = message.snapshot.revision;
      try {
        session = new EditorSession(message.snapshot, { onChange: snapshot => { onState(snapshot); enqueue(snapshot); }, onSelection: onState });
      } catch (error) { onStatus(`打开编辑器失败：${error.message}`); return; }
      if (disposed) return session.destroy();
      onReady({ session, save: () => flush(session.revision), exportCurrent: () => exportCurrent(session.revision),
        async upload(file) {
        const result = await fetch('/api/assets', { method: 'POST', headers: { 'X-Editor-Lease': lease, 'Content-Type': file.type || 'application/octet-stream' }, body: file });
        const asset = await result.json(); if (!result.ok) throw new Error(asset.error);
        session.assets[asset.id] = asset; return asset;
      } });
      onState(session.snapshot()); onStatus(`已保存 · Markdown 已同步 · r${savedRevision}`); return;
    }
    try {
      if (!session) throw new SessionError('编辑器尚未就绪', 409);
      let result;
      if (message.method === 'snapshot') result = session.snapshot();
      else if (message.method === 'operations') {
        session.execute(message.payload);
        const revision = session.revision;
        await flush(revision); result = session.snapshot();
      } else if (message.method === 'save') result = await flush(message.payload?.expectedRevision);
      else if (message.method === 'export') result = await exportCurrent(message.payload?.expectedRevision);
      else throw new SessionError('未知工具');
      ws.send(JSON.stringify({ id: message.id, result }));
    } catch (error) { ws.send(JSON.stringify({ id: message.id, error: error.message, status: error.status || 422 })); }
  };
  ws.onclose = () => { session?.editor.setEditable(false); if (!disposed) onStatus('会话已断开，正文暂停编辑。请确认已保存后刷新恢复。'); };
  ws.onerror = () => onStatus('无法连接本地编辑服务，请通过终端提供的 URL 打开');
  const unload = event => { if (session && (session.revision !== savedRevision || saveError)) { event.preventDefault(); event.returnValue = ''; } };
  // Opening a fresh CLI URL can be a fragment-only navigation in an existing tab.
  // Explicitly reload for its new token; beforeunload still protects unsaved edits.
  const tokenChange = () => { if (new URLSearchParams(location.hash.slice(1)).has('token')) location.reload(); };
  window.addEventListener('hashchange', tokenChange);
  window.addEventListener('beforeunload', unload);
  return () => { disposed = true; ws.close(); session?.destroy(); window.removeEventListener('beforeunload', unload); window.removeEventListener('hashchange', tokenChange); };
}
