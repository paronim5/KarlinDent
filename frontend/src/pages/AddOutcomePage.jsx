import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApi } from "../api/client.js";
import { useAuth } from "../App.jsx";

export default function AddOutcomePage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  const prefillAmountRef = useRef(null);
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
  const [lockScroll, setLockScroll] = useState(false);
  const [signatureSuccess, setSignatureSuccess] = useState(null); // { documentId, staffId }
  const [docActionLoading, setDocActionLoading] = useState(false);
  const [amountDiscrepancyModal, setAmountDiscrepancyModal] = useState(null);
  const [signatureSubmitting, setSignatureSubmitting] = useState(false);
  const [signatureError, setSignatureError] = useState("");
  const [signerName, setSignerName] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const signatureCanvasRef = useRef(null);

  // Shift selection & revert
  const [unpaidShifts, setUnpaidShifts] = useState([]);
  const [paidShifts, setPaidShifts] = useState([]);
  const [selectedShiftIds, setSelectedShiftIds] = useState([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [revertShiftIds, setRevertShiftIds] = useState([]);
  const [reverting, setReverting] = useState(false);
  const [shiftMode, setShiftMode] = useState("select"); // "select" | "revert"

  // Smart patient split (doctor partial payment)
  const [smartSplitMode, setSmartSplitMode] = useState(false);
  const [maxBudget, setMaxBudget] = useState("");
  const [smartSplit, setSmartSplit] = useState(null);
  const [smartSplitLoading, setSmartSplitLoading] = useState(false);
  const [smartSplitError, setSmartSplitError] = useState("");
  const smartSplitDebounceRef = useRef(null);

  // Note-only mode
  const [noteOnlyMode, setNoteOnlyMode] = useState(false);
  const [noteOnlyForm, setNoteOnlyForm] = useState({ note: "", date: new Date().toISOString().slice(0, 10) });
  const [savingNote, setSavingNote] = useState(false);

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

  // Sync period buttons (Layout top bar) → salaryRange for non-doctor staff
  useEffect(() => {
    const handler = (event) => {
      if (event?.detail?.from && event?.detail?.to) {
        prefillAmountRef.current = null;
        setPrefillAmount(null);
        setHasManualSalaryAmount(false);
        setSalaryRange({ from: event.detail.from, to: event.detail.to });
      }
    };
    window.addEventListener("periodChanged", handler);
    return () => window.removeEventListener("periodChanged", handler);
  }, []);

  // Load initial data
  useEffect(() => {
    loadCategories();
    loadStaff();
  }, []);

  useEffect(() => {
    const tab = searchParams.get("tab");
    const staffIdParam = searchParams.get("staff_id");
    const amountParam = searchParams.get("amount");
    const toParam = searchParams.get("to");
    const fromParam = searchParams.get("from");
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
        prefillAmountRef.current = amountValue;
        setPrefillAmount(amountValue);
        setSalaryForm((p) => ({ ...p, amount: amountValue.toFixed(2) }));
        setHasManualSalaryAmount(false);
      }
    }
    if (fromParam || toParam) {
      setSalaryRange({ from: fromParam || "", to: toParam || "" });
    } else {
      const today = new Date();
      const firstOfYear = new Date(today.getFullYear(), 0, 1);
      const to = today.toISOString().slice(0, 10);
      const from = firstOfYear.toISOString().slice(0, 10);
      setSalaryRange({ from, to });
    }
    {
      const todayStr = new Date().toISOString().slice(0, 10);
      setSalaryForm((p) => ({ ...p, paymentDate: todayStr }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const loadShifts = async (staffId) => {
    setShiftsLoading(true);
    try {
      const [unpaid, paid] = await Promise.all([
        api.get(`/staff/${staffId}/unpaid-shifts`),
        api.get(`/staff/${staffId}/paid-shifts`),
      ]);
      setUnpaidShifts(unpaid);
      setPaidShifts(paid);
      setSelectedShiftIds([]);
      setRevertShiftIds([]);
    } catch (err) {
      console.error("Failed to load shifts", err);
    } finally {
      setShiftsLoading(false);
    }
  };

  const runSmartSplit = async (budgetValue) => {
    if (!selectedStaffId || !Number.isFinite(budgetValue) || budgetValue <= 0) return;
    setSmartSplitLoading(true);
    setSmartSplitError("");
    try {
      const range = resolveReportRange();
      const params = new URLSearchParams({ amount: budgetValue.toFixed(2) });
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      const result = await api.get(`/staff/${selectedStaffId}/salary-smart-split?${params}`);
      setSmartSplit(result);
      // Auto-set the payment amount to the exact covered total
      setSalaryForm(p => ({ ...p, amount: result.covered_total.toFixed(2) }));
      setHasManualSalaryAmount(false);
    } catch (err) {
      setSmartSplitError(err.message || "Failed to calculate smart split.");
      setSmartSplit(null);
    } finally {
      setSmartSplitLoading(false);
    }
  };

  // Debounced auto-recalculate when max budget changes
  useEffect(() => {
    if (!smartSplitMode) return;
    const budgetValue = toNumber(maxBudget, NaN);
    if (!Number.isFinite(budgetValue) || budgetValue <= 0) {
      setSmartSplit(null);
      setSmartSplitError("");
      return;
    }
    if (smartSplitDebounceRef.current) clearTimeout(smartSplitDebounceRef.current);
    smartSplitDebounceRef.current = setTimeout(() => { runSmartSplit(budgetValue); }, 600);
    return () => { if (smartSplitDebounceRef.current) clearTimeout(smartSplitDebounceRef.current); };
  }, [maxBudget, smartSplitMode, selectedStaffId, salaryRange.from, salaryRange.to]);

  const handleRevertShifts = async () => {
    if (revertShiftIds.length === 0) return;
    setReverting(true);
    try {
      await api.post(`/staff/${selectedStaffId}/shifts/revert`, { shift_ids: revertShiftIds });
      window.dispatchEvent(new CustomEvent("toast", { detail: { type: "success", message: `${revertShiftIds.length} shift(s) reverted to unpaid` } }));
      await loadShifts(selectedStaffId);
    } catch (err) {
      setError(err.message || "Failed to revert shifts");
    } finally {
      setReverting(false);
    }
  };

  const handleSaveNoteOnly = async (e) => {
    e.preventDefault();
    if (!noteOnlyForm.note.trim()) { setError("Note text is required"); return; }
    setSavingNote(true);
    setError("");
    try {
      await api.post(`/staff/${selectedStaffId}/salary-notes`, {
        note: noteOnlyForm.note.trim(),
        date: noteOnlyForm.date,
      });
      window.dispatchEvent(new CustomEvent("toast", { detail: { type: "success", message: "Note saved" } }));
      setNoteOnlyForm({ note: "", date: new Date().toISOString().slice(0, 10) });
      // Reload notes
      setSalaryNotesPage(1);
    } catch (err) {
      setError(err.message || "Failed to save note");
    } finally {
      setSavingNote(false);
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
      setUnpaidShifts([]);
      setPaidShifts([]);
      setSelectedShiftIds([]);
      setRevertShiftIds([]);
      setSmartSplitMode(false);
      setMaxBudget("");
      setSmartSplit(null);
      setSmartSplitError("");
      setError("");
      return;
    }
    setSmartSplitMode(false);
    setMaxBudget("");
    setSmartSplit(null);
    setSmartSplitError("");
    if (prefillStaffId && String(prefillStaffId) !== String(selectedStaffId)) {
      prefillAmountRef.current = null;
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
          } else if (prefillAmountRef.current !== null) {
            // Keep the prefill amount — unpaid total may include adjustments with no shift hours
            setSalaryForm((p) => ({ ...p, amount: prefillAmountRef.current.toFixed(2) }));
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

  // Load shifts for non-doctor staff
  useEffect(() => {
    if (!selectedStaffId || staffList.length === 0) return;
    const staffMember = staffList.find((s) => String(s.id) === String(selectedStaffId));
    if (!staffMember || staffMember.role === "doctor") return;
    loadShifts(selectedStaffId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStaffId, staffList]);

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
    // Smart split intentionally sets a partial amount — skip the discrepancy warning
    if (!smartSplitMode && Number.isFinite(suggestedAmount) && suggestedAmount > 0) {
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

    // If smart split is on but allocation hasn't been calculated yet, block submit
    if (smartSplitMode && !smartSplit) {
      setError("Enter a max budget above to calculate the patient allocation first.");
      return;
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

  const getAuthHeaders = () => {
    const headers = {};
    const token = localStorage.getItem("auth_token");
    if (token) headers["Authorization"] = "Bearer " + token;
    const rawUser = localStorage.getItem("auth_user");
    if (rawUser) {
      try {
        const u = JSON.parse(rawUser);
        if (u?.id) headers["X-Staff-Id"] = String(u.id);
        if (u?.role) headers["X-Staff-Role"] = String(u.role);
      } catch { /* ignore */ }
    }
    return headers;
  };

  const viewDocument = async (staffId, documentId) => {
    if (docActionLoading) return;
    setDocActionLoading(true);
    try {
      const response = await fetch(`/api/staff/${staffId}/documents/${documentId}/view`, { headers: getAuthHeaders() });
      if (!response.ok) throw new Error("Failed to open document");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch { /* ignore */ } finally {
      setDocActionLoading(false);
    }
  };

  const downloadDocument = async (staffId, documentId) => {
    if (docActionLoading) return;
    setDocActionLoading(true);
    try {
      const response = await fetch(`/api/staff/${staffId}/documents/${documentId}/download`, { headers: getAuthHeaders() });
      if (!response.ok) throw new Error("Failed to download document");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `salary-report-${staffId}-${documentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { /* ignore */ } finally {
      setDocActionLoading(false);
    }
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
      const amountChangeReason = smartSplitMode ? "smart_split_partial" : hasManualSalaryAmount ? "manual_ui_adjustment" : "calculated_value";

      const payload = {
        staff_id: Number(selectedStaffId),
        amount: amountValue,
        payment_date: salaryForm.paymentDate,
        note: salaryForm.note,
        amount_change_reason: amountChangeReason,
        reset_counter: true,
        signature: {
          signer_name: signerName.trim(),
          signed_at: signedAt,
          signature_data: signatureData
        }
      };
      if (range.from) payload.from = range.from;
      if (range.to) payload.to = range.to;
      if (selectedShiftIds.length > 0) payload.shift_ids = selectedShiftIds;
      if (smartSplit) {
        // Always send allocation when smart split is computed (even if no patients fit budget)
        payload.smart_split_allocation = {
          included_patients: smartSplit.included_patients || [],
          partial_patient: smartSplit.partial_patient || null,
          excluded_patients: smartSplit.excluded_patients || [],
          covered_total: smartSplit.covered_total,
          covered_commission: smartSplit.covered_commission,
          uncovered_commission: smartSplit.uncovered_commission,
          commission_rate: smartSplit.commission_rate,
        };
        // Only restrict income records to fully-paid patients (partial patient carries forward)
        if (smartSplit.included_patient_ids && smartSplit.included_patient_ids.length > 0) {
          payload.patient_ids = smartSplit.included_patient_ids;
        }
      }

      const response = await api.post("/staff/salaries", payload);

      window.dispatchEvent(new CustomEvent("salaryPaid"));
      window.dispatchEvent(new CustomEvent("toast", { detail: { type: "success", message: "Salary payment recorded and report signed" } }));

      if (response?.document_id) {
        setSignatureSuccess({ documentId: response.document_id, staffId: Number(selectedStaffId) });
      } else {
        setSignatureModalOpen(false);
        navigate("/outcome");
      }
    } catch (err) {
      const errCode = err.responseData?.error || err.code || "";
      if (errCode === "signature_mismatch") {
        setSignatureError(
          "Signature rejected: it does not match the reference signature on file. " +
          "Please draw your usual signature. The salary has NOT been processed."
        );
      } else {
        setSignatureError(err.message || "Failed to record salary and sign report");
      }
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

  // Compute amount from selected shifts
  const selectedShiftsAmount = useMemo(() => {
    if (selectedShiftIds.length === 0) return NaN;
    const staffMember = staffList.find((s) => String(s.id) === String(selectedStaffId));
    if (!staffMember) return NaN;
    const baseRate = toNumber(staffMember.base_salary, 0);
    const wkndRate = toNumber(staffMember.weekend_salary ?? 200, 200);
    let total = 0;
    for (const id of selectedShiftIds) {
      const sh = unpaidShifts.find((s) => s.id === id);
      if (!sh) continue;
      total += sh.is_weekend ? sh.salary_hours * wkndRate : sh.salary_hours * baseRate;
    }
    return Number(total.toFixed(2));
  }, [selectedShiftIds, unpaidShifts, staffList, selectedStaffId]);

  const suggestedAmount = useMemo(() => {
    if (selectedShiftIds.length > 0) return selectedShiftsAmount;
    if (showTimesheetSummary && timesheetSummary) {
      return toNumber(timesheetSummary.amount, NaN);
    }
    if (!showTimesheetSummary && salaryMetrics) {
      return toNumber(salaryMetrics.adjustedTotal, NaN);
    }
    return NaN;
  }, [selectedShiftIds, selectedShiftsAmount, showTimesheetSummary, timesheetSummary, salaryMetrics]);
  const totalSalaryNotePages = Math.max(1, Math.ceil(salaryNotesTotal / 10));
  // When shift selection changes, auto-fill amount if not manually set
  useEffect(() => {
    if (!hasManualSalaryAmount && Number.isFinite(selectedShiftsAmount)) {
      setSalaryForm(p => ({ ...p, amount: selectedShiftsAmount.toFixed(2) }));
    }
  }, [selectedShiftsAmount]);

  const openSignatureModal = () => {
    if (!selectedStaffId) return;
    setSignatureError("");
    setSignatureSuccess(null);
    setSignatureModalOpen(true);
    setHasSignature(false);
  };

  useEffect(() => {
    if (!signatureModalOpen) return;
    window.scrollTo({ top: 0, behavior: 'instant' });
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 200;
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
      if (e.target && e.target.closest && e.target.closest('.modal-overlay')) return;
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
    if (!signatureModalOpen || !lockScroll) return;

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

    const preventDefault = (e) => {
      if (e.target && e.target.closest && e.target.closest('.modal-overlay')) return;
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
      document.removeEventListener('touchmove', preventDefault);
      document.removeEventListener('wheel', preventDefault);
    };
  }, [signatureModalOpen, lockScroll]);

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
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">{t("nav.add_outcome", { defaultValue: "Add Outcome" })}</div>
      </div>

      <div className="tabs outcome-tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === "general" ? "active" : ""}`}
          onClick={() => setActiveTab("general")}
        >
          {t("outcome.expenses")}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "salary" ? "active" : ""}`}
          onClick={() => setActiveTab("salary")}
        >
          {t("outcome.salaries")}
        </button>
      </div>

      {error && <div role="alert" className="form-error" style={{ marginBottom: '16px' }}>{error}</div>}

      {activeTab === "general" && (
        <form onSubmit={handleGeneralSubmit}>
          <div className="form-grid-2">
            <div className="form-field">
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

            <div className="form-field">
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

            <div className="form-field">
              <div className="form-label">{t("outcome.form.date")}</div>
              <input
                className="form-input"
                type="date"
                required
                value={generalForm.expenseDate}
                onChange={(e) => setGeneralForm(p => ({ ...p, expenseDate: e.target.value }))}
              />
            </div>

            <div className="form-field">
              <div className="form-label">{t("outcome.form.vendor")}</div>
              <input
                className="form-input"
                type="text"
                value={generalForm.vendor}
                onChange={(e) => setGeneralForm(p => ({ ...p, vendor: e.target.value }))}
              />
            </div>

            <div className="form-field form-field-full">
              <div className="form-label">{t("outcome.form.description")}</div>
              <textarea
                className="form-input"
                rows={3}
                value={generalForm.description}
                onChange={(e) => setGeneralForm(p => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-actions">
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
        <div>
          {/* Staff selector row */}
          <div className="form-grid-2" style={{ marginBottom: '20px' }}>
            <div className="form-field">
              <div className="form-label">{t("outcome.form.staff")}</div>
              <select
                className="form-input"
                value={selectedStaffId}
                onChange={(e) => {
                  setSelectedStaffId(e.target.value);
                  setHasManualSalaryAmount(false);
                  setNoteOnlyMode(false);
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

            {/* Mode toggle: pay salary / add note */}
            {selectedStaffId && (
              <div className="form-field">
                <div className="form-label">Mode</div>
                <div className="toggle-group">
                  <button type="button" className={`toggle-opt${!noteOnlyMode ? " on" : ""}`} onClick={() => setNoteOnlyMode(false)}>
                    Pay Salary
                  </button>
                  <button type="button" className={`toggle-opt${noteOnlyMode ? " on" : ""}`} onClick={() => setNoteOnlyMode(true)}>
                    Add Note
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── NOTE-ONLY MODE ── */}
          {selectedStaffId && noteOnlyMode && (
            <form onSubmit={handleSaveNoteOnly}>
              <div className="form-grid-2">
                <div className="form-field">
                  <div className="form-label">Date</div>
                  <input
                    type="date"
                    className="form-input"
                    value={noteOnlyForm.date}
                    onChange={(e) => setNoteOnlyForm(p => ({ ...p, date: e.target.value }))}
                  />
                </div>
                <div className="form-field form-field-full">
                  <div className="form-label">Note</div>
                  <textarea
                    className="form-input"
                    rows={3}
                    required
                    value={noteOnlyForm.note}
                    onChange={(e) => setNoteOnlyForm(p => ({ ...p, note: e.target.value }))}
                    placeholder="Enter note text…"
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => navigate("/outcome")}>{t("common.cancel")}</button>
                <button type="submit" className="btn btn-primary" disabled={savingNote || !noteOnlyForm.note.trim()}>
                  {savingNote ? "Saving…" : "Save Note"}
                </button>
              </div>
            </form>
          )}

          {/* ── SALARY PAYMENT MODE ── */}
          {(!selectedStaffId || !noteOnlyMode) && (
            <form onSubmit={handleSalarySubmit}>
              <div className="form-grid-2">
                {/* Payment date */}
                <div className="form-field">
                  <div className="form-label">{t("outcome.form.date")}</div>
                  <input
                    className="form-input"
                    type="date"
                    required
                    value={salaryForm.paymentDate}
                    onChange={(e) => setSalaryForm(p => ({ ...p, paymentDate: e.target.value }))}
                  />
                </div>

                {/* Period range — non-doctor only */}
                {selectedStaffId && staffList.find(s => String(s.id) === String(selectedStaffId))?.role !== "doctor" && (
                  <>
                    <div className="form-field">
                      <div className="form-label">{t("outcome.form.date_from", "Period from")}</div>
                      <input
                        type="date"
                        className="form-input"
                        value={salaryRange.from}
                        max={salaryRange.to || undefined}
                        onChange={e => {
                          prefillAmountRef.current = null;
                          setPrefillAmount(null);
                          setHasManualSalaryAmount(false);
                          setSalaryRange(p => ({ ...p, from: e.target.value }));
                        }}
                      />
                    </div>
                    <div className="form-field">
                      <div className="form-label">{t("outcome.form.date_to", "Period to")}</div>
                      <input
                        type="date"
                        className="form-input"
                        value={salaryRange.to}
                        min={salaryRange.from || undefined}
                        onChange={e => {
                          prefillAmountRef.current = null;
                          setPrefillAmount(null);
                          setHasManualSalaryAmount(false);
                          setSalaryRange(p => ({ ...p, to: e.target.value }));
                        }}
                      />
                    </div>
                  </>
                )}

                {/* Salary breakdown summary */}
                {(showTimesheetSummary || salaryMetrics) && selectedShiftIds.length === 0 && (
                  <div className="form-field form-field-full">
                    <div className="salary-breakdown-card">
                      <div className="salary-breakdown-title">{t("outcome.salary_panel.breakdown")}</div>
                      <div className="salary-breakdown-rows">
                        {showTimesheetSummary ? (
                          <>
                            <div className="salary-breakdown-row">
                              <span>Weekday hours</span>
                              <span className="mono">{(timesheetSummary.weekdayHours ?? 0).toFixed(1)}h × {formatNumber(timesheetSummary.baseRate, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="salary-breakdown-row">
                              <span>Weekend hours</span>
                              <span className="mono">{(timesheetSummary.weekendHours ?? 0).toFixed(1)}h × {formatNumber(timesheetSummary.weekendRate ?? 200, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="salary-breakdown-total">
                              <span>{t("outcome.salary_panel.calculated_salary")}</span>
                              <span className="mono">{formatNumber(timesheetSummary.amount, { minimumFractionDigits: 2 })}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="salary-breakdown-row">
                              <span>{t("outcome.salary_panel.last_payment")}</span>
                              <span>{salaryEstimate.last_paid_at || t("outcome.salary_panel.never")}</span>
                            </div>
                            <div className="salary-breakdown-row">
                              <span>{t("outcome.salary_panel.commission", { rate: formatNumber(salaryMetrics.commissionRate * 100, { maximumFractionDigits: 2 }), income: formatNumber(salaryMetrics.totalIncome) })}</span>
                              <span className="mono">{formatNumber(salaryMetrics.commissionPart, { minimumFractionDigits: 2 })}</span>
                            </div>
                            {salaryMetrics.totalLabFees > 0 && (
                              <div className="salary-breakdown-row">
                                <span>{t("outcome.salary_panel.lab_fees_deduction")}</span>
                                <span className="mono" style={{ color: 'var(--red)' }}>−{formatNumber(salaryMetrics.totalLabFees, { minimumFractionDigits: 2 })}</span>
                              </div>
                            )}
                            {salaryMetrics.adjustments !== 0 && (
                              <div className="salary-breakdown-row">
                                <span>{t("outcome.salary_panel.adjustments")}</span>
                                <span className="mono">{formatNumber(salaryMetrics.adjustments, { minimumFractionDigits: 2 })}</span>
                              </div>
                            )}
                            <div className="salary-breakdown-total">
                              <span>{t("outcome.salary_panel.total_estimated")}</span>
                              <span className="mono">{formatNumber(salaryMetrics.adjustedTotal, { minimumFractionDigits: 2 })}</span>
                            </div>
                            {salaryMetrics.unpaidPatients.length > 0 && (
                              <div className="salary-breakdown-patients">
                                <div className="salary-breakdown-patients-label">{t("outcome.salary_panel.unpaid_patients", { count: salaryMetrics.unpaidPatients.length })}</div>
                                {salaryMetrics.unpaidPatients.map((patient, idx) => (
                                  <div key={`${patient.name}-${idx}`} className="salary-breakdown-row">
                                    <span>{patient.name}</span>
                                    <span className="mono">{formatNumber(patient.net_paid, { minimumFractionDigits: 2 })}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Amount */}
                <div className="form-field">
                  <div className="form-label">
                    {t("outcome.form.amount")}
                    {smartSplitMode && smartSplit && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: "var(--muted)", fontWeight: 400 }}>auto-calculated</span>
                    )}
                  </div>
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={salaryForm.amount}
                    readOnly={smartSplitMode}
                    style={smartSplitMode ? { opacity: 0.7, cursor: "not-allowed" } : undefined}
                    onChange={(e) => {
                      if (smartSplitMode) return;
                      setHasManualSalaryAmount(true);
                      setSalaryForm(p => ({ ...p, amount: e.target.value }));
                    }}
                  />
                  {Number.isFinite(suggestedAmount) && hasManualSalaryAmount && !smartSplitMode && (
                    <div className="form-hint">Calculated: {formatNumber(suggestedAmount, { minimumFractionDigits: 2 })}</div>
                  )}
                </div>

                {/* Note */}
                <div className="form-field">
                  <div className="form-label">{t("outcome.form.note")}</div>
                  <textarea
                    className="form-input"
                    rows={2}
                    value={salaryForm.note}
                    onChange={(e) => setSalaryForm(p => ({ ...p, note: e.target.value }))}
                  />
                </div>

                {/* Smart Patient Split — doctor only */}
                {(() => {
                  const staffMember = staffList.find(s => String(s.id) === String(selectedStaffId));
                  if (!staffMember || staffMember.role !== "doctor") return null;
                  return (
                    <div className="form-field form-field-full">
                      {/* Toggle */}
                      <label className="check-row" style={{ marginBottom: smartSplitMode ? 12 : 0 }}>
                        <input
                          type="checkbox"
                          checked={smartSplitMode}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setSmartSplitMode(on);
                            if (!on) {
                              setMaxBudget("");
                              setSmartSplit(null);
                              setSmartSplitError("");
                              // Restore auto-calculated amount
                              if (Number.isFinite(suggestedAmount)) {
                                setSalaryForm(p => ({ ...p, amount: suggestedAmount.toFixed(2) }));
                                setHasManualSalaryAmount(false);
                              }
                            }
                          }}
                        />
                        <span>Smart split — pay partial amount by patients</span>
                      </label>

                      {smartSplitMode && (
                        <>
                          {/* Max budget input */}
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                            <div style={{ flex: "0 0 auto" }}>
                              <div className="form-label" style={{ marginBottom: 4 }}>Max budget (CZK)</div>
                              <input
                                className="form-input"
                                type="number"
                                step="0.01"
                                min="0.01"
                                placeholder="Enter max you can pay…"
                                value={maxBudget}
                                style={{ width: 200 }}
                                onChange={(e) => setMaxBudget(e.target.value)}
                                autoFocus
                              />
                            </div>
                            {smartSplitLoading && (
                              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 20 }}>Calculating…</div>
                            )}
                          </div>

                          {smartSplitError && <div className="form-error" style={{ marginBottom: 8 }}>{smartSplitError}</div>}

                          {/* Allocation result */}
                          {smartSplit && (
                            <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", fontSize: 13 }}>
                              {/* Header */}
                              <div style={{ padding: "8px 12px", background: "var(--surface)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontWeight: 600 }}>Patient allocation</span>
                                <span style={{ color: "var(--muted)", fontSize: 12 }}>
                                  budget: {formatNumber(toNumber(maxBudget, 0), { minimumFractionDigits: 2 })} → paying: <strong style={{ color: "var(--green)" }}>{formatNumber(smartSplit.covered_total, { minimumFractionDigits: 2 })}</strong>
                                </span>
                              </div>

                              {smartSplit.included_patients.length === 0 && !smartSplit.partial_patient ? (
                                <div style={{ padding: "10px 12px", color: "var(--red)", fontSize: 13 }}>
                                  Budget too low to cover any patient commission. Only base salary will be paid.
                                </div>
                              ) : (
                                <>
                                  {/* Paid now */}
                                  <div style={{ padding: "8px 12px", borderBottom: (smartSplit.partial_patient || smartSplit.excluded_patients.length > 0) ? "1px solid var(--border)" : undefined }}>
                                    <div style={{ color: "var(--green)", fontWeight: 600, marginBottom: 4, fontSize: 12 }}>
                                      Paid in full — {smartSplit.included_patients.length} patient{smartSplit.included_patients.length !== 1 ? "s" : ""}
                                    </div>
                                    {smartSplit.included_patients.map((p, i) => (
                                      <div key={`inc-${i}`} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                                        <span>{p.name}</span>
                                        <span className="mono" style={{ color: "var(--green)" }}>
                                          {formatNumber(p.salary_contribution, { minimumFractionDigits: 2 })}
                                        </span>
                                      </div>
                                    ))}

                                    {/* Partial patient */}
                                    {smartSplit.partial_patient && (
                                      <div style={{ marginTop: 4, borderTop: "1px dashed var(--border)", paddingTop: 4 }}>
                                        <div style={{ color: "var(--accent)", fontWeight: 600, marginBottom: 2, fontSize: 12 }}>
                                          Partial — {smartSplit.partial_patient.pct_paid}% paid now
                                        </div>
                                        <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                                          <span style={{ color: "var(--accent)" }}>{smartSplit.partial_patient.name}</span>
                                          <span className="mono" style={{ color: "var(--accent)" }}>
                                            {formatNumber(smartSplit.partial_patient.commission_paid, { minimumFractionDigits: 2 })}
                                            <span style={{ color: "var(--muted)", fontSize: 11 }}> / {formatNumber(smartSplit.partial_patient.salary_contribution, { minimumFractionDigits: 2 })}</span>
                                          </span>
                                        </div>
                                      </div>
                                    )}

                                    {(smartSplit.base_salary > 0 || smartSplit.adjustments !== 0) && (
                                      <div style={{ borderTop: "1px dashed var(--border)", marginTop: 4, paddingTop: 4, display: "flex", justifyContent: "space-between", color: "var(--muted)", fontSize: 12 }}>
                                        <span>+ base salary &amp; adjustments</span>
                                        <span className="mono">{formatNumber(smartSplit.base_salary + smartSplit.adjustments, { minimumFractionDigits: 2 })}</span>
                                      </div>
                                    )}
                                    <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4, display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                                      <span>Payment amount</span>
                                      <span className="mono" style={{ color: "var(--green)" }}>{formatNumber(smartSplit.covered_total, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                  </div>

                                  {/* Deferred */}
                                  {(smartSplit.partial_patient || smartSplit.excluded_patients.length > 0) && (
                                    <div style={{ padding: "8px 12px", background: "var(--surface)" }}>
                                      <div style={{ color: "var(--muted)", fontWeight: 600, marginBottom: 4, fontSize: 12 }}>
                                        Deferred next cycle · {formatNumber(smartSplit.uncovered_commission, { minimumFractionDigits: 2 })}
                                      </div>
                                      {smartSplit.partial_patient && (
                                        <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "var(--muted)" }}>
                                          <span>{smartSplit.partial_patient.name} <span style={{ fontSize: 11 }}>({smartSplit.partial_patient.pct_deferred}% deferred)</span></span>
                                          <span className="mono">{formatNumber(smartSplit.partial_patient.commission_deferred, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                      )}
                                      {smartSplit.excluded_patients.map((p, i) => (
                                        <div key={`exc-${i}`} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "var(--muted)" }}>
                                          <span>{p.name}</span>
                                          <span className="mono">{formatNumber(p.salary_contribution, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* ── SHIFT SELECTION / REVERT (non-doctor only) ── */}
              {selectedStaffId && staffList.find(s => String(s.id) === String(selectedStaffId))?.role !== "doctor" && (
                <div className="salary-history-section">
                  <div className="salary-history-header">
                    <span className="form-label" style={{ margin: 0 }}>Shifts</span>
                    <div className="toggle-group" style={{ width: 'auto' }}>
                      <button type="button" className={`toggle-opt${shiftMode === "select" ? " on" : ""}`} onClick={() => { setShiftMode("select"); setRevertShiftIds([]); }}>
                        Select to pay
                      </button>
                      <button type="button" className={`toggle-opt${shiftMode === "revert" ? " on" : ""}`} onClick={() => { setShiftMode("revert"); setSelectedShiftIds([]); }}>
                        Revert paid
                      </button>
                    </div>
                  </div>

                  {shiftsLoading && <div className="text-secondary" style={{ fontSize: '13px' }}>Loading shifts…</div>}

                  {/* Select unpaid shifts to include in this payment */}
                  {!shiftsLoading && shiftMode === "select" && (
                    <>
                      {unpaidShifts.length === 0 ? (
                        <div className="text-secondary" style={{ fontSize: '13px' }}>No unpaid shifts found.</div>
                      ) : (
                        <>
                          <div className="shift-select-actions">
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelectedShiftIds(unpaidShifts.map(s => s.id))}>Select all</button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelectedShiftIds([])}>Clear</button>
                            {selectedShiftIds.length > 0 && (
                              <span className="text-secondary" style={{ fontSize: '12px' }}>
                                {selectedShiftIds.length} selected · {formatNumber(selectedShiftsAmount, { minimumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>
                          <div className="salary-history-list">
                            {unpaidShifts.map((sh) => {
                              const checked = selectedShiftIds.includes(sh.id);
                              const start = new Date(sh.start);
                              const staffMember = staffList.find(s => String(s.id) === String(selectedStaffId));
                              const rate = sh.is_weekend ? toNumber(staffMember?.weekend_salary ?? 200, 200) : toNumber(staffMember?.base_salary, 0);
                              const pay = (sh.salary_hours * rate).toFixed(2);
                              return (
                                <label key={sh.id} className={`shift-select-item${checked ? " selected" : ""}`}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => setSelectedShiftIds(p => checked ? p.filter(id => id !== sh.id) : [...p, sh.id])}
                                    style={{ display: 'none' }}
                                  />
                                  <div className="shift-select-check">{checked ? "✓" : ""}</div>
                                  <div className="shift-select-info">
                                    <span className="shift-select-date">
                                      {start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                      {sh.is_weekend && <span className="pill pill-blue" style={{ marginLeft: '6px', fontSize: '10px', padding: '1px 5px' }}>WE</span>}
                                    </span>
                                    <span className="text-secondary" style={{ fontSize: '12px' }}>
                                      {new Date(sh.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} – {new Date(sh.end).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                      {" · "}{sh.salary_hours}h
                                    </span>
                                    {sh.note && <span className="text-secondary" style={{ fontSize: '12px' }}>{sh.note}</span>}
                                  </div>
                                  <div className="shift-select-pay mono">{pay}</div>
                                </label>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {/* Revert paid shifts */}
                  {!shiftsLoading && shiftMode === "revert" && (
                    <>
                      {paidShifts.length === 0 ? (
                        <div className="text-secondary" style={{ fontSize: '13px' }}>No recently paid shifts found.</div>
                      ) : (
                        <>
                          <div className="shift-select-actions">
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRevertShiftIds(paidShifts.map(s => s.id))}>Select all</button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRevertShiftIds([])}>Clear</button>
                            {revertShiftIds.length > 0 && (
                              <button type="button" className="btn btn-danger btn-sm" disabled={reverting} onClick={handleRevertShifts}>
                                {reverting ? "Reverting…" : `Revert ${revertShiftIds.length} shift(s)`}
                              </button>
                            )}
                          </div>
                          <div className="salary-history-list">
                            {paidShifts.map((sh) => {
                              const checked = revertShiftIds.includes(sh.id);
                              const start = new Date(sh.start);
                              return (
                                <label key={sh.id} className={`shift-select-item${checked ? " selected" : ""}`}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => setRevertShiftIds(p => checked ? p.filter(id => id !== sh.id) : [...p, sh.id])}
                                    style={{ display: 'none' }}
                                  />
                                  <div className="shift-select-check">{checked ? "✓" : ""}</div>
                                  <div className="shift-select-info">
                                    <span className="shift-select-date">
                                      {start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                      {sh.is_weekend && <span className="pill pill-blue" style={{ marginLeft: '6px', fontSize: '10px', padding: '1px 5px' }}>WE</span>}
                                    </span>
                                    <span className="text-secondary" style={{ fontSize: '12px' }}>
                                      {new Date(sh.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} – {new Date(sh.end).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                      {" · "}{sh.salary_hours}h
                                      {sh.payment_date && ` · paid ${sh.payment_date}`}
                                    </span>
                                  </div>
                                  <div className="shift-select-pay mono" style={{ color: 'var(--text-secondary)' }}>paid</div>
                                </label>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Payment history */}
              {selectedStaffId && (
                <div className="salary-history-section">
                  <div className="salary-history-header">
                    <span className="form-label" style={{ margin: 0 }}>{t("outcome.salary_notes.title")}</span>
                    <span className="text-secondary" style={{ fontSize: '12px' }}>{t("outcome.salary_notes.total", { count: salaryNotesTotal })}</span>
                  </div>
                  {salaryNotesLoading && <div className="text-secondary">{t("outcome.salary_notes.loading")}</div>}
                  {!salaryNotesLoading && salaryNotesError && <div className="form-error">{salaryNotesError}</div>}
                  {!salaryNotesLoading && !salaryNotesError && salaryNotes.length === 0 && (
                    <div className="text-secondary">{t("outcome.salary_notes.empty")}</div>
                  )}
                  {!salaryNotesLoading && !salaryNotesError && salaryNotes.length > 0 && (
                    <div className="salary-history-list">
                      {salaryNotes.map((note) => (
                        <div key={note.id} className="salary-history-item">
                          <div className="salary-history-item-meta">
                            <span>{note.payment_date}</span>
                            <span className="mono">{note.amount > 0 ? formatNumber(note.amount, { minimumFractionDigits: 2 }) : "note"}</span>
                          </div>
                          {note.note && <div className="salary-history-item-note">{note.note}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                  {salaryNotesTotal > 10 && (
                    <div className="salary-history-pager">
                      <button type="button" className="btn btn-secondary btn-sm" disabled={salaryNotesPage <= 1} onClick={() => setSalaryNotesPage(p => Math.max(1, p - 1))}>{t("outcome.salary_notes.prev")}</button>
                      <span className="text-secondary" style={{ fontSize: '12px' }}>{salaryNotesPage} / {totalSalaryNotePages}</span>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={salaryNotesPage >= totalSalaryNotePages} onClick={() => setSalaryNotesPage(p => Math.min(totalSalaryNotePages, p + 1))}>{t("outcome.salary_notes.next")}</button>
                    </div>
                  )}
                </div>
              )}

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => navigate("/outcome")}>{t("common.cancel")}</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !selectedStaffId}>
                  {saving ? t("common.loading") : t("outcome.form.submit_salary")}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {signatureModalOpen && (
        <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: '5vh', overflowY: 'auto' }}>
          <div className="modal" role="dialog" aria-modal="true" style={{ maxHeight: 'none' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px' }}>
              <div>{t("outcome.signature.title")}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--subtext)', cursor: 'pointer', userSelect: 'none' }}>
                  <span>Lock scroll</span>
                  <button
                    type="button"
                    onClick={() => setLockScroll(v => !v)}
                    style={{
                      width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: lockScroll ? 'var(--accent)' : 'var(--border)',
                      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                    }}
                    aria-label="Toggle scroll lock"
                  >
                    <span style={{
                      display: 'block', width: 14, height: 14, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 3, left: lockScroll ? 19 : 3, transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }} />
                  </button>
                </label>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setSignatureModalOpen(false)}
                  disabled={signatureSubmitting}
                >
                  {t("outcome.signature.close")}
                </button>
              </div>
            </div>
            {signatureSuccess ? (
              <>
                <div className="modal-body" style={{ color: 'var(--text)', padding: '24px 20px' }}>
                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <div style={{ fontSize: '36px', marginBottom: '8px' }}>✓</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--green)', marginBottom: '4px' }}>
                      {t("outcome.signature.success_title", "Payment recorded & report signed")}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {t("outcome.signature.success_sub", "The salary report PDF is ready.")}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={docActionLoading}
                      onClick={() => viewDocument(signatureSuccess.staffId, signatureSuccess.documentId)}
                    >
                      {t("outcome.signature.view_report", "View PDF")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={docActionLoading}
                      onClick={() => downloadDocument(signatureSuccess.staffId, signatureSuccess.documentId)}
                    >
                      {t("outcome.signature.download_report", "Download PDF")}
                    </button>
                  </div>
                </div>
                <div className="modal-actions" style={{ padding: '12px 20px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => navigate("/outcome")}>
                    {t("outcome.signature.done", "Done")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-body" style={{ color: 'var(--text)', padding: '16px 20px', overflowY: 'visible' }}>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <div className="form-label" style={{ fontSize: '11px' }}>{t("outcome.signature.signer_name")}</div>
                        <input
                          className="form-input"
                          style={{ padding: '7px 10px', fontSize: '13px' }}
                          value={signerName}
                          placeholder={t("outcome.signature.signer_placeholder")}
                          readOnly
                        />
                      </div>
                      <div>
                        <div className="form-label" style={{ fontSize: '11px' }}>Report Amount (PDF)</div>
                        <input
                          className="form-input"
                          style={{ padding: '7px 10px', fontSize: '13px' }}
                          value={formatNumber(toNumber(salaryForm.amount, 0), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          readOnly
                        />
                      </div>
                    </div>
                    <div>
                      <div className="form-label" style={{ fontSize: '11px' }}>{t("outcome.signature.digital_signature")}</div>
                      <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '6px', background: 'var(--surface)' }}>
                        <canvas
                          ref={signatureCanvasRef}
                          style={{ width: '100%', height: '200px', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
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
                <div className="modal-actions" style={{ padding: '12px 20px' }}>
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
              </>
            )}
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
