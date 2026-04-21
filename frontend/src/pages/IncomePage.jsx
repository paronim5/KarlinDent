import { useCallback, useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useApi } from "../api/client.js";
import { formatMoney } from "../utils/currency.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, ChartDataLabels);

function getChartColors() {
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  const map = {
    dark:   { grid: "rgba(255,255,255,0.08)", ticks: "#8e8e93", legend: "#f5f5f7", tickFont: { family: "-apple-system,sans-serif", size: 12 }, legendFont: { family: "-apple-system,sans-serif", size: 12 } },
    light:  { grid: "rgba(0,0,0,0.08)",       ticks: "#6e6e73", legend: "#1c1c1e", tickFont: { family: "-apple-system,sans-serif", size: 12 }, legendFont: { family: "-apple-system,sans-serif", size: 12 } },
    galaxy: { grid: "rgba(77,159,255,0.12)",  ticks: "#7a9bbf", legend: "#e8f0ff", tickFont: { family: "-apple-system,sans-serif", size: 12 }, legendFont: { family: "-apple-system,sans-serif", size: 12 } },
  };
  return map[theme] || map.dark;
}

export default function IncomePage() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const storedPeriod = typeof window !== "undefined" ? window.localStorage.getItem("globalPeriod") : null;

  const [viewDate, setViewDate] = useState(new Date());
  const [period, setPeriod] = useState(storedPeriod || "month");
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedIds, setSelectedIds] = useState([]);
  const [deletingIds, setDeletingIds] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState([]);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  const periodLabels = useMemo(
    () => ({
      year: t("income.period.year"),
      month: t("income.period.month"),
      week: t("income.period.week"),
      day: t("income.period.day"),
      custom: t("income.period.custom")
    }),
    [t]
  );

  const computeRange = (selectedPeriod) => {
    if (selectedPeriod === "custom") {
        return { from: customRange.from, to: customRange.to };
    }
    const now = new Date(viewDate);
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
      toDate.setUTCDate(new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth() + 1, 0)).getUTCDate());
    } else if (selectedPeriod === "year") {
      fromDate = new Date(Date.UTC(toDate.getUTCFullYear(), 0, 1));
      toDate.setMonth(11, 31);
    }
    const format = (d) => d.toISOString().slice(0, 10);
    return { from: format(fromDate), to: format(toDate) };
  };

  const range = useMemo(() => computeRange(period), [period, customRange, viewDate]);

  const downloadPatientsPdf = useCallback(async () => {
    const { from, to } = range;
    if (!from || !to) return;
    setPdfDownloading(true);
    try {
      const response = await fetch(`/api/patients/report/pdf?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (!response.ok) throw new Error("Failed to generate PDF");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `patient_payments_${from}_${to}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "Failed to download PDF");
    } finally {
      setPdfDownloading(false);
    }
  }, [range]);

  const loadRecords = async (rangeFrom = range.from, rangeTo = range.to) => {
    if (!rangeFrom || !rangeTo) return;
    setLoading(true);
    setError("");
    try {
      const items = await api.get(
        `/income/records?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(
          rangeTo
        )}`
      );
      setRecords(Array.isArray(items) ? items : []);
      setSelectedIds([]);
    } catch (err) {
      setRecords([]); // Ensure records is array on error
      setError(err.message || t("income.errors.load_records"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (period !== "custom" || (customRange.from && customRange.to)) {
        loadRecords(range.from, range.to);
    }

    const handleRefresh = () => loadRecords(range.from, range.to);
    window.addEventListener("incomeAdded", handleRefresh);
    return () => window.removeEventListener("incomeAdded", handleRefresh);
  }, [period, customRange]);

  useEffect(() => {
    const handler = (event) => {
      if (!event?.detail?.period) return;
      setPeriod(event.detail.period);
      if (event.detail.from && event.detail.to) {
        // Use the exact range from Layout so navigation arrows always work
        loadRecords(event.detail.from, event.detail.to);
      } else if (event.detail.year !== undefined) {
        setViewDate(new Date(`${event.detail.year}-06-15`));
      } else if (event.detail.date) {
        setViewDate(new Date(event.detail.date));
      }
    };
    window.addEventListener("periodChanged", handler);
    return () => window.removeEventListener("periodChanged", handler);
  }, []);

  const handleGraphClick = (event, elements) => {
    if (!elements.length) return;
    const index = elements[0].index;
    const label = chartData.labels[index];
    
    // We need to map label back to a date or key.
    // In chartData construction, we sorted keys.
    // So chartData.keys[index] would be ideal if we stored it.
    // Let's modify chartData to include keys.
    const key = chartData.keys[index];

    if (!key) return;

    if (period === 'year') {
        setPeriod('month');
        setViewDate(new Date(`${key}-01`));
    } else if (period === 'month' || period === 'week') {
        setPeriod('day');
        setViewDate(new Date(key));
    }
    // Day view click: do nothing or navigate? ClinicPage navigates.
    // Here we just stay.
  };

  const dailyTotal = useMemo(
    () => records.reduce((sum, item) => sum + item.amount, 0),
    [records]
  );

  const paymentTotals = useMemo(() => {
    if (!Array.isArray(records)) return { cash: 0, card: 0, total: 0 };
    return records.reduce(
      (acc, item) => {
        const value = item.amount || 0;
        if (item.payment_method === "card") {
          acc.card += value;
        } else if (item.payment_method === "cash") {
          acc.cash += value;
        }
        acc.total += value;
        return acc;
      },
      { cash: 0, card: 0, total: 0 }
    );
  }, [records]);

  const chartData = useMemo(() => {
    if (!records || records.length === 0) return null;
    
    const isDayView = range.from === range.to;
    const isYearView = period === "year";
    const groups = {};

    if (isDayView) {
      // Initialize all 24 hours
      for (let i = 0; i < 24; i++) {
        groups[`${String(i).padStart(2, '0')}:00`] = 0;
      }
      records.forEach((r) => {
        if (r.created_at) {
          const dt = new Date(r.created_at);
          if (!isNaN(dt.getTime())) {
            const hour = dt.getHours();
            const label = `${String(hour).padStart(2, '0')}:00`;
            groups[label] += r.amount || 0;
          }
        }
      });
    } else if (isYearView) {
      // Initialize all 12 months
      const year = new Date(range.from).getFullYear();
      if (!isNaN(year)) {
        for (let i = 1; i <= 12; i++) {
            const m = String(i).padStart(2, '0');
            groups[`${year}-${m}`] = 0;
        }
        records.forEach((r) => {
            const d = r.service_date; // YYYY-MM-DD
            if (d) {
                const m = d.slice(0, 7); // YYYY-MM
                if (groups[m] !== undefined) {
                    groups[m] += r.amount || 0;
                }
            }
        });
      }
    } else {
      // Month or Week view - Daily
      // We should ideally initialize all days in range to 0, but records might be sparse.
      // ClinicPage likely fills gaps. Let's fill gaps if possible.
      let curr = new Date(range.from);
      const end = new Date(range.to);
      if (!isNaN(curr.getTime()) && !isNaN(end.getTime())) {
        while (curr <= end) {
            const dStr = curr.toISOString().slice(0, 10);
            groups[dStr] = 0;
            curr.setDate(curr.getDate() + 1);
        }
        records.forEach((r) => {
            const d = r.service_date;
            if (groups[d] !== undefined) groups[d] += r.amount || 0;
        });
      }
    }

    const keys = Object.keys(groups).sort();
    
    // Format labels
    const labels = keys.map(k => {
        if (isDayView) return k; // HH:00
        if (isYearView) {
            // k is YYYY-MM
            const date = new Date(`${k}-01`);
            if (isNaN(date.getTime())) return k;
            return date.toLocaleString(i18n.language, { month: 'long' }).replace(/^./, c => c.toUpperCase());
        }
        // Daily
        const date = new Date(k);
        if (isNaN(date.getTime())) return k;
        return period === 'week'
            ? date.toLocaleDateString(i18n.language, { weekday: 'long' }).replace(/^./, c => c.toUpperCase())
            : date.getDate(); // 1, 2, 3...
    });

    const data = keys.map((l) => groups[l]);
    
    return {
      keys,
      labels,
      datasets: [
        {
          label: t("clinic.chart.income"),
          borderColor: "#2ecc40",
          backgroundColor: "rgba(46, 204, 64, 0.1)",
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: "#2ecc40",
          data,
          tension: 0.2,
          spanGaps: true
        },
      ],
    };
  }, [records, t, range, period]);

  const { grid, ticks, legend, tickFont, legendFont } = getChartColors();
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: handleGraphClick,
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
      tooltip: {
        titleFont: tickFont,
        bodyFont: tickFont,
      },
      datalabels: {
        display: false
      }
    },
  };

  const isJsdom = typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent || "");
  const canRenderChart = !isJsdom;

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllVisible = () => {
    if (selectedIds.length === records.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(records.map((r) => r.id));
    }
  };

  const isDeleting = (id) => deletingIds.includes(id);

  const requestDelete = (ids) => {
    const hasPaid = ids.some(id => records.find(r => r.id === id)?.salary_payment_id);
    if (hasPaid) {
      setPendingDeleteIds(ids);
      setShowDeleteModal(true);
    } else {
      performDelete(ids, "delete_only");
    }
  };

  const performDelete = async (ids, mode = "delete_only") => {
    setDeletingIds((prev) => [...prev, ...ids]);
    setError("");
    try {
      for (const id of ids) {
        await api.delete(`/income/records/${id}?mode=${mode}`);
      }
      await loadRecords();
    } catch (err) {
      setError(err.message || "Unable to delete income records");
    } finally {
      setDeletingIds([]);
      setShowDeleteModal(false);
      setPendingDeleteIds([]);
    }
  };

  return (
    <>
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">Delete Paid Records</div>
            <div className="modal-body">
              <p>Some selected records have already been paid out in salaries.</p>
              <p>How do you want to handle the salary adjustment?</p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => performDelete(pendingDeleteIds, "adjust_next")}>
                Delete & Deduct from Next Salary
              </button>
              <button className="btn btn-warning" onClick={() => performDelete(pendingDeleteIds, "ignore")}>
                Delete & Ignore (Keep Salary)
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="form-error" role="alert">
          {error}
          <button
            className="btn btn-ghost"
            style={{ marginLeft: "12px", padding: "6px 12px", fontSize: "12px" }}
            onClick={() => loadRecords(range.from, range.to)}
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      <div className="stat-strip">
        <div className="stat-card s-green">
          <div className="stat-icon">↗</div>
          <div className="stat-label">{t("income.stats.total")}</div>
          <div className="stat-value">
            {loading ? "—" : formatMoney(paymentTotals.total)}
          </div>
        </div>
        <div className="stat-card s-blue">
          <div className="stat-icon">◉</div>
          <div className="stat-label">{t("income.stats.records")}</div>
          <div className="stat-value">{loading ? "—" : records.length}</div>
        </div>
        <div className="stat-card s-orange">
          <div className="stat-icon">◈</div>
          <div className="stat-label">{t("income.stats.avg")}</div>
          <div className="stat-value">
            {loading
              ? "—"
              : formatMoney(records.length > 0 ? paymentTotals.total / records.length : 0)}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: '20px' }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">{t("income.trend_title")}</div>
            <div className="panel-meta" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {period !== 'custom' ? (
                t("income.period_meta", { period: periodLabels[period] })
              ) : (
                <span>Custom Range</span>
              )}
              <div style={{ display: 'flex', gap: '8px', marginLeft: '10px' }}>
                <input
                  type="date"
                  value={customRange.from}
                  onChange={(e) => {
                    setCustomRange((p) => ({ ...p, from: e.target.value }));
                    setPeriod("custom");
                  }}
                  className="form-input"
                  style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}
                />
                <span style={{ alignSelf: "center" }}>-</span>
                <input
                  type="date"
                  value={customRange.to}
                  onChange={(e) => {
                    setCustomRange((p) => ({ ...p, to: e.target.value }));
                    setPeriod("custom");
                  }}
                  className="form-input"
                  style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="chart-area" style={{ height: "300px", marginBottom: "20px" }}>
          {canRenderChart && chartData && <Line data={chartData} options={chartOptions} />}
        </div>
      </div>

      <div className="panel" style={{ marginTop: '20px' }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">{t("income.title")}</div>
            <div className="panel-meta" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {period !== 'custom' ? (
                    t("income.period_meta", { period: periodLabels[period] })
                ) : (
                    <span>Custom Range</span>
                )}
                <div style={{ display: 'flex', gap: '8px', marginLeft: '10px' }}>
                    <input 
                        type="date" 
                        value={customRange.from} 
                        onChange={(e) => {
                            setCustomRange(p => ({...p, from: e.target.value}));
                            setPeriod('custom');
                        }}
                        className="form-input"
                        style={{ padding: '4px 8px', fontSize: '12px', width: 'auto' }}
                    />
                    <span style={{ alignSelf: 'center' }}>-</span>
                    <input 
                        type="date" 
                        value={customRange.to} 
                        onChange={(e) => {
                            setCustomRange(p => ({...p, to: e.target.value}));
                            setPeriod('custom');
                        }}
                        className="form-input"
                        style={{ padding: '4px 8px', fontSize: '12px', width: 'auto' }}
                    />
                </div>
            </div>
          </div>
          <div className="topbar-actions">
            <button
              className="btn btn-ghost"
              onClick={downloadPatientsPdf}
              disabled={pdfDownloading || records.length === 0}
            >
              {pdfDownloading ? "Generating…" : "Export PDF"}
            </button>
            <button className="btn btn-ghost" onClick={() => performDelete(selectedIds)} disabled={selectedIds.length === 0}>
              {t("common.delete")} ({selectedIds.length})
            </button>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th><input type="checkbox" onChange={selectAllVisible} checked={selectedIds.length === records.length && records.length > 0} /></th>
                <th>{t("income.table.patient")}</th>
                <th>{t("income.table.doctor")}</th>
                <th>{t("income.table.amount")}</th>
                <th>{t("income.form.lab_cost")}</th>
                <th>{t("income.table.method")}</th>
                <th>{t("income.table.status")}</th>
                <th>{t("income.table.date")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                [...Array(4)].map((_, idx) => (
                  <tr key={`s-${idx}`}>
                    <td><div className="skeleton-line" style={{ width: "16px" }} /></td>
                    <td><div className="skeleton-line" /></td>
                    <td><div className="skeleton-line" /></td>
                    <td><div className="skeleton-line" /></td>
                    <td><div className="skeleton-line" /></td>
                    <td><div className="skeleton-line" /></td>
                    <td><div className="skeleton-line" /></td>
                    <td><div className="skeleton-line" /></td>
                  </tr>
                ))
              )}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty-state">{t("income.empty_state")}</td>
                </tr>
              )}
              {!loading && records.map((record) => (
                <tr key={record.id} className={selectedIds.includes(record.id) ? "selected" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(record.id)}
                      onChange={() => toggleSelect(record.id)}
                    />
                  </td>
                  <td>{record.patient.last_name}</td>
                  <td>{record.doctor.last_name}</td>
                  <td className="mono" style={{ color: "var(--green)" }}>
                    {formatMoney(record.amount)}
                  </td>
                  <td className="mono" style={{ color: record.lab_cost > 0 ? "var(--red)" : "inherit" }}>
                    {record.lab_cost > 0 ? formatMoney(record.lab_cost) : "-"}
                  </td>
                  <td>
                    <span className={`pill ${record.payment_method === 'cash' ? 'pill-green' : 'pill-blue'}`}>
                      {t(`income.form.${record.payment_method}`)}
                    </span>
                  </td>
                  <td>
                    {record.salary_payment_id ? (
                      <span className="pill pill-green">{t("income.table.paid")}</span>
                    ) : (
                      <span className="pill pill-yellow">{t("income.table.unpaid")}</span>
                    )}
                  </td>
                  <td className="mono">{record.service_date}</td>
                  <td>
                    <button 
                      className="btn btn-ghost" 
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                      onClick={(e) => { e.stopPropagation(); navigate(`/income/edit/${record.id}`); }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
