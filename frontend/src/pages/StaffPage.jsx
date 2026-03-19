import { useEffect, useMemo, useState } from "react";
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
  commissionRate: ""
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
  const [wageEstimates, setWageEstimates] = useState({});

  const loadRoles = async () => {
    try {
      const items = await api.get("/staff/roles");
      setRoles(items);
    } catch {
      setRoles([]);
    }
  };

  const loadStaff = async (role = roleFilter, query = search) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (role) params.append("role", role);
      if (query) params.append("q", query);
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

  useEffect(() => {
    const compute = async () => {
      if (!staff || staff.length === 0) return;
      const today = new Date();
      const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const to = today.toISOString().slice(0, 10);
      const updates = {};
      const tasks = staff
        .filter((m) => m.role !== "doctor")
        .map(async (m) => {
          try {
            const ts = await api.get(`/outcome/timesheets?staff_id=${m.id}&from=${from}&to=${to}`);
            const hours = ts.reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
            const base = Number(m.base_salary) || 0;
            const total = Number((hours * base).toFixed(2));
            if (total > 0) updates[m.id] = total;
          } catch {
            /* ignore */
          }
        });
      await Promise.all(tasks);
      if (Object.keys(updates).length > 0) {
        setWageEstimates((prev) => ({ ...prev, ...updates }));
      }
    };
    compute();
  }, [staff]);

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
            : 0
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
          : ""
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

  const openPayModal = async (member) => {
      if (member.role === 'doctor') {
          const params = new URLSearchParams();
          params.set("tab", "salary");
          params.set("staff_id", String(member.id));
          navigate(`/outcome/add?${params.toString()}`);
          return;
      }
      try {
          const estimate = await api.get(`/staff/${member.id}/salary-estimate`);
          // Instead of opening a local modal that bypasses signing, 
          // we redirect to the specialized AddOutcomePage which has the signature workflow.
          const params = new URLSearchParams();
          params.set("tab", "salary");
          params.set("staff_id", String(member.id));
          if (estimate && estimate.estimated_total) {
              params.set("amount", estimate.estimated_total.toFixed(2));
          }
          navigate(`/outcome/add?${params.toString()}`);
      } catch (err) {
          setError("Failed to load salary estimate");
      }
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

  return (
    <>
      {error && <div className="form-error">{t("staff_role.system_error", { error })}</div>}
      
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">{t("staff.title")}</div>
            <div className="panel-meta">{t("staff.active_members", { count: filteredStaff.length })}</div>
          </div>
          <div className="topbar-actions">
            <input className="form-input" placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
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
                  <td className="mono" style={{ color: "var(--green)" }} data-label={t("staff.table_meta.total_earned")}>
                    {(() => {
                      const isDoctor = member.role === 'doctor';
                      const val = !isDoctor && wageEstimates[member.id] != null && wageEstimates[member.id] > 0
                        ? wageEstimates[member.id]
                        : (member.unpaid_amount || 0);
                      return val.toLocaleString(undefined, { style: "currency", currency: "CZK" });
                    })()}
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
        <div className="modal-backdrop">
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
