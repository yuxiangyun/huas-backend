/**
 * [INPUT]: 依赖 Portal 上游一卡通 JSON、IECard 类型、AppError/ErrorCode 与 portal-code 的 code 语义判断
 * [OUTPUT]: 对外提供 ECardParser，解析稳定余额 DTO，余额字段缺失或格式异常时抛出上游格式错误
 * [POS]: parsers/portal 的一卡通解析器，将 Portal 过期 code 归一为 SESSION_EXPIRED
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { IECard } from '../../types';
import { AppError, ErrorCode } from '../../utils/errors';
import { isPortalSessionExpiredCode, isPortalSuccessCode } from './portal-code';

function parseBalance(rawBalance: unknown): number {
  if (rawBalance === undefined || rawBalance === null || String(rawBalance).trim() === '') {
    throw new AppError(ErrorCode.INTERNAL_ERROR, '一卡通余额字段缺失');
  }
  const parsed = typeof rawBalance === 'number'
    ? rawBalance
    : Number.parseFloat(String(rawBalance));

  if (!Number.isFinite(parsed)) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, '一卡通余额格式错误');
  }
  return parsed;
}

export const ECardParser = {
  parse(json: any): IECard | null {
    if (!json) throw new Error('SESSION_EXPIRED');
    if (!isPortalSuccessCode(json.code)) {
      if (isPortalSessionExpiredCode(json.code)) {
        throw new Error('SESSION_EXPIRED');
      }
      return null;
    }
    const data = json.data || {};
    const balanceValue = data.cardWallet ?? data.wallet ?? data.balance ?? data.card_wallet;
    return {
      balance: parseBalance(balanceValue),
      status: data.cardStatus || data.status || '未知',
      lastTime: data.dbTime || data.time || ''
    };
  }
};
