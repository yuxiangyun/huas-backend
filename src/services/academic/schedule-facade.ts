/**
 * [INPUT]: 依赖 modules/academic/application 的 canonical 双源课表编排
 * [OUTPUT]: 兼容再导出 ScheduleFacade、ScheduleFacadeResult 与 ScheduleRequestMeta
 * [POS]: services/academic 的课表兼容 Facade，供旧路由与 Calendar 在迁移期稳定消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export {
  ScheduleFacade,
  type ScheduleFacadeResult,
  type ScheduleRequestMeta,
} from '../../modules/academic/schedule';
