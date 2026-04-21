import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from "chart.js";
import { Line } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
import { useApi } from "../api/client.js";
import { formatMoney as formatCurrency } from "../utils/currency.js";

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

export default function DoctorPage() {
  const { id } = useParams();
  const api = useApi();
  const { i18n } = useTranslation();
  const storedPeriod = localStorage.getItem("globalPeriod") || "month";

  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState(storedPeriod);
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const [range, setRange] = useState({ from: "", to: "" });
  const [rangeError, setRangeError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [commissionData, setCommissionData] = useState(null);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [commissionError, setCommissionError] = useState("");
  const [commissionStats, setCommissionStats] = useState(null);
  const [commissionStatsLoading, setCommissionStatsLoading] = useState(false);
  const [commissionStatsError, setCommissionStatsError] = useState("");
  const [trendData, setTrendData] = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState("");
  const [hourlyData, setHourlyData] = useState(null);
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const [hourlyError, setHourlyError] = useState("");
  const [showIncome, setShowIncome] = useState(true);
  const [showOutcome, setShowOutcome] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState("");
  const [documentFilter, setDocumentFilter] = useState({ from: "", to: "" });
  const [shifts, setShifts] = useState([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);

  const { grid, ticks, legend, tickFont, legendFont } = getChartColors();
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
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
      datalabels: { display: false }
    },
    animation: {
      duration: 350,
      easing: "easeOutQuart"
    }
  };

  const computeRange = (selectedPeriod, custom) => {
    if (selectedPeriod === "custom") {
      return { from: custom.from, to: custom.to };
    }
    const now = new Date();
    // Default to end of today for day/week, but modify for month/year
    let toDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    let fromDate = new Date(toDate);

    if (selectedPeriod === "day") {
      fromDate = new Date(toDate);
    } else if (selectedPeriod === "week") {
      const dow = toDate.getUTCDay();
      fromDate = new Date(toDate);
      fromDate.setUTCDate(fromDate.getUTCDate() - (dow + 6) % 7);
      toDate = new Date(fromDate); toDate.setUTCDate(toDate.getUTCDate() + 6);
    } else if (selectedPeriod === "month") {
      fromDate = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1));
      // End of month
      toDate = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth() + 1, 0));
    } else if (selectedPeriod === "year") {
      fromDate = new Date(Date.UTC(toDate.getUTCFullYear(), 0, 1));
      // End of year
      toDate = new Date(Date.UTC(toDate.getUTCFullYear(), 11, 31));
    }
    const format = (d) => d.toISOString().slice(0, 10);
    return { from: format(fromDate), to: format(toDate) };
  };

  const weekdayLabels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const monthLabels = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  const periodLabels = {
    day: "Day",
    week: "Week",
    month: "Month",
    year: "Year"
  };

  const loadOverview = async () => {
    setLoading(true);
    setError("");
    try {
      const ov = await api.get(`/income/doctor/${id}/overview`);
      setOverview(ov);
    } catch (err) {
      if (err && err.message === "invalid_doctor") {
        setError("This staff member is not a doctor or is inactive.");
      } else {
        setError(err.message || "Unable to load doctor statistics");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadCommissions = async (rangeFrom, rangeTo) => {
    if (!rangeFrom || !rangeTo) return;
    setCommissionLoading(true);
    setCommissionError("");
    try {
      const data = await api.get(
        `/income/doctor/${id}/commissions?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`
      );
      setCommissionData(data);
    } catch (err) {
      setCommissionError(err.message || "Unable to load commission list");
    } finally {
      setCommissionLoading(false);
    }
  };

  const loadCommissionStats = async (rangeFrom, rangeTo) => {
    if (!rangeFrom || !rangeTo) return;
    setCommissionStatsLoading(true);
    setCommissionStatsError("");
    try {
      const data = await api.get(
        `/income/doctor/${id}/commission/stats?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`
      );
      setCommissionStats(data);
    } catch (err) {
      setCommissionStatsError(err.message || "Unable to load commission statistics");
    } finally {
      setCommissionStatsLoading(false);
    }
  };

  const loadTrend = async (rangeFrom, rangeTo) => {
    if (!rangeFrom || !rangeTo) return;
    setTrendLoading(true);
    setTrendError("");
    try {
      const data = await api.get(
        `/income/doctor/${id}/summary/daily?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`
      );
      setTrendData(Array.isArray(data) ? data : []);
    } catch (err) {
      setTrendError(err.message || "Unable to load trend statistics");
    } finally {
      setTrendLoading(false);
    }
  };

  const resolveTrendRange = (activePeriod, sourceRange) => {
    if (!sourceRange?.from || !sourceRange?.to) return null;
    if (activePeriod === "month" || activePeriod === "year") {
      const year = Number(sourceRange.to.slice(0, 4) || new Date().getUTCFullYear());
      return {
        from: `${year}-01-01`,
        to: `${year}-12-31`
      };
    }
    return { from: sourceRange.from, to: sourceRange.to };
  };

  const loadHourly = async (dateValue) => {
    if (!dateValue) return;
    setHourlyLoading(true);
    setHourlyError("");
    try {
      const data = await api.get(
        `/income/doctor/${id}/summary/hourly?date=${encodeURIComponent(dateValue)}`
      );
      setHourlyData(data);
    } catch (err) {
      setHourlyError(err.message || "Unable to load hourly stats");
    } finally {
      setHourlyLoading(false);
    }
  };

  const loadDocuments = async (fromValue, toValue) => {
    setDocumentsLoading(true);
    setDocumentsError("");
    try {
      const params = new URLSearchParams();
      params.set("type", "salary_report");
      if (fromValue) params.set("from", fromValue);
      if (toValue) params.set("to", toValue);
      const items = await api.get(`/staff/${id}/documents?${params.toString()}`);
      setDocuments(items);
    } catch (err) {
      setDocumentsError(err.message || "Unable to load salary documents");
    } finally {
      setDocumentsLoading(false);
    }
  };

  const loadShifts = async (rangeFrom, rangeTo) => {
    if (!rangeFrom || !rangeTo) return;
    setShiftsLoading(true);
    try {
      const data = await api.get(
        `/schedule?staff_id=${id}&start=${encodeURIComponent(rangeFrom + "T00:00:00")}&end=${encodeURIComponent(rangeTo + "T23:59:59")}`
      );
      setShifts(Array.isArray(data) ? data : []);
    } catch {
      setShifts([]);
    } finally {
      setShiftsLoading(false);
    }
  };

  const downloadDocument = async (documentId, fallbackName) => {
    try {
      const headers = {};
      const rawUser = localStorage.getItem("auth_user");
      if (rawUser) {
        const user = JSON.parse(rawUser);
        if (user?.id) headers["X-Staff-Id"] = String(user.id);
        if (user?.role) headers["X-Staff-Role"] = String(user.role);
      }
      const response = await fetch(`/api/staff/${id}/documents/${documentId}/download`, { headers });
      if (!response.ok) {
        throw new Error("Unable to download document");
      }
      const blob = await response.blob();
      const fileName = fallbackName || "salary-report.pdf";
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setDocumentsError(err.message || "Unable to download document");
    }
  };

  useEffect(() => {
    const initial = computeRange(storedPeriod, customRange);
    setRange(initial);
    setSelectedDate(initial.to || new Date().toISOString().slice(0, 10));
    loadOverview();
  }, [id]);

  useEffect(() => {
    const nextRange = computeRange(period, customRange);
    if (nextRange.from && nextRange.to && nextRange.from > nextRange.to) {
      setRangeError("Invalid date range");
      return;
    }
    if (nextRange.from && nextRange.to) {
      setRangeError("");
      setRange(nextRange);
      if (!selectedDate || period === "day") {
        setSelectedDate(nextRange.to);
      }
    }
  }, [period, customRange]);

  useEffect(() => {
    if (!range.from && !range.to) return;
    setDocumentFilter({ from: range.from, to: range.to });
  }, [range.from, range.to]);

  useEffect(() => {
    if (range.from && range.to) {
      loadShifts(range.from, range.to);
    }
  }, [id, range.from, range.to]);

  useEffect(() => {
    if (range.from && range.to) {
      loadCommissions(range.from, range.to);
      loadCommissionStats(range.from, range.to);
      if (period !== "day") {
        const trendRange = resolveTrendRange(period, range);
        if (trendRange) {
          loadTrend(trendRange.from, trendRange.to);
        }
      }
    }
  }, [id, range.from, range.to, period]);

  useEffect(() => {
    if (documentFilter.from || documentFilter.to) {
      loadDocuments(documentFilter.from, documentFilter.to);
    }
  }, [id, documentFilter.from, documentFilter.to]);

  useEffect(() => {
    if (period === "day" && selectedDate) {
      loadHourly(selectedDate);
      return;
    }
    setHourlyData(null);
    setHourlyError("");
  }, [id, selectedDate, period]);

  useEffect(() => {
    const handler = (event) => {
      if (event?.detail?.period) {
        const newPeriod = event.detail.period;
        setPeriod(newPeriod);
        // Use event's from/to directly so arrow navigation triggers a reload
        if (event.detail.from && event.detail.to) {
          setRange({ from: event.detail.from, to: event.detail.to });
          setSelectedDate(event.detail.to);
        } else {
          const calculated = computeRange(newPeriod, customRange);
          setRange(calculated);
          setSelectedDate(calculated.to);
        }
      }
    };
    const refresh = () => {
      loadOverview();
      if (range.from && range.to) {
        loadCommissions(range.from, range.to);
        loadCommissionStats(range.from, range.to);
        if (period !== "day") {
          const trendRange = resolveTrendRange(period, range);
          if (trendRange) {
            loadTrend(trendRange.from, trendRange.to);
          }
        }
      }
      if (period === "day" && selectedDate) {
        loadHourly(selectedDate);
      }
    };
    window.addEventListener("periodChanged", handler);
    window.addEventListener("incomeAdded", refresh);
    return () => {
      window.removeEventListener("periodChanged", handler);
      window.removeEventListener("incomeAdded", refresh);
    };
  }, [range.from, range.to, selectedDate, id, period]);

  const graphPoints = useMemo(() => {
    if (period === "day") {
      const hoursMap = {};
      if (hourlyData?.hours) {
        hourlyData.hours.forEach(h => {
          hoursMap[Number(h.hour)] = h;
        });
      }
      
      const points = [];
      for (let i = 0; i < 24; i++) {
        const hData = hoursMap[i] || {};
        points.push({
          label: `${String(i).padStart(2, '0')}:00`,
          key: selectedDate ? `${selectedDate}T${String(i).padStart(2, '0')}:00` : null,
          total_income: Number(hData.total_income || 0),
          total_commission: Number(hData.total_commission || 0),
          patient_count: Number(hData.patient_count || 0)
        });
      }
      return points;
    }

    const source = Array.isArray(trendData) ? trendData : [];
    const points = [];

    if (period === "year") {
      // Group by Month (YYYY-MM)
      const yearStr = (range.from || "").slice(0, 4);
      const groups = {};
      // Initialize 12 months
      for (let i = 1; i <= 12; i++) {
        const m = String(i).padStart(2, '0');
        groups[`${yearStr}-${m}`] = { income: 0, commission: 0 };
      }

      source.forEach(item => {
        const m = (item.day || "").slice(0, 7); // YYYY-MM
        if (groups[m]) {
          groups[m].income += Number(item.total_income || 0);
          groups[m].commission += Number(item.total_commission || 0);
        }
      });

      Object.keys(groups).sort().forEach(key => {
         const date = new Date(`${key}-01`);
         const label = !isNaN(date.getTime())
            ? date.toLocaleString(i18n.language, { month: 'long' }).replace(/^./, c => c.toUpperCase())
            : key;
         points.push({
            label,
            key: `${key}-01`, // First day of month for click navigation
            total_income: groups[key].income,
            total_commission: groups[key].commission
         });
      });
    } else {
      // Daily view (Month, Week, Custom)
      // Fill gaps between range.from and range.to
      const start = new Date(range.from);
      const end = new Date(range.to);
      const dataMap = {};
      source.forEach(item => {
        dataMap[item.day] = item;
      });

      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        let curr = new Date(start);
        while (curr <= end) {
          const dStr = curr.toISOString().slice(0, 10);
          const item = dataMap[dStr] || {};
          
          let label = dStr;
          if (period === 'week') {
             label = curr.toLocaleDateString(i18n.language, { weekday: 'long' }).replace(/^./, c => c.toUpperCase());
          } else if (period === 'month') {
             label = curr.getDate(); // 1, 2, ...
          }

          points.push({
            label,
            key: dStr,
            total_income: Number(item.total_income || 0),
            total_commission: Number(item.total_commission || 0)
          });
          curr.setDate(curr.getDate() + 1);
        }
      }
    }
    return points;
  }, [hourlyData, period, trendData, selectedDate, range, i18n.language]);

  const trendChartData = useMemo(() => {
    if (!graphPoints.length) return null;
    const labels = graphPoints.map((point) => point.label);
    const datasets = [];
    if (showIncome) {
      datasets.push({
        label: "INCOME",
        data: graphPoints.map((point) => point.total_income),
        borderColor: "#2ecc40",
        backgroundColor: "rgba(46, 204, 64, 0.1)",
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: "#2ecc40",
        tension: 0.2,
        spanGaps: true
      });
    }
    if (showOutcome) {
      datasets.push({
        label: "OUTCOME",
        data: graphPoints.map((point) => point.total_commission),
        borderColor: "#e03030",
        backgroundColor: "rgba(224, 48, 48, 0.1)",
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: "#e03030",
        tension: 0.2,
        spanGaps: true
      });
    }
    return {
      labels,
      datasets
    };
  }, [graphPoints, showIncome, showOutcome]);

  const handleGraphClick = (_event, elements) => {
    if (!elements?.length) return;
    const index = elements[0].index;
    const item = graphPoints[index];
    if (!item?.key) return;
    if (period === "year") {
      const baseDate = new Date(`${item.key}T00:00:00Z`);
      const from = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1));
      const to = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, 0));
      const fromValue = from.toISOString().slice(0, 10);
      const toValue = to.toISOString().slice(0, 10);
      setPeriod("month");
      setCustomRange({ from: fromValue, to: toValue });
      setRange({ from: fromValue, to: toValue });
      setSelectedDate(toValue);
      return;
    }
    if (period === "month" || period === "week") {
      setPeriod("day");
      setSelectedDate(item.key);
      setRange({ from: item.key, to: item.key });
    }
  };

  const trendChartOptions = useMemo(() => {
    return {
      ...chartOptions,
      plugins: {
        ...chartOptions.plugins,
        tooltip: {
          titleFont: { family: "VT323", size: 14 },
          bodyFont: { family: "VT323", size: 14 },
          callbacks: {
            label: (context) => {
              const value = context.parsed.y || 0;
              return `${context.dataset.label}: ${formatCurrency(value)}`;
            }
          }
        }
      },
      onClick: handleGraphClick
    };
  }, [graphPoints, period]);

  const commissionRows = useMemo(() => {
    if (!commissionData?.patients) return [];
    return commissionData.patients.flatMap((patient) =>
      patient.treatments.map((treatment) => ({
        ...treatment,
        patientName: patient.name
      }))
    ).sort((a, b) => {
      const leftDate = new Date(`${a.service_date}T${a.service_time || "00:00"}:00Z`).getTime();
      const rightDate = new Date(`${b.service_date}T${b.service_time || "00:00"}:00Z`).getTime();
      if (rightDate !== leftDate) {
        return rightDate - leftDate;
      }
      return Number(b.id || 0) - Number(a.id || 0);
    });
  }, [commissionData]);

  const handleCustomRangeChange = (field, value) => {
    setCustomRange((prev) => ({ ...prev, [field]: value }));
    setPeriod("custom");
  };

  const handleSelectedDateChange = (value) => {
    setSelectedDate(value);
    if (period === "day") {
      setRange({ from: value, to: value });
    }
  };

  const exportCommissionList = () => {
    if (!range.from || !range.to) return;
    window.open(
      `/api/income/doctor/${id}/commissions/export?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
      "_blank"
    );
  };

  const [pdfDownloading, setPdfDownloading] = useState(false);

  const exportPatientsPdf = async () => {
    if (!range.from || !range.to) return;
    setPdfDownloading(true);
    try {
      const url = `/api/patients/report/pdf?doctor_id=${id}&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to generate PDF");
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `patient_payments_doctor_${id}_${range.from}_${range.to}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err.message || "Failed to download PDF");
    } finally {
      setPdfDownloading(false);
    }
  };

  const exportHourlyStats = () => {
    if (!selectedDate) return;
    window.open(
      `/api/income/doctor/${id}/summary/hourly/export?date=${encodeURIComponent(selectedDate)}`,
      "_blank"
    );
  };

  const graphLoading = period === "day" ? hourlyLoading : trendLoading;
  const graphError = period === "day" ? hourlyError : trendError;
  const latestPayment = commissionStats?.latest_payment || null;
  const currentTotals = commissionStats?.totals || null;
  const dayEarnings = period === "day"
    ? graphPoints.reduce((sum, item) => sum + Number(item.total_commission || 0), 0)
    : Number(commissionStats?.current_day?.total_commission || 0);
  const sinceLastPayment = Number(commissionStats?.since_last_payment?.total_commission || 0);
  const sinceLastPaymentDate = commissionStats?.since_last_payment?.from_date || null;

  const workHours = useMemo(() => {
    return shifts.reduce((sum, s) => {
      const start = new Date(s.start);
      const end = new Date(s.end);
      return sum + Math.max(0, (end - start) / (1000 * 60 * 60));
    }, 0);
  }, [shifts]);

  const avgIncomePerHour = useMemo(() => {
    if (!workHours || workHours <= 0) return 0;
    return Number(currentTotals?.total_income || 0) / workHours;
  }, [workHours, currentTotals]);

  const avgCommissionPerHour = useMemo(() => {
    if (!workHours || workHours <= 0) return 0;
    return Number(currentTotals?.total_commission || 0) / workHours;
  }, [workHours, currentTotals]);

  return (
    <>
      {error && <div className="form-error">SYSTEM ERROR: {error}</div>}
      
      {overview && (
        <>
          <div className="panel" style={{ marginBottom: "20px" }}>
            <div className="panel-header" style={{ alignItems: "flex-start" }}>
              <div>
                <div className="panel-title">Commission Filters</div>
                <div className="panel-meta" style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="date"
                      value={customRange.from}
                      onChange={(e) => handleCustomRangeChange("from", e.target.value)}
                      className="form-input"
                      style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}
                    />
                    <span style={{ alignSelf: "center" }}>-</span>
                    <input
                      type="date"
                      value={customRange.to}
                      onChange={(e) => handleCustomRangeChange("to", e.target.value)}
                      className="form-input"
                      style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", color: "var(--subtext)" }}>Selected day</span>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => handleSelectedDateChange(e.target.value)}
                      className="form-input"
                      style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}
                    />
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--subtext)" }}>
                    Use top period buttons for Day/Week/Month/Year
                  </span>
                  {rangeError && <span style={{ color: "var(--red)", fontSize: "12px" }}>{rangeError}</span>}
                </div>
              </div>
              <div className="topbar-actions">
                <button className="btn btn-ghost" onClick={exportCommissionList} disabled={!range.from || !range.to}>
                  Export Patients
                </button>
                <button className="btn btn-ghost" onClick={exportPatientsPdf} disabled={!range.from || !range.to || pdfDownloading}>
                  {pdfDownloading ? "Generating…" : "Export PDF"}
                </button>
                <button className="btn btn-ghost" onClick={exportHourlyStats} disabled={!selectedDate}>
                  Export Stats
                </button>
              </div>
            </div>
          </div>

          <div className="stat-strip">
            <div className="stat-card s-blue">
              <div className="stat-icon">◉</div>
              <div className="stat-label">Period Patients</div>
              <div className="stat-value">{commissionStatsLoading ? "—" : (currentTotals?.patient_count ?? 0)}</div>
            </div>
            <div className="stat-card s-orange">
              <div className="stat-icon">↗</div>
              <div className="stat-label">Period Income</div>
              <div className="stat-value">
                {commissionStatsLoading ? "—" : formatCurrency(currentTotals?.total_income)}
              </div>
            </div>
            <div className="stat-card s-green">
              <div className="stat-icon">↗</div>
              <div className="stat-label">Period Commission</div>
              <div className="stat-value">
                {commissionStatsLoading ? "—" : formatCurrency(currentTotals?.total_commission)}
              </div>
            </div>
            <div className="stat-card s-green">
              <div className="stat-icon">◈</div>
              <div className="stat-label">Commission Rate</div>
              <div className="stat-value">
                {commissionStatsLoading ? "—" : `${((commissionStats?.doctor?.commission_rate || 0) * 100).toFixed(2)}%`}
              </div>
            </div>
            <div className="stat-card s-blue">
              <div className="stat-icon">⏱</div>
              <div className="stat-label">Hours Worked</div>
              <div className="stat-value">
                {shiftsLoading ? "—" : workHours.toFixed(1) + "h"}
              </div>
            </div>
            <div className="stat-card s-orange">
              <div className="stat-icon">⌀</div>
              <div className="stat-label">Avg Income/Hour</div>
              <div className="stat-value">
                {shiftsLoading || commissionStatsLoading ? "—" : formatCurrency(avgIncomePerHour)}
              </div>
            </div>
            <div className="stat-card s-green">
              <div className="stat-icon">⌀</div>
              <div className="stat-label">Avg Commission/Hour</div>
              <div className="stat-value">
                {shiftsLoading || commissionStatsLoading ? "—" : formatCurrency(avgCommissionPerHour)}
              </div>
            </div>
          </div>
          {commissionStatsError && <div className="form-error">{commissionStatsError}</div>}

          <div className="two-col">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-title">Daily Income vs Outcome</div>
                  <div className="panel-meta">{`${periodLabels[period] || "Period"} statistics`}</div>
                </div>
              </div>
              <div className="chart-area" style={{ height: "400px" }}>
                <div style={{ display: "flex", gap: "20px", justifyContent: "flex-end", marginBottom: "10px" }}>
                  <label className="check-row">
                    <input type="checkbox" checked={showIncome} onChange={(e) => setShowIncome(e.target.checked)} />
                    INCOME
                  </label>
                  <label className="check-row">
                    <input type="checkbox" checked={showOutcome} onChange={(e) => setShowOutcome(e.target.checked)} />
                    OUTCOME
                  </label>
                </div>
                {graphLoading && <div>Loading graph data...</div>}
                {!graphLoading && graphError && <div>{graphError}</div>}
                {!graphLoading && !graphError && trendChartData && trendChartData.datasets.length > 0 && (
                  <Line data={trendChartData} options={trendChartOptions} />
                )}
                {!graphLoading && !graphError && (!trendChartData || trendChartData.datasets.length === 0) && (
                  <div>No graph data for selected period</div>
                )}
              </div>
            </div>
            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-title">Doctor Earnings Stats</div>
                  <div className="panel-meta">
                    {latestPayment
                      ? `Latest payment ${latestPayment.payment_date} · ${(latestPayment.commission_rate * 100).toFixed(2)}%`
                      : "No payment history"}
                  </div>
                </div>
              </div>
              <div style={{ padding: "16px", display: "grid", gap: "12px" }}>
                <div className="mono" style={{ fontSize: "14px" }}>
                  {period === "day"
                    ? `Current day earnings (${selectedDate || "today"}): ${formatCurrency(dayEarnings)}`
                    : "Current day earnings: available in Day view"}
                </div>
                <div className="mono" style={{ fontSize: "14px" }}>
                  {sinceLastPaymentDate
                    ? `Total earnings since last salary payment (${sinceLastPaymentDate}): ${formatCurrency(sinceLastPayment)}`
                    : `Total earnings since last salary payment date: ${formatCurrency(sinceLastPayment)}`}
                </div>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: "20px" }}>
            <div className="panel-header">
              <div>
                <div className="panel-title">Patient Commissions</div>
                <div className="panel-meta">
                  {range.from && range.to ? `${range.from} → ${range.to}` : "Select a range"}
                </div>
              </div>
              <div className="topbar-actions">
                {commissionData?.totals && (
                  <div className="mono" style={{ fontSize: "12px", color: "var(--subtext)" }}>
                    {commissionData.totals.patient_count} patients · {commissionData.totals.treatment_count} treatments ·{" "}
                    {formatCurrency(commissionData.totals.total_commission)}
                  </div>
                )}
              </div>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Amount</th>
                    <th>Commission</th>
                    <th>Treatment Details</th>
                  </tr>
                </thead>
                <tbody>
                  {commissionLoading && (
                    [...Array(4)].map((_, idx) => (
                      <tr key={`c-${idx}`}>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                      </tr>
                    ))
                  )}
                  {!commissionLoading && commissionError && (
                    <tr>
                      <td colSpan={6} className="empty-state">{commissionError}</td>
                    </tr>
                  )}
                  {!commissionLoading && !commissionError && commissionRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty-state">No commission data for selected range</td>
                    </tr>
                  )}
                  {!commissionLoading && !commissionError && commissionRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.patientName}</td>
                      <td className="mono">{row.service_date}</td>
                      <td className="mono">{row.service_time || "-"}</td>
                      <td className="mono" style={{ color: "var(--green)" }}>
                        {formatCurrency(row.amount)}
                      </td>
                      <td className="mono" style={{ color: "var(--accent)" }}>
                        {formatCurrency(row.commission)}
                      </td>
                      <td>{row.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel" style={{ marginTop: "20px" }}>
            <div className="panel-header" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="panel-title">Salary Documents</div>
                <div className="panel-meta">Signed reports</div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="date"
                  value={documentFilter.from}
                  onChange={(e) => setDocumentFilter((prev) => ({ ...prev, from: e.target.value }))}
                  className="form-input"
                  style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}
                />
                <span style={{ alignSelf: "center" }}>-</span>
                <input
                  type="date"
                  value={documentFilter.to}
                  onChange={(e) => setDocumentFilter((prev) => ({ ...prev, to: e.target.value }))}
                  className="form-input"
                  style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}
                />
                <button className="btn btn-ghost" onClick={() => loadDocuments(documentFilter.from, documentFilter.to)}>
                  Search
                </button>
              </div>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Signed At</th>
                    <th>Signer</th>
                    <th>File</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {documentsLoading && (
                    [...Array(3)].map((_, idx) => (
                      <tr key={`doc-${idx}`}>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                      </tr>
                    ))
                  )}
                  {!documentsLoading && documentsError && (
                    <tr>
                      <td colSpan={5} className="empty-state">{documentsError}</td>
                    </tr>
                  )}
                  {!documentsLoading && !documentsError && documents.length === 0 && (
                    <tr>
                      <td colSpan={5} className="empty-state">No salary documents found</td>
                    </tr>
                  )}
                  {!documentsLoading && !documentsError && documents.map((doc) => (
                    <tr key={doc.id}>
                      <td className="mono">{doc.period_from} → {doc.period_to}</td>
                      <td className="mono">{doc.signed_at ? new Date(doc.signed_at).toLocaleString() : "—"}</td>
                      <td>{doc.signer_name}</td>
                      <td className="mono">{doc.file_name || "salary-report.pdf"}</td>
                      <td>
                        <button className="pay-btn" onClick={() => downloadDocument(doc.id, doc.file_name)}>
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
