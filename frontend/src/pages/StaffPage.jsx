import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
  const api = useApi();

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
      setError(err.message || "Unable to load staff directory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
    loadStaff();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await api.post("/staff", {
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
      });
      setForm(emptyForm);
      setShowForm(false);
      await loadStaff();
    } catch (err) {
      setError(err.message || "Unable to add staff member");
    } finally {
      setSaving(false);
    }
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

  return (
    <>
      {error && <div className="form-error">SYSTEM ERROR: {error}</div>}
      
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Staff Roster</div>
            <div className="panel-meta">{filteredStaff.length} active members</div>
          </div>
          <div className="topbar-actions">
            <input className="form-input" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Recruit</button>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Base/Commission</th>
                <th>Total Earned</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div className="doc-info">
                      <div className="doc-avatar" style={{ background: `hsl(${member.id * 50}, 50%, 50%)` }}>
                        {member.first_name[0]}{member.last_name[0]}
                      </div>
                      <div>
                        <div className="doc-name">{member.first_name} {member.last_name}</div>
                        <div className="doc-role">{member.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`pill ${member.role === 'doctor' ? 'pill-blue' : 'pill-orange'}`}>
                      {member.role}
                    </span>
                  </td>
                  <td className="mono">
                    {member.role === 'doctor' ? `${(member.commission_rate * 100).toFixed(1)}%` : member.base_salary.toLocaleString(undefined, { style: "currency", currency: "CZK" })}
                  </td>
                  <td className="mono" style={{ color: "var(--green)" }}>
                    {member.commission_income.toLocaleString(undefined, { style: "currency", currency: "CZK" })}
                  </td>
                  <td>
                    <button className="pay-btn" onClick={() => member.role === 'doctor' ? navigate(`/staff/doctor/${member.id}`) : navigate(`/staff/role/${member.id}`)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="modal-backdrop">
          <div className="quick-form" style={{ width: '100%', maxWidth: '500px' }}>
            <div className="panel-title" style={{ marginBottom: '16px' }}>Recruit New Staff</div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-grid">
                <div>
                  <div className="form-label">First Name</div>
                  <input className="form-input" required value={form.firstName} onChange={(e) => setForm(p => ({...p, firstName: e.target.value}))} />
                </div>
                <div>
                  <div className="form-label">Last Name</div>
                  <input className="form-input" required value={form.lastName} onChange={(e) => setForm(p => ({...p, lastName: e.target.value}))} />
                </div>
              </div>
              <div>
                <div className="form-label">Role</div>
                <select className="form-input" value={form.role} onChange={(e) => setForm(p => ({...p, role: e.target.value}))}>
                  {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <div className="form-label">{form.role === 'doctor' ? 'Commission Rate (%)' : 'Base/Hourly Salary'}</div>
                <input className="form-input" type="number" value={form.role === 'doctor' ? form.commissionRate : form.baseSalary} onChange={(e) => setForm(p => form.role === 'doctor' ? {...p, commissionRate: e.target.value} : {...p, baseSalary: e.target.value})} />
              </div>
              <div className="form-grid">
                <div>
                  <div className="form-label">Phone</div>
                  <input className="form-input" value={form.phone} onChange={(e) => setForm(p => ({...p, phone: e.target.value}))} />
                </div>
                <div>
                  <div className="form-label">Email</div>
                  <input className="form-input" type="email" value={form.email} onChange={(e) => setForm(p => ({...p, email: e.target.value}))} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Recruit'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
