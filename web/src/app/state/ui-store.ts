import { create } from 'zustand';

export type AppTab = 'discover' | 'me';

interface UiStore {
  activeTab: AppTab;
  composeSheetOpen: boolean;
  setActiveTab: (tab: AppTab) => void;
  openComposeSheet: () => void;
  closeComposeSheet: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  activeTab: 'discover',
  composeSheetOpen: false,
  setActiveTab: (tab) => set({ activeTab: tab }),
  openComposeSheet: () => set({ composeSheetOpen: true }),
  closeComposeSheet: () => set({ composeSheetOpen: false }),
}));
