/**
 * [INPUT]: 依赖 mobile-yxt 交易 resultData、调用查询时已知的交易分类与 Asia/Shanghai 时间合同
 * [OUTPUT]: 对外提供交易 DTO、严格分页解析、近 24 个北京时间自然月边界、整数分转换、电费子类识别与原始有符号金额汇总
 * [POS]: mobile-yxt 的交易纯转换层，只接受已识别列表/空态并原样保留退款标记；totals 不宣称退款会计语义
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import { requireMobileYxtResultData } from './response-parser';
import { mobileYxtProtocolFailure } from './mobile-yxt-errors';

export type ECardTransactionCategory = 'consumption' | 'recharge' | 'subsidy';

export interface ECardTransaction {
  summary: string;
  merchantName: string;
  occurredAt: string;
  amountCents: number;
  category: ECardTransactionCategory;
  subcategory?: 'electricity';
  refundFlag: string | number | boolean | null;
}

export interface ECardTotals {
  consumptionCents: number;
  rechargeCents: number;
  subsidyCents: number;
  electricityCents: number;
}

export interface ParsedTradePage {
  transactions: ECardTransaction[];
  hasMore: boolean | null;
}

export interface BeijingMonthRange {
  month: string;
  fromDate: string;
  toDate: string;
}

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const TRADE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;
export const MOBILE_YXT_QUERY_MONTHS = 24;

export function parseDecimalCents(value: unknown, field = 'amount'): number {
  const raw = String(value ?? '').trim();
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) throw mobileYxtProtocolFailure(field, 'numeric_format_invalid');
  const sign = match[1] === '-' ? -1 : 1;
  const cents = Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw mobileYxtProtocolFailure(field, 'numeric_format_invalid');
  return sign * cents;
}

export function resolveBeijingMonth(month?: string, now = new Date()): BeijingMonthRange {
  const currentMonth = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).format(now);
  const normalized = month?.trim() || currentMonth;
  const match = MONTH_PATTERN.exec(normalized);
  if (!match) throw new AppError(ErrorCode.PARAM_ERROR, 'month 必须严格匹配 YYYY-MM');

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const [currentYear, currentMonthNumber] = currentMonth.split('-').map(Number);
  const requestedOrdinal = year * 12 + monthNumber;
  const currentOrdinal = currentYear * 12 + currentMonthNumber;
  if (
    requestedOrdinal > currentOrdinal
    || requestedOrdinal < currentOrdinal - (MOBILE_YXT_QUERY_MONTHS - 1)
  ) {
    throw new AppError(
      ErrorCode.PARAM_ERROR,
      `month 仅允许当前月及此前 ${MOBILE_YXT_QUERY_MONTHS - 1} 个自然月`,
    );
  }
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    month: normalized,
    fromDate: `${normalized}-01`,
    toDate: `${normalized}-${String(lastDay).padStart(2, '0')}`,
  };
}

function parseOccurredAt(value: unknown): string {
  const raw = String(value ?? '').trim();
  const match = TRADE_TIME_PATTERN.exec(raw);
  if (!match) throw mobileYxtProtocolFailure();
  const [, year, month, day, hour, minute, second] = match;
  const instant = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`);
  if (Number.isNaN(instant.getTime())) throw mobileYxtProtocolFailure();
  const rendered = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
  if (rendered !== `${year}-${month}-${day}, ${hour}:${minute}:${second}`) {
    throw mobileYxtProtocolFailure();
  }
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`;
}

function extractList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') throw mobileYxtProtocolFailure();
  const record = data as Record<string, unknown>;
  for (const key of ['records', 'list', 'dataList', 'content', 'rows']) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  throw mobileYxtProtocolFailure();
}

function readFiniteNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function parseHasMore(data: unknown, pageNo: number): boolean | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (typeof record.hasNext === 'boolean') return record.hasNext;
  const totalPages = readFiniteNumber(record, ['totalPages', 'totalPage', 'pages', 'pageCount']);
  if (totalPages !== null) return pageNo + 1 < totalPages;
  return null;
}

export function parseTradePage(
  body: unknown,
  category: ECardTransactionCategory,
  pageNo: number,
): ParsedTradePage {
  const data = requireMobileYxtResultData(body, 'TRADE_LIST');
  const transactions = extractList(data).map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw mobileYxtProtocolFailure();
    }
    const raw = item as Record<string, unknown>;
    const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
    const merchantName = typeof raw.merchantName === 'string' ? raw.merchantName.trim() : '';
    if (
      !summary
      || !merchantName
      || !Object.prototype.hasOwnProperty.call(raw, 'date')
      || !Object.prototype.hasOwnProperty.call(raw, 'amt')
      || !Object.prototype.hasOwnProperty.call(raw, 'isRefund')
    ) throw mobileYxtProtocolFailure();
    const refundFlag = raw.isRefund;
    if (
      refundFlag !== null
      && typeof refundFlag !== 'string'
      && typeof refundFlag !== 'number'
      && typeof refundFlag !== 'boolean'
    ) throw mobileYxtProtocolFailure();
    const transaction: ECardTransaction = {
      summary,
      merchantName,
      occurredAt: parseOccurredAt(raw.date),
      amountCents: parseDecimalCents(raw.amt),
      category,
      refundFlag,
    };
    if (category === 'consumption' && summary.startsWith('缴电费_')) {
      transaction.subcategory = 'electricity';
    }
    return transaction;
  });
  return { transactions, hasMore: parseHasMore(data, pageNo) };
}

export function summarizeTransactions(transactions: ECardTransaction[]): ECardTotals {
  const totals: ECardTotals = {
    consumptionCents: 0,
    rechargeCents: 0,
    subsidyCents: 0,
    electricityCents: 0,
  };
  // 只汇总上游返回的有符号金额；refundFlag 原样投影，未有真实 fixture 前不做退款冲正推断。
  for (const transaction of transactions) {
    if (transaction.category === 'consumption') {
      totals.consumptionCents += transaction.amountCents;
      if (transaction.subcategory === 'electricity') {
        totals.electricityCents += transaction.amountCents;
      }
    } else if (transaction.category === 'recharge') {
      totals.rechargeCents += transaction.amountCents;
    } else {
      totals.subsidyCents += transaction.amountCents;
    }
  }
  return totals;
}
