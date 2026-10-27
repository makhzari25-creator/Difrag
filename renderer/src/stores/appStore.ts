import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile, Product, Session } from '@shared/types';

interface AppState {
  profile: UserProfile | null; userId: number | null;
  setProfile: (p: UserProfile | null) => void; setUserId: (id: number | null) => void;
  logout: () => void; excelVersion: any | null; setExcelVersion: (v: any) => void;
  screen: string; setScreen: (s: string) => void;
  currentSession: Session | null; setCurrentSession: (s: Session | null) => void;
  currentLocation: string | null; setCurrentLocation: (c: string | null) => void;
  currentProduct: Product | null; setCurrentProduct: (p: Product | null) => void;
  physicalCount: number; scannerCount: number; manualCount: number;
  setPhysicalCount: (n: number) => void;
  incrementCount: (method: 'scanner' | 'manual', delta?: number) => void;
  resetCount: () => void;
  checkedLocations: Set<string>;
  toggleCheckedLocation: (code: string) => void; clearCheckedLocations: () => void;
  toasts: { id: string; type: string; message: string }[];
  addToast: (type: string, message: string) => void; removeToast: (id: string) => void;
}

export const useAppStore = create<AppState>()(persist((set, get) => ({
  profile: null, userId: null,
  setProfile: (p) => set({ profile: p }), setUserId: (id) => set({ userId: id }),
  logout: () => set({ profile: null, userId: null, currentSession: null, currentProduct: null }),
  excelVersion: null, setExcelVersion: (v) => set({ excelVersion: v }),
  screen: 'welcome', setScreen: (s) => set({ screen: s }),
  currentSession: null, setCurrentSession: (s) => set({ currentSession: s }),
  currentLocation: null, setCurrentLocation: (c) => set({ currentLocation: c }),
  currentProduct: null, setCurrentProduct: (p) => set({ currentProduct: p }),
  physicalCount: 0, scannerCount: 0, manualCount: 0,
  setPhysicalCount: (n) => set({ physicalCount: n }),
  incrementCount: (method, delta = 1) => {
    const s = get();
    set({
      physicalCount: Math.max(0, s.physicalCount + delta),
      scannerCount: method === 'scanner' ? Math.max(0, s.scannerCount + delta) : s.scannerCount,
      manualCount: method === 'manual' ? Math.max(0, s.manualCount + delta) : s.manualCount
    });
  },
  resetCount: () => set({ physicalCount: 0, scannerCount: 0, manualCount: 0 }),
  checkedLocations: new Set(),
  toggleCheckedLocation: (code) => {
    const s = new Set(get().checkedLocations);
    if (s.has(code)) s.delete(code); else s.add(code);
    set({ checkedLocations: s });
  },
  clearCheckedLocations: () => set({ checkedLocations: new Set() }),
  toasts: [],
  addToast: (type, message) => {
    const id = Math.random().toString(36).slice(2);
    set(st => ({ toasts: [...st.toasts, { id, type, message }] }));
    setTimeout(() => get().removeToast(id), 4000);
  },
  removeToast: (id) => set(st => ({ toasts: st.toasts.filter(t => t.id !== id) }))
}), { name: 'difrag-app', partialize: (s) => ({ profile: s.profile, userId: s.userId, screen: s.screen === 'welcome' ? 'welcome' : 'home' }) }));
