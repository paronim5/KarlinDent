import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function Layout({ children }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [period, setPeriod] = useState(() => localStorage.getItem("globalPeriod") || "month");
  
  const labels = useMemo(() => ({
    year: t("income.period.year"),
    month: t("income.period.month"),
    week: t("income.period.week"),
    day: t("income.period.day")
  }), [t]);

  const computeRange = (p) => {
    const now = new Date();
    const to = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0,10);
    let from;
    if (p === "day") {
      from = to;
    } else if (p === "week") {
      const d = new Date(to);
      d.setUTCDate(d.getUTCDate() - 6);
      from = d.toISOString().slice(0,10);
    } else if (p === "month") {
      const d = new Date(to);
      from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0,10);
    } else {
      const d = new Date(to);
      from = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)).toISOString().slice(0,10);
    }
    return { from, to };
  };

  useEffect(() => {
    localStorage.setItem("globalPeriod", period);
    const { from, to } = computeRange(period);
    const url = new URL(window.location.href);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    window.history.replaceState({}, "", url);
    const ev = new CustomEvent("periodChanged", { detail: { from, to, period }});
    window.dispatchEvent(ev);
  }, [period]);

  // Listen for period changes from other components (like ClinicPage navigation)
  useEffect(() => {
    const handler = (event) => {
        if (event.detail && event.detail.period && event.detail.period !== period) {
            setPeriod(event.detail.period);
        }
    };
    window.addEventListener("periodChanged", handler);
    return () => window.removeEventListener("periodChanged", handler);
  }, [period]);

  const showPeriod =
    location.pathname.startsWith("/clinic") ||
    location.pathname.startsWith("/income") ||
    location.pathname.startsWith("/outcome") ||
    location.pathname.startsWith("/staff/doctor") ||
    location.pathname.startsWith("/my-income");

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

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
          <div className="nav-label">{t("nav.overview")}</div>
          <Link
            to="/clinic"
            className={location.pathname === "/clinic" ? "nav-item active" : "nav-item"}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon">⬡</span> {t("nav.dashboard")}
          </Link>
        </nav>

        <nav className="nav-section" style={{ marginTop: "20px" }}>
          <div className="nav-label">{t("nav.income")}</div>
          <Link
            to="/income"
            className={location.pathname === "/income" ? "nav-item active" : "nav-item"}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon">↗</span> {t("nav.income")}
          </Link>
          <Link 
            to="/income/add"
            className={location.pathname === "/income/add" ? "nav-item active" : "nav-item"}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon">+</span> {t("nav.add_income")}
          </Link>
        </nav>

        <nav className="nav-section" style={{ marginTop: "20px" }}>
          <div className="nav-label">{t("nav.expenses")}</div>
          <Link
            to="/outcome"
            className={location.pathname === "/outcome" ? "nav-item active" : "nav-item"}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon">↙</span> {t("nav.expenses")}
          </Link>
          <Link 
            to="/outcome/add"
            className={location.pathname === "/outcome/add" ? "nav-item active" : "nav-item"}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon">-</span> {t("nav.add_outcome", {defaultValue: "Add Outcome"})}
          </Link>
        </nav>

        <nav className="nav-section" style={{ marginTop: "20px" }}>
          <div className="nav-label">{t("nav.staff")}</div>
          <Link
            to="/staff"
            className={location.pathname === "/staff" ? "nav-item active" : "nav-item"}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon">◈</span> {t("nav.staff")}
          </Link>
          <Link
            to="/my-income"
            className={location.pathname === "/my-income" ? "nav-item active" : "nav-item"}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon">◧</span> {t("nav.my_income")}
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="language-switcher" style={{ marginBottom: "20px", display: "flex", gap: "10px", padding: "0 12px" }}>
            <button 
              className={`btn btn-ghost btn-sm ${i18n.language === 'en' ? 'active' : ''}`} 
              onClick={() => changeLanguage('en')}
              style={{ padding: "4px 8px", fontSize: "12px", background: i18n.language.startsWith('en') ? "var(--bg-card)" : "transparent" }}
            >
              EN
            </button>
            <button 
              className={`btn btn-ghost btn-sm ${i18n.language === 'ru' ? 'active' : ''}`} 
              onClick={() => changeLanguage('ru')}
              style={{ padding: "4px 8px", fontSize: "12px", background: i18n.language.startsWith('ru') ? "var(--bg-card)" : "transparent" }}
            >
              RU
            </button>
          </div>
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
              {location.pathname === "/clinic" ? t("nav.dashboard") :
               location.pathname.startsWith("/income") ? t("nav.income") :
               location.pathname.startsWith("/outcome") ? t("nav.expenses") :
               location.pathname.startsWith("/staff") ? t("nav.staff") :
               location.pathname.startsWith("/my-income") ? t("nav.my_income") :
               t("nav.dashboard")}
            </div>
            <div className="topbar-sub">MARCH 2025 · {t("common.period_active")}</div>
          </div>
          <div className="topbar-actions">
            {showPeriod && (
              <div className="date-strip">
                {["day", "week", "month", "year"].map(p => (
                    <button
                        key={p}
                        className={`date-chip ${period === p ? "active" : ""}`}
                        aria-label={t("income.period_selector")}
                        title={labels[p]}
                        onClick={() => setPeriod(p)}
                    >
                        {p === "month" ? "MO" : p === "week" ? "WE" : p === "day" ? "DA" : "YE"}
                    </button>
                ))}
              </div>
            )}
            <button className="btn btn-ghost">⇣ {t("nav.export")}</button>
            {location.pathname.startsWith("/outcome") ? (
              <button className="btn btn-primary" onClick={() => navigate("/outcome/add")}>- {t("nav.add_outcome", {defaultValue: "Add Outcome"})}</button>
            ) : (
              <button className="btn btn-primary" onClick={() => navigate("/income/add")}>+ {t("nav.add_income")}</button>
            )}
          </div>
        </header>

        <div className="content">{children}</div>
      </div>
    </div>
  );
}
