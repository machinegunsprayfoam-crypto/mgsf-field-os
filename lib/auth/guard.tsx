"use client";

import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/context";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = "/login";
    }
  }, [user, loading]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
