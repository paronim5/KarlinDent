import csv
import calendar
from datetime import date, datetime, timedelta
from io import BytesIO, StringIO
from typing import Any, Dict, List

import psycopg2
from flask import Blueprint, Response, jsonify, request
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas
    PDF_AVAILABLE = True
except Exception:
    A4 = None
    mm = None
    canvas = None
    PDF_AVAILABLE = False

from .config import config
from .db import get_connection, release_connection


clinic_bp = Blueprint("clinic", __name__)


def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def fetch_daily_pnl(start: date, end: date) -> List[Dict[str, Any]]:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT day, total_income, total_outcome, pnl
            FROM daily_pnl
            WHERE day BETWEEN %s AND %s
            ORDER BY day
            """,
            (start, end),
        )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    return [
        {
            "day": row[0].isoformat(),
            "total_income": float(row[1]),
            "total_outcome": float(row[2]),
            "pnl": float(row[3]),
        }
        for row in rows
    ]

def compute_doctor_avg_salary(start: date, end: date) -> float:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT s.id,
                   COALESCE(SUM(ir.amount * s.commission_rate), 0) AS earnings
            FROM staff s
            JOIN staff_roles r ON r.id = s.role_id
            LEFT JOIN income_records ir
              ON ir.doctor_id = s.id
             AND ir.service_date BETWEEN %s AND %s
            WHERE r.name = 'doctor' AND s.is_active = TRUE
            GROUP BY s.id
            """,
            (start, end),
        )
        rows = cur.fetchall()
    finally:
        release_connection(conn)
    if not rows:
        return 0.0
    avg = sum(float(row[1] or 0) for row in rows) / len(rows)
    return round(avg, 2)


