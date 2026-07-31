/**
 * [INPUT]: 依赖 Discover/Community Hono 路由工厂、共享 multipart 上限计算与无副作用服务桩
 * [OUTPUT]: 覆盖两条社交上传路由在 formData 前拒绝声明长度及无长度流式超限请求
 * [POS]: tests 的社交 HTTP 内存门禁回归，锁定无关字段也不能绕过统一 413 边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { expect, test } from 'bun:test';
import { Hono } from 'hono';
import { createCommunityRoutes } from '../src/modules/community/http/community.routes';
import { createDiscoverRoutes } from '../src/modules/discover/http/discover.routes';
import { multipartRequestMaxBytes } from '../src/utils/request-body-limit';

const IMAGE_MAX_BYTES = 1;
const REQUEST_MAX_BYTES = multipartRequestMaxBytes(IMAGE_MAX_BYTES);

function createUploadApp(kind: 'discover' | 'community') {
  const service = new Proxy({}, {
    get() {
      return async () => { throw new Error('upload gate must reject before application service'); };
    },
  }) as any;
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('userId', 1);
    c.set('studentId', 'upload-limit-test');
    c.set('name', '上传门禁测试');
    await next();
  });

  if (kind === 'discover') {
    app.route('/upload', createDiscoverRoutes(service, {
      maxImagesPerPost: 1,
      imageMaxBytes: IMAGE_MAX_BYTES,
    }));
  } else {
    app.route('/upload', createCommunityRoutes(service, {
      avatarMaxBytes: IMAGE_MAX_BYTES,
    }));
  }
  return app;
}

for (const { kind, path } of [
  { kind: 'discover', path: '/upload/posts' },
  { kind: 'community', path: '/upload/profile' },
] as const) {
  test(`${kind} rejects declared and streamed oversized multipart before formData`, async () => {
    const app = createUploadApp(kind);
    const declared = await app.request(`http://localhost${path}`, {
      method: kind === 'discover' ? 'POST' : 'PUT',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=unused',
        'Content-Length': String(REQUEST_MAX_BYTES + 1),
      },
      body: '--unused--',
    });
    expect(declared.status).toBe(413);
    expect((await declared.json() as any).error_code).toBe(4002);

    const streamedRequest = new Request(`http://localhost${path}`, {
      method: kind === 'discover' ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'multipart/form-data; boundary=streamed' },
      body: new Uint8Array(REQUEST_MAX_BYTES + 1),
    });
    expect(streamedRequest.headers.has('content-length')).toBe(false);
    const streamed = await app.request(streamedRequest);
    expect(streamed.status).toBe(413);
    expect((await streamed.json() as any).error_code).toBe(4002);
  });
}
