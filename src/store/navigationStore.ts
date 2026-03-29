import { create } from "zustand";

export type NavigationTab = "session" | "summaries" | "settings";

interface NavigationStore {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  activeTab: "session",
  setActiveTab: (activeTab) => set({ activeTab }),
}));
