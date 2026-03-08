from datetime import date
import math
from typing import Any, Dict, List, Optional

import psycopg2
from flask import Blueprint, jsonify, request

from .config import config
from .db import get_connection, release_connection


staff_bp = Blueprint("staff", __name__)


def validate_salary(value: Any) -> float:
    try:
        amount = float(value)
    except (TypeError, ValueError):
        raise ValueError("invalid_salary")
    if not math.isfinite(amount) or amount < 0:
        raise ValueError("invalid_salary")
    return round(amount, 2)


def validate_medicine_name(value: Any) -> str:
    name = str(value or "").strip()
    if len(name) < 2 or len(name) > 150:
        raise ValueError("invalid_medicine_name")
    return name


def get_role_id(conn, role_name: str) -> Optional[int]:
    cur = conn.cursor()
    cur.execute(
        "SELECT id FROM staff_roles WHERE name = %s",
        (role_name,),
    )
    row = cur.fetchone()
    return int(row[0]) if row else None


@staff_bp.route("/roles", methods=["GET"])
def list_roles():
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, name
            FROM staff_roles
            ORDER BY name
            """
        )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    items = [{"id": row[0], "name": row[1]} for row in rows]
    return jsonify(items)


@staff_bp.route("/medicines", methods=["GET"])
def list_medicines():
    conn = get_connection()
    try:
        cur = conn.cursor()
        try:
            cur.execute(
                """
                SELECT id, name
                FROM medicine_presets
                ORDER BY name
                """
            )
        except psycopg2.errors.UndefinedTable:
            conn.rollback()
            return jsonify([])
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    items = [{"id": int(row[0]), "name": row[1]} for row in rows]
    return jsonify(items)


@staff_bp.route("/medicines", methods=["POST"])
def create_medicine():
    data = request.get_json(silent=True) or {}
    try:
        name = validate_medicine_name(data.get("name"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    conn = get_connection()
    try:
        cur = conn.cursor()
        try:
            cur.execute(
                """
                INSERT INTO medicine_presets (name)
                VALUES (%s)
                ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
                RETURNING id
                """,
                (name,),
            )
        except psycopg2.errors.UndefinedTable:
            conn.rollback()
            return jsonify({"error": "medicine_table_missing"}), 400
        row = cur.fetchone()
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"id": int(row[0])}), 201


@staff_bp.route("/medicines/<int:medicine_id>", methods=["DELETE"])
def delete_medicine(medicine_id: int):
    conn = get_connection()
    try:
        cur = conn.cursor()
        try:
            cur.execute("DELETE FROM medicine_presets WHERE id = %s", (medicine_id,))
        except psycopg2.errors.UndefinedTable:
            conn.rollback()
            return jsonify({"error": "medicine_table_missing"}), 400
        if cur.rowcount == 0:
            conn.rollback()
            return jsonify({"error": "medicine_not_found"}), 404
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"status": "ok"})


@staff_bp.route("/<int:staff_id>/salary-estimate", methods=["GET"])
def get_salary_estimate(staff_id: int):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT s.base_salary, s.commission_rate, s.total_revenue, r.name, s.last_paid_at
            FROM staff s
            JOIN staff_roles r ON r.id = s.role_id
            WHERE s.id = %s
            """,
            (staff_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "staff_not_found"}), 404

        base_salary = float(row[0])
        commission_rate = float(row[1])
        total_revenue = float(row[2] or 0)
        role = row[3]
        last_paid_at = row[4].isoformat() if row[4] else None

        # Check if lab_cost exists
        includes_lab_cost = False
        try:
            cur.execute("SELECT lab_cost FROM income_records LIMIT 0")
            includes_lab_cost = True
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()

        if includes_lab_cost:
            cur.execute(
                """
                SELECT COALESCE(SUM(amount * %s - lab_cost), 0)
                FROM income_records
                WHERE doctor_id = %s AND salary_payment_id IS NULL
                """,
                (commission_rate, staff_id)
            )
        else:
             cur.execute(
                """
                SELECT COALESCE(SUM(amount * %s), 0)
                FROM income_records
                WHERE doctor_id = %s AND salary_payment_id IS NULL
                """,
                (commission_rate, staff_id)
            )
        
        commission_part = float(cur.fetchone()[0] or 0)
        if commission_part == 0 and total_revenue > 0 and commission_rate > 0:
            commission_part = total_revenue * commission_rate
        
        # Add adjustments
        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0)
            FROM salary_adjustments
            WHERE staff_id = %s AND applied_to_salary_payment_id IS NULL
            """,
            (staff_id,)
        )
        adjustments = float(cur.fetchone()[0] or 0)
        
        estimated_total = base_salary + commission_part + adjustments

        return jsonify({
            "base_salary": base_salary,
            "commission_rate": commission_rate,
            "total_revenue": total_revenue,
            "commission_part": round(commission_part, 2),
            "adjustments": round(adjustments, 2),
            "estimated_total": round(estimated_total, 2),
            "role": role,
            "last_paid_at": last_paid_at
        })
    finally:
        release_connection(conn)


@staff_bp.route("/salaries", methods=["POST"])
def pay_salary():
    data = request.get_json(silent=True) or {}
    
    staff_id = data.get("staff_id")
    if not staff_id:
        return jsonify({"error": "invalid_staff"}), 400
        
    requested_amount = data.get("amount", None)
    
    payment_date = data.get("payment_date") or date.today().isoformat()
    note = data.get("note", "").strip()

    conn = get_connection()
    try:
        cur = conn.cursor()
        
        # Verify staff exists
        cur.execute("SELECT id, base_salary, commission_rate, total_revenue FROM staff WHERE id = %s", (staff_id,))
        staff_row = cur.fetchone()
        if not staff_row:
            return jsonify({"error": "staff_not_found"}), 404
            
        base_salary = float(staff_row[1] or 0)
        commission_rate = float(staff_row[2] or 0)
        total_revenue = float(staff_row[3] or 0)

        # Calculate commission part
        includes_lab_cost = False
        try:
            cur.execute("SELECT lab_cost FROM income_records LIMIT 0")
            includes_lab_cost = True
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()

        if includes_lab_cost:
            cur.execute(
                """
                SELECT COALESCE(SUM(amount * %s - lab_cost), 0)
                FROM income_records
                WHERE doctor_id = %s AND salary_payment_id IS NULL
                """,
                (commission_rate, staff_id)
            )
        else:
             cur.execute(
                """
                SELECT COALESCE(SUM(amount * %s), 0)
                FROM income_records
                WHERE doctor_id = %s AND salary_payment_id IS NULL
                """,
                (commission_rate, staff_id)
            )
        commission_part = float(cur.fetchone()[0] or 0)
        if commission_part == 0 and total_revenue > 0 and commission_rate > 0:
            commission_part = total_revenue * commission_rate

        # Calculate adjustments
        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0)
            FROM salary_adjustments
            WHERE staff_id = %s AND applied_to_salary_payment_id IS NULL
            """,
            (staff_id,)
        )
        adjustments = float(cur.fetchone()[0] or 0)

        if requested_amount is not None:
            total_amount = validate_salary(requested_amount)
        else:
            total_amount = round(base_salary + commission_part + adjustments, 2)

        # Record payment
        cur.execute(
            """
            INSERT INTO salary_payments (staff_id, amount, payment_date, note)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (staff_id, total_amount, payment_date, note)
        )
        payment_id = cur.fetchone()[0]

        # Link income records
        cur.execute(
            """
            UPDATE income_records
            SET salary_payment_id = %s
            WHERE doctor_id = %s AND salary_payment_id IS NULL
            """,
            (payment_id, staff_id)
        )
        
        # Link adjustments
        cur.execute(
            """
            UPDATE salary_adjustments
            SET applied_to_salary_payment_id = %s
            WHERE staff_id = %s AND applied_to_salary_payment_id IS NULL
            """,
            (payment_id, staff_id)
        )

        # Reset total_revenue to 0 for the staff member
        cur.execute(
            """
            UPDATE staff
            SET total_revenue = 0,
                updated_at = NOW()
            WHERE id = %s
            """,
            (staff_id,)
        )
        
        conn.commit()
        return jsonify({"id": payment_id, "status": "ok", "amount": total_amount}), 201
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)


@staff_bp.route("", methods=["GET"])
def list_staff():
    role = request.args.get("role")
    q = request.args.get("q", "").strip()

    conn = get_connection()
    try:
        cur = conn.cursor()
        params: List[Any] = []
        conditions: List[str] = ["s.is_active = TRUE"]

        if role:
            conditions.append("r.name = %s")
            params.append(role)

        if q:
            pattern = f"%{q.lower()}%"
            conditions.append(
                "(LOWER(s.first_name) LIKE %s OR LOWER(s.last_name) LIKE %s OR LOWER(s.email) LIKE %s)"
            )
            params.extend([pattern, pattern, pattern])

        condition_sql = " AND ".join(conditions)

        try:
            cur.execute(
                f"""
                SELECT s.id,
                       s.first_name,
                       s.last_name,
                       s.phone,
                       s.email,
                       s.bio,
                       s.base_salary,
                       s.commission_rate,
                       s.last_paid_at,
                       s.total_revenue,
                       s.is_active,
                       r.name,
                       COALESCE(SUM(sp.amount), 0) AS commission_income
                FROM staff s
                JOIN staff_roles r ON r.id = s.role_id
                LEFT JOIN salary_payments sp ON sp.staff_id = s.id
                WHERE {condition_sql}
                GROUP BY s.id,
                         s.first_name,
                         s.last_name,
                         s.phone,
                         s.email,
                         s.bio,
                         s.base_salary,
                         s.commission_rate,
                         s.last_paid_at,
                         s.total_revenue,
                         s.is_active,
                         r.name
                ORDER BY r.name, s.last_name, s.first_name
                """,
                params,
            )
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()
            cur.execute(
                f"""
                SELECT s.id,
                       s.first_name,
                       s.last_name,
                       s.phone,
                       s.email,
                       s.bio,
                       s.base_salary,
                       0 AS commission_rate,
                       s.last_paid_at,
                       s.total_revenue,
                       s.is_active,
                       r.name,
                       COALESCE(SUM(sp.amount), 0) AS commission_income
                FROM staff s
                JOIN staff_roles r ON r.id = s.role_id
                LEFT JOIN salary_payments sp ON sp.staff_id = s.id
                WHERE {condition_sql}
                GROUP BY s.id,
                         s.first_name,
                         s.last_name,
                         s.phone,
                         s.email,
                         s.bio,
                         s.base_salary,
                         s.last_paid_at,
                         s.total_revenue,
                         s.is_active,
                         r.name
                ORDER BY r.name, s.last_name, s.first_name
                """,
                params,
            )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    items = []
    for row in rows:
        base_salary = float(row[6])
        commission_rate = float(row[7])
        last_paid_at = row[8].isoformat() if row[8] else None
        total_revenue = float(row[9])
        is_active = bool(row[10])
        role_name = row[11]
        commission_income = float(row[12])

        if commission_rate == 0:
            if total_revenue > 0 and commission_income > 0:
                commission_rate = commission_income / total_revenue
            elif total_revenue > 0 and commission_income == 0 and role_name == "doctor":
                commission_rate = config.DOCTOR_COMMISSION_RATE
        if commission_income == 0 and role_name == "doctor" and total_revenue > 0 and commission_rate > 0:
            commission_income = round(total_revenue * commission_rate, 2)

        items.append(
            {
                "id": row[0],
                "first_name": row[1],
                "last_name": row[2],
                "phone": row[3],
                "email": row[4],
                "bio": row[5],
                "base_salary": base_salary,
                "commission_rate": commission_rate,
                "last_paid_at": last_paid_at,
                "total_revenue": total_revenue,
                "commission_income": commission_income,
                "is_active": is_active,
                "role": role_name,
            }
        )

    return jsonify(items)


@staff_bp.route("/<int:staff_id>", methods=["GET"])
def get_staff(staff_id: int):
    conn = get_connection()
    try:
        cur = conn.cursor()
        try:
            cur.execute(
                """
                SELECT s.id,
                       s.first_name,
                       s.last_name,
                       s.phone,
                       s.email,
                       s.bio,
                       s.base_salary,
                       s.commission_rate,
                       s.last_paid_at,
                       s.total_revenue,
                       s.is_active,
                       r.name,
                       COALESCE(SUM(sp.amount), 0) AS commission_income
                FROM staff s
                JOIN staff_roles r ON r.id = s.role_id
                LEFT JOIN salary_payments sp ON sp.staff_id = s.id
                WHERE s.id = %s
                GROUP BY s.id,
                         s.first_name,
                         s.last_name,
                         s.phone,
                         s.email,
                         s.bio,
                         s.base_salary,
                         s.commission_rate,
                         s.last_paid_at,
                         s.total_revenue,
                         s.is_active,
                         r.name
                """,
                (staff_id,),
            )
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()
            cur.execute(
                """
                SELECT s.id,
                       s.first_name,
                       s.last_name,
                       s.phone,
                       s.email,
                       s.bio,
                       s.base_salary,
                       0 AS commission_rate,
                       s.last_paid_at,
                       s.total_revenue,
                       s.is_active,
                       r.name,
                       COALESCE(SUM(sp.amount), 0) AS commission_income
                FROM staff s
                JOIN staff_roles r ON r.id = s.role_id
                LEFT JOIN salary_payments sp ON sp.staff_id = s.id
                WHERE s.id = %s
                GROUP BY s.id,
                         s.first_name,
                         s.last_name,
                         s.phone,
                         s.email,
                         s.bio,
                         s.base_salary,
                         s.last_paid_at,
                         s.total_revenue,
                         s.is_active,
                         r.name
                """,
                (staff_id,),
            )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "staff_not_found"}), 404
    finally:
        release_connection(conn)

    base_salary = float(row[6])
    commission_rate = float(row[7])
    last_paid_at = row[8].isoformat() if row[8] else None
    total_revenue = float(row[9])
    is_active = bool(row[10])
    role_name = row[11]
    commission_income = float(row[12])

    if commission_rate == 0:
        if total_revenue > 0 and commission_income > 0:
            commission_rate = commission_income / total_revenue
        elif total_revenue > 0 and commission_income == 0 and role_name == "doctor":
            commission_rate = config.DOCTOR_COMMISSION_RATE
    if commission_income == 0 and role_name == "doctor" and total_revenue > 0 and commission_rate > 0:
        commission_income = round(total_revenue * commission_rate, 2)

    item = {
        "id": row[0],
        "first_name": row[1],
        "last_name": row[2],
        "phone": row[3],
        "email": row[4],
        "bio": row[5],
        "base_salary": base_salary,
        "commission_rate": commission_rate,
        "last_paid_at": last_paid_at,
        "total_revenue": total_revenue,
        "commission_income": commission_income,
        "is_active": is_active,
        "role": role_name,
    }

    return jsonify(item)


@staff_bp.route("", methods=["POST"])
def create_staff():
    data = request.get_json(silent=True) or {}

    first_name = data.get("first_name")
    last_name = data.get("last_name")
    phone = data.get("phone")
    email = data.get("email")
    bio = data.get("bio")
    role_name = data.get("role")

    if not first_name or not last_name or not role_name:
        return jsonify({"error": "invalid_staff"}), 400

    base_salary_value = data.get("base_salary", 0)
    commission_rate_value = data.get("commission_rate", 0)

    try:
        base_salary = validate_salary(base_salary_value)
        commission_rate = float(commission_rate_value or 0)
        if commission_rate < 0 or commission_rate > 1:
            raise ValueError("invalid_commission_rate")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    commission_rate = round(commission_rate, 4)

    conn = get_connection()
    try:
        cur = conn.cursor()
        role_id = get_role_id(conn, role_name)
        if not role_id:
            return jsonify({"error": "invalid_role"}), 400

        if role_name == "doctor":
            base_salary_db = 0
            commission_rate_db = commission_rate
        else:
            base_salary_db = base_salary
            commission_rate_db = 0

        try:
            cur.execute(
                """
                INSERT INTO staff
                    (role_id, first_name, last_name, phone, email, bio, base_salary, commission_rate)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    role_id,
                    first_name,
                    last_name,
                    phone,
                    email,
                    bio,
                    base_salary_db,
                    commission_rate_db,
                ),
            )
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO staff
                    (role_id, first_name, last_name, phone, email, bio, base_salary)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    role_id,
                    first_name,
                    last_name,
                    phone,
                    email,
                    bio,
                    base_salary_db,
                ),
            )
        row = cur.fetchone()
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"id": int(row[0])}), 201