def shift_month(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


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


def pct_change(current: float, previous: float) -> float:
    if previous == 0:
        return 0.0 if current == 0 else 100.0
    return round((current - previous) / previous * 100, 2)


@clinic_bp.route("/dashboard", methods=["GET"])
def dashboard():
    today = date.today()
    start_param = request.args.get("from")
    end_param = request.args.get("to")

    start = parse_date(start_param) if start_param else today.replace(day=1)
    end = parse_date(end_param) if end_param else today

    period_days = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=period_days - 1)

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT setting_value FROM clinic_settings WHERE setting_key = 'monthly_lease_cost'"
        )
        lease_row = cur.fetchone()
        lease_cost = float(lease_row[0]) if lease_row and lease_row[0] is not None else 0.0

        cur.execute("SELECT avg_payment FROM avg_patient_payment")
        avg_payment_row = cur.fetchone()
        avg_payment = (
            float(avg_payment_row[0]) if avg_payment_row and avg_payment_row[0] is not None else 0.0
        )

        cur.execute("SELECT role, avg_salary FROM avg_salary_by_role")
        avg_salary_rows = cur.fetchall()

        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0)
            FROM income_records
            WHERE service_date BETWEEN %s AND %s
            """,
            (start, end),
        )
        total_income = float(cur.fetchone()[0] or 0)

        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0)
            FROM income_records
            WHERE service_date BETWEEN %s AND %s
            """,
            (prev_start, prev_end),
        )
        prev_income = float(cur.fetchone()[0] or 0)

        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0)
            FROM outcome_records
            WHERE expense_date BETWEEN %s AND %s
            """,
            (start, end),
        )
        total_expenses = float(cur.fetchone()[0] or 0)

        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0)
            FROM outcome_records
            WHERE expense_date BETWEEN %s AND %s
            """,
            (prev_start, prev_end),
        )
        prev_expenses = float(cur.fetchone()[0] or 0)

        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0)
            FROM salary_payments
            WHERE payment_date BETWEEN %s AND %s
            """,
            (start, end),
        )
        total_salaries = float(cur.fetchone()[0] or 0)

        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0)
            FROM salary_payments
            WHERE payment_date BETWEEN %s AND %s
            """,
            (prev_start, prev_end),
        )
        prev_salaries = float(cur.fetchone()[0] or 0)

        cur.execute(
            """
            SELECT
              COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount END), 0),
              COALESCE(SUM(CASE WHEN payment_method = 'card' THEN amount END), 0)
            FROM income_records
            WHERE service_date BETWEEN %s AND %s
            """,
            (start, end),
        )
        cash_total, card_total = cur.fetchone()
        cash_total = float(cash_total or 0)
        card_total = float(card_total or 0)

        has_lab_cost = column_exists(conn, "income_records", "lab_cost")
        if has_lab_cost:
            cur.execute(
                """
                SELECT COALESCE(SUM(lab_cost), 0)
                FROM income_records
                WHERE service_date BETWEEN %s AND %s
                """,
                (start, end),
            )
            lab_total = float(cur.fetchone()[0] or 0)
        else:
            lab_total = 0.0

        cur.execute(
            """
            SELECT COUNT(DISTINCT patient_id)
            FROM income_records
            WHERE service_date BETWEEN %s AND %s
            """,
            (start, end),
        )
        unique_patients = int(cur.fetchone()[0] or 0)

        cur.execute(
            """
            SELECT COUNT(*)
            FROM (
              SELECT patient_id, MIN(service_date) AS first_visit
              FROM income_records
              GROUP BY patient_id
            ) sub
            WHERE first_visit BETWEEN %s AND %s
            """,
            (start, end),
        )
        new_patients = int(cur.fetchone()[0] or 0)

        cur.execute(
            """
            SELECT p.id,
                   p.first_name,
                   p.last_name,
                   COALESCE(SUM(ir.amount), 0) AS total_spend,
                   COUNT(ir.id) AS visit_count
            FROM income_records ir
            JOIN patients p ON p.id = ir.patient_id
            WHERE ir.service_date BETWEEN %s AND %s
            GROUP BY p.id, p.first_name, p.last_name
            ORDER BY total_spend DESC
            LIMIT 5
            """,
            (start, end),
        )
        top_patients_rows = cur.fetchall()

        cur.execute(
            """
            SELECT service_date, COUNT(*)
            FROM income_records
            WHERE service_date BETWEEN %s AND %s
            GROUP BY service_date
            ORDER BY service_date
            """,
            (start, end),
        )
        visits_daily_rows = cur.fetchall()

        cur.execute(
            """
            SELECT DATE_TRUNC('week', service_date)::DATE AS week, COUNT(*)
            FROM income_records
            WHERE service_date BETWEEN %s AND %s
            GROUP BY week
            ORDER BY week
            """,
            (start, end),
        )
        visits_weekly_rows = cur.fetchall()

        cur.execute(
            """
            SELECT DATE_TRUNC('month', service_date)::DATE AS month, COUNT(*)
            FROM income_records
            WHERE service_date BETWEEN %s AND %s
            GROUP BY month
            ORDER BY month
            """,
            (start, end),
        )
        visits_monthly_rows = cur.fetchall()

        cur.execute(
            """
            SELECT s.id,
                   s.first_name,
                   s.last_name,
                   COALESCE(SUM(ir.amount), 0) AS total_income,
                   COUNT(ir.id) AS visit_count,
                   COALESCE(AVG(ir.amount), 0) AS avg_visit_value
            FROM income_records ir
            JOIN staff s ON s.id = ir.doctor_id
            JOIN staff_roles r ON r.id = s.role_id
            WHERE r.name = 'doctor' AND ir.service_date BETWEEN %s AND %s
            GROUP BY s.id, s.first_name, s.last_name
            ORDER BY total_income DESC
            """,
            (start, end),
        )
        doctor_rows = cur.fetchall()

        cur.execute(
            """
            SELECT c.name, COALESCE(SUM(o.amount), 0) AS total
            FROM outcome_records o
            JOIN outcome_categories c ON c.id = o.category_id
            WHERE o.expense_date BETWEEN %s AND %s
            GROUP BY c.name
            ORDER BY total DESC
            """,
            (start, end),
        )
        expense_category_rows = cur.fetchall()

        trend_start = shift_month(end.replace(day=1), -5)
        cur.execute(
            """
            SELECT DATE_TRUNC('month', expense_date)::DATE AS month, COALESCE(SUM(amount), 0) AS total
            FROM outcome_records
            WHERE expense_date BETWEEN %s AND %s
            GROUP BY month
            ORDER BY month
            """,
            (trend_start, end),
        )
        expense_trend_rows = cur.fetchall()

        cur.execute(
            """
            SELECT s.id, s.first_name, s.last_name, s.last_paid_at
            FROM staff s
            WHERE s.is_active = TRUE
            ORDER BY s.last_name, s.first_name
            """
        )
        staff_last_paid_rows = cur.fetchall()

        cur.execute(
            """
            SELECT EXTRACT(DOW FROM service_date) AS dow, COUNT(*)
            FROM income_records
            WHERE service_date BETWEEN %s AND %s
            GROUP BY dow
            ORDER BY COUNT(*) DESC
            LIMIT 3
            """,
            (start, end),
        )
        busiest_rows = cur.fetchall()

        try:
            cur.execute(
                """
                SELECT s.id,
                       s.first_name,
                       s.last_name,
                       s.total_revenue,
                       s.commission_rate,
                       COALESCE(SUM(sp.amount), 0) AS paid
                FROM staff s
                JOIN staff_roles r ON r.id = s.role_id
                LEFT JOIN salary_payments sp ON sp.staff_id = s.id
                WHERE r.name = 'doctor' AND s.is_active = TRUE
                GROUP BY s.id, s.first_name, s.last_name, s.total_revenue, s.commission_rate
                """
            )
            commission_rows = cur.fetchall()
            commission_rate_default = None
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()
            cur.execute(
                """
                SELECT s.id,
                       s.first_name,
                       s.last_name,
                       s.total_revenue,
                       COALESCE(SUM(sp.amount), 0) AS paid
                FROM staff s
                JOIN staff_roles r ON r.id = s.role_id
                LEFT JOIN salary_payments sp ON sp.staff_id = s.id
                WHERE r.name = 'doctor' AND s.is_active = TRUE
                GROUP BY s.id, s.first_name, s.last_name, s.total_revenue
                """
            )
            commission_rows = cur.fetchall()
            commission_rate_default = config.DOCTOR_COMMISSION_RATE
    finally:
        release_connection(conn)

    avg_salary_by_role = {row[0]: float(row[1]) for row in avg_salary_rows}
    if "doctor" not in avg_salary_by_role or avg_salary_by_role["doctor"] == 0.0:
        avg_salary_by_role["doctor"] = compute_doctor_avg_salary(start, end)

    avg_salary_by_role = {row[0]: float(row[1]) for row in avg_salary_rows}
    if "doctor" not in avg_salary_by_role or avg_salary_by_role["doctor"] == 0.0:
        avg_salary_by_role["doctor"] = compute_doctor_avg_salary(start, end)

    pnl_series = fetch_daily_pnl(start, end)
    net_profit = total_income - total_expenses - total_salaries
    income_change = pct_change(total_income, prev_income)
    expense_change = pct_change(total_expenses, prev_expenses)

    top_patients = [
        {
            "id": int(row[0]),
            "name": " ".join(filter(None, [row[1], row[2]])).strip(),
            "total_spend": float(row[3] or 0),
            "visit_count": int(row[4] or 0),
        }
        for row in top_patients_rows
    ]

    doctor_performance = [
        {
            "id": int(row[0]),
            "name": " ".join(filter(None, [row[1], row[2]])).strip(),
            "total_income": float(row[3] or 0),
            "visit_count": int(row[4] or 0),
            "avg_visit_value": float(row[5] or 0),
        }
        for row in doctor_rows
    ]

    expense_by_category = [
        {"category": row[0], "total": float(row[1] or 0)} for row in expense_category_rows
    ]

    expense_trend = [
        {"month": row[0].isoformat(), "total": float(row[1] or 0)}
        for row in expense_trend_rows
    ]

    visits_daily = [
        {"day": row[0].isoformat(), "count": int(row[1] or 0)}
        for row in visits_daily_rows
    ]
    visits_weekly = [
        {"week": row[0].isoformat(), "count": int(row[1] or 0)}
        for row in visits_weekly_rows
    ]
    visits_monthly = [
        {"month": row[0].isoformat(), "count": int(row[1] or 0)}
        for row in visits_monthly_rows
    ]

    days_since_last_salary = []
    for row in staff_last_paid_rows:
        last_paid = row[3]
        if last_paid:
            days_since = (end - last_paid).days
        else:
            days_since = None
        days_since_last_salary.append(
            {
                "id": int(row[0]),
                "name": " ".join(filter(None, [row[1], row[2]])).strip(),
                "days": days_since,
            }
        )

    busiest_days = [
        {"dow": int(row[0]), "count": int(row[1] or 0)} for row in busiest_rows
    ]

    outstanding_commission = []
    if commission_rate_default is None:
        for row in commission_rows:
            total_revenue = float(row[3] or 0)
            commission_rate = float(row[4] or 0)
            paid = float(row[5] or 0)
            outstanding = max(total_revenue * commission_rate - paid, 0)
            outstanding_commission.append(
                {
                    "id": int(row[0]),
                    "name": " ".join(filter(None, [row[1], row[2]])).strip(),
                    "amount": round(outstanding, 2),
                }
            )
    else:
        for row in commission_rows:
            total_revenue = float(row[3] or 0)
            paid = float(row[4] or 0)
            outstanding = max(total_revenue * commission_rate_default - paid, 0)
            outstanding_commission.append(
                {
                    "id": int(row[0]),
                    "name": " ".join(filter(None, [row[1], row[2]])).strip(),
                    "amount": round(outstanding, 2),
                }
            )

    lab_ratio = round((lab_total / total_income) * 100, 2) if total_income > 0 else 0.0
    cash_ratio = round((cash_total / total_income) * 100, 2) if total_income > 0 else 0.0
    card_ratio = round((card_total / total_income) * 100, 2) if total_income > 0 else 0.0
    salary_ratio = round((total_salaries / total_income) * 100, 2) if total_income > 0 else 0.0

    return jsonify(
        {
            "lease_cost": lease_cost,
            "avg_payment_per_patient": avg_payment,
            "avg_salary_by_role": avg_salary_by_role,
            "daily_pnl": pnl_series,
            "financial_overview": {
                "total_income": round(total_income, 2),
                "total_expenses": round(total_expenses, 2),
                "total_salaries": round(total_salaries, 2),
                "net_profit": round(net_profit, 2),
                "income_change_pct": income_change,
                "expense_change_pct": expense_change,
                "cash_total": round(cash_total, 2),
                "card_total": round(card_total, 2),
                "cash_ratio": cash_ratio,
                "card_ratio": card_ratio,
                "lab_total": round(lab_total, 2),
                "lab_ratio": lab_ratio,
            },
            "patient_insights": {
                "unique_patients": unique_patients,
                "new_patients": new_patients,
                "returning_patients": max(unique_patients - new_patients, 0),
                "avg_revenue_per_visit": round(avg_payment, 2),
                "top_patients": top_patients,
                "visits_daily": visits_daily,
                "visits_weekly": visits_weekly,
                "visits_monthly": visits_monthly,
            },
            "doctor_performance": doctor_performance,
            "expense_analysis": {
                "by_category": expense_by_category,
                "salary_ratio": salary_ratio,
                "expense_trend": expense_trend,
            },
            "operational_health": {
                "days_since_last_salary": days_since_last_salary,
                "busiest_days": busiest_days,
                "outstanding_commission": outstanding_commission,
            },
        }
    )


