import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setToken } from '../lib/api';
import type { User } from '../lib/types';

type AuthValue = {
  user: User | null;
  balance: number;
  ready: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<number>;
  logout: () => Promise<void>;
  setBalance: (value: number) => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [balance, setBalance] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((payload) => {
        if (cancelled) return;
        setUser(payload.user);
        setBalance(payload.balance ?? 0);
        if (!payload.user) setToken(null);
      })
      .catch(() => {
        /* not signed in */
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const payload = await api.login({ identifier, password });
    setToken(payload.token);
    setUser(payload.user);
    setBalance(payload.balance);
  }, []);

  const register = useCallback(async (email: string, username: string, password: string) => {
    const payload = await api.register({ email, username, password });
    setToken(payload.token);
    setUser(payload.user);
    setBalance(payload.balance);
    return payload.welcomeBonus;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setToken(null);
      setUser(null);
      setBalance(0);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const payload = await api.me();
      setUser(payload.user);
      setBalance(payload.balance ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ user, balance, ready, login, register, logout, setBalance, refresh }),
    [user, balance, ready, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
