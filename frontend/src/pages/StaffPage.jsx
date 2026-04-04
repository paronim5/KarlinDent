import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useApi } from "../api/client.js";

const emptyForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  bio: "",
  role: "doctor",
  baseSalary: "",
  commissionRate: "",
  weekendSalary: "200"
};

const computeRange = (p) => {
  const now = new Date();
  const to = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
  let from;
  if (p === "day") {
    from = to;
  } else if (p === "week") {
    const d = new Date(to);
    d.setUTCDate(d.getUTCDate() - 6);
    from = d.toISOString().slice(0, 10);
  } else if (p === "month") {
    const d = new Date(to);
    from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
  } else {
    const d = new Date(to);
    from = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
  }
  return { from, to };
};

export default function StaffPage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();

  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState(null);
  const [lastRemoved, setLastRemoved] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [medicineName, setMedicineName] = useState("");
  const [medicineSaving, setMedicineSaving] = useState(false);
  const [medicineError, setMedicineError] = useState("");
  const [payModal, setPayModal] = useState(null);
  const [paying, setPaying] = useState(false);

  const initialPeriod = localStorage.getItem("globalPeriod") || "month";
  const [period, setPeriod] = useState(initialPeriod);
  const [stats, setStats] = useState(null);
  const [showDebt, setShowDebt] = useState(true);

  const loadStats = useCallback(async (p) => {
    const { from, to } = computeRange(p);
    try {
      const data = await api.get(`/staff/stats?from=${from}&to=${to}`);
      setStats(data);
    } catch {
      setStats(null);
    }
  }, [api]);

  useEffect(() => {
    loadStats(period);
  }, [period, loadStats]);

  useEffect(() => {
    const handler = (event) => {
      if (event?.detail?.period) {
        setPeriod(event.detail.period);
      }
    };
    window.addEventListener("periodChanged", handler);
    return () => window.removeEventListener("periodChanged", handler);
  }, []);

  const loadRoles = async () => {
    try {
      const items = await api.get("/staff/roles");
      setRoles(items);
    } catch {
      setRoles([]);
    }
  };

  const loadStaff = async (role = roleFilter, query = search, withDebt = showDebt) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (role) params.append("role", role);
      if (query) params.append("q", query);
      params.append("with_debt", withDebt ? "true" : "false");
      const items = await api.get(`/staff?${params.toString()}`);
      setStaff(items);
    } catch (err) {
      setError(err.message || t("staff.errors.load_staff"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
    loadStaff();
    loadMedicines();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        first_name: form.firstName,
        last_name: form.lastName,
        phone: form.phone || undefined,
        email: form.email || undefined,
        bio: form.bio || undefined,
        role: form.role,
        base_salary: form.role === "doctor" ? 0 : form.baseSalary ? Number(form.baseSalary) : 0,
        commission_rate:
          form.role === "doctor" && form.commissionRate
            ? Number(form.commissionRate) / 100
            : 0,
        weekend_salary: form.role !== "doctor" && form.weekendSalary ? Number(form.weekendSalary) : 200
      };
      if (editingMember) {
        await api.put(`/staff/${editingMember.id}`, payload);
      } else {
        await api.post("/staff", payload);
      }
      setForm(emptyForm);
      setShowForm(false);
      setEditingMember(null);
      await loadStaff();
    } catch (err) {
      setError(err.message || "Unable to save staff member");
    } finally {
      setSaving(false);
    }
  };

  const openAddForm = () => {
    setForm(emptyForm);
    setEditingMember(null);
    setShowForm(true);
  };

  const openEditForm = (member) => {
    setForm({
      firstName: member.first_name || "",
      lastName: member.last_name || "",
      phone: member.phone || "",
      email: member.email || "",
      bio: member.bio || "",
      role: member.role || "doctor",
      baseSalary: member.base_salary ? String(member.base_salary) : "",
      commissionRate:
        member.role === "doctor" && typeof member.commission_rate === "number"
          ? String((member.commission_rate * 100).toFixed(1))
          : "",
      weekendSalary: member.weekend_salary ? String(member.weekend_salary) : "200"
    });
    setEditingMember(member);
    setShowForm(true);
  };

  const filteredStaff = useMemo(() => staff, [staff]);

  const handleEditCommission = async (member) => {
    if (member.role !== "doctor") {
      return;
    }
    const currentPercent = (member.commission_rate * 100).toFixed(1);
    const input = window.prompt(
      `Set commission rate (%) for ${member.first_name} ${member.last_name}`,
      currentPercent
    );
    if (input === null) {
      return;
    }
    const value = Number(input);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      window.alert("Please enter a valid percentage between 0 and 100.");
      return;
    }
    setError("");
    try {
      await api.post(`/staff/${member.id}/commission`, {
        commission_rate: value / 100
      });
      await loadStaff();
    } catch (err) {
      setError(err.message || "Unable to update commission rate");
    }
  };

  const openPayModal = (member) => {
      if (member.role === 'doctor') {
          const params = new URLSearchParams();
          params.set("tab", "salary");
          params.set("staff_id", String(member.id));
          navigate(`/outcome/add?${params.toString()}`);
          return;
      }
      const params = new URLSearchParams();
      params.set("tab", "salary");
      params.set("staff_id", String(member.id));
      if (member.unpaid_amount > 0) {
          params.set("amount", member.unpaid_amount.toFixed(2));
      }
      const today = new Date();
      const to = today.toISOString().slice(0, 10);
      let from;
      if (member.last_paid_at) {
          const d = new Date(member.last_paid_at);
          d.setDate(d.getDate() + 1);
          from = d.toISOString().slice(0, 10);
      } else {
          const d = new Date(today);
          d.setFullYear(d.getFullYear() - 2);
          from = d.toISOString().slice(0, 10);
      }
      // Ensure from never exceeds to (can happen when last_paid_at == today)
      if (from > to) from = to;
      params.set("from", from);
      params.set("to", to);
      navigate(`/outcome/add?${params.toString()}`);
  };

  const handlePaySalary = () => {
      // This function is now redundant as we redirect to AddOutcomePage
      setPayModal(null);
  };

  const handleRemove = async (member) => {
    const confirmed = window.confirm(
      `Remove ${member.first_name} ${member.last_name} from staff? They will no longer appear in lists.`
    );
    if (!confirmed) {
      return;
    }
    setRemovingId(member.id);
    setError("");
    try {
      await api.delete(`/staff/${member.id}`);
      setStaff((prev) => prev.filter((item) => item.id !== member.id));
      setLastRemoved(member);
    } catch (err) {
      setError(err.message || "Unable to remove staff member");
    } finally {
      setRemovingId(null);
    }
  };

  const handleUndoRemove = async () => {
    if (!lastRemoved) {
      return;
    }
    setError("");
    try {
      await api.post(`/staff/${lastRemoved.id}/restore`, {});
      await loadStaff();
      setLastRemoved(null);
    } catch (err) {
      setError(err.message || "Unable to restore staff member");
    }
  };

  const loadMedicines = async () => {
    try {
      const items = await api.get("/staff/medicines");
      setMedicines(items);
    } catch (err) {
      setMedicines([]);
      setMedicineError(err.message || t("staff.errors.load_medicines"));
    }
  };

  const handleAddMedicine = async (event) => {
    event.preventDefault();
    const name = medicineName.trim();
    if (!name) {
      setMedicineError(t("staff.medicines_placeholder"));
      return;
    }
    setMedicineSaving(true);
    setMedicineError("");
    try {
      await api.post("/staff/medicines", { name });
      setMedicineName("");
      await loadMedicines();
    } catch (err) {
      setMedicineError(err.message || t("staff.errors.add_medicine"));
    } finally {
      setMedicineSaving(false);
    }
  };

  const handleDeleteMedicine = async (medicineId) => {
    setMedicineSaving(true);
    setMedicineError("");
    try {
      await api.delete(`/staff/medicines/${medicineId}`);
      await loadMedicines();
    } catch (err) {
      setMedicineError(err.message || t("staff.errors.remove_medicine"));
    } finally {
      setMedicineSaving(false);
    }
  };

  const navigateToMember = (member) => {
    if (member.role === 'doctor') {
      navigate(`/staff/doctor/${member.id}`);
    } else {
      navigate(`/staff/role/${member.id}`);
    }
  };

  const formatCurrency = (value) =>
    Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "CZK" });

  return (
    <>
      {error && <div className="form-error">{t("staff_role.system_error", { error })}</div>}

      <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card s-orange">
          <div className="stat-icon">◉</div>
          <div className="stat-label">{t("staff.stats.active_staff", { defaultValue: "Active Staff" })}</div>
          <div className="stat-value">{stats ? stats.staff_count : filteredStaff.length}</div>
        </div>
        <div className="stat-card s-red">
          <div className="stat-icon">↙</div>
          <div className="stat-label">{t("staff.stats.total_paid", { defaultValue: "Total Paid Salary" })}</div>
          <div className="stat-value">{formatCurrency(stats?.total_paid_salary)}</div>
        </div>
        <div className="stat-card s-blue">
          <div className="stat-icon">◷</div>
          <div className="stat-label">{t("staff.stats.total_unpaid", { defaultValue: "Total Unpaid Salary" })}</div>
          <div className="stat-value" style={{ color: "var(--red)" }}>{formatCurrency(stats?.total_unpaid_salary)}</div>
        </div>
        <div className="stat-card s-green">
          <div className="stat-icon">◈</div>
          <div className="stat-label">{t("staff.stats.total_hours", { defaultValue: "Total Worked Hours" })}</div>
          <div className="stat-value">{stats ? stats.total_worked_hours.toFixed(1) : "—"}h</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">{t("staff.title")}</div>
            <div className="panel-meta">{t("staff.active_members", { count: filteredStaff.length })}</div>
          </div>
          <div className="topbar-actions">
            <input className="form-input" placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
            <label className="check-row">
              <input
                type="checkbox"
                checked={showDebt}
                onChange={(e) => {
                  const val = e.target.checked;
                  setShowDebt(val);
                  loadStaff(roleFilter, search, val);
                }}
              />
              <span>{t("staff.show_debt", "Include debt")}</span>
            </label>
            <button className="btn btn-primary" onClick={openAddForm}>+ {t("staff.add_staff")}</button>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="data-table staff-table">
            <thead>
              <tr>
                <th>{t("staff.table.name")}</th>
                <th>{t("staff.table.role")}</th>
                <th>{t("staff.table_meta.base_commission")}</th>
                <th>{t("staff.table_meta.total_earned")}</th>
                <th>{t("staff.table_meta.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.map((member) => (
                <tr key={member.id}>
                  <td data-label={t("staff.table.name")}>
                    <div className="doc-info">
                      <div className="doc-avatar" style={{ background: `hsl(${member.id * 50}, 50%, 50%)` }}>
                        {member.first_name[0]}{member.last_name[0]}
                      </div>
                      <div style={{ cursor: 'pointer' }} onClick={() => navigateToMember(member)}>
                        <div className="doc-name" style={{ textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.2)' }}>{member.first_name} {member.last_name}</div>
                        <div className="doc-role">{member.email}</div>
                      </div>
                    </div>
                  </td>
                  <td data-label={t("staff.table.role")}>
                    <span className={`pill ${member.role === 'doctor' ? 'pill-blue' : 'pill-orange'}`}>
                      {(() => {
                        const label = t(`staff.roles.${member.role}`);
                        if (label && !label.startsWith("staff.roles.")) return label;
                        const role = String(member.role || "");
                        return role ? role.charAt(0).toUpperCase() + role.slice(1) : t("staff.title");
                      })()}
                    </span>
                  </td>
                  <td className="mono" data-label={t("staff.table_meta.base_commission")}>
                    {member.role === 'doctor' ? `${((member.commission_rate || 0) * 100).toFixed(1)}%` : (member.base_salary || 0).toLocaleString(undefined, { style: "currency", currency: "CZK" })}
                  </td>
                  <td className="mono" style={{ color: (member.unpaid_amount || 0) < 0 ? "var(--red)" : "var(--green)" }} data-label={t("staff.table_meta.total_earned")}>
                    {(member.unpaid_amount || 0).toLocaleString(undefined, { style: "currency", currency: "CZK" })}
                  </td>
                  <td data-label={t("staff.table_meta.actions")}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button className="pay-btn" onClick={() => openPayModal(member)}>{t("staff.actions.pay")}</button>
                      <button className="pay-btn" onClick={() => navigateToMember(member)}>{t("staff.actions.view")}</button>
                      <button className="pay-btn" onClick={() => openEditForm(member)}>{t("staff.actions.edit")}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {payModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
                {t("staff.pay_modal.title", { name: `${payModal.member.first_name} ${payModal.member.last_name}` })}
            </div>
            <div className="modal-body">
                <div style={{ display: 'grid', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{t("staff.pay_modal.base_salary")}:</span>
                        <span className="mono">{(payModal.estimate.base_salary || 0).toLocaleString(undefined, { style: "currency", currency: "CZK" })}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{t("staff.pay_modal.commission")}:</span>
                        <span className="mono">{(payModal.estimate.commission_part || 0).toLocaleString(undefined, { style: "currency", currency: "CZK" })}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{t("staff.pay_modal.adjustments")}:</span>
                        <span className="mono">{(payModal.estimate.adjustments || 0).toLocaleString(undefined, { style: "currency", currency: "CZK" })}</span>
                    </div>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span>{t("staff.pay_modal.total")}:</span>
                        <span className="mono" style={{ color: 'var(--green)' }}>{(payModal.estimate.estimated_total || 0).toLocaleString(undefined, { style: "currency", currency: "CZK" })}</span>
                    </div>
                </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setPayModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handlePaySalary} disabled={paying}>
                {paying ? t("staff.pay_modal.processing") : t("staff.pay_modal.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay">
          <div className="quick-form" style={{ width: '100%', maxWidth: '500px' }}>
            <div className="panel-title" style={{ marginBottom: '16px' }}>{editingMember ? t("staff.edit_staff") : t("staff.add_staff")}</div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-grid">
                <div>
                  <div className="form-label">{t("staff.form.first_name")}</div>
                  <input className="form-input" required value={form.firstName} onChange={(e) => setForm(p => ({...p, firstName: e.target.value}))} />
                </div>
                <div>
                  <div className="form-label">{t("staff.form.last_name")}</div>
                  <input className="form-input" required value={form.lastName} onChange={(e) => setForm(p => ({...p, lastName: e.target.value}))} />
                </div>
              </div>
              <div>
                <div className="form-label">{t("staff.table.role")}</div>
                <select className="form-input" value={form.role} onChange={(e) => setForm(p => ({...p, role: e.target.value}))}>
                  {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <div className="form-label">{form.role === 'doctor' ? t("staff.form.commission_rate") : t("staff.form.base_hourly_salary")}</div>
                <input className="form-input" type="number" value={form.role === 'doctor' ? form.commissionRate : form.baseSalary} onChange={(e) => setForm(p => form.role === 'doctor' ? {...p, commissionRate: e.target.value} : {...p, baseSalary: e.target.value})} />
              </div>
              {form.role !== 'doctor' && (
                <div>
                  <div className="form-label">{t("staff.form.weekend_hourly_salary", { defaultValue: "Weekend Hourly Salary (CZK)" })}</div>
                  <input className="form-input" type="number" value={form.weekendSalary} onChange={(e) => setForm(p => ({...p, weekendSalary: e.target.value}))} />
                </div>
              )}
              <div className="form-grid">
                <div>
                  <div className="form-label">{t("staff.form.phone")}</div>
                  <input className="form-input" value={form.phone} onChange={(e) => setForm(p => ({...p, phone: e.target.value}))} />
                </div>
                <div>
                  <div className="form-label">{t("staff.form.email")}</div>
                  <input className="form-input" type="email" value={form.email} onChange={(e) => setForm(p => ({...p, email: e.target.value}))} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setShowForm(false); setEditingMember(null); setForm(emptyForm); }}>{t("common.cancel")}</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? t("common.loading") : t("common.save")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="panel" style={{ marginTop: '20px' }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">{t("staff.medicines_title")}</div>
            <div className="panel-meta">{t("staff.items_count", { count: medicines.length })}</div>
          </div>
        </div>
        {medicineError && <div className="form-error" style={{ marginBottom: '12px' }}>{medicineError}</div>}
        <form onSubmit={handleAddMedicine} style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <input
            className="form-input"
            value={medicineName}
            onChange={(e) => setMedicineName(e.target.value)}
            placeholder={t("staff.medicines_placeholder")}
          />
          <button type="submit" className="btn btn-primary" disabled={medicineSaving}>
            {medicineSaving ? t("common.loading") : t("staff.medicines_add")}
          </button>
        </form>
        {medicines.length === 0 ? (
          <div className="form-label">{t("staff.medicines_placeholder")}</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px" }}>
            {medicines.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "8px" }}>
                <div className="mono">{m.name}</div>
                <button type="button" className="btn btn-ghost" onClick={() => handleDeleteMedicine(m.id)} disabled={medicineSaving}>
                  {t("common.delete")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
