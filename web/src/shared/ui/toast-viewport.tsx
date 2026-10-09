/**
 * [INPUT]: 依赖 HeroUI 原生 Toast.Provider 与共用 toast 队列
 * [OUTPUT]: 呈现可关闭、可访问且支持悬停/聚焦暂停的全局动作反馈
 * [POS]: shared/ui 的唯一反馈视口，层级、动效和生命周期由 HeroUI 负责
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Toast } from '@heroui/react/toast';

export function ToastViewport() {
  return <Toast.Provider placement="top end" />;
}
