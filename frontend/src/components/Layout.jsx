import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

export default function Layout({ children }) {
  const location = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const items = [
    { to: "/clinic", label: "Dashboard", icon: "⬡" },
    { to: "/income", label: "Income", icon: "↗" },
    { to: "/outcome", label: "Expenses", icon: "↙" },
    { to: "/staff", label: "Staff", icon: "◈" },
    { to: "/my-income", label: "My Income", icon: "◧" },
  ];

  return (
    <div className="shell">
      {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)}></div>}
      <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="logo">
          <div className="logo-mark">M</div>
          <div className="logo-text">
            Med<span>Pay</span>
          </div>
        </div>

        <nav className="nav-section">
          <div className="nav-label">Overview</div>
          {items.slice(0, 3).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={location.pathname.startsWith(item.to) ? "nav-item active" : "nav-item"}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span> {item.label}
            </Link>
          ))}
        </nav>

        <nav className="nav-section" style={{ marginTop: "20px" }}>
          <div className="nav-label">Workforce</div>
          {items.slice(3, 4).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={location.pathname.startsWith(item.to) ? "nav-item active" : "nav-item"}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span> {item.label}
            </Link>
          ))}
        </nav>

        <nav className="nav-section" style={{ marginTop: "20px" }}>
          <div className="nav-label">Payroll</div>
          {items.slice(4, 5).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={location.pathname.startsWith(item.to) ? "nav-item active" : "nav-item"}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span> {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="clinic-badge">
            <div className="clinic-avatar">HC</div>
            <div>
              <div className="clinic-name">HealthCare+</div>
              <div className="clinic-sub">MAR 2025</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!isSidebarOpen)}>
            <span></span>
            <span></span>
            <span></span>
          </button>
          <div>
            <div className="topbar-title">
              {items.find((item) => location.pathname.startsWith(item.to))?.label || "Dashboard"}
            </div>
            <div className="topbar-sub">MARCH 2025 · PERIOD ACTIVE</div>
          </div>
          <div className="topbar-actions">
            <div className="date-strip">
              <button className="date-chip active">MO</button>
            </div>
            <button className="btn btn-ghost">⇣ Export</button>
            <button className="btn btn-primary">+ Add Income</button>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
