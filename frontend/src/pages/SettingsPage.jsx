import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../api/client";
import { FALLBACK_RATES } from "../utils/currency.js";

const CURRENCIES = [
  { code: "CZK", symbol: "Kč",  label: "Czech Koruna" },
  { code: "EUR", symbol: "€",   label: "Euro" },
  { code: "USD", symbol: "$",   label: "US Dollar" },
  { code: "GBP", symbol: "£",   label: "British Pound" },
  { code: "PLN", symbol: "zł",  label: "Polish Złoty" },
  { code: "CHF", symbol: "CHF", label: "Swiss Franc" },
  { code: "HUF", symbol: "Ft",  label: "Hungarian Forint" },
  { code: "RON", symbol: "lei", label: "Romanian Leu" },
];

const TIMEZONES = [
  { value: "Europe/Prague",     label: "Prague (CET/CEST)" },
  { value: "Europe/London",     label: "London (GMT/BST)" },
  { value: "Europe/Paris",      label: "Paris (CET/CEST)" },
  { value: "Europe/Berlin",     label: "Berlin (CET/CEST)" },
  { value: "Europe/Warsaw",     label: "Warsaw (CET/CEST)" },
  { value: "Europe/Budapest",   label: "Budapest (CET/CEST)" },
  { value: "Europe/Bucharest",  label: "Bucharest (EET/EEST)" },
  { value: "Europe/Kiev",       label: "Kyiv (EET/EEST)" },
  { value: "Europe/Moscow",     label: "Moscow (MSK)" },
  { value: "America/New_York",  label: "New York (EST/EDT)" },
  { value: "America/Chicago",   label: "Chicago (CST/CDT)" },
  { value: "America/Denver",    label: "Denver (MST/MDT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PST/PDT)" },
  { value: "Asia/Dubai",        label: "Dubai (GST)" },
  { value: "Asia/Tokyo",        label: "Tokyo (JST)" },
  { value: "UTC",               label: "UTC" },
];

const LANGUAGES = [
  { code: "en", label: "English",  flag: "EN" },
  { code: "cs", label: "Čeština",  flag: "CZ" },
  { code: "ru", label: "Русский",  flag: "RU" },
];

