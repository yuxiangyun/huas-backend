/**
 * [INPUT]: 依赖由外层 composition 注入的登录结果观测函数
 * [OUTPUT]: 对外提供 configureLoginAnalyticsRecorder 与 recordLoginAnalytics
 * [POS]: identity/http 的观测端口，避免 Identity 反向依赖 Operations analytics 实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export type LoginAnalyticsRecorder = (platformHeader: string | undefined, success: boolean) => void;

let recorder: LoginAnalyticsRecorder = () => undefined;

export function configureLoginAnalyticsRecorder(next: LoginAnalyticsRecorder) {
  recorder = next;
}

export function recordLoginAnalytics(platformHeader: string | undefined, success: boolean) {
  recorder(platformHeader, success);
}
