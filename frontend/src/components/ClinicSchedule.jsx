import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "../api/client";

const START_H = 7;
const END_H = 22;
const SLOT_H = END_H - START_H;
const SNAP_MIN = 15; // snap to 15-minute increments

const f2 = (n) => String(n).padStart(2, "0");
/** Format a Date as a timezone-aware ISO string so the server stores the correct wall-clock time. */
const toLocalISO = (d) => {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${f2(d.getMonth() + 1)}-${f2(d.getDate())}T${f2(d.getHours())}:${f2(d.getMinutes())}:${f2(d.getSeconds())}${sign}${f2(Math.floor(abs / 60))}:${f2(abs % 60)}`;
};
const toM = (h, m) => h * 60 + m;
const durH = (start, end) => {
  const mins = (end - start) / 60000;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};
const dayKey = (d) => `${d.getFullYear()}-${f2(d.getMonth() + 1)}-${f2(d.getDate())}`;
const sameDay = (a, b) => dayKey(a) === dayKey(b);

const snap = (mins) => Math.round(mins / SNAP_MIN) * SNAP_MIN;
const clampMin = (m) => Math.max(START_H * 60, Math.min(END_H * 60, m));
const pxToMin = (px, hourW) => snap((px / hourW) * 60 + START_H * 60);
const minToPx = (m, hourW) => ((m - START_H * 60) / 60) * hourW;

const DOCTOR_PALETTE = ["#3b82f6", "#6366f1", "#8b5cf6", "#0ea5e9", "#06b6d4", "#2563eb", "#7c3aed", "#0284c7", "#4f46e5"];
const STAFF_PALETTE = ["#0a84ff", "#30d158", "#5856d6", "#ff375f", "#ff9f0a", "#14b8a6", "#bf5af2", "#64d2ff", "#ac8e68"];

/* ── Mini calendar ── */
function MiniCal({ selected, onSelect, t }) {
  const [view, setView] = useState(new Date(selected));
  const year = view.getFullYear();
  const month = view.getMonth();
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const today = new Date();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push({ day: prevMonthDays - startDow + i + 1, other: true, key: `p-${i}` });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, other: false, key: `d-${d}` });
  const nav = (step) => { const n = new Date(view); n.setMonth(n.getMonth() + step); setView(n); };
  const weekDays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button onClick={() => nav(-1)} className="btn btn-ghost" style={{ padding: "4px 10px", minHeight: 28, fontSize: 14 }}>&#8249;</button>
        <span style={{ fontSize: 13, fontWeight: 700 }}>
          {view.toLocaleString("default", { month: "long", year: "numeric" })}
        </span>
        <button onClick={() => nav(1)} className="btn btn-ghost" style={{ padding: "4px 10px", minHeight: 28, fontSize: 14 }}>&#8250;</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {weekDays.map((d) => (
          <div key={d} style={{ fontFamily: "var(--font-mono)", color: "var(--muted)", fontSize: 10, textAlign: "center", fontWeight: 500, letterSpacing: 0.5, paddingBottom: 4 }}>{d}</div>
        ))}
        {cells.map((cell) => {
          if (cell.other) return <div key={cell.key} style={{ opacity: 0.25, textAlign: "center", color: "var(--muted)", fontSize: 12, padding: "5px 0" }}>{cell.day}</div>;
          const d = new Date(year, month, cell.day);
          const isSel = sameDay(d, selected);
          const isToday = sameDay(d, today);
          return (
            <div key={cell.key} onClick={() => onSelect(d)} style={{
              cursor: "pointer", textAlign: "center", fontSize: 12, borderRadius: 8, padding: "5px 0",
              background: isSel ? "var(--accent)" : "transparent",
              color: isSel ? "#fff" : isToday ? "var(--accent)" : "var(--subtext)",
              fontWeight: isSel || isToday ? 700 : 400,
              transition: "all .12s",
            }}>
              {cell.day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Shift modal ── */
function ShiftModal({ open, editingShift, form, setForm, staffList, onClose, onSave, onDelete, t }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "grid", placeItems: "center", zIndex: 500 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel" style={{ width: 420, maxWidth: "95vw" }}>
        <div className="panel-header">
          <div>
            <div className="panel-title" style={{ fontSize: 16 }}>{editingShift ? t("schedule.modal.edit_shift") : t("schedule.modal.new_shift")}</div>
            <div className="panel-meta" style={{ fontSize: 10 }}>{editingShift ? t("schedule.modal.update_details") : t("schedule.modal.schedule_staff")}</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: "4px 10px", minHeight: 28 }}>&times;</button>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, display: "block" }}>{t("schedule.modal.staff_member")}</label>
            <select value={form.staff_id} onChange={(e) => setForm((p) => ({ ...p, staff_id: e.target.value }))} className="form-input">
              {staffList.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, display: "block" }}>{t("schedule.modal.start_time")}</label>
              <input type="text" inputMode="numeric" placeholder="HH:MM" maxLength={5}
                value={form.start_time}
                onChange={(e) => {
                  let v = e.target.value.replace(/[^0-9:]/g, "");
                  if (v.length === 2 && !v.includes(":") && form.start_time.length < 3) v += ":";
                  setForm((p) => ({ ...p, start_time: v }));
                }}
                className="form-input" style={{ fontFamily: "var(--font-mono)", letterSpacing: 1 }} />
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, display: "block" }}>{t("schedule.modal.end_time")}</label>
              <input type="text" inputMode="numeric" placeholder="HH:MM" maxLength={5}
                value={form.end_time}
                onChange={(e) => {
                  let v = e.target.value.replace(/[^0-9:]/g, "");
                  if (v.length === 2 && !v.includes(":") && form.end_time.length < 3) v += ":";
                  setForm((p) => ({ ...p, end_time: v }));
                }}
                className="form-input" style={{ fontFamily: "var(--font-mono)", letterSpacing: 1 }} />
            </div>
          </div>
          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, display: "block" }}>{t("schedule.modal.notes")}</label>
            <input value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} placeholder={t("schedule.modal.note_placeholder")} className="form-input" />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "0 18px 18px" }}>
          <div>{editingShift ? <button onClick={onDelete} className="btn" style={{ border: "1px solid var(--red)", color: "var(--red)", background: "transparent" }}>{t("schedule.modal.delete")}</button> : null}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} className="btn btn-ghost">{t("schedule.modal.cancel")}</button>
            <button onClick={onSave} className="btn btn-primary">{t("schedule.modal.save_shift")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ── */
export default function ClinicSchedule({ api: injectedApi }) {
  const { t } = useTranslation();
  const defaultApi = useApi();
  const api = useMemo(() => injectedApi || defaultApi, [injectedApi]);

  const [date, setDate] = useState(new Date());
  const [tab, setTab] = useState("doctors");
  const [allStaff, setAllStaff] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [modalForm, setModalForm] = useState({ staff_id: "", start_time: "09:00", end_time: "17:00", note: "" });
  const [showSidebar, setShowSidebar] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const ROW_H = isMobile ? 44 : 56;
  const LABEL_W = isMobile ? 120 : 200;
  const HOUR_W = isMobile ? 40 : 50;
  const totalW = HOUR_W * SLOT_H;

  /* ── Drag state ── */
  const dragRef = useRef(null);           // { type: "move"|"resize-l"|"resize-r", shiftId, staffId, origStart, origEnd, startX, gridLeft }
  const dragPreviewRef = useRef(null);    // mirror of dragPreview for use in event handlers
  const justDraggedRef = useRef(false);   // prevents click from opening modal right after a drag
  const [dragPreview, setDragPreview] = useState(null);  // { shiftId, leftMin, rightMin } — minutes from midnight
  const [dropTarget, setDropTarget] = useState(null);    // staffId being hovered during sidebar drag
  const [sidebarDrag, setSidebarDrag] = useState(null);  // staffId being dragged from sidebar

  const doctorsList = useMemo(() =>
    allStaff.filter((s) => s.is_active && s.role === "doctor").map((s, i) => ({
      ...s, color: DOCTOR_PALETTE[i % DOCTOR_PALETTE.length],
      initials: `${s.first_name?.[0] || ""}${s.last_name?.[0] || ""}`.toUpperCase(),
    })), [allStaff]);

  const staffList = useMemo(() =>
    allStaff.filter((s) => s.is_active && s.role !== "doctor").map((s, i) => ({
      ...s, color: STAFF_PALETTE[i % STAFF_PALETTE.length],
      initials: `${s.first_name?.[0] || ""}${s.last_name?.[0] || ""}`.toUpperCase(),
    })), [allStaff]);

  const currentList = tab === "doctors" ? doctorsList : staffList;
  const tabColor = tab === "doctors" ? "var(--blue)" : "var(--green)";

  const staffWithShifts = useMemo(() => {
    const ids = new Set(shifts.filter((sh) => sameDay(new Date(sh.start), date)).map((sh) => sh.staff_id));
    return currentList.filter((s) => ids.has(s.id));
  }, [shifts, currentList, date]);

  const shiftsByStaff = useMemo(() => {
    const map = new Map();
    currentList.forEach((s) => map.set(s.id, []));
    shifts.forEach((sh) => { if (map.has(sh.staff_id)) map.get(sh.staff_id).push(sh); });
    return map;
  }, [shifts, currentList]);

  const fetchStaff = useCallback(async () => {
    try { setAllStaff(await api.get("/staff")); } catch (err) { console.error("Failed to fetch staff", err); }
  }, [api]);

  const fetchShifts = useCallback(async () => {
    setLoading(true);
    try {
      const start = new Date(date); start.setHours(0, 0, 0, 0);
      const end = new Date(date); end.setHours(23, 59, 59, 999);
      setShifts(await api.get(`/schedule?start=${encodeURIComponent(toLocalISO(start))}&end=${encodeURIComponent(toLocalISO(end))}`));
    } catch (err) { console.error("Failed to fetch shifts", err); }
    finally { setLoading(false); }
  }, [api, date]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);
  useEffect(() => { fetchShifts(); }, [fetchShifts]);
  useEffect(() => { const t = setInterval(fetchShifts, 30000); return () => clearInterval(t); }, [fetchShifts]);

  const dateLabel = useMemo(() =>
    date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).toUpperCase()
  , [date]);

  /* ── Shift drag handlers (move & resize) ── */
  const DRAG_DEAD_ZONE = 4; // px – must move this far before drag activates
  const pendingDragRef = useRef(null);

  const onShiftPointerDown = useCallback((e, shift, type) => {
    e.stopPropagation();
    e.preventDefault();
    const gridEl = e.currentTarget.closest("[data-timeline]");
    if (!gridEl) return;
    const s = new Date(shift.start), en = new Date(shift.end);
    pendingDragRef.current = {
      type,
      shift,
      shiftId: shift.id,
      staffId: shift.staff_id,
      origStartMin: toM(s.getHours(), s.getMinutes()),
      origEndMin: toM(en.getHours(), en.getMinutes()),
      startX: e.clientX,
      gridLeft: gridEl.getBoundingClientRect().left,
      activated: false,
    };
  }, []);

  const activateDrag = useCallback((pd) => {
    pd.activated = true;
    dragRef.current = pd;
    const preview = { shiftId: pd.shiftId, leftMin: pd.origStartMin, rightMin: pd.origEndMin };
    dragPreviewRef.current = preview;
    setDragPreview(preview);
    document.body.style.cursor = pd.type === "move" ? "grabbing" : "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const commitDrag = useCallback(async (leftMin, rightMin, shiftId) => {
    const sh = Math.floor(leftMin / 60), sm = leftMin % 60;
    const eh = Math.floor(rightMin / 60), em = rightMin % 60;
    const start = new Date(date); start.setHours(sh, sm, 0, 0);
    const end = new Date(date); end.setHours(eh, em, 0, 0);
    try {
      await api.put(`/schedule/${shiftId}`, { start_time: toLocalISO(start), end_time: toLocalISO(end), force: true });
      await fetchShifts();
    } catch (err) { console.error("Drag update failed", err); await fetchShifts(); }
  }, [api, date, fetchShifts]);

  useEffect(() => {
    const onMove = (e) => {
      const pd = pendingDragRef.current;
      if (!pd) return;
      const dx = e.clientX - pd.startX;
      // Check dead zone before activating drag
      if (!pd.activated) {
        if (Math.abs(dx) < DRAG_DEAD_ZONE) return;
        activateDrag(pd);
      }
      const d = dragRef.current;
      if (!d) return;
      const deltaMin = snap(Math.round((dx / HOUR_W) * 60));
      let leftMin, rightMin;
      if (d.type === "move") {
        const dur = d.origEndMin - d.origStartMin;
        leftMin = clampMin(d.origStartMin + deltaMin);
        rightMin = leftMin + dur;
        if (rightMin > END_H * 60) { rightMin = END_H * 60; leftMin = rightMin - dur; }
      } else if (d.type === "resize-l") {
        leftMin = clampMin(d.origStartMin + deltaMin);
        rightMin = d.origEndMin;
        if (leftMin >= rightMin - SNAP_MIN) leftMin = rightMin - SNAP_MIN;
      } else {
        leftMin = d.origStartMin;
        rightMin = clampMin(d.origEndMin + deltaMin);
        if (rightMin <= leftMin + SNAP_MIN) rightMin = leftMin + SNAP_MIN;
      }
      const preview = { shiftId: d.shiftId, leftMin, rightMin };
      dragPreviewRef.current = preview;
      setDragPreview(preview);
    };
    const onUp = () => {
      const pd = pendingDragRef.current;
      pendingDragRef.current = null;
      if (!pd) return;
      // Click without movement → open edit modal
      if (!pd.activated) {
        dragRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (pd.type === "move") openModalRef.current(pd.shift);
        return;
      }
      // Drag was active → commit the time change
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      justDraggedRef.current = true;
      setTimeout(() => { justDraggedRef.current = false; }, 200);
      const p = dragPreviewRef.current;
      dragPreviewRef.current = null;
      setDragPreview(null);
      if (p && (p.leftMin !== pd.origStartMin || p.rightMin !== pd.origEndMin)) {
        commitDrag(p.leftMin, p.rightMin, pd.shiftId);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [commitDrag, activateDrag]);

  /* ── Sidebar → timeline drop (HTML5 DnD) ── */
  const onSidebarDragStart = useCallback((e, staffMember) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", String(staffMember.id));
    setSidebarDrag(staffMember.id);
  }, []);

  const onTimelineDragOver = useCallback((e) => {
    if (!sidebarDrag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, [sidebarDrag]);

  const onTimelineDrop = useCallback(async (e) => {
    e.preventDefault();
    const staffId = parseInt(e.dataTransfer.getData("text/plain"), 10);
    setSidebarDrag(null);
    setDropTarget(null);
    if (!staffId) return;
    // If person already has a shift today, open edit modal instead of creating
    const existing = shifts.find(sh => sh.staff_id === staffId && sameDay(new Date(sh.start), date));
    if (existing) {
      openModalRef.current(existing);
      return;
    }
    // Create 9:00-17:00 shift
    const start = new Date(date); start.setHours(9, 0, 0, 0);
    const end = new Date(date); end.setHours(17, 0, 0, 0);
    try {
      await api.post("/schedule", { staff_id: staffId, start_time: toLocalISO(start), end_time: toLocalISO(end), note: "", force: true });
      await fetchShifts();
    } catch (err) { alert(t("schedule.errors.save_shift", { message: err.message || "Unknown error" })); }
  }, [api, date, fetchShifts, shifts, t]);

  const onTimelineDragEnd = useCallback(() => {
    setSidebarDrag(null);
    setDropTarget(null);
  }, []);

  const openModal = useCallback((shift = null, staffId = null, hour = 9) => {
    if (shift) {
      const s = new Date(shift.start), e = new Date(shift.end);
      setEditingShift(shift);
      setModalForm({ staff_id: shift.staff_id, start_time: `${f2(s.getHours())}:${f2(s.getMinutes())}`, end_time: `${f2(e.getHours())}:${f2(e.getMinutes())}`, note: shift.note || "" });
    } else {
      setEditingShift(null);
      setModalForm({ staff_id: staffId || currentList[0]?.id || "", start_time: `${f2(hour)}:00`, end_time: `${f2(Math.min(hour + 8, 23))}:00`, note: "" });
    }
    setModalOpen(true);
  }, [currentList]);
  const openModalRef = useRef(openModal);
  openModalRef.current = openModal;

  const saveShift = async () => {
    try {
      const [sh, sm] = modalForm.start_time.split(":").map(Number);
      const [eh, em] = modalForm.end_time.split(":").map(Number);
      const start = new Date(date); start.setHours(sh, sm, 0, 0);
      const end = new Date(date); end.setHours(eh, em, 0, 0);
      const payload = { staff_id: Number(modalForm.staff_id), start_time: toLocalISO(start), end_time: toLocalISO(end), note: modalForm.note, force: true };
      if (editingShift) await api.put(`/schedule/${editingShift.id}`, payload);
      else await api.post("/schedule", payload);
      setModalOpen(false);
      await fetchShifts();
    } catch (err) { alert(t("schedule.errors.save_shift", { message: err.message || "Unknown error" })); }
  };

  const deleteShift = async () => {
    if (!editingShift) return;
    if (!window.confirm(t("schedule.errors.confirm_delete"))) return;
    try { await api.delete(`/schedule/${editingShift.id}`); setModalOpen(false); await fetchShifts(); }
    catch (err) { alert(t("schedule.errors.delete_shift", { message: err.message || "Unknown error" })); }
  };

  const doctorShiftCount = useMemo(() => {
    const ids = new Set(doctorsList.map((d) => d.id));
    return shifts.filter((sh) => ids.has(sh.staff_id) && sameDay(new Date(sh.start), date)).length;
  }, [shifts, doctorsList, date]);

  const staffShiftCount = useMemo(() => {
    const ids = new Set(staffList.map((s) => s.id));
    return shifts.filter((sh) => ids.has(sh.staff_id) && sameDay(new Date(sh.start), date)).length;
  }, [shifts, staffList, date]);

  const unscheduled = currentList.filter((m) => !staffWithShifts.some((s) => s.id === m.id));

  return (
    <div className="schedule-layout" style={{ display: "flex", gap: isMobile ? 0 : 20, flexDirection: isMobile ? "column" : "row", height: "100%", minHeight: 0 }}>
      {/* ── Main panel ── */}
      <div className="panel" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

        {/* Header row */}
        <div className="panel-header" style={{ flexWrap: "wrap", gap: isMobile ? 8 : 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 4 : 8, flexWrap: "wrap" }}>
            <button onClick={() => setDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1))} className="btn btn-ghost" style={{ padding: "4px 10px", minHeight: 32, fontSize: 16 }}>&#8249;</button>
            <span style={{ fontSize: isMobile ? 12 : 14, fontWeight: 700, minWidth: isMobile ? 120 : 170, textAlign: "center", fontFamily: "var(--font-mono)", letterSpacing: 0.5 }}>{dateLabel}</span>
            <button onClick={() => setDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))} className="btn btn-ghost" style={{ padding: "4px 10px", minHeight: 32, fontSize: 16 }}>&#8250;</button>
            <button onClick={() => setDate(new Date())} className="btn btn-ghost" style={{ padding: "4px 10px", minHeight: 32, fontSize: 11, letterSpacing: 1 }}>{t("schedule.today").toUpperCase()}</button>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {isMobile && (
              <button onClick={() => setShowSidebar(v => !v)} className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px", minHeight: 32 }}>
                📅
              </button>
            )}
            <button onClick={() => openModal(null)} className="btn btn-primary" style={{ fontSize: isMobile ? 11 : 13 }}>
              + {t("schedule.add_shift", { defaultValue: "Add Shift" })}
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
          <button onClick={() => setTab("doctors")} style={{
            flex: 1, padding: "12px 0", border: "none", cursor: "pointer",
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase",
            background: tab === "doctors" ? "rgba(59,130,246,.08)" : "transparent",
            color: tab === "doctors" ? "var(--blue)" : "var(--muted)",
            borderBottom: tab === "doctors" ? "2px solid var(--blue)" : "2px solid transparent",
            transition: "all .15s",
          }}>
            {t("schedule.section.doctors", { defaultValue: "Doctors" })}
            <span style={{ marginLeft: 6, opacity: 0.7 }}>({doctorShiftCount})</span>
          </button>
          <button onClick={() => setTab("staff")} style={{
            flex: 1, padding: "12px 0", border: "none", cursor: "pointer",
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase",
            background: tab === "staff" ? "rgba(34,197,94,.08)" : "transparent",
            color: tab === "staff" ? "var(--green)" : "var(--muted)",
            borderBottom: tab === "staff" ? "2px solid var(--green)" : "2px solid transparent",
            transition: "all .15s",
          }}>
            {t("schedule.section.staff", { defaultValue: "Staff" })}
            <span style={{ marginLeft: 6, opacity: 0.7 }}>({staffShiftCount})</span>
          </button>
        </div>

        {/* Timeline */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {/* Time header row */}
          <div style={{ display: "flex", minWidth: LABEL_W + totalW, position: "sticky", top: 0, zIndex: 6, background: "var(--card)" }}>
            <div style={{ width: LABEL_W, flexShrink: 0, borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", position: "sticky", left: 0, zIndex: 7, background: "var(--card)" }} />
            <div style={{ display: "flex", borderBottom: "1px solid var(--border)", width: totalW }}>
              {Array.from({ length: SLOT_H }).map((_, i) => (
                <div key={i} style={{ width: HOUR_W, flexShrink: 0, borderRight: "1px solid var(--border)", padding: "6px 0 6px 4px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)", letterSpacing: 0.5 }}>
                  {f2(START_H + i)}:00
                </div>
              ))}
            </div>
          </div>

          {/* Staff rows */}
          {staffWithShifts.map((member, idx) => {
            const memberShifts = (shiftsByStaff.get(member.id) || []).sort((a, b) => new Date(a.start) - new Date(b.start));
            const hours = memberShifts.reduce((sum, sh) => sum + (new Date(sh.end) - new Date(sh.start)) / 3600000, 0);
            const isDoctor = tab === "doctors";
            return (
              <div key={member.id} style={{ display: "flex", minWidth: LABEL_W + totalW, height: ROW_H, borderBottom: "1px solid var(--border)", background: idx % 2 ? "var(--hover-bg)" : "transparent" }}>
                {/* Name */}
                <div style={{ width: LABEL_W, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, padding: "0 12px", position: "sticky", left: 0, zIndex: 4, background: idx % 2 ? "var(--surface)" : "var(--card)" }}>
                  <div className="doc-avatar" style={{ background: `linear-gradient(135deg,${member.color},${member.color}88)`, width: 30, height: 30, borderRadius: 8, fontSize: 10 }}>{member.initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="doc-name" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{member.first_name} {member.last_name}</div>
                  </div>
                  {isDoctor && (
                    <a href={`/income/add?doctor=${member.id}&date=${dayKey(date)}`} onClick={(e) => e.stopPropagation()} title={t("schedule.add_income", { defaultValue: "Record income" })} style={{ width: 26, height: 26, borderRadius: 7, display: "grid", placeItems: "center", background: "rgba(34,197,94,.1)", color: "var(--green)", textDecoration: "none", border: "1px solid rgba(34,197,94,.2)", cursor: "pointer", flexShrink: 0 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </a>
                  )}
                  <span className="mono" style={{ color: "var(--accent)", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                    {hours ? `${hours.toFixed(hours % 1 ? 1 : 0)}h` : ""}
                  </span>
                </div>
                {/* Timeline grid */}
                <div data-timeline style={{ display: "flex", position: "relative", width: totalW, cursor: "cell" }}
                  onDragOver={onTimelineDragOver}
                  onDrop={onTimelineDrop}
                  onDragEnter={() => sidebarDrag && setDropTarget(member.id)}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null); }}
                  onClick={(e) => {
                    if (dragRef.current) return;
                    // One shift per day: if person already has a shift, edit it instead of creating new
                    if (memberShifts.length > 0) {
                      openModal(memberShifts[0]);
                      return;
                    }
                    const r = e.currentTarget.getBoundingClientRect();
                    const hour = Math.max(START_H, Math.min(END_H - 1, Math.floor((e.clientX - r.left) / HOUR_W) + START_H));
                    openModal(null, member.id, hour);
                  }}
                >
                  {Array.from({ length: SLOT_H }).map((_, i) => (
                    <div key={i} style={{ width: HOUR_W, flexShrink: 0, borderRight: "1px solid var(--border)" }} />
                  ))}
                  {/* Drop highlight */}
                  {sidebarDrag && dropTarget === member.id && (
                    <div style={{ position: "absolute", inset: 0, background: `${tabColor}12`, border: `2px dashed ${tabColor}`, borderRadius: 6, pointerEvents: "none", zIndex: 8 }} />
                  )}
                  {memberShifts.map((sh) => {
                    const isDragging = dragPreview && dragPreview.shiftId === sh.id;
                    const s = new Date(sh.start), e2 = new Date(sh.end);
                    const origLeftMin = toM(s.getHours(), s.getMinutes());
                    const origRightMin = toM(e2.getHours(), e2.getMinutes());
                    const leftMin = isDragging ? dragPreview.leftMin : origLeftMin;
                    const rightMin = isDragging ? dragPreview.rightMin : origRightMin;
                    const left = minToPx(leftMin, HOUR_W);
                    const width = ((rightMin - leftMin) / 60) * HOUR_W;
                    const borderColor = sh.status === "accepted" ? "var(--green)" : sh.status === "pending" ? "#eab308" : member.color;
                    const timeLabel = `${f2(Math.floor(leftMin / 60))}:${f2(leftMin % 60)} – ${f2(Math.floor(rightMin / 60))}:${f2(rightMin % 60)}`;
                    return (
                      <div key={sh.id} onClick={(ev) => { ev.stopPropagation(); if (!dragRef.current && !justDraggedRef.current) openModal(sh); }}
                        style={{
                          position: "absolute", top: 4, left: left + 1, width: Math.max(width - 2, 30), height: ROW_H - 8,
                          borderLeft: `3px solid ${borderColor}`, borderRadius: "0 8px 8px 0",
                          background: isDragging ? `${member.color}30` : `${member.color}18`,
                          display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 10px",
                          cursor: "grab", overflow: "hidden", transition: isDragging ? "none" : "background .12s",
                          zIndex: isDragging ? 20 : 5,
                          boxShadow: isDragging ? "0 4px 16px rgba(0,0,0,.3)" : "none",
                        }}
                        onMouseEnter={(ev) => { if (!dragRef.current) ev.currentTarget.style.background = `${member.color}2e`; }}
                        onMouseLeave={(ev) => { if (!dragRef.current) ev.currentTarget.style.background = `${member.color}18`; }}
                        onPointerDown={(ev) => onShiftPointerDown(ev, sh, "move")}
                      >
                        {/* Left resize handle */}
                        <div onPointerDown={(ev) => onShiftPointerDown(ev, sh, "resize-l")}
                          style={{ position: "absolute", left: -3, top: 0, width: 10, height: "100%", cursor: "col-resize", zIndex: 10 }} />
                        {/* Right resize handle */}
                        <div onPointerDown={(ev) => onShiftPointerDown(ev, sh, "resize-r")}
                          style={{ position: "absolute", right: -3, top: 0, width: 10, height: "100%", cursor: "col-resize", zIndex: 10 }} />
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, opacity: 0.7, lineHeight: 1.3 }}>{timeLabel}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{sh.note || (() => { const dm = rightMin - leftMin; const dh = Math.floor(dm / 60); const dmm = dm % 60; return dmm ? `${dh}h ${dmm}m` : `${dh}h`; })()}</div>
                        {sh.status === "pending" && width > 55 && <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#eab308", fontWeight: 600, letterSpacing: 0.5 }}>{t("schedule.status.pending", { defaultValue: "PENDING" })}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Empty state / drop zone */}
          {!loading && staffWithShifts.length === 0 && (
            <div
              onDragOver={onTimelineDragOver}
              onDrop={onTimelineDrop}
              onDragEnter={() => sidebarDrag && setDropTarget("empty")}
              onDragLeave={() => setDropTarget(null)}
              style={{
                textAlign: "center", padding: "48px 20px", color: "var(--subtext)",
                border: sidebarDrag ? `2px dashed ${tabColor}` : "2px dashed transparent",
                background: sidebarDrag && dropTarget === "empty" ? `${tabColor}08` : "transparent",
                borderRadius: 12, margin: 12, transition: "all .15s",
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.3 }}>{sidebarDrag ? "↓" : "+"}</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {sidebarDrag
                  ? t("schedule.drop_here", { defaultValue: "Drop here to schedule" })
                  : tab === "doctors"
                    ? t("schedule.empty_doctors", { defaultValue: "No doctors scheduled for this day" })
                    : t("schedule.empty_staff", { defaultValue: "No staff scheduled for this day" })}
              </div>
              <div style={{ fontSize: 12, marginTop: 6, fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
                {!sidebarDrag && t("schedule.empty_hint", { defaultValue: "Drag staff from sidebar or click + to add" })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Sidebar ── */}
      {(!isMobile || showSidebar) && <div style={{ width: isMobile ? "100%" : 260, flexShrink: 0, display: "flex", flexDirection: isMobile ? "row" : "column", gap: 16, minHeight: 0, overflow: "auto", maxHeight: isMobile ? "40vh" : undefined }}>
        {/* Calendar panel */}
        <div className="panel" style={{ padding: 16, flexShrink: 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>{t("schedule.calendar")}</div>
          <MiniCal selected={date} onSelect={(d) => setDate(d)} t={t} />
        </div>

        {/* Available staff panel */}
        <div className="panel" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="panel-header" style={{ padding: "12px 16px" }}>
            <div className="panel-meta" style={{ fontSize: 10 }}>
              {tab === "doctors"
                ? t("schedule.available_doctors", { defaultValue: "Available Doctors" })
                : t("schedule.available_staff", { defaultValue: "Available Staff" })}
            </div>
          </div>
          <div className="payroll-list" style={{ flex: 1, overflow: "auto" }}>
            {unscheduled.map((m) => (
              <div key={m.id} className="payroll-row"
                draggable
                onDragStart={(e) => onSidebarDragStart(e, m)}
                onDragEnd={onTimelineDragEnd}
                style={{ padding: "10px 16px", cursor: "grab", transition: "opacity .15s", opacity: sidebarDrag === m.id ? 0.4 : 1 }}
              >
                <div className="doc-avatar" style={{ background: `linear-gradient(135deg,${m.color},${m.color}88)`, width: 26, height: 26, borderRadius: 7, fontSize: 9 }}>{m.initials}</div>
                <div className="payroll-info">
                  <div className="payroll-name">{m.first_name} {m.last_name}</div>
                  <div className="payroll-detail">{m.role}</div>
                </div>
                <button onClick={() => {
                  const existing = shifts.find(sh => sh.staff_id === m.id && sameDay(new Date(sh.start), date));
                  if (existing) openModal(existing);
                  else openModal(null, m.id);
                }} title={t("schedule.add_shift")} className="btn btn-ghost" style={{ padding: "3px 8px", minHeight: 26, fontSize: 12, color: tab === "doctors" ? "var(--blue)" : "var(--green)", borderColor: tab === "doctors" ? "rgba(59,130,246,.3)" : "rgba(34,197,94,.3)" }}>
                  +
                </button>
              </div>
            ))}
            {unscheduled.length === 0 && (
              <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                {t("schedule.all_scheduled", { defaultValue: "Everyone is scheduled" })}
              </div>
            )}
          </div>
        </div>
      </div>}

      <ShiftModal
        open={modalOpen} editingShift={editingShift} form={modalForm} setForm={setModalForm}
        staffList={currentList} onClose={() => setModalOpen(false)} onSave={saveShift} onDelete={deleteShift} t={t}
      />
    </div>
  );
}