export default function SettingsPage() {
  const { i18n, t } = useTranslation();

  // ── Language ─────────────────────────────────────────────────────────────
  const [language, setLanguage] = useState(() => i18n.language?.slice(0, 2) || "en");

  const handleLanguageChange = (code) => {
    setLanguage(code);
    i18n.changeLanguage(code);
  };

  // ── Currency ─────────────────────────────────────────────────────────────
  const [currency, setCurrency] = useState(
    () => localStorage.getItem("app_currency") || "CZK"
  );

  // Confirmation modal state
  const [currencyConfirm, setCurrencyConfirm] = useState(null); // { code, symbol, label, rate, fetching }

  const handleCurrencyClick = async (c) => {
    if (c.code === currency) return; // already selected
    const modal = { code: c.code, symbol: c.symbol, label: c.label, rate: null, fetching: true };
    setCurrencyConfirm(modal);
    // Try to fetch live rate
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/CZK`);
      if (res.ok) {
        const json = await res.json();
        const rate = json?.rates?.[c.code];
        setCurrencyConfirm((prev) => prev ? { ...prev, rate: rate ?? FALLBACK_RATES[c.code] ?? null, fetching: false } : null);
        return;
      }
    } catch { /* fall through */ }
    // Use fallback
    setCurrencyConfirm((prev) => prev ? { ...prev, rate: FALLBACK_RATES[c.code] ?? null, fetching: false } : null);
  };

  const confirmCurrencyChange = () => {
    if (!currencyConfirm) return;
    const { code, symbol, rate } = currencyConfirm;
    const c = CURRENCIES.find(x => x.code === code);
    localStorage.setItem("app_currency", code);
    localStorage.setItem("app_currency_symbol", symbol || c?.symbol || code);
    localStorage.setItem("app_currency_rate", String(rate ?? FALLBACK_RATES[code] ?? 1));
    setCurrency(code);
    setCurrencyConfirm(null);
    window.location.reload();
  };

  // ── Timezone ─────────────────────────────────────────────────────────────
  const [timezone, setTimezone] = useState(
    () => localStorage.getItem("app_timezone") || "Europe/Prague"
  );
  const [tzNow, setTzNow] = useState("");

  useEffect(() => {
    const update = () => {
      try {
        setTzNow(new Date().toLocaleTimeString("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      } catch {
        setTzNow("");
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [timezone]);

  const handleTimezoneChange = (tz) => {
    setTimezone(tz);
    localStorage.setItem("app_timezone", tz);
    window.dispatchEvent(new CustomEvent("timezoneChanged", { detail: { timezone: tz } }));
  };

  // ── Signature verification ───────────────────────────────────────────────
  const [verificationEnabled, setVerificationEnabled] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingToggle, setSavingToggle] = useState(false);
  const [toggleError, setToggleError] = useState("");

  // Reference signature modal state
  const [refModal, setRefModal] = useState(null);
  const [hasRefSig, setHasRefSig] = useState(false);
  const [refSaving, setRefSaving] = useState(false);
  const [refError, setRefError] = useState("");
  const [refSuccess, setRefSuccess] = useState(false);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [settingsData, staffData] = await Promise.all([
          apiRequest("/staff/signature-settings", { method: "GET" }),
          apiRequest("/staff", { method: "GET" }),
        ]);
        if (cancelled) return;
        setVerificationEnabled(settingsData.enabled);
        setStaffList(Array.isArray(staffData) ? staffData : []);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleToggle = async () => {
    if (savingToggle) return;
    const next = !verificationEnabled;
    setVerificationEnabled(next);
    setToggleError("");
    setSavingToggle(true);
    try {
      await apiRequest("/staff/signature-settings", { method: "POST", body: { enabled: next } });
    } catch (err) {
      setVerificationEnabled(!next);
      setToggleError(err?.message || t("settings.failed_save_setting"));
    } finally {
      setSavingToggle(false);
    }
  };

  const clearReference = async (staffId) => {
    try {
      await apiRequest(`/staff/${staffId}/reference-signature`, { method: "DELETE" });
      setStaffList((prev) =>
        prev.map((s) => (s.id === staffId ? { ...s, has_reference_signature: false } : s))
      );
    } catch { /* ignore */ }
  };

  const openRefModal = (member) => {
    setRefModal({
      staffId: member.id,
      staffName: `${member.first_name || ""} ${member.last_name || ""}`.trim(),
    });
    setHasRefSig(false);
    setRefError("");
    setRefSuccess(false);
  };

  // Canvas drawing
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useEffect(() => {
    if (refModal) setTimeout(setupCanvas, 50);
  }, [refModal, setupCanvas]);

  const getPoint = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const handleDrawStart = (e) => { e.preventDefault(); drawingRef.current = true; const pt = getPoint(e); if (!pt) return; const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return; ctx.beginPath(); ctx.moveTo(pt.x, pt.y); };
  const handleDrawMove = (e) => { e.preventDefault(); if (!drawingRef.current) return; const pt = getPoint(e); if (!pt) return; const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return; ctx.lineTo(pt.x, pt.y); ctx.stroke(); setHasRefSig(true); };
  const handleDrawEnd = (e) => { e.preventDefault(); drawingRef.current = false; };
  const clearCanvas = () => { setupCanvas(); setHasRefSig(false); setRefError(""); };

  const saveReference = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasRefSig) return;
    setRefSaving(true);
    setRefError("");
    try {
      const sigData = canvas.toDataURL("image/png");
      await apiRequest(`/staff/${refModal.staffId}/reference-signature`, { method: "POST", body: { signature_data: sigData } });
      setRefSuccess(true);
      setStaffList((prev) =>
        prev.map((s) => (s.id === refModal.staffId ? { ...s, has_reference_signature: true } : s))
      );
    } catch (err) {
      setRefError(err.message || t("settings.failed_save_ref"));
    } finally {
      setRefSaving(false);
    }
  };

  // ── Shared toggle button component ───────────────────────────────────────
  const Toggle = ({ on, onToggle, disabled }) => (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      style={{
        width: 48, height: 26, borderRadius: 13, border: "none", cursor: disabled ? "default" : "pointer",
        background: on ? "var(--accent)" : "var(--border)",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        display: "block", width: 20, height: 20, borderRadius: "50%", background: "#fff",
        position: "absolute", top: 3, left: on ? 25 : 3, transition: "left 0.2s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
      }} />
    </button>
  );

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Language ──────────────────────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-title" style={{ marginBottom: 12 }}>{t("settings.language")}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {LANGUAGES.map((lng) => (
            <button
              key={lng.code}
              type="button"
              onClick={() => handleLanguageChange(lng.code)}
              style={{
                padding: "8px 20px", borderRadius: 8, border: "1px solid",
                borderColor: language === lng.code ? "var(--accent)" : "var(--border)",
                background: language === lng.code ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
                color: language === lng.code ? "var(--accent)" : "var(--text)",
                fontWeight: language === lng.code ? 600 : 400,
                cursor: "pointer", fontSize: 13, transition: "all 0.15s",
              }}
            >
              {lng.flag} — {lng.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Currency ──────────────────────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-title" style={{ marginBottom: 4 }}>{t("settings.currency")}</div>
        <div style={{ fontSize: 12, color: "var(--subtext)", marginBottom: 14, lineHeight: 1.5 }}>
          {t("settings.currency_desc")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => handleCurrencyClick(c)}
              title={c.label}
              style={{
                padding: "7px 16px", borderRadius: 8, border: "1px solid",
                borderColor: currency === c.code ? "var(--accent)" : "var(--border)",
                background: currency === c.code ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
                color: currency === c.code ? "var(--accent)" : "var(--text)",
                fontWeight: currency === c.code ? 600 : 400,
                cursor: "pointer", fontSize: 13, transition: "all 0.15s",
              }}
            >
              {c.code} <span style={{ opacity: 0.6 }}>{c.symbol}</span>
            </button>
          ))}
        </div>
        {(() => {
          const c = CURRENCIES.find(x => x.code === currency);
          return c ? (
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--subtext)" }}>
              {t("settings.selected")}: <strong style={{ color: "var(--text)" }}>{c.label} ({c.symbol})</strong>
            </div>
          ) : null;
        })()}
      </div>

      {/* ── Timezone ──────────────────────────────────────────────────────── */}
      <div className="panel">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
          <div>
            <div className="panel-title" style={{ marginBottom: 4 }}>{t("settings.timezone")}</div>
            <div style={{ fontSize: 12, color: "var(--subtext)", lineHeight: 1.5 }}>
              {t("settings.timezone_desc")}
            </div>
          </div>
          {tzNow && (
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: "var(--subtext)" }}>{t("settings.current_time")}</div>
              <div style={{ fontSize: 16, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--accent)" }}>{tzNow}</div>
            </div>
          )}
        </div>
        <select
          className="form-input"
          value={timezone}
          onChange={(e) => handleTimezoneChange(e.target.value)}
          style={{ maxWidth: 320 }}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
      </div>

      {/* ── Signature Verification ────────────────────────────────────────── */}
      <div className="panel">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div className="panel-title" style={{ marginBottom: 4 }}>{t("settings.sig_verification")}</div>
            <div style={{ fontSize: 13, color: "var(--subtext)", lineHeight: 1.5 }}>
              {t("settings.sig_verification_desc")}
            </div>
          </div>
          <Toggle on={verificationEnabled} onToggle={handleToggle} disabled={savingToggle} />
        </div>

        {toggleError && (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--danger, #e05252)", background: "color-mix(in srgb, #e05252 10%, transparent)", padding: "6px 10px", borderRadius: 6 }}>
            {toggleError}
          </div>
        )}

        {verificationEnabled && (
          <div style={{
            marginTop: 8,
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "color-mix(in srgb, var(--accent) 12%, transparent)",
            color: "var(--accent)", fontSize: 12, padding: "4px 10px", borderRadius: 6,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {t("settings.verification_active")}
          </div>
        )}
      </div>

      {/* ── Reference Signatures (only when verification is ON) ───────────── */}
      {verificationEnabled && (
        <div className="panel">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div className="panel-title" style={{ marginBottom: 2 }}>{t("settings.ref_signatures")}</div>
              <div style={{ fontSize: 12, color: "var(--subtext)" }}>
                {t("settings.ref_signatures_desc")}
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--subtext)", fontSize: 13 }}>{t("settings.loading")}</div>
          ) : staffList.length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--subtext)", fontSize: 13 }}>{t("settings.no_staff")}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {staffList.map((member) => {
                const name = `${member.first_name || ""} ${member.last_name || ""}`.trim() || "—";
                const hasRef = member.has_reference_signature;
                return (
                  <div
                    key={member.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                      borderRadius: 8, background: "var(--bg-surface, var(--bg))", border: "1px solid var(--border)",
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%", background: "var(--accent)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0,
                    }}>
                      {(member.first_name?.[0] || "").toUpperCase()}{(member.last_name?.[0] || "").toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
                      <div style={{ fontSize: 11, color: "var(--subtext)", textTransform: "capitalize" }}>{member.role || "—"}</div>
                    </div>
                    {hasRef ? (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)", padding: "3px 8px", borderRadius: 5, whiteSpace: "nowrap" }}>
                        {t("settings.reference_set")}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--subtext)", background: "var(--border)", padding: "3px 8px", borderRadius: 5, whiteSpace: "nowrap" }}>
                        {t("settings.no_reference")}
                      </span>
                    )}
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openRefModal(member)} style={{ fontSize: 12, padding: "5px 12px" }}>
                        {hasRef ? t("settings.update") : t("settings.assign")}
                      </button>
                      {hasRef && (
                        <button className="btn btn-ghost btn-sm" onClick={() => clearReference(member.id)} style={{ fontSize: 12, padding: "5px 10px", color: "var(--danger, #e05252)" }}>
                          {t("settings.remove")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Currency confirmation modal ───────────────────────────────────── */}
      {currencyConfirm && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setCurrencyConfirm(null)}
        >
          <div
            style={{ background: "var(--bg-card)", borderRadius: 12, width: "100%", maxWidth: 420, overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,0.4)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{t("settings.change_currency")}</div>
              <div style={{ fontSize: 12, color: "var(--subtext)", marginTop: 2 }}>
                {t("settings.amounts_recalculated")}
              </div>
            </div>
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "var(--subtext)", marginBottom: 4 }}>{t("settings.from")}</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{currency}</div>
                </div>
                <div style={{ alignSelf: "center", fontSize: 20, color: "var(--subtext)" }}>→</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "var(--subtext)", marginBottom: 4 }}>{t("settings.to")}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>{currencyConfirm.code}</div>
                </div>
              </div>

              {currencyConfirm.fetching ? (
                <div style={{ textAlign: "center", fontSize: 13, color: "var(--subtext)" }}>{t("settings.fetching_rate")}</div>
              ) : (
                <div style={{ background: "var(--surface)", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                  <div style={{ marginBottom: 4 }}>
                    <strong>{t("settings.rate")}:</strong>{" "}
                    <span className="mono">
                      1 CZK = {currencyConfirm.rate != null ? currencyConfirm.rate.toFixed(6) : "—"} {currencyConfirm.code}
                    </span>
                    {currencyConfirm.rate == null && (
                      <span style={{ color: "var(--red)", marginLeft: 6, fontSize: 11 }}>{t("settings.rate_unavailable")}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--subtext)" }}>
                    {currencyConfirm.label} ({currencyConfirm.symbol})
                    {currencyConfirm.rate != null && FALLBACK_RATES[currencyConfirm.code] === currencyConfirm.rate && (
                      <span style={{ marginLeft: 6 }}>· {t("settings.offline_rate")}</span>
                    )}
                  </div>
                </div>
              )}

              <div style={{ fontSize: 12, color: "var(--subtext)", lineHeight: 1.5 }}>
                {t("settings.reload_notice")}
              </div>
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setCurrencyConfirm(null)}>{t("common.cancel")}</button>
              <button
                className="btn btn-primary"
                onClick={confirmCurrencyChange}
                disabled={currencyConfirm.fetching || currencyConfirm.rate == null}
              >
                {t("settings.switch_to", { code: currencyConfirm.code })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reference signature modal ─────────────────────────────────────── */}
      {refModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setRefModal(null)}
        >
          <div
            style={{ background: "var(--bg-card)", borderRadius: 12, width: "100%", maxWidth: 460, overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,0.4)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{t("settings.assign_reference")}</div>
                <div style={{ fontSize: 12, color: "var(--subtext)", marginTop: 2 }}>{refModal.staffName}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setRefModal(null)} style={{ fontSize: 20, padding: "2px 8px", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: "18px 20px" }}>
              {refSuccess ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: "color-mix(in srgb, var(--accent) 15%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{t("settings.reference_saved")}</div>
                  <div style={{ fontSize: 12, color: "var(--subtext)", marginBottom: 20 }}>
                    {t("settings.reference_saved_desc", { name: refModal.staffName })}
                  </div>
                  <button className="btn btn-primary" onClick={() => setRefModal(null)}>{t("settings.done")}</button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: "var(--subtext)", marginBottom: 12 }}>
                    {t("settings.draw_signature")}
                  </div>
                  <canvas
                    ref={canvasRef}
                    width={420}
                    height={160}
                    style={{ width: "100%", height: 160, border: "1px solid var(--border)", borderRadius: 8, cursor: "crosshair", background: "#fff", touchAction: "none", display: "block" }}
                    onMouseDown={handleDrawStart}
                    onMouseMove={handleDrawMove}
                    onMouseUp={handleDrawEnd}
                    onMouseLeave={handleDrawEnd}
                    onTouchStart={handleDrawStart}
                    onTouchMove={handleDrawMove}
                    onTouchEnd={handleDrawEnd}
                  />
                  {refError && <div style={{ fontSize: 12, color: "var(--danger, #e05252)", marginTop: 8 }}>{refError}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost" onClick={() => setRefModal(null)} disabled={refSaving}>{t("common.cancel")}</button>
                    <button className="btn btn-secondary" onClick={clearCanvas} disabled={refSaving}>{t("outcome.signature.clear")}</button>
                    <button className="btn btn-primary" onClick={saveReference} disabled={refSaving || !hasRefSig}>
                      {refSaving ? t("settings.saving") : t("settings.save_reference")}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
