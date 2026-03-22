import { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from "chart.js";
import { useApi } from "../api/client.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function ClinicPage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const initialPeriod = localStorage.getItem("globalPeriod") || "month";
  const [period, setPeriod] = useState(initialPeriod);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Graph visibility toggles
  const [showIncome, setShowIncome] = useState(true);
  const [showOutcome, setShowOutcome] = useState(true);

  const periodLabels = useMemo(
    () => ({
      year: t("income.period.year"),
      month: t("income.period.month"),
      week: t("income.period.week"),
      day: t("income.period.day")
    }),
    [t]
  );

  useEffect(() => {
    localStorage.setItem("globalPeriod", period);
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await api.get(`/clinic/dashboard-data?period=${period}&date=${date}`);
        setDashboard(data);
      } catch (err) {
        setError(err.message || t("clinic.errors.load_dashboard"));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [period, date]);

  // Listen for global period changes if any
  useEffect(() => {
    const handler = (event) => {
      if (event?.detail?.period) {
        setPeriod(event.detail.period);
      }
    };
    window.addEventListener("periodChanged", handler);
    return () => window.removeEventListener("periodChanged", handler);
  }, []);

  const handleGraphClick = (event, elements) => {
    if (!elements.length) return;
    const index = elements[0].index;
    const item = dashboard.graph[index];
    
    if (period === 'year') {
        setPeriod('month');
        setDate(item.key);
    } else if (period === 'month' || period === 'week') {
        setPeriod('day');
        setDate(item.key);
    } else if (period === 'day') {
        // Navigate to Day Overview Page
        navigate(`/clinic/day/${item.key.split('T')[0]}`);
    }
  };

  const chartData =
    dashboard &&
    (() => {
      const labels = dashboard.graph.map((item) => item.label);
      const datasets = [];

      if (showIncome) {
        datasets.push({
            label: t("clinic.chart.income"),
            borderColor: "#2ecc40",
            backgroundColor: "rgba(46, 204, 64, 0.1)",
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: "#2ecc40",
            data: dashboard.graph.map((item) => (item.value || item.income) || null), 
            tension: 0.2,
            spanGaps: true
        });
      }

      if (showOutcome && dashboard.graph[0] && dashboard.graph[0].outcome !== undefined) {
        datasets.push({
            label: t("clinic.chart.outcome"),
            borderColor: "#e03030",
            backgroundColor: "rgba(224, 48, 48, 0.1)",
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: "#e03030",
            data: dashboard.graph.map((item) => item.outcome || null),
            tension: 0.2,
            spanGaps: true
        });
      }

      return { labels, datasets };
    })();

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: handleGraphClick,
    scales: {
      x: {
        grid: { color: "rgba(255, 215, 0, 0.1)" },
        ticks: { color: "#ffd700", font: { family: "VT323", size: 14 } }
      },
      y: {
        grid: { color: "rgba(255, 215, 0, 0.1)" },
        ticks: { color: "#ffd700", font: { family: "VT323", size: 14 } }
      }
    },
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: "#f5f0dc", font: { family: "Press Start 2P", size: 8 } }
      },
      tooltip: {
          titleFont: { family: "VT323", size: 14 },
          bodyFont: { family: "VT323", size: 14 }
      }
    }
  };

  const formatCurrency = (value) =>
    Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "CZK" });

  return (
    <>
      {loading && <div>{t("common.loading")}</div>}
      {error && <div className="form-error">{error}</div>}
      {dashboard && (
        <>
          <div className="stat-strip">
            <div className="stat-card s-orange">
              <div className="stat-icon">↗</div>
              <div className="stat-label">{t("clinic.total_income")}</div>
              <div className="stat-value">
                {formatCurrency(dashboard.stats.total_income)}
              </div>
            </div>
            <div className="stat-card s-red">
              <div className="stat-icon">↙</div>
              <div className="stat-label">{t("clinic.total_outcome")}</div>
              <div className="stat-value">
                {formatCurrency(dashboard.stats.total_expenses + dashboard.stats.total_salaries)}
              </div>
            </div>
            <div className="stat-card s-green">
              <div className="stat-icon">◈</div>
              <div className="stat-label">{t("clinic.net_profit")}</div>
              <div className="stat-value">
                {formatCurrency(dashboard.stats.net_profit)}
              </div>
            </div>
            <div className="stat-card s-blue">
              <div className="stat-icon">◉</div>
              <div className="stat-label">{t("clinic.unique_patients")}</div>
              <div className="stat-value">{dashboard.stats.total_patients}</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">{t("clinic.daily_income_outcome")}</div>
                <div className="panel-meta">{t("clinic.period_meta", { period: periodLabels[period] })}</div>
              </div>
            </div>
            <div className="chart-area" style={{ height: 'min(400px, 50vh)' }}>
              <div style={{ display: 'flex', gap: '20px', justifyContent: 'flex-end', marginBottom: '10px' }}>
                 <label className="check-row">
                    <input type="checkbox" checked={showIncome} onChange={e => setShowIncome(e.target.checked)} />
                    {t("clinic.chart.income")}
                 </label>
                 <label className="check-row">
                    <input type="checkbox" checked={showOutcome} onChange={e => setShowOutcome(e.target.checked)} />
                    {t("clinic.chart.outcome")}
                 </label>
              </div>
              {chartData && (
                <Line data={chartData} options={chartOptions} />
              )}
            </div>
          </div>

          {/* Business Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '20px', marginTop: '20px' }}>
              
              {/* Financial Overview */}
              <div className="panel">
                  <div className="panel-header"><div className="panel-title">{t("clinic.sections.financial")}</div></div>
                  <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div className="stat-strip" style={{ gridTemplateColumns: '1fr 1fr' }}>
                          <div className="stat-card s-green">
                              <div className="stat-label">{t("clinic.financial.net_profit")}</div>
                              <div className="stat-value">{formatCurrency(dashboard.financial_overview.net_profit)}</div>
                          </div>
                          <div className="stat-card s-orange">
                              <div className="stat-label">{t("clinic.financial.lab_ratio")}</div>
                              <div className="stat-value">{dashboard.financial_overview.lab_ratio}%</div>
                          </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                          <div style={{ flex: '1 1 120px', padding: '10px', background: 'var(--surface)', borderRadius: '8px' }}>
                              <div className="stat-label">{t("income.form.cash")}</div>
                              <div className="mono" style={{ fontSize: '13px', wordBreak: 'break-all' }}>{formatCurrency(dashboard.financial_overview.cash_total)} ({dashboard.financial_overview.cash_ratio}%)</div>
                          </div>
                          <div style={{ flex: '1 1 120px', padding: '10px', background: 'var(--surface)', borderRadius: '8px' }}>
                              <div className="stat-label">{t("income.form.card")}</div>
                              <div className="mono" style={{ fontSize: '13px', wordBreak: 'break-all' }}>{formatCurrency(dashboard.financial_overview.card_total)} ({dashboard.financial_overview.card_ratio}%)</div>
                          </div>
                      </div>
                  </div>
              </div>

              {/* Patient Insights */}
              <div className="panel">
                  <div className="panel-header"><div className="panel-title">{t("clinic.sections.patients")}</div></div>
                  <div style={{ padding: '20px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', marginBottom: '16px' }}>
                          <div style={{ minWidth: '80px' }}>
                              <div className="stat-label">{t("clinic.patients.unique")}</div>
                              <div className="stat-value" style={{ fontSize: '24px' }}>{dashboard.patient_insights.unique_patients}</div>
                          </div>
                          <div style={{ minWidth: '80px' }}>
                              <div className="stat-label">{t("clinic.patients.new")}</div>
                              <div className="stat-value" style={{ fontSize: '24px', color: 'var(--green)' }}>{dashboard.patient_insights.new_patients}</div>
                          </div>
                          <div style={{ minWidth: '80px' }}>
                              <div className="stat-label">{t("clinic.patients.avg_visit")}</div>
                              <div className="stat-value" style={{ fontSize: '24px', color: 'var(--blue)' }}>{formatCurrency(dashboard.patient_insights.avg_revenue_per_visit)}</div>
                          </div>
                      </div>
                      <div className="panel-meta">{t("clinic.patients.top_spenders")}</div>
                      <table className="data-table" style={{ marginTop: '8px' }}>
                          <tbody>
                              {dashboard.patient_insights.top_patients.map(p => (
                                  <tr key={p.id}>
                                      <td style={{ padding: '8px' }}>{p.name}</td>
                                      <td style={{ padding: '8px', textAlign: 'right' }} className="mono">{formatCurrency(p.total_spend)}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>

              {/* Doctor Performance */}
              <div className="panel">
                  <div className="panel-header"><div className="panel-title">{t("clinic.sections.doctors")}</div></div>
                  <div className="table-wrapper">
                  <table className="data-table">
                      <thead>
                          <tr>
                              <th>{t("staff.table.name")}</th>
                              <th>{t("clinic.doctors.visits")}</th>
                              <th>{t("clinic.doctors.revenue")}</th>
                              <th>{t("clinic.doctors.avg_visit")}</th>
                          </tr>
                      </thead>
                      <tbody>
                          {dashboard.doctor_performance.map(d => (
                              <tr key={d.id}>
                                  <td>{d.name}</td>
                                  <td className="mono">{d.visit_count}</td>
                                  <td className="mono" style={{ color: 'var(--green)' }}>{formatCurrency(d.total_income)}</td>
                                  <td className="mono">{formatCurrency(d.avg_visit_value)}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
                  </div>
              </div>

              {/* Expense Analysis */}
              <div className="panel">
                  <div className="panel-header">
                      <div>
                          <div className="panel-title">{t("clinic.sections.expenses")}</div>
                          <div className="panel-meta">{t("clinic.expenses.salary_ratio")}: {dashboard.expense_analysis.salary_ratio}%</div>
                      </div>
                  </div>
                  <div style={{ padding: '20px' }}>
                      <div className="chart-bars" style={{ height: '150px' }}>
                          {dashboard.expense_analysis.by_category.map((c, idx) => (
                              <div className="bar-col" key={idx} style={{ flex: 1 }}>
                                  <div 
                                      className="bar bar-expense" 
                                      style={{ height: `${(c.total / (Math.max(...dashboard.expense_analysis.by_category.map(x=>x.total)) || 1)) * 100}%` }}
                                      title={formatCurrency(c.total)}
                                  ></div>
                                  <div className="bar-label" style={{ fontSize: '10px', marginTop: '4px' }}>{c.category}</div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>

              {/* Operational Health */}
              <div className="panel">
                  <div className="panel-header"><div className="panel-title">{t("clinic.sections.operations")}</div></div>
                  <div style={{ padding: '20px', display: 'grid', gap: '20px' }}>
                      <div>
                          <div className="panel-meta">{t("clinic.operations.days_since_salary")}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', maxWidth: '100%' }}>
                              {dashboard.operational_health.days_since_last_salary.map(s => (
                                  <div key={s.id} className="pill" style={{
                                      background: (s.days > 35 || s.days === null) ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                                      color: (s.days > 35 || s.days === null) ? 'var(--red)' : 'var(--green)',
                                      border: '1px solid currentColor',
                                      fontSize: '11px'
                                  }}>
                                      {s.name}: {s.days === null ? t("common.never") : `${s.days}d`}
                                  </div>
                              ))}
                          </div>
                      </div>
                      <div>
                          <div className="panel-meta">{t("clinic.operations.busiest_days")}</div>
                          <div className="chart-bars" style={{ height: "60px", marginTop: "10px" }}>
                              {dashboard.operational_health.busiest_days.map((d) => (
                                  <div className="bar-col" key={d.dow} style={{ flex: 1 }}>
                                      <div 
                                          className="bar bar-income" 
                                          style={{ height: `${(d.count / (Math.max(...dashboard.operational_health.busiest_days.map(x=>x.count)) || 1)) * 100}%` }}
                                          title={`${d.count} ${t("clinic.operations.visits")}`}
                                      ></div>
                                      <div className="bar-label">
                                          {[t("clinic.weekdays.sun"), t("clinic.weekdays.mon"), t("clinic.weekdays.tue"), t("clinic.weekdays.wed"), t("clinic.weekdays.thu"), t("clinic.weekdays.fri"), t("clinic.weekdays.sat")][d.dow]}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                      <div>
                          <div className="panel-meta">{t("clinic.operations.outstanding_commission")}</div>
                          <div style={{ maxHeight: '100px', overflowY: 'auto', marginTop: '8px' }}>
                              {dashboard.operational_health.outstanding_commission.length > 0 ? (
                                  <table className="data-table">
                                      <tbody>
                                          {dashboard.operational_health.outstanding_commission.map(c => (
                                              <tr key={c.id}>
                                                  <td style={{ padding: '6px' }}>{c.name}</td>
                                                  <td style={{ padding: '6px', textAlign: 'right', color: 'var(--red)' }} className="mono">{formatCurrency(c.amount)}</td>
                                              </tr>
                                          ))}
                                      </tbody>
                                  </table>
                              ) : (
                                  <div className="text-subtext">{t("common.none")}</div>
                              )}
                          </div>
                      </div>
                  </div>
              </div>
          </div>
        </>
      )}
    </>
  );
}
