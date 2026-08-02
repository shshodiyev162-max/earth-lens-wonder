import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiFetch } from "@/lib/apiClient";
import type { User } from "@/lib/types";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const isDemo = !import.meta.env.VITE_API_BASE_URL;

    async function loadMe() {
      try {
        setLoading(true);
        setError(null);
        const me = await apiFetch<User>("/auth/me").catch(() => null);
        if (!cancelled) {
          setUser(me);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    // If no API base URL is configured, treat the app as running in demo mode.
    if (!isDemo) {
      loadMe();
    } else {
      // ✅ Auto-login demo user so the app works without backend
      if (!cancelled) {
        setUser(
          {
            id: "demo",
            name: "Demo User",
            email: "demo@local",
          } as any
        );
        setLoading(false);
      }
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    setError(null);

    const isDemo = !import.meta.env.VITE_API_BASE_URL;
    if (isDemo) {
      setUser(
        {
          id: "demo",
          name: "Demo User",
          email,
        } as any
      );
      return;
    }

    try {
      const nextUser = await apiFetch<User>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setUser(nextUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      throw err;
    }
  };

  const register = async (name: string, email: string, password: string) => {
    setError(null);

    const isDemo = !import.meta.env.VITE_API_BASE_URL;
    if (isDemo) {
      setUser(
        {
          id: "demo",
          name,
          email,
        } as any
      );
      return;
    }

    try {
      const nextUser = await apiFetch<User>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      setUser(nextUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
      throw err;
    }
  };

  const logout = async () => {
    setError(null);

    const isDemo = !import.meta.env.VITE_API_BASE_URL;

    try {
      if (!isDemo) {
        await apiFetch<null>("/auth/logout", { method: "POST" });
      }
    } finally {
      setUser(null);
    }
  };

  const value: AuthContextValue = {
    user,
    loading,
    error,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}