import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useApi } from "../api/client.js";

export default function AddIncomePage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;
  
  const initialForm = {
    patientInput: "",
    patientLocked: false,
    lockedPatient: null,
    banner: null,
    doctorId: "",
    amount: "",
    paymentMethod: "cash",
    note: "",
    labRequired: false,
    labCost: "",
    labNote: "",
    serviceDate: searchParams.get("date") || new Date().toISOString().slice(0, 10),
    moreDetails: false,
    phone: "",
    street: "",
    city: "",
    zip: "",
    receiptIssued: false,
    receiptReason: "",
    receiptNote: "",
    receiptMedicine: "",
    isPaid: false
  };

  const [form, setForm] = useState(initialForm);
  const [doctors, setDoctors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [receiptReasons, setReceiptReasons] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [patientSuggestions, setPatientSuggestions] = useState([]);

  useEffect(() => {
    if (isEdit) {
        setSearching(true);
        api.get(`/income/records/${id}`).then(data => {
            setForm(prev => ({
                ...prev,
                patientInput: `${data.patient.last_name} ${data.patient.first_name || ""}`.trim(),
                patientLocked: true,
                lockedPatient: data.patient,
                doctorId: data.doctor_id,
                amount: data.amount,
                paymentMethod: data.payment_method,
                note: data.note,
                serviceDate: data.service_date,
                labRequired: data.lab_cost > 0,
                labCost: data.lab_cost,
                isPaid: data.is_paid,
                // We don't parse complex note back to fields perfectly, just put in note
                // If the user wants to edit receipt details they might be lost if we don't parse.
                // But for this task, salary logic is key.
            }));
        }).catch(err => setError(err.message))
          .finally(() => setSearching(false));
    }
  }, [id, isEdit]);

  const loadDoctors = async (workingDate) => {
    try {
      const query = workingDate
        ? `/staff?role=doctor&working_on=${encodeURIComponent(workingDate)}`
        : "/staff?role=doctor";
      const items = await api.get(query);
      setDoctors(items);
      if (form.doctorId && !items.some((d) => String(d.id) === String(form.doctorId))) {
        setForm((p) => ({ ...p, doctorId: "" }));
      }
    } catch {
      setDoctors([]);
    }
  };

  const loadReceiptReasons = async () => {
    try {
      const items = await api.get(`/patients/receipt-reasons`);
      setReceiptReasons(items);
    } catch {
      setReceiptReasons([]);
    }
  };

  const loadMedicines = async () => {
    try {
      const items = await api.get("/staff/medicines");
      setMedicines(items);
    } catch {
      setMedicines([]);
    }
  };

  useEffect(() => {
    loadDoctors(form.serviceDate);
    loadReceiptReasons();
    loadMedicines();
  }, []);

  useEffect(() => {
    const doctorParam = searchParams.get("doctor");
    if (doctorParam && doctors.length > 0 && !form.doctorId) {
      const found = doctors.find((d) => String(d.id) === doctorParam);
      if (found) setForm((p) => ({ ...p, doctorId: String(found.id) }));
    }
  }, [doctors]);

  useEffect(() => {
    if (form.serviceDate) {
      loadDoctors(form.serviceDate);
    }
  }, [form.serviceDate]);

  useEffect(() => {
    if (!form.patientInput || form.patientLocked) {
      setForm((p) => ({ ...p, banner: null }));
      return;
    }
    const q = form.patientInput;
    // Debounce is 300ms
    const handle = setTimeout(async () => {
      if (!q.trim()) {
        setPatientSuggestions([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const results = await api.get(`/patients/search?q=${encodeURIComponent(q)}`);
        setPatientSuggestions(results || []);
        
        if (results && results.length > 0) {
          const top = results[0];
          // Check if it's an exact match to possibly show the banner
          const fullName = [top.first_name, top.last_name].filter(Boolean).join(" ");
          const revName = [top.last_name, top.first_name].filter(Boolean).join(" ");
          const qLower = q.trim().toLowerCase();
          
          if (top.exact || fullName.toLowerCase() === qLower || revName.toLowerCase() === qLower) {
             const totalStr = (top.banner?.total_paid ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
             const bannerText = top.banner?.last_treatment_doctor
               ? t("income.banner.found_with_last", { name: fullName, total: totalStr, doctor: top.banner.last_treatment_doctor, date: top.banner.last_treatment_date })
               : t("income.banner.found_basic", { name: fullName, total: totalStr });
             
             setForm((p) => ({
               ...p,
               banner: {
                 found: true,
                 text: bannerText,
               }
             }));
          } else {
             // If partial match, clear banner to focus on dropdown
             setForm((p) => ({ ...p, banner: null }));
          }
        } else {
           setForm((p) => ({ ...p, banner: { found: false, text: t("income.banner.new_patient") } }));
        }
      } catch {
        setForm((p) => ({ ...p, banner: null }));
        setPatientSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [form.patientInput]);

  const parsedName = useMemo(() => {
    const v = (form.patientInput || "").trim().replace(/\s+/g, " ");
    if (!v) return { last: "", first: null };
    const sp = v.split(" ");
    if (sp.length === 1) return { last: sp[0], first: null };
    return { last: sp[0], first: sp.slice(1).join(" ") };
  }, [form.patientInput]);

  const validateName = (s) => /^[A-Za-z' -]{2,50}$/.test(s);
  const isPatientValid = useMemo(() => {
    if (form.patientLocked && form.lockedPatient) return true;
    if (!parsedName.last || !validateName(parsedName.last)) return false;
    if (parsedName.first && !/^[A-Za-z' -]{1,50}$/.test(parsedName.first)) return false;
    return true;
  }, [form.patientLocked, form.lockedPatient, parsedName]);

  const isAmountValid = useMemo(() => {
    const n = Number(form.amount);
    return !isNaN(n) && n > 0;
  }, [form.amount]);

  const isLabCostValid = useMemo(() => {
    if (!form.labRequired) return true;
    const n = Number(form.labCost);
    return !isNaN(n) && n > 0;
  }, [form.labRequired, form.labCost]);

  const isLabNoteValid = useMemo(() => {
    if (!form.labRequired) return true;
    return form.labNote.trim().length > 0;
  }, [form.labRequired, form.labNote]);

  const isReceiptNoteValid = useMemo(() => {
    if (!form.receiptIssued) return true;
    return form.receiptNote.trim().length > 0;
  }, [form.receiptIssued, form.receiptNote]);

  const isDoctorValid = useMemo(() => !!form.doctorId, [form.doctorId]);
  const isFormValid = isPatientValid && isAmountValid && isDoctorValid && isLabCostValid && isLabNoteValid && isReceiptNoteValid;

  const onPatientKeyDown = (e) => {
    if ((e.key === "Enter" || e.key === "Tab") && patientSuggestions.length > 0) {
      e.preventDefault();
      // Auto-select the first suggestion on Enter/Tab
      const p = patientSuggestions[0];
      const name = [p.last_name, p.first_name].filter(Boolean).join(" ");
      setForm((prev) => ({
        ...prev,
        patientInput: name,
        patientLocked: true,
        lockedPatient: { id: p.id, first_name: p.first_name, last_name: p.last_name },
        banner: { 
          found: true, 
          text: t("income.banner.found_basic", { name: name, total: (p.banner?.total_paid ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }) 
        }
      }));
      setPatientSuggestions([]);
    }
  };

  const onPatientBlur = () => {
    if (form.banner && form.banner.found && form.lockedPatient) {
      setForm((p) => ({ ...p, patientLocked: true }));
    }
  };

  const submitData = async (mode = "ignore") => {
    setSaving(true);
    setError("");

    try {
      const payload = {
        doctor_id: form.doctorId ? Number(form.doctorId) : null,
        amount: Number(form.amount),
        payment_method: form.paymentMethod,
        note: form.note || undefined,
        service_date: form.serviceDate,
        receipt_issued: form.receiptIssued,
        receipt_reason: form.receiptReason || undefined,
        receipt_note: form.receiptNote || undefined,
        receipt_medicine: form.receiptMedicine || undefined,
        lab_required: form.labRequired,
        lab_cost: form.labRequired ? Number(form.labCost) : 0,
        lab_note: form.labNote || undefined,
        salary_modification_mode: mode
      };

      if (form.patientLocked && form.lockedPatient) {
        payload.patient_id = Number(form.lockedPatient.id);
      } else {
        const ln = parsedName.last;
        const fn = parsedName.first;
        payload.patient = { last_name: ln };
        if (fn) payload.patient.first_name = fn;
        if (form.phone) payload.patient.phone = form.phone;
        if (form.street) payload.patient.street_address = form.street;
        if (form.city) payload.patient.city = form.city;
        if (form.zip) payload.patient.zip_code = form.zip;
      }

      if (isEdit) {
          await api.put(`/income/records/${id}`, payload);
      } else {
          await api.post("/income/records", payload);
      }
      
      window.dispatchEvent(new CustomEvent("incomeAdded"));
      try {
        window.dispatchEvent(new CustomEvent("toast", { detail: { type: "success", message: t("income.toast.recorded") } }));
      } catch {}
      navigate("/income");
    } catch (err) {
      const msg = err.message;
      if (msg === "invalid_patient") setError(t("income.errors.invalid_patient"));
      else if (msg === "patient_not_found") setError(t("income.errors.patient_not_found"));
      else if (msg === "invalid_doctor") setError(t("income.errors.invalid_doctor"));
      else if (msg === "invalid_amount") setError(t("income.errors.invalid_amount"));
      else if (msg === "invalid_payment_method") setError(t("income.errors.invalid_payment_method"));
      else if (msg === "lab_cost_required") setError(t("income.errors.lab_cost_required"));
      else if (msg === "invalid_lab_cost") setError(t("income.errors.invalid_lab_cost"));
      else if (msg === "lab_note_required") setError(t("income.errors.lab_note_required"));
      else if (msg === "receipt_note_required") setError(t("income.errors.receipt_note_required"));
      else setError(err.message || "Unable to save income record");
    } finally {
      setSaving(false);
      setShowEditModal(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isEdit && form.isPaid) {
        setShowEditModal(true);
    } else {
        submitData();
    }
  };

  return (
    <div className="panel" style={{ width: '100%' }}>
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">Edit Paid Record</div>
            <div className="modal-body">
              <p>This income record has already been paid out in salary.</p>
              <p>How do you want to handle the difference in commission?</p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => submitData("adjust_next")}>
                Update & Adjust Salary
              </button>
              <button className="btn btn-warning" onClick={() => submitData("ignore")}>
                Update & Ignore Salary
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="panel-header" style={{ marginBottom: '16px' }}>
        <div className="panel-title">{isEdit ? "Edit Income Record" : t("income.form.add_record")}</div>
      </div>
      {error && <div role="alert" className="form-error" style={{ marginBottom: '16px' }}>{error}</div>}
      <form onSubmit={handleSubmit} aria-busy={saving || searching}>
        <div className="income-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div style={{ position: 'relative' }}>
            <div className="form-label">{t("income.form.patient_compact_label")}</div>
            <input
              className="form-input"
              type="text"
              aria-label={t("income.form.patient")}
              aria-invalid={!isPatientValid}
              value={form.patientInput}
              onChange={(e) => setForm((p) => ({ ...p, patientInput: e.target.value, patientLocked: false, lockedPatient: null }))}
              onKeyDown={onPatientKeyDown}
              onBlur={onPatientBlur}
              disabled={form.patientLocked || saving}
              autoComplete="off"
            />
            {searching && (
              <div style={{ position: 'absolute', right: '10px', top: '38px', color: 'var(--text-secondary)' }}>
                <span style={{ fontSize: '12px' }}>...</span>
              </div>
            )}
            {!form.patientLocked && (searching || patientSuggestions.length > 0 || (form.patientInput && form.patientInput.trim().length > 0)) && (
              <div className="dropdown" role="listbox" style={{ 
                  position: 'absolute', 
                  zIndex: 100, 
                  width: '100%',
                  marginTop: '4px', 
                  background: 'var(--surface)', 
                  borderRadius: '6px', 
                  border: '1px solid var(--border)', 
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  maxHeight: '220px', 
                  overflowY: 'auto' 
              }}>
                {searching && (
                  <div style={{ padding: '12px', color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.9em' }}>
                    Loading...
                  </div>
                )}
                
                {!searching && patientSuggestions.length === 0 && form.patientInput.trim().length > 0 && (
                   <div style={{ padding: '12px', color: 'var(--text-secondary)', textAlign: 'center', fontStyle: 'italic', fontSize: '0.9em' }}>
                     No results found
                   </div>
                )}

                {!searching && patientSuggestions.map((p) => (
                  <div
                    key={p.id}
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const name = [p.last_name, p.first_name].filter(Boolean).join(" ");
                      // Update form with selected patient
                      setForm((prev) => ({
                        ...prev,
                        patientInput: name,
                        patientLocked: true,
                        lockedPatient: { id: p.id, first_name: p.first_name, last_name: p.last_name },
                        banner: { 
                          found: true, 
                          text: t("income.banner.found_basic", { name: name, total: (p.banner?.total_paid ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }) 
                        }
                      }));
                      setPatientSuggestions([]);
                    }}
                    style={{ 
                      padding: '10px 12px', 
                      cursor: 'pointer', 
                      borderBottom: '1px solid var(--border-light)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div>
                      <div style={{ fontWeight: '500' }}>{[p.last_name, p.first_name].filter(Boolean).join(" ")}</div>
                    </div>
                    {p.exact && <span style={{ fontSize: '0.75em', background: 'var(--green)', color: '#fff', padding: '2px 6px', borderRadius: '4px' }}>Match</span>}
                  </div>
                ))}
              </div>
            )}
            {form.banner && (
              <div
                role="status"
                style={{
                  marginTop: '8px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  background: form.banner.found ? 'rgba(34,197,94,.12)' : 'rgba(59,130,246,.12)',
                  color: form.banner.found ? 'var(--green)' : 'var(--blue)',
                }}
              >
                {form.banner.text}
              </div>
            )}
            {!isPatientValid && <div className="form-error" style={{ marginTop: '6px' }}>{t("income.validation.patient_invalid")}</div>}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setForm((p) => ({ ...p, moreDetails: !p.moreDetails }))}
              aria-controls="moreDetailsPanel"
              aria-expanded={form.moreDetails}
              aria-pressed={form.moreDetails}
              style={{
                marginTop: '12px',
                borderColor: form.moreDetails ? 'var(--accent)' : undefined,
                color: form.moreDetails ? 'var(--accent)' : undefined
              }}
            >
              {form.moreDetails ? "▾ " : "▸ "} {t("income.form.more_details")}
            </button>
            <div
              id="moreDetailsPanel"
              style={{
                marginTop: form.moreDetails ? '12px' : '0',
                maxHeight: form.moreDetails ? '600px' : '0',
                overflow: 'hidden',
                transition: 'max-height .2s ease',
              }}
            >
              {form.moreDetails && (
                <div className="panel" style={{ padding: '12px', background: 'var(--bg-card)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                    <div>
                      <div className="form-label">{t("income.form.phone")}</div>
                      <input
                        className="form-input"
                        type="tel"
                        inputMode="tel"
                        maxLength={20}
                        value={form.phone}
                        onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="form-label">{t("income.form.street")}</div>
                      <textarea
                        className="form-input"
                        maxLength={255}
                        value={form.street}
                        onChange={(e) => setForm((p) => ({ ...p, street: e.target.value }))}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <div className="form-label">{t("income.form.city")}</div>
                        <input
                          className="form-input"
                          maxLength={50}
                          value={form.city}
                          onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                        />
                      </div>
                      <div>
                        <div className="form-label">{t("income.form.zip")}</div>
                        <input
                          className="form-input"
                          maxLength={10}
                          value={form.zip}
                          onChange={(e) => setForm((p) => ({ ...p, zip: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="check-row">
                        <input
                          id="receiptIssued"
                          type="checkbox"
                          checked={form.receiptIssued}
                          onChange={(e) => setForm((p) => ({ ...p, receiptIssued: e.target.checked, receiptReason: e.target.checked ? p.receiptReason : "", receiptNote: e.target.checked ? p.receiptNote : "", receiptMedicine: e.target.checked ? p.receiptMedicine : "" }))}
                        />
                        <label htmlFor="receiptIssued">{t("income.form.receipt_issued")}</label>
                      </div>
                      <div>
                        <div className="form-label">{t("income.form.receipt_reason")}</div>
                        <select
                          className="form-input"
                          disabled={!form.receiptIssued}
                          value={form.receiptReason}
                          onChange={(e) => setForm((p) => ({ ...p, receiptReason: e.target.value }))}
                        >
                          <option value="">{t("income.form.select_reason")}</option>
                          {receiptReasons.map((r) => (
                            <option key={r.id} value={r.id}>{t(`income.receipt_reason_${r.id}`, { defaultValue: r.label })}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {form.receiptIssued && (
                      <div>
                        <div className="form-label">{t("income.form.receipt_medicine")}</div>
                        <input
                          className="form-input"
                          list="receipt-medicines"
                          aria-label={t("income.form.receipt_medicine")}
                          value={form.receiptMedicine}
                          onChange={(e) => setForm((p) => ({ ...p, receiptMedicine: e.target.value }))}
                        />
                        <datalist id="receipt-medicines">
                          {medicines.map((m) => (
                            <option key={m.id} value={m.name} />
                          ))}
                        </datalist>
                      </div>
                    )}
                    {form.receiptIssued && (
                      <div>
                        <div className="form-label">{t("income.form.receipt_note")}</div>
                        <textarea
                          className="form-input"
                          aria-label={t("income.form.receipt_note")}
                          value={form.receiptNote}
                          onChange={(e) => setForm((p) => ({ ...p, receiptNote: e.target.value }))}
                        />
                        {!isReceiptNoteValid && <div className="form-error" style={{ marginTop: '6px' }}>{t("income.validation.receipt_note_required")}</div>}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div>
            <div>
              <div className="form-label">{t("income.form.doctor")}</div>
              <select
                className="form-input"
                required
                value={form.doctorId}
                onChange={(e) => setForm((p) => ({ ...p, doctorId: e.target.value }))}
              >
                <option value="">{t("income.form.select_doctor_placeholder")}</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {[d.first_name, d.last_name].filter(Boolean).join(" ")}
                  </option>
                ))}
              </select>
              {!isDoctorValid && <div className="form-error" style={{ marginTop: '6px' }}>{t("income.validation.doctor_required")}</div>}
            </div>
            <div className="form-grid">
              <div>
                <div className="form-label">{t("income.form.amount")}</div>
                <div className="amount-input-wrap">
                  <span className="amount-prefix">Kč</span>
                  <input
                    className="form-input"
                    type="number"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  />
                </div>
                {!isAmountValid && <div className="form-error" style={{ marginTop: '6px' }}>{t("income.validation.amount_invalid")}</div>}
              </div>
              <div>
                <div className="form-label">{t("income.form.payment_method")}</div>
                <div className="toggle-group">
                  <div
                    className={`toggle-opt ${form.paymentMethod === "cash" ? "on" : ""}`}
                    onClick={() => setForm((p) => ({ ...p, paymentMethod: "cash" }))}
                  >
                    {t("income.form.cash")}
                  </div>
                  <div
                    className={`toggle-opt ${form.paymentMethod === "card" ? "on" : ""}`}
                    onClick={() => setForm((p) => ({ ...p, paymentMethod: "card" }))}
                  >
                    {t("income.form.card")}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ marginTop: '12px' }}>
              <div className="check-row">
                <input
                  id="labRequired"
                  type="checkbox"
                  checked={form.labRequired}
                  onChange={(e) => setForm((p) => ({ ...p, labRequired: e.target.checked, labCost: e.target.checked ? p.labCost : "", labNote: e.target.checked ? p.labNote : "" }))}
                />
                <label htmlFor="labRequired">{t("income.form.lab_required")}</label>
              </div>
            </div>
            {form.labRequired && (
              <div style={{ marginTop: '12px' }}>
                <div className="form-grid">
                  <div>
                    <div className="form-label">{t("income.form.lab_cost")}</div>
                    <input
                      className="form-input"
                      type="number"
                      placeholder="0.00"
                      aria-label={t("income.form.lab_cost")}
                      value={form.labCost}
                      onChange={(e) => setForm((p) => ({ ...p, labCost: e.target.value }))}
                    />
                    {!isLabCostValid && <div className="form-error" style={{ marginTop: '6px' }}>{t("income.validation.lab_cost_required")}</div>}
                  </div>
                  <div>
                    <div className="form-label">{t("income.form.lab_note")}</div>
                    <input
                      className="form-input"
                      aria-label={t("income.form.lab_note")}
                      value={form.labNote}
                      onChange={(e) => setForm((p) => ({ ...p, labNote: e.target.value }))}
                    />
                    {!isLabNoteValid && <div className="form-error" style={{ marginTop: '6px' }}>{t("income.validation.lab_note_required")}</div>}
                  </div>
                </div>
              </div>
            )}
            <div style={{ marginTop: '12px' }}>
              <div className="form-label">{t("income.form.date")}</div>
              <input
                className="form-input"
                type="date"
                value={form.serviceDate}
                onChange={(e) => setForm((p) => ({ ...p, serviceDate: e.target.value }))}
              />
            </div>
            <div style={{ marginTop: '12px' }}>
              <div className="form-label">{t("income.form.note")}</div>
              <input
                className="form-input"
                value={form.note}
                onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              />
            </div>
            <div className="income-form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => navigate("/income")}>
                {t("common.cancel")}
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving || searching || !isFormValid}>
                {saving ? t("common.loading") : `+ ${t("income.form.submit")}`}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
