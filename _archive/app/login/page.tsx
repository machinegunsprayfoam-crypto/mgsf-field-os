"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/context";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) { setError("Email and password required."); return; }
    setLoading(true);
    setError("");
    const { error: err } = await signIn(email.trim(), password);
    setLoading(false);
    if (err) { setError(err); return; }
    window.location.href = "/";
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚡</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--accent)" }}>MGSF Field OS</div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Machine Gun Spray Foam & Concrete Lifting</div>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 20, textAlign: "center" }}>Sign in</h2>
          <form onSubmit={handleLogin}>
            <div className="field" style={{ marginBottom: 16 }}>
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
              />
            </div>
            <div className="field" style={{ marginBottom: 20 }}>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 16, textAlign: "center" }}>{error}</p>
            )}
            <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", marginTop: 20 }}>
          Internal use only — Machine Gun Spray Foam & Concrete Lifting LLC
        </p>
      </div>
    </div>
  );
}
