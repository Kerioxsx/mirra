"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { UserOut } from "@mirra/shared-types";
import { getClient, onUserChange } from "./api";

type Status = "loading" | "authenticated" | "guest";

interface AuthContextValue {
  status: Status;
  user: UserOut | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: UserOut) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUserState] = useState<UserOut | null>(null);

  useEffect(() => {
    const client = getClient();
    const sync = () => {
      setUserState(client.user);
      setStatus(client.user ? "authenticated" : "guest");
    };
    const off = onUserChange(sync);
    client
      .restore()
      .catch(() => null)
      .finally(sync);
    return () => {
      off();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await getClient().login({ email, password });
  }, []);
  const register = useCallback(async (email: string, password: string, display_name: string) => {
    await getClient().register({ email, password, display_name });
  }, []);
  const logout = useCallback(async () => {
    await getClient().logout();
  }, []);
  const setUser = useCallback((u: UserOut) => setUserState(u), []);

  const value = useMemo(
    () => ({ status, user, login, register, logout, setUser }),
    [status, user, login, register, logout, setUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
