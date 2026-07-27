/**
 * [INPUT]: 依赖 Academic canonical composition 与 services/academic、services/portal 旧兼容路径
 * [OUTPUT]: 验证课表、成绩、评教、空教室旧类名均引用 canonical 运行时对象
 * [POS]: tests 的 Academic 迁移兼容性守门，防止旧 Facade 重新长出双份实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import {
  PortalScheduleService as CanonicalPortalScheduleService,
  ScheduleFacade as CanonicalScheduleFacade,
  ScheduleService as CanonicalScheduleService,
} from '../src/modules/academic/schedule';
import { GradeService as CanonicalGradeService } from '../src/modules/academic/grade';
import { EvaluationService as CanonicalEvaluationService } from '../src/modules/academic/evaluation';
import { ClassroomFreeService as CanonicalClassroomFreeService } from '../src/modules/academic/classroom';
import { ScheduleService } from '../src/services/academic/schedule-service';
import { ScheduleFacade } from '../src/services/academic/schedule-facade';
import { PortalScheduleService } from '../src/services/portal/portal-schedule-service';
import { GradeService } from '../src/services/academic/grade-service';
import { EvaluationService } from '../src/services/academic/evaluation-service';
import { ClassroomFreeService } from '../src/services/academic/classroom-free-service';

describe('Academic compatibility facades', () => {
  it('旧服务路径只读再导出 canonical 静态类', () => {
    expect(ScheduleService).toBe(CanonicalScheduleService);
    expect(ScheduleFacade).toBe(CanonicalScheduleFacade);
    expect(PortalScheduleService).toBe(CanonicalPortalScheduleService);
    expect(GradeService).toBe(CanonicalGradeService);
    expect(EvaluationService).toBe(CanonicalEvaluationService);
    expect(ClassroomFreeService).toBe(CanonicalClassroomFreeService);
  });
});
