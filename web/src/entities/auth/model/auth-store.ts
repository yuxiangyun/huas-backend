import { create } from 'zustand';
import type { AuthCapabilities, AuthSession, UserBrief } from '@/entities/auth/model/auth-types';

const STORAGE_KEY = 'huas-web.auth';

interface PersistedAuthState {
  token: string | null;
  userBrief: UserBrief | null;
  capabilities: AuthCapabilities | null;
}

interface AuthStore extends PersistedAuthState {
  isAuthenticated: boolean;
  login: (session: AuthSession) => void;
  logout: () => void;
  restore: () => void;
}

function readPersistedState(): PersistedAuthState {
  if (typeof window === 'undefined') {
    return { token: null, userBrief: null, capabilities: null };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, userBrief: null, capabilities: null };

    const parsed = JSON.parse(raw) as PersistedAuthState;
    return {
      token: parsed.token || null,
      userBrief: parsed.userBrief || null,
      capabilities: parsed.capabilities || null,
    };
  } catch {
    return { token: null, userBrief: null, capabilities: null };
  }
}

function writePersistedState(state: PersistedAuthState) {
  if (typeof window === 'undefined') return;

  if (!state.token) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const initialState = readPersistedState();

export const useAuthStore = create<AuthStore>((set) => ({
  ...initialState,
  isAuthenticated: Boolean(initialState.token),
  login: (session) => {
    const nextState: PersistedAuthState = {
      token: session.token,
      userBrief: session.userBrief,
      capabilities: session.capabilities || null,
    };

    writePersistedState(nextState);
    set({ ...nextState, isAuthenticated: true });
  },
  logout: () => {
    writePersistedState({ token: null, userBrief: null, capabilities: null });
    set({ token: null, userBrief: null, capabilities: null, isAuthenticated: false });
  },
  restore: () => {
    const nextState = readPersistedState();
    set({ ...nextState, isAuthenticated: Boolean(nextState.token) });
  },
}));
