import { useEffect, useMemo, useState } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend } from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
import { useApi } from "../api/client.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

function DateRangePicker({ from, to, onChange }) {
  const { t } = useTranslation();
  return (
    <div className="date-range">
      <label>
        {t("income.date_range.from")}
        <input
          className="pixel-input"
          type="date"
          value={from}
          onChange={(event) => onChange({ from: event.target.value, to })}
        />
      </label>
      <label>
        {t("income.date_range.to")}
        <input
          className="pixel-input"
          type="date"
          value={to}
          onChange={(event) => onChange({ from, to: event.target.value })}
        />
      </label>
    </div>
  );
}

export default function IncomePage() {
  const { t } = useTranslation();
  const api = useApi();
  const today = new Date().toISOString().slice(0, 10);

  const [records, setRecords] = useState([]);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [patients, setPatients] = useState([]);
  const [patientQuery, setPatientQuery] = useState("");
  const [doctors, setDoctors] = useState([]);
  const [statsQuery, setStatsQuery] = useState("");
  const [doctorStats, setDoctorStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [form, setForm] = useState({
    patientId: "",
    newPatientLastName: "",
    doctorId: "",
    amount: "",
    paymentMethod: "cash",
    labWork: false,
    labCost: "",
    note: ""
  });
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deletingIds, setDeletingIds] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

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

  const loadRecords = async (rangeFrom = from, rangeTo = to) => {
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

  const loadDoctors = async () => {
    try {
      const items = await api.get("/staff?role=doctor");
      setDoctors(items);
    } catch {
      setDoctors([]);
    }
  };

  const searchPatients = async (query) => {
    try {
      const items = await api.get(`/income/patients?q=${encodeURIComponent(query)}`);
      setPatients(items);
    } catch {
      setPatients([]);
    }
  };

  const loadDoctorStats = async (query) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setDoctorStats(null);
      return;
    }
    setStatsLoading(true);
    setError("");
    try {
      const data = await api.get(
        `/income/stats/doctors-by-patient?patient_last_name=${encodeURIComponent(trimmed)}`
      );
      setDoctorStats(data);
    } catch (err) {
      setDoctorStats(null);
      setError(err.message || "Unable to load doctor statistics");
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
    loadDoctors();
    searchPatients("");
  }, []);

  const handleRangeChange = ({ from: newFrom, to: newTo }) => {
    setFrom(newFrom);
    setTo(newTo);
    if (newFrom && newTo) {
      loadRecords(newFrom, newTo);
    }
  };

  const handlePatientSearchChange = (event) => {
    const query = event.target.value;
    setPatientQuery(query);
    searchPatients(query);
  };

  const handleStatsSearch = () => {
    loadDoctorStats(statsQuery);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        doctor_id: form.doctorId ? Number(form.doctorId) : null,
        amount: Number(form.amount),
        lab_cost: form.labWork ? Number(form.labCost || 0) : 0,
        payment_method: form.paymentMethod,
        note: form.note || undefined
      };

      if (form.patientId) {
        payload.patient_id = Number(form.patientId);
      } else {
        payload.patient = {
          last_name: form.newPatientLastName
        };
      }

      await api.post("/income/records", payload);
      setForm({
        patientId: "",
        newPatientLastName: "",
        doctorId: "",
        amount: "",
        paymentMethod: "cash",
        labWork: false,
        labCost: "",
        note: ""
      });
      await loadRecords();
    } catch (err) {
      setError(err.message || "Unable to save income record");
    } finally {
      setSaving(false);
    }
  };

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

  const performDelete = async (ids) => {
    setDeletingIds((prev) => [...prev, ...ids]);
    setError("");
    try {
      for (const id of ids) {
        await api.delete(`/income/records/${id}`);
      }
      await loadRecords();
    } catch (err) {
      setError(err.message || "Unable to delete income records");
    } finally {
      setDeletingIds([]);
      setConfirmState(null);
    }
  };

  const doctorComparisonData = useMemo(() => {
    if (!doctorStats || !doctorStats.doctors || doctorStats.doctors.length === 0) {
      return null;
    }
    const labels = doctorStats.doctors.map(
      (doc) => `${doc.last_name} ${doc.first_name}`
    );
    const incomeData = doctorStats.doctors.map((doc) => doc.total_income);
    const commissionData = doctorStats.doctors.map((doc) => doc.total_commission);
    return {
      labels,
      datasets: [
        {
          label: "TOTAL INCOME",
          data: incomeData,
          backgroundColor: "rgba(0, 212, 255, 0.7)",
          borderColor: "#00d4ff",
          borderWidth: 2
        },
        {
          label: "TOTAL COMMISSION",
          data: commissionData,
          backgroundColor: "rgba(46, 204, 64, 0.7)",
          borderColor: "#2ecc40",
          borderWidth: 2
        }
      ]
    };
  }, [doctorStats]);

  const monthlyTrendsData = useMemo(() => {
    if (!doctorStats || !doctorStats.doctors || doctorStats.doctors.length === 0) {
      return null;
    }
    const monthSet = new Set();
    doctorStats.doctors.forEach((doc) => {
      doc.monthly.forEach((item) => {
        monthSet.add(item.month);
      });
    });
    const labels = Array.from(monthSet).sort();
    if (labels.length === 0) {
      return null;
    }
    const datasets = doctorStats.doctors.map((doc, index) => {
      const colors = ["#00d4ff", "#ffd700", "#2ecc40", "#e03030"];
      const color = colors[index % colors.length];
      return {
        label: `${doc.last_name} ${doc.first_name}`,
        data: labels.map((label) => {
          const item = doc.monthly.find((m) => m.month === label);
          return item ? item.total_income : 0;
        }),
        borderColor: color,
        backgroundColor: color + "33",
        tension: 0.2,
        borderWidth: 3,
        pointRadius: 4
      };
    });
    return { labels, datasets };
  }, [doctorStats]);

  const doctorPatientRows = useMemo(() => {
    if (!doctorStats || !doctorStats.doctors || doctorStats.doctors.length === 0) {
      return [];
    }
    const rows = [];
    doctorStats.doctors.forEach((doc) => {
      doc.patients.forEach((patient) => {
        rows.push({
          doctorId: doc.id,
          doctorName: `${doc.last_name} ${doc.first_name}`,
          patientId: patient.id,
          patientName: `${patient.last_name}`,
          totalIncome: patient.total_income,
          totalCommission: patient.total_commission
        });
      });
    });
    return rows;
  }, [doctorStats]);

  return (
    <>
      {error && <div className="form-error">SYSTEM ERROR: {error}</div>}
      
      <div className="two-col">
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">{t("income.title")}</div>
              <div className="panel-meta">{records.length} transactions</div>
            </div>
            <div className="topbar-actions">
              <button className="btn btn-ghost">{t("common.delete")} Selected</button>
            </div>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th><input type="checkbox" /></th>
                  <th>{t("income.table.patient")}</th>
                  <th>{t("income.table.doctor")}</th>
                  <th>{t("income.table.amount")}</th>
                  <th>{t("income.form.lab_cost")}</th>
                  <th>{t("income.table.method")}</th>
                  <th>{t("income.table.date")}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td><input type="checkbox" /></td>
                    <td>{record.patient.last_name}</td>
                    <td>{record.doctor.last_name}</td>
                    <td className="mono" style={{ color: "var(--green)" }}>
                      {record.amount.toLocaleString(undefined, { style: "currency", currency: "CZK" })}
                    </td>
                    <td className="mono" style={{ color: record.lab_cost > 0 ? "var(--red)" : "inherit" }}>
                      {record.lab_cost > 0 ? record.lab_cost.toLocaleString(undefined, { style: "currency", currency: "CZK" }) : "-"}
                    </td>
                    <td>
                      <span className={`pill ${record.payment_method === 'cash' ? 'pill-green' : 'pill-blue'}`}>
                        {t(`income.form.${record.payment_method}`)}
                      </span>
                    </td>
                    <td className="mono">{record.service_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="quick-form">
          <div className="panel-title" style={{ marginBottom: '16px' }}>{t("income.form.add_record")}</div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div className="form-label">{t("income.form.patient")}</div>
              <select className="form-input" value={form.patientId} onChange={(e) => setForm(p => ({...p, patientId: e.target.value}))}>
                <option value="">+ {t("income.form.new_patient")}</option>
                {patients.map((p) => <option key={p.id} value={p.id}>{p.last_name}</option>)}
              </select>
            </div>
            {!form.patientId && (
              <div>
                <div className="form-label">{t("income.form.new_patient")}</div>
                <input className="form-input" placeholder="e.g. Smith" value={form.newPatientLastName} onChange={(e) => setForm(p => ({...p, newPatientLastName: e.target.value}))} />
              </div>
            )}
            <div>
              <div className="form-label">{t("income.form.doctor")}</div>
              <select className="form-input" required value={form.doctorId} onChange={(e) => setForm(p => ({...p, doctorId: e.target.value}))}>
                <option value="">Select doctor...</option>
                {doctors.map((d) => <option key={d.id} value={d.id}>{d.last_name}</option>)}
              </select>
            </div>
            <div className="form-grid">
              <div>
                <div className="form-label">{t("income.form.amount")}</div>
                <div className="amount-input-wrap">
                  <span className="amount-prefix">$</span>
                  <input className="form-input" type="number" placeholder="0.00" value={form.amount} onChange={(e) => setForm(p => ({...p, amount: e.target.value}))} />
                </div>
              </div>
              <div>
                <div className="form-label">{t("income.form.payment_method")}</div>
                <div className="toggle-group">
                  <div className={`toggle-opt ${form.paymentMethod === 'cash' ? 'on' : ''}`} onClick={() => setForm(p => ({...p, paymentMethod: 'cash'}))}>{t("income.form.cash")}</div>
                  <div className={`toggle-opt ${form.paymentMethod === 'card' ? 'on' : ''}`} onClick={() => setForm(p => ({...p, paymentMethod: 'card'}))}>{t("income.form.card")}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
              <input 
                type="checkbox" 
                id="labWork"
                checked={form.labWork} 
                onChange={(e) => setForm(p => ({...p, labWork: e.target.checked}))}
                style={{ width: '18px', height: '18px' }}
              />
              <label htmlFor="labWork" style={{ fontSize: '14px', color: 'var(--text)', cursor: 'pointer' }}>
                {t("income.form.lab_work")}
              </label>
            </div>

            {form.labWork && (
              <div className="panel" style={{ background: 'var(--bg-card)', border: '1px dashed var(--green)', padding: '12px', marginTop: '4px' }}>
                <div className="form-label">{t("income.form.lab_cost")}</div>
                <div className="amount-input-wrap">
                  <span className="amount-prefix">$</span>
                  <input 
                    className="form-input" 
                    type="number" 
                    placeholder="0.00" 
                    value={form.labCost} 
                    onChange={(e) => setForm(p => ({...p, labCost: e.target.value}))} 
                  />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--subtext)', marginTop: '4px' }}>
                  {t("income.form.lab_cost_note")}
                </div>
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }} disabled={saving}>
              {saving ? t("common.loading") : `+ ${t("income.form.submit")}`}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
