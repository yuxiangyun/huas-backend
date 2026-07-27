/**
 * [INPUT]: 依赖 AcademicRuntimePorts、campus upstream 与既有 cache/fallback 端口实现
 * [OUTPUT]: 对 composition root 提供 defaultAcademicRuntimePorts 默认依赖集合
 * [POS]: academic/infrastructure 的默认运行时装配数据，不被 application 反向依赖
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { AcademicRuntimePorts } from '../domain/ports';
import { academicUpstream } from './campus-system';
import { academicCache, academicRefreshFallback } from './cache-store';

export const defaultAcademicRuntimePorts: AcademicRuntimePorts = {
  upstream: academicUpstream,
  cache: academicCache,
  refreshFallback: academicRefreshFallback,
};
