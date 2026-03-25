import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Legend,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { useTranslation } from "react-i18next";
import { useApi } from "../api/client.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, ChartDataLabels);

function getChartColors() {
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  const map = {
    dark:   { grid: "rgba(255,255,255,0.08)", ticks: "#8e8e93", legend: "#f5f5f7", font: { family: "-apple-system,sans-serif", size: 12 } },
    light:  { grid: "rgba(0,0,0,0.08)",       ticks: "#6e6e73", legend: "#1c1c1e", font: { family: "-apple-system,sans-serif", size: 12 } },
    galaxy: { grid: "rgba(77,159,255,0.12)",  ticks: "#7a9bbf", legend: "#e8f0ff", font: { family: "-apple-system,sans-serif", size: 12 } },
  };
  return map[theme] || map.dark;
}

export default function PatientDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = async (from = fromDate, to = toDate) => {
    setLoading(true);
    setError("");
    try {
      const params = from && to ? `?from=${from}&to=${to}` : "";
      const res = await api.get(`/patients/${id}${params}`);
      setData(res);
    } catch (err) {
      setError(err.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const fmt = (n) => Number(n || 0).toLocaleString(undefined, { style: "currency", currency: "CZK" });

  const exportCSV = () => {
    if (!data?.records?.length) return;
    const name = [data.patient.last_name, data.patient.first_name].filter(Boolean).join(" ");
    const header = ["Date", "Doctor", "Amount (CZK)", "Lab Cost (CZK)", "Payment", "Note"];
    const rows = data.records.map(r => [
      r.service_date, r.doctor_name,
      r.amount.toFixed(2), r.lab_cost.toFixed(2),
      r.payment_method, r.note,
    ]);
    const csv = [header, ...rows].map(r =>
      r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url;
    a.download = `patient_${name.replace(/\s+/g, "_")}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const { grid, ticks, legend, font } = getChartColors();
  const chartData = data?.trend?.length ? {
    labels: data.trend.map(d =>
      new Date(`${d.month}-01`).toLocaleString(i18n.language, { month: "short", year: "numeric" })
        .replace(/^./, c => c.toUpperCase())
    ),
    datasets: [{
      label: t("patients.chart_label"),
      data: data.trend.map(d => d.amount),
      borderColor: "#0ea5e9",
      backgroundColor: "rgba(14,165,233,0.1)",
      borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
      pointBackgroundColor: "#0ea5e9", tension: 0.2, spanGaps: true,
    }],
  } : null;

  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    scales: {
      x: { grid: { color: grid }, ticks: { color: ticks, font } },
      y: { grid: { color: grid }, ticks: { color: ticks, font } },
    },
    plugins: {
      legend: { position: "bottom", labels: { color: legend, font } },
      tooltip: { titleFont: font, bodyFont: font },
      datalabels: { display: false },
    },
  };

  if (loading) return (
    <div className="panel" style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>
      {t("common.loading")}
    </div>
  );

  if (error) return (
    <div className="panel" style={{ textAlign: "center", padding: 40 }}>
      <div className="form-error">{error}</div>
      <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => navigate("/patients")}>
        ← {t("patients.back")}
      </button>
    </div>
  );

  const patientName = data ? [data.patient.last_name, data.patient.first_name].filter(Boolean).join(" ") : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <button className="btn btn-ghost" style={{ marginBottom: 8, padding: "3px 8px", fontSize: 12 }}
              onClick={() => navigate("/patients")}>
              ← {t("patients.back")}
            </button>
            <div className="panel-title">
              {patientName}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", marginLeft: 10 }}>
                #{data.patient.id}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="stat-strip">
        <div className="stat-card s-green">
          <div className="stat-icon">↗</div>
          <div className="stat-label">{t("patients.stats.total_paid")}</div>
          <div className="stat-value">{fmt(data.stats.total_paid)}</div>
        </div>
        <div className="stat-card s-blue">
          <div className="stat-icon">◉</div>
          <div className="stat-label">{t("patients.stats.visits")}</div>
          <div className="stat-value">{data.stats.visit_count}</div>
        </div>
        <div className="stat-card s-orange">
          <div className="stat-icon">◈</div>
          <div className="stat-label">{t("patients.stats.avg_visit")}</div>
          <div className="stat-value">{fmt(data.stats.avg_per_visit)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⊕</div>
          <div className="stat-label">{t("patients.stats.lab_cost")}</div>
          <div className="stat-value">{fmt(data.stats.total_lab_cost)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">◷</div>
          <div className="stat-label">{t("patients.stats.last_visit")}</div>
          <div className="stat-value" style={{ fontSize: 14 }}>{data.stats.last_visit || "—"}</div>
        </div>
      </div>

      {/* Spending trend */}
      {chartData && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">{t("patients.trend_title")}</div>
          </div>
          <div className="chart-area" style={{ height: 260 }}>
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>
      )}

      {/* Records */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">{t("patients.records_title")}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
              <input type="date" className="form-input" value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={{ padding: "3px 8px", fontSize: 12, width: "auto" }} />
              <span style={{ color: "var(--muted)" }}>–</span>
              <input type="date" className="form-input" value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={{ padding: "3px 8px", fontSize: 12, width: "auto" }} />
              <button className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 12 }}
                onClick={() => load(fromDate, toDate)}>
                {t("patients.filter")}
              </button>
              {(fromDate || toDate) && (
                <button className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 12 }}
                  onClick={() => { setFromDate(""); setToDate(""); load("", ""); }}>
                  ✕
                </button>
              )}
            </div>
          </div>
          <div className="topbar-actions">
            <button className="btn btn-ghost" onClick={exportCSV} disabled={!data.records.length}>
              {t("common.export_csv")}
            </button>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("patients.table.date")}</th>
                <th>{t("patients.table.doctor")}</th>
                <th>{t("patients.table.amount")}</th>
                <th>{t("patients.table.lab_cost")}</th>
                <th>{t("patients.table.payment")}</th>
                <th>{t("patients.table.note")}</th>
              </tr>
            </thead>
            <tbody>
              {data.records.length === 0 && (
                <tr><td colSpan={6} className="empty-state">{t("patients.no_records")}</td></tr>
              )}
              {data.records.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.service_date}</td>
                  <td>{r.doctor_name}</td>
                  <td className="mono" style={{ color: "var(--green)" }}>{fmt(r.amount)}</td>
                  <td className="mono" style={{ color: r.lab_cost > 0 ? "var(--red)" : "inherit" }}>
                    {r.lab_cost > 0 ? fmt(r.lab_cost) : "—"}
                  </td>
                  <td>
                    <span className={`pill ${r.payment_method === "cash" ? "pill-green" : "pill-blue"}`}>
                      {t(`income.form.${r.payment_method}`)}
                    </span>
                  </td>
                  <td style={{ color: "var(--muted)", fontSize: 12 }}>{r.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
