/**
 * [INPUT]: 依赖真实 SchoolStateStore/认证排序及单次派生交换协议，数据库由 tests/setup 隔离
 * [OUTPUT]: 提供基础凭证播种、真实认证提交、具名交易读取及显式还原的单次交换 spy
 * [POS]: mobile 两类测试共用的事实准备边界，不模拟恢复、并发或执行器算法
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import { spyOn } from 'bun:test';
import { getDb } from '../src/db';
import { MobileJwAuthExchanger } from '../src/modules/campus-integrations/mobile-jw/auth-exchanger';
import { MobileYxtAuthExchanger } from '../src/modules/campus-integrations/mobile-yxt/auth-exchanger';
import { authenticationAttempts } from '../src/modules/campus-integrations/school-access/authentication-attempts';
import { schoolAccess } from '../src/modules/campus-integrations/school-access/school-access';
import { upsertBaseCredential } from '../src/modules/campus-integrations/school-access/school-login-context';
import { schoolStateStore, type BaseSchoolTarget } from '../src/modules/campus-integrations/school-access/state-store';

export function seedCredential(userId: number, system: BaseSchoolTarget, value: string | null, cookieJar: string | null) {
  getDb().transaction(tx => upsertBaseCredential(tx, { userId, system, value, cookieJar, at: new Date() }));
}

export function commitLogin(input: { studentId: string; encryptedPassword: string;
  casCookieJar: string; portalToken: string | null }) {
  const attempt = authenticationAttempts.begin(input.studentId);
  try {
    return schoolStateStore.commitAuthentication({ attempt, encryptedPassword: input.encryptedPassword,
      casCookieJar: input.casCookieJar, portalToken: input.portalToken });
  } finally { authenticationAttempts.finish(attempt); }
}

const restores: Array<() => void> = [];
export function installYxtExchange(exchanger: Pick<MobileYxtAuthExchanger, 'exchange'>) {
  const spy = spyOn(MobileYxtAuthExchanger.prototype, 'exchange').mockImplementation(exchanger.exchange);
  restores.push(() => spy.mockRestore());
}
export function installJwExchange(exchange: MobileJwAuthExchanger['exchange']) {
  const spy = spyOn(MobileJwAuthExchanger.prototype, 'exchange').mockImplementation(exchange);
  restores.push(() => spy.mockRestore());
}
export function restoreMobileSpies() { for (const restore of restores.splice(0).reverse()) restore(); }

export function readTrades(userId: number) {
  return schoolAccess.execute(userId, { name: 'mobileYxt.trades.page', input: {
    pageSize: '30', tradeType: '1', fromDate: '2026-08-01', toDate: '2026-08-31', pageNo: 0,
  } });
}

// Bun 的 fetch 附带 preconnect；补齐类型而非把所有网络回调降成 any。
export function mockFetch(handler: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>) {
  return spyOn(globalThis, 'fetch').mockImplementation(Object.assign(handler, { preconnect() {} }));
}
