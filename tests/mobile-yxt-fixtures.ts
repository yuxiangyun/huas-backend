/**
 * [INPUT]: 依赖隔离数据库、真实认证提交及交易/电费纯解析器
 * [OUTPUT]: 提供用户、学校登录、最小 Cookie 和电费响应的显式 fixture
 * [POS]: mobile-yxt 两套能力测试的数据准备，不注册生命周期或替换生产算法
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import { CookieJar } from 'tough-cookie';
import { getDb, schema } from '../src/db';
import { URLS } from '../src/modules/campus-integrations/endpoints';
import type { MobileYxtTradeReader } from '../src/modules/campus-integrations/mobile-yxt/ecard-overview-service';
import { parseElectricityAccount, parseElectricityConfig } from '../src/modules/campus-integrations/mobile-yxt/electricity-parser';
import { commitLogin, seedCredential } from './mobile-school-fixtures';

export async function createUser(studentId: string): Promise<number> {
  const now = new Date();
  const row = await getDb().insert(schema.users).values({
    studentId,
    name: `test-${studentId}`,
    className: 'test-class',
    createdAt: now,
    lastLoginAt: now,
    lastActiveAt: now,
  }).returning({ id: schema.users.id });
  return row[0].id;
}

export async function persistSchoolLogin(
  studentId: string,
  portalToken: string,
  jwCookieJar = '{"cookies":[{"key":"JSESSIONID","value":"jw-stable"}]}',
) {
  const user = commitLogin({ studentId, encryptedPassword: 'test-encrypted-password',
    casCookieJar: '{"cookies":[]}', portalToken });
  // JW 单独播种，避免把能力激活误写成 CAS 登录合同。
  seedCredential(user.id, 'jw_session', null, jwCookieJar);
  return user;
}

export async function sessionJar(value = 'test-session'): Promise<string> {
  const jar = new CookieJar();
  await jar.setCookie(
    `JSESSIONID=${value}; Path=/server; HttpOnly`,
    URLS.mobileYxtGetToken,
  );
  return JSON.stringify(jar.toJSON());
}

export function currentMonthOffset(offset: number): string {
  const now = new Date();
  const current = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).format(now);
  const [year, month] = current.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 - offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const portalBalance = {
  async getECard() {
    return { data: { balance: 12.34, status: '正常' } };
  },
};

export const emptyTrades: MobileYxtTradeReader = {
  async listMonth() {
    return { transactions: [], truncated: false };
  },
};

export const noQuota = { consume() {} };

export function electricityConfig(location: Record<string, unknown> | null = {
  bigArea: '',
  area: '102',
  building: '16',
  unit: '',
  level: '104',
  room: '102-16--104-418',
  subArea: '',
  areaName: '西校区',
  buildingName: '九舍',
  levelName: null,
  roomName: '418',
}) {
  return {
    success: true,
    resultData: {
      location,
      detailConfig: { enabled: false, lastMonth: null, supportAllRoom: false },
      templateList: [],
    },
  };
}

export function parseElectricityFixture(configBody: unknown, accountBody: unknown) {
  return parseElectricityAccount(parseElectricityConfig(configBody), accountBody);
}

export function electricityAccount(templateList: Array<Record<string, unknown>> = [
  { code: 'ykt_balance', name: '校园卡余额', unit: '元', show: true, value: '12.34' },
  { code: 'price', name: '电价', unit: '元/度', show: true, value: '0.62' },
  { code: 'quantity', name: '剩余电量', unit: '度', show: true, value: '-11.10' },
  { code: 'balance', name: '电费余额', unit: '元', show: true, value: '-6.88' },
]) {
  return {
    success: true,
    resultData: {
      balance: '12.34',
      accStatus: '1',
      accStatusName: '正常',
      utilityStatus: '1',
      utilityStatusName: '供电',
      supportDetails: false,
      utilityAccount: 'virtual-account',
      utilityUsername: '测试用户',
      templateList,
    },
  };
}
