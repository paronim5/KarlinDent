from datetime import date, datetime
from typing import Any, Dict, List, Optional

import psycopg2
from flask import Blueprint, jsonify, request

from .config import config
from .db import get_connection, release_connection
from .patients import parse_patient_input


income_bp = Blueprint("income", __name__)


def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def validate_amount(value: Any) -> float:
    try:
        amount = float(value)
    except (TypeError, ValueError):
        raise ValueError("invalid_amount")
    if amount <= 0:
        raise ValueError("invalid_amount")
    return round(amount, 2)


def validate_lab_cost(value: Any, required: bool) -> float:
    if value is None or value == "":
        if required:
            raise ValueError("lab_cost_required")
        return 0.0
    try:
        amount = float(value)
    except (TypeError, ValueError):
        raise ValueError("invalid_lab_cost")
    if required and amount <= 0:
        raise ValueError("lab_cost_required")
    if amount < 0:
        raise ValueError("invalid_lab_cost")
    return round(amount, 2)


def column_exists(conn, table: str, column: str) -> bool:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = %s AND column_name = %s
        """,
        (table, column),
    )
    return cur.fetchone() is not None


def validate_payment_method(value: Any) -> str:
    if value not in ("cash", "card"):
        raise ValueError("invalid_payment_method")
    return str(value)


def ensure_patient(conn, patient_id: Optional[int], patient_data: Dict[str, Any]) -> int:
    cur = conn.cursor()
    if patient_id:
        cur.execute("SELECT id FROM patients WHERE id = %s", (patient_id,))
        row = cur.fetchone()
        if not row:
            raise ValueError("patient_not_found")
        return patient_id

    last_name = patient_data.get("last_name")
    first_name = patient_data.get("first_name")
    phone = patient_data.get("phone")
    email = patient_data.get("email")
    street_address = patient_data.get("street_address")
    city = patient_data.get("city")
    zip_code = patient_data.get("zip_code")

    if not last_name and not first_name:
        raise ValueError("invalid_patient")
    if last_name and first_name is None:
        try:
            ln, fn = parse_patient_input(last_name)
            last_name = ln
            first_name = fn
        except ValueError:
            pass
    if not last_name:
        raise ValueError("invalid_patient")

    has_address_fields = column_exists(conn, "patients", "street_address")
    if has_address_fields:
        cur.execute(
            """
            INSERT INTO patients (first_name, last_name, phone, email, street_address, city, zip_code)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (first_name, last_name, phone, email, street_address, city, zip_code),
        )
    else:
        cur.execute(
            """
            INSERT INTO patients (first_name, last_name, phone, email)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (first_name, last_name, phone, email),
        )
    row = cur.fetchone()
    return int(row[0])


@income_bp.route("/patients", methods=["GET"])
def list_patients():
    q = request.args.get("q", "").strip()

    conn = get_connection()
    try:
        cur = conn.cursor()
        if q:
            pattern = f"%{q.lower()}%"
            cur.execute(
                """
                SELECT id, first_name, last_name
                FROM patients
                WHERE LOWER(first_name) LIKE %s OR LOWER(last_name) LIKE %s
                ORDER BY last_name, first_name
                """,
                (pattern, pattern),
            )
        else:
            cur.execute(
                """
                SELECT id, first_name, last_name
                FROM patients
                ORDER BY last_name, first_name
                """
            )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    items = [
        {
            "id": row[0],
            "first_name": row[1],
            "last_name": row[2],
        }
        for row in rows
    ]

    return jsonify(items)


@income_bp.route("/records", methods=["GET"])
def list_income_records():
    today = date.today()
    start_param = request.args.get("from")
    end_param = request.args.get("to")
    payment_method_param = request.args.get("payment_method")

    start = parse_date(start_param) if start_param else today
    end = parse_date(end_param) if end_param else today
    if payment_method_param:
        try:
            payment_method_param = validate_payment_method(payment_method_param)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    conn = get_connection()
    try:
        cur = conn.cursor()
        conditions = ["ir.service_date BETWEEN %s AND %s"]
        params = [start, end]
        if payment_method_param:
            conditions.append("ir.payment_method = %s")
            params.append(payment_method_param)
        where_sql = " AND ".join(conditions)
        includes_lab_cost = column_exists(conn, "income_records", "lab_cost")
        if includes_lab_cost:
            cur.execute(
                f"""
                SELECT ir.id,
                       ir.service_date,
                       ir.amount,
                       ir.lab_cost,
                       ir.payment_method,
                       ir.note,
                       p.first_name,
                       p.last_name,
                       s.first_name,
                       s.last_name,
                       ir.salary_payment_id
                FROM income_records ir
                JOIN patients p ON p.id = ir.patient_id
                JOIN staff s ON s.id = ir.doctor_id
                WHERE {where_sql}
                ORDER BY ir.service_date DESC, ir.id DESC
                """,
                params,
            )
        else:
            cur.execute(
                f"""
                SELECT ir.id,
                       ir.service_date,
                       ir.amount,
                       ir.payment_method,
                       ir.note,
                       p.first_name,
                       p.last_name,
                       s.first_name,
                       s.last_name,
                       ir.salary_payment_id
                FROM income_records ir
                JOIN patients p ON p.id = ir.patient_id
                JOIN staff s ON s.id = ir.doctor_id
                WHERE {where_sql}
                ORDER BY ir.service_date DESC, ir.id DESC
                """,
                params,
            )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    items = []
    for row in rows:
        if includes_lab_cost:
            lab_cost = float(row[3])
            payment_method = row[4]
            note = row[5]
            patient_first_name = row[6]
            patient_last_name = row[7]
            doctor_first_name = row[8]
            doctor_last_name = row[9]
            salary_payment_id = row[10]
        else:
            lab_cost = 0.0
            payment_method = row[3]
            note = row[4]
            patient_first_name = row[5]
            patient_last_name = row[6]
            doctor_first_name = row[7]
            doctor_last_name = row[8]
            salary_payment_id = row[9]
        items.append(
            {
                "id": row[0],
                "service_date": row[1].isoformat(),
                "amount": float(row[2]),
                "lab_cost": lab_cost,
                "payment_method": payment_method,
                "note": note,
                "patient": {
                    "first_name": patient_first_name,
                    "last_name": patient_last_name,
                },
                "doctor": {
                    "first_name": doctor_first_name,
                    "last_name": doctor_last_name,
                },
                "salary_payment_id": salary_payment_id,
                "is_paid": salary_payment_id is not None
            }
        )

    return jsonify(items)


@income_bp.route("/records/<int:record_id>", methods=["GET"])
def get_income_record(record_id: int):
    conn = get_connection()
    try:
        cur = conn.cursor()
        
        includes_lab_cost = column_exists(conn, "income_records", "lab_cost")
        
        columns = [
            "ir.id", "ir.amount", "ir.payment_method", "ir.service_date", "ir.note",
            "ir.doctor_id", "ir.patient_id",
            "p.first_name", "p.last_name", "p.phone", "p.street_address", "p.city", "p.zip_code",
            "ir.salary_payment_id"
        ]
        if includes_lab_cost:
            columns.append("ir.lab_cost")
        
        query = f"""
            SELECT {", ".join(columns)}
            FROM income_records ir
            JOIN patients p ON p.id = ir.patient_id
            WHERE ir.id = %s
        """
        
        cur.execute(query, (record_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "not_found"}), 404
            
        item = {
            "id": row[0],
            "amount": float(row[1]),
            "payment_method": row[2],
            "service_date": row[3].isoformat(),
            "note": row[4],
            "doctor_id": row[5],
            "patient_id": row[6],
            "patient": {
                "id": row[6],
                "first_name": row[7],
                "last_name": row[8],
                "phone": row[9],
                "street_address": row[10],
                "city": row[11],
                "zip_code": row[12]
            },
            "salary_payment_id": row[13],
            "is_paid": row[13] is not None
        }
        
        if includes_lab_cost:
            item["lab_cost"] = float(row[14])
        else:
            item["lab_cost"] = 0.0
            
        return jsonify(item)
    finally:
        release_connection(conn)


@income_bp.route("/records/<int:record_id>", methods=["DELETE"])
def delete_income_record(record_id: int):
    mode = request.args.get("mode", "delete_only") # delete_only, adjust_next, ignore

    conn = get_connection()
    try:
        cur = conn.cursor()
        
        includes_lab_cost = column_exists(conn, "income_records", "lab_cost")
        if includes_lab_cost:
             cur.execute("SELECT amount, doctor_id, salary_payment_id, lab_cost FROM income_records WHERE id = %s", (record_id,))
        else:
             cur.execute("SELECT amount, doctor_id, salary_payment_id, 0 FROM income_records WHERE id = %s", (record_id,))
             
        row = cur.fetchone()
        if not row:
            conn.rollback()
            return jsonify({"error": "not_found"}), 404
            
        amount = float(row[0])
        doctor_id = int(row[1])
        salary_payment_id = row[2]
        lab_cost = float(row[3] or 0)
        
        if salary_payment_id is not None:
            if mode == "delete_only":
                conn.rollback()
                return jsonify({"error": "linked_to_salary", "message": "This record is linked to a salary payment."}), 409
            
            elif mode == "adjust_next":
                 # Deduct the commission that was paid
                 try:
                    cur.execute("SELECT commission_rate FROM staff WHERE id = %s", (doctor_id,))
                    rate = float(cur.fetchone()[0] or 0)
                 except:
                    rate = 0.0
                 
                 commission_paid = (amount * rate) - lab_cost
                 adjustment = -commission_paid
                 
                 cur.execute(
                     """
                     INSERT INTO salary_adjustments (staff_id, amount, reason)
                     VALUES (%s, %s, %s)
                     """,
                     (doctor_id, adjustment, f"Reversal of paid income #{record_id}")
                 )
            # elif mode == "ignore": just delete
            
        cur.execute("DELETE FROM income_records WHERE id = %s", (record_id,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"status": "ok"}), 200


@income_bp.route("/records/<int:record_id>", methods=["PUT"])
def update_income_record(record_id: int):
    data = request.get_json(silent=True) or {}
    
    try:
        amount = validate_amount(data.get("amount"))
        payment_method = validate_payment_method(data.get("payment_method"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    service_date_param = data.get("service_date")
    service_date = (
        parse_date(service_date_param) if service_date_param else date.today()
    )
    note = (data.get("note") or "").strip()
    
    salary_modification_mode = data.get("salary_modification_mode", "ignore") # ignore, adjust_next

    conn = get_connection()
    try:
        cur = conn.cursor()
        
        includes_lab_cost = column_exists(conn, "income_records", "lab_cost")
        
        if includes_lab_cost:
             cur.execute("SELECT amount, doctor_id, salary_payment_id, lab_cost FROM income_records WHERE id = %s", (record_id,))
        else:
             cur.execute("SELECT amount, doctor_id, salary_payment_id, 0 FROM income_records WHERE id = %s", (record_id,))

        old_row = cur.fetchone()
        if not old_row:
             conn.rollback()
             return jsonify({"error": "not_found"}), 404
             
        old_amount = float(old_row[0])
        doctor_id = int(old_row[1])
        salary_payment_id = old_row[2]
        old_lab_cost = float(old_row[3] or 0)
        
        lab_cost = old_lab_cost
        if includes_lab_cost:
             lab_required = bool(data.get("lab_required"))
             try:
                 lab_cost = validate_lab_cost(data.get("lab_cost"), lab_required)
             except ValueError as exc:
                 return jsonify({"error": str(exc)}), 400

        # Update record
        if includes_lab_cost:
            cur.execute(
                """
                UPDATE income_records
                SET amount = %s,
                    lab_cost = %s,
                    payment_method = %s,
                    service_date = %s,
                    note = %s
                WHERE id = %s
                """,
                (amount, lab_cost, payment_method, service_date, note, record_id)
            )
        else:
             cur.execute(
                """
                UPDATE income_records
                SET amount = %s,
                    payment_method = %s,
                    service_date = %s,
                    note = %s
                WHERE id = %s
                """,
                (amount, payment_method, service_date, note, record_id)
            )
            
        # Post-Salary Logic
        if salary_payment_id is not None:
             if salary_modification_mode == "adjust_next":
                 try:
                    cur.execute("SELECT commission_rate FROM staff WHERE id = %s", (doctor_id,))
                    rate = float(cur.fetchone()[0] or 0)
                 except:
                    rate = 0.0
                 
                 old_commission = (old_amount * rate) - old_lab_cost
                 new_commission = (amount * rate) - lab_cost
                 diff = new_commission - old_commission
                 
                 if abs(diff) > 0.001:
                     cur.execute(
                         """
                         INSERT INTO salary_adjustments (staff_id, amount, reason)
                         VALUES (%s, %s, %s)
                         """,
                         (doctor_id, diff, f"Correction for paid income #{record_id}")
                     )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"status": "ok"})


@income_bp.route("/records", methods=["POST"])
def create_income_record():
    data = request.get_json(silent=True) or {}

    doctor_id = data.get("doctor_id")
    if not doctor_id:
        return jsonify({"error": "invalid_doctor"}), 400

    receipt_issued = bool(data.get("receipt_issued"))
    receipt_reason = (data.get("receipt_reason") or "").strip()
    receipt_note = (data.get("receipt_note") or "").strip()
    receipt_medicine = (data.get("receipt_medicine") or "").strip()
    lab_required = bool(data.get("lab_required"))
    lab_note = (data.get("lab_note") or "").strip()

    try:
        amount = validate_amount(data.get("amount"))
        lab_cost = validate_lab_cost(data.get("lab_cost"), lab_required)
        payment_method = validate_payment_method(data.get("payment_method"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    service_date_param = data.get("service_date")
    service_date = (
        parse_date(service_date_param) if service_date_param else date.today()
    )
    note = (data.get("note") or "").strip()
    if receipt_issued and not receipt_note:
        return jsonify({"error": "receipt_note_required"}), 400
    if lab_required and not lab_note:
        return jsonify({"error": "lab_note_required"}), 400
    note_parts = []
    if note:
        note_parts.append(note)
    if receipt_issued:
        receipt_parts = ["receipt"]
        if receipt_reason:
            receipt_parts.append(f"reason={receipt_reason}")
        if receipt_medicine:
            receipt_parts.append(f"medicine={receipt_medicine}")
        if receipt_note:
            receipt_parts.append(f"note={receipt_note}")
        note_parts.append("; ".join(receipt_parts))
    if lab_required:
        note_parts.append(f"lab_note={lab_note}")
    note = " | ".join(note_parts) if note_parts else None

    patient_id = data.get("patient_id")
    patient_data = data.get("patient", {})

    conn = get_connection()
    try:
        cur = conn.cursor()

        try:
            cur.execute(
                """
                SELECT s.id, s.commission_rate
                FROM staff s
                JOIN staff_roles r ON r.id = s.role_id
                WHERE s.id = %s AND r.name = 'doctor' AND s.is_active = TRUE
                """,
                (doctor_id,),
            )
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()
            cur.execute(
                """
                SELECT s.id, 0 AS commission_rate
                FROM staff s
                JOIN staff_roles r ON r.id = s.role_id
                WHERE s.id = %s AND r.name = 'doctor' AND s.is_active = TRUE
                """,
                (doctor_id,),
            )
        doctor_row = cur.fetchone()
        if not doctor_row:
            return jsonify({"error": "invalid_doctor"}), 400
        doctor_commission_rate = float(doctor_row[1] or 0)

        try:
            resolved_patient_id = ensure_patient(conn, patient_id, patient_data)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        includes_lab_cost = column_exists(conn, "income_records", "lab_cost")
        if includes_lab_cost:
            cur.execute(
                """
                INSERT INTO income_records
                    (patient_id, doctor_id, amount, lab_cost, payment_method, service_date, note)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    resolved_patient_id,
                    doctor_id,
                    amount,
                    lab_cost,
                    payment_method,
                    service_date,
                    note,
                ),
            )
        else:
            cur.execute(
                """
                INSERT INTO income_records
                    (patient_id, doctor_id, amount, payment_method, service_date, note)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    resolved_patient_id,
                    doctor_id,
                    amount,
                    payment_method,
                    service_date,
                    note,
                ),
            )
        row = cur.fetchone()

        income_id = int(row[0])
        
        # NOTE: Salary payment is now deferred. 
        # We rely on staff.total_revenue (updated via trigger) and 
        # later we will process unpaid income_records in staff.pay_salary.

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"id": int(row[0])}), 201


@income_bp.route("/stats/doctors-by-patient", methods=["GET"])
def doctor_stats_by_patient():
    patient_last_name = request.args.get("patient_last_name", "").strip().lower()
    if not patient_last_name:
        return jsonify({"error": "invalid_patient_last_name"}), 400

    today = date.today()
    start_param = request.args.get("from")
    end_param = request.args.get("to")

    start = parse_date(start_param) if start_param else None
    end = parse_date(end_param) if end_param else today

    conn = get_connection()
    try:
        cur1 = conn.cursor()
        params1 = []
        conditions = ["r.name = 'doctor'", "LOWER(p.last_name) LIKE %s"]
        params1.append(f"%{patient_last_name}%")
        if start:
            conditions.append("ir.service_date >= %s")
            params1.append(start)
        if end:
            conditions.append("ir.service_date <= %s")
            params1.append(end)
        where_sql = " AND ".join(conditions)
        cur1.execute(
            f"""
            SELECT s.id,
                   s.first_name,
                   s.last_name,
                   p.id,
                   p.first_name,
                   p.last_name,
                   SUM(ir.amount) AS total_income,
                   SUM(ir.amount * s.commission_rate) AS total_commission,
                   COUNT(ir.id) AS visit_count
            FROM income_records ir
            JOIN patients p ON p.id = ir.patient_id
            JOIN staff s ON s.id = ir.doctor_id
            JOIN staff_roles r ON r.id = s.role_id
            WHERE {where_sql}
            GROUP BY s.id,
                     s.first_name,
                     s.last_name,
                     p.id,
                     p.first_name,
                     p.last_name
            ORDER BY s.last_name, s.first_name, p.last_name, p.first_name
            """,
            params1,
        )
        rows_patient = cur1.fetchall()

        doctor_map: Dict[int, Dict[str, Any]] = {}
        for row in rows_patient:
            doctor_id = int(row[0])
            if doctor_id not in doctor_map:
                doctor_map[doctor_id] = {
                    "id": doctor_id,
                    "first_name": row[1],
                    "last_name": row[2],
                    "patients": [],
                    "patient_count": 0,
                    "visit_count": 0,
                    "total_income": 0.0,
                    "total_commission": 0.0,
                    "monthly": [],
                    "yearly": [],
                    "avg_commission_per_patient": 0.0,
                }
            doctor = doctor_map[doctor_id]
            patient_income = float(row[6] or 0)
            patient_commission = float(row[7] or 0)
            visits = int(row[8] or 0)
            doctor["patients"].append(
                {
                    "id": int(row[3]),
                    "first_name": row[4],
                    "last_name": row[5],
                    "total_income": round(patient_income, 2),
                    "total_commission": round(patient_commission, 2),
                }
            )
            doctor["patient_count"] += 1
            doctor["total_income"] += patient_income
            doctor["total_commission"] += patient_commission
            doctor["visit_count"] += visits

        if not doctor_map:
            return jsonify(
                {
                    "filters": {
                        "patient_last_name": patient_last_name,
                        "from": start.isoformat() if start else None,
                        "to": end.isoformat() if end else None,
                    },
                    "doctors": [],
                }
            )

        cur2 = conn.cursor()
        params2 = []
        conditions2 = ["r.name = 'doctor'", "LOWER(p.last_name) LIKE %s"]
        params2.append(f"%{patient_last_name}%")
        if start:
            conditions2.append("ir.service_date >= %s")
            params2.append(start)
        if end:
            conditions2.append("ir.service_date <= %s")
            params2.append(end)
        where_sql2 = " AND ".join(conditions2)
        cur2.execute(
            f"""
            SELECT s.id,
                   DATE_TRUNC('month', ir.service_date)::DATE AS month,
                   SUM(ir.amount) AS total_income,
                   SUM(ir.amount * s.commission_rate) AS total_commission
            FROM income_records ir
            JOIN patients p ON p.id = ir.patient_id
            JOIN staff s ON s.id = ir.doctor_id
            JOIN staff_roles r ON r.id = s.role_id
            WHERE {where_sql2}
            GROUP BY s.id, DATE_TRUNC('month', ir.service_date)
            ORDER BY month, s.last_name, s.first_name
            """,
            params2,
        )
        rows_monthly = cur2.fetchall()

        for row in rows_monthly:
            doctor_id = int(row[0])
            if doctor_id not in doctor_map:
                continue
            month_income = float(row[2] or 0)
            month_commission = float(row[3] or 0)
            doctor_map[doctor_id]["monthly"].append(
                {
                    "month": row[1].isoformat(),
                    "total_income": round(month_income, 2),
                    "total_commission": round(month_commission, 2),
                }
            )

        cur3 = conn.cursor()
        params3 = []
        conditions3 = ["r.name = 'doctor'", "LOWER(p.last_name) LIKE %s"]
        params3.append(f"%{patient_last_name}%")
        if start:
            conditions3.append("ir.service_date >= %s")
            params3.append(start)
        if end:
            conditions3.append("ir.service_date <= %s")
            params3.append(end)
        where_sql3 = " AND ".join(conditions3)
        cur3.execute(
            f"""
            SELECT s.id,
                   DATE_TRUNC('year', ir.service_date)::DATE AS year,
                   SUM(ir.amount) AS total_income,
                   SUM(ir.amount * s.commission_rate) AS total_commission
            FROM income_records ir
            JOIN patients p ON p.id = ir.patient_id
            JOIN staff s ON s.id = ir.doctor_id
            JOIN staff_roles r ON r.id = s.role_id
            WHERE {where_sql3}
            GROUP BY s.id, DATE_TRUNC('year', ir.service_date)
            ORDER BY year, s.last_name, s.first_name
            """,
            params3,
        )
        rows_yearly = cur3.fetchall()

        for row in rows_yearly:
            doctor_id = int(row[0])
            if doctor_id not in doctor_map:
                continue
            year_income = float(row[2] or 0)
            year_commission = float(row[3] or 0)
            doctor_map[doctor_id]["yearly"].append(
                {
                    "year": row[1].isoformat(),
                    "total_income": round(year_income, 2),
                    "total_commission": round(year_commission, 2),
                }
            )

        doctors = []
        for doctor in doctor_map.values():
            total_income = doctor["total_income"]
            total_commission = doctor["total_commission"]
            patient_count = doctor["patient_count"]
            doctor["total_income"] = round(total_income, 2)
            doctor["total_commission"] = round(total_commission, 2)
            if patient_count > 0:
                doctor["avg_commission_per_patient"] = round(
                    total_commission / patient_count, 2
                )
            doctors.append(doctor)
    finally:
        release_connection(conn)

    doctors.sort(key=lambda d: (d["last_name"], d["first_name"]))

    return jsonify(
        {
            "filters": {
                "patient_last_name": patient_last_name,
                "from": start.isoformat() if start else None,
                "to": end.isoformat() if end else None,
            },
            "doctors": doctors,
        }
    )


@income_bp.route("/summary/daily", methods=["GET"])
def daily_summary():
    today = date.today()
    start_param = request.args.get("from")
    end_param = request.args.get("to")
    payment_method_param = request.args.get("payment_method")

    start = parse_date(start_param) if start_param else today.replace(day=1)
    end = parse_date(end_param) if end_param else today
    if payment_method_param:
        try:
            payment_method_param = validate_payment_method(payment_method_param)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    conn = get_connection()
    try:
        cur = conn.cursor()
        conditions = ["service_date BETWEEN %s AND %s"]
        params = [start, end]
        if payment_method_param:
            conditions.append("payment_method = %s")
            params.append(payment_method_param)
        where_sql = " AND ".join(conditions)
        cur.execute(
            f"""
            SELECT service_date, SUM(amount) AS total
            FROM income_records
            WHERE {where_sql}
            GROUP BY service_date
            ORDER BY service_date
            """,
            params,
        )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    items = [
        {"day": row[0].isoformat(), "total_income": float(row[1])} for row in rows
    ]

    return jsonify(items)


@income_bp.route("/summary/monthly", methods=["GET"])
def monthly_summary():
    payment_method_param = request.args.get("payment_method")
    if payment_method_param:
        try:
            payment_method_param = validate_payment_method(payment_method_param)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
    conn = get_connection()
    try:
        cur = conn.cursor()
        where_sql = ""
        params = []
        if payment_method_param:
            where_sql = "WHERE payment_method = %s"
            params.append(payment_method_param)
        cur.execute(
            f"""
            SELECT DATE_TRUNC('month', service_date)::DATE AS month, SUM(amount) AS total
            FROM income_records
            {where_sql}
            GROUP BY DATE_TRUNC('month', service_date)
            ORDER BY month
            """,
            params,
        )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    items = [
        {"month": row[0].isoformat(), "total_income": float(row[1])} for row in rows
    ]

    return jsonify(items)


@income_bp.route("/summary/total", methods=["GET"])
def total_summary():
    today = date.today()
    start_param = request.args.get("from")
    end_param = request.args.get("to")
    payment_method_param = request.args.get("payment_method")

    start = parse_date(start_param) if start_param else today.replace(day=1)
    end = parse_date(end_param) if end_param else today
    if payment_method_param:
        try:
            payment_method_param = validate_payment_method(payment_method_param)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    conn = get_connection()
    try:
        cur = conn.cursor()
        if payment_method_param:
            cur.execute(
                """
                SELECT COALESCE(SUM(amount), 0)
                FROM income_records
                WHERE service_date BETWEEN %s AND %s
                  AND payment_method = %s
                """,
                (start, end, payment_method_param),
            )
            total = float(cur.fetchone()[0] or 0)
            return jsonify({"total_income": round(total, 2)})
        else:
            cur.execute(
                """
                SELECT
                  COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount END), 0) AS cash_total,
                  COALESCE(SUM(CASE WHEN payment_method = 'card' THEN amount END), 0) AS card_total
                FROM income_records
                WHERE service_date BETWEEN %s AND %s
                """,
                (start, end),
            )
            row = cur.fetchone()
            cash_total = float(row[0] or 0)
            card_total = float(row[1] or 0)
            return jsonify(
                {
                    "total_income": round(cash_total + card_total, 2),
                    "by_method": {
                        "cash": round(cash_total, 2),
                        "card": round(card_total, 2),
                    },
                }
            )
    finally:
        release_connection(conn)


@income_bp.route("/doctor/<int:doctor_id>/overview", methods=["GET"])
def doctor_overview(doctor_id: int):
    today = date.today()
    conn = get_connection()
    try:
        cur = conn.cursor()
        try:
            cur.execute(
                """
                SELECT s.id, s.first_name, s.last_name, s.commission_rate
                FROM staff s
                JOIN staff_roles r ON r.id = s.role_id
                WHERE s.id = %s AND r.name = 'doctor' AND s.is_active = TRUE
                """,
                (doctor_id,),
            )
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()
            cur.execute(
                f"""
                SELECT s.id, s.first_name, s.last_name, {config.DOCTOR_COMMISSION_RATE} AS commission_rate
                FROM staff s
                JOIN staff_roles r ON r.id = s.role_id
                WHERE s.id = %s AND r.name = 'doctor' AND s.is_active = TRUE
                """,
                (doctor_id,),
            )
        doc = cur.fetchone()
        if not doc:
            return jsonify({"error": "invalid_doctor"}), 400
        commission_rate = float(doc[3] or 0)

        try:
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(ir.amount), 0) AS total_income,
                    COALESCE(SUM(ir.amount * s.commission_rate), 0) AS total_commission,
                    COUNT(ir.id) AS visit_count,
                    COUNT(DISTINCT ir.patient_id) AS patient_count
                FROM income_records ir
                JOIN staff s ON s.id = ir.doctor_id
                WHERE ir.doctor_id = %s
                """,
                (doctor_id,),
            )
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(ir.amount), 0) AS total_income,
                    COALESCE(SUM(ir.amount) * %s, 0) AS total_commission,
                    COUNT(ir.id) AS visit_count,
                    COUNT(DISTINCT ir.patient_id) AS patient_count
                FROM income_records ir
                WHERE ir.doctor_id = %s
                """,
                (config.DOCTOR_COMMISSION_RATE, doctor_id),
            )
        life = cur.fetchone()

        try:
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(ir.amount), 0) AS total_income,
                    COALESCE(SUM(ir.amount * s.commission_rate), 0) AS total_commission,
                    COUNT(ir.id) AS visit_count,
                    COUNT(DISTINCT ir.patient_id) AS patient_count
                FROM income_records ir
                JOIN staff s ON s.id = ir.doctor_id
                WHERE ir.doctor_id = %s AND ir.service_date = %s
                """,
                (doctor_id, today),
            )
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(ir.amount), 0) AS total_income,
                    COALESCE(SUM(ir.amount) * %s, 0) AS total_commission,
                    COUNT(ir.id) AS visit_count,
                    COUNT(DISTINCT ir.patient_id) AS patient_count
                FROM income_records ir
                WHERE ir.doctor_id = %s AND ir.service_date = %s
                """,
                (config.DOCTOR_COMMISSION_RATE, doctor_id, today),
            )
        today_row = cur.fetchone()
    finally:
        release_connection(conn)

    overview = {
        "doctor": {"id": int(doc[0]), "first_name": doc[1], "last_name": doc[2]},
        "commission_rate": commission_rate,
        "lifetime": {
            "total_income": round(float(life[0] or 0), 2),
            "total_commission": round(float(life[1] or 0), 2),
            "visit_count": int(life[2] or 0),
            "patient_count": int(life[3] or 0),
            "avg_commission_per_patient": round(
                (float(life[1] or 0) / (int(life[3] or 0) or 1)), 2
            ),
        },
        "today": {
            "total_income": round(float(today_row[0] or 0), 2),
            "total_commission": round(float(today_row[1] or 0), 2),
            "visit_count": int(today_row[2] or 0),
            "patient_count": int(today_row[3] or 0),
        },
    }

    return jsonify(overview)


@income_bp.route("/doctor/<int:doctor_id>/summary/daily", methods=["GET"])
def doctor_daily_summary(doctor_id: int):
    today = date.today()
    start_param = request.args.get("from")
    end_param = request.args.get("to")

    start = parse_date(start_param) if start_param else today.replace(day=max(1, today.day - 29))
    end = parse_date(end_param) if end_param else today

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT s.id
            FROM staff s
            JOIN staff_roles r ON r.id = s.role_id
            WHERE s.id = %s AND r.name = 'doctor' AND s.is_active = TRUE
            """,
            (doctor_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "invalid_doctor"}), 400

        try:
            cur.execute(
                """
                SELECT ir.service_date,
                       SUM(ir.amount) AS total_income,
                       SUM(ir.amount * s.commission_rate) AS total_commission
                FROM income_records ir
                JOIN staff s ON s.id = ir.doctor_id
                WHERE ir.doctor_id = %s AND ir.service_date BETWEEN %s AND %s
                GROUP BY ir.service_date
                ORDER BY ir.service_date
                """,
                (doctor_id, start, end),
            )
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()
            cur.execute(
                """
                SELECT ir.service_date,
                       SUM(ir.amount) AS total_income,
                       SUM(ir.amount) * %s AS total_commission
                FROM income_records ir
                WHERE ir.doctor_id = %s AND ir.service_date BETWEEN %s AND %s
                GROUP BY ir.service_date
                ORDER BY ir.service_date
                """,
                (config.DOCTOR_COMMISSION_RATE, doctor_id, start, end),
            )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    items = [
        {
            "day": r[0].isoformat(),
            "total_income": round(float(r[1] or 0), 2),
            "total_commission": round(float(r[2] or 0), 2),
        }
        for r in rows
    ]

    return jsonify(items)


