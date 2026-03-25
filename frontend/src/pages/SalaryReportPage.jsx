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

  useEffect(() => {
    if (!staffId) {
      setError("Missing staff id");
      return;
    }
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
  }, []);

  useEffect(() => {
    if (!user) return;
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
    setSignerName(fullName);
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

  const handlePointerUp = () => {
    if (isDrawing) {
      setIsDrawing(false);
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
        if (!response.ok) {
          throw new Error("Failed to download PDF");
        }
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
      .catch((err) => {
        setError(err.message || "Failed to download salary report");
      });
  };

  const formatCurrency = (value) =>
    Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "CZK" });

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "24px" }}>
      <div className="panel">
        <div className="panel-header" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="panel-title">Salary Report</div>
            {data && (
              <div className="panel-meta">
                {data.period.from} → {data.period.to}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button className="btn btn-ghost" onClick={downloadPdf} disabled={!data}>
              Download PDF
            </button>
            <button className="btn btn-ghost" onClick={() => navigate(-1)}>
              Back
            </button>
          </div>
        </div>
        {loading && <div>Loading report...</div>}
        {error && <div className="form-error">{error}</div>}
        {data && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="stat-strip" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
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
                <div className="stat-value">{formatCurrency(data.summary.total_salary)}</div>
              </div>
            </div>

            {data.role === "doctor" ? (
              <div className="panel" style={{ background: "var(--bg-card)", padding: "16px", borderRadius: "8px" }}>
                <div className="panel-title" style={{ marginBottom: "12px" }}>Patient Payments</div>
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
                      <tr>
                        <td colSpan={4} className="empty-state">No unpaid patient payments for this period</td>
                      </tr>
                    )}
                    {data.patients.map((row, idx) => (
                      <tr key={`${row.name}-${idx}`}>
                        <td>{row.name}</td>
                        <td className="mono" style={{ textAlign: "right" }}>{formatCurrency(row.total_paid)}</td>
                        <td className="mono" style={{ textAlign: "right" }}>-{formatCurrency(row.lab_fee || 0)}</td>
                        <td className="mono" style={{ textAlign: "right" }}>{formatCurrency(row.net_paid || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: "12px", display: "grid", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Base Salary</span>
                    <span className="mono">{formatCurrency(data.summary.base_salary)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Commission ({(data.summary.commission_rate * 100).toFixed(2)}%)</span>
                    <span className="mono">{formatCurrency(data.summary.total_commission)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Lab Fees Deduction</span>
                    <span className="mono">-{formatCurrency(data.summary.total_lab_fees || 0)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Adjustments</span>
                    <span className="mono">{formatCurrency(data.summary.adjustments)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="panel" style={{ background: "var(--bg-card)", padding: "16px", borderRadius: "8px" }}>
                <div className="panel-title" style={{ marginBottom: "12px" }}>Work Schedule</div>
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "12px" }}>
                  <div>
                    <div className="stat-label">Working Days</div>
                    <div className="stat-value">{data.summary.working_days}</div>
                  </div>
                  <div>
                    <div className="stat-label">Total Hours</div>
                    <div className="stat-value">{data.summary.total_hours}</div>
                  </div>
                  <div>
                    <div className="stat-label">Hourly Rate</div>
                    <div className="stat-value">{formatCurrency(data.summary.base_salary)}</div>
                  </div>
                </div>
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
                      <tr>
                        <td colSpan={4} className="empty-state">No timesheets for this period</td>
                      </tr>
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
            )}

            <div className="panel" style={{ background: "var(--bg-card)", padding: "16px", borderRadius: "8px" }}>
              <div className="panel-title" style={{ marginBottom: "8px" }}>Signature</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center" }}>
                <div style={{ flex: "1 1 280px" }}>
                  <div className="form-label">Signer Name</div>
                  <input
                    className="form-input"
                    value={signerName}
                    placeholder="Type full name"
                    readOnly
                  />
                </div>
                <div style={{ flex: "1 1 360px" }}>
                  <div className="form-label">Signature Field</div>
                  <div style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "8px", background: "var(--surface)" }}>
                    <canvas
                      ref={canvasRef}
                      style={{ width: "100%", height: "140px", display: "block", cursor: "crosshair" }}
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
              <div style={{ marginTop: "12px", display: "flex", gap: "10px", alignItems: "center" }}>
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
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    Signed at {new Date(signedAt).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
