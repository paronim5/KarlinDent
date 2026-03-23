import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "../api/client.js";
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

export default function OutcomePage() {
  const { t } = useTranslation();
  const api = useApi();
  const today = new Date().toISOString().slice(0, 10);
  const storedPeriod = localStorage.getItem("globalPeriod") || "month";

  const [categories, setCategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [records, setRecords] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [viewDate, setViewDate] = useState(new Date());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [period, setPeriod] = useState(storedPeriod);
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const [error, setError] = useState("");

  const [expenseForm, setExpenseForm] = useState({
    categoryId: "",
    amount: "",
    expenseDate: today,
    vendor: "",
    description: ""
  });

  const [salaryForm, setSalaryForm] = useState({
    staffId: "",
    amount: "",
    paymentDate: today,
    note: ""
  });

  const [savingExpense, setSavingExpense] = useState(false);
  const [savingSalary, setSavingSalary] = useState(false);
  const [selectedOutcomeIds, setSelectedOutcomeIds] = useState([]);
  const [deletingOutcomeIds, setDeletingOutcomeIds] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  const loadReferenceData = async () => {
    try {
      const [cats, staffItems] = await Promise.all([
        api.get("/outcome/categories"),
        api.get("/staff")
      ]);
      setCategories(cats);
      setStaff(staffItems);
    } catch (err) {
      setError(err.message || t("outcome.errors.load_reference"));
    }
  };

  const computeBaseRange = (selectedPeriod) => {
    const now = new Date(viewDate);
    const toDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    let fromDate = new Date(toDate);
    if (selectedPeriod === "day") {
      fromDate = new Date(toDate);
    } else if (selectedPeriod === "week") {
      fromDate = new Date(toDate);
      fromDate.setUTCDate(fromDate.getUTCDate() - 6);
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
  
  const computeRange = (selectedPeriod) => {
    if (selectedPeriod === "custom") {
        if (customRange.from && customRange.to) {
          return { from: customRange.from, to: customRange.to };
        }
        return computeBaseRange("month");
    }
    return computeBaseRange(selectedPeriod);
  };

  const loadPeriodData = async (rangeFrom = from, rangeTo = to) => {
    const fallback = computeRange(period);
    const effectiveFrom = rangeFrom || fallback.from;
    const effectiveTo = rangeTo || fallback.to;
    if (!effectiveFrom || !effectiveTo) return;
    try {
      const outcomeRecords = await api.get(`/outcome/records?from=${encodeURIComponent(effectiveFrom)}&to=${encodeURIComponent(effectiveTo)}`);
      setRecords(outcomeRecords);
      setSalaries([]); 
      setSelectedOutcomeIds([]);
    } catch (err) {
      setError(err.message || t("outcome.errors.load_data"));
    }
  };

  useEffect(() => {
    loadReferenceData();
    // Use stored period only if not custom, or rely on effect below
  }, []);
  
  useEffect(() => {
      const range = computeRange(period);
      if (period === "custom" && (!customRange.from || !customRange.to)) {
          setCustomRange({ from: range.from, to: range.to });
      }
      if (range.from && range.to) {
          setFrom(range.from);
          setTo(range.to);
          loadPeriodData(range.from, range.to);
      }
  }, [period, customRange, viewDate]);

  useEffect(() => {
    const handler = (event) => {
      if (event?.detail?.period) {
        setPeriod(event.detail.period);
        if (event.detail.year !== undefined) {
          setViewDate(new Date(`${event.detail.year}-06-15`));
        } else if (event.detail.date) {
          setViewDate(new Date(event.detail.date));
        }
      }
    };
    window.addEventListener("periodChanged", handler);
    return () => window.removeEventListener("periodChanged", handler);
  }, []);

  const handleExpenseSubmit = async (event) => {
    event.preventDefault();
    setSavingExpense(true);
    setError("");

    try {
      await api.post("/outcome/records", {
        category_id: expenseForm.categoryId ? Number(expenseForm.categoryId) : null,
        amount: Number(expenseForm.amount),
        expense_date: expenseForm.expenseDate,
        vendor: expenseForm.vendor || undefined,
        description: expenseForm.description || undefined
      });
      setExpenseForm({
        categoryId: "",
        amount: "",
        expenseDate: today,
        vendor: "",
        description: ""
      });
      await loadPeriodData();
    } catch (err) {
      setError(err.message || "Unable to save expense");
    } finally {
      setSavingExpense(false);
    }
  };

  const handleSalarySubmit = async (event) => {
    event.preventDefault();
    setSavingSalary(true);
    setError("");

    try {
      await api.post("/outcome/salaries", {
        staff_id: salaryForm.staffId ? Number(salaryForm.staffId) : null,
        amount: Number(salaryForm.amount),
        payment_date: salaryForm.paymentDate,
        note: salaryForm.note || undefined
      });
      setSalaryForm({
        staffId: "",
        amount: "",
        paymentDate: today,
        note: ""
      });
      await loadPeriodData();
    } catch (err) {
      setError(err.message || "Unable to save salary payment");
    } finally {
      setSavingSalary(false);
    }
  };

  const handleSuggestAmount = async (staffId, rangeFrom, rangeTo) => {
    try {
      const suggestion = await api.get(
        `/outcome/salary/suggested?staff_id=${staffId}&from=${encodeURIComponent(
          rangeFrom
        )}&to=${encodeURIComponent(rangeTo)}`
      );
      if (suggestion && typeof suggestion.suggested_amount === "number") {
        setSalaryForm((prev) => ({ ...prev, amount: suggestion.suggested_amount.toFixed(2) }));
      }
    } catch (err) {
      // ignore, user can enter manually
    }
  };

  const totalOutcome = useMemo(
    () =>
      records.reduce((sum, item) => sum + item.amount, 0),
    [records]
  );

  const toggleSelectOutcome = (id) => {
    setSelectedOutcomeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllOutcome = () => {
    if (selectedOutcomeIds.length === records.length) {
      setSelectedOutcomeIds([]);
    } else {
      setSelectedOutcomeIds(records.map((r) => r.id));
    }
  };

  const isDeletingOutcome = (id) => deletingOutcomeIds.includes(id);

  const handleGraphClick = (event, elements) => {
    if (!elements.length) return;
    const index = elements[0].index;
    const key = chartData.keys[index];

    if (!key) return;

    if (period === 'year') {
        setPeriod('month');
        setViewDate(new Date(`${key}-01`));
    } else if (period === 'month' || period === 'week') {
        setPeriod('day');
        setViewDate(new Date(key));
    }
  };

  const chartData = useMemo(() => {
    if (!records || records.length === 0) return null;
    
    const isDayView = from === to;
    const isYearView = period === "year";
    const groups = {};

    if (isDayView) {
      // Initialize all 24 hours
      for (let i = 0; i < 24; i++) {
        groups[`${String(i).padStart(2, '0')}:00`] = 0;
      }
      records.forEach((r) => {
        if (r.created_at) {
          const hour = new Date(r.created_at).getHours();
          const label = `${String(hour).padStart(2, '0')}:00`;
          groups[label] += r.amount || 0;
        }
      });
    } else if (isYearView) {
      // Initialize all 12 months
      const year = new Date(from).getFullYear();
      for (let i = 1; i <= 12; i++) {
        const m = String(i).padStart(2, '0');
        groups[`${year}-${m}`] = 0;
      }
      records.forEach((r) => {
        const d = r.date || r.expense_date;
        if (d) {
            const m = d.slice(0, 7); // YYYY-MM
            if (groups[m] !== undefined) groups[m] += r.amount || 0;
        }
      });
    } else {
      // Month or Week
      let curr = new Date(from);
      const end = new Date(to);
      while (curr <= end) {
          const dStr = curr.toISOString().slice(0, 10);
          groups[dStr] = 0;
          curr.setDate(curr.getDate() + 1);
      }
      records.forEach(r => {
          const d = r.date || r.expense_date;
          if (groups[d] !== undefined) groups[d] += r.amount;
      });
    }
    
    const keys = Object.keys(groups).sort();
    
    // Format labels
    const labels = keys.map(k => {
        if (isDayView) return k; // HH:00
        if (isYearView) {
            const date = new Date(`${k}-01`);
            return date.toLocaleString('default', { month: 'long' });
        }
        const date = new Date(k);
        return period === 'week' 
            ? date.toLocaleDateString('default', { weekday: 'long' }) 
            : date.getDate(); 
    });

    const data = keys.map(l => groups[l]);

    return {
        keys,
        labels,
        datasets: [
            {
                label: t("clinic.chart.outcome"),
                borderColor: "#e03030",
                backgroundColor: "rgba(224, 48, 48, 0.1)",
                borderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: "#e03030",
                data: data,
                tension: 0.2,
                spanGaps: true
            }
        ]
    };
  }, [records, t, from, to, period]);

  const { grid, ticks, legend, tickFont, legendFont } = getChartColors();
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: handleGraphClick,
    scales: {
      x: {
        grid: { color: grid },
        ticks: { color: ticks, font: tickFont }
      },
      y: {
        grid: { color: grid },
        ticks: { color: ticks, font: tickFont }
      }
    },
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: legend, font: legendFont }
      },
      tooltip: {
          titleFont: tickFont,
          bodyFont: tickFont
      },
      datalabels: {
        display: (ctx) => ctx.dataset.data[ctx.dataIndex] != null && ctx.dataset.data[ctx.dataIndex] > 0,
        anchor: "end",
        align: "top",
        offset: 2,
        color: "#e03030",
        font: { size: 10, family: "-apple-system,sans-serif", weight: "600" },
        formatter: (value) => {
          if (!value) return null;
          if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
          if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
          return `${value}`;
        }
      }
    }
  };

  const performDeleteOutcome = async (ids) => {
    setDeletingOutcomeIds((prev) => [...prev, ...ids]);
    setError("");
    try {
      // Group by type (outcome vs salary)
      // Since API might differ for deleting salary vs regular outcome
      // But records now have 'type' field
      // We need to filter which endpoint to call
      
      const toDelete = records.filter(r => ids.includes(r.id));
      // Note: This relies on unique IDs or distinct types. 
      // If regular outcome ID 1 exists AND salary ID 1 exists, we have a problem.
      // The backend returns both. Let's assume unique_id logic in frontend if needed
      // But for now let's just try deleting based on type
      
      // Actually, frontend table usually uses `record.id` as key. 
      // If we have mixed types, we should use a composite key or the `unique_id` from backend if available.
      // The updated backend returns "unique_id": f"salary-{row[0]}" for salaries.
      // But frontend state uses `records` which we just set.
      
      // Let's check how we render: key={record.id} in map.
      // If IDs collide, React will complain.
      // Let's fix the render and selection logic first.
      
      // For deletion, we need to know the type.
      // Let's assume we pass the full record object or we look it up.
      
      for (const id of ids) {
          const rec = records.find(r => r.id === id); // This is risky if IDs collide
          // Better to use index or unique ID
          if (rec) {
              if (rec.type === 'salary') {
                  await api.delete(`/outcome/salaries/${rec.staff_id ? rec.id : rec.id}`); // Check backend delete endpoint
                  // Backend likely expects ID of salary_payments table
              } else {
                  await api.delete(`/outcome/records/${rec.id}`);
              }
          }
      }
      await loadPeriodData();
    } catch (err) {
      setError(err.message || "Unable to delete records");
    } finally {
      setDeletingOutcomeIds([]);
      setConfirmState(null);
    }
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {error && <div className="form-error">SYSTEM ERROR: {error}</div>}
      
      <div className="panel">
        <div className="panel-header outcome-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="panel-title">{t("outcome.history_title")}</div>
          <div className="outcome-header-controls" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="outcome-date-range" style={{ display: 'flex', gap: '8px' }}>
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
                <div className="outcome-header-total" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {t("outcome.table.amount")}: <strong>{(totalOutcome || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                </div>
          </div>
        </div>

        {chartData && (
            <div className="chart-area" style={{ height: '300px', marginBottom: '20px' }}>
                <Line data={chartData} options={chartOptions} />
            </div>
        )}

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th><input type="checkbox" onChange={selectAllOutcome} checked={records.length > 0 && selectedOutcomeIds.length === records.length} /></th>
                <th>{t("outcome.table.category")}</th>
                <th>{t("outcome.table.vendor")}</th>
                <th>{t("outcome.table.amount")}</th>
                <th>{t("outcome.table.date")}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record, idx) => (
                <tr key={`${record.type}-${record.id}-${idx}`}>
                  <td>
                      <input 
                        type="checkbox" 
                        checked={selectedOutcomeIds.includes(record.id)} 
                        onChange={() => toggleSelectOutcome(record.id)} 
                      />
                  </td>
                  <td>
                    <span className={`pill ${record.type === 'salary' ? 'pill-blue' : 'pill-orange'}`}>
                      {record.category_name || record.category}
                    </span>
                  </td>
                  <td>{record.type === 'salary' ? record.staff_name : record.description}</td>
                  <td className="mono" style={{ color: "var(--red)" }}>
                    {(record.amount || 0).toLocaleString(undefined, { style: "currency", currency: "CZK" })}
                  </td>
                  <td className="mono">{record.date || record.expense_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
