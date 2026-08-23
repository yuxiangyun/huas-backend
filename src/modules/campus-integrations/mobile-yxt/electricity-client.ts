/**
 * [INPUT]: 依赖 MobileYxtSessionExecutor、electric config/account 端点、Electricity parser 与统一低敏感日志
 * [OUTPUT]: 对外提供 MobileYxtElectricityClient.getAccount，先读 config 再以位置 code 查 account，并记录低敏感合同诊断
 * [POS]: mobile-yxt 的电费只读 HTTP 端口；复刻官方 config→account 调用链，不存在 bind、usageDetails、pay 或水费路径
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { URLS } from '../endpoints';
import { config } from '../../../config';
import { Logger } from '../../../utils/logger';
import {
  mobileYxtSessionExecutor,
  type MobileYxtSessionExecutor,
} from './session-executor';
import {
  parseElectricityAccount,
  parseElectricityConfig,
  type ElectricityAccount,
} from './electricity-parser';
import { assertMobileYxtHttpSuccess, MobileYxtError } from './mobile-yxt-errors';

function valueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function envelopeRecord(body: unknown): Record<string, unknown> | null {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null;
}

function safeStructuralNames(values: unknown[]): string[] {
  const sensitiveNames = /^(authorization|cookie|jsessionid|accesstoken|refreshtoken|portaljwt|tid)$/i;
  return values
    .filter((value): value is string => (
      typeof value === 'string'
      && /^[A-Za-z0-9_-]{1,64}$/.test(value)
      && !sensitiveNames.test(value)
    ))
    .sort()
    .slice(0, 24);
}

function responseDiagnostics(result: { response: Response; body: unknown }, includeTemplates: boolean): string {
  const envelope = envelopeRecord(result.body);
  const data = envelope?.resultData;
  const dataRecord = envelopeRecord(data);
  const templates = includeTemplates && Array.isArray(dataRecord?.templateList)
    ? dataRecord.templateList
      .map((item) => envelopeRecord(item)?.code)
    : [];
  return [
    `status=${result.response.status}`,
    `contentType=${result.response.headers.get('content-type') || 'missing'}`,
    `topLevelKeys=${safeStructuralNames(envelope ? Object.keys(envelope) : []).join(',') || 'none'}`,
    `resultDataType=${valueType(data)}`,
    `templateCodes=${safeStructuralNames(templates).join(',') || 'none'}`,
  ].join(' ');
}

export class MobileYxtElectricityClient {
  constructor(private readonly executor: MobileYxtSessionExecutor = mobileYxtSessionExecutor) {}

  async getAccount(userId: number): Promise<ElectricityAccount> {
    const deadlineAt = Date.now() + config.timeout.mobileYxtTotalBudget;
    let configResult: Awaited<ReturnType<MobileYxtSessionExecutor['post']>> | null = null;
    let accountResult: Awaited<ReturnType<MobileYxtSessionExecutor['post']>> | null = null;
    try {
      configResult = await this.executor.post(
        userId,
        URLS.mobileYxtElectricityConfig,
        { utilityType: 'electric' },
        deadlineAt,
      );
      assertMobileYxtHttpSuccess(configResult.response.status, 'ELECTRICITY_CONFIG');
      const parsedConfig = parseElectricityConfig(configResult.body);
      accountResult = await this.executor.post(
        userId,
        URLS.mobileYxtElectricityAccount,
        parsedConfig.accountQuery,
        deadlineAt,
      );
      assertMobileYxtHttpSuccess(accountResult.response.status, 'ELECTRICITY_ACCOUNT');
      return parseElectricityAccount(parsedConfig, accountResult.body);
    } catch (error) {
      if (error instanceof MobileYxtError) {
        const result = error.operation?.includes('CONFIG') || !accountResult
          ? configResult
          : accountResult;
        if (result) {
          Logger.warn(
            'MobileYxt',
            'electricity response rejected',
            `operation=${error.operation || 'ELECTRICITY_UNKNOWN'} stage=${error.stage || error.kind} ${responseDiagnostics(result, result === accountResult)}`,
          );
        }
      }
      throw error;
    }
  }
}
