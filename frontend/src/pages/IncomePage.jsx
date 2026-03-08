import { useEffect, useMemo, useState } from "react";
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
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useApi } from "../api/client.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function IncomePage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const storedPeriod = typeof window !== "undefined" ? window.localStorage.getItem("globalPeriod") : null;

  const [records, setRecords] = useState([]);
  const [period, setPeriod] = useState(storedPeriod || "month");
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedIds, setSelectedIds] = useState([]);
  const [deletingIds, setDeletingIds] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState([]);

  const periodLabels = useMemo(
    () => ({
      year: t("income.period.year"),
      month: t("income.period.month"),
      week: t("income.period.week"),
      day: t("income.period.day"),
      custom: "Custom"
    }),
    [t]
  );

  const computeRange = (selectedPeriod) => {
    if (selectedPeriod === "custom") {
        return { from: customRange.from, to: customRange.to };
    }
    const now = new Date();
    const toDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    let fromDate = new Date(toDate);
    if (selectedPeriod === "day") {
      fromDate = new Date(toDate);
    } else if (selectedPeriod === "week") {
      fromDate = new Date(toDate);
      fromDate.setUTCDate(fromDate.getUTCDate() - 6);
    } else if (selectedPeriod === "month") {
      fromDate = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1));
    } else if (selectedPeriod === "year") {
      fromDate = new Date(Date.UTC(toDate.getUTCFullYear(), 0, 1));
    }
    const format = (d) => d.toISOString().slice(0, 10);
    return { from: format(fromDate), to: format(toDate) };
  };

  const range = useMemo(() => computeRange(period), [period, customRange]);

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
      setRecords(items);
      setSelectedIds([]);
    } catch (err) {
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
      if (event?.detail?.period) {
        setPeriod(event.detail.period);
      }
    };
    window.addEventListener("periodChanged", handler);
    return () => window.removeEventListener("periodChanged", handler);
  }, []);

  const dailyTotal = useMemo(
    () => records.reduce((sum, item) => sum + item.amount, 0),
    [records]
  );

  const paymentTotals = useMemo(() => {
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
    const groups = {};
    records.forEach((r) => {
      const d = r.service_date;
      if (!groups[d]) groups[d] = 0;
      groups[d] += r.amount || 0;
    });
    const labels = Object.keys(groups).sort();
    const data = labels.map((l) => groups[l]);
    return {
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
        },
      ],
    };
  }, [records, t]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { color: "rgba(255, 215, 0, 0.1)" },
        ticks: { color: "#ffd700", font: { family: "VT323", size: 14 } },
      },
      y: {
        grid: { color: "rgba(255, 215, 0, 0.1)" },
        ticks: { color: "#ffd700", font: { family: "VT323", size: 14 } },
      },
    },
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: "#f5f0dc", font: { family: "Press Start 2P", size: 8 } },
      },
      tooltip: {
        titleFont: { family: "VT323", size: 14 },
        bodyFont: { family: "VT323", size: 14 },
      },
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
            {loading ? "—" : (paymentTotals.total || 0).toLocaleString(undefined, { style: "currency", currency: "CZK" })}
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
              : (records.length > 0 ? paymentTotals.total / records.length : 0).toLocaleString(undefined, {
                  style: "currency",
                  currency: "CZK"
                })}
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
                    {(record.amount || 0).toLocaleString(undefined, { style: "currency", currency: "CZK" })}
                  </td>
                  <td className="mono" style={{ color: record.lab_cost > 0 ? "var(--red)" : "inherit" }}>
                    {record.lab_cost > 0 ? (record.lab_cost || 0).toLocaleString(undefined, { style: "currency", currency: "CZK" }) : "-"}
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
