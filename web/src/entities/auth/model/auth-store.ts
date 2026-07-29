/**
 * [INPUT]: 依赖 Zustand、认证类型与浏览器 localStorage
 * [OUTPUT]: 对外提供 useAuthStore，完成普通用户 JWT 会话登录、注销与恢复
 * [POS]: entities/auth 的客户端会话事实源，被 HTTP 客户端、路由守卫与页面共同消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { create } from 'zustand';
import type { AuthSession, UserBrief } from '@/entities/auth/model/auth-types';

const STORAGE_KEY = 'huas-web.auth';

interface PersistedAuthState {
  token: string | null;
  userBrief: UserBrief | null;
}

interface AuthStore extends PersistedAuthState {
  isAuthenticated: boolean;
  login: (session: AuthSession) => void;
  logout: () => void;
  restore: () => void;
}

function readPersistedState(): PersistedAuthState {
  if (typeof window === 'undefined') {
    return { token: null, userBrief: null };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, userBrief: null };

    const parsed = JSON.parse(raw) as PersistedAuthState;
    return {
      token: parsed.token || null,
      userBrief: parsed.userBrief || null,
    };
  } catch {
    return { token: null, userBrief: null };
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
    };

    writePersistedState(nextState);
    set({ ...nextState, isAuthenticated: true });
  },
  logout: () => {
    writePersistedState({ token: null, userBrief: null });
    set({ token: null, userBrief: null, isAuthenticated: false });
  },
  restore: () => {
    const nextState = readPersistedState();
    set({ ...nextState, isAuthenticated: Boolean(nextState.token) });
  },
}));
