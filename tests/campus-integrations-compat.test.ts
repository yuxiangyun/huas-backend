/**
 * [INPUT]: 依赖 Campus Integrations canonical 导出与保留的 parsers/services Facade
 * [OUTPUT]: 验证保留兼容路径引用一致，已移除认证与任意上游回调入口不再复生
 * [POS]: tests 的校园集成迁移兼容性护栏，阻止旧目录重新生长第二份实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';
import * as legacyParsers from '../src/parsers';
import { EvaluationParser as LegacyEvaluationParser } from '../src/parsers/academic/evaluation-parser';
import { ECardService as LegacyECardService } from '../src/services/portal/ecard-service';
import { UserService as LegacyUserService } from '../src/services/portal/user-service';
import { ClassroomFreeParser } from '../src/modules/campus-integrations/jw/parsers/classroom-free-parser';
import { EvaluationParser } from '../src/modules/campus-integrations/jw/parsers/evaluation-parser';
import { GradeParser } from '../src/modules/campus-integrations/jw/parsers/grade-parser';
import { ScheduleParser } from '../src/modules/campus-integrations/jw/parsers/schedule-parser';
import { ECardService } from '../src/modules/campus-integrations/portal/ecard-service';
import { ECardParser } from '../src/modules/campus-integrations/portal/parsers/ecard-parser';
import { PortalScheduleParser } from '../src/modules/campus-integrations/portal/parsers/portal-schedule-parser';
import { UserParser } from '../src/modules/campus-integrations/portal/parsers/user-parser';
import { UserService } from '../src/modules/campus-integrations/portal/user-service';

describe('Campus Integrations compatibility facades', () => {
  it('已删除的认证与任意上游入口不作为兼容 API 复生', () => {
    for (const path of ['auth/auth-engine.ts', 'auth/credential-manager.ts', 'auth/ticket-exchanger.ts',
      'core/http-client.ts', 'core/retry.ts', 'core/url-config.ts', 'services/infra/upstream.ts',
      'modules/campus-integrations/credential-recovery', 'modules/campus-integrations/upstream']) {
      expect(existsSync(new URL(`../src/${path}`, import.meta.url))).toBe(false);
    }
  });
  it('Portal 服务旧路径复用 canonical 实现', () => {
    expect(LegacyECardService).toBe(ECardService);
    expect(LegacyUserService).toBe(UserService);
  });

  it('parser 聚合出口与旧细分路径复用 canonical 实现', () => {
    expect(legacyParsers.ScheduleParser).toBe(ScheduleParser);
    expect(legacyParsers.GradeParser).toBe(GradeParser);
    expect(legacyParsers.ClassroomFreeParser).toBe(ClassroomFreeParser);
    expect(legacyParsers.ECardParser).toBe(ECardParser);
    expect(legacyParsers.UserParser).toBe(UserParser);
    expect(legacyParsers.PortalScheduleParser).toBe(PortalScheduleParser);
    expect(LegacyEvaluationParser).toBe(EvaluationParser);
  });
});
