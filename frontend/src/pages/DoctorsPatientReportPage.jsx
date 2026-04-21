import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useApi } from "../api/client.js";
import { useAuth } from "../App.jsx";
import { formatMoney as fmt } from "../utils/currency.js";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthISO() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
}

export default function DoctorsPatientReportPage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [from, setFrom] = useState(firstOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const load = async (f = from, t = to) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ from: f, to: t });
      const res = await api.get(`/staff/doctors/patients-report/data?${query}`);
      setData(res);
    } catch (err) {
      setError(err.message || t("doctors_report.failed_load"));
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async () => {
    setDownloading(true);
    setError("");
    try {
      const query = new URLSearchParams({ from, to });
      const url = `/api/staff/doctors/patients-report/pdf?${query}`;
      const headers = {};
      if (user?.id) headers["X-Staff-Id"] = String(user.id);
      if (user?.role) headers["X-Staff-Role"] = String(user.role);
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(t("doctors_report.failed_pdf"));
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `patient_revenue_report_${from}_${to}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err.message || t("doctors_report.failed_pdf"));
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => { load(); }, []);


  const totalSalaryAll = data?.doctors?.reduce(
    (sum, d) => sum + (d.summary?.total_salary || 0),
    0
  ) ?? 0;

  return (
    <div>
      {/* Controls */}
      <div className="panel" style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <div className="form-label">{t("doctors_report.from")}</div>
            <input
              type="date"
              className="form-input"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <div className="form-label">{t("doctors_report.to")}</div>
            <input
              type="date"
              className="form-input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={() => load(from, to)}
            disabled={loading}
          >
            {loading ? t("doctors_report.loading") : t("doctors_report.load_report")}
          </button>
          <button
            className="btn btn-primary"
            onClick={downloadPdf}
            disabled={!data || downloading}
          >
            {downloading ? t("doctors_report.generating_pdf") : t("doctors_report.download_pdf")}
          </button>
          <button className="btn btn-ghost" onClick={() => navigate(-1)}>
            {t("doctors_report.back")}
          </button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {data && (
        <div>
          {/* Report header */}
          <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div className="panel-title" style={{ fontSize: 20 }}>{t("doctors_report.title")}</div>
                <div className="panel-meta">
                  {t("doctors_report.period")}: {data.period.from} — {data.period.to}
                </div>
              </div>
              <div className="stat-card s-green" style={{ minWidth: 160 }}>
                <div className="stat-label">{t("doctors_report.total_salary_all")}</div>
                <div className="stat-value">{fmt(totalSalaryAll)}</div>
              </div>
            </div>
          </div>

          {data.doctors.length === 0 && (
            <div className="panel" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
              {t("doctors_report.no_doctors")}
            </div>
          )}

          {data.doctors.map((doctor) => (
            <div
              key={doctor.staff.id}
              className="panel"
              style={{ marginBottom: 16, padding: 16 }}
            >
              {/* Doctor header */}
              <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div className="panel-title">
                    {doctor.staff.first_name} {doctor.staff.last_name}
                  </div>
                  <div className="panel-meta">
                    {t("doctors_report.doctor_meta", { rate: ((doctor.summary.commission_rate || 0) * 100).toFixed(0) })}
                  </div>
                </div>
                <div style={{ fontWeight: "bold", fontSize: 15 }}>
                  {t("doctors_report.total_salary")}: <span className="mono" style={{ color: "var(--green)" }}>{fmt(doctor.summary.total_salary)}</span>
                </div>
              </div>

              {/* Patient table */}
              <div className="table-wrapper" style={{ marginBottom: 12 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("doctors_report.col_patient")}</th>
                      <th style={{ textAlign: "right" }}>{t("doctors_report.col_paid")}</th>
                      <th style={{ textAlign: "right" }}>{t("doctors_report.col_lab_cost")}</th>
                      <th style={{ textAlign: "right" }}>{t("doctors_report.col_net")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctor.patients.length === 0 && (
                      <tr>
                        <td colSpan={4} className="empty-state">
                          {t("doctors_report.no_patients")}
                        </td>
                      </tr>
                    )}
                    {doctor.patients.map((p, i) => (
                      <tr key={i}>
                        <td>{p.name}</td>
                        <td className="mono" style={{ textAlign: "right" }}>
                          {fmt(p.total_paid)}
                        </td>
                        <td className="mono" style={{ textAlign: "right", color: p.lab_fee > 0 ? "var(--red)" : undefined }}>
                          {p.lab_fee > 0 ? `-${fmt(p.lab_fee)}` : "—"}
                        </td>
                        <td className="mono" style={{ textAlign: "right" }}>
                          {fmt(p.net_paid)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Salary breakdown */}
              <div style={{
                borderTop: "1px solid var(--border)",
                paddingTop: 10,
                display: "grid",
                gap: 4,
              }}>
                {[
                  [t("doctors_report.base_salary"), fmt(doctor.summary.base_salary)],
                  [
                    t("doctors_report.commission", { rate: ((doctor.summary.commission_rate || 0) * 100).toFixed(0) }),
                    fmt(doctor.summary.total_commission),
                  ],
                  [
                    t("doctors_report.lab_fees_deduction"),
                    doctor.summary.total_lab_fees > 0
                      ? `-${fmt(doctor.summary.total_lab_fees)}`
                      : fmt(0),
                  ],
                  ...(doctor.summary.adjustments
                    ? [[t("doctors_report.adjustments"), fmt(doctor.summary.adjustments)]]
                    : []),
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)" }}
                  >
                    <span>{label}</span>
                    <span className="mono">{value}</span>
                  </div>
                ))}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontWeight: "bold",
                  borderTop: "1px solid var(--border)",
                  marginTop: 4,
                  paddingTop: 6,
                }}>
                  <span>{t("doctors_report.total_salary")}</span>
                  <span className="mono" style={{ color: "var(--green)" }}>
                    {fmt(doctor.summary.total_salary)}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {/* Grand total footer */}
          {data.doctors.length > 1 && (
            <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: 16 }}>
                <span>{t("doctors_report.grand_total")}</span>
                <span className="mono" style={{ color: "var(--green)" }}>{fmt(totalSalaryAll)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
