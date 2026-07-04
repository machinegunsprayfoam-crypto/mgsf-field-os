import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MGSF Field OS",
  description: "Machine Gun Spray Foam & Concrete Lifting — Business Operating System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="layout">
          <nav className="sidebar">
            <div className="sidebar-logo">
              <span className="logo-icon">⚡</span>
              <span className="logo-text">MGSF OS</span>
            </div>
            <ul className="nav-links">
              <li><a href="/">Dashboard</a></li>
              <li><a href="/customers">Customers</a></li>
              <li><a href="/estimate">Estimating</a></li>
            </ul>
          </nav>
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
