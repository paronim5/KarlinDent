import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PeriodSelector from "./PeriodSelector";
import ThemeSwitcher from "./ThemeSwitcher";
import { useApi } from "../api/client";

export default function Layout({ children }) {
  const mobileBreakpoint = 834;
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const api = useApi();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [period, setPeriod] = useState(() => localStorage.getItem("globalPeriod") || "month");
  const [viewDate, setViewDate] = useState(() => new Date());
  const touchStartRef = useRef(null);
  const touchCurrentRef = useRef(null);

  // Dynamic current month labels — locale-aware via i18n language
  const dateLocale = i18n.language === "cs" ? "cs-CZ" : i18n.language === "ru" ? "ru-RU" : "en-US";
  const now = new Date();
  const currentMonthLabel = now.toLocaleDateString(dateLocale, { month: "short", year: "numeric" }).toUpperCase();
  const currentMonthLabelFull = now.toLocaleDateString(dateLocale, { month: "long", year: "numeric" }).toUpperCase();

  const computeRange = (p, refDate = viewDate) => {
    const d = new Date(Date.UTC(refDate.getFullYear(), refDate.getMonth(), refDate.getDate()));
    if (p === "day") {
      const s = d.toISOString().slice(0, 10);
      return { from: s, to: s };
    } else if (p === "week") {
      const from = new Date(d); from.setUTCDate(from.getUTCDate() - 6);
      return { from: from.toISOString().slice(0, 10), to: d.toISOString().slice(0, 10) };
    } else if (p === "month") {
      const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
    } else {
      const yr = d.getUTCFullYear();
      return { from: `${yr}-01-01`, to: `${yr}-12-31` };
    }
  };

  const navigatePeriod = (direction) => {
    setViewDate(prev => {
      const d = new Date(prev);
      if (period === "day") d.setDate(d.getDate() + direction);
      else if (period === "week") d.setDate(d.getDate() + direction * 7);
      else if (period === "month") d.setMonth(d.getMonth() + direction);
      else if (period === "year") d.setFullYear(d.getFullYear() + direction);
      return d;
    });
  };

  // Compute the current period label for the topbar sub-title
  const periodRangeLabel = useMemo(() => {
    const { from, to } = computeRange(period, viewDate);
    if (period === "day") return from;
    if (period === "year") return String(viewDate.getFullYear());
    return `${from} – ${to}`;
  }, [period, viewDate]);

  useEffect(() => {
    localStorage.setItem("globalPeriod", period);
    const { from, to } = computeRange(period, viewDate);
    const url = new URL(window.location.href);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    window.history.replaceState({}, "", url);
    const yr = period === "year" ? viewDate.getFullYear() : undefined;
    const ev = new CustomEvent("periodChanged", { detail: { from, to, period, ...(yr !== undefined ? { year: yr } : {}) } });
    window.dispatchEvent(ev);
  }, [period, viewDate]);

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (isSidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isSidebarOpen]);

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
    location.pathname.startsWith("/staff") ||
    location.pathname.startsWith("/my-income");

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  const handleTouchStart = (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    touchCurrentRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchMove = (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    touchCurrentRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = () => {
    const start = touchStartRef.current;
    const current = touchCurrentRef.current;
    touchStartRef.current = null;
    touchCurrentRef.current = null;
    if (!start || !current || window.innerWidth > mobileBreakpoint) return;
    const deltaX = current.x - start.x;
    const deltaY = Math.abs(current.y - start.y);
    if (!isSidebarOpen && start.x <= 36 && deltaX > 64 && deltaY < 56) {
      setSidebarOpen(true);
      return;
    }
    if (isSidebarOpen && deltaX < -64 && deltaY < 56) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="shell" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)}></div>}
      <button className={`mobile-menu-fab ${isSidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(!isSidebarOpen)} aria-label="Open navigation menu">
        <span></span>
        <span></span>
        <span></span>
      </button>
      <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="logo">
          <img src="/logo-mark.svg" alt="Virex" className="logo-icon" />
          <div className="logo-text">VIREX</div>
        </div>

        <nav className="nav-section">
          <div className="nav-label">{t("nav.overview")}</div>
          <Link
            to="/clinic"
            className={location.pathname === "/clinic" ? "nav-item active" : "nav-item"}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg></span> {t("nav.dashboard")}
          </Link>
        </nav>

        <nav className="nav-section" style={{ marginTop: "20px" }}>
          <div className="nav-label">{t("nav.income")}</div>
          <Link
            to="/income"
            className={location.pathname === "/income" ? "nav-item active" : "nav-item"}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg></span> {t("nav.income")}
          </Link>
          <Link 
            to="/income/add"
            className={location.pathname === "/income/add" ? "nav-item active" : "nav-item"}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></span> {t("nav.add_income")}
          </Link>
        </nav>

        <nav className="nav-section" style={{ marginTop: "20px" }}>
          <div className="nav-label">{t("nav.expenses")}</div>
          <Link
            to="/outcome"
            className={location.pathname === "/outcome" ? "nav-item active" : "nav-item"}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg></span> {t("nav.expenses")}
          </Link>
          <Link 
            to="/outcome/add"
            className={location.pathname === "/outcome/add" ? "nav-item active" : "nav-item"}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg></span> {t("nav.add_outcome", {defaultValue: "Add Outcome"})}
          </Link>
        </nav>

        <nav className="nav-section" style={{ marginTop: "20px" }}>
          <div className="nav-label">{t("nav.patients")}</div>
          <Link
            to="/patients"
            className={location.pathname === "/patients" ? "nav-item active" : "nav-item"}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span> {t("nav.patients")}
          </Link>
        </nav>

        <nav className="nav-section" style={{ marginTop: "20px" }}>
          <div className="nav-label">{t("nav.staff")}</div>
          <Link
            to="/staff"
            className={location.pathname === "/staff" ? "nav-item active" : "nav-item"}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></span> {t("nav.staff")}
          </Link>
          <Link
            to="/schedule"
            className={location.pathname === "/schedule" ? "nav-item active" : "nav-item"}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg></span> {t("nav.schedule", {defaultValue: "Schedule"})}
          </Link>
          <Link
            to="/my-income"
            className={location.pathname === "/my-income" ? "nav-item active" : "nav-item"}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg></span> {t("nav.my_income")}
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-controls" style={{ marginBottom: "16px", display: "flex", gap: "10px", padding: "0 12px", alignItems: "center" }}>
            <ThemeSwitcher />
          </div>
          <div className="language-switcher" style={{ marginBottom: "20px", display: "flex", gap: "10px", padding: "0 12px" }}>
            <button 
              className={`btn btn-ghost btn-sm ${i18n.language === 'en' ? 'active' : ''}`} 
              onClick={() => changeLanguage('en')}
              style={{ padding: "4px 8px", fontSize: "12px", background: i18n.language.startsWith('en') ? "var(--bg-card)" : "transparent" }}
              aria-label="Switch to English"
            >
              EN
            </button>
            <button 
              className={`btn btn-ghost btn-sm ${i18n.language === 'ru' ? 'active' : ''}`} 
              onClick={() => changeLanguage('ru')}
              style={{ padding: "4px 8px", fontSize: "12px", background: i18n.language.startsWith('ru') ? "var(--bg-card)" : "transparent" }}
              aria-label="Переключить на русский"
            >
              RU
            </button>
            <button 
              className={`btn btn-ghost btn-sm ${i18n.language === 'cs' ? 'active' : ''}`} 
              onClick={() => changeLanguage('cs')}
              style={{ padding: "4px 8px", fontSize: "12px", background: i18n.language.startsWith('cs') ? "var(--bg-card)" : "transparent" }}
              aria-label="Přepnout do češtiny"
            >
              CZ
            </button>
          </div>
          <div className="clinic-badge">
            <div className="clinic-avatar">KD</div>
            <div>
              <div className="clinic-name">KarlinDent</div>
              <div className="clinic-sub">{currentMonthLabel}</div>
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
               location.pathname.startsWith("/schedule") ? t("nav.schedule", {defaultValue: "Schedule"}) :
               location.pathname.startsWith("/my-income") ? t("nav.my_income") :
               t("nav.dashboard")}
            </div>
            <div className="topbar-sub">{showPeriod ? periodRangeLabel : currentMonthLabelFull}</div>
          </div>
          <div className="topbar-actions">
            {showPeriod && (
              <>
                <PeriodSelector
                  value={period}
                  onChange={(p) => { setPeriod(p); setViewDate(new Date()); }}
                  options={["day", "week", "month", "year"]}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => navigatePeriod(-1)} aria-label="Previous period">‹</button>
                  <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--subtext)", minWidth: "80px", textAlign: "center", whiteSpace: "nowrap" }}>{periodRangeLabel}</span>
                  <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => navigatePeriod(1)} aria-label="Next period">›</button>
                </div>
              </>
            )}
            {location.pathname.startsWith("/outcome") ? (
              <button className="btn btn-primary" onClick={() => navigate("/outcome/add")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg> {t("nav.add_outcome", {defaultValue: "Add Outcome"})}</button>
            ) : (
              <button className="btn btn-primary" onClick={() => navigate("/income/add")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> {t("nav.add_income")}</button>
            )}
          </div>
        </header>

        <div className="content">{children}</div>
      </div>
    </div>
  );
}
