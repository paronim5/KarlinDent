from datetime import date, datetime, timezone
import io
import logging
from typing import Any, Dict, List, Optional, Tuple

from flask import Blueprint, jsonify, request, send_file

from .db import get_connection, release_connection

logger = logging.getLogger(__name__)


patients_bp = Blueprint("patients", __name__)


def _sanitize_name_part(value: Optional[str], required: bool, min_len: int) -> Optional[str]:
    if value is None:
        return None
    v = " ".join(value.strip().split())
    if v == "":
        return None
    if required and len(v) < min_len:
        raise ValueError("invalid_name")
    if len(v) > 50:
        raise ValueError("invalid_name")
    for ch in v:
        if ch.isalpha() or ch in [" ", "-", "'"]:
            continue
        raise ValueError("invalid_name")
    return v


def parse_patient_input(raw: str) -> Tuple[str, Optional[str]]:
    text = " ".join((raw or "").strip().split())
    if not text or len(text) < 2 or len(text) > 101:
        raise ValueError("invalid_patient")
    if " " in text:
        parts = text.split(" ", 1)
        last_name = _sanitize_name_part(parts[0], True, 2)
        first_name = _sanitize_name_part(parts[1], False, 1)
    else:
        last_name = _sanitize_name_part(text, True, 2)
        first_name = None
    if not last_name:
        raise ValueError("invalid_patient")
    return last_name, first_name


@patients_bp.route("/search", methods=["GET"])
def search_patients():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])

    # Allow searching by ID if the query is purely numeric
    search_id = None
    if q.isdigit():
        search_id = int(q)

    # Prepare search terms for name search
    # We split the query into parts to handle "First Last" or "Last First"
    parts = q.split()
    term1 = parts[0] if parts else ""
    term2 = " ".join(parts[1:]) if len(parts) > 1 else ""

    conn = get_connection()
    try:
        cur = conn.cursor()
        
        # Base query selects patients matching ID, or name combinations
        # We rank results: 
        # 0 = Exact ID match
        # 1 = Exact Last Name match
        # 2 = Exact First Name match
        # 3 = Partial matches
        
        sql = """
            SELECT p.id, p.first_name, p.last_name,
                   CASE
                     WHEN p.id = %s THEN 0
                     WHEN LOWER(p.last_name) = LOWER(%s) THEN 1
                     WHEN LOWER(p.first_name) = LOWER(%s) THEN 2
                     ELSE 3
                   END AS rank_score
            FROM patients p
            WHERE 
        """
        
        params = [search_id, q, q]
        conditions = []

        # 1. ID Match
        if search_id is not None:
            conditions.append("p.id = %s")
            params.append(search_id)

        # 2. Name matches
        # We search for:
        # - Last name LIKE term1%
        # - First name LIKE term1%
        # - (Last name LIKE term1% AND First name LIKE term2%)
        # - (First name LIKE term1% AND Last name LIKE term2%)
        
        name_condition = """
            (LOWER(p.last_name) LIKE LOWER(%s) OR LOWER(p.first_name) LIKE LOWER(%s))
        """
        params.extend([f"%{q}%", f"%{q}%"])
        
        if term2:
            name_condition += """
                OR (LOWER(p.last_name) LIKE LOWER(%s) AND LOWER(p.first_name) LIKE LOWER(%s))
                OR (LOWER(p.first_name) LIKE LOWER(%s) AND LOWER(p.last_name) LIKE LOWER(%s))
            """
            params.extend([f"%{term1}%", f"%{term2}%", f"%{term1}%", f"%{term2}%"])

        conditions.append(name_condition)

        sql += "(" + " OR ".join(conditions) + ")"
        sql += " ORDER BY rank_score ASC, p.last_name, p.first_name LIMIT 10"

        cur.execute(sql, params)
        rows = cur.fetchall()
        
        results: List[Dict[str, Any]] = []
        for r in rows:
            pid = int(r[0])
            fn = r[1]
            ln = r[2]
            score = int(r[3])
            
            # Determine if this is an "exact" match for auto-selection logic
            # We consider it exact if ID matches or if the full name matches the query exactly
            full_name = f"{ln} {fn}" if fn else ln
            rev_name = f"{fn} {ln}" if fn else ln
            is_exact = (
                score == 0 or 
                score == 1 or 
                full_name.lower() == q.lower() or 
                rev_name.lower() == q.lower()
            )
            
            results.append({
                "id": pid,
                "first_name": fn,
                "last_name": ln,
                "exact": is_exact
            })

        # Enrich the top result (or exact match) with financial banner info
        if results:
             top = results[0]
             # If we have an exact match or just the top result, fetch stats
             # fetching stats for ALL results is expensive, so we only do it for the top one
             # to support the "banner" feature which typically shows info for the best match.
             
             pid = top["id"]
             cur.execute(
                "SELECT COALESCE(SUM(amount), 0) FROM income_records WHERE patient_id = %s",
                (pid,)
             )
             total_paid = float(cur.fetchone()[0] or 0.0)
             
             cur.execute(
                """
                SELECT s.first_name, s.last_name, ir.service_date
                FROM income_records ir
                JOIN staff s ON s.id = ir.doctor_id
                WHERE ir.patient_id = %s
                ORDER BY ir.service_date DESC, ir.id DESC
                LIMIT 1
                """,
                (pid,)
             )
             last_row = cur.fetchone()
             last_doctor = f"{last_row[0]} {last_row[1]}" if last_row else None
             last_date = last_row[2].isoformat() if last_row and hasattr(last_row[2], "isoformat") else str(last_row[2]) if last_row else None
             
             top["banner"] = {
                 "total_paid": total_paid,
                 "last_treatment_doctor": last_doctor,
                 "last_treatment_date": last_date
             }

    finally:
        release_connection(conn)

    return jsonify(results)


