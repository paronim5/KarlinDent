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

    try:
        last_name, first_name = parse_patient_input(q)
    except ValueError:
        return jsonify([])

    last_lower = last_name.lower()
    first_lower = first_name.lower() if first_name else None

    conn = get_connection()
    try:
        cur = conn.cursor()
        params: List[Any] = []
        conds: List[str] = []
        conds.append("LOWER(p.last_name) LIKE %s")
        params.append(f"%{last_lower}%")
        if first_lower:
            conds.append("(p.first_name IS NULL OR LOWER(p.first_name) LIKE %s)")
            params.append(f"{first_lower}%")
        where_sql = " AND ".join(conds)
        cur.execute(
            f"""
            SELECT p.id, p.first_name, p.last_name,
                   CASE
                     WHEN LOWER(p.last_name) = %s AND (%s IS NULL AND (p.first_name IS NULL OR p.first_name = '') OR LOWER(COALESCE(p.first_name,'')) = COALESCE(%s,'')) THEN 0
                     WHEN LOWER(p.last_name) = %s THEN 1
                     WHEN LOWER(p.last_name) LIKE %s AND (%s IS NULL OR LOWER(COALESCE(p.first_name,'')) LIKE COALESCE(%s,'')) THEN 2
                     ELSE 3
                   END AS rank_score
            FROM patients p
            WHERE {where_sql}
            ORDER BY rank_score ASC, p.last_name, p.first_name NULLS LAST
            LIMIT 10
            """,
            params
            + [last_lower, first_lower, first_lower, last_lower, f"{last_lower}%", first_lower, f"{first_lower}%" if first_lower else None],
        )
        rows = cur.fetchall()
        results: List[Dict[str, Any]] = []
        top_patient_id: Optional[int] = None
        top_exact = False
        for r in rows:
            pid = int(r[0])
            fn = r[1]
            ln = r[2]
            score = int(r[3])
            exact = score == 0
            if not results:
                top_patient_id = pid
                top_exact = exact
            results.append(
                {
                    "id": pid,
                    "first_name": fn,
                    "last_name": ln,
                    "exact": exact,
                }
            )

        if top_patient_id is not None and top_exact:
            cur2 = conn.cursor()
            cur2.execute(
                """
                SELECT COALESCE(SUM(ir.amount), 0)
                FROM income_records ir
                WHERE ir.patient_id = %s
                """,
                (top_patient_id,),
            )
            total_paid = float(cur2.fetchone()[0] or 0.0)

            cur3 = conn.cursor()
            cur3.execute(
                """
                SELECT s.first_name, s.last_name, ir.service_date
                FROM income_records ir
                JOIN staff s ON s.id = ir.doctor_id
                WHERE ir.patient_id = %s
                ORDER BY ir.service_date DESC, ir.id DESC
                LIMIT 1
                """,
                (top_patient_id,),
            )
            last_doc_row = cur3.fetchone()
            last_doctor = None
            last_date = None
            if last_doc_row:
                last_doctor = f"{last_doc_row[0]} {last_doc_row[1]}".strip()
                last_date = last_doc_row[2].isoformat() if hasattr(last_doc_row[2], "isoformat") else str(last_doc_row[2])

            if results:
                results[0]["banner"] = {
                    "total_paid": round(total_paid, 2),
                    "last_treatment_doctor": last_doctor,
                    "last_treatment_date": last_date,
                }
    finally:
        release_connection(conn)

    return jsonify(results)


@patients_bp.route("/receipt-reasons", methods=["GET"])
def receipt_reasons():
    items = [
        {"id": "insurance", "label": "Insurance"},
        {"id": "warranty", "label": "Warranty"},
        {"id": "customer_request", "label": "Customer Request"},
        {"id": "accounting", "label": "Accounting"},
    ]
    return jsonify(items)

