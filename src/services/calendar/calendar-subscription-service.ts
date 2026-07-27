/**
 * [INPUT]: 依赖 modules/calendar/calendar canonical 公开 API
 * [OUTPUT]: 继续提供旧订阅用户、当前周课表、ICS、URL、响应头与节次导出
 * [POS]: services/calendar 的单向兼容 Facade，不再承载 Calendar 业务实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export * from '../../modules/calendar/calendar';
