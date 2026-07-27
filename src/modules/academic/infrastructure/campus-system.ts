/**
 * [INPUT]: 依赖 domain AcademicUpstream 与 Campus Integrations canonical upstream
 * [OUTPUT]: 对 Academic composition 提供 academicUpstream 端口实现
 * [POS]: academic/infrastructure 的校园执行适配器，禁止用例层回流依赖旧 auth/core/services Facade
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { AcademicUpstream } from '../domain/ports';
import { upstream } from '../../campus-integrations/upstream/upstream';

export const academicUpstream: AcademicUpstream = upstream;
