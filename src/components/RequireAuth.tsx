import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div role="status" className="flex min-h-[calc(100dvh-4rem)] items-center justify-center gradient-hero">
        <p className="chip animate-pulse-glow">Checking your session…</p>
      </div>
    );
  }

  if (!user) {
    // Keep the query string so shared links (e.g. an analysis report) survive signing in.
    return <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />;
  }

  return <>{children}</>;
}

