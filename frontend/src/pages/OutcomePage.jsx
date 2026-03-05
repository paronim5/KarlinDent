import { useEffect, useMemo, useState } from "react";
import { useApi } from "../api/client.js";

export default function OutcomePage() {
  const api = useApi();
  const today = new Date().toISOString().slice(0, 10);

  const [categories, setCategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [records, setRecords] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo] = useState(today);
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
  const [selectedSalaryIds, setSelectedSalaryIds] = useState([]);
  const [deletingOutcomeIds, setDeletingOutcomeIds] = useState([]);
  const [deletingSalaryIds, setDeletingSalaryIds] = useState([]);
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
      setError(err.message || "Unable to load reference data");
    }
  };

  const loadPeriodData = async (rangeFrom = from, rangeTo = to) => {
    try {
      const [outcomeRecords, salaryRows] = await Promise.all([
        api.get(`/outcome/records?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(
          rangeTo
        )}`),
        api.get(
          `/outcome/salaries?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(
            rangeTo
          )}`
        )
      ]);
      setRecords(outcomeRecords);
      setSalaries(salaryRows);
      setSelectedOutcomeIds([]);
      setSelectedSalaryIds([]);
    } catch (err) {
      setError(err.message || "Unable to load outcome data");
    }
  };

  useEffect(() => {
    loadReferenceData();
    loadPeriodData();
  }, []);

  const handlePeriodChange = () => {
    if (from && to) {
      loadPeriodData(from, to);
      if (salaryForm.staffId) {
        handleSuggestAmount(salaryForm.staffId, from, to);
      }
    }
  };

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
      records.reduce((sum, item) => sum + item.amount, 0) +
      salaries.reduce((sum, item) => sum + item.amount, 0),
    [records, salaries]
  );

  const toggleSelectOutcome = (id) => {
    setSelectedOutcomeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectSalary = (id) => {
    setSelectedSalaryIds((prev) =>
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

  const selectAllSalary = () => {
    if (selectedSalaryIds.length === salaries.length) {
      setSelectedSalaryIds([]);
    } else {
      setSelectedSalaryIds(salaries.map((r) => r.id));
    }
  };

  const isDeletingOutcome = (id) => deletingOutcomeIds.includes(id);
  const isDeletingSalary = (id) => deletingSalaryIds.includes(id);

  const performDeleteOutcome = async (ids) => {
    setDeletingOutcomeIds((prev) => [...prev, ...ids]);
    setError("");
    try {
      for (const id of ids) {
        await api.delete(`/outcome/records/${id}`);
      }
      await loadPeriodData();
    } catch (err) {
      setError(err.message || "Unable to delete outcome records");
    } finally {
      setDeletingOutcomeIds([]);
      setConfirmState(null);
    }
  };

  const performDeleteSalary = async (ids) => {
    setDeletingSalaryIds((prev) => [...prev, ...ids]);
    setError("");
    try {
      for (const id of ids) {
        await api.delete(`/outcome/salaries/${id}`);
      }
      await loadPeriodData();
    } catch (err) {
      setError(err.message || "Unable to delete salary payments");
    } finally {
      setDeletingSalaryIds([]);
      setConfirmState(null);
    }
  };

  return (
    <>
      {error && <div className="form-error">SYSTEM ERROR: {error}</div>}
      
      <div className="two-col">
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Expense Log</div>
              <div className="panel-meta">{records.length} transactions</div>
            </div>
            <div className="topbar-actions">
              <button className="btn btn-ghost">Delete Selected</button>
            </div>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th><input type="checkbox" /></th>
                  <th>Category</th>
                  <th>Vendor</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td><input type="checkbox" /></td>
                    <td>
                      <span className={`pill ${record.category === 'lease' ? 'pill-red' : 'pill-orange'}`}>
                        {record.category}
                      </span>
                    </td>
                    <td>{record.vendor}</td>
                    <td className="mono" style={{ color: "var(--red)" }}>
                      {record.amount.toLocaleString(undefined, { style: "currency", currency: "CZK" })}
                    </td>
                    <td className="mono">{record.expense_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="quick-form">
          <div className="panel-title" style={{ marginBottom: '16px' }}>Quick Add</div>
          <form onSubmit={handleExpenseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div className="form-label">Category</div>
              <select className="form-input" required value={expenseForm.categoryId} onChange={(e) => setExpenseForm(p => ({...p, categoryId: e.target.value}))}>
                <option value="">Select category...</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <div className="form-label">Vendor</div>
              <input className="form-input" placeholder="e.g. Dental Supplies Inc." value={expenseForm.vendor} onChange={(e) => setExpenseForm(p => ({...p, vendor: e.target.value}))} />
            </div>
            <div className="form-grid">
              <div>
                <div className="form-label">Amount</div>
                <div className="amount-input-wrap">
                  <span className="amount-prefix">$</span>
                  <input className="form-input" type="number" placeholder="0.00" value={expenseForm.amount} onChange={(e) => setExpenseForm(p => ({...p, amount: e.target.value}))} />
                </div>
              </div>
              <div>
                <div className="form-label">Date</div>
                <input className="form-input" type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm(p => ({...p, expenseDate: e.target.value}))} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }} disabled={savingExpense}>
              {savingExpense ? "Saving..." : "+ Add Expense"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
