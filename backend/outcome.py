import csv
from datetime import date, datetime
from io import StringIO
from typing import Any, Dict, List

from flask import Blueprint, Response, jsonify, request
import psycopg2

from .db import get_connection, release_connection
from .staff import pay_salary as staff_pay_salary


outcome_bp = Blueprint("outcome", __name__)


def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def validate_amount(value: Any) -> float:
    try:
        amount = float(value)
    except (TypeError, ValueError):
        raise ValueError("invalid_amount")
    if amount <= 0:
        raise ValueError("invalid_amount")
    return amount


def _evaluate_salary_withdrawal(total_earnings: float, total_withdrawn: float, requested_amount: float) -> Dict[str, Any]:
    total_earnings = float(total_earnings or 0)
    total_withdrawn = float(total_withdrawn or 0)
    requested_amount = float(requested_amount or 0)
    available = total_earnings - total_withdrawn

    if total_earnings <= 0:
        return {
            "allowed": False,
            "status": "no_earnings",
            "error_code": "no_earnings",
            "available": available
        }
    if total_withdrawn >= total_earnings:
        return {
            "allowed": False,
            "status": "salary_already_withdrawn",
            "error_code": "salary_already_withdrawn",
            "available": available
        }
    if requested_amount > available:
        return {
            "allowed": False,
            "status": "insufficient_balance",
            "error_code": "insufficient_balance",
            "available": available
        }
    processed_amount = requested_amount
    available_after = available - processed_amount
    return {
        "allowed": True,
        "status": "ok",
        "processed_amount": round(processed_amount, 2),
        "available_after": round(available_after, 2)
    }


def _parse_time(value: str):
    return datetime.strptime(value, "%H:%M").time()


def _calculate_hours(work_date: date, start_time, end_time) -> float:
    start_dt = datetime.combine(work_date, start_time)
    end_dt = datetime.combine(work_date, end_time)
    delta = end_dt - start_dt
    return round(delta.total_seconds() / 3600, 2)


@outcome_bp.route("/records", methods=["GET"])
def get_outcome_records():
    start_param = request.args.get("from")
    end_param = request.args.get("to")

    today = date.today()
    start_date = parse_date(start_param) if start_param else today.replace(day=1)
    end_date = parse_date(end_param) if end_param else today

    conn = get_connection()
    try:
        cur = conn.cursor()
        
        # Fetch outcome records
        cur.execute(
            """
            SELECT o.id, o.category_id, c.name, o.amount, o.expense_date, o.description, o.created_at
            FROM outcome_records o
            JOIN outcome_categories c ON c.id = o.category_id
            WHERE o.expense_date BETWEEN %s AND %s
            ORDER BY o.expense_date DESC, o.created_at DESC
            """,
            (start_date, end_date),
        )
        outcome_rows = cur.fetchall()
        
        # Fetch salary payments
        cur.execute(
            """
            SELECT sp.id, sp.staff_id, st.first_name, st.last_name, sp.amount, sp.payment_date, sp.note, sp.created_at
            FROM salary_payments sp
            JOIN staff st ON st.id = sp.staff_id
            WHERE sp.payment_date BETWEEN %s AND %s
            ORDER BY sp.payment_date DESC, sp.created_at DESC
            """,
            (start_date, end_date),
        )
        salary_rows = cur.fetchall()
        
    finally:
        release_connection(conn)

    records = []
    
    # Process regular outcomes
    for row in outcome_rows:
        records.append({
            "id": row[0],
            "type": "outcome",
            "category_id": row[1],
            "category_name": row[2],
            "amount": float(row[3]),
            "date": row[4].isoformat(),
            "description": row[5] or "",
            "created_at": row[6].isoformat() if row[6] else None
        })
        
    # Process salary payments
    for row in salary_rows:
        staff_name = f"{row[2]} {row[3]}"
        records.append({
            "id": row[0], # Note: IDs might collide if frontend uses them as unique keys across both types
            "unique_id": f"salary-{row[0]}", # clearer unique id
            "type": "salary",
            "category_id": -1, # Special ID for salary
            "category_name": "Salary",
            "staff_id": row[1],
            "staff_name": staff_name,
            "amount": float(row[4]),
            "date": row[5].isoformat(),
            "description": f"Salary for {staff_name}" + (f": {row[6]}" if row[6] else ""),
            "created_at": row[7].isoformat() if row[7] else None
        })

    # Sort combined list by date desc
    records.sort(key=lambda x: x["date"], reverse=True)

    return jsonify(records)


@outcome_bp.route("/records", methods=["POST"])
def add_outcome_record():
    data = request.get_json()
    if not data:
        return jsonify({"error": "no_data"}), 400

    try:
        category_id = int(data.get("category_id"))
        amount = validate_amount(data.get("amount"))
        expense_date = parse_date(data.get("date", date.today().isoformat()))
        description = data.get("description", "")
    except (ValueError, TypeError):
        return jsonify({"error": "invalid_data"}), 400

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO outcome_records (category_id, amount, expense_date, description)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (category_id, amount, expense_date, description),
        )
        new_id = cur.fetchone()[0]
        conn.commit()
    finally:
        release_connection(conn)

    return jsonify({"status": "ok", "id": new_id}), 201


