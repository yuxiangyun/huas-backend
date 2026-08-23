/**
 * [INPUT]: 依赖 MobileYxtSessionExecutor、tradeList 端点、交易分页解析与调用方限定的单月日期范围
 * [OUTPUT]: 对外提供 MobileYxtTradeClient，分别按消费/充值/补助执行字符串 pageSize、零基 pageNo 的有界分页读取
 * [POS]: mobile-yxt 的交易 HTTP 端口，分类事实来自请求 tradeType，达到最大页数显式返回 truncated
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { URLS } from '../endpoints';
import { config } from '../../../config';
import {
  mobileYxtSessionExecutor,
  type MobileYxtSessionExecutor,
} from './session-executor';
import {
  parseTradePage,
  type ECardTransaction,
  type ECardTransactionCategory,
} from './trade-parser';
import { assertMobileYxtHttpSuccess } from './mobile-yxt-errors';

const PAGE_SIZE = 30;
export const MAX_TRADE_PAGES = 20;

const TRADE_TYPES: Record<ECardTransactionCategory, string> = {
  consumption: '1',
  recharge: '2',
  subsidy: '3',
};

export interface MonthTransactions {
  transactions: ECardTransaction[];
  truncated: boolean;
}

export class MobileYxtTradeClient {
  constructor(private readonly executor: MobileYxtSessionExecutor = mobileYxtSessionExecutor) {}

  async listMonth(
    userId: number,
    category: ECardTransactionCategory,
    fromDate: string,
    toDate: string,
  ): Promise<MonthTransactions> {
    const transactions: ECardTransaction[] = [];
    const deadlineAt = Date.now() + config.timeout.mobileYxtTotalBudget;
    for (let pageNo = 0; pageNo < MAX_TRADE_PAGES; pageNo += 1) {
      const result = await this.executor.post(userId, URLS.mobileYxtTradeList, {
        pageSize: String(PAGE_SIZE),
        tradeType: TRADE_TYPES[category],
        fromDate,
        toDate,
        pageNo,
      }, deadlineAt);
      assertMobileYxtHttpSuccess(result.response.status);
      const page = parseTradePage(result.body, category, pageNo);
      transactions.push(...page.transactions);
      const hasMore = page.hasMore ?? page.transactions.length === PAGE_SIZE;
      if (!hasMore) return { transactions, truncated: false };
    }
    return { transactions, truncated: true };
  }
}
