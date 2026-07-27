/**
 * [INPUT]: 依赖三个 Schedule application service 与 defaultAcademicRuntimePorts 默认适配器
 * [OUTPUT]: 对外提供兼容静态类 ScheduleService、PortalScheduleService、ScheduleFacade 及课表类型
 * [POS]: academic 的 Schedule composition root，唯一负责 application 与 infrastructure 装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { ScheduleApplicationService } from './application/schedule-service';
import { PortalScheduleApplicationService } from './application/portal-schedule-service';
import { ScheduleFacadeApplicationService } from './application/schedule-facade';
import { defaultAcademicRuntimePorts } from './infrastructure/runtime';

const scheduleApplication = new ScheduleApplicationService(defaultAcademicRuntimePorts);
const portalScheduleApplication = new PortalScheduleApplicationService(defaultAcademicRuntimePorts);
const scheduleFacadeApplication = new ScheduleFacadeApplicationService(
  scheduleApplication,
  portalScheduleApplication,
);

export class ScheduleService {
  static getSchedule(...args: Parameters<ScheduleApplicationService['getSchedule']>) {
    return scheduleApplication.getSchedule(...args);
  }
}

export class PortalScheduleService {
  static getSchedule(...args: Parameters<PortalScheduleApplicationService['getSchedule']>) {
    return portalScheduleApplication.getSchedule(...args);
  }
}

export class ScheduleFacade {
  static getJwFirstSchedule(...args: Parameters<ScheduleFacadeApplicationService['getJwFirstSchedule']>) {
    return scheduleFacadeApplication.getJwFirstSchedule(...args);
  }

  static getPortalFirstSchedule(...args: Parameters<ScheduleFacadeApplicationService['getPortalFirstSchedule']>) {
    return scheduleFacadeApplication.getPortalFirstSchedule(...args);
  }
}

export type { ScheduleFacadeResult, ScheduleRequestMeta } from './domain/schedule';
