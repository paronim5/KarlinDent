import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useApi } from "../api/client.js";

export default function AddOutcomePage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();

  // Tabs: "general" or "salary"
  const [activeTab, setActiveTab] = useState("general");

  // General Outcome State
  const [categories, setCategories] = useState([]);
  const [generalForm, setGeneralForm] = useState({
    categoryId: "",
    amount: "",
    description: "",
    vendor: "",
    expenseDate: new Date().toISOString().slice(0, 10),
  });

  // Salary State
  const [staffList, setStaffList] = useState([]);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [salaryEstimate, setSalaryEstimate] = useState(null);
  const [salaryForm, setSalaryForm] = useState({
    amount: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    note: "",
  });
  const [prefillAmount, setPrefillAmount] = useState(null);
  const [prefillStaffId, setPrefillStaffId] = useState("");
  const [salaryRange, setSalaryRange] = useState({ from: "", to: "" });
  const [timesheetSummary, setTimesheetSummary] = useState(null);
  const [hasManualSalaryAmount, setHasManualSalaryAmount] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toNumber = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };

  const formatNumber = (value, options) => {
    const num = Number(value);
    return Number.isFinite(num) ? num.toLocaleString(undefined, options) : "—";
  };

  // Load initial data
  useEffect(() => {
    loadCategories();
    loadStaff();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const staffIdParam = params.get("staff_id");
    const amountParam = params.get("amount");
    const toParam = params.get("to");
    const fromParam = params.get("from");
    if (tab === "salary") {
      setActiveTab("salary");
    }
    if (staffIdParam) {
      setSelectedStaffId(staffIdParam);
      setPrefillStaffId(staffIdParam);
    }
    if (amountParam) {
      const amountValue = toNumber(amountParam, NaN);
      if (Number.isFinite(amountValue) && amountValue > 0) {
        setPrefillAmount(amountValue);
        setSalaryForm((p) => ({ ...p, amount: amountValue.toFixed(2) }));
        setHasManualSalaryAmount(false);
      }
    }
    if (fromParam || toParam) {
      setSalaryRange({ from: fromParam || "", to: toParam || "" });
    } else {
      const today = new Date();
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const to = today.toISOString().slice(0, 10);
      const from = firstOfMonth.toISOString().slice(0, 10);
      setSalaryRange({ from, to });
    }
    if (toParam) {
      setSalaryForm((p) => ({ ...p, paymentDate: toParam }));
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setSalaryForm((p) => ({ ...p, paymentDate: today }));
    }
  }, []);

  const loadCategories = async () => {
    try {
      const data = await api.get("/outcome/categories");
      setCategories(data);
    } catch (err) {
      console.error("Failed to load categories", err);
    }
  };

  const loadStaff = async () => {
    try {
      const data = await api.get("/staff");
      setStaffList(data);
    } catch (err) {
      console.error("Failed to load staff", err);
    }
  };

  // Load salary estimate when staff is selected
  useEffect(() => {
    if (!selectedStaffId) {
      setSalaryEstimate(null);
      setSalaryForm(p => ({ ...p, amount: "" }));
      setPrefillAmount(null);
      setPrefillStaffId("");
      setTimesheetSummary(null);
      setHasManualSalaryAmount(false);
      setError("");
      return;
    }
    if (prefillStaffId && String(prefillStaffId) !== String(selectedStaffId)) {
      setPrefillAmount(null);
      setPrefillStaffId("");
      setHasManualSalaryAmount(false);
    }
    
    const fetchEstimate = async () => {
      try {
        const data = await api.get(`/staff/${selectedStaffId}/salary-estimate`);
        const estimatedTotal = toNumber(data?.estimated_total, NaN);
        if (!Number.isFinite(estimatedTotal)) {
          setSalaryEstimate(null);
          if (prefillAmount === null) setSalaryForm(p => ({ ...p, amount: "" }));
          setError("Salary estimate unavailable. Please enter the amount manually.");
          return;
        }
        setSalaryEstimate(data);
        const staffMember = staffList.find((s) => String(s.id) === String(selectedStaffId));
        const isDoctor = staffMember && staffMember.role === "doctor";
        const rangeHasValues = Boolean(salaryRange.from) && Boolean(salaryRange.to);
        if (isDoctor && prefillAmount === null && !hasManualSalaryAmount) {
          setSalaryForm(p => ({ ...p, amount: estimatedTotal.toFixed(2) }));
        } else if (!isDoctor && !rangeHasValues && prefillAmount === null && !hasManualSalaryAmount) {
          setSalaryForm(p => ({ ...p, amount: estimatedTotal.toFixed(2) }));
        }
        setError("");
      } catch (err) {
        console.error("Failed to load salary estimate", err);
        setSalaryEstimate(null);
        if (prefillAmount === null && !hasManualSalaryAmount) setSalaryForm(p => ({ ...p, amount: "" }));
        setError("Failed to load salary estimate. Please enter the amount manually.");
      }
    };
    
    fetchEstimate();
  }, [selectedStaffId, staffList, salaryRange.from, salaryRange.to]);

  useEffect(() => {
    if (!selectedStaffId || staffList.length === 0) return;
    const staffMember = staffList.find((s) => String(s.id) === String(selectedStaffId));
    if (!staffMember || staffMember.role === "doctor") {
      setTimesheetSummary(null);
      return;
    }
    if (!salaryRange.from || !salaryRange.to) {
      setTimesheetSummary(null);
      return;
    }

    const fetchTimesheets = async () => {
      try {
        const ts = await api.get(
          `/outcome/timesheets?staff_id=${selectedStaffId}&from=${encodeURIComponent(
            salaryRange.from
          )}&to=${encodeURIComponent(salaryRange.to)}`
        );
        const totalHours = ts.reduce((sum, item) => sum + toNumber(item.hours, 0), 0);
        const baseRate = toNumber(staffMember.base_salary, 0);
        const amount = Number((totalHours * baseRate).toFixed(2));
        setTimesheetSummary({ totalHours, baseRate, amount });
        if (!hasManualSalaryAmount) {
          if (totalHours > 0) {
            setSalaryForm((p) => ({ ...p, amount: amount.toFixed(2) }));
            setError("");
          } else {
            setSalaryForm((p) => ({ ...p, amount: "" }));
            setError("No hours recorded for selected period.");
          }
        }
      } catch (err) {
        setTimesheetSummary(null);
        setError(err.message || "Unable to load timesheets");
      }
    };

    fetchTimesheets();
  }, [selectedStaffId, salaryRange.from, salaryRange.to, staffList]);

  const handleGeneralSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      await api.post("/outcome/records", {
        category_id: Number(generalForm.categoryId),
        amount: Number(generalForm.amount),
        description: generalForm.description,
        vendor: generalForm.vendor,
        expense_date: generalForm.expenseDate,
      });
      
      window.dispatchEvent(new CustomEvent("outcomeAdded"));
      window.dispatchEvent(new CustomEvent("toast", { detail: { type: "success", message: "Outcome recorded successfully" } }));
      navigate("/outcome");
    } catch (err) {
      setError(err.message || "Failed to save outcome");
    } finally {
      setSaving(false);
    }
  };

  const handleSalarySubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (!selectedStaffId) {
        setError("Please select a staff member.");
        return;
      }
      const amountValue = toNumber(salaryForm.amount, NaN);
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        setError("Enter a valid payment amount.");
        return;
      }
      if (!salaryForm.paymentDate) {
        setError("Select a payment date.");
        return;
      }
      await api.post("/staff/salaries", {
        staff_id: Number(selectedStaffId),
        amount: amountValue,
        payment_date: salaryForm.paymentDate,
        note: salaryForm.note,
      });

      window.dispatchEvent(new CustomEvent("salaryPaid"));
      window.dispatchEvent(new CustomEvent("toast", { detail: { type: "success", message: "Salary payment recorded and counter reset" } }));
      navigate("/outcome"); // Or stay on page? Navigate seems safer.
    } catch (err) {
      const msg = err.message;
      if (msg === "invalid_staff") setError("Select a valid staff member.");
      else if (msg === "staff_not_found") setError("Selected staff member was not found.");
      else if (msg === "invalid_salary") setError("Enter a valid payment amount.");
      else setError(err.message || "Failed to record salary payment");
    } finally {
      setSaving(false);
    }
  };

  const salaryMetrics = salaryEstimate
    ? {
        baseSalary: toNumber(salaryEstimate.base_salary ?? 0),
        commissionRate: toNumber(salaryEstimate.commission_rate ?? 0),
        totalRevenue: toNumber(salaryEstimate.total_revenue ?? 0),
        commissionPart: toNumber(salaryEstimate.commission_part ?? 0),
        estimatedTotal: toNumber(salaryEstimate.estimated_total ?? 0)
      }
    : null;

  const showTimesheetSummary = Boolean(timesheetSummary);

  return (
    <div className="panel" style={{ width: '100%' }}>
      <div className="panel-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="panel-title">{t("nav.add_outcome", { defaultValue: "Add Outcome" })}</div>
      </div>

      <div className="tabs" style={{ display: 'flex', gap: '16px', marginBottom: '24px', borderBottom: '1px solid var(--border)' }}>
        <button
          type="button"
          className={`tab-btn ${activeTab === "general" ? "active" : ""}`}
          onClick={() => setActiveTab("general")}
          style={{
            padding: '8px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === "general" ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === "general" ? 'var(--accent)' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          {t("outcome.expenses")}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "salary" ? "active" : ""}`}
          onClick={() => setActiveTab("salary")}
          style={{
            padding: '8px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === "salary" ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === "salary" ? 'var(--accent)' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          {t("outcome.salaries")}
        </button>
      </div>

      {error && <div role="alert" className="form-error" style={{ marginBottom: '16px' }}>{error}</div>}

      {activeTab === "general" && (
        <form onSubmit={handleGeneralSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div>
              <div className="form-label">{t("outcome.form.category")}</div>
              <select
                className="form-input"
                required
                value={generalForm.categoryId}
                onChange={(e) => setGeneralForm(p => ({ ...p, categoryId: e.target.value }))}
              >
                <option value="">{t("outcome.form.category")}</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="form-label">{t("outcome.form.amount")}</div>
              <input
                className="form-input"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={generalForm.amount}
                onChange={(e) => setGeneralForm(p => ({ ...p, amount: e.target.value }))}
              />
            </div>

            <div>
              <div className="form-label">{t("outcome.form.date")}</div>
              <input
                className="form-input"
                type="date"
                required
                value={generalForm.expenseDate}
                onChange={(e) => setGeneralForm(p => ({ ...p, expenseDate: e.target.value }))}
              />
            </div>

            <div>
              <div className="form-label">{t("outcome.form.vendor")}</div>
              <input
                className="form-input"
                type="text"
                value={generalForm.vendor}
                onChange={(e) => setGeneralForm(p => ({ ...p, vendor: e.target.value }))}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <div className="form-label">{t("outcome.form.description")}</div>
              <textarea
                className="form-input"
                rows={3}
                value={generalForm.description}
                onChange={(e) => setGeneralForm(p => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>

          <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigate("/outcome")}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t("common.loading") : t("outcome.form.submit_expense")}
            </button>
          </div>
        </form>
      )}

      {activeTab === "salary" && (
        <form onSubmit={handleSalarySubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div>
              <div className="form-label">{t("outcome.form.staff")}</div>
              <select
                className="form-input"
                required
                value={selectedStaffId}
                onChange={(e) => {
                  setSelectedStaffId(e.target.value);
                  setHasManualSalaryAmount(false);
                }}
              >
                <option value="">{t("outcome.form.staff")}</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.first_name} {s.last_name} ({s.name})
                  </option>
                ))}
              </select>
            </div>

            {showTimesheetSummary && (
              <div className="panel" style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '8px' }}>
                <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Salary Breakdown</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>Period:</span>
                  <span>{salaryRange.from} → {salaryRange.to}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>Total Hours:</span>
                  <span>{timesheetSummary.totalHours.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>Base Rate:</span>
                  <span>{formatNumber(timesheetSummary.baseRate, { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', borderTop: '1px solid var(--border)', paddingTop: '4px', marginTop: '4px' }}>
                  <span>Calculated Salary:</span>
                  <span>{formatNumber(timesheetSummary.amount, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}

            {!showTimesheetSummary && salaryMetrics && (
              <div className="panel" style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '8px' }}>
                <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Salary Breakdown</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>Last Payment:</span>
                  <span>{salaryEstimate.last_paid_at || "Never"}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>Base Salary:</span>
                  <span>{formatNumber(salaryMetrics.baseSalary, { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>Commission ({formatNumber(salaryMetrics.commissionRate * 100, { maximumFractionDigits: 2 })}% of {formatNumber(salaryMetrics.totalRevenue)}):</span>
                  <span>{formatNumber(salaryMetrics.commissionPart, { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', borderTop: '1px solid var(--border)', paddingTop: '4px', marginTop: '4px' }}>
                  <span>Total Estimated:</span>
                  <span>{formatNumber(salaryMetrics.estimatedTotal, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}

            <div>
              <div className="form-label">{t("outcome.form.amount")}</div>
              <input
                className="form-input"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={salaryForm.amount}
                onChange={(e) => {
                  setHasManualSalaryAmount(true);
                  setSalaryForm(p => ({ ...p, amount: e.target.value }));
                }}
              />
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {t("outcome.hints.adjust_amount")}
              </div>
            </div>

            <div>
              <div className="form-label">{t("outcome.form.date")}</div>
              <input
                className="form-input"
                type="date"
                required
                value={salaryForm.paymentDate}
                onChange={(e) => setSalaryForm(p => ({ ...p, paymentDate: e.target.value }))}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <div className="form-label">{t("outcome.form.note")}</div>
              <textarea
                className="form-input"
                rows={2}
                value={salaryForm.note}
                onChange={(e) => setSalaryForm(p => ({ ...p, note: e.target.value }))}
                placeholder=""
              />
            </div>
          </div>

          <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigate("/outcome")}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !selectedStaffId}>
              {saving ? t("common.loading") : t("outcome.form.submit_salary")}
            </button>
          </div>
          
          {salaryMetrics && (
            <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239,68,68,0.1)', color: 'var(--red)', borderRadius: '8px', fontSize: '13px' }}>
              {t("outcome.warnings.reset_counter")}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
