/**
 * [INPUT]: 依赖 Zustand 的稳定动作选择器与 HeroUI Toast 队列
 * [OUTPUT]: 保留全局 pushToast、dismissToast、clearToasts API，将显示、计时与焦点交给原生 Toast
 * [POS]: app/state 的反馈兼容边界，不保存第二份消息队列或重复管理生命周期
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { toast } from '@heroui/react/toast';
import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info';
export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  variant: ToastVariant;
}
interface ToastStore {
  pushToast: (input: Omit<ToastItem, 'id'>) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastStore>(() => ({
  pushToast: ({ title, message, variant }) => toast(title, {
    description: message,
    variant: variant === 'error' ? 'danger' : variant === 'info' ? 'accent' : 'success',
    timeout: 3200,
  }),
  dismissToast: (id) => toast.close(id),
  clearToasts: () => toast.clear(),
}));
