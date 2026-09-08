/**
 * [INPUT]: 依赖本地流式 HTTP 服务、校园 HttpClient、retryAsync 与结果 observer
 * [OUTPUT]: 验证正文迟到受单次/总预算约束、超时可重试及完整 Response 的 JSON/二进制/重定向合同
 * [POS]: tests 的校园传输边界回归，使用本地真实 socket 证明收到响应头不代表请求完成
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createServer } from 'node:http';
import { HttpClient, configureHttpClientObservers, type HttpClientOutcome } from '../src/modules/campus-integrations/http/http-client';
import { retryAsync } from '../src/modules/campus-integrations/http/retry';

let origin: string;
let retryRequests = 0;
const server = createServer((request, response) => {
  const slow = request.url === '/slow' || (request.url === '/retry' && ++retryRequests === 1);
  if (slow) {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{');
    const timer = setTimeout(() => response.end('"ok":true}'), 1_000);
    response.on('close', () => clearTimeout(timer));
    return;
  }
  if (request.url === '/binary') {
    response.writeHead(200, { 'Content-Type': 'image/png', 'Set-Cookie': 'campus=fixture; Path=/' });
    response.end(Buffer.from([0, 1, 127, 255]));
    return;
  }
  if (request.url === '/empty') { response.writeHead(204); response.end(); return; }
  if (request.url === '/redirect') { response.writeHead(302, { Location: '/ok' }); response.end(); return; }
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end('{"ok":true}');
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('校园 HTTP 正文预算', () => {
  for (const budget of ['request', 'deadline'] as const) {
    it(`${budget} 在已收到响应头、正文未结束时中止并仅记录一次 timeout`, async () => {
      const outcomes: HttpClientOutcome[] = [];
      const restore = configureHttpClientObservers({ recordOutcome: (value) => outcomes.push(value) });
      try {
        const client = new HttpClient();
        if (budget === 'deadline') client.setDeadline(Date.now() + 80);
        await expect(client.request(`${origin}/slow`, { timeout: budget === 'request' ? 80 : 2_000 })
          .then((response) => response.json())).rejects.toThrow('REQUEST_TIMEOUT');
        expect(outcomes).toEqual(['timeout']);
      } finally { restore(); }
    });
  }

  it('正文超时可进入有界重试，后一次完整响应正常返回', async () => {
    retryRequests = 0;
    const client = new HttpClient();
    const result = await retryAsync(async () => {
      const response = await client.request(`${origin}/retry`, { timeout: 100 });
      return response.json();
    }, { attempts: 2, baseDelayMs: 0, shouldRetry: (error) => (error as Error).message === 'REQUEST_TIMEOUT' });
    expect(result).toEqual({ ok: true });
    expect(retryRequests).toBe(2);
  });

  it('完整响应保留 URL、头部、Cookie、二进制和未消费正文', async () => {
    const client = new HttpClient();
    const response = await client.request(`${origin}/binary`);
    expect(response.url).toBe(`${origin}/binary`);
    expect(response.bodyUsed).toBe(false);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(await client.jar.getCookieString(origin)).toBe('campus=fixture');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0, 1, 127, 255]);
    expect(response.bodyUsed).toBe(true);
  });

  it('保留无正文与手动重定向状态', async () => {
    const client = new HttpClient();
    const empty = await client.request(`${origin}/empty`);
    expect(empty.status).toBe(204);
    expect(await empty.text()).toBe('');
    const redirect = await client.request(`${origin}/redirect`, { isAuthFlow: true });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe('/ok');
  });
});
