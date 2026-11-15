import { create } from 'zustand';

interface AppState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  systemNotification: string | null;
  setSystemNotification: (message: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  systemNotification: null,
  setSystemNotification: (message) => set({ systemNotification: message }),
}));