@outcome_bp.route("/records/<int:record_id>", methods=["DELETE"])
def delete_outcome_record(record_id: int):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM outcome_records WHERE id = %s RETURNING id", (record_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "not_found"}), 404
        conn.commit()
    finally:
        release_connection(conn)
    return jsonify({"status": "ok"})


@outcome_bp.route("/salaries/<int:payment_id>", methods=["DELETE"])
def delete_salary_payment(payment_id: int):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM salary_payments WHERE id = %s RETURNING id", (payment_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "not_found"}), 404
        conn.commit()
    finally:
        release_connection(conn)
    return jsonify({"status": "ok"})


@outcome_bp.route("/salaries", methods=["POST"])
def add_salary_payment():
    return staff_pay_salary()


@outcome_bp.route("/categories", methods=["GET"])
def get_categories():
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, name FROM outcome_categories ORDER BY name")
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    return jsonify([{"id": row[0], "name": row[1]} for row in rows])


@outcome_bp.route("/timesheets", methods=["GET"])
def list_timesheets():
    staff_id = request.args.get("staff_id")
    if not staff_id:
        return jsonify({"error": "invalid_staff"}), 400
    start_param = request.args.get("from")
    end_param = request.args.get("to")

    today = date.today()
    start_date = parse_date(start_param) if start_param else today.replace(day=1)
    end_date = parse_date(end_param) if end_param else today

    conn = get_connection()
    try:
        _ensure_timesheets_table(conn)
        cur = conn.cursor()
        cur.execute("SELECT id FROM staff WHERE id = %s", (staff_id,))
        if not cur.fetchone():
            return jsonify({"error": "staff_not_found"}), 404
        cur.execute(
            """
            SELECT id, staff_id, work_date, start_time, end_time, hours, note
            FROM staff_timesheets
            WHERE staff_id = %s AND work_date BETWEEN %s AND %s
            ORDER BY work_date DESC, start_time DESC
            """,
            (staff_id, start_date, end_date),
        )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    items = []
    for row in rows:
        items.append(
            {
                "id": row[0],
                "staff_id": row[1],
                "work_date": row[2].isoformat(),
                "start_time": row[3].strftime("%H:%M:%S"),
                "end_time": row[4].strftime("%H:%M:%S"),
                "hours": float(row[5]),
                "note": row[6] or "",
            }
        )
    return jsonify(items)


@outcome_bp.route("/timesheets", methods=["POST"])
def create_timesheet():
    data = request.get_json(silent=True) or {}
    try:
        staff_id = int(data.get("staff_id"))
        work_date = parse_date(data.get("work_date"))
        start_time = _parse_time(data.get("start_time"))
        end_time = _parse_time(data.get("end_time"))
    except Exception:
        return jsonify({"error": "invalid_data"}), 400

    if end_time <= start_time:
        return jsonify({"error": "invalid_time_range"}), 400

    hours = _calculate_hours(work_date, start_time, end_time)

    conn = get_connection()
    try:
        _ensure_timesheets_table(conn)
        cur = conn.cursor()
        cur.execute("SELECT id FROM staff WHERE id = %s", (staff_id,))
        if not cur.fetchone():
            return jsonify({"error": "staff_not_found"}), 404
        cur.execute(
            """
            INSERT INTO staff_timesheets (staff_id, work_date, start_time, end_time, hours, note)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                staff_id,
                work_date,
                start_time,
                end_time,
                hours,
                (data.get("note") or "").strip() or None,
            ),
        )
        row = cur.fetchone()
        _log_timesheet_change(conn, row[0], staff_id, "create", None, data, staff_id)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"id": int(row[0])}), 201


@outcome_bp.route("/timesheets/<int:timesheet_id>", methods=["PUT"])
def update_timesheet(timesheet_id: int):
    data = request.get_json(silent=True) or {}
    try:
        work_date = parse_date(data.get("work_date"))
        start_time = _parse_time(data.get("start_time"))
        end_time = _parse_time(data.get("end_time"))
    except Exception:
        return jsonify({"error": "invalid_data"}), 400

    if end_time <= start_time:
        return jsonify({"error": "invalid_time_range"}), 400

    hours = _calculate_hours(work_date, start_time, end_time)

    conn = get_connection()
    try:
        _ensure_timesheets_table(conn)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT staff_id, work_date, start_time, end_time, hours, note
            FROM staff_timesheets
            WHERE id = %s
            """,
            (timesheet_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "timesheet_not_found"}), 404
        staff_id = int(row[0])
        old_data = {
            "work_date": row[1].isoformat(),
            "start_time": row[2].strftime("%H:%M:%S"),
            "end_time": row[3].strftime("%H:%M:%S"),
            "hours": float(row[4]),
            "note": row[5] or "",
        }
        cur.execute(
            """
            UPDATE staff_timesheets
            SET work_date = %s,
                start_time = %s,
                end_time = %s,
                hours = %s,
                note = %s
            WHERE id = %s
            """,
            (
                work_date,
                start_time,
                end_time,
                hours,
                (data.get("note") or "").strip() or None,
                timesheet_id,
            ),
        )
        _log_timesheet_change(conn, timesheet_id, staff_id, "update", old_data, data, staff_id)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"status": "ok"})


