from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from flask import Blueprint, jsonify, request

from .db import get_connection, release_connection


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

