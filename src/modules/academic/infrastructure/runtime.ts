/**
 * [INPUT]: 依赖 AcademicRuntimePorts、SchoolAccess 具名读取 与既有 cache/fallback 端口实现
 * [OUTPUT]: 对 composition root 提供 defaultAcademicRuntimePorts 默认依赖集合
 * [POS]: academic/infrastructure 的默认运行时装配数据，不被 application 反向依赖
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { schoolAccess } from '../../campus-integrations/school-access/school-access';
import type { AcademicRuntimePorts } from '../domain/ports';
import { academicCache, academicRefreshFallback } from './cache-store';

export const defaultAcademicRuntimePorts: AcademicRuntimePorts = {
  readJwSchedule: (userId, input) => schoolAccess.execute(userId, { name: 'jw.schedule', input }),
  readPortalSchedule: (userId, input) => schoolAccess.execute(userId, { name: 'portal.schedule', input }),
  cache: academicCache,
  refreshFallback: academicRefreshFallback,
};
