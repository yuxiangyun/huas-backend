/**
 * [INPUT]: 依赖 campus-integrations/jw/parsers 的 canonical 评教解析器
 * [OUTPUT]: 兼容再导出 EvaluationParser、辅助函数、常量与公开类型
 * [POS]: parsers/academic 的只读迁移 Facade，保持 Academic 服务旧导入路径稳定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export * from '../../modules/campus-integrations/jw/parsers/evaluation-parser';