@income_bp.route("/doctor/<int:doctor_id>/summary/monthly", methods=["GET"])
def doctor_monthly_summary(doctor_id: int):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT s.id
            FROM staff s
            JOIN staff_roles r ON r.id = s.role_id
            WHERE s.id = %s AND r.name = 'doctor' AND s.is_active = TRUE
            """,
            (doctor_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "invalid_doctor"}), 400

        try:
            cur.execute(
                """
                SELECT DATE_TRUNC('month', ir.service_date)::DATE AS month,
                       SUM(ir.amount) AS total_income,
                       SUM(ir.amount * s.commission_rate) AS total_commission
                FROM income_records ir
                JOIN staff s ON s.id = ir.doctor_id
                WHERE ir.doctor_id = %s
                GROUP BY DATE_TRUNC('month', ir.service_date)
                ORDER BY month
                """,
                (doctor_id,),
            )
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()
            cur.execute(
                """
                SELECT DATE_TRUNC('month', ir.service_date)::DATE AS month,
                       SUM(ir.amount) AS total_income,
                       SUM(ir.amount) * %s AS total_commission
                FROM income_records ir
                WHERE ir.doctor_id = %s
                GROUP BY DATE_TRUNC('month', ir.service_date)
                ORDER BY month
                """,
                (config.DOCTOR_COMMISSION_RATE, doctor_id),
            )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    items = [
        {
            "month": r[0].isoformat(),
            "total_income": round(float(r[1] or 0), 2),
            "total_commission": round(float(r[2] or 0), 2),
        }
        for r in rows
    ]

    return jsonify(items)