@patients_bp.route("/<int:patient_id>", methods=["GET"])
def get_patient(patient_id):
    from_date = request.args.get("from")
    to_date = request.args.get("to")

    conn = get_connection()
    try:
        cur = conn.cursor()

        cur.execute("SELECT id, first_name, last_name FROM patients WHERE id = %s", (patient_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "not_found"}), 404
        patient = {"id": row[0], "first_name": row[1], "last_name": row[2]}

        # Overall stats (always full history)
        cur.execute("""
            SELECT COALESCE(SUM(amount), 0), COUNT(*), COALESCE(AVG(amount), 0),
                   MAX(service_date), COALESCE(SUM(lab_cost), 0)
            FROM income_records WHERE patient_id = %s
        """, (patient_id,))
        s = cur.fetchone()
        stats = {
            "total_paid": float(s[0]),
            "visit_count": int(s[1]),
            "avg_per_visit": round(float(s[2]), 2),
            "last_visit": s[3].isoformat() if s[3] and hasattr(s[3], "isoformat") else None,
            "total_lab_cost": float(s[4]),
        }

        # Records (with optional date filter)
        r_params = [patient_id]
        r_filter = ""
        if from_date and to_date:
            r_filter = "AND ir.service_date BETWEEN %s AND %s"
            r_params += [from_date, to_date]
        cur.execute(f"""
            SELECT ir.id, ir.service_date, ir.amount, ir.lab_cost, ir.payment_method, ir.note,
                   s.first_name || ' ' || s.last_name
            FROM income_records ir
            JOIN staff s ON s.id = ir.doctor_id
            WHERE ir.patient_id = %s {r_filter}
            ORDER BY ir.service_date DESC, ir.id DESC
        """, r_params)
        records = []
        for r in cur.fetchall():
            records.append({
                "id": r[0],
                "service_date": r[1].isoformat() if hasattr(r[1], "isoformat") else str(r[1]),
                "amount": float(r[2]),
                "lab_cost": float(r[3] or 0),
                "payment_method": r[4],
                "note": r[5] or "",
                "doctor_name": r[6],
            })

        # Monthly spending trend (full history)
        cur.execute("""
            SELECT TO_CHAR(service_date, 'YYYY-MM'), COALESCE(SUM(amount), 0)
            FROM income_records WHERE patient_id = %s
            GROUP BY 1 ORDER BY 1
        """, (patient_id,))
        trend = [{"month": r[0], "amount": float(r[1])} for r in cur.fetchall()]

        return jsonify({"patient": patient, "stats": stats, "records": records, "trend": trend})
    finally:
        release_connection(conn)


