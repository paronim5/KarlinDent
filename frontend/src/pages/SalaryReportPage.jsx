import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApi } from "../api/client.js";
import { useAuth } from "../App.jsx";

export default function SalaryReportPage() {
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
    if (!staffId) { setError("Missing staff id"); return; }
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
        setError(err.message || "Failed to load salary report");
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
    if (user?.id) headers["X-Staff-Id"] = String(user.id);
    if (user?.role) headers["X-Staff-Role"] = String(user.role);
    fetch(url, { headers })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to download PDF");
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
      .catch((err) => setError(err.message || "Failed to download salary report"));
  };

  const fmt = (value) =>
    Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "CZK" });

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
            <div className="panel-title">Salary Report</div>
            {data && <div className="panel-meta">{data.period.from} → {data.period.to}</div>}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-ghost" onClick={downloadPdf} disabled={!data}>
              Download PDF
            </button>
            <button className="btn btn-ghost" onClick={() => navigate(-1)}>
              ← Back
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {loading && <div style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>Loading report...</div>}
          {error && <div className="form-error">{error}</div>}

          {data && (<>
            {/* Stat strip */}
            <div className="stat-strip" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <div className="stat-card s-blue">
                <div className="stat-label">Staff</div>
                <div className="stat-value">{data.staff.first_name} {data.staff.last_name}</div>
              </div>
              <div className="stat-card s-orange">
                <div className="stat-label">Role</div>
                <div className="stat-value">{data.role}</div>
              </div>
              {data.last_payment_date && (
                <div className="stat-card s-green">
                  <div className="stat-label">Last Payment</div>
                  <div className="stat-value">{data.last_payment_date}</div>
                </div>
              )}
              <div className="stat-card s-green">
                <div className="stat-label">Total Salary</div>
                <div className="stat-value">{fmt(data.summary.total_salary)}</div>
              </div>
            </div>

            {/* Records panel */}
            {data.role === "doctor" ? (
              <div className="panel" style={{ padding: 16 }}>
                <div className="panel-title" style={{ marginBottom: 12 }}>Patient Payments</div>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Patient</th>
                        <th style={{ textAlign: "right" }}>Gross</th>
                        <th style={{ textAlign: "right" }}>Lab Fee</th>
                        <th style={{ textAlign: "right" }}>Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.patients.length === 0 && (
                        <tr><td colSpan={4} className="empty-state">No unpaid patient payments for this period</td></tr>
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
                    ["Base Salary", fmt(data.summary.base_salary)],
                    [`Commission (${(data.summary.commission_rate * 100).toFixed(2)}%)`, fmt(data.summary.total_commission)],
                    ["Lab Fees Deduction", `-${fmt(data.summary.total_lab_fees || 0)}`],
                    ["Adjustments", fmt(data.summary.adjustments)],
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
                <div className="panel-title" style={{ marginBottom: 12 }}>Work Schedule</div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
                  {[
                    ["Working Days", data.summary.working_days],
                    ["Total Hours", data.summary.total_hours],
                    ["Hourly Rate", fmt(data.summary.base_salary)],
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
                        <th>Date</th>
                        <th>Time Range</th>
                        <th>Hours</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.timesheets.length === 0 && (
                        <tr><td colSpan={4} className="empty-state">No timesheets for this period</td></tr>
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
              <div className="panel-title" style={{ marginBottom: 8 }}>Signature</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
                <div style={{ flex: "1 1 240px" }}>
                  <div className="form-label">Signer Name</div>
                  <input className="form-input" value={signerName} placeholder="Full name" readOnly />
                </div>
                <div style={{ flex: "1 1 340px" }}>
                  <div className="form-label">Signature Field</div>
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
                  Clear Signature
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={confirmSignature}
                  disabled={!hasSignature || !signerName.trim()}
                >
                  Confirm Signature
                </button>
                {signedAt && (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Signed at {new Date(signedAt).toLocaleString()}
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
