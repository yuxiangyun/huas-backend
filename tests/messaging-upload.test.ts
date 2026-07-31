/**
 * [INPUT]: 依赖 Messaging Hono 路由工厂、上传策略与无数据库服务桩
 * [OUTPUT]: 覆盖 Content-Length 与无长度流式 multipart 在 formData 前稳定返回 413，并锁定坏 multipart 的 400 契约
 * [POS]: tests 的 Messaging HTTP 上传边界回归；压缩前事实限流和媒体事务仍由 messaging.test.ts 验证
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { createMessagingRoutes } from '../src/modules/messaging/http/messaging.routes';
import {
  DEFAULT_MESSAGING_POLICY,
  messagingRequestMaxBytes,
  type MessagingPolicy,
} from '../src/modules/messaging/domain/messaging';

function createUploadApp(policy: MessagingPolicy) {
  const service = {
    send: async () => { throw new Error('upload gate must reject before send'); },
  } as any;
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('userId', 1);
    c.set('studentId', 'test-student');
    c.set('name', '测试用户');
    await next();
  });
  app.route('/api/messaging', createMessagingRoutes(service, policy));
  return app;
}

test('rejects declared and streamed oversized multipart before formData', async () => {
  const declaredApp = createUploadApp(DEFAULT_MESSAGING_POLICY);
  const declared = await declaredApp.request(
    'http://localhost/api/messaging/users/2/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=unused',
        'Content-Length': String(messagingRequestMaxBytes(DEFAULT_MESSAGING_POLICY) + 1),
        'Idempotency-Key': randomUUID(),
      },
      body: '--unused--',
    },
  );
  expect(declared.status).toBe(413);
  expect((await declared.json() as any).error_code).toBe(4002);

  const streamPolicy = {
    ...DEFAULT_MESSAGING_POLICY,
    maxImageBytes: 1,
    maxTotalImageBytes: 1,
  };
  const streamedRequest = new Request(
    'http://localhost/api/messaging/users/2/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=streamed',
        'Idempotency-Key': randomUUID(),
      },
      body: new Uint8Array(messagingRequestMaxBytes(streamPolicy) + 1),
    },
  );
  expect(streamedRequest.headers.has('content-length')).toBe(false);
  const streamed = await createUploadApp(streamPolicy).request(streamedRequest);
  expect(streamed.status).toBe(413);
  expect((await streamed.json() as any).error_code).toBe(4002);
});

test('returns PARAM_ERROR for malformed multipart fields', async () => {
  const malformed = new FormData();
  malformed.set('images', 'not-a-file');
  const response = await createUploadApp(DEFAULT_MESSAGING_POLICY).request(
    'http://localhost/api/messaging/users/2/messages',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': randomUUID() },
      body: malformed,
    },
  );
  expect(response.status).toBe(400);
  expect((await response.json() as any).error_code).toBe(4002);
});
