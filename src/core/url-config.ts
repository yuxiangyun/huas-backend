/**
 * [INPUT]: 依赖 campus-integrations 的 canonical 学校端点表
 * [OUTPUT]: 兼容再导出 URLS 常量
 * [POS]: core 的只读迁移 Facade，保持旧 URL 配置路径稳定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { URLS } from '../modules/campus-integrations/endpoints';