@staff_bp.route("/<int:staff_id>", methods=["PUT"])
def update_staff(staff_id: int):
    data = request.get_json(silent=True) or {}

    first_name = data.get("first_name")
    last_name = data.get("last_name")
    phone = data.get("phone")
    email = data.get("email")
    bio = data.get("bio")
    role_name = data.get("role")

    if not first_name or not last_name or not role_name:
        return jsonify({"error": "invalid_staff"}), 400

    base_salary_value = data.get("base_salary", 0)
    commission_rate_value = data.get("commission_rate", 0)

    try:
        base_salary = validate_salary(base_salary_value)
        commission_rate = float(commission_rate_value or 0)
        if commission_rate < 0 or commission_rate > 1:
            raise ValueError("invalid_commission_rate")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    commission_rate = round(commission_rate, 4)

    conn = get_connection()
    try:
        cur = conn.cursor()
        role_id = get_role_id(conn, role_name)
        if not role_id:
            return jsonify({"error": "invalid_role"}), 400

        if role_name == "doctor":
            base_salary_db = 0
            commission_rate_db = commission_rate
        else:
            base_salary_db = base_salary
            commission_rate_db = 0

        try:
            cur.execute(
                """
                UPDATE staff
                SET role_id = %s,
                    first_name = %s,
                    last_name = %s,
                    phone = %s,
                    email = %s,
                    bio = %s,
                    base_salary = %s,
                    commission_rate = %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (
                    role_id,
                    first_name,
                    last_name,
                    phone,
                    email,
                    bio,
                    base_salary_db,
                    commission_rate_db,
                    staff_id,
                ),
            )
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE staff
                SET role_id = %s,
                    first_name = %s,
                    last_name = %s,
                    phone = %s,
                    email = %s,
                    bio = %s,
                    base_salary = %s
                WHERE id = %s
                """,
                (
                    role_id,
                    first_name,
                    last_name,
                    phone,
                    email,
                    bio,
                    base_salary_db,
                    staff_id,
                ),
            )
        if cur.rowcount == 0:
            conn.rollback()
            return jsonify({"error": "staff_not_found"}), 404
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"status": "ok"})


@staff_bp.route("/<int:staff_id>", methods=["DELETE"])
def deactivate_staff(staff_id: int):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM staff WHERE id = %s AND is_active = TRUE",
            (staff_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "staff_not_found"}), 404

        cur.execute(
            "UPDATE staff SET is_active = FALSE WHERE id = %s",
            (staff_id,),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"status": "ok"})


@staff_bp.route("/<int:staff_id>/restore", methods=["POST"])
def restore_staff(staff_id: int):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM staff WHERE id = %s AND is_active = FALSE",
            (staff_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "staff_not_found"}), 404

        cur.execute(
            "UPDATE staff SET is_active = TRUE WHERE id = %s",
            (staff_id,),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"status": "ok"})


@staff_bp.route("/<int:staff_id>/commission", methods=["POST"])
def update_staff_commission(staff_id: int):
    data = request.get_json(silent=True) or {}
    rate = data.get("rate")
    if rate is None:
        return jsonify({"error": "missing_rate"}), 400

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE staff SET commission_rate = %s WHERE id = %s",
            (float(rate), staff_id),
        )
        conn.commit()
    finally:
        release_connection(conn)

    return jsonify({"status": "ok"})