@clinic_bp.route("/daily-pnl/export/csv", methods=["GET"])
def export_daily_pnl_csv():
    today = date.today()
    start_param = request.args.get("from")
    end_param = request.args.get("to")

    start = parse_date(start_param) if start_param else today.replace(day=1)
    end = parse_date(end_param) if end_param else today

    pnl_series = fetch_daily_pnl(start, end)

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["day", "total_income", "total_outcome", "pnl"])
    for item in pnl_series:
        writer.writerow(
            [
                item["day"],
                item["total_income"],
                item["total_outcome"],
                item["pnl"],
            ]
        )

    csv_data = output.getvalue()

    return Response(
        csv_data,
        mimetype="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=daily_pnl.csv",
        },
    )


@clinic_bp.route("/daily-pnl/export/pdf", methods=["GET"])
def export_daily_pnl_pdf():
    if not PDF_AVAILABLE:
        return jsonify({"error": "pdf_export_unavailable"}), 503
    today = date.today()
    start_param = request.args.get("from")
    end_param = request.args.get("to")

    start = parse_date(start_param) if start_param else today.replace(day=1)
    end = parse_date(end_param) if end_param else today

    pnl_series = fetch_daily_pnl(start, end)

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(20 * mm, height - 20 * mm, "Daily P&L")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(20 * mm, height - 26 * mm, f"From {start.isoformat()} to {end.isoformat()}")

    y = height - 40 * mm
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(20 * mm, y, "Day")
    pdf.drawString(55 * mm, y, "Income")
    pdf.drawString(95 * mm, y, "Outcome")
    pdf.drawString(135 * mm, y, "P&L")

    pdf.setFont("Helvetica", 9)
    y -= 6 * mm
    for item in pnl_series:
        if y < 20 * mm:
            pdf.showPage()
            y = height - 20 * mm
            pdf.setFont("Helvetica-Bold", 9)
            pdf.drawString(20 * mm, y, "Day")
            pdf.drawString(55 * mm, y, "Income")
            pdf.drawString(95 * mm, y, "Outcome")
            pdf.drawString(135 * mm, y, "P&L")
            pdf.setFont("Helvetica", 9)
            y -= 6 * mm

        pdf.drawString(20 * mm, y, item["day"])
        pdf.drawRightString(80 * mm, y, f"{item['total_income']:.2f}")
        pdf.drawRightString(120 * mm, y, f"{item['total_outcome']:.2f}")
        pdf.drawRightString(160 * mm, y, f"{item['pnl']:.2f}")
        y -= 6 * mm

    pdf.showPage()
    pdf.save()
    pdf_data = buffer.getvalue()
    buffer.close()

    return Response(
        pdf_data,
        mimetype="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=daily_pnl.pdf",
        },
    )


