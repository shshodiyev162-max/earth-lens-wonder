import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, isDemoMode } from "@/lib/apiClient";
import type { User } from "@/lib/types";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  error: string | null;
  /** True when no backend is configured: everything works locally, no accounts. */
  demo: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const LOCAL_USER: User = { id: "local", name: "Explorer", email: "local" };

export function AuthProvider({ children }: { children: ReactNode }) {
  const demo = isDemoMode();
  const [user, setUser] = useState<User | null>(demo ? LOCAL_USER : null);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    apiFetch<User>("/auth/me")
      .then((me) => !cancelled && setUser(me))
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [demo]);

  const login = async (email: string, password: string) => {
    setError(null);
    if (demo) {
      setUser({ ...LOCAL_USER, email });
      return;
    }
    try {
      setUser(await apiFetch<User>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      throw err;
    }
  };

  const register = async (name: string, email: string, password: string) => {
    setError(null);
    if (demo) {
      setUser({ ...LOCAL_USER, name, email });
      return;
    }
    try {
      setUser(await apiFetch<User>("/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
      throw err;
    }
  };

  const logout = async () => {
    setError(null);
    try {
      if (!demo) await apiFetch<null>("/auth/logout", { method: "POST" });
    } finally {
      setUser(demo ? LOCAL_USER : null);
    }
  };

  return <AuthContext.Provider value={{ user, loading, error, demo, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
