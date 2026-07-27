/**
 * [INPUT]: 依赖 Campus Integrations canonical 导出与 auth/core/parsers/services 旧 Facade
 * [OUTPUT]: 验证旧类名、函数、聚合导出和路径严格指向同一实现
 * [POS]: tests 的校园集成迁移兼容性护栏，阻止旧目录重新生长第二份实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import { AuthEngine as LegacyAuthEngine } from '../src/auth/auth-engine';
import { CredentialManager as LegacyCredentialManager } from '../src/auth/credential-manager';
import { TicketExchanger as LegacyTicketExchanger } from '../src/auth/ticket-exchanger';
import { HttpClient as LegacyHttpClient } from '../src/core/http-client';
import { retryAsync as legacyRetryAsync } from '../src/core/retry';
import { URLS as legacyUrls } from '../src/core/url-config';
import * as legacyParsers from '../src/parsers';
import { EvaluationParser as LegacyEvaluationParser } from '../src/parsers/academic/evaluation-parser';
import { upstream as legacyUpstream } from '../src/services/infra/upstream';
import { ECardService as LegacyECardService } from '../src/services/portal/ecard-service';
import { UserService as LegacyUserService } from '../src/services/portal/user-service';
import { AuthEngine } from '../src/modules/campus-integrations/cas/auth-engine';
import { TicketExchanger } from '../src/modules/campus-integrations/cas/ticket-exchanger';
import { CredentialManager } from '../src/modules/campus-integrations/credential-recovery/credential-manager';
import { URLS } from '../src/modules/campus-integrations/endpoints';
import { HttpClient } from '../src/modules/campus-integrations/http/http-client';
import { retryAsync } from '../src/modules/campus-integrations/http/retry';
import { ClassroomFreeParser } from '../src/modules/campus-integrations/jw/parsers/classroom-free-parser';
import { EvaluationParser } from '../src/modules/campus-integrations/jw/parsers/evaluation-parser';
import { GradeParser } from '../src/modules/campus-integrations/jw/parsers/grade-parser';
import { ScheduleParser } from '../src/modules/campus-integrations/jw/parsers/schedule-parser';
import { ECardService } from '../src/modules/campus-integrations/portal/ecard-service';
import { ECardParser } from '../src/modules/campus-integrations/portal/parsers/ecard-parser';
import { PortalScheduleParser } from '../src/modules/campus-integrations/portal/parsers/portal-schedule-parser';
import { UserParser } from '../src/modules/campus-integrations/portal/parsers/user-parser';
import { UserService } from '../src/modules/campus-integrations/portal/user-service';
import { upstream } from '../src/modules/campus-integrations/upstream/upstream';

describe('Campus Integrations compatibility facades', () => {
  it('认证、HTTP、上游与 Portal 服务旧路径复用 canonical 实现', () => {
    expect(LegacyAuthEngine).toBe(AuthEngine);
    expect(LegacyTicketExchanger).toBe(TicketExchanger);
    expect(LegacyCredentialManager).toBe(CredentialManager);
    expect(LegacyHttpClient).toBe(HttpClient);
    expect(legacyRetryAsync).toBe(retryAsync);
    expect(legacyUrls).toBe(URLS);
    expect(legacyUpstream).toBe(upstream);
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
