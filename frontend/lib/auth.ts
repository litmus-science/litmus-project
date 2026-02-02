import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "./types";

interface AuthState {
  token: string | null;
  user: User | null;
  authDisabled: boolean | null;
  authChecked: boolean;
  setAuth: (token: string, user: User) => void;
  setAuthDisabled: (disabled: boolean) => void;
  setAuthChecked: (checked: boolean) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      authDisabled: null,
      authChecked: false,
      setAuth: (token: string, user: User) => set({ token, user }),
      setAuthDisabled: (disabled: boolean) => set({ authDisabled: disabled }),
      setAuthChecked: (checked: boolean) => set({ authChecked: checked }),
      logout: () => set({ token: null, user: null }),
      isAuthenticated: () => get().authDisabled === true || !!get().token,
    }),
    {
      name: "litmus-auth",
      // Persist only durable auth state. Config-derived flags must be reloaded each session.
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem("litmus-auth");
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return parsed.state?.token || null;
  } catch {
    return null;
  }
}
