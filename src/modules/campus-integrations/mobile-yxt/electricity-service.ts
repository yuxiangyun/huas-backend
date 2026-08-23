/**
 * [INPUT]: 依赖 MobileYxtElectricityReader、独立只读配额、CacheService、显式 refresh 与受控 stale fallback
 * [OUTPUT]: 对外提供注入式 ElectricityService.getAccount，返回稳定电费 DTO 与缓存元数据，并合并同键 miss/refresh 回源
 * [POS]: mobile-yxt 的电费应用用例；缓存 miss/强刷独立限流且共享同一在途新鲜读取，凭证或协议错误禁止被 stale 掩盖
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../../config';
import { fallbackOnRefreshFailure } from '../../../services/infra/refresh-fallback';
import { AppError, ErrorCode } from '../../../utils/errors';
import { CacheService } from '../../cache/cache-service';
import { MobileYxtElectricityClient } from './electricity-client';
import type { ElectricityAccount } from './electricity-parser';
import { allowsMobileYxtStaleFallback } from './mobile-yxt-errors';
import { mobileYxtReadQuota, type MobileYxtReadQuota } from './read-rate-limiter';

export interface MobileYxtElectricityReader {
  getAccount(userId: number): Promise<ElectricityAccount>;
}

export function mobileYxtElectricityCacheKey(userId: number): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new AppError(ErrorCode.PARAM_ERROR, '用户身份无效');
  }
  return `mobile-yxt:electricity:${String(userId).padStart(20, '0')}`;
}

export class ElectricityService {
  constructor(
    private readonly client: MobileYxtElectricityReader = new MobileYxtElectricityClient(),
    private readonly quota: MobileYxtReadQuota = mobileYxtReadQuota,
  ) {}

  static getAccount(userId: number, studentId: string, forceRefresh = false) {
    return defaultElectricityService.getAccount(userId, studentId, forceRefresh);
  }

  async getAccount(userId: number, studentId: string, forceRefresh = false) {
    const cacheKey = mobileYxtElectricityCacheKey(userId);
    if (!forceRefresh) {
      const cached = await CacheService.get<ElectricityAccount>(cacheKey, { touch: true });
      if (cached) return { data: cached.data, _meta: cached.meta };
    }

    this.quota.consume(userId);
    let data: ElectricityAccount;
    try {
      data = await CacheService.runSingleflight(
        cacheKey,
        // normal 只有缓存 miss 才进入此处，与 refresh 共享回源可避免完成顺序反向覆盖缓存。
        false,
        () => this.client.getAccount(userId),
      );
    } catch (error) {
      if (!allowsMobileYxtStaleFallback(error)) throw error;
      const fallback = await fallbackOnRefreshFailure<ElectricityAccount>({
        forceRefresh,
        cacheKey,
        error,
        source: 'mobile-yxt-electricity',
        studentId,
      });
      if (fallback) return fallback;
      throw error;
    }

    await CacheService.set(cacheKey, data, config.cacheTtl.ecard, 'mobile-yxt');
    return { data, _meta: { cached: false, source: 'mobile-yxt' } };
  }
}

const defaultElectricityService = new ElectricityService();
