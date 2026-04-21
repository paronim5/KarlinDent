import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import { useApi } from "../api/client.js";
import { formatMoney } from "../utils/currency.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

function getChartColors() {
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  const map = {
    dark:   { grid: "rgba(255,255,255,0.08)", ticks: "#8e8e93", legend: "#f5f5f7", tickFont: { family: "-apple-system,sans-serif", size: 12 }, legendFont: { family: "-apple-system,sans-serif", size: 12 } },
    light:  { grid: "rgba(0,0,0,0.08)",       ticks: "#6e6e73", legend: "#1c1c1e", tickFont: { family: "-apple-system,sans-serif", size: 12 }, legendFont: { family: "-apple-system,sans-serif", size: 12 } },
    galaxy: { grid: "rgba(77,159,255,0.12)",  ticks: "#7a9bbf", legend: "#e8f0ff", tickFont: { family: "-apple-system,sans-serif", size: 12 }, legendFont: { family: "-apple-system,sans-serif", size: 12 } },
  };
  return map[theme] || map.dark;
}

export default function StaffIncomeDashboard() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const storedPeriod = localStorage.getItem("globalPeriod") || "month";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const { grid, ticks, legend, tickFont, legendFont } = getChartColors();
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { color: grid },
        ticks: { color: ticks, font: tickFont },
      },
      y: {
        grid: { color: grid },
        ticks: { color: ticks, font: tickFont },
      },
    },
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: legend, font: legendFont },
      },
      datalabels: { display: false },
    },
  };

  const loadDashboard = async (rangeFrom = from, rangeTo = to) => {
    setLoading(true);
    setError("");
    try {
      const dashboard = await api.get(
        `/outcome/staff/self/dashboard?staff_id=1&from=${encodeURIComponent(
          rangeFrom
        )}&to=${encodeURIComponent(rangeTo)}`
      );
      setData(dashboard);
    } catch (err) {
      setError(err.message || t("my_income_dashboard.failed_load"));
    } finally {
      setLoading(false);
    }
  };

  const computeRange = (selectedPeriod) => {
    const now = new Date();
    const toDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    let fromDate = new Date(toDate);
    if (selectedPeriod === "day") {
      fromDate = new Date(toDate);
    } else if (selectedPeriod === "week") {
      const dow = toDate.getUTCDay();
      fromDate = new Date(toDate);
      fromDate.setUTCDate(fromDate.getUTCDate() - (dow + 6) % 7);
      const sunday = new Date(fromDate); sunday.setUTCDate(sunday.getUTCDate() + 6);
      toDate.setTime(sunday.getTime());
    } else if (selectedPeriod === "month") {
      fromDate = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1));
    } else if (selectedPeriod === "year") {
      fromDate = new Date(Date.UTC(toDate.getUTCFullYear(), 0, 1));
    }
    const format = (d) => d.toISOString().slice(0, 10);
    return { from: format(fromDate), to: format(toDate) };
  };

  useEffect(() => {
    const initial = computeRange(storedPeriod);
    setFrom(initial.from);
    setTo(initial.to);
    loadDashboard(initial.from, initial.to);
  }, []);

  useEffect(() => {
    const handler = (event) => {
      if (event?.detail?.from && event?.detail?.to) {
        setFrom(event.detail.from);
        setTo(event.detail.to);
        loadDashboard(event.detail.from, event.detail.to);
      }
    };
    window.addEventListener("periodChanged", handler);
    return () => window.removeEventListener("periodChanged", handler);
  }, []);

  const handleApplyRange = () => {
    if (from && to) {
      loadDashboard(from, to);
    }
  };

  const perDay = data?.hours?.per_day || [];

  const totals = data?.hours || {
    total_hours: 0,
    regular_hours: 0,
    overtime_hours: 0,
  };

  const salary = data?.salary || {
    base_rate: 0,
    overtime_rate: 0,
    base_pay: 0,
    overtime_pay: 0,
    total_pay: 0,
    bonuses: 0,
    deductions: 0,
  };

  const payments = data?.payments || [];

  const incomeChartData = useMemo(() => {
    const labels = perDay.map((d) => d.date);
    const totalsPerDay = perDay.map((d) => {
      const regular = d.regular_hours || 0;
      const overtime = d.overtime_hours || 0;
      return regular * salary.base_rate + overtime * salary.overtime_rate;
    });
    return {
      labels,
      datasets: [
        {
          label: t("my_income_dashboard.total_pay"),
          data: totalsPerDay,
          borderColor: "var(--accent)",
          backgroundColor: "rgba(249, 115, 22, 0.1)",
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.2,
        },
      ],
    };
  }, [perDay, salary.base_rate, salary.overtime_rate]);

  const handleExportCsv = () => {
    if (!data) return;
    const lines = [];
    lines.push(`${t("my_income_dashboard.col_date")},Hours,${t("my_income_dashboard.regular")},${t("my_income_dashboard.overtime")},${t("my_income_dashboard.total_pay")}`);
    perDay.forEach((d) => {
      const regular = d.regular_hours || 0;
      const overtime = d.overtime_hours || 0;
      const totalIncome = regular * salary.base_rate + overtime * salary.overtime_rate;
      lines.push(
        [
          d.date,
          d.hours.toFixed(2),
          regular.toFixed(2),
          overtime.toFixed(2),
          totalIncome.toFixed(2),
        ].join(",")
      );
    });
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `income-${from}-${to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <>
      <div className="panel">
        <div className="panel-header">
          <h2>{t("my_income_dashboard.title")}</h2>
          <div className="date-range-selector">
            <div className="form-group">
              <label htmlFor="from-date">{t("my_income_dashboard.from")}</label>
              <input id="from-date" className="form-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="to-date">{t("my_income_dashboard.to")}</label>
              <input id="to-date" className="form-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <button className="button" type="button" onClick={handleApplyRange} disabled={loading}>
              {loading ? t("my_income_dashboard.loading") : t("my_income_dashboard.apply")}
            </button>
          </div>
          <div className="button-group">
            <button className="button-outline" type="button" onClick={handleExportCsv} disabled={!data}>
              {t("my_income_dashboard.export_csv")}
            </button>
            <button className="button-outline" type="button" onClick={handlePrintPdf} disabled={!data}>
              {t("my_income_dashboard.print_pdf")}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="form-error">{t("my_income_dashboard.system_error", { error })}</div>}

      {data && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <h3>{t("my_income_dashboard.employment")}</h3>
              <p className="stat-value-main">{data.staff.role}</p>
              <p className="stat-value-sub">{t("my_income_dashboard.since", { date: data.staff.employment_start_date })}</p>
            </div>
            <div className="stat-card">
              <h3>{t("my_income_dashboard.total_hours")}</h3>
              <p className="stat-value-main">{totals.total_hours.toFixed(2)} h</p>
              <div className="stat-value-split">
                <span>{t("my_income_dashboard.regular")}: {totals.regular_hours.toFixed(2)}</span>
                <span>{t("my_income_dashboard.overtime")}: {totals.overtime_hours.toFixed(2)}</span>
              </div>
            </div>
            <div className="stat-card">
              <h3>{t("my_income_dashboard.total_pay")}</h3>
              <p className="stat-value-main accent">
                {formatMoney(salary.total_pay)}
              </p>
              <div className="stat-value-split">
                <span>{t("my_income_dashboard.base")}: {salary.base_pay.toFixed(0)}</span>
                <span>{t("my_income_dashboard.overtime")}: {salary.overtime_pay.toFixed(0)}</span>
              </div>
            </div>
          </div>

          <div className="two-col">
            <div className="panel">
              <div className="panel-header">
                <h2>{t("my_income_dashboard.income_trend")}</h2>
              </div>
              <div className="panel-body" style={{ height: "300px" }}>
                {perDay.length === 0 ? (
                  <div className="empty-state">{t("my_income_dashboard.no_hours")}</div>
                ) : (
                  <Line data={incomeChartData} options={chartOptions} />
                )}
              </div>
            </div>
            <div className="panel">
              <div className="panel-header">
                <h2>{t("my_income_dashboard.payment_history")}</h2>
              </div>
              <div className="panel-body">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("my_income_dashboard.col_date")}</th>
                      <th>{t("my_income_dashboard.col_amount")}</th>
                      <th>{t("my_income_dashboard.col_note")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td>{p.payment_date}</td>
                        <td className="accent">{formatMoney(p.amount)}</td>
                        <td>{p.note || "-"}</td>
                      </tr>
                    ))}
                    {payments.length === 0 && (
                      <tr>
                        <td colSpan={3} className="empty-state">{t("my_income_dashboard.no_payments")}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
