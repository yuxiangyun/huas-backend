/**
 * [INPUT]: 依赖 SQLite schema、缓存服务、成绩服务与 Portal 一卡通解析器
 * [OUTPUT]: 验证唯一键/外键/upsert、成绩缓存限额与参数、Portal 解析失败边界
 * [POS]: tests/business-flows 的独立能力用例集，由聚合入口在进程级 mock 隔离内装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import {
  eq,
  createHash,
  ErrorCode,
  upstreamState,
  getDb,
  schema,
  GradeService,
  ECardParser,
  ECardService,
  CredentialManager,
  CacheService,
  createUser,
} from './harness';

describe('数据库约束与 upsert', () => {
  it('credentials(user_id, system) 唯一键通过 upsert 保持单行', async () => {
    const userId = await createUser('2023001005', 'pass-upsert');
    await CredentialManager.storeCredential(userId, 'portal_jwt', 'v1', null, 60_000);
    await CredentialManager.storeCredential(userId, 'portal_jwt', 'v2', null, 60_000);

    const db = getDb();
    const rows = await db.select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, userId));
    expect(rows.length).toBe(1);
    expect(rows[0].value).toBe('v2');
  });

  it('credentials 表外键生效（不存在用户时插入失败）', async () => {
    const db = getDb();
    const now = new Date();
    let failed = false;

    try {
      await db.insert(schema.credentials).values({
        userId: 999999,
        system: 'portal_jwt',
        value: 'x',
        cookieJar: null,
        expiresAt: now,
        createdAt: now,
        updatedAt: now,
      });
    } catch {
      failed = true;
    }

    expect(failed).toBe(true);
  });

  it('cache key upsert 更新同 key 数据而不是新增', async () => {
    await CacheService.set('cache:test-key', { version: 1 }, 60, 'jw');
    await CacheService.set('cache:test-key', { version: 2 }, 60, 'jw');

    const db = getDb();
    const rows = await db.select()
      .from(schema.cache)
      .where(eq(schema.cache.key, 'cache:test-key'));
    expect(rows.length).toBe(1);
    expect(JSON.parse(rows[0].data)).toEqual({ schemaVersion: 1, payload: { version: 2 } });
  });
});

describe('漏洞回归：成绩缓存键放大', () => {
  it('随机查询轰炸后每个用户成绩缓存最多保留 20 条（LRU）', async () => {
    const studentId = '2023001006';

    for (let i = 0; i < 20; i++) {
      await GradeService.getGrades(1, studentId, { kcmc: `course-${i}` }, false);
    }
    expect(upstreamState.upstreamCallCount).toBe(20);

    await GradeService.getGrades(1, studentId, { kcmc: 'course-0' }, false);
    expect(upstreamState.upstreamCallCount).toBe(20);

    await GradeService.getGrades(1, studentId, { kcmc: 'course-20' }, false);
    expect(upstreamState.upstreamCallCount).toBe(21);

    await GradeService.getGrades(1, studentId, { kcmc: 'course-1' }, false);
    expect(upstreamState.upstreamCallCount).toBe(22);

    await GradeService.getGrades(1, studentId, { kcmc: 'course-0' }, false);
    expect(upstreamState.upstreamCallCount).toBe(22);

    const db = getDb();
    const rows = await db.select().from(schema.cache);
    const gradeRows = rows.filter((r: any) => r.key.startsWith(`grades:${studentId}:`));
    expect(gradeRows.length).toBe(20);
  });

  it('成绩查询参数过长时拒绝请求，避免大 key 滥用', async () => {
    await expect(
      GradeService.getGrades(1, '2023001007', { kcmc: 'x'.repeat(200) }, false)
    ).rejects.toThrow('kcmc 参数过长');
  });

  it('缓存 key 使用哈希摘要，长度固定不随输入增长', async () => {
    const studentId = '2023001008';
    const term = '2024-2025-1';
    const kcxz = '';
    const kcmc = 'A'.repeat(64);
    const expectedKey = `grades:${studentId}:${createHash('sha256')
      .update(`${term}\u0000${kcxz}\u0000${kcmc}`)
      .digest('hex')
      .slice(0, 32)}`;

    await GradeService.getGrades(1, studentId, { term, kcxz, kcmc }, false);

    const db = getDb();
    const rows = await db.select()
      .from(schema.cache)
      .where(eq(schema.cache.key, expectedKey));
    expect(rows.length).toBe(1);
    expect(rows[0].key.length).toBe(expectedKey.length);
  });
});

describe('Portal 解析器边界', () => {
  it('ecard 余额缺失与格式错误都抛出明确上游错误', () => {
    expect(() => ECardParser.parse({ code: 0, data: {} })).toThrow('一卡通余额字段缺失');
    let thrown: any;
    try {
      ECardParser.parse({ code: 0, data: { cardWallet: '余额未知' } });
    } catch (error) {
      thrown = error;
    }

    expect(thrown?.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(thrown?.message).toBe('一卡通余额格式错误');
  });

  it('ecard 余额缺失时服务不写缓存', async () => {
    upstreamState.upstreamExecuteCallback = true;
    upstreamState.upstreamRequestHandler = async () => new Response(JSON.stringify({ code: 0, data: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(ECardService.getECard(1, '2023001551', false)).rejects.toThrow('一卡通余额字段缺失');
    const rows = await getDb().select().from(schema.cache);
    expect(rows.some((row: any) => row.key === 'ecard:2023001551')).toBe(false);
  });
});
