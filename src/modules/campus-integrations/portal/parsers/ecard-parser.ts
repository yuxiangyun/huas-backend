/**
 * [INPUT]: 依赖未知 Portal 一卡通载荷、IECard 类型与 portal-code 的 code 语义判断
 * [OUTPUT]: 对外提供 ECardParser，验证 envelope/data、完整数值与文本字段后投影稳定余额 DTO
 * [POS]: campus-integrations/portal/parsers 的一卡通纯解析器，仅明确过期 code 产生 SESSION_EXPIRED，缺失或格式错误保留协议失败
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { IECard } from '../../../../types';
import { isPortalSessionExpiredCode, isPortalSuccessCode } from './portal-code';

function parseBalance(rawBalance: unknown): number {
  if (rawBalance === undefined || rawBalance === null || rawBalance === '') {
    throw new Error('ECARD_UPSTREAM_ERROR');
  }
  if (
    (typeof rawBalance !== 'number' && typeof rawBalance !== 'string')
    || (typeof rawBalance === 'string' && !/^[+-]?\d+(?:\.\d+)?$/.test(rawBalance.trim()))
  ) throw new Error('ECARD_UPSTREAM_ERROR');
  const parsed = Number(rawBalance);
  if (!Number.isFinite(parsed)) {
    throw new Error('ECARD_UPSTREAM_ERROR');
  }
  return parsed;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ECARD_UPSTREAM_ERROR');
  }
  return value as Record<string, unknown>;
}

function textField(data: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = data[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string') throw new Error('ECARD_UPSTREAM_ERROR');
    return value;
  }
  return fallback;
}

export const ECardParser = {
  parse(value: unknown): IECard {
    const json = requireRecord(value);
    if (!isPortalSuccessCode(json.code)) {
      if (isPortalSessionExpiredCode(json.code)) {
        throw new Error('SESSION_EXPIRED');
      }
      throw new Error('ECARD_UPSTREAM_ERROR');
    }
    const data = requireRecord(json.data);
    const balanceValue = data.cardWallet ?? data.wallet ?? data.balance ?? data.card_wallet;
    return {
      balance: parseBalance(balanceValue),
      status: textField(data, ['cardStatus', 'status'], '未知'),
      lastTime: textField(data, ['dbTime', 'time'], '')
    };
  }
};
