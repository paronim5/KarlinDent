import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useApi } from "../api/client.js";
import { useAuth } from "../App.jsx";
import { formatMoney as fmt } from "../utils/currency.js";

export default function SalaryReportPage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { search } = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const staffId = params.get("staff_id");
  const from = params.get("from") || "";
  const to = params.get("to") || "";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signedAt, setSignedAt] = useState(null);

  // Lock background scroll while this overlay is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    if (!staffId) { setError(t("salary_report.missing_staff_id")); return; }
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams();
        if (from) query.set("from", from);
        if (to) query.set("to", to);
        const url = query.toString()
          ? `/staff/${staffId}/salary-report/data?${query.toString()}`
          : `/staff/${staffId}/salary-report/data`;
        const res = await api.get(url);
        setData(res);
      } catch (err) {
        setError(err.message || t("salary_report.failed_load"));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [staffId, from, to]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 140;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
  }, [data]);

  useEffect(() => {
    if (!user) return;
    setSignerName([user.first_name, user.last_name].filter(Boolean).join(" ").trim());
  }, [user]);

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in event) {
      const touch = event.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const point = getPoint(event);
    if (!point) return;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    setIsDrawing(true);
  };

  const handlePointerMove = (event) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const point = getPoint(event);
    if (!point) return;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    setHasSignature(true);
  };

  const handlePointerUp = () => { if (isDrawing) setIsDrawing(false); };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setSignedAt(null);
  };

  const confirmSignature = () => {
    if (!hasSignature || !signerName.trim()) return;
    setSignedAt(new Date().toISOString());
  };

  const downloadPdf = () => {
    if (!staffId) return;
    const query = new URLSearchParams();
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    const url = query.toString()
      ? `/api/staff/${staffId}/salary-report?${query.toString()}`
      : `/api/staff/${staffId}/salary-report`;
    const headers = {};
    const token = localStorage.getItem("auth_token");
    if (token) headers["Authorization"] = "Bearer " + token;
    if (user?.id) headers["X-Staff-Id"] = String(user.id);
    if (user?.role) headers["X-Staff-Role"] = String(user.role);
    fetch(url, { headers })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("salary_report.failed_pdf"));
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = `salary_report_${staffId}_${from || "from"}_${to || "to"}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
      })
      .catch((err) => setError(err.message || t("salary_report.failed_pdf")));
  };


  return (
    /* Full-screen backdrop */
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.55)",
      backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: "24px 16px",
      overflowY: "auto",
    }}>
      {/* Modal card */}
      <div style={{
        width: "100%", maxWidth: 860,
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        display: "flex", flexDirection: "column",
        marginBottom: 24,
      }}>

        {/* Sticky header */}
        <div style={{
          position: "sticky", top: 0, zIndex: 10,
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border)",
          borderRadius: "16px 16px 0 0",
          padding: "16px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div className="panel-title">{t("salary_report.title")}</div>
            {data && <div className="panel-meta">{data.period.from} → {data.period.to}</div>}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-ghost" onClick={downloadPdf} disabled={!data}>
              {t("salary_report.download_pdf")}
            </button>
            <button className="btn btn-ghost" onClick={() => navigate(-1)}>
              {t("salary_report.back")}
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {loading && <div style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>{t("salary_report.loading")}</div>}
          {error && <div className="form-error">{error}</div>}

          {data && (<>
            {/* Stat strip */}
            <div className="stat-strip" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <div className="stat-card s-blue">
                <div className="stat-label">{t("salary_report.stat_staff")}</div>
                <div className="stat-value">{data.staff.first_name} {data.staff.last_name}</div>
              </div>
              <div className="stat-card s-orange">
                <div className="stat-label">{t("salary_report.stat_role")}</div>
                <div className="stat-value">{data.role}</div>
              </div>
              {data.last_payment_date && (
                <div className="stat-card s-green">
                  <div className="stat-label">{t("salary_report.stat_last_payment")}</div>
                  <div className="stat-value">{data.last_payment_date}</div>
                </div>
              )}
              <div className="stat-card s-green">
                <div className="stat-label">{t("salary_report.stat_total_salary")}</div>
                <div className="stat-value">{fmt(data.summary.total_salary)}</div>
              </div>
            </div>

            {/* Records panel */}
            {data.role === "doctor" ? (
              <div className="panel" style={{ padding: 16 }}>
                <div className="panel-title" style={{ marginBottom: 12 }}>{t("salary_report.patient_payments")}</div>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t("salary_report.col_patient")}</th>
                        <th style={{ textAlign: "right" }}>{t("salary_report.col_gross")}</th>
                        <th style={{ textAlign: "right" }}>{t("salary_report.col_lab_fee")}</th>
                        <th style={{ textAlign: "right" }}>{t("salary_report.col_net")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.patients.length === 0 && (
                        <tr><td colSpan={4} className="empty-state">{t("salary_report.no_patients")}</td></tr>
                      )}
                      {data.patients.map((row, idx) => (
                        <tr key={`${row.name}-${idx}`}>
                          <td>{row.name}</td>
                          <td className="mono" style={{ textAlign: "right" }}>{fmt(row.total_paid)}</td>
                          <td className="mono" style={{ textAlign: "right" }}>-{fmt(row.lab_fee || 0)}</td>
                          <td className="mono" style={{ textAlign: "right" }}>{fmt(row.net_paid || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 12, display: "grid", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  {[
                    [t("salary_report.base_salary"), fmt(data.summary.base_salary)],
                    [t("salary_report.commission", { rate: (data.summary.commission_rate * 100).toFixed(2) }), fmt(data.summary.total_commission)],
                    [t("salary_report.lab_fees_deduction"), `-${fmt(data.summary.total_lab_fees || 0)}`],
                    [t("salary_report.adjustments"), fmt(data.summary.adjustments)],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{label}</span>
                      <span className="mono">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="panel" style={{ padding: 16 }}>
                <div className="panel-title" style={{ marginBottom: 12 }}>{t("salary_report.work_schedule")}</div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
                  {[
                    [t("salary_report.working_days"), data.summary.working_days],
                    [t("salary_report.total_hours"), data.summary.total_hours],
                    [t("salary_report.hourly_rate"), fmt(data.summary.base_salary)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="stat-label">{label}</div>
                      <div className="stat-value">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t("salary_report.col_date")}</th>
                        <th>{t("salary_report.col_time_range")}</th>
                        <th>{t("salary_report.col_hours")}</th>
                        <th>{t("salary_report.col_note")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.timesheets.length === 0 && (
                        <tr><td colSpan={4} className="empty-state">{t("salary_report.no_timesheets")}</td></tr>
                      )}
                      {data.timesheets.map((row, idx) => (
                        <tr key={`${row.date}-${idx}`}>
                          <td className="mono">{row.date}</td>
                          <td className="mono">{row.start_time} - {row.end_time}</td>
                          <td className="mono">{row.hours.toFixed(2)}</td>
                          <td>{row.note || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Signature */}
            <div className="panel" style={{ padding: 16 }}>
              <div className="panel-title" style={{ marginBottom: 8 }}>{t("salary_report.signature")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
                <div style={{ flex: "1 1 240px" }}>
                  <div className="form-label">{t("salary_report.signer_name")}</div>
                  <input className="form-input" value={signerName} placeholder={t("salary_report.full_name_placeholder")} readOnly />
                </div>
                <div style={{ flex: "1 1 340px" }}>
                  <div className="form-label">{t("salary_report.signature_field")}</div>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8, background: "var(--surface)" }}>
                    <canvas
                      ref={canvasRef}
                      style={{ width: "100%", height: 140, display: "block", cursor: "crosshair" }}
                      onMouseDown={handlePointerDown}
                      onMouseMove={handlePointerMove}
                      onMouseUp={handlePointerUp}
                      onMouseLeave={handlePointerUp}
                      onTouchStart={handlePointerDown}
                      onTouchMove={handlePointerMove}
                      onTouchEnd={handlePointerUp}
                    />
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-secondary" onClick={clearSignature}>
                  {t("salary_report.clear_signature")}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={confirmSignature}
                  disabled={!hasSignature || !signerName.trim()}
                >
                  {t("salary_report.confirm_signature")}
                </button>
                {signedAt && (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {t("salary_report.signed_at", { datetime: new Date(signedAt).toLocaleString() })}
                  </div>
                )}
              </div>
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
}