@clinic_bp.route("/dashboard-data", methods=["GET"])
def get_dashboard_data():
    period = request.args.get("period", "month")  # day, week, month, year
    date_param = request.args.get("date", date.today().isoformat())
    
    try:
        ref_date = parse_date(date_param)
    except ValueError:
        return jsonify({"error": "Invalid date format"}), 400

    start_date = ref_date
    end_date = ref_date

    # Determine date range
    if period == "day":
        start_date = ref_date
        end_date = ref_date
    elif period == "week":
        # Start of week (Monday)
        start_date = ref_date - timedelta(days=ref_date.weekday())
        end_date = start_date + timedelta(days=6)
    elif period == "month":
        start_date = ref_date.replace(day=1)
        # End of month
        next_month = start_date.replace(day=28) + timedelta(days=4)
        end_date = next_month - timedelta(days=next_month.day)
    elif period == "year":
        start_date = ref_date.replace(month=1, day=1)
        end_date = ref_date.replace(month=12, day=31)
    
    conn = get_connection()
    try:
        cur = conn.cursor()
        
        # 1. Fetch Stats Summary
        cur.execute(
            """
            SELECT 
                COALESCE(SUM(amount), 0) as income
            FROM income_records
            WHERE service_date BETWEEN %s AND %s
            """,
            (start_date, end_date)
        )
        total_income = float(cur.fetchone()[0])

        cur.execute(
            """
            SELECT 
                COALESCE(SUM(amount), 0) as expenses
            FROM outcome_records
            WHERE expense_date BETWEEN %s AND %s
            """,
            (start_date, end_date)
        )
        total_expenses = float(cur.fetchone()[0])

        cur.execute(
            """
            SELECT 
                COALESCE(SUM(amount), 0) as salaries
            FROM salary_payments
            WHERE payment_date BETWEEN %s AND %s
            """,
            (start_date, end_date)
        )
        total_salaries = float(cur.fetchone()[0])
        
        cur.execute(
            """
            SELECT COUNT(DISTINCT patient_id)
            FROM income_records
            WHERE service_date BETWEEN %s AND %s
            """,
            (start_date, end_date)
        )
        total_patients = int(cur.fetchone()[0])

        stats = {
            "total_income": total_income,
            "total_expenses": total_expenses,
            "total_salaries": total_salaries,
            "net_profit": total_income - total_expenses - total_salaries,
            "total_patients": total_patients
        }
        
        # Extended Metrics Calculations
        
        # Financial Overview - Ratios
        cur.execute(
            """
            SELECT
              COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount END), 0),
              COALESCE(SUM(CASE WHEN payment_method = 'card' THEN amount END), 0)
            FROM income_records
            WHERE service_date BETWEEN %s AND %s
            """,
            (start_date, end_date),
        )
        cash_total, card_total = cur.fetchone()
        cash_total = float(cash_total or 0)
        card_total = float(card_total or 0)
        
        has_lab_cost = column_exists(conn, "income_records", "lab_cost")
        if has_lab_cost:
            cur.execute(
                """
                SELECT COALESCE(SUM(lab_cost), 0)
                FROM income_records
                WHERE service_date BETWEEN %s AND %s
                """,
                (start_date, end_date),
            )
            lab_total = float(cur.fetchone()[0] or 0)
        else:
            lab_total = 0.0
            
        lab_ratio = round((lab_total / total_income) * 100, 2) if total_income > 0 else 0.0
        cash_ratio = round((cash_total / total_income) * 100, 2) if total_income > 0 else 0.0
        card_ratio = round((card_total / total_income) * 100, 2) if total_income > 0 else 0.0
        
        financial_overview = {
            "net_profit": stats["net_profit"],
            "lab_ratio": lab_ratio,
            "cash_total": cash_total,
            "card_total": card_total,
            "cash_ratio": cash_ratio,
            "card_ratio": card_ratio
        }

        # Patient Insights
        cur.execute(
            """
            SELECT COUNT(*)
            FROM (
              SELECT patient_id, MIN(service_date) AS first_visit
              FROM income_records
              GROUP BY patient_id
            ) sub
            WHERE first_visit BETWEEN %s AND %s
            """,
            (start_date, end_date),
        )
        new_patients = int(cur.fetchone()[0] or 0)
        
        cur.execute("SELECT avg_payment FROM avg_patient_payment")
        avg_payment_row = cur.fetchone()
        avg_payment = (float(avg_payment_row[0]) if avg_payment_row and avg_payment_row[0] is not None else 0.0)
        
        cur.execute(
            """
            SELECT p.id,
                   p.first_name,
                   p.last_name,
                   COALESCE(SUM(ir.amount), 0) AS total_spend
            FROM income_records ir
            JOIN patients p ON p.id = ir.patient_id
            WHERE ir.service_date BETWEEN %s AND %s
            GROUP BY p.id, p.first_name, p.last_name
            ORDER BY total_spend DESC
            LIMIT 5
            """,
            (start_date, end_date),
        )
        top_patients = [
            {"id": row[0], "name": f"{row[1]} {row[2]}", "total_spend": float(row[3])}
            for row in cur.fetchall()
        ]
        
        patient_insights = {
            "unique_patients": stats["total_patients"],
            "new_patients": new_patients,
            "avg_revenue_per_visit": avg_payment,
            "top_patients": top_patients
        }
        
        # Doctor Performance
        cur.execute(
            """
            SELECT s.id,
                   s.first_name,
                   s.last_name,
                   COALESCE(SUM(ir.amount), 0) AS total_income,
                   COUNT(ir.id) AS visit_count,
                   COALESCE(AVG(ir.amount), 0) AS avg_visit_value
            FROM income_records ir
            JOIN staff s ON s.id = ir.doctor_id
            JOIN staff_roles r ON r.id = s.role_id
            WHERE r.name = 'doctor' AND ir.service_date BETWEEN %s AND %s
            GROUP BY s.id, s.first_name, s.last_name
            ORDER BY total_income DESC
            """,
            (start_date, end_date),
        )
        doctor_performance = [
            {
                "id": row[0],
                "name": f"{row[1]} {row[2]}",
                "total_income": float(row[3]),
                "visit_count": int(row[4]),
                "avg_visit_value": float(row[5])
            }
            for row in cur.fetchall()
        ]
        
        # Expense Analysis
        cur.execute(
            """
            SELECT c.name, COALESCE(SUM(o.amount), 0) AS total
            FROM outcome_records o
            JOIN outcome_categories c ON c.id = o.category_id
            WHERE o.expense_date BETWEEN %s AND %s
            GROUP BY c.name
            ORDER BY total DESC
            """,
            (start_date, end_date),
        )
        expense_by_category = [{"category": row[0], "total": float(row[1])} for row in cur.fetchall()]
        salary_ratio = round((total_salaries / total_income) * 100, 2) if total_income > 0 else 0.0
        
        expense_analysis = {
            "by_category": expense_by_category,
            "salary_ratio": salary_ratio
        }
        
        # Operational Health - Days Since Last Salary
        cur.execute(
            """
            SELECT s.id, s.first_name, s.last_name, s.last_paid_at
            FROM staff s
            WHERE s.is_active = TRUE
            ORDER BY s.last_name, s.first_name
            """
        )
        days_since_last_salary = []
        for row in cur.fetchall():
            last_paid = row[3]
            days_since = (end_date - last_paid).days if last_paid else None
            days_since_last_salary.append({
                "id": row[0],
                "name": f"{row[1]} {row[2]}",
                "days": days_since
            })

        # 2. Fetch Graph Data
        graph_data = []
        
        if period == "day":
            # Hourly breakdown (0-23)
            # Income
            cur.execute(
                """
                SELECT EXTRACT(HOUR FROM created_at) as h, SUM(amount)
                FROM income_records
                WHERE service_date = %s
                GROUP BY h
                """,
                (start_date,)
            )
            hourly_income = {int(r[0]): float(r[1]) for r in cur.fetchall()}
            
            # Outcome
            cur.execute(
                """
                SELECT EXTRACT(HOUR FROM t) as h, SUM(amt)
                FROM (
                    SELECT created_at as t, amount as amt FROM outcome_records WHERE expense_date = %s
                    UNION ALL
                    SELECT created_at as t, amount as amt FROM salary_payments WHERE payment_date = %s
                ) combined
                GROUP BY h
                """,
                (start_date, start_date)
            )
            hourly_outcome = {int(r[0]): float(r[1]) for r in cur.fetchall()}
            
            for h in range(24):
                label = f"{h:02d}:00"
                val = hourly_income.get(h, 0.0)
                out = hourly_outcome.get(h, 0.0)
                graph_data.append({
                    "label": label,
                    "value": val,
                    "outcome": out,
                    "key": start_date.isoformat(),
                    "type": "hour"
                })

        elif period == "week" or period == "month":
            # Daily breakdown
            # Income
            cur.execute(
                """
                SELECT service_date, SUM(amount)
                FROM income_records
                WHERE service_date BETWEEN %s AND %s
                GROUP BY service_date
                ORDER BY service_date
                """,
                (start_date, end_date)
            )
            daily_income = {r[0]: float(r[1]) for r in cur.fetchall()}
            
            # Outcome (combine outcome_records and salary_payments)
            cur.execute(
                """
                SELECT d, SUM(amt)
                FROM (
                    SELECT expense_date as d, amount as amt FROM outcome_records WHERE expense_date BETWEEN %s AND %s
                    UNION ALL
                    SELECT payment_date as d, amount as amt FROM salary_payments WHERE payment_date BETWEEN %s AND %s
                ) combined
                GROUP BY d
                ORDER BY d
                """,
                (start_date, end_date, start_date, end_date)
            )
            daily_outcome = {r[0]: float(r[1]) for r in cur.fetchall()}
            
            curr = start_date
            while curr <= end_date:
                label = curr.strftime("%A") if period == "week" else curr.strftime("%d") # Mon/Tue or 1/2/3
                val = daily_income.get(curr, 0.0)
                out = daily_outcome.get(curr, 0.0)
                graph_data.append({
                    "label": label,
                    "value": val,
                    "outcome": out,
                    "key": curr.isoformat(), # For navigation to day view
                    "type": "day"
                })
                curr += timedelta(days=1)

        elif period == "year":
            # Monthly breakdown
            # Income
            cur.execute(
                """
                SELECT EXTRACT(MONTH FROM service_date) as m, SUM(amount)
                FROM income_records
                WHERE service_date BETWEEN %s AND %s
                GROUP BY m
                ORDER BY m
                """,
                (start_date, end_date)
            )
            monthly_income = {int(r[0]): float(r[1]) for r in cur.fetchall()}
            
            # Outcome
            cur.execute(
                """
                SELECT EXTRACT(MONTH FROM d) as m, SUM(amt)
                FROM (
                    SELECT expense_date as d, amount as amt FROM outcome_records WHERE expense_date BETWEEN %s AND %s
                    UNION ALL
                    SELECT payment_date as d, amount as amt FROM salary_payments WHERE payment_date BETWEEN %s AND %s
                ) combined
                GROUP BY m
                ORDER BY m
                """,
                (start_date, end_date, start_date, end_date)
            )
            monthly_outcome = {int(r[0]): float(r[1]) for r in cur.fetchall()}
            
            for m in range(1, 13):
                label = calendar.month_name[m]
                val = monthly_income.get(m, 0.0)
                out = monthly_outcome.get(m, 0.0)
                # Construct date for the 1st of that month
                month_date = date(start_date.year, m, 1)
                graph_data.append({
                    "label": label,
                    "value": val,
                    "outcome": out,
                    "key": month_date.isoformat(), # For navigation to month view
                    "type": "month"
                })
        
        # 3. Operational Health Metrics (Business Questions)
        cur.execute(
            """
            SELECT EXTRACT(DOW FROM service_date) AS dow, COUNT(*)
            FROM income_records
            WHERE service_date BETWEEN %s AND %s
            GROUP BY dow
            ORDER BY COUNT(*) DESC
            LIMIT 3
            """,
            (start_date, end_date),
        )
        busiest_rows = cur.fetchall()
        busiest_days = [{"dow": int(row[0]), "count": int(row[1])} for row in busiest_rows]

        # Outstanding Commission
        try:
            cur.execute(
                """
                SELECT s.id,
                       s.first_name,
                       s.last_name,
                       s.total_revenue,
                       s.commission_rate,
                       COALESCE(SUM(sp.amount), 0) AS paid
                FROM staff s
                JOIN staff_roles r ON r.id = s.role_id
                LEFT JOIN salary_payments sp ON sp.staff_id = s.id
                WHERE r.name = 'doctor' AND s.is_active = TRUE
                GROUP BY s.id, s.first_name, s.last_name, s.total_revenue, s.commission_rate
                """
            )
            commission_rows = cur.fetchall()
            commission_rate_default = None
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()
            cur.execute(
                """
                SELECT s.id,
                       s.first_name,
                       s.last_name,
                       s.total_revenue,
                       COALESCE(SUM(sp.amount), 0) AS paid
                FROM staff s
                JOIN staff_roles r ON r.id = s.role_id
                LEFT JOIN salary_payments sp ON sp.staff_id = s.id
                WHERE r.name = 'doctor' AND s.is_active = TRUE
                GROUP BY s.id, s.first_name, s.last_name, s.total_revenue
                """
            )
            commission_rows = cur.fetchall()
            commission_rate_default = config.DOCTOR_COMMISSION_RATE
            
        outstanding_commission = []
        if commission_rate_default is None:
            for row in commission_rows:
                total_revenue = float(row[3] or 0)
                commission_rate = float(row[4] or 0)
                paid = float(row[5] or 0)
                outstanding = max(total_revenue * commission_rate - paid, 0)
                if outstanding > 0:
                    outstanding_commission.append(
                        {
                            "id": int(row[0]),
                            "name": " ".join(filter(None, [row[1], row[2]])).strip(),
                            "amount": round(outstanding, 2),
                        }
                    )
        else:
            for row in commission_rows:
                total_revenue = float(row[3] or 0)
                paid = float(row[4] or 0)
                outstanding = max(total_revenue * commission_rate_default - paid, 0)
                if outstanding > 0:
                    outstanding_commission.append(
                        {
                            "id": int(row[0]),
                            "name": " ".join(filter(None, [row[1], row[2]])).strip(),
                            "amount": round(outstanding, 2),
                        }
                    )

        # 4. Detailed Stats (if Day view) - keep existing logic
        details = {}
        if period == "day":
            # Highest earning doctor
            cur.execute(
                """
                SELECT s.first_name, s.last_name, SUM(ir.amount) as total
                FROM income_records ir
                JOIN staff s ON s.id = ir.doctor_id
                WHERE ir.service_date = %s
                GROUP BY s.id
                ORDER BY total DESC
                LIMIT 1
                """,
                (start_date,)
            )
            top_doc = cur.fetchone()
            details["highest_earning_doctor"] = {
                "name": f"{top_doc[0]} {top_doc[1]}",
                "amount": float(top_doc[2])
            } if top_doc else None
            
            # Revenue breakdown
            cur.execute(
                """
                SELECT payment_method, SUM(amount)
                FROM income_records
                WHERE service_date = %s
                GROUP BY payment_method
                """,
                (start_date,)
            )
            details["revenue_breakdown"] = {r[0]: float(r[1]) for r in cur.fetchall()}
            
            # Appointment types (using note as proxy or random if not structured)
            # Assuming 'note' contains type or we just show notes
            cur.execute(
                """
                SELECT note, COUNT(*)
                FROM income_records
                WHERE service_date = %s AND note IS NOT NULL
                GROUP BY note
                LIMIT 5
                """,
                (start_date,)
            )
            details["appointment_types"] = [{"type": r[0], "count": r[1]} for r in cur.fetchall()]

    finally:
        release_connection(conn)
        
    return jsonify({
        "period": period,
        "date": ref_date.isoformat(),
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "stats": stats,
        "graph": graph_data,
        "details": details,
        "financial_overview": financial_overview,
        "patient_insights": patient_insights,
        "doctor_performance": doctor_performance,
        "expense_analysis": expense_analysis,
        "operational_health": {
            "busiest_days": [{"dow": int(d.get("dow", 0)), "count": int(d.get("count", 0))} for d in busiest_days] if busiest_days else [],
            "outstanding_commission": outstanding_commission,
            "days_since_last_salary": days_since_last_salary
        }
    })


