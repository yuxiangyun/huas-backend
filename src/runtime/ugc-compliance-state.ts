/**
 * [INPUT]: 依赖 config.dbPath/disableUgc、node:fs/path 与北京时间工具
 * [OUTPUT]: 对外提供 ugcComplianceState，支持 normal/compliance 模式、分域纯文本 mock、文件持久化与热更新读取
 * [POS]: runtime 的 UGC 合规运行态源，被 routes/index.ts 读、routes/admin 写，不承载业务事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../config';
import { beijingIsoString } from '../utils/time';

interface StoredUgcComplianceState {
  mode: 'normal' | 'compliance';
  discoverMockText: string;
  treeholeMockText: string;
  updatedAt: string;
  updatedBy: string;
}

export interface UgcComplianceStatus extends StoredUgcComplianceState {
  disabled: boolean;
  stateFile: string;
}

const STATE_FILE = process.env.UGC_COMPLIANCE_STATE_FILE?.trim()
  || join(dirname(config.dbPath), 'ugc-compliance-state.json');
const MAX_MOCK_TEXT_LENGTH = 400;

function sanitizeMockText(value: unknown, fallback = '') {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') return fallback;
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, MAX_MOCK_TEXT_LENGTH);
}

let cachedState: StoredUgcComplianceState = {
  mode: config.disableUgc ? 'compliance' : 'normal',
  discoverMockText: '',
  treeholeMockText: '',
  updatedAt: beijingIsoString(),
  updatedBy: 'env:DISABLE_UGC',
};
let cachedMtimeMs = -1;

function readStoredState(): StoredUgcComplianceState | null {
  if (!existsSync(STATE_FILE)) return null;

  const fileStat = statSync(STATE_FILE);
  if (fileStat.mtimeMs === cachedMtimeMs) return cachedState;

  const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Partial<StoredUgcComplianceState>;
  const mode = parsed.mode === 'normal' || parsed.mode === 'compliance'
    ? parsed.mode
    : cachedState.mode;

  cachedMtimeMs = fileStat.mtimeMs;
  cachedState = {
    mode,
    discoverMockText: sanitizeMockText(parsed.discoverMockText),
    treeholeMockText: sanitizeMockText(parsed.treeholeMockText),
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : beijingIsoString(),
    updatedBy: typeof parsed.updatedBy === 'string' ? parsed.updatedBy : 'file',
  };
  return cachedState;
}

function currentState(): StoredUgcComplianceState {
  try {
    return readStoredState() || cachedState;
  } catch {
    return cachedState;
  }
}

function writeState(nextState: StoredUgcComplianceState) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  const tempFile = `${STATE_FILE}.${process.pid}.tmp`;
  writeFileSync(tempFile, `${JSON.stringify(nextState, null, 2)}\n`);
  renameSync(tempFile, STATE_FILE);

  cachedState = nextState;
  cachedMtimeMs = statSync(STATE_FILE).mtimeMs;
}

export const ugcComplianceState = {
  status(): UgcComplianceStatus {
    const state = currentState();
    return {
      ...state,
      disabled: state.mode === 'compliance',
      stateFile: STATE_FILE,
    };
  },

  configure(
    next: {
      mode?: 'normal' | 'compliance';
      discoverMockText?: string;
      treeholeMockText?: string;
    },
    updatedBy: string
  ): UgcComplianceStatus {
    const current = currentState();
    const mode = next.mode || current.mode;

    writeState({
      mode,
      discoverMockText: sanitizeMockText(next.discoverMockText, current.discoverMockText),
      treeholeMockText: sanitizeMockText(next.treeholeMockText, current.treeholeMockText),
      updatedAt: beijingIsoString(),
      updatedBy,
    });
    return this.status();
  },
};
