import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useApi } from "../api/client.js";

export default function DayDashboardPage() {
  const { t } = useTranslation();
  const api = useApi();
  const { date } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await api.get(`/clinic/dashboard/day-details?date=${date}`);
        setData(result);
      } catch (err) {
        setError(err.message || t("clinic.day_details.failed_load"));
      } finally {
        setLoading(false);
      }
    };
    if (date) load();
  }, [date]);

  if (loading) return <div className="content"><div>{t("common.loading")}</div></div>;
  if (error) return <div className="content"><div className="form-error">{error}</div></div>;
  if (!data) return null;

  const formatCurrency = (val) => 
    Number(val || 0).toLocaleString(undefined, { style: "currency", currency: "CZK" });

  return (
    <div className="content">
      <div className="panel-header" style={{ borderBottom: 'none', paddingLeft: 0 }}>
        <div>
            <button className="btn btn-ghost" onClick={() => navigate("/clinic")} style={{ marginBottom: '1rem' }}>
                ← {t("clinic.day_details.back_to_dashboard")}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div className="panel-title">{t("clinic.day_details.day_overview")}: {data.date}</div>
                <input 
                    type="date" 
                    value={data.date} 
                    onChange={(e) => navigate(`/clinic/day/${e.target.value}`)} 
                    style={{ background: 'transparent', border: 'none', color: 'var(--subtext)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}
                />
            </div>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat-card s-orange">
          <div className="stat-label">{t("clinic.total_income")}</div>
          <div className="stat-value">{formatCurrency(data.metrics.total_income)}</div>
        </div>
        <div className="stat-card s-red">
          <div className="stat-label">{t("clinic.total_outcome")}</div>
          <div className="stat-value">{formatCurrency(data.metrics.total_outcome)}</div>
        </div>
        <div className="stat-card s-green">
          <div className="stat-label">{t("clinic.net_profit")}</div>
          <div className="stat-value">{formatCurrency(data.metrics.net_profit)}</div>
        </div>
        <div className="stat-card s-blue">
            <div className="stat-label">{t("clinic.patients.unique")}</div>
            <div className="stat-value">{data.patient_count}</div>
        </div>
      </div>

      <div className="two-col" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="panel">
            <div className="panel-header">
                <div className="panel-title">{t("clinic.day_details.highest_earning_doctor")}</div>
            </div>
            <div style={{ padding: '20px' }}>
                {data.highest_earning_doctor ? (
                    <div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{data.highest_earning_doctor.name}</div>
                        <div className="mono" style={{ color: 'var(--accent)', fontSize: '1.5rem' }}>
                            {formatCurrency(data.highest_earning_doctor.amount)}
                        </div>
                    </div>
                ) : (
                    <div className="text-subtext">{t("clinic.day_details.no_data")}</div>
                )}
            </div>
        </div>

        <div className="panel">
            <div className="panel-header">
                <div className="panel-title">{t("clinic.day_details.revenue_breakdown")}</div>
            </div>
            <table className="data-table">
                <tbody>
                    {Object.entries(data.revenue_breakdown || {}).map(([method, amount]) => (
                        <tr key={method}>
                            <td style={{ textTransform: 'capitalize' }}>{method}</td>
                            <td className="mono" style={{ textAlign: 'right' }}>{formatCurrency(amount)}</td>
                        </tr>
                    ))}
                    {Object.keys(data.revenue_breakdown || {}).length === 0 && (
                        <tr><td colSpan="2" style={{ textAlign: 'center', color: 'var(--subtext)' }}>No revenue</td></tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
            <div className="panel-title">Top Appointment Types</div>
        </div>
        <table className="data-table">
            <thead>
                <tr>
                    <th>Type/Note</th>
                    <th style={{ textAlign: 'right' }}>Count</th>
                </tr>
            </thead>
            <tbody>
                {(data.appointment_types || []).map((item, i) => (
                    <tr key={i}>
                        <td>{item.type || "(No note)"}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{item.count}</td>
                    </tr>
                ))}
                {(data.appointment_types || []).length === 0 && (
                     <tr><td colSpan="2" style={{ textAlign: 'center', color: 'var(--subtext)' }}>No appointments</td></tr>
                )}
            </tbody>
        </table>
      </div>
    </div>
  );
}
