/**
 * [INPUT]: 依赖通知列表快照 total 与轮询摘要 total
 * [OUTPUT]: 对外提供 shouldReconcileNotificationSnapshot 纯函数
 * [POS]: entities/notifications 的删除感知规则，用总量差异触发快照校准并补足只追加 ID 高水位协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export function shouldReconcileNotificationSnapshot(
  snapshotTotal: number | null,
  summaryTotal: number | null,
) {
  return snapshotTotal !== null
    && summaryTotal !== null
    && snapshotTotal !== summaryTotal;
}
