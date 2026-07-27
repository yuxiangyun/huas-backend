/**
 * [INPUT]: 依赖 modules/calendar/infrastructure 的 canonical HMAC 签名 API
 * [OUTPUT]: 继续提供 generateCalendarSignature() 与 verifyCalendarSignature() 旧导出
 * [POS]: auth 的单向日历签名兼容 Facade，不再承载签名实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export {
  generateCalendarSignature,
  verifyCalendarSignature,
} from '../modules/calendar/infrastructure/hmac-calendar-signature';
