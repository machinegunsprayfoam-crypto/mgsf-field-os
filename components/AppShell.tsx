"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth/context";
import { AuthGuard } from "@/lib/auth/guard";

const NAV_SECTIONS = [
  {
    label: "Pipeline",
    links: [
      { href: "/leads", label: "Leads" },
      { href: "/customers", label: "Customers" },
    ],
  },
  {
    label: "Operations",
    links: [
      { href: "/projects", label: "Projects" },
      { href: "/schedule", label: "Schedule" },
      { href: "/photos", label: "Photos" },
      { href: "/inventory", label: "Inventory" },
      { href: "/equipment", label: "Equipment" },
    ],
  },
  {
    label: "Business",
    links: [
      { href: "/estimate", label: "Estimates" },
      { href: "/estimates", label: "Estimate History" },
      { href: "/reports", label: "Reports" },
      { href: "/marketing", label: "Marketing" },
      { href: "/govcon", label: "Govcon" },
      { href: "/safety", label: "Safety" },
    ],
  },
];

function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">⚡</span>
        <span className="logo-text">Klyfton</span>
      </div>
      <div style={{ padding: "0 12px 12px", color: "var(--text-muted)", fontSize: 12, lineHeight: 1.4 }}>
        Estimator-only app for Machine Gun Spray Foam &amp; Concrete Lifting.
      </div>
      <ul className="nav-links" style={{ flex: 1, overflowY: "auto" }}>
        {NAV_SECTIONS.map((section) => (
          <li key={section.label} style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--text-muted)", padding: "8px 12px 2px", opacity: 0.6 }}>
              {section.label}
            </div>
            {section.links.map((link) => {
              const active = pathname === link.href;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  style={{
                    display: "block",
                    padding: "8px 12px",
                    color: active ? "var(--text)" : "var(--text-muted)",
                    textDecoration: "none",
                    borderRadius: "var(--radius)",
                    fontSize: 14,
                    fontWeight: active ? 600 : 500,
                    background: active ? "var(--surface2)" : "transparent",
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  {link.label}
                </a>
              );
            })}
          </li>
        ))}
      </ul>
      {user && (
        <div style={{ padding: "12px 12px 4px", borderTop: "1px solid var(--border)", marginTop: 8 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.email}
          </div>
          <button
            onClick={() => signOut()}
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: "5px 10px", width: "100%", justifyContent: "center" }}
          >
            Sign out
          </button>
        </div>
      )}
    </nav>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublic = pathname === "/login" || pathname?.startsWith("/portal");

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <AuthGuard>
      <div className="layout">
        <Sidebar />
        <main className="main-content">{children}</main>
      </div>
    </AuthGuard>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}
