import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useApi } from "../api/client.js";

export default function StaffRolePage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const today = new Date().toISOString().slice(0, 10);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo] = useState(today);
  const [timesheets, setTimesheets] = useState([]);
  const [staff, setStaff] = useState(null);
  const [saving, setSaving] = useState(false);
  const [payingSalary, setPayingSalary] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState("");
  const [documentFilter, setDocumentFilter] = useState({ from: today.slice(0, 7) + "-01", to: today });
  const [form, setForm] = useState({
    workDate: today,
    startTime: "09:00",
    endTime: "17:00",
    note: ""
  });
  const [isTimesheetCollapsed, setIsTimesheetCollapsed] = useState(false);

  const [editingId, setEditingId] = useState(null);

  const formatTime = (value) => {
    if (!value || typeof value !== "string") return "—";
    return value.slice(0, 5);
  };

  const loadAll = async (rangeFrom = from, rangeTo = to) => {
    setError("");
    try {
      const [staffList, ts] = await Promise.all([
        api.get("/staff"),
        api.get(`/outcome/timesheets?staff_id=${id}&from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`)
      ]);
      const me = staffList.find((s) => String(s.id) === String(id));
      setStaff(me || null);
      setTimesheets(ts);
    } catch (err) {
      console.error("Failed to load staff role data", err);
      const msg = err.message;
      if (msg === "staff_not_found") setError(t("staff_role.errors.staff_not_found"));
      else if (msg === "invalid_staff") setError(t("staff_role.errors.invalid_staff"));
      else if (msg === "not_found") setError(t("staff_role.errors.timesheets_unavailable"));
      else setError(err.message || t("staff_role.errors.load_timesheets"));
    }
  };

  const loadDocuments = async (rangeFrom, rangeTo) => {
    setDocumentsLoading(true);
    setDocumentsError("");
    try {
      const params = new URLSearchParams();
      params.set("type", "salary_report");
      if (rangeFrom) params.set("from", rangeFrom);
      if (rangeTo) params.set("to", rangeTo);
      const items = await api.get(`/staff/${id}/documents?${params.toString()}`);
      setDocuments(items);
    } catch (err) {
      console.error("Failed to load salary documents", err);
      setDocumentsError(err.message || t("staff_role.errors.load_documents"));
    } finally {
      setDocumentsLoading(false);
    }
  };

  const getAuthHeaders = () => {
    const headers = {};
    const rawUser = localStorage.getItem("auth_user");
    if (!rawUser) return headers;
    try {
      const user = JSON.parse(rawUser);
      if (user?.id) headers["X-Staff-Id"] = String(user.id);
      if (user?.role) headers["X-Staff-Role"] = String(user.role);
    } catch {
    }
    return headers;
  };

  const downloadDocument = async (documentId, fallbackName) => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/staff/${id}/documents/${documentId}/download`, { headers });
      if (!response.ok) {
        throw new Error(t("staff_role.errors.download_document"));
      }
      const blob = await response.blob();
      const fileName = fallbackName || t("staff_role.file_default");
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download salary document", err);
      setDocumentsError(err.message || t("staff_role.errors.download_document"));
    }
  };

  const previewDocument = async (documentId) => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/staff/${id}/documents/${documentId}/view`, { headers });
      if (!response.ok) {
        throw new Error(t("staff_role.errors.preview_document"));
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 60000);
    } catch (err) {
      console.error("Failed to preview salary document", err);
      setDocumentsError(err.message || t("staff_role.errors.preview_document"));
    }
  };

  useEffect(() => {
    loadAll();
  }, [id]);

  useEffect(() => {
    setDocumentFilter({ from, to });
  }, [from, to]);

  useEffect(() => {
    if (documentFilter.from || documentFilter.to) {
      loadDocuments(documentFilter.from, documentFilter.to);
    }
  }, [id, documentFilter.from, documentFilter.to]);

  const totalHours = useMemo(
    () => timesheets.reduce((sum, t) => sum + t.hours, 0),
    [timesheets]
  );

  const totalWages = useMemo(() => {
    const base = staff && staff.base_salary ? Number(staff.base_salary) : 0;
    return Number((totalHours * base).toFixed(2));
  }, [staff, totalHours]);

  const baseRate = staff && staff.base_salary ? Number(staff.base_salary) : 0;

  const handleRecordSalary = async () => {
    setPayingSalary(true);
    setError("");
    try {
      if (!staff) {
        setError(t("staff_role.errors.staff_not_found"));
        return;
      }
      if (!from || !to) {
        setError(t("staff_role.errors.invalid_range"));
        return;
      }
      if (totalHours <= 0) {
        setError(t("staff_role.errors.no_hours"));
        return;
      }
      const params = new URLSearchParams();
      params.set("tab", "salary");
      params.set("staff_id", String(id));
      params.set("amount", totalWages.toFixed(2));
      params.set("from", from);
      params.set("to", to);
      navigate(`/outcome/add?${params.toString()}`);
    } finally {
      setPayingSalary(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (!form.workDate || !form.startTime || !form.endTime) {
        setError(t("staff_role.errors.required_shift_fields"));
        return;
      }
      if (editingId) {
        await api.put(`/outcome/timesheets/${editingId}`, {
          work_date: form.workDate,
          start_time: form.startTime,
          end_time: form.endTime,
          note: form.note || undefined
        });
      } else {
        await api.post("/outcome/timesheets", {
          staff_id: Number(id),
          work_date: form.workDate,
          start_time: form.startTime,
          end_time: form.endTime,
          note: form.note || undefined
        });
      }
      setForm({
        workDate: today,
        startTime: "09:00",
        endTime: "17:00",
        note: ""
      });
      setEditingId(null);
      await loadAll();
    } catch (err) {
      console.error("Failed to save shift", err);
      const msg = err.message;
      if (msg === "invalid_time_range") setError(t("staff_role.errors.invalid_time_range"));
      else if (msg === "timesheet_not_found") setError(t("staff_role.errors.shift_not_found"));
      else if (msg === "staff_not_found") setError(t("staff_role.errors.staff_not_found"));
      else if (msg === "invalid_data") setError(t("staff_role.errors.invalid_shift_data"));
      else setError(err.message || t("staff_role.errors.save_shift"));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (t) => {
    setEditingId(t.id);
    setForm({
      workDate: t.work_date,
      startTime: t.start_time.slice(0, 5),
      endTime: t.end_time.slice(0, 5),
      note: t.note || ""
    });
  };

  const handleDelete = async (tsId) => {
    if (!window.confirm(t("staff_role.confirm_delete_shift"))) return;
    setError("");
    try {
      await api.delete(`/outcome/timesheets/${tsId}`);
      await loadAll();
    } catch (err) {
      console.error("Failed to delete shift", err);
      const msg = err.message;
      if (msg === "timesheet_not_found") setError(t("staff_role.errors.shift_not_found"));
      else setError(err.message || t("staff_role.errors.delete_shift"));
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm({
      workDate: today,
      startTime: "09:00",
      endTime: "17:00",
      note: ""
    });
  };

  const handlePeriodApply = async () => {
    await loadAll(from, to);
  };

  const title = staff ? staff.role.charAt(0).toUpperCase() + staff.role.slice(1) : t("staff_role.title_fallback");

  const exportTimesheets = () => {
    const rows = [["date", "start", "end", "hours", "note"], ...timesheets.map((item) => [item.work_date, item.start_time, item.end_time, item.hours, item.note || ""])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `timesheets-${id}-${from}-${to}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <>
      {error && <div className="form-error">{t("staff_role.system_error", { error })}</div>}
      <div className="staff-role-toolbar">
        <div className="doc-filter-controls">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="form-input doc-filter-input" aria-label={t("income.date_range.from")} />
          <span className="doc-filter-separator">-</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="form-input doc-filter-input" aria-label={t("income.date_range.to")} />
          <button type="button" className="btn btn-ghost" onClick={handlePeriodApply}>{t("staff_role.search")}</button>
          <button type="button" className="btn btn-primary" onClick={exportTimesheets}>{t("common.export_csv")}</button>
        </div>
      </div>
      
      <div className="two-col staff-role-layout">
        <div className="quick-form staff-role-sidepanel staff-role-controls-panel">
          <div className="panel" style={{ marginBottom: "16px" }}>
            <div className="panel-header">
              <div>
                <div className="panel-title">{t("staff_role.salary_summary")}</div>
                <div className="panel-meta">{from} → {to}</div>
              </div>
            </div>
            <div style={{ display: "grid", gap: "8px", padding: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{t("outcome.salary_panel.total_hours")}</span>
                <span className="mono">{totalHours.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{t("outcome.salary_panel.base_rate")}</span>
                <span className="mono">{baseRate.toLocaleString(undefined, { style: "currency", currency: "CZK" })}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "600" }}>
                <span>{t("outcome.salary_panel.calculated_salary")}</span>
                <span className="mono">{totalWages.toLocaleString(undefined, { style: "currency", currency: "CZK" })}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button type="button" className="btn btn-primary" onClick={handleRecordSalary} disabled={payingSalary}>
                  {payingSalary ? t("staff_role.recording") : t("staff_role.record_salary")}
                </button>
              </div>
            </div>
          </div>
          <div className="panel" style={{ marginBottom: "16px" }}>
            <div className="panel-header" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="panel-title">{t("staff_role.salary_documents")}</div>
                <div className="panel-meta">{t("staff_role.signed_reports")}</div>
              </div>
              <div className="doc-filter-controls">
                <input
                  type="date"
                  value={documentFilter.from}
                  onChange={(e) => setDocumentFilter((prev) => ({ ...prev, from: e.target.value }))}
                  className="form-input doc-filter-input"
                />
                <span className="doc-filter-separator">-</span>
                <input
                  type="date"
                  value={documentFilter.to}
                  onChange={(e) => setDocumentFilter((prev) => ({ ...prev, to: e.target.value }))}
                  className="form-input doc-filter-input"
                />
                <button className="btn btn-ghost" onClick={() => loadDocuments(documentFilter.from, documentFilter.to)}>
                  {t("staff_role.search")}
                </button>
              </div>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("staff_role.headers_docs.period")}</th>
                    <th>{t("staff_role.headers_docs.signed_at")}</th>
                    <th>{t("staff_role.headers_docs.signer")}</th>
                    <th>{t("staff_role.headers_docs.file")}</th>
                    <th>{t("staff_role.headers_docs.action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {documentsLoading && (
                    [...Array(3)].map((_, idx) => (
                      <tr key={`doc-${idx}`}>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                      </tr>
                    ))
                  )}
                  {!documentsLoading && documentsError && (
                    <tr>
                      <td colSpan={5} className="empty-state">{documentsError}</td>
                    </tr>
                  )}
                  {!documentsLoading && !documentsError && documents.length === 0 && (
                    <tr>
                      <td colSpan={5} className="empty-state">{t("staff_role.no_documents")}</td>
                    </tr>
                  )}
                  {!documentsLoading && !documentsError && documents.map((doc) => (
                    <tr key={doc.id}>
                      <td className="mono">{doc.period_from || "—"} → {doc.period_to || "—"}</td>
                      <td className="mono">{doc.signed_at ? new Date(doc.signed_at).toLocaleString() : "—"}</td>
                      <td>{doc.signer_name || "—"}</td>
                      <td className="mono doc-filename">{doc.file_name || t("staff_role.file_default")}</td>
                      <td>
                        <div className="doc-actions">
                          <button className="pay-btn" onClick={() => previewDocument(doc.id)}>
                            {t("staff_role.view")}
                          </button>
                          <button className="pay-btn" onClick={() => downloadDocument(doc.id, doc.file_name)}>
                            {t("staff_role.download")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel-title" style={{ marginBottom: '16px' }}>{editingId ? t("staff_role.edit_shift") : t("staff_role.add_shift")}</div>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div className="form-label">{t("staff_role.shift_date")}</div>
              <input className="form-input" type="date" value={form.workDate} onChange={(e) => setForm(p => ({...p, workDate: e.target.value}))} />
            </div>
            <div className="form-grid">
              <div>
                <div className="form-label">{t("staff_role.shift_start")}</div>
                <input className="form-input" type="time" value={form.startTime} onChange={(e) => setForm(p => ({...p, startTime: e.target.value}))} />
              </div>
              <div>
                <div className="form-label">{t("staff_role.shift_end")}</div>
                <input className="form-input" type="time" value={form.endTime} onChange={(e) => setForm(p => ({...p, endTime: e.target.value}))} />
              </div>
            </div>
            <div>
              <div className="form-label">{t("staff_role.shift_note")}</div>
              <input className="form-input" placeholder={t("staff_role.shift_placeholder")} value={form.note} onChange={(e) => setForm(p => ({...p, note: e.target.value}))} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              {editingId && <button type="button" className="btn btn-ghost" onClick={handleCancelEdit}>Cancel</button>}
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? t("staff_role.saving") : (editingId ? t("staff_role.update_shift") : `+ ${t("staff_role.add_shift")}`)}
              </button>
            </div>
          </form>
        </div>

        <div className="panel staff-role-timesheet-panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">{t("staff_role.timesheet_log")}</div>
              <div className="panel-meta">{t("staff_role.entries_count", { count: timesheets.length })}</div>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsTimesheetCollapsed((prev) => !prev)}
              aria-expanded={!isTimesheetCollapsed}
              aria-controls="staff-role-timesheet-log"
            >
              {isTimesheetCollapsed ? t("staff_role.expand_log", { defaultValue: "Expand Log" }) : t("staff_role.collapse_log", { defaultValue: "Collapse Log" })}
            </button>
          </div>
          <div
            id="staff-role-timesheet-log"
            className={`table-wrapper staff-role-timesheet-table ${isTimesheetCollapsed ? "collapsed" : ""}`}
            hidden={isTimesheetCollapsed}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("staff_role.headers.date")}</th>
                  <th>{t("staff_role.headers.start")}</th>
                  <th>{t("staff_role.headers.end")}</th>
                  <th>{t("staff_role.headers.hours")}</th>
                  <th>{t("staff_role.headers.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {timesheets.map((entry) => (
                  <tr key={entry.id}>
                    <td className="mono">{entry.work_date}</td>
                    <td className="mono">{formatTime(entry.start_time)}</td>
                    <td className="mono">{formatTime(entry.end_time)}</td>
                    <td className="mono" style={{ color: "var(--accent)" }}>{Number(entry.hours || 0).toFixed(2)}</td>
                    <td>
                      <button className="pay-btn" onClick={() => handleEdit(entry)}>{t("staff.actions.edit")}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