@clinic_bp.route("/dashboard/stats", methods=["GET"])
def get_dashboard_stats():
    granularity = request.args.get("granularity", "month")  # day, week, month, year
    
    today = date.today()
    start_param = request.args.get("start")
    end_param = request.args.get("end")
    date_param = request.args.get("date")

    # Determine date range based on granularity
    if granularity == "day":
        target_date = parse_date(date_param) if date_param else today
        start = target_date
        end = target_date
    else:
        start = parse_date(start_param) if start_param else today.replace(day=1)
        end = parse_date(end_param) if end_param else today

    conn = get_connection()
    try:
        cur = conn.cursor()
        
        data = []
        labels = []
        
        if granularity == "day":
            # Hourly breakdown for a specific day
            # Income
            cur.execute(
                """
                SELECT EXTRACT(HOUR FROM service_time) as h, COALESCE(SUM(amount), 0)
                FROM income_records
                WHERE service_date = %s
                GROUP BY h
                ORDER BY h
                """,
                (start,)
            )
            income_rows = {int(r[0]): float(r[1]) for r in cur.fetchall()}
            
            # Outcome
            cur.execute(
                """
                SELECT EXTRACT(HOUR FROM expense_time) as h, COALESCE(SUM(amount), 0)
                FROM outcome_records
                WHERE expense_date = %s
                GROUP BY h
                ORDER BY h
                """,
                (start,)
            )
            outcome_rows = {int(r[0]): float(r[1]) for r in cur.fetchall()}
            
            # Salaries (usually no time, assume 00:00 or spread? For now ignore or put at 0)
            # Salaries are usually daily. Maybe just show as a separate stat or at noon?
            # User requirement: "Day view: Display hourly timestamps"
            # We will generate 0-23 hours
            for h in range(24):
                time_label = f"{h:02d}:00"
                inc = income_rows.get(h, 0.0)
                out = outcome_rows.get(h, 0.0)
                data.append({
                    "label": time_label,
                    "income": inc,
                    "outcome": out,
                    "timestamp": f"{start.isoformat()}T{time_label}" # Pseudo ISO for clicking
                })

        elif granularity == "year":
            # Monthly breakdown
            # Income
            cur.execute(
                """
                SELECT TO_CHAR(service_date, 'YYYY-MM'), COALESCE(SUM(amount), 0)
                FROM income_records
                WHERE service_date BETWEEN %s AND %s
                GROUP BY 1
                ORDER BY 1
                """,
                (start, end)
            )
            income_rows = {r[0]: float(r[1]) for r in cur.fetchall()}
            
            # Outcome
            cur.execute(
                """
                SELECT TO_CHAR(expense_date, 'YYYY-MM'), COALESCE(SUM(amount), 0)
                FROM outcome_records
                WHERE expense_date BETWEEN %s AND %s
                GROUP BY 1
                ORDER BY 1
                """,
                (start, end)
            )
            outcome_rows = {r[0]: float(r[1]) for r in cur.fetchall()}
            
            # Salaries
            cur.execute(
                """
                SELECT TO_CHAR(payment_date, 'YYYY-MM'), COALESCE(SUM(amount), 0)
                FROM salary_payments
                WHERE payment_date BETWEEN %s AND %s
                GROUP BY 1
                ORDER BY 1
                """,
                (start, end)
            )
            salary_rows = {r[0]: float(r[1]) for r in cur.fetchall()}
            
            # Generate months in range
            curr = start.replace(day=1)
            while curr <= end:
                key = curr.strftime("%Y-%m")
                month_label = curr.strftime("%B") # Full month name
                inc = income_rows.get(key, 0.0)
                out = outcome_rows.get(key, 0.0) + salary_rows.get(key, 0.0)
                data.append({
                    "label": month_label,
                    "key": key, # For navigation
                    "income": inc,
                    "outcome": out
                })
                # Move to next month
                if curr.month == 12:
                    curr = curr.replace(year=curr.year + 1, month=1)
                else:
                    curr = curr.replace(month=curr.month + 1)
                    
        else:
            # Week/Month view -> Daily breakdown
            # Use daily_pnl view
            cur.execute(
                """
                SELECT day, total_income, total_outcome
                FROM daily_pnl
                WHERE day BETWEEN %s AND %s
                ORDER BY day
                """,
                (start, end)
            )
            rows = cur.fetchall()
            row_map = {r[0].isoformat(): {"income": float(r[1]), "outcome": float(r[2])} for r in rows}
            
            # Fill all days
            curr = start
            while curr <= end:
                key = curr.isoformat()
                val = row_map.get(key, {"income": 0.0, "outcome": 0.0})
                
                # Label format
                if granularity == "week":
                    label = curr.strftime("%A") # Monday, Tuesday...
                else:
                    label = curr.strftime("%d") # 1, 2...
                    
                data.append({
                    "label": label,
                    "key": key,
                    "income": val["income"],
                    "outcome": val["outcome"]
                })
                curr += timedelta(days=1)

    finally:
        release_connection(conn)

    return jsonify(data)


