import { create } from 'zustand';

export type AppTab = 'discover' | 'treehole' | 'me';

interface UiStore {
  activeTab: AppTab;
  discoverComposeSheetOpen: boolean;
  treeholeComposeSheetOpen: boolean;
  setActiveTab: (tab: AppTab) => void;
  openDiscoverComposeSheet: () => void;
  closeDiscoverComposeSheet: () => void;
  openTreeholeComposeSheet: () => void;
  closeTreeholeComposeSheet: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  activeTab: 'discover',
  discoverComposeSheetOpen: false,
  treeholeComposeSheetOpen: false,
  setActiveTab: (tab) => set({ activeTab: tab }),
  openDiscoverComposeSheet: () => set({ discoverComposeSheetOpen: true }),
  closeDiscoverComposeSheet: () => set({ discoverComposeSheetOpen: false }),
  openTreeholeComposeSheet: () => set({ treeholeComposeSheetOpen: true }),
  closeTreeholeComposeSheet: () => set({ treeholeComposeSheetOpen: false }),
}));
