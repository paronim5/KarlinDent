import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend } from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { useApi } from "../api/client.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

function DateRangePicker({ from, to, onChange }) {
  return (
    <div className="date-range">
      <label>
        From
        <input
          type="date"
          value={from}
          onChange={(event) => onChange({ from: event.target.value, to })}
        />
      </label>
      <label>
        To
        <input
          type="date"
          value={to}
          onChange={(event) => onChange({ from, to: event.target.value })}
        />
      </label>
    </div>
  );
}

export default function DoctorPage() {
  const { id } = useParams();
  const api = useApi();

  const today = new Date().toISOString().slice(0, 10);
  const to30 = today;
  const from30 = new Date(Date.now() - 29 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);
  const [daily, setDaily] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [from, setFrom] = useState(from30);
  const [to, setTo] = useState(to30);
  const [loading, setLoading] = useState(false);

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

  const loadAll = async (rangeFrom = from, rangeTo = to) => {
    setLoading(true);
    setError("");
    try {
      const [ov, dailyItems, monthlyItems] = await Promise.all([
        api.get(`/income/doctor/${id}/overview`),
        api.get(`/income/doctor/${id}/summary/daily?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`),
        api.get(`/income/doctor/${id}/summary/monthly`)
      ]);
      setOverview(ov);
      setDaily(dailyItems);
      setMonthly(monthlyItems);
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

  useEffect(() => {
    loadAll();
  }, [id]);

  const handleRangeChange = ({ from: newFrom, to: newTo }) => {
    setFrom(newFrom);
    setTo(newTo);
    if (newFrom && newTo) {
      loadAll(newFrom, newTo);
    }
  };

  const dailyChartData = useMemo(() => {
    if (!daily || daily.length === 0) return null;
    const labels = daily.map((d) => d.day);
    return {
      labels,
      datasets: [
        {
          label: "INCOME",
          data: daily.map((d) => d.total_income),
          borderColor: "#00d4ff",
          backgroundColor: "rgba(0, 212, 255, 0.1)",
          borderWidth: 3,
          pointRadius: 4,
          tension: 0.2
        },
        {
          label: "COMMISSION",
          data: daily.map((d) => d.total_commission),
          borderColor: "#2ecc40",
          backgroundColor: "rgba(46, 204, 64, 0.1)",
          borderWidth: 3,
          pointRadius: 4,
          tension: 0.2
        }
      ]
    };
  }, [daily]);

  const monthlyChartData = useMemo(() => {
    if (!monthly || monthly.length === 0) return null;
    const labels = monthly.map((m) => m.month);
    return {
      labels,
      datasets: [
        {
          label: "INCOME",
          data: monthly.map((m) => m.total_income),
          backgroundColor: "rgba(0, 212, 255, 0.7)",
          borderColor: "#00d4ff",
          borderWidth: 2
        },
        {
          label: "COMMISSION",
          data: monthly.map((m) => m.total_commission),
          backgroundColor: "rgba(46, 204, 64, 0.7)",
          borderColor: "#2ecc40",
          borderWidth: 2
        }
      ]
    };
  }, [monthly]);

  return (
    <>
      {error && <div className="form-error">SYSTEM ERROR: {error}</div>}
      
      {overview && (
        <>
          <div className="stat-strip">
            <div className="stat-card s-blue">
              <div className="stat-icon">◉</div>
              <div className="stat-label">Lifetime Patients</div>
              <div className="stat-value">{overview.lifetime.patient_count}</div>
            </div>
            <div className="stat-card s-orange">
              <div className="stat-icon">↗</div>
              <div className="stat-label">Lifetime Income</div>
              <div className="stat-value">
                {overview.lifetime.total_income.toLocaleString(undefined, { style: "currency", currency: "CZK" })}
              </div>
            </div>
            <div className="stat-card s-green">
              <div className="stat-icon">↗</div>
              <div className="stat-label">Lifetime Commission</div>
              <div className="stat-value">
                {overview.lifetime.total_commission.toLocaleString(undefined, { style: "currency", currency: "CZK" })}
              </div>
            </div>
            <div className="stat-card s-green">
              <div className="stat-icon">◈</div>
              <div className="stat-label">Avg Commission/Patient</div>
              <div className="stat-value">
                {overview.lifetime.avg_commission_per_patient.toLocaleString(undefined, { style: "currency", currency: "CZK" })}
              </div>
            </div>
          </div>

          <div className="two-col">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-title">Daily Performance</div>
                  <div className="panel-meta">Last 30 days</div>
                </div>
              </div>
              <div className="chart-area">
                {dailyChartData ? (
                  <Line data={dailyChartData} options={chartOptions} />
                ) : (
                  <div>No data for selected range</div>
                )}
              </div>
            </div>
            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-title">Monthly Performance</div>
                  <div className="panel-meta">Last 12 months</div>
                </div>
              </div>
              <div className="chart-area">
                {monthlyChartData ? (
                  <Bar data={monthlyChartData} options={chartOptions} />
                ) : (
                  <div>No monthly data</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
