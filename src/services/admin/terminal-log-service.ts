/**
 * [INPUT]: 依赖 modules/operations/infrastructure 的 canonical 终端日志服务
 * [OUTPUT]: 继续导出 TerminalLogService 旧类名与路径
 * [POS]: services/admin 的单向兼容 Facade；日志扫描实现已迁入 Operations
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { TerminalLogService } from '../../modules/operations/infrastructure/terminal-log-service';
