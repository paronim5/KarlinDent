import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "../api/client";
import PeriodSelector from "./PeriodSelector";

const C = {
  bg: "#0b0c0e",
  surface: "#111318",
  card: "#161a22",
  border: "#1f2535",
  border2: "#252d3d",
  accent: "#f97316",
  green: "#22c55e",
  blue: "#3b82f6",
  muted: "#4b5563",
  text: "#f1f5f9",
  subtext: "#94a3b8",
  red: "#ef4444",
};

const STAFF_PALETTE = ["#f97316", "#3b82f6", "#a855f7", "#14b8a6", "#22c55e", "#ec4899", "#f59e0b", "#6366f1", "#ef4444"];
const START_H = 7;
const END_H = 22;
const ROW_H = 52;
const LABEL_W = 240;
const SLOT_H = END_H - START_H;

const f2 = (n) => String(n).padStart(2, "0");
const toM = (h, m) => h * 60 + m;
const durH = (start, end) => {
  const mins = (end - start) / 60000;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};
const dayKey = (d) => `${d.getFullYear()}-${f2(d.getMonth() + 1)}-${f2(d.getDate())}`;
const sameDay = (a, b) => dayKey(a) === dayKey(b);

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
  for (let i = 0; i < startDow; i += 1) {
    cells.push({ day: prevMonthDays - startDow + i + 1, other: true, key: `p-${i}` });
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({ day: d, other: false, key: `d-${d}` });
  }
  const nav = (step) => {
    const next = new Date(view);
    next.setMonth(next.getMonth() + step);
    setView(next);
  };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button onClick={() => nav(-1)} style={smallBtn}>‹</button>
        <span style={{ color: C.text, fontSize: 12, fontWeight: 700 }}>
          {view.toLocaleString("default", { month: "long", year: "numeric" })}
        </span>
        <button onClick={() => nav(1)} style={smallBtn}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {[t("clinic.weekdays.mon"), t("clinic.weekdays.tue"), t("clinic.weekdays.wed"), t("clinic.weekdays.thu"), t("clinic.weekdays.fri"), t("clinic.weekdays.sat"), t("clinic.weekdays.sun")].map((d) => (
          <div key={d} style={{ color: C.muted, fontSize: 9, textAlign: "center" }}>{d}</div>
        ))}
        {cells.map((cell) => {
          if (cell.other) return <div key={cell.key} style={{ opacity: 0.3, textAlign: "center", color: C.muted, fontSize: 10 }}>{cell.day}</div>;
          const d = new Date(year, month, cell.day);
          const isSel = sameDay(d, selected);
          const isToday = sameDay(d, today);
          return (
            <div
              key={cell.key}
              onClick={() => onSelect(d)}
              style={{
                cursor: "pointer",
                textAlign: "center",
                fontSize: 10,
                borderRadius: 4,
                padding: "2px 0",
                background: isSel ? C.accent : "transparent",
                color: isSel ? "#fff" : isToday ? C.accent : C.subtext,
                fontWeight: isSel || isToday ? 700 : 400,
              }}
            >
              {cell.day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShiftModal({ open, editingShift, form, setForm, staff, onClose, onSave, onDelete, t }) {
  if (!open) return null;
  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <div style={{ color: C.text, fontWeight: 700 }}>{editingShift ? t("schedule.modal.edit_shift") : t("schedule.modal.new_shift")}</div>
            <div style={{ color: C.subtext, fontSize: 10 }}>{editingShift ? t("schedule.modal.update_details") : t("schedule.modal.schedule_staff")}</div>
          </div>
          <button onClick={onClose} style={smallBtn}>✕</button>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 10 }}>
          <label style={label}>{t("schedule.modal.staff_member")}</label>
          <select value={form.staff_id} onChange={(e) => setForm((p) => ({ ...p, staff_id: e.target.value }))} style={input}>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.role})</option>)}
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={label}>{t("schedule.modal.start_time")}</label>
              <input type="time" value={form.start_time} onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))} style={input} />
            </div>
            <div>
              <label style={label}>{t("schedule.modal.end_time")}</label>
              <input type="time" value={form.end_time} onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))} style={input} />
            </div>
          </div>
          <label style={label}>{t("schedule.modal.notes")}</label>
          <input value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} placeholder={t("schedule.modal.note_placeholder")} style={input} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "0 18px 18px" }}>
          <div>{editingShift ? <button onClick={onDelete} style={{ ...button, border: `1px solid ${C.red}`, color: C.red, background: "transparent" }}>{t("schedule.modal.delete")}</button> : null}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ ...button, border: `1px solid ${C.border}`, color: C.subtext, background: C.card }}>{t("schedule.modal.cancel")}</button>
            <button onClick={onSave} style={{ ...button, border: "none", color: "#fff", background: C.accent }}>{t("schedule.modal.save_shift")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClinicSchedule({ api: injectedApi }) {
  const { t } = useTranslation();
  const defaultApi = useApi();
  const api = useMemo(() => injectedApi || defaultApi, [injectedApi]);
  const initialView = ["day", "week"].includes(localStorage.getItem("globalPeriod")) ? localStorage.getItem("globalPeriod") : "day";
  const [date, setDate] = useState(new Date());
  const [view, setView] = useState(initialView);
  const [staff, setStaff] = useState([]);
  const [visibleStaff, setVisibleStaff] = useState(new Set());
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [modalForm, setModalForm] = useState({ staff_id: "", start_time: "09:00", end_time: "17:00", note: "" });
  const [todayDutyShifts, setTodayDutyShifts] = useState([]);
  const [viewportWidth, setViewportWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1280);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isMobile = viewportWidth < 768;
  const isPhone = viewportWidth <= 414;
  const isSmallPhone = viewportWidth <= 375;
  const isTinyPhone = viewportWidth <= 320;
  const rowH = isPhone ? 60 : ROW_H;
  const labelW = isTinyPhone ? 118 : isSmallPhone ? 126 : isPhone ? 136 : isMobile ? 170 : LABEL_W;
  const sidePanelW = isMobile ? 0 : viewportWidth < 1200 ? 216 : 248;
  const minHourW = isTinyPhone ? 24 : isSmallPhone ? 26 : isPhone ? 28 : isMobile ? 32 : 40;
  const availableTimeline = Math.max(15 * minHourW, viewportWidth - sidePanelW - labelW - (isPhone ? 18 : isMobile ? 28 : 80));
  const hourW = Math.max(minHourW, Math.floor(availableTimeline / SLOT_H));
  const totalW = hourW * SLOT_H;

  const weekStart = useMemo(() => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [date]);
  const weekDays = useMemo(() => Array.from({ length: 7 }).map((_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)), [weekStart]);
  const visibleStaffList = useMemo(() => staff.filter((s) => visibleStaff.has(s.id)), [staff, visibleStaff]);

  const fetchStaff = useCallback(async () => {
    try {
      const data = await api.get("/staff");
      const active = data.filter((s) => s.is_active).map((s, i) => ({
        ...s,
        color: STAFF_PALETTE[i % STAFF_PALETTE.length],
        initials: `${s.first_name?.[0] || ""}${s.last_name?.[0] || ""}`.toUpperCase(),
      }));
      setStaff(active);
      setVisibleStaff((prev) => (prev.size ? prev : new Set(active.map((s) => s.id))));
      setModalForm((prev) => ({ ...prev, staff_id: prev.staff_id || active[0]?.id || "" }));
    } catch (err) {
      console.error("Failed to fetch staff", err);
    }
  }, [api]);

  const fetchShifts = useCallback(async () => {
    setLoading(true);
    try {
      const start = new Date(date);
      const end = new Date(date);
      if (view === "week") {
        start.setDate(weekStart.getDate());
        start.setMonth(weekStart.getMonth());
        start.setFullYear(weekStart.getFullYear());
        end.setDate(weekStart.getDate() + 6);
        end.setMonth(weekStart.getMonth());
        end.setFullYear(weekStart.getFullYear());
      }
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      const data = await api.get(`/schedule?start=${start.toISOString()}&end=${end.toISOString()}`);
      setShifts(data);
    } catch (err) {
      console.error("Failed to fetch shifts", err);
    } finally {
      setLoading(false);
    }
  }, [api, date, view, weekStart]);

  const fetchTodayOnDutyDoctors = useCallback(async () => {
    try {
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const data = await api.get(`/schedule?start=${start.toISOString()}&end=${end.toISOString()}&status=on_duty`);
      setTodayDutyShifts(data);
    } catch {
      setTodayDutyShifts([]);
    }
  }, [api]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  useEffect(() => {
    fetchTodayOnDutyDoctors();
  }, [fetchTodayOnDutyDoctors]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      fetchShifts();
      fetchTodayOnDutyDoctors();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [fetchShifts, fetchTodayOnDutyDoctors]);

  useEffect(() => {
    const handler = (event) => {
      const next = event?.detail?.period;
      if (next && ["day", "week"].includes(next)) setView(next);
    };
    window.addEventListener("periodChanged", handler);
    return () => window.removeEventListener("periodChanged", handler);
  }, []);

  const handlePeriodChange = (nextView) => {
    setView(nextView);
    localStorage.setItem("globalPeriod", nextView);
    window.dispatchEvent(new CustomEvent("periodChanged", { detail: { period: nextView } }));
  };

  const dateLabel = useMemo(() => {
    if (view === "week") return `${weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekDays[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`.toUpperCase();
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).toUpperCase();
  }, [view, weekDays, date]);

  const roleCounts = useMemo(() => {
    const counts = {};
    staff.forEach((s) => {
      counts[s.role] = (counts[s.role] || 0) + 1;
    });
    return counts;
  }, [staff]);

  const dayShiftsByStaff = useMemo(() => {
    const map = new Map();
    visibleStaffList.forEach((s) => map.set(s.id, []));
    shifts.forEach((sh) => {
      if (!map.has(sh.staff_id)) return;
      map.get(sh.staff_id).push(sh);
    });
    return map;
  }, [shifts, visibleStaffList, view, date]);

  const openModal = (shift = null, staffId = null, hour = 9) => {
    if (shift) {
      const start = new Date(shift.start);
      const end = new Date(shift.end);
      setEditingShift(shift);
      setModalForm({
        staff_id: shift.staff_id,
        start_time: `${f2(start.getHours())}:${f2(start.getMinutes())}`,
        end_time: `${f2(end.getHours())}:${f2(end.getMinutes())}`,
        note: shift.note || "",
      });
    } else {
      setEditingShift(null);
      setModalForm({
        staff_id: staffId || visibleStaffList[0]?.id || staff[0]?.id || "",
        start_time: `${f2(hour)}:00`,
        end_time: `${f2(Math.min(hour + 8, 23))}:00`,
        note: "",
      });
    }
    setModalOpen(true);
  };

  const saveShift = async () => {
    try {
      const [sh, sm] = modalForm.start_time.split(":").map(Number);
      const [eh, em] = modalForm.end_time.split(":").map(Number);
      const start = new Date(date);
      const end = new Date(date);
      start.setHours(sh, sm, 0, 0);
      end.setHours(eh, em, 0, 0);
      const payload = { staff_id: Number(modalForm.staff_id), start_time: start.toISOString(), end_time: end.toISOString(), note: modalForm.note };
      if (editingShift) await api.put(`/schedule/${editingShift.id}`, payload);
      else await api.post("/schedule", payload);
      setModalOpen(false);
      await fetchShifts();
      await fetchTodayOnDutyDoctors();
    } catch (err) {
      alert(t("schedule.errors.save_shift", { message: err.message || "Unknown error" }));
    }
  };

  const deleteShift = async () => {
    if (!editingShift) return;
    if (!window.confirm(t("schedule.errors.confirm_delete"))) return;
    try {
      await api.delete(`/schedule/${editingShift.id}`);
      setModalOpen(false);
      await fetchShifts();
      await fetchTodayOnDutyDoctors();
    } catch (err) {
      alert(t("schedule.errors.delete_shift", { message: err.message || "Unknown error" }));
    }
  };

  const onDutyTodayDoctors = useMemo(() => {
    const today = new Date();
    return todayDutyShifts
      .filter((shift) => {
        const start = new Date(shift.start);
        const member = staff.find((item) => item.id === shift.staff_id);
        return sameDay(start, today) && member?.role?.toLowerCase().includes("doctor");
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 8);
  }, [todayDutyShifts, staff]);

  const activeStaff = useMemo(() => {
    const now = new Date(date);
    now.setSeconds(0, 0);
    return shifts.filter((s) => {
      const start = new Date(s.start);
      const end = new Date(s.end);
      return sameDay(start, date) && start <= now && end > now;
    });
  }, [shifts, date]);

  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", height: "100%", minHeight: isMobile ? 0 : 680, background: C.bg, color: C.text, overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexWrap: "wrap", gap: 8, padding: isPhone ? "8px" : "12px 16px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1))} style={smallBtn}>‹</button>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, minWidth: isPhone ? 150 : 200, textAlign: "center" }}>{dateLabel}</div>
            <button onClick={() => setDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))} style={smallBtn}>›</button>
            <button onClick={() => setDate(new Date())} style={smallBtn}>{t("schedule.today").toUpperCase()}</button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", width: isPhone ? "100%" : "auto", justifyContent: isPhone ? "space-between" : "flex-end" }}>
            <PeriodSelector value={view} onChange={handlePeriodChange} options={["day", "week"]} />
            <button onClick={() => openModal(null)} style={{ ...button, border: "none", background: C.accent, color: "#fff", minHeight: 44 }}>{t("schedule.add_shift")}</button>
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: isPhone ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))", gap: 8, padding: isPhone ? "8px" : "8px 16px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
          <Stat label={t("schedule.stats.shifts")} value={String(shifts.length)} color={C.accent} />
          <Stat label={t("schedule.stats.visible_staff")} value={String(visibleStaffList.length)} color={C.blue} />
          <Stat label={t("schedule.stats.on_duty_now")} value={String(activeStaff.length)} color={C.green} />
          <Stat label={t("schedule.stats.roles")} value={Object.keys(roleCounts).length ? Object.entries(roleCounts).map(([k, v]) => `${k}:${v}`).join(" · ") : "0"} />
        </div>

        <div style={{ flex: 1, overflow: "auto" }}>
          <div style={{ display: "flex", minWidth: labelW + totalW }}>
            <div style={{ width: labelW, borderRight: `1px solid ${C.border}`, background: C.surface, position: "sticky", left: 0, zIndex: 5 }} />
            <div style={{ width: totalW, position: "relative", background: C.surface, borderBottom: `1px solid ${C.border}`, height: 30 }}>
              {Array.from({ length: SLOT_H + 1 }).map((_, i) => (
                <div key={i} style={{ position: "absolute", left: i * hourW, top: 0, bottom: 0, width: 1, background: C.border }}>
                  <div style={{ color: C.muted, fontSize: 9, marginLeft: 3 }}>{f2(START_H + i)}:00</div>
                </div>
              ))}
            </div>
          </div>

          {visibleStaffList.map((member, row) => {
            const memberShifts = (dayShiftsByStaff.get(member.id) || []).sort((a, b) => new Date(a.start) - new Date(b.start));
            const hours = memberShifts.reduce((acc, sh) => acc + (new Date(sh.end) - new Date(sh.start)) / 3600000, 0);
            return (
              <div key={member.id} style={{ display: "flex", height: rowH, borderBottom: `1px solid ${C.border}`, background: row % 2 ? "rgba(22,26,34,0.55)" : "transparent" }}>
                <div style={{ width: labelW, borderRight: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: isPhone ? 6 : 10, padding: isPhone ? "0 6px" : "0 12px", position: "sticky", left: 0, zIndex: 4, background: row % 2 ? "#13171e" : C.surface }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", background: `linear-gradient(135deg,${member.color},${member.color}77)`, color: "#fff", fontWeight: 800, fontSize: 10 }}>{member.initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.text, fontSize: isPhone ? 10 : 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{member.first_name} {member.last_name}</div>
                    <div style={{ color: C.subtext, fontSize: isPhone ? 8 : 9 }}>{member.role}</div>
                  </div>
                  <button onClick={() => setVisibleStaff((prev) => {
                    const next = new Set(prev);
                    if (next.has(member.id)) next.delete(member.id);
                    else next.add(member.id);
                    return next;
                  })} style={{ ...smallBtn, width: 44, height: 44 }}>{visibleStaff.has(member.id) ? "✓" : "•"}</button>
                  <div style={{ color: C.accent, fontSize: isPhone ? 9 : 10, fontWeight: 700 }}>{hours ? `${hours.toFixed(hours % 1 ? 1 : 0)}h` : "—"}</div>
                </div>
                <div
                  style={{ width: totalW, position: "relative", cursor: "cell" }}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const hour = Math.max(START_H, Math.min(END_H - 1, Math.floor((e.clientX - r.left) / hourW) + START_H));
                    openModal(null, member.id, hour);
                  }}
                >
                  {Array.from({ length: SLOT_H + 1 }).map((_, i) => <div key={i} style={{ position: "absolute", left: i * hourW, top: 0, bottom: 0, width: 1, background: C.border }} />)}
                  {memberShifts.map((sh) => {
                    const start = new Date(sh.start);
                    const end = new Date(sh.end);
                    const left = ((toM(start.getHours(), start.getMinutes()) - START_H * 60) / 60) * hourW;
                    const width = ((end - start) / 3600000) * hourW;
                    return (
                      <div
                        key={sh.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          openModal(sh);
                        }}
                        style={{
                          position: "absolute",
                          top: 6,
                          left: left + 3,
                          width: Math.max(width - 6, 24),
                          height: rowH - 12,
                          borderLeft: `3px solid ${member.color}`,
                          borderRadius: "0 7px 7px 0",
                          background: `${member.color}26`,
                          color: "#e2e8f0",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          padding: "0 8px",
                          cursor: "pointer",
                          overflow: "hidden",
                        }}
                      >
                        <div style={{ fontSize: isPhone ? 8 : 9, opacity: 0.9 }}>{f2(start.getHours())}:{f2(start.getMinutes())} - {f2(end.getHours())}:{f2(end.getMinutes())}</div>
                        <div style={{ fontSize: isPhone ? 9 : 10, fontWeight: 700 }}>{sh.note || durH(start, end)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {!loading && visibleStaffList.length === 0 && <div style={{ color: C.subtext, textAlign: "center", padding: 20 }}>{t("schedule.filters.no_staff")}</div>}
        </div>
      </div>

      <aside style={{ width: isMobile ? "100%" : sidePanelW, borderLeft: isMobile ? "none" : `1px solid ${C.border}`, borderTop: isMobile ? `1px solid ${C.border}` : "none", background: C.surface, display: "flex", flexDirection: "column", gap: 10, padding: isPhone ? 8 : 12, maxHeight: isMobile ? 260 : "none" }}>
        <div style={{ color: C.muted, fontSize: 10, letterSpacing: 1 }}>{t("schedule.calendar").toUpperCase()}</div>
        <MiniCal selected={date} onSelect={(d) => setDate(d)} t={t} />
        <div style={{ color: C.muted, fontSize: 10, letterSpacing: 1, marginTop: 8 }}>{t("schedule.on_duty_today").toUpperCase()}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, overflow: "auto" }}>
          {onDutyTodayDoctors.length === 0 ? <div style={{ color: C.subtext, fontSize: 11 }}>{t("schedule.no_on_duty_today")}</div> : onDutyTodayDoctors.map((s) => {
            const st = staff.find((x) => x.id === s.staff_id);
            const start = new Date(s.start);
            const end = new Date(s.end);
            return (
              <div key={s.id} onClick={() => openModal(s)} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${st?.color || C.accent}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}>
                <div style={{ color: C.subtext, fontSize: 9 }}>{f2(start.getHours())}:{f2(start.getMinutes())} - {f2(end.getHours())}:{f2(end.getMinutes())}</div>
                <div style={{ color: C.text, fontSize: 11, fontWeight: 700 }}>{t("schedule.duty_item", { lastName: st?.last_name || "", role: st?.role || "", start: `${f2(start.getHours())}:${f2(start.getMinutes())}`, end: `${f2(end.getHours())}:${f2(end.getMinutes())}` })}</div>
              </div>
            );
          })}
        </div>
      </aside>

      <ShiftModal
        open={modalOpen}
        editingShift={editingShift}
        form={modalForm}
        setForm={setModalForm}
        staff={staff}
        onClose={() => setModalOpen(false)}
        onSave={saveShift}
        onDelete={deleteShift}
        t={t}
      />
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "0.5rem 0.625rem", minWidth: 90 }}>
      <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 15, color: color || C.text, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

const smallBtn = { width: 44, height: 44, border: `1px solid ${C.border}`, borderRadius: 7, background: "transparent", color: C.subtext, fontSize: 12, cursor: "pointer" };
const button = { borderRadius: 8, padding: "0.625rem 0.75rem", minHeight: 44, fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" };
const label = { color: C.muted, fontSize: "0.625rem", fontWeight: 600 };
const input = { width: "100%", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, padding: "0.625rem 0.75rem", minHeight: 44, fontSize: "0.875rem" };
const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "grid", placeItems: "center", zIndex: 500 };
const modal = { width: 420, maxWidth: "95vw", background: C.card, border: `1px solid ${C.border2}`, borderRadius: 14, overflow: "hidden" };