@patients_bp.route("/receipt-reasons", methods=["GET"])
def receipt_reasons():
    items = [
        {"id": "insurance", "label": "Insurance"},
        {"id": "warranty", "label": "Warranty"},
        {"id": "customer_request", "label": "Customer Request"},
        {"id": "accounting", "label": "Accounting"},
    ]
    return jsonify(items)


@patients_bp.route("/report/pdf", methods=["GET"])
def patients_payments_report_pdf():
    today = date.today()
    from_param = request.args.get("from") or today.replace(day=1).isoformat()
    to_param = request.args.get("to") or today.isoformat()
    doctor_id_raw = request.args.get("doctor_id")
    doctor_id: Optional[int] = None
    if doctor_id_raw:
        try:
            doctor_id = int(doctor_id_raw)
        except ValueError:
            return jsonify({"error": "invalid_doctor_id"}), 400

    try:
        from_date = date.fromisoformat(from_param)
        to_date = date.fromisoformat(to_param)
    except ValueError:
        return jsonify({"error": "invalid_date_format"}), 400

    conn = get_connection()
    try:
        cur = conn.cursor()

        # Fetch doctor info when filtering by doctor
        commission_rate: float = 0.0
        base_salary: float = 0.0
        doctor_name: Optional[str] = None
        if doctor_id:
            cur.execute(
                """
                SELECT s.first_name, s.last_name, s.commission_rate, s.base_salary
                FROM staff s WHERE s.id = %s
                """,
                (doctor_id,),
            )
            dr = cur.fetchone()
            if dr:
                doctor_name = " ".join(filter(None, [dr[0], dr[1]])).strip() or None
                commission_rate = float(dr[2] or 0)
                base_salary = float(dr[3] or 0)

        doctor_filter = "AND ir.doctor_id = %s" if doctor_id else ""
        params: List[Any] = [from_date, to_date]
        if doctor_id:
            params.append(doctor_id)
        cur.execute(
            f"""
            SELECT
                p.id,
                p.first_name,
                p.last_name,
                ir.service_date,
                ir.amount,
                COALESCE(ir.lab_cost, 0) AS lab_cost,
                ir.payment_method,
                COALESCE(ir.note, '') AS note,
                COALESCE(s.first_name || ' ' || s.last_name, '—') AS doctor_name
            FROM income_records ir
            JOIN patients p ON p.id = ir.patient_id
            LEFT JOIN staff s ON s.id = ir.doctor_id
            WHERE ir.service_date BETWEEN %s AND %s {doctor_filter}
            ORDER BY p.last_name, p.first_name, ir.service_date DESC, ir.id DESC
            """,
            params,
        )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    # Group records by patient, computing per-record commission
    patients_map: Dict[int, Dict] = {}
    for row in rows:
        pid, fn, ln, svc_date, amount, lab_cost, method, note, doctor = row
        if pid not in patients_map:
            name = " ".join(filter(None, [fn, ln])).strip() or "Unknown"
            patients_map[pid] = {
                "name": name,
                "records": [],
                "total_paid": 0.0,
                "total_lab": 0.0,
                "total_commission": 0.0,
            }
        amount = float(amount or 0)
        lab_cost = float(lab_cost or 0)
        net = max(amount - lab_cost, 0.0)
        commission = round(net * commission_rate, 2)
        patients_map[pid]["records"].append({
            "date": svc_date.isoformat() if hasattr(svc_date, "isoformat") else str(svc_date),
            "amount": amount,
            "lab_cost": lab_cost,
            "net": net,
            "commission": commission,
            "method": method or "—",
            "note": note or "",
            "doctor": doctor,
        })
        patients_map[pid]["total_paid"] += amount
        patients_map[pid]["total_lab"] += lab_cost
        patients_map[pid]["total_commission"] += commission

    patients_list = list(patients_map.values())

    # Build doctor salary summary
    doctor_summary: Optional[Dict] = None
    if doctor_id:
        total_paid = sum(p["total_paid"] for p in patients_list)
        total_lab = sum(p["total_lab"] for p in patients_list)
        commission_base = max(total_paid - total_lab, 0.0)
        total_commission = round(commission_base * commission_rate, 2)
        doctor_summary = {
            "commission_rate": commission_rate,
            "base_salary": base_salary,
            "total_clinic_income": round(total_paid, 2),
            "total_lab_costs": round(total_lab, 2),
            "commission_base": round(commission_base, 2),
            "total_commission": total_commission,
            "total_salary": round(base_salary + total_commission, 2),
        }

    try:
        pdf_data = _build_patients_payments_pdf(
            patients_list, from_param, to_param,
            doctor_name=doctor_name,
            doctor_summary=doctor_summary,
        )
    except Exception as exc:
        logger.exception("Failed to generate patient payments PDF: %s", exc)
        return jsonify({"error": "pdf_generation_failed"}), 500

    prefix = f"doctor_{doctor_id}_" if doctor_id else ""
    filename = f"patient_payments_{prefix}{from_param}_{to_param}.pdf"
    return send_file(
        io.BytesIO(pdf_data),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )


