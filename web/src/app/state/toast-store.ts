/**
 * [INPUT]: 依赖 Zustand、浏览器定时器与随机 ID 能力
 * [OUTPUT]: 对外提供全局 Toast 类型和可自动过期的 useToastStore
 * [POS]: app/state 的瞬时反馈事实源，不保存业务数据或跨会话状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  variant: ToastVariant;
}

interface ToastStore {
  items: ToastItem[];
  pushToast: (input: Omit<ToastItem, 'id'>) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

const TOAST_LIFETIME_MS = 3200;

export const useToastStore = create<ToastStore>((set, get) => ({
  items: [],
  pushToast: (input) => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const nextToast: ToastItem = { id, ...input };
    set((state) => ({ items: [...state.items, nextToast] }));

    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        get().dismissToast(id);
      }, TOAST_LIFETIME_MS);
    }

    return id;
  },
  dismissToast: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),
  clearToasts: () => set({ items: [] }),
}));
