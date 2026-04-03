import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useApi } from "../api/client.js";
import { useAuth } from "../App.jsx";

export default function AddOutcomePage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const { user } = useAuth();

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
  const [salaryNotes, setSalaryNotes] = useState([]);
  const [salaryNotesTotal, setSalaryNotesTotal] = useState(0);
  const [salaryNotesPage, setSalaryNotesPage] = useState(1);
  const [salaryNotesLoading, setSalaryNotesLoading] = useState(false);
  const [salaryNotesError, setSalaryNotesError] = useState("");
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [amountDiscrepancyModal, setAmountDiscrepancyModal] = useState(null);
  const [signatureSubmitting, setSignatureSubmitting] = useState(false);
  const [signatureError, setSignatureError] = useState("");
  const [signerName, setSignerName] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const signatureCanvasRef = useRef(null);

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
    {
      const todayStr = new Date().toISOString().slice(0, 10);
      setSalaryForm((p) => ({ ...p, paymentDate: todayStr }));
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
      setSalaryNotes([]);
      setSalaryNotesTotal(0);
      setSalaryNotesPage(1);
      setSalaryNotesError("");
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
        const query = new URLSearchParams();
        if (salaryRange.from) query.set("from", salaryRange.from);
        if (salaryRange.to) query.set("to", salaryRange.to);
        const estimatePath = query.toString()
          ? `/staff/${selectedStaffId}/salary-estimate?${query.toString()}`
          : `/staff/${selectedStaffId}/salary-estimate`;
        const data = await api.get(estimatePath);
        const estimatedTotal = toNumber(data?.adjusted_total ?? data?.estimated_total, NaN);
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
    if (!selectedStaffId) return;
    setSalaryNotesPage(1);
  }, [selectedStaffId]);

  useEffect(() => {
    if (!selectedStaffId) return;
    const fetchNotes = async () => {
      setSalaryNotesLoading(true);
      setSalaryNotesError("");
      try {
        const limit = 10;
        const offset = (salaryNotesPage - 1) * limit;
        const data = await api.get(`/staff/${selectedStaffId}/salary-notes?limit=${limit}&offset=${offset}`);
        setSalaryNotes(data.items || []);
        setSalaryNotesTotal(Number(data.total || 0));
      } catch (err) {
        setSalaryNotes([]);
        setSalaryNotesTotal(0);
        setSalaryNotesError(err.message || "Failed to load salary notes");
      } finally {
        setSalaryNotesLoading(false);
      }
    };
    fetchNotes();
  }, [selectedStaffId, salaryNotesPage]);

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
          `/schedule?staff_id=${selectedStaffId}&start=${encodeURIComponent(
            salaryRange.from + 'T00:00:00'
          )}&end=${encodeURIComponent(salaryRange.to + 'T23:59:59')}&status=accepted&unpaid=true`
        );
        let weekdayHrs = 0, weekendHrs = 0;
        ts.forEach((item) => {
          const h = Number(item.salary_hours ?? item.hours ?? 0);
          const d = new Date(item.start || item.work_date);
          const day = d.getDay(); // 0=Sun, 6=Sat
          if (day === 0 || day === 6) weekendHrs += h;
          else weekdayHrs += h;
        });
        const totalHours = weekdayHrs + weekendHrs;
        const baseRate = toNumber(staffMember.base_salary, 0);
        const wkndRate = toNumber(staffMember.weekend_salary ?? 200, 200);
        const amount = Number((weekdayHrs * baseRate + weekendHrs * wkndRate).toFixed(2));
        setTimesheetSummary({ totalHours, weekdayHours: weekdayHrs, weekendHours: weekendHrs, baseRate, weekendRate: wkndRate, amount });
        if (!hasManualSalaryAmount) {
          if (totalHours > 0) {
            setSalaryForm((p) => ({ ...p, amount: amount.toFixed(2) }));
            setError("");
          } else if (prefillAmount !== null) {
            // Keep the prefill amount — unpaid total may include adjustments with no shift hours
            setSalaryForm((p) => ({ ...p, amount: prefillAmount.toFixed(2) }));
            setError("");
          } else {
            setSalaryForm((p) => ({ ...p, amount: "" }));
            setError("No accepted shifts for selected period.");
          }
        }
      } catch (err) {
        setTimesheetSummary(null);
        setError(err.message || "Unable to load shifts");
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
    setError("");

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
    if (Number.isFinite(suggestedAmount) && suggestedAmount > 0) {
      const diff = Math.abs(amountValue - suggestedAmount);
      const diffRatio = diff / suggestedAmount;
      if (diffRatio >= 0.05) {
        setAmountDiscrepancyModal({
          calculated: suggestedAmount,
          entered: amountValue,
          delta: amountValue - suggestedAmount,
          ratio: diffRatio
        });
        return;
      }
    }

    handleAmountDiscrepancyConfirm();
  };

  const handleAmountDiscrepancyConfirm = () => {
    setAmountDiscrepancyModal(null);
    if (!canSign) {
      setSignatureError("You can only sign your own salary documents.");
      setSignatureModalOpen(true);
      return;
    }
    openSignatureModal();
  };

  const handleAmountDiscrepancyCancel = () => {
    setAmountDiscrepancyModal(null);
  };

  const handleRecordSalaryWithSignature = async () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    setSignatureSubmitting(true);
    setSignatureError("");
    try {
      const signatureData = canvas.toDataURL("image/png");
      const signedAt = new Date().toISOString();
      const range = resolveReportRange();
      
      const amountValue = toNumber(salaryForm.amount, NaN);
      const amountChangeReason = hasManualSalaryAmount ? "manual_ui_adjustment" : "calculated_value";

      const payload = {
        staff_id: Number(selectedStaffId),
        amount: amountValue,
        payment_date: salaryForm.paymentDate,
        note: salaryForm.note,
        amount_change_reason: amountChangeReason,
        signature: {
          signer_name: signerName.trim(),
          signed_at: signedAt,
          signature_data: signatureData
        }
      };
      if (range.from) payload.from = range.from;
      if (range.to) payload.to = range.to;

      const response = await api.post("/staff/salaries", payload);

      window.dispatchEvent(new CustomEvent("salaryPaid"));
      window.dispatchEvent(new CustomEvent("toast", { detail: { type: "success", message: "Salary payment recorded and report signed" } }));
      
      // If we got a document ID, we might want to download it automatically?
      // For now, just navigate to outcome list as requested.
      setSignatureModalOpen(false);
      navigate("/outcome");
    } catch (err) {
      setSignatureError(err.message || "Failed to record salary and sign report");
    } finally {
      setSignatureSubmitting(false);
    }
  };

  const salaryMetrics = salaryEstimate
    ? {
        baseSalary: toNumber(salaryEstimate.base_salary ?? 0),
        commissionRate: toNumber(salaryEstimate.commission_rate ?? 0),
        totalIncome: toNumber(salaryEstimate.total_income ?? 0),
        totalLabFees: Math.max(toNumber(salaryEstimate.total_lab_fees ?? 0), 0),
        commissionPart: toNumber(salaryEstimate.commission_part ?? 0),
        adjustments: toNumber(salaryEstimate.adjustments ?? 0),
        adjustedTotal: toNumber(salaryEstimate.adjusted_total ?? salaryEstimate.estimated_total ?? 0),
        unpaidPatients: Array.isArray(salaryEstimate.unpaid_patients) ? salaryEstimate.unpaid_patients : []
      }
    : null;

  const showTimesheetSummary = Boolean(timesheetSummary);
  const suggestedAmount = useMemo(() => {
    if (showTimesheetSummary && timesheetSummary) {
      return toNumber(timesheetSummary.amount, NaN);
    }
    if (!showTimesheetSummary && salaryMetrics) {
      return toNumber(salaryMetrics.adjustedTotal, NaN);
    }
    return NaN;
  }, [showTimesheetSummary, timesheetSummary, salaryMetrics]);
  const totalSalaryNotePages = Math.max(1, Math.ceil(salaryNotesTotal / 10));
  const openSignatureModal = () => {
    if (!selectedStaffId) return;
    setSignatureError("");
    setSignatureModalOpen(true);
    setHasSignature(false);
  };

  useEffect(() => {
    if (!signatureModalOpen) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 140;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#10e055ff";
  }, [signatureModalOpen]);

  useEffect(() => {
    if (!amountDiscrepancyModal) return;

    const scrollY = window.pageYOffset;
    const originalStyle = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      height: document.body.style.height,
      overscrollBehavior: document.body.style.overscrollBehavior
    };

    document.documentElement.classList.add("auth-overlay-lock");
    document.body.classList.add("auth-overlay-lock");
    
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setAmountDiscrepancyModal(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    const preventDefault = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener('touchmove', preventDefault, { passive: false });
    document.addEventListener('wheel', preventDefault, { passive: false });

    return () => {
      document.documentElement.classList.remove("auth-overlay-lock");
      document.body.classList.remove("auth-overlay-lock");

      document.body.style.overflow = originalStyle.overflow;
      document.body.style.position = originalStyle.position;
      document.body.style.top = originalStyle.top;
      document.body.style.width = originalStyle.width;
      document.body.style.height = originalStyle.height;
      document.body.style.overscrollBehavior = originalStyle.overscrollBehavior;

      window.scrollTo(0, scrollY);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener('touchmove', preventDefault);
      document.removeEventListener('wheel', preventDefault);
    };
  }, [amountDiscrepancyModal]);

  useEffect(() => {
    if (!signatureModalOpen) return;

    const scrollY = window.pageYOffset;
    const originalStyle = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      height: document.body.style.height,
      overscrollBehavior: document.body.style.overscrollBehavior
    };

    // Apply strict scroll locking for mobile/iOS
    document.documentElement.classList.add("auth-overlay-lock");
    document.body.classList.add("auth-overlay-lock");
    
    // Maintain scroll position and prevent "rubber-banding" on iOS
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    const preventDefault = (e) => {
      // Allow multi-touch if we want to allow zoom, but user asked to suppress it
      // Block all touchmove events from propagating to the background
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    // Non-passive listener is required to call preventDefault()
    document.addEventListener('touchmove', preventDefault, { passive: false });
    document.addEventListener('wheel', preventDefault, { passive: false });

    return () => {
      document.documentElement.classList.remove("auth-overlay-lock");
      document.body.classList.remove("auth-overlay-lock");

      // Restore original styles
      document.body.style.overflow = originalStyle.overflow;
      document.body.style.position = originalStyle.position;
      document.body.style.top = originalStyle.top;
      document.body.style.width = originalStyle.width;
      document.body.style.height = originalStyle.height;
      document.body.style.overscrollBehavior = originalStyle.overscrollBehavior;

      // Restore scroll position
      window.scrollTo(0, scrollY);

      document.removeEventListener('touchmove', preventDefault);
      document.removeEventListener('wheel', preventDefault);
    };
  }, [signatureModalOpen]);

  const selectedStaff = useMemo(
    () => staffList.find((staffMember) => String(staffMember.id) === String(selectedStaffId)),
    [staffList, selectedStaffId]
  );

  useEffect(() => {
    if (!selectedStaffId) {
      setSignerName("");
      return;
    }
    if (!selectedStaff) return;
    const fullName = [selectedStaff.first_name, selectedStaff.last_name].filter(Boolean).join(" ").trim();
    setSignerName(fullName);
  }, [selectedStaffId, selectedStaff]);

  const getSignaturePoint = (event) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in event) {
      const touch = event.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handleSignatureStart = (event) => {
    if (event.cancelable) event.preventDefault();
    setIsDrawing(true);
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const point = getSignaturePoint(event);
    if (!point) return;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const handleSignatureMove = (event) => {
    if (event.cancelable) event.preventDefault();
    if (!isDrawing) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const point = getSignaturePoint(event);
    if (!point) return;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    setHasSignature(true);
  };

  const handleSignatureEnd = (event) => {
    if (event && event.cancelable) event.preventDefault();
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const resolveReportRange = () => {
    let from = salaryRange.from;
    let to = salaryRange.to;
    if (!from && !to && salaryForm.paymentDate) {
      from = salaryForm.paymentDate;
      to = salaryForm.paymentDate;
    }
    return { from: from || "", to: to || "" };
  };

  const isAdmin = Boolean(user && ["admin", "administrator"].includes(String(user.role || "").toLowerCase()));
  const canSign = Boolean(selectedStaffId && (isAdmin || (user && Number(user.id) === Number(selectedStaffId))));



  return (
    <div className="panel" style={{ width: '100%' }}>
      <div className="panel-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="panel-title">{t("nav.add_outcome", { defaultValue: "Add Outcome" })}</div>
      </div>

      <div className="tabs outcome-tabs" style={{ display: 'flex', gap: '16px', marginBottom: '24px', borderBottom: '1px solid var(--border)' }}>
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
          <div className="outcome-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
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

          <div className="outcome-form-actions" style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
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
          <div className="outcome-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
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
                <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>{t("outcome.salary_panel.breakdown")}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>{t("outcome.salary_panel.period")}:</span>
                  <span>{salaryRange.from} → {salaryRange.to}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>Weekday Hours:</span>
                  <span>{(timesheetSummary.weekdayHours ?? 0).toFixed(2)}h</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>Weekend Hours:</span>
                  <span>{(timesheetSummary.weekendHours ?? 0).toFixed(2)}h</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>{t("outcome.salary_panel.base_rate")}:</span>
                  <span>{formatNumber(timesheetSummary.baseRate, { minimumFractionDigits: 2 })}/h</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>Weekend Rate:</span>
                  <span>{formatNumber(timesheetSummary.weekendRate ?? 200, { minimumFractionDigits: 2 })}/h</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', borderTop: '1px solid var(--border)', paddingTop: '4px', marginTop: '4px' }}>
                  <span>{t("outcome.salary_panel.calculated_salary")}:</span>
                  <span>{formatNumber(timesheetSummary.amount, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}

            {!showTimesheetSummary && salaryMetrics && (
              <div className="panel" style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '8px' }}>
                <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>{t("outcome.salary_panel.breakdown")}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>{t("outcome.salary_panel.last_payment")}:</span>
                  <span>{salaryEstimate.last_paid_at || t("outcome.salary_panel.never")}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>{t("outcome.salary_panel.base_salary")}:</span>
                  <span>{formatNumber(salaryMetrics.baseSalary, { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>{t("outcome.salary_panel.commission", { rate: formatNumber(salaryMetrics.commissionRate * 100, { maximumFractionDigits: 2 }), income: formatNumber(salaryMetrics.totalIncome) })}:</span>
                  <span>{formatNumber(salaryMetrics.commissionPart, { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>{t("outcome.salary_panel.lab_fees_deduction")}:</span>
                  <span>-{formatNumber(salaryMetrics.totalLabFees, { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>{t("outcome.salary_panel.adjustments")}:</span>
                  <span>{formatNumber(salaryMetrics.adjustments, { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', borderTop: '1px solid var(--border)', paddingTop: '4px', marginTop: '4px' }}>
                  <span>{t("outcome.salary_panel.total_estimated")}:</span>
                  <span>{formatNumber(salaryMetrics.adjustedTotal, { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {t("outcome.salary_panel.unpaid_patients", { count: salaryMetrics.unpaidPatients.length })}
                </div>
                {salaryMetrics.unpaidPatients.length > 0 && (
                  <div style={{ marginTop: '6px', display: 'grid', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
                    {salaryMetrics.unpaidPatients.map((patient, idx) => (
                      <div key={`${patient.name}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>{patient.name}</span>
                        <span className="mono">{formatNumber(patient.net_paid, { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                  </div>
                )}
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

          {selectedStaffId && (
            <div className="panel" style={{ marginTop: '20px', background: 'var(--bg-card)', padding: '16px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '14px', fontWeight: '500' }}>{t("outcome.salary_notes.title")}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {t("outcome.salary_notes.total", { count: salaryNotesTotal })}
                </div>
              </div>
              {salaryNotesLoading && <div style={{ color: 'var(--text-secondary)' }}>{t("outcome.salary_notes.loading")}</div>}
              {!salaryNotesLoading && salaryNotesError && (
                <div className="form-error">{salaryNotesError}</div>
              )}
              {!salaryNotesLoading && !salaryNotesError && salaryNotes.length === 0 && (
                <div style={{ color: 'var(--text-secondary)' }}>{t("outcome.salary_notes.empty")}</div>
              )}
              {!salaryNotesLoading && !salaryNotesError && salaryNotes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '320px', overflowY: 'auto' }}>
                  {salaryNotes.map((note) => (
                    <div key={note.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        <span>{note.payment_date}</span>
                        <span>{formatNumber(note.amount, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '13px' }}>{note.note || "—"}</div>
                    </div>
                  ))}
                </div>
              )}
              {salaryNotesTotal > 10 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={salaryNotesPage <= 1}
                    onClick={() => setSalaryNotesPage((p) => Math.max(1, p - 1))}
                  >
                    {t("outcome.salary_notes.prev")}
                  </button>
                  <div style={{ alignSelf: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {salaryNotesPage} / {totalSalaryNotePages}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={salaryNotesPage >= totalSalaryNotePages}
                    onClick={() => setSalaryNotesPage((p) => Math.min(totalSalaryNotePages, p + 1))}
                  >
                    {t("outcome.salary_notes.next")}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="outcome-form-actions" style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
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

      {signatureModalOpen && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>{t("outcome.signature.title")}</div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSignatureModalOpen(false)}
                disabled={signatureSubmitting}
              >
                {t("outcome.signature.close")}
              </button>
            </div>
            <div className="modal-body" style={{ color: 'var(--text)' }}>
              <div style={{ display: 'grid', gap: '16px' }}>
                <div>
                  <div className="form-label">{t("outcome.signature.signer_name")}</div>
                  <input
                    className="form-input"
                    value={signerName}
                    placeholder={t("outcome.signature.signer_placeholder")}
                    readOnly
                  />
                </div>
                <div>
                  <div className="form-label">Report Amount (PDF)</div>
                  <input
                    className="form-input"
                    value={formatNumber(toNumber(salaryForm.amount, 0), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    readOnly
                  />
                </div>
                <div>
                  <div className="form-label">{t("outcome.signature.digital_signature")}</div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '8px', background: 'var(--surface)' }}>
                    <canvas
                      ref={signatureCanvasRef}
                      style={{ width: '100%', height: '140px', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
                      onMouseDown={handleSignatureStart}
                      onMouseMove={handleSignatureMove}
                      onMouseUp={handleSignatureEnd}
                      onMouseLeave={handleSignatureEnd}
                      onTouchStart={handleSignatureStart}
                      onTouchMove={handleSignatureMove}
                      onTouchEnd={handleSignatureEnd}
                    />
                  </div>
                </div>
                {signatureError && <div className="form-error">{signatureError}</div>}
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={clearSignature} disabled={signatureSubmitting}>
                {t("outcome.signature.clear")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleRecordSalaryWithSignature}
                disabled={signatureSubmitting || !hasSignature || !signerName.trim() || !canSign}
              >
                {signatureSubmitting ? t("outcome.signature.recording") : t("outcome.signature.record_and_sign")}
              </button>
            </div>
          </div>
        </div>
      )}

      {amountDiscrepancyModal && (
        <div className="modal-overlay amount-discrepancy-modal" onClick={handleAmountDiscrepancyCancel}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="amount-discrepancy-title" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div id="amount-discrepancy-title">{t("outcome.amount_discrepancy.title", { defaultValue: "Confirm Amount Change" })}</div>
            </div>
            <div className="modal-body">
              <div className="amount-discrepancy-content">
                <div>{t("outcome.amount_discrepancy.message", { defaultValue: "Entered amount differs from the calculated salary." })}</div>
                <div className="amount-discrepancy-stats">
                  <div className="amount-discrepancy-row">
                    <span>{t("outcome.amount_discrepancy.calculated", { defaultValue: "Calculated" })}</span>
                    <strong>{formatNumber(amountDiscrepancyModal.calculated, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </div>
                  <div className="amount-discrepancy-row">
                    <span>{t("outcome.amount_discrepancy.entered", { defaultValue: "Entered" })}</span>
                    <strong>{formatNumber(amountDiscrepancyModal.entered, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </div>
                  <div className="amount-discrepancy-row">
                    <span>{t("outcome.amount_discrepancy.delta", { defaultValue: "Difference" })}</span>
                    <strong>{formatNumber(amountDiscrepancyModal.delta, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </div>
                </div>
                <div className="amount-discrepancy-note">
                  {t("outcome.amount_discrepancy.note", { defaultValue: "Continuing will use the entered amount in the signed PDF report and salary record." })}
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={handleAmountDiscrepancyCancel}>
                {t("common.cancel")}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleAmountDiscrepancyConfirm}>
                {t("outcome.amount_discrepancy.confirm", { defaultValue: "Continue" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