def _build_patients_payments_pdf(
    patients: List[Dict],
    period_from: str,
    period_to: str,
    doctor_name: Optional[str] = None,
    doctor_summary: Optional[Dict] = None,
) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.lib.enums import TA_LEFT, TA_RIGHT
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle,
        Paragraph, Spacer, HRFlowable, KeepTogether,
    )

    def fmt(v: Any) -> str:
        return f"{float(v or 0):,.2f} CZK"

    show_commission = doctor_summary is not None
    commission_rate = float((doctor_summary or {}).get("commission_rate", 0))

    page_w, _ = A4
    content_w = page_w - 32 * mm

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm,
        topMargin=16 * mm, bottomMargin=20 * mm,
    )
    styles = getSampleStyleSheet()

    dark      = colors.HexColor("#111827")
    border_c  = colors.HexColor("#d6d8e1")
    header_bg = colors.HexColor("#1f2937")
    muted_c   = colors.HexColor("#6b7280")
    accent    = colors.HexColor("#f97316")
    green     = colors.HexColor("#16a34a")
    blue      = colors.HexColor("#2563eb")
    row_alt   = colors.HexColor("#fafafa")

    N   = ParagraphStyle("N",   parent=styles["Normal"], fontName="Helvetica",      fontSize=9,  leading=12, textColor=dark)
    B   = ParagraphStyle("B",   parent=N,                fontName="Helvetica-Bold")
    R   = ParagraphStyle("R",   parent=N,                alignment=TA_RIGHT)
    RB  = ParagraphStyle("RB",  parent=R,                fontName="Helvetica-Bold")
    TI  = ParagraphStyle("TI",  parent=styles["Title"],  fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=dark, alignment=TA_LEFT, spaceAfter=2)
    ST  = ParagraphStyle("ST",  parent=N,                fontName="Helvetica-Bold", fontSize=10, textColor=accent, spaceAfter=4)
    SE  = ParagraphStyle("SE",  parent=N,                fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=dark, spaceBefore=6, spaceAfter=4)
    MU  = ParagraphStyle("MU",  parent=N,                fontSize=8,  leading=10,  textColor=muted_c)
    TH  = ParagraphStyle("TH",  parent=N,                fontName="Helvetica-Bold", fontSize=8.5, textColor=colors.whitesmoke)
    THR = ParagraphStyle("THR", parent=TH,               alignment=TA_RIGHT)
    GN  = ParagraphStyle("GN",  parent=RB,               textColor=green)
    BL  = ParagraphStyle("BL",  parent=RB,               textColor=blue)
    AC  = ParagraphStyle("AC",  parent=RB,               textColor=accent)
    SEC = ParagraphStyle("SEC", parent=N,                fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=dark, spaceBefore=14, spaceAfter=6)

    elements = []

    # ── Document header ──
    elements.append(Paragraph("KarlinDent", ST))
    elements.append(Paragraph("Patient Payments Report", TI))
    elements.append(Spacer(1, 4))

    meta_rows: List = [[Paragraph("Period", B), Paragraph(f"{period_from}  —  {period_to}", N)]]
    if doctor_name:
        cr_pct = f"  (commission {commission_rate * 100:.0f}%)" if commission_rate else ""
        meta_rows.append([Paragraph("Doctor", B), Paragraph(f"{doctor_name}{cr_pct}", N)])
    meta_rows.append([Paragraph("Patients", B), Paragraph(str(len(patients)), N)])

    meta = Table(meta_rows, colWidths=[28 * mm, content_w - 28 * mm])
    meta.setStyle(TableStyle([
        ("LINEBELOW",     (0, 0), (-1, -1), 0.4, border_c),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(meta)
    elements.append(Spacer(1, 10))

    # Column widths — add commission column when showing doctor data
    col_date   = 22 * mm
    col_paid   = 26 * mm
    col_lab    = 26 * mm
    col_net    = 26 * mm
    col_comm   = 26 * mm if show_commission else 0
    col_method = 16 * mm
    col_doctor = content_w - col_date - col_paid - col_lab - col_net - col_comm - col_method
    col_widths = [col_date, col_paid, col_lab, col_net]
    if show_commission:
        col_widths.append(col_comm)
    col_widths += [col_method, col_doctor]

    grand_total_paid = 0.0
    grand_total_lab  = 0.0
    grand_total_comm = 0.0

    for patient in patients:
        block = []

        # Patient name bar
        name_bar = Table([[Paragraph(patient["name"], SE)]], colWidths=[content_w])
        name_bar.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), colors.HexColor("#f3f4f6")),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("BOX",           (0, 0), (-1, -1), 0.4, border_c),
        ]))
        block.append(name_bar)
        block.append(Spacer(1, 3))

        # Header row
        hdr = [Paragraph("Date", TH), Paragraph("Paid", THR), Paragraph("Lab", THR), Paragraph("Net", THR)]
        if show_commission:
            hdr.append(Paragraph(f"Commission ({commission_rate * 100:.0f}%)", THR))
        hdr += [Paragraph("Method", TH), Paragraph("Doctor", TH)]
        tdata = [hdr]

        for rec in patient["records"]:
            row = [
                Paragraph(rec["date"], N),
                Paragraph(fmt(rec["amount"]), R),
                Paragraph(fmt(rec["lab_cost"]) if rec["lab_cost"] > 0 else "—", R),
                Paragraph(fmt(rec["net"]), R),
            ]
            if show_commission:
                row.append(Paragraph(fmt(rec["commission"]), R))
            row += [Paragraph(rec["method"].capitalize(), N), Paragraph(rec["doctor"], N)]
            tdata.append(row)

        t = Table(tdata, colWidths=col_widths)
        t.setStyle(TableStyle([
            ("BACKGROUND",     (0, 0), (-1, 0),  header_bg),
            ("TEXTCOLOR",      (0, 0), (-1, 0),  colors.whitesmoke),
            ("LINEBELOW",      (0, 0), (-1, -1), 0.3, border_c),
            ("LEFTPADDING",    (0, 0), (-1, -1), 5),
            ("RIGHTPADDING",   (0, 0), (-1, -1), 5),
            ("TOPPADDING",     (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING",  (0, 0), (-1, -1), 4),
            ("VALIGN",         (0, 0), (-1, -1), "MIDDLE"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, row_alt]),
        ]))
        block.append(t)

        # Patient totals row
        total_net = max(patient["total_paid"] - patient["total_lab"], 0.0)
        tot_row_data = [
            Paragraph("Total", B),
            Paragraph(fmt(patient["total_paid"]), RB),
            Paragraph(fmt(patient["total_lab"]) if patient["total_lab"] > 0 else "—", RB),
            Paragraph(fmt(total_net), GN),
        ]
        if show_commission:
            tot_row_data.append(Paragraph(fmt(patient["total_commission"]), BL))
        tot_row_data += [Paragraph("", N), Paragraph("", N)]

        total_row = Table([tot_row_data], colWidths=col_widths)
        total_row.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), colors.HexColor("#f0fdf4")),
            ("BOX",           (0, 0), (-1, -1), 0.5, green),
            ("LEFTPADDING",   (0, 0), (-1, -1), 5),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 5),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ]))
        block.append(total_row)
        block.append(Spacer(1, 14))

        elements.append(KeepTogether(block))

        grand_total_paid += patient["total_paid"]
        grand_total_lab  += patient["total_lab"]
        grand_total_comm += patient.get("total_commission", 0.0)

    # ── Grand total row (patients) ──
    if len(patients) > 1:
        elements.append(HRFlowable(width="100%", thickness=0.6, color=border_c, spaceBefore=2, spaceAfter=6))
        grand_net = max(grand_total_paid - grand_total_lab, 0.0)
        g_data = [
            Paragraph("All Patients Total", B),
            Paragraph(fmt(grand_total_paid), AC),
            Paragraph(fmt(grand_total_lab) if grand_total_lab > 0 else "—", AC),
            Paragraph(fmt(grand_net), AC),
        ]
        if show_commission:
            g_data.append(Paragraph(fmt(grand_total_comm), AC))
        g_data += [Paragraph("", N), Paragraph("", N)]
        grand = Table([g_data], colWidths=col_widths)
        grand.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), colors.HexColor("#fff7ed")),
            ("BOX",           (0, 0), (-1, -1), 0.8, accent),
            ("LEFTPADDING",   (0, 0), (-1, -1), 6),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
            ("TOPPADDING",    (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ]))
        elements.append(grand)

    # ── Doctor salary summary block ──
    if doctor_summary:
        elements.append(Spacer(1, 16))
        elements.append(Paragraph("Doctor Salary Summary", SEC))

        ds = doctor_summary
        salary_rows = [
            [Paragraph("Total clinic income", N),      Paragraph(fmt(ds["total_clinic_income"]),  R)],
            [Paragraph("Lab costs deducted",  N),      Paragraph(f"- {fmt(ds['total_lab_costs'])}", R)],
            [Paragraph("Commission base",     N),      Paragraph(fmt(ds["commission_base"]),       R)],
            [Paragraph(f"Commission ({ds['commission_rate'] * 100:.0f}%)", N),
                                                        Paragraph(fmt(ds["total_commission"]),      R)],
        ]
        if ds["base_salary"] > 0:
            salary_rows.insert(0, [Paragraph("Base salary", N), Paragraph(fmt(ds["base_salary"]), R)])

        sal_table = Table(salary_rows, colWidths=[content_w - 50 * mm, 50 * mm])
        sal_table.setStyle(TableStyle([
            ("LINEBELOW",     (0, 0), (-1, -1), 0.3, border_c),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ]))
        elements.append(sal_table)

        # Total salary highlighted row
        total_sal_row = Table(
            [[Paragraph("Doctor salary", B), Paragraph(fmt(ds["total_salary"]), GN)]],
            colWidths=[content_w - 50 * mm, 50 * mm],
        )
        total_sal_row.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), colors.HexColor("#f0fdf4")),
            ("BOX",           (0, 0), (-1, -1), 0.8, green),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("TOPPADDING",    (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ]))
        elements.append(Spacer(1, 4))
        elements.append(total_sal_row)

    elements.append(Spacer(1, 16))
    elements.append(Paragraph(
        "This document is an official patient payments report issued by KarlinDent.",
        MU,
    ))

    def _footer(canvas, doc_ref):
        canvas.setStrokeColor(colors.HexColor("#d1d5db"))
        canvas.setLineWidth(0.4)
        canvas.line(16 * mm, 14 * mm, page_w - 16 * mm, 14 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#9ca3af"))
        canvas.drawString(16 * mm, 10 * mm, "KarlinDent")
        canvas.drawRightString(page_w - 16 * mm, 10 * mm, f"Page {doc_ref.page}")

    doc.build(elements, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()

