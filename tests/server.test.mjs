import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createEditorServer } from '../modules/editor/tools/server.mjs';

test('HTTP bridge: auth/origin/one active page, offline refusal, save CAS, no server editor replica', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-http-'));
  const runtime = await createEditorServer({ project: directory, port: 0, markdown: '# 本地文章\n\n正文\n' });
  t.after(async () => { await runtime.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const headers = { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${runtime.url}/api/tools/snapshot`)).status, 401);
  // String length is not byte length: malformed Unicode tokens must not throw.
  assert.equal((await fetch(`${runtime.url}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'é'.repeat(64) }) })).status, 401);
  const malformed = new WebSocket(runtime.url.replace('http:', 'ws:') + '/bridge', { headers: { Cookie: `wechat_editor_${new URL(runtime.url).port}=${'é'.repeat(64)}` } });
  await new Promise((resolve, reject) => { malformed.once('error', resolve); malformed.once('open', () => { malformed.terminate(); reject(new Error('Malformed token authenticated')); }); });
  assert.equal((await fetch(`${runtime.url}/api/project`, { headers })).status, 200);
  assert.equal((await fetch(`${runtime.url}/api/tools/snapshot`, { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(`${runtime.url}/api/tools/snapshot`, { headers })).status, 409);
  await assert.rejects(createEditorServer({ project: directory, port: 0 }), /已由进程/);
  const ws = new WebSocket(runtime.url.replace('http:', 'ws:') + '/bridge', { headers });
  const welcome = await new Promise(resolve => ws.once('message', data => resolve(JSON.parse(data))));
  assert.equal(welcome.method, 'welcome');
  const second = new WebSocket(runtime.url.replace('http:', 'ws:') + '/bridge', { headers });
  const blocked = await new Promise(resolve => second.once('message', data => resolve(JSON.parse(data))));
  assert.equal(blocked.method, 'blocked'); second.close();
  ws.on('message', data => { const message = JSON.parse(data); if (message.id) ws.send(JSON.stringify({ id: message.id, result: { projectId: welcome.snapshot.projectId, revision: 99, fromActivePage: true } })); });
  const response = await fetch(`${runtime.url}/api/tools/snapshot`, { headers }).then(r => r.json());
  assert.equal(response.fromActivePage, true); assert.equal(response.revision, 99);
  assert.equal(runtime.store.current.revision, 0); // disk snapshot was not substituted for live state
  const body = JSON.stringify({ snapshot: welcome.snapshot, baseRevision: -1 });
  assert.equal((await fetch(`${runtime.url}/api/project`, { method: 'PUT', headers, body })).status, 409);
  assert.equal((await fetch(`${runtime.url}/api/project`, { method: 'PUT', headers: { ...headers, 'X-Editor-Lease': welcome.lease }, body })).status, 409);
  ws.terminate();
});

test('Pro service routes are not available to an authenticated local client', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'westudio-open-api-'));
  const runtime = await createEditorServer({ project: directory, port: 0, markdown: '正文' });
  t.after(async () => { await runtime.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const headers = { Authorization: `Bearer ${runtime.token}` };
  for (const route of ['/api/tools/assets', '/api/tools/templates/reload', '/api/publisher/config']) {
    assert.equal((await fetch(runtime.url + route, { method: 'POST', headers })).status, 404, route);
  }
});

test('HTTP auth: projects on different ports retain independent browser cookies', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-cookie-'));
  const runtimes = [];
  t.after(async () => { await Promise.all(runtimes.map(runtime => runtime.close())); await fs.rm(directory, { recursive: true, force: true }); });
  for (const name of ['first', 'second']) runtimes.push(await createEditorServer({ project: path.join(directory, name), port: 0, markdown: name }));
  const cookies = [];
  for (const runtime of runtimes) {
    const response = await fetch(`${runtime.url}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: runtime.token }) });
    assert.equal(response.status, 200);
    cookies.push(response.headers.get('set-cookie').split(';')[0]);
  }
  assert.notEqual(cookies[0].split('=')[0], cookies[1].split('=')[0]);
  // A browser sends both host cookies, regardless of which port it calls.
  for (const runtime of runtimes) {
    const response = await fetch(`${runtime.url}/api/project`, { headers: { Cookie: cookies.join('; ') } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).projectId, runtime.store.current.projectId);
  }
});
