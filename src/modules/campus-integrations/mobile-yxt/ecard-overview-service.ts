/**
 * [INPUT]: 依赖窄 Portal 余额 reader、MobileYxtTrade reader、独立只读配额、CacheService、北京时间月份策略与共享 stale fallback
 * [OUTPUT]: 对外提供注入式 ECardOverviewService、固定长度月缓存键与稳定 overview DTO，独立聚合余额/交易 availability 和 freshness
 * [POS]: mobile-yxt 账单应用组合边界；Portal 余额与交易分别保留缓存/降级事实，协议适配器不拥有 Portal 具体实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../../config';
import { fallbackOnRefreshFailure } from '../../../services/infra/refresh-fallback';
import type { CacheMeta } from '../../../types';
import { AppError, ErrorCode } from '../../../utils/errors';
import { CacheService } from '../../cache/cache-service';
import { ECardService } from '../portal/ecard-service';
import { MobileYxtTradeClient, type MonthTransactions } from './trade-client';
import {
  allowsMobileYxtStaleFallback,
  isFatalMobileYxtSubsourceError,
} from './mobile-yxt-errors';
import { mobileYxtReadQuota, type MobileYxtReadQuota } from './read-rate-limiter';
import {
  parseDecimalCents,
  resolveBeijingMonth,
  summarizeTransactions,
  type ECardTotals,
  type ECardTransaction,
  type ECardTransactionCategory,
} from './trade-parser';

export const MOBILE_YXT_TRANSACTION_CACHE_LIMIT = 6;
const USER_CACHE_ID_LENGTH = 20;

export interface ECardOverview {
  balance: { amountCents: number; status?: string } | null;
  month: string;
  totals: ECardTotals;
  transactions: ECardTransaction[];
  partial: boolean;
  unavailableParts: Array<'balance' | 'transactions'>;
  staleParts: Array<'balance' | 'transactions'>;
  degraded: boolean;
  freshness: {
    balance: CacheMeta | null;
    transactions: CacheMeta | null;
  };
  truncated: boolean;
}

interface CachedTransactions {
  transactions: ECardTransaction[];
  truncated: boolean;
}

interface TransactionsResult {
  data: CachedTransactions;
  meta: CacheMeta;
}

export interface PortalECardReader {
  getECard(userId: number, studentId: string, forceRefresh: boolean): Promise<{
    data: unknown;
    _meta?: CacheMeta;
  }>;
}

export interface MobileYxtTradeReader {
  listMonth(
    userId: number,
    category: ECardTransactionCategory,
    fromDate: string,
    toDate: string,
  ): Promise<MonthTransactions>;
}

const CATEGORIES: ECardTransactionCategory[] = ['consumption', 'recharge', 'subsidy'];

function userCacheId(userId: number): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new AppError(ErrorCode.PARAM_ERROR, '用户身份无效');
  }
  return String(userId).padStart(USER_CACHE_ID_LENGTH, '0');
}

export function mobileYxtTransactionCachePrefix(userId: number): string {
  return `mobile-yxt:trades:${userCacheId(userId)}:`;
}

export function mobileYxtTransactionCacheKey(userId: number, month: string): string {
  return `${mobileYxtTransactionCachePrefix(userId)}${month.replace('-', '')}`;
}

function chooseAggregateError(errors: unknown[]): unknown {
  return errors.find(isFatalMobileYxtSubsourceError)
    || errors.find((item) => item instanceof AppError && item.code === ErrorCode.UPSTREAM_TIMEOUT)
    || errors[0];
}

function sourceMeta(meta: CacheMeta | undefined, source: string): CacheMeta {
  return {
    cached: meta?.cached ?? false,
    ...meta,
    source: meta?.source || source,
  };
}

export class ECardOverviewService {
  constructor(
    private readonly portalECard: PortalECardReader = ECardService,
    private readonly trades: MobileYxtTradeReader = new MobileYxtTradeClient(),
    private readonly quota: MobileYxtReadQuota = mobileYxtReadQuota,
  ) {}

  static getOverview(
    userId: number,
    studentId: string,
    monthInput?: string,
    forceRefresh = false,
  ): Promise<ECardOverview> {
    return defaultECardOverviewService.getOverview(userId, studentId, monthInput, forceRefresh);
  }

  async getOverview(
    userId: number,
    studentId: string,
    monthInput?: string,
    forceRefresh = false,
  ): Promise<ECardOverview> {
    const range = resolveBeijingMonth(monthInput);
    const [balanceResult, transactionResult] = await Promise.allSettled([
      this.portalECard.getECard(userId, studentId, forceRefresh),
      this.getTransactions(userId, studentId, range, forceRefresh),
    ]);

    if (transactionResult.status === 'rejected' && isFatalMobileYxtSubsourceError(transactionResult.reason)) {
      throw transactionResult.reason;
    }
    if (balanceResult.status === 'rejected' && transactionResult.status === 'rejected') {
      throw chooseAggregateError([balanceResult.reason, transactionResult.reason]);
    }

    const unavailableParts: ECardOverview['unavailableParts'] = [];
    const freshness: ECardOverview['freshness'] = {
      balance: balanceResult.status === 'fulfilled'
        ? sourceMeta(balanceResult.value._meta, 'portal')
        : null,
      transactions: transactionResult.status === 'fulfilled'
        ? transactionResult.value.meta
        : null,
    };
    let balance: ECardOverview['balance'] = null;
    if (
      balanceResult.status === 'fulfilled'
      && balanceResult.value.data
      && typeof balanceResult.value.data === 'object'
      && !Array.isArray(balanceResult.value.data)
    ) {
      const source = balanceResult.value.data as Record<string, unknown>;
      const status = typeof source.status === 'string' && source.status.trim()
        ? source.status.trim()
        : undefined;
      try {
        balance = {
          amountCents: parseDecimalCents(source.balance, 'balance'),
          ...(status ? { status } : {}),
        };
      } catch {
        unavailableParts.push('balance');
      }
    } else {
      unavailableParts.push('balance');
    }

    let transactions: ECardTransaction[] = [];
    let truncated = false;
    if (transactionResult.status === 'fulfilled') {
      transactions = transactionResult.value.data.transactions;
      truncated = transactionResult.value.data.truncated;
    } else {
      unavailableParts.push('transactions');
    }

    transactions.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    const staleParts: ECardOverview['staleParts'] = [];
    if (freshness.balance?.stale || freshness.balance?.refresh_failed) staleParts.push('balance');
    if (freshness.transactions?.stale || freshness.transactions?.refresh_failed) staleParts.push('transactions');
    return {
      balance,
      month: range.month,
      totals: summarizeTransactions(transactions),
      transactions,
      partial: unavailableParts.length > 0,
      unavailableParts,
      staleParts,
      degraded: unavailableParts.length > 0 || staleParts.length > 0,
      freshness,
      truncated,
    };
  }

  private async getTransactions(
    userId: number,
    studentId: string,
    range: ReturnType<typeof resolveBeijingMonth>,
    forceRefresh: boolean,
  ): Promise<TransactionsResult> {
    const cacheKey = mobileYxtTransactionCacheKey(userId, range.month);
    if (!forceRefresh) {
      const cached = await CacheService.get<CachedTransactions>(cacheKey, { touch: true });
      if (cached) return { data: cached.data, meta: cached.meta };
    }

    this.quota.consume(userId);
    let data: CachedTransactions;
    try {
      // 进入此处的 normal 已经确认缓存 miss，与 refresh 都需要同一份最新回源结果；
      // 合并两种意图可避免并发完成顺序反向覆盖同一个月键。
      data = await CacheService.runSingleflight(cacheKey, false, async () => {
        const pages = await Promise.all(CATEGORIES.map((category) => (
          this.trades.listMonth(userId, category, range.fromDate, range.toDate)
        )));
        return {
          transactions: pages.flatMap((page) => page.transactions),
          truncated: pages.some((page) => page.truncated),
        };
      });
    } catch (error) {
      if (!allowsMobileYxtStaleFallback(error)) throw error;
      const fallback = await fallbackOnRefreshFailure<CachedTransactions>({
        forceRefresh,
        cacheKey,
        error,
        source: 'mobile-yxt-trades',
        studentId,
      });
      if (fallback) return { data: fallback.data, meta: fallback._meta };
      throw error;
    }

    await CacheService.set(cacheKey, data, config.cacheTtl.ecard, 'mobile-yxt');
    await CacheService.enforcePrefixLimit(
      mobileYxtTransactionCachePrefix(userId),
      MOBILE_YXT_TRANSACTION_CACHE_LIMIT,
    );
    return { data, meta: { cached: false, source: 'mobile-yxt' } };
  }
}

const defaultECardOverviewService = new ECardOverviewService();
