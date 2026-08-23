/**
 * [INPUT]: 依赖真实 mobile-yxt electric config.location、account/templateList 合同与共享 envelope/十进制金额解析
 * [OUTPUT]: 对外提供 ParsedElectricityConfig/account query、nullable ElectricityAccount DTO 与两阶段纯解析函数
 * [POS]: mobile-yxt 的电费纯转换层；config 产出房间展示与官方 account 位置参数，account 按 template code 映射事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { requireMobileYxtResultData } from './response-parser';
import { parseDecimalCents } from './trade-parser';
import { mobileYxtProtocolFailure } from './mobile-yxt-errors';

export interface ElectricityAccount {
  roomDisplayName: string;
  cardBalanceCents: number;
  priceCentsPerKwh: number | null;
  remainingKwh: string | null;
  accountStatus: string;
  detailsAvailable: false;
  officialPaymentAvailable: false;
}

export interface ElectricityAccountQuery {
  utilityType: 'electric';
  bigArea: string;
  area: string;
  building: string;
  unit: string;
  level: string;
  room: string;
  subArea: string;
}

export interface ParsedElectricityConfig {
  roomDisplayName: string;
  accountQuery: ElectricityAccountQuery;
}

type TemplateValue = string | null;

function requireRecord(
  value: unknown,
  operation: string,
  stage: 'config_location_invalid' | 'account_invalid' | 'template_list_invalid',
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw mobileYxtProtocolFailure(operation, stage);
  }
  return value as Record<string, unknown>;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function requiredText(value: unknown, operation: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw mobileYxtProtocolFailure(operation, 'required_field_missing');
  return normalized;
}

function locationCode(location: Record<string, unknown>, key: string): string {
  const value = location[key];
  if (typeof value !== 'string') {
    throw mobileYxtProtocolFailure('ELECTRICITY_CONFIG', 'config_location_invalid');
  }
  return value.trim();
}

function parseLocation(configData: unknown): ParsedElectricityConfig {
  const config = requireRecord(configData, 'ELECTRICITY_CONFIG', 'config_location_invalid');
  const location = requireRecord(
    config.location,
    'ELECTRICITY_CONFIG',
    'config_location_invalid',
  );
  const components = [
    location.areaName,
    location.buildingName,
    location.levelName,
    location.roomName,
  ].map(optionalText).filter((value): value is string => value !== null);
  if (components.length === 0) {
    throw mobileYxtProtocolFailure('ELECTRICITY_CONFIG', 'config_location_invalid');
  }
  const accountQuery: ElectricityAccountQuery = {
    utilityType: 'electric',
    bigArea: locationCode(location, 'bigArea'),
    area: locationCode(location, 'area'),
    building: locationCode(location, 'building'),
    unit: locationCode(location, 'unit'),
    level: locationCode(location, 'level'),
    room: locationCode(location, 'room'),
    subArea: locationCode(location, 'subArea'),
  };
  if (!accountQuery.room) {
    throw mobileYxtProtocolFailure('ELECTRICITY_CONFIG', 'config_location_invalid');
  }
  return { roomDisplayName: components.join(' '), accountQuery };
}

function indexTemplates(account: Record<string, unknown>): Map<string, TemplateValue> {
  if (!Array.isArray(account.templateList)) {
    throw mobileYxtProtocolFailure('ELECTRICITY_ACCOUNT', 'template_list_invalid');
  }
  const templates = new Map<string, TemplateValue>();
  for (const item of account.templateList) {
    const template = requireRecord(item, 'ELECTRICITY_ACCOUNT', 'template_list_invalid');
    const code = optionalText(template.code);
    if (!code || (template.value !== null && typeof template.value !== 'string')) {
      throw mobileYxtProtocolFailure('ELECTRICITY_ACCOUNT', 'template_list_invalid');
    }
    const value = template.value as TemplateValue;
    if (templates.has(code) && templates.get(code) !== value) {
      throw mobileYxtProtocolFailure('ELECTRICITY_ACCOUNT', 'contract_drift');
    }
    templates.set(code, value);
  }
  return templates;
}

function requireTemplate(templates: Map<string, TemplateValue>, code: string): TemplateValue {
  if (!templates.has(code)) {
    throw mobileYxtProtocolFailure(`ELECTRICITY_TEMPLATE_${code.toUpperCase()}`, 'required_field_missing');
  }
  return templates.get(code)!;
}

function parseCents(value: string, operation: string): number {
  try {
    return parseDecimalCents(value, operation);
  } catch {
    throw mobileYxtProtocolFailure(operation, 'numeric_format_invalid');
  }
}

function parseCardBalance(account: Record<string, unknown>, templates: Map<string, TemplateValue>): number {
  const primary = optionalText(account.balance);
  const fallback = templates.get('ykt_balance') ?? null;
  if (!primary && !fallback) {
    throw mobileYxtProtocolFailure('ELECTRICITY_CARD_BALANCE', 'required_field_missing');
  }
  const primaryCents = primary ? parseCents(primary, 'ELECTRICITY_CARD_BALANCE') : null;
  const fallbackCents = fallback ? parseCents(fallback, 'ELECTRICITY_YKT_BALANCE') : null;
  if (primaryCents !== null && fallbackCents !== null && primaryCents !== fallbackCents) {
    throw mobileYxtProtocolFailure('ELECTRICITY_CARD_BALANCE', 'contract_drift');
  }
  return primaryCents ?? fallbackCents!;
}

function parseNullablePrice(value: TemplateValue): number | null {
  if (value === null) return null;
  return parseCents(requiredText(value, 'ELECTRICITY_PRICE'), 'ELECTRICITY_PRICE');
}

function parseNullableQuantity(value: TemplateValue): string | null {
  if (value === null) return null;
  const normalized = requiredText(value, 'ELECTRICITY_QUANTITY');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    throw mobileYxtProtocolFailure('ELECTRICITY_QUANTITY', 'numeric_format_invalid');
  }
  return normalized;
}

export function parseElectricityConfig(configBody: unknown): ParsedElectricityConfig {
  return parseLocation(requireMobileYxtResultData(configBody, 'ELECTRICITY_CONFIG'));
}

export function parseElectricityAccount(
  parsedConfig: ParsedElectricityConfig,
  accountBody: unknown,
): ElectricityAccount {
  const accountData = requireMobileYxtResultData(accountBody, 'ELECTRICITY_ACCOUNT');
  const account = requireRecord(accountData, 'ELECTRICITY_ACCOUNT', 'account_invalid');
  const templates = indexTemplates(account);

  return {
    roomDisplayName: parsedConfig.roomDisplayName,
    cardBalanceCents: parseCardBalance(account, templates),
    priceCentsPerKwh: parseNullablePrice(requireTemplate(templates, 'price')),
    remainingKwh: parseNullableQuantity(requireTemplate(templates, 'quantity')),
    accountStatus: requiredText(account.accStatusName, 'ELECTRICITY_ACCOUNT_STATUS'),
    detailsAvailable: false,
    officialPaymentAvailable: false,
  };
}
