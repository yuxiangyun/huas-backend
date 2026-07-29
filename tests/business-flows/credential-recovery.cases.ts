/**
 * [INPUT]: 依赖 凭证管理器、CAS/TGC 交换 mock 与持久化凭证状态
 * [OUTPUT]: 验证 JW/Portal 静默恢复、验证码阻断、超时穿透与重认证补齐
 * [POS]: tests/business-flows 的独立能力用例集，由聚合入口在进程级 mock 隔离内装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import {
  eq,
  authBehavior,
  ticketBehavior,
  getDb,
  schema,
  CredentialManager,
  createUser,
} from './harness';

describe('静默凭证链路', () => {
  it('jw_session 过期后在 TGC 有效时可刷新，不触发静默重认证', async () => {
    const userId = await createUser('2023001009', 'pass-jw-refresh');
    await CredentialManager.storeCredential(userId, 'cas_tgc', null, '{"cookies":[]}', 60_000);
    await CredentialManager.storeCredential(userId, 'jw_session', null, '{"cookies":[]}', -1_000);

    let silentLoginCalled = false;
    authBehavior.login = async () => {
      silentLoginCalled = true;
      return { success: false, steps: [] };
    };
    ticketBehavior.exchangeJwSession = async () => ({
      success: true,
      steps: [{ label: 'jw', ok: true }],
    });

    const cred = await CredentialManager.getOrRefreshCredential(userId, 'jw_session');
    expect(cred).not.toBeNull();
    expect(cred?.cookieJar).toBeTruthy();
    expect(silentLoginCalled).toBe(false);
  });

  it('JW 上游不可达时应透传超时，不触发静默重认证', async () => {
    const userId = await createUser('2023001999', 'pass-jw-timeout');
    await CredentialManager.storeCredential(userId, 'cas_tgc', null, '{"cookies":[]}', 60_000);
    await CredentialManager.storeCredential(userId, 'jw_session', null, '{"cookies":[]}', -1_000);

    let silentLoginCalled = false;
    authBehavior.login = async () => {
      silentLoginCalled = true;
      return { success: false, steps: [] };
    };

    ticketBehavior.exchangeJwSession = async () => ({
      success: false,
      steps: [{ label: 'jw#1', ok: false, detail: 'status:0' }],
      upstreamUnavailable: true,
    });

    await expect(CredentialManager.getOrRefreshCredential(userId, 'jw_session')).rejects.toThrow('REQUEST_TIMEOUT');
    expect(silentLoginCalled).toBe(false);
  });

  it('portal_jwt 过期后优先走 TGC 刷新', async () => {
    const userId = await createUser('2023001002', 'pass-refresh');
    await CredentialManager.storeCredential(userId, 'cas_tgc', null, '{"cookies":[]}', 60_000);
    await CredentialManager.storeCredential(userId, 'portal_jwt', 'stale-token', null, -1_000);

    ticketBehavior.exchangePortalToken = async () => ({
      token: 'portal-token-new',
      steps: [{ label: 'portal', ok: true }],
    });

    const cred = await CredentialManager.getOrRefreshCredential(userId, 'portal_jwt');
    expect(cred?.value).toBe('portal-token-new');
  });

  it('Portal TGC 刷新超时保持 REQUEST_TIMEOUT，不进入静默重登并退化为 3003', async () => {
    const userId = await createUser('2023001008', 'pass-portal-timeout');
    await CredentialManager.storeCredential(userId, 'cas_tgc', null, '{"cookies":[]}', 60_000);
    await CredentialManager.storeCredential(userId, 'portal_jwt', 'stale', null, -1_000);
    ticketBehavior.exchangePortalToken = async () => { throw new Error('REQUEST_TIMEOUT'); };

    await expect(CredentialManager.getOrRefreshCredential(userId, 'portal_jwt'))
      .rejects.toThrow('REQUEST_TIMEOUT');
  });

  it('等待验证码登录期间跳过静默恢复', async () => {
    const userId = await createUser('2023001006', 'pass-interactive-required');
    await CredentialManager.markInteractiveLoginRequired(userId);

    let loginCallCount = 0;
    authBehavior.login = async () => {
      loginCallCount += 1;
      return { success: true, portalToken: 'should-not-run', steps: [] };
    };

    const cred = await CredentialManager.getOrRefreshCredential(userId, 'portal_jwt');
    expect(cred).toBeNull();
    expect(loginCallCount).toBe(0);
  });

  it('持久化验证码标记没有 TTL，凭证过期清理不会删除它', async () => {
    const userId = await createUser('2023001007', 'pass-persistent-marker');
    await CredentialManager.markInteractiveLoginRequired(userId);

    await CredentialManager.cleanupExpired();

    expect(await CredentialManager.requiresInteractiveLogin(userId)).toBe(true);
    const credentials = await getDb().select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, userId));
    expect(credentials).toHaveLength(1);
    expect(credentials[0].system).toBe('interactive_login_required');
    expect(credentials[0].expiresAt).toBeNull();
  });

  it('TGC 不可用时触发静默重认证并补齐凭证', async () => {
    const userId = await createUser('2023001003', 'pass-silent');
    await CredentialManager.storeCredential(userId, 'portal_jwt', 'expired-token', null, -1_000);

    authBehavior.login = async (_username, password) => ({
      success: true,
      portalToken: password === 'pass-silent' ? 'portal-token-silent' : null,
      steps: [],
    });
    ticketBehavior.exchangeJwSession = async () => ({ success: true, steps: [] });

    const cred = await CredentialManager.getOrRefreshCredential(userId, 'portal_jwt');
    expect(cred?.value).toBe('portal-token-silent');

    const db = getDb();
    const creds = await db.select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, userId));
    const systems = creds.map((c: any) => c.system);
    expect(systems.includes('cas_tgc')).toBe(true);
    expect(systems.includes('jw_session')).toBe(true);
    expect(systems.includes('portal_jwt')).toBe(true);
  });

  it('静默重认证拿到 portal token 时不受 JW 激活失败影响', async () => {
    const userId = await createUser('2023001004', 'pass-partial');
    await CredentialManager.storeCredential(userId, 'portal_jwt', 'expired-token', null, -1_000);

    authBehavior.login = async (_username, password) => ({
      success: true,
      portalToken: password === 'pass-partial' ? 'portal-token-partial' : null,
      steps: [],
    });
    ticketBehavior.exchangeJwSession = async () => ({
      success: false,
      steps: [{ label: 'jw#1', ok: false, detail: 'status:500' }],
      upstreamUnavailable: false,
    });

    const cred = await CredentialManager.getOrRefreshCredential(userId, 'portal_jwt');
    expect(cred?.value).toBe('portal-token-partial');

    const db = getDb();
    const creds = await db.select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, userId));
    const systems = creds.map((c: any) => c.system);
    expect(systems.includes('cas_tgc')).toBe(true);
    expect(systems.includes('portal_jwt')).toBe(true);
    expect(systems.includes('jw_session')).toBe(false);
  });

  it('静默重认证未直接拿到 portal token 时，会再走 TGC 换取门户凭证', async () => {
    const userId = await createUser('2023001005', 'pass-portal-recover');
    await CredentialManager.storeCredential(userId, 'portal_jwt', 'expired-token', null, -1_000);

    authBehavior.login = async () => ({
      success: true,
      portalToken: null,
      steps: [],
    });
    ticketBehavior.exchangePortalToken = async () => ({
      token: 'portal-token-recovered-silent',
      steps: [{ label: 'portal', ok: true }],
    });
    ticketBehavior.exchangeJwSession = async () => ({
      success: false,
      steps: [{ label: 'jw#1', ok: false, detail: 'status:500' }],
      upstreamUnavailable: false,
    });

    const cred = await CredentialManager.getOrRefreshCredential(userId, 'portal_jwt');
    expect(cred?.value).toBe('portal-token-recovered-silent');

    const db = getDb();
    const creds = await db.select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, userId));
    const systems = creds.map((c: any) => c.system);
    expect(systems.includes('cas_tgc')).toBe(true);
    expect(systems.includes('portal_jwt')).toBe(true);
    expect(systems.includes('jw_session')).toBe(false);
  });
});