@clinic_bp.route("/dashboard/day-details", methods=["GET"])
def get_day_details():
    date_param = request.args.get("date")
    if not date_param:
        return jsonify({"error": "date_required"}), 400
    
    target_date = parse_date(date_param)
    conn = get_connection()
    try:
        cur = conn.cursor()
        
        # 1. Highest earning doctor
        cur.execute(
            """
            SELECT s.id, s.first_name, s.last_name, SUM(ir.amount) as total
            FROM income_records ir
            JOIN staff s ON s.id = ir.doctor_id
            WHERE ir.service_date = %s
            GROUP BY s.id
            ORDER BY total DESC
            LIMIT 1
            """,
            (target_date,)
        )
        doctor_row = cur.fetchone()
        highest_earning_doctor = None
        if doctor_row:
            highest_earning_doctor = {
                "id": doctor_row[0],
                "name": f"{doctor_row[1]} {doctor_row[2]}",
                "amount": float(doctor_row[3])
            }
            
        # 2. Revenue Breakdown (Cash/Card)
        cur.execute(
            """
            SELECT payment_method, SUM(amount)
            FROM income_records
            WHERE service_date = %s
            GROUP BY payment_method
            """,
            (target_date,)
        )
        revenue_breakdown = {r[0]: float(r[1]) for r in cur.fetchall()}
        
        # 3. Patient Count
        cur.execute(
            """
            SELECT COUNT(DISTINCT patient_id)
            FROM income_records
            WHERE service_date = %s
            """,
            (target_date,)
        )
        patient_count = int(cur.fetchone()[0] or 0)
        
        # 4. Metrics
        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0) FROM income_records WHERE service_date = %s
            """,
            (target_date,)
        )
        total_income = float(cur.fetchone()[0] or 0)
        
        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0) FROM outcome_records WHERE expense_date = %s
            """,
            (target_date,)
        )
        total_expenses = float(cur.fetchone()[0] or 0)
        
        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0) FROM salary_payments WHERE payment_date = %s
            """,
            (target_date,)
        )
        total_salaries = float(cur.fetchone()[0] or 0)
        
        # 5. Appointment Types (derived from note if possible, or just list recent)
        # We will list top 5 notes/types
        cur.execute(
            """
            SELECT note, COUNT(*)
            FROM income_records
            WHERE service_date = %s AND note IS NOT NULL AND note != ''
            GROUP BY note
            ORDER BY COUNT(*) DESC
            LIMIT 5
            """,
            (target_date,)
        )
        appointment_types = [{"type": r[0], "count": r[1]} for r in cur.fetchall()]
        
        return jsonify({
            "date": target_date.isoformat(),
            "metrics": {
                "total_income": total_income,
                "total_outcome": total_expenses + total_salaries,
                "net_profit": total_income - (total_expenses + total_salaries)
            },
            "highest_earning_doctor": highest_earning_doctor,
            "revenue_breakdown": revenue_breakdown,
            "patient_count": patient_count,
            "appointment_types": appointment_types
        })
        
    finally:
        release_connection(conn)
