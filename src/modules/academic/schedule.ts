/**
 * [INPUT]: 依赖课表/策略 application service、文件策略 store、MobileJwScheduleClient、config 与 defaultAcademicRuntimePorts
 * [OUTPUT]: 对外提供兼容静态类 ScheduleService、PortalScheduleService、ScheduleFacade、ScheduleSourcePolicy 及课表类型
 * [POS]: academic 的 Schedule composition root，唯一负责单源读取、三源编排与热策略持久化装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { MobileJwScheduleApplicationService } from './application/mobile-jw-schedule-service';
import { MobileJwScheduleClient } from '../campus-integrations/mobile-jw/schedule-client';
import { ScheduleApplicationService } from './application/schedule-service';
import { PortalScheduleApplicationService } from './application/portal-schedule-service';
import { ScheduleFacadeApplicationService } from './application/schedule-facade';
import { ScheduleSourcePolicyApplicationService } from './application/schedule-source-policy-service';
import { config } from '../../config';
import { defaultAcademicRuntimePorts } from './infrastructure/runtime';
import { FileScheduleSourcePolicyStore } from './infrastructure/file-schedule-source-policy-store';

const scheduleApplication = new ScheduleApplicationService(defaultAcademicRuntimePorts);
const portalScheduleApplication = new PortalScheduleApplicationService(defaultAcademicRuntimePorts);
const scheduleSourcePolicyStore = new FileScheduleSourcePolicyStore(
  config.scheduleSourcePolicy.stateFile,
  config.scheduleSourcePolicy.environmentMode,
);
export const scheduleSourcePolicyApplicationService = new ScheduleSourcePolicyApplicationService(scheduleSourcePolicyStore);
const scheduleFacadeApplication = new ScheduleFacadeApplicationService(
  scheduleApplication,
  portalScheduleApplication,
  scheduleSourcePolicyApplicationService,
  new MobileJwScheduleApplicationService(new MobileJwScheduleClient(), defaultAcademicRuntimePorts),
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
  static getSchedule(...args: Parameters<ScheduleFacadeApplicationService['getSchedule']>) {
    return scheduleFacadeApplication.getSchedule(...args);
  }

  static getJwFirstSchedule(...args: Parameters<ScheduleFacadeApplicationService['getJwFirstSchedule']>) {
    return scheduleFacadeApplication.getJwFirstSchedule(...args);
  }

  static getPortalFirstSchedule(...args: Parameters<ScheduleFacadeApplicationService['getPortalFirstSchedule']>) {
    return scheduleFacadeApplication.getPortalFirstSchedule(...args);
  }
}

export class ScheduleSourcePolicy {
  static status(...args: Parameters<ScheduleSourcePolicyApplicationService['status']>) {
    return scheduleSourcePolicyApplicationService.status(...args);
  }

  static configure(...args: Parameters<ScheduleSourcePolicyApplicationService['configure']>) {
    return scheduleSourcePolicyApplicationService.configure(...args);
  }
}

export type { ScheduleFacadeResult, ScheduleRequestMeta } from './domain/schedule';
export type { ScheduleSourceMode, ScheduleSourcePolicySnapshot } from './domain/schedule-source-policy';
export { isScheduleSourceMode } from './domain/schedule-source-policy';
