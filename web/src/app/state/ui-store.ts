/**
 * [INPUT]: 依赖 Zustand 创建普通用户界面状态，接收主 Tab 与各业务弹层的开关动作
 * [OUTPUT]: 对外提供 useUiStore，以树洞作为初始 Tab 并集中管理发布、头像弹层状态
 * [POS]: app/state 的瞬时 UI 状态容器，由各路由页面同步当前 Tab，不持久化业务数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { create } from 'zustand';

export type AppTab = 'discover' | 'treehole' | 'me';

interface UiStore {
  activeTab: AppTab;
  discoverComposeSheetOpen: boolean;
  treeholeComposeSheetOpen: boolean;
  treeholeAvatarSheetOpen: boolean;
  setActiveTab: (tab: AppTab) => void;
  openDiscoverComposeSheet: () => void;
  closeDiscoverComposeSheet: () => void;
  openTreeholeComposeSheet: () => void;
  closeTreeholeComposeSheet: () => void;
  openTreeholeAvatarSheet: () => void;
  closeTreeholeAvatarSheet: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  activeTab: 'treehole',
  discoverComposeSheetOpen: false,
  treeholeComposeSheetOpen: false,
  treeholeAvatarSheetOpen: false,
  setActiveTab: (tab) => set({ activeTab: tab }),
  openDiscoverComposeSheet: () => set({ discoverComposeSheetOpen: true }),
  closeDiscoverComposeSheet: () => set({ discoverComposeSheetOpen: false }),
  openTreeholeComposeSheet: () => set({ treeholeComposeSheetOpen: true }),
  closeTreeholeComposeSheet: () => set({ treeholeComposeSheetOpen: false }),
  openTreeholeAvatarSheet: () => set({ treeholeAvatarSheetOpen: true }),
  closeTreeholeAvatarSheet: () => set({ treeholeAvatarSheetOpen: false }),
}));