@outcome_bp.route("/timesheets/<int:timesheet_id>", methods=["DELETE"])
def delete_timesheet(timesheet_id: int):
    conn = get_connection()
    try:
        _ensure_timesheets_table(conn)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT staff_id, work_date, start_time, end_time, hours, note
            FROM staff_timesheets
            WHERE id = %s
            """,
            (timesheet_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "timesheet_not_found"}), 404
        staff_id = int(row[0])
        old_data = {
            "work_date": row[1].isoformat(),
            "start_time": row[2].strftime("%H:%M:%S"),
            "end_time": row[3].strftime("%H:%M:%S"),
            "hours": float(row[4]),
            "note": row[5] or "",
        }
        cur.execute("DELETE FROM staff_timesheets WHERE id = %s", (timesheet_id,))
        _log_timesheet_change(conn, timesheet_id, staff_id, "delete", old_data, None, staff_id)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"status": "ok"})


@outcome_bp.route("/timesheets/payroll", methods=["POST"])
def create_timesheet_payroll():
    data = request.get_json(silent=True) or {}
    try:
        staff_id = int(data.get("staff_id"))
        range_from = parse_date(data.get("from"))
        range_to = parse_date(data.get("to"))
    except Exception:
        return jsonify({"error": "invalid_data"}), 400

    if range_to < range_from:
        return jsonify({"error": "invalid_range"}), 400

    payment_date_raw = data.get("payment_date") or range_to.isoformat()
    try:
        payment_date = parse_date(payment_date_raw)
    except Exception:
        return jsonify({"error": "invalid_payment_date"}), 400

    conn = get_connection()
    try:
        _ensure_timesheets_table(conn)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT s.base_salary, r.name
            FROM staff s
            JOIN staff_roles r ON r.id = s.role_id
            WHERE s.id = %s
            """,
            (staff_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "staff_not_found"}), 404
        base_rate = float(row[0] or 0)
        role_name = row[1]
        if role_name == "doctor":
            return jsonify({"error": "invalid_role"}), 400

        cur.execute(
            """
            SELECT COALESCE(SUM(hours), 0)
            FROM staff_timesheets
            WHERE staff_id = %s AND work_date BETWEEN %s AND %s
            """,
            (staff_id, range_from, range_to),
        )
        total_hours = float(cur.fetchone()[0] or 0)
        if total_hours <= 0:
            return jsonify({"error": "no_hours"}), 400

        total_amount = round(total_hours * base_rate, 2)
        note = (data.get("note") or "").strip()
        if not note:
            note = f"Timesheet salary {range_from.isoformat()} to {range_to.isoformat()}"

        cur.execute(
            """
            INSERT INTO salary_payments (staff_id, amount, payment_date, note)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (staff_id, total_amount, payment_date, note),
        )
        payment_id = cur.fetchone()[0]

        try:
            cur.execute(
                """
                DELETE FROM staff_timesheets
                WHERE staff_id = %s AND work_date BETWEEN %s AND %s
                """,
                (staff_id, range_from, range_to),
            )
        except psycopg2.errors.UndefinedTable:
            conn.rollback()
            cur = conn.cursor()
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"id": int(payment_id), "amount": total_amount, "hours": total_hours}), 201

# Keep existing helper functions...
def _ensure_timesheets_table(conn) -> None:
    cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM staff_timesheets LIMIT 1")
    except Exception:
        conn.rollback()
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS staff_timesheets (
                id SERIAL PRIMARY KEY,
                staff_id INTEGER NOT NULL REFERENCES staff(id),
                work_date DATE NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                hours NUMERIC(6,2) NOT NULL DEFAULT 0,
                note TEXT
            )
            """
        )
        conn.commit()


def _ensure_timesheets_audit_table(conn) -> None:
    cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM timesheets_audit LIMIT 1")
    except Exception:
        conn.rollback()
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS timesheets_audit (
                id SERIAL PRIMARY KEY,
                timesheet_id INTEGER,
                staff_id INTEGER NOT NULL REFERENCES staff(id),
                action VARCHAR(20) NOT NULL,
                old_data JSONB,
                new_data JSONB,
                changed_by_id INTEGER NOT NULL REFERENCES staff(id),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        conn.commit()


def _log_timesheet_change(conn, timesheet_id, staff_id, action, old_data, new_data, changed_by_id):
    _ensure_timesheets_audit_table(conn)
    cur = conn.cursor()
    import json
    cur.execute(
        """
        INSERT INTO timesheets_audit (timesheet_id, staff_id, action, old_data, new_data, changed_by_id)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            timesheet_id,
            staff_id,
            action,
            json.dumps(old_data) if old_data else None,
            json.dumps(new_data) if new_data else None,
            changed_by_id
        )
    )
