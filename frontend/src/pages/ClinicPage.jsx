import { useEffect, useState } from "react";
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
import { useApi } from "../api/client.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function ClinicPage() {
  const api = useApi();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await api.get("/clinic/dashboard");
        setDashboard(data);
      } catch (err) {
        setError(err.message || "Unable to load dashboard");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleExportCsv = () => {
    window.open("/api/clinic/daily-pnl/export/csv", "_blank", "noopener");
  };

  const handleExportPdf = () => {
    window.open("/api/clinic/daily-pnl/export/pdf", "_blank", "noopener");
  };

  const chartData =
    dashboard &&
    (() => {
      const labels = dashboard.daily_pnl.map((item) => item.day);
      return {
        labels,
        datasets: [
          {
            label: "INCOME",
            borderColor: "#2ecc40",
            backgroundColor: "rgba(46, 204, 64, 0.1)",
            borderWidth: 4,
            pointRadius: 6,
            pointBackgroundColor: "#2ecc40",
            data: dashboard.daily_pnl.map((item) => item.total_income)
          },
          {
            label: "OUTCOME",
            borderColor: "#e03030",
            backgroundColor: "rgba(224, 48, 48, 0.1)",
            borderWidth: 4,
            pointRadius: 6,
            pointBackgroundColor: "#e03030",
            data: dashboard.daily_pnl.map((item) => item.total_outcome)
          },
          {
            label: "PROFIT",
            borderColor: "#ffd700",
            backgroundColor: "rgba(255, 215, 0, 0.1)",
            borderWidth: 4,
            pointRadius: 6,
            pointBackgroundColor: "#ffd700",
            data: dashboard.daily_pnl.map((item) => item.pnl)
          }
        ]
      };
    })();

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
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
      }
    }
  };

  return (
    <>
      {loading && <div>Loading...</div>}
      {error && <div className="form-error">{error}</div>}
      {dashboard && (
        <>
          <div className="stat-strip">
            <div className="stat-card s-orange">
              <div className="stat-icon">↗</div>
              <div className="stat-label">Total Income</div>
              <div className="stat-value">
                {dashboard.lease_cost.toLocaleString(undefined, {
                  style: "currency",
                  currency: "CZK"
                })}
              </div>
            </div>
            <div className="stat-card s-red">
              <div className="stat-icon">↙</div>
              <div className="stat-label">Payroll Due</div>
              <div className="stat-value">
                {dashboard.avg_payment_per_patient.toLocaleString(undefined, {
                  style: "currency",
                  currency: "CZK"
                })}
              </div>
            </div>
            <div className="stat-card s-green">
              <div className="stat-icon">◈</div>
              <div className="stat-label">Net Profit</div>
              <div className="stat-value">
                {Object.values(dashboard.avg_salary_by_role).reduce((a, b) => a + b, 0).toLocaleString(undefined, {
                  style: "currency",
                  currency: "CZK"
                })}
              </div>
            </div>
            <div className="stat-card s-blue">
              <div className="stat-icon">◉</div>
              <div className="stat-label">Active Staff</div>
              <div className="stat-value">{Object.keys(dashboard.avg_salary_by_role).length}</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Daily P&L</div>
                <div className="panel-meta">Last 30 days</div>
              </div>
              <div className="topbar-actions">
                <button className="btn btn-ghost" onClick={handleExportCsv}>⇣ Export CSV</button>
                <button className="btn btn-ghost" onClick={handleExportPdf}>⇣ Export PDF</button>
              </div>
            </div>
            <div className="chart-area">
              {chartData && (
                <Line data={chartData} options={chartOptions} />
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
