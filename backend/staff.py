from datetime import date, datetime, time, timedelta, timezone
import binascii
import base64
import hashlib
import hmac
import io
import json
import math
import logging
import os
import uuid
from typing import Any, Dict, List, Optional, Tuple

import psycopg2
from flask import Blueprint, jsonify, request, Response, send_file

from .config import config
from .db import get_connection, release_connection


staff_bp = Blueprint("staff", __name__)
logger = logging.getLogger(__name__)

# Global cache for schema checks to improve performance
_VERIFIED_SCHEMAS = set()

def validate_salary(value: Any) -> float:
    try:
        amount = float(value)
    except (TypeError, ValueError):
        raise ValueError("invalid_salary")
    if not math.isfinite(amount) or amount < 0:
        raise ValueError("invalid_salary")
    return round(amount, 2)


def ensure_weekend_salary_column(conn) -> None:
    if "staff_weekend_salary" in _VERIFIED_SCHEMAS:
        return
    cur = conn.cursor()
    cur.execute(
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'staff' AND column_name = 'weekend_salary'
        """
    )
    if cur.fetchone():
        _VERIFIED_SCHEMAS.add("staff_weekend_salary")
        return
    cur.execute("ALTER TABLE staff ADD COLUMN IF NOT EXISTS weekend_salary NUMERIC(12, 2) NOT NULL DEFAULT 200")
    conn.commit()
    _VERIFIED_SCHEMAS.add("staff_weekend_salary")


def validate_medicine_name(value: Any) -> str:
    name = str(value or "").strip()
    if len(name) < 2 or len(name) > 150:
        raise ValueError("invalid_medicine_name")
    return name


def get_authenticated_staff() -> Optional[Dict[str, Any]]:
    staff_id_value = request.headers.get("X-Staff-Id")
    role = request.headers.get("X-Staff-Role") or ""
    if not staff_id_value:
        return None
    try:
        staff_id = int(staff_id_value)
    except (TypeError, ValueError):
        return None
    return {"id": staff_id, "role": role}


def ensure_staff_authorized(staff_id: int) -> Optional[Response]:
    auth = get_authenticated_staff()
    if not auth:
        return jsonify({"error": "unauthorized"}), 401
    role = str(auth.get("role") or "").lower()
    if role in {"admin", "administrator"}:
        return None
    if auth["id"] != staff_id:
        return jsonify({"error": "forbidden"}), 403
    return None


def get_documents_base_dir() -> str:
    base_dir = os.path.join(os.path.dirname(__file__), "documents", "salary_reports")
    os.makedirs(base_dir, exist_ok=True)
    return base_dir


def ensure_staff_documents_table(conn) -> None:
    if "staff_documents" in _VERIFIED_SCHEMAS:
        return
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS staff_documents (
            id              SERIAL PRIMARY KEY,
            staff_id        INT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
            document_type   VARCHAR(60) NOT NULL,
            period_from     DATE,
            period_to       DATE,
            signed_at       TIMESTAMPTZ,
            signer_name     VARCHAR(150) NOT NULL,
            signature_hash  VARCHAR(64) NOT NULL,
            signature_token VARCHAR(64),
            file_path       TEXT NOT NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_staff_documents_staff ON staff_documents(staff_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_staff_documents_type ON staff_documents(document_type)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_staff_documents_period ON staff_documents(period_from, period_to)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_staff_documents_signed_at ON staff_documents(signed_at)")
    _VERIFIED_SCHEMAS.add("staff_documents")


def ensure_salary_amount_audit_table(conn) -> None:
    if "salary_amount_audit" in _VERIFIED_SCHEMAS:
        return
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS salary_amount_audit (
            id                  SERIAL PRIMARY KEY,
            staff_id            INT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
            salary_payment_id   INT REFERENCES salary_payments(id) ON DELETE SET NULL,
            previous_amount     NUMERIC(12, 2) NOT NULL,
            new_amount          NUMERIC(12, 2) NOT NULL,
            delta_amount        NUMERIC(12, 2) NOT NULL,
            change_source       VARCHAR(40) NOT NULL,
            change_reason       TEXT,
            changed_by_staff_id INT,
            metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_salary_amount_audit_staff ON salary_amount_audit(staff_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_salary_amount_audit_payment ON salary_amount_audit(salary_payment_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_salary_amount_audit_created ON salary_amount_audit(created_at DESC)")
    _VERIFIED_SCHEMAS.add("salary_amount_audit")


def ensure_shifts_salary_payment_column(conn) -> None:
    if "shifts_salary_payment_column" in _VERIFIED_SCHEMAS:
        return
    cur = conn.cursor()
    cur.execute(
        """
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'shifts' AND column_name = 'salary_payment_id'
        """
    )
    if cur.fetchone():
        _VERIFIED_SCHEMAS.add("shifts_salary_payment_column")
        return
    try:
        cur.execute("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'")
        cur.execute("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS approved_by INT REFERENCES staff(id)")
        cur.execute("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ")
        cur.execute("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS completion_percent NUMERIC(5, 2) NOT NULL DEFAULT 100")
        cur.execute("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS pay_multiplier NUMERIC(6, 3) NOT NULL DEFAULT 1.0")
        cur.execute("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS salary_payment_id INT REFERENCES salary_payments(id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_shifts_payment ON shifts (salary_payment_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts (status)")
    except psycopg2.errors.UndefinedTable:
        conn.rollback()
        return


def ensure_salary_outcome_category(conn) -> int:
    cur = conn.cursor()
    cur.execute("SELECT id FROM outcome_categories WHERE name = %s", ("salary",))
    row = cur.fetchone()
    if row:
        return int(row[0])
    cur.execute(
        """
        INSERT INTO outcome_categories (name)
        VALUES (%s)
        ON CONFLICT (name) DO NOTHING
        RETURNING id
        """,
        ("salary",),
    )
    row = cur.fetchone()
    if row:
        return int(row[0])
    cur.execute("SELECT id FROM outcome_categories WHERE name = %s", ("salary",))
    row = cur.fetchone()
    if not row:
        raise ValueError("salary_outcome_category_missing")
    return int(row[0])


def record_salary_amount_audit(
    conn,
    *,
    staff_id: int,
    salary_payment_id: Optional[int],
    previous_amount: float,
    new_amount: float,
    change_source: str,
    change_reason: str,
    changed_by_staff_id: Optional[int],
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    ensure_salary_amount_audit_table(conn)
    cur = conn.cursor()
    previous = round(float(previous_amount or 0), 2)
    current = round(float(new_amount or 0), 2)
    delta = round(current - previous, 2)
    metadata_payload = json.dumps(metadata or {})
    cur.execute(
        """
        INSERT INTO salary_amount_audit
            (
                staff_id,
                salary_payment_id,
                previous_amount,
                new_amount,
                delta_amount,
                change_source,
                change_reason,
                changed_by_staff_id,
                metadata
            )
        VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        """,
        (
            staff_id,
            salary_payment_id,
            previous,
            current,
            delta,
            str(change_source or "unknown"),
            (change_reason or "").strip() or None,
            changed_by_staff_id,
            metadata_payload,
        ),
    )


def parse_working_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def parse_payment_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def normalize_signature_name(value: Any) -> str:
    name = str(value or "").strip()
    if len(name) < 2 or len(name) > 120:
        raise ValueError("invalid_signer_name")
    return name


def parse_signed_at(value: Optional[str]) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    signed_value = value.strip()
    if signed_value.endswith("Z"):
        signed_value = signed_value[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(signed_value)
    except ValueError as exc:
        raise ValueError("invalid_signed_at") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def decode_signature_data(value: Any) -> bytes:
    raw_value = str(value or "").strip()
    if not raw_value:
        raise ValueError("invalid_signature_data")
    if raw_value.startswith("data:"):
        if not raw_value.startswith("data:image/png;base64,"):
            raise ValueError("invalid_signature_format")
        raw_value = raw_value.split(",", 1)[1]
    try:
        decoded = base64.b64decode(raw_value, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("invalid_signature_data") from exc
    if not decoded or len(decoded) > 250000:
        raise ValueError("invalid_signature_data")
    return decoded


def validate_signature_hash(value: Any) -> str:
    hash_value = str(value or "").strip().lower()
    if len(hash_value) != 64 or any(ch not in "0123456789abcdef" for ch in hash_value):
        raise ValueError("invalid_signature_hash")
    return hash_value


def build_signature_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    signer_name = normalize_signature_name(payload.get("signer_name"))
    signed_at_dt = parse_signed_at(payload.get("signed_at"))
    signature_bytes = decode_signature_data(payload.get("signature_data"))
    signed_at_iso = signed_at_dt.isoformat()
    signature_hash = hashlib.sha256(
        signature_bytes + signer_name.encode("utf-8") + signed_at_iso.encode("utf-8")
    ).hexdigest()
    return {
        "signer_name": signer_name,
        "signed_at": signed_at_iso,
        "signature_hash": signature_hash,
        "signature_image": signature_bytes,
    }


def build_signature_metadata(payload: Dict[str, Any]) -> Dict[str, Any]:
    signer_name = normalize_signature_name(payload.get("signer_name"))
    signed_at_dt = parse_signed_at(payload.get("signed_at"))
    signature_hash = validate_signature_hash(payload.get("signature_hash"))
    return {
        "signer_name": signer_name,
        "signed_at": signed_at_dt.isoformat(),
        "signature_hash": signature_hash,
    }


def compute_signature_token(
    staff_id: int,
    period: Dict[str, str],
    signature_hash: str,
    signer_name: str,
    signed_at: str,
) -> str:
    message = f"{staff_id}|{period['from']}|{period['to']}|{signer_name}|{signed_at}|{signature_hash}"
    return hmac.new(
        config.SECRET_KEY.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def resolve_report_period(role_name: str, last_paid_at: Optional[date], from_param: Optional[str], to_param: Optional[str]) -> Optional[Dict[str, date]]:
    today = date.today()
    start_date = None
    end_date = None
    if from_param:
        start_date = parse_payment_date(from_param)
    if to_param:
        end_date = parse_payment_date(to_param)
    if start_date and not end_date:
        end_date = today
    if end_date and not start_date:
        if role_name == "doctor":
            start_date = last_paid_at + timedelta(days=1) if last_paid_at else today.replace(day=1)
        else:
            start_date = today.replace(day=1)
    if not start_date and not end_date:
        if role_name == "doctor":
            start_date = last_paid_at + timedelta(days=1) if last_paid_at else today.replace(day=1)
            end_date = today
        else:
            start_date = today.replace(day=1)
            end_date = today
    if start_date and end_date and start_date > end_date:
        return None
    return {"start": start_date, "end": end_date}


def build_salary_report_data(staff_id: int, from_param: Optional[str], to_param: Optional[str], conn=None) -> Optional[Dict[str, Any]]:
    owns_conn = False
    if conn is None:
        conn = get_connection()
        owns_conn = True
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT s.id, s.first_name, s.last_name, s.base_salary, s.commission_rate, s.total_revenue, s.last_paid_at, r.name
            FROM staff s
            JOIN staff_roles r ON r.id = s.role_id
            WHERE s.id = %s
            """,
            (staff_id,),
        )
        staff_row = cur.fetchone()
        if not staff_row:
            return None
    finally:
        if owns_conn:
            release_connection(conn)

    role_name = staff_row[7]
    base_salary = float(staff_row[3] or 0)
    commission_rate = float(staff_row[4] or 0)
    last_paid_at = staff_row[6]

    try:
        period = resolve_report_period(role_name, last_paid_at, from_param, to_param)
    except ValueError:
        return {"error": "invalid_date_format"}
    if not period:
        return {"error": "invalid_date_range"}

    start_date = period["start"]
    end_date = period["end"]

    report = {
        "staff": {
            "id": int(staff_row[0]),
            "first_name": staff_row[1],
            "last_name": staff_row[2],
        },
        "role": role_name,
        "period": {"from": start_date.isoformat(), "to": end_date.isoformat()},
    }

    if role_name == "doctor":
        try:
            cur = conn.cursor()
            includes_lab_cost = False
            try:
                cur.execute("SELECT lab_cost FROM income_records LIMIT 0")
                includes_lab_cost = True
            except psycopg2.errors.UndefinedColumn:
                if owns_conn:
                    conn.rollback()
                cur = conn.cursor()

            cur.execute(
                """
                SELECT payment_date
                FROM salary_payments
                WHERE staff_id = %s
                ORDER BY payment_date DESC, created_at DESC
                LIMIT 1
                """,
                (staff_id,),
            )
            last_payment_row = cur.fetchone()
            last_payment_date = last_payment_row[0].isoformat() if last_payment_row else None

            if includes_lab_cost:
                cur.execute(
                    """
                    SELECT
                        p.first_name,
                        p.last_name,
                        COALESCE(SUM(ir.amount), 0) AS total_paid,
                        COALESCE(SUM(GREATEST(ir.lab_cost, 0)), 0) AS total_lab_fee
                    FROM income_records ir
                    JOIN patients p ON p.id = ir.patient_id
                    WHERE ir.doctor_id = %s
                      AND ir.salary_payment_id IS NULL
                      AND ir.service_date BETWEEN %s AND %s
                    GROUP BY p.first_name, p.last_name
                    ORDER BY total_paid DESC, p.last_name, p.first_name
                    """,
                    (staff_id, start_date, end_date),
                )
            else:
                cur.execute(
                    """
                    SELECT p.first_name, p.last_name, COALESCE(SUM(ir.amount), 0) AS total_paid, 0::numeric AS total_lab_fee
                    FROM income_records ir
                    JOIN patients p ON p.id = ir.patient_id
                    WHERE ir.doctor_id = %s
                      AND ir.salary_payment_id IS NULL
                      AND ir.service_date BETWEEN %s AND %s
                    GROUP BY p.first_name, p.last_name
                    ORDER BY total_paid DESC, p.last_name, p.first_name
                    """,
                    (staff_id, start_date, end_date),
                )
            patient_rows = cur.fetchall()

            if commission_rate == 0 and float(staff_row[5] or 0) > 0:
                commission_rate = config.DOCTOR_COMMISSION_RATE

            total_income = sum(float(row[2] or 0) for row in patient_rows)
            total_lab_fees = sum(max(float(row[3] or 0), 0.0) for row in patient_rows)
            commission_metrics = compute_doctor_commission_metrics(total_income, total_lab_fees, commission_rate)
            total_commission = commission_metrics["total_commission"]

            cur.execute(
                """
                SELECT COALESCE(SUM(amount), 0)
                FROM salary_adjustments
                WHERE staff_id = %s AND applied_to_salary_payment_id IS NULL
                """,
                (staff_id,),
            )
            adjustments = float(cur.fetchone()[0] or 0)
        except Exception:
            raise
        finally:
            if owns_conn:
                release_connection(conn)

        report["last_payment_date"] = last_payment_date
        report["patients"] = [
            {
                "name": (" ".join(filter(None, [row[0], row[1]])).strip() or "Unknown patient"),
                "total_paid": float(row[2] or 0),
                "lab_fee": max(float(row[3] or 0), 0.0),
                "net_paid": max(float(row[2] or 0) - max(float(row[3] or 0), 0.0), 0.0),
            }
            for row in patient_rows
        ]
        adjusted_total_salary = round(base_salary + total_commission + adjustments, 2)
        report["summary"] = {
            "base_salary": round(base_salary, 2),
            "commission_rate": round(commission_rate, 4),
            "total_income": round(total_income, 2),
            "commission_base_income": commission_metrics["commission_base_income"],
            "total_commission": round(total_commission, 2),
            "total_lab_fees": round(total_lab_fees, 2),
            "negative_balance": commission_metrics["negative_balance"],
            "adjustments": round(adjustments, 2),
            "total_salary": adjusted_total_salary,
            "adjusted_total_salary": adjusted_total_salary,
        }
    else:
        try:
            cur = conn.cursor()
            try:
                ensure_shifts_salary_payment_column(conn)
                period_start = datetime.combine(start_date, time.min)
                period_end = datetime.combine(end_date + timedelta(days=1), time.min)
                cur.execute(
                    """
                    SELECT start_time, end_time, note, COALESCE(completion_percent, 100), COALESCE(pay_multiplier, 1.0)
                    FROM shifts
                    WHERE staff_id = %s 
                      AND start_time >= %s AND end_time < %s
                      AND status = 'accepted'
                      AND salary_payment_id IS NULL
                    ORDER BY start_time ASC
                    """,
                    (staff_id, period_start, period_end),
                )
                shift_rows = cur.fetchall()
            except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedColumn):
                if owns_conn:
                    conn.rollback()
                cur = conn.cursor()
                try:
                    cur.execute(
                        """
                        SELECT start_time, end_time, note, 100::numeric, 1.0::numeric
                        FROM shifts
                        WHERE staff_id = %s 
                          AND start_time >= %s AND end_time < %s
                          AND status IN ('accepted', 'approved')
                          AND salary_payment_id IS NULL
                        ORDER BY start_time ASC
                        """,
                        (staff_id, period_start, period_end),
                    )
                    shift_rows = cur.fetchall()
                except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedColumn):
                    if owns_conn:
                        conn.rollback()
                    shift_rows = []
        except Exception:
            raise
        finally:
            if owns_conn:
                release_connection(conn)

        total_hours = 0.0
        timesheets = []
        for row in shift_rows:
            s_time, e_time, note, completion_percent, pay_multiplier = row
            duration = max((e_time - s_time).total_seconds() / 3600.0, 0.0)
            payable_hours = duration * (float(completion_percent or 100) / 100.0)
            weighted_hours = payable_hours
            total_hours += weighted_hours
            timesheets.append({
                "date": s_time.date().isoformat(),
                "start_time": s_time.strftime("%H:%M"),
                "end_time": e_time.strftime("%H:%M"),
                "hours": round(duration, 2),
                "payable_hours": round(payable_hours, 2),
                "pay_multiplier": round(float(pay_multiplier or 1.0), 3),
                "weighted_hours": round(weighted_hours, 2),
                "note": note or "",
                "status": "accepted"
            })

        working_days = len({row[0].date() for row in shift_rows})
        report["summary"] = {
            "working_days": working_days,
            "total_hours": round(total_hours, 2),
            "base_salary": round(base_salary, 2),
            "total_salary": round(total_hours * base_salary, 2),
        }
        report["timesheets"] = timesheets

    return report


def apply_report_amount_override(report: Dict[str, Any], amount_override: Optional[float]) -> Dict[str, Any]:
    if not report or amount_override is None:
        return report
    summary = report.get("summary")
    if not isinstance(summary, dict):
        return report
    previous_total = round(float(summary.get("total_salary") or 0), 2)
    override_total = round(float(amount_override), 2)
    summary["computed_total_salary"] = previous_total
    summary["total_salary"] = override_total
    summary["amount_delta"] = round(override_total - previous_total, 2)
    summary["amount_override_applied"] = not math.isclose(previous_total, override_total, rel_tol=0.0, abs_tol=0.009)
    return report


def compute_doctor_commission_metrics(total_income: float, total_lab_fees: float, commission_rate: float) -> Dict[str, float]:
    gross_income = round(float(total_income or 0), 2)
    lab_fees = round(max(float(total_lab_fees or 0), 0.0), 2)
    commission_base_income = round(max(gross_income - lab_fees, 0.0), 2)
    negative_balance = round(max(lab_fees - gross_income, 0.0), 2)
    total_commission = round(commission_base_income * float(commission_rate or 0), 2)
    return {
        "total_income": gross_income,
        "total_lab_fees": lab_fees,
        "commission_base_income": commission_base_income,
        "negative_balance": negative_balance,
        "total_commission": total_commission,
    }


def save_salary_report(staff_id: int, report: Dict[str, Any], signature_info: Dict[str, Any], conn=None) -> Tuple[Optional[bytes], Optional[str], Optional[str]]:
    """Generates, stores, and records a signed salary report PDF.
    Returns (pdf_data, filename, error_message)."""
    try:
        pdf_data = build_salary_report_pdf(report, signature_info)
    except Exception as exc:
        logger.exception("PDF generation failed for staff %s: %s", staff_id, exc)
        return None, None, "pdf_generation_failed"

    signed_date = signature_info["signed_at"][:10]
    staff_dir = os.path.join(get_documents_base_dir(), f"staff_{staff_id}")
    os.makedirs(staff_dir, exist_ok=True)
    filename = f"{signature_info['signer_name']} Salary Report {signed_date}.pdf"
    file_path = os.path.join(staff_dir, filename)
    try:
        with open(file_path, "wb") as handle:
            handle.write(pdf_data)
    except OSError as exc:
        logger.exception("Failed to write salary report file for staff %s: %s", staff_id, exc)
        return None, None, "document_storage_failed"

    owns_conn = False
    if conn is None:
        conn = get_connection()
        owns_conn = True
    try:
        cur = conn.cursor()
        ensure_staff_documents_table(conn)
        cur.execute(
            """
            INSERT INTO staff_documents
                (staff_id, document_type, period_from, period_to, signed_at, signer_name, signature_hash, signature_token, file_path)
            VALUES
                (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                staff_id,
                "salary_report",
                report["period"]["from"],
                report["period"]["to"],
                signature_info["signed_at"],
                signature_info["signer_name"],
                signature_info["signature_hash"],
                signature_info["signature_token"],
                file_path,
            ),
        )
        if owns_conn:
            conn.commit()
    except Exception as exc:
        if owns_conn:
            conn.rollback()
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                logger.exception("Failed to cleanup salary report file for staff %s", staff_id)
        logger.exception("Failed to record salary document metadata: %s", exc)
        return None, None, "document_storage_failed"
    finally:
        if owns_conn:
            release_connection(conn)
    return pdf_data, filename, None


def get_role_id(conn, role_name: str) -> Optional[int]:
    cur = conn.cursor()
    cur.execute(
        "SELECT id FROM staff_roles WHERE name = %s",
        (role_name,),
    )
    row = cur.fetchone()
    return int(row[0]) if row else None


def build_salary_report_pdf(report: Dict[str, Any], signature_info: Optional[Dict[str, Any]]) -> bytes:
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.lib.utils import ImageReader
        from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, KeepTogether, HRFlowable
    except Exception as exc:
        logger.exception("PDF dependency error: %s", exc)
        raise

    def normalize_signature_image(value: Any) -> Optional[Any]:
        if value is None:
            return None
        if isinstance(value, (bytes, bytearray)):
            return io.BytesIO(bytes(value))
        if isinstance(value, io.BytesIO):
            return value
        if isinstance(value, (str, os.PathLike)):
            return value
        if isinstance(value, ImageReader):
            stream = getattr(value, "fp", None)
            if stream and hasattr(stream, "read"):
                try:
                    stream.seek(0)
                except Exception:
                    pass
                data = stream.read()
                if data:
                    return io.BytesIO(data)
            file_name = getattr(value, "fileName", None)
            if file_name:
                return file_name
            return None
        return None

    def sanitize_signature_image(value: Any) -> Optional[Any]:
        if value is None:
            return None
        try:
            from PIL import Image as PILImage
        except Exception:
            return value
        try:
            if isinstance(value, (str, os.PathLike)) or hasattr(value, "read"):
                if hasattr(value, "seek"):
                    try:
                        value.seek(0)
                    except Exception:
                        pass

                with PILImage.open(value) as img:
                    img = img.convert("RGBA")
                    if img.width > 800:
                        ratio = 800.0 / img.width
                        new_size = (800, int(img.height * ratio))
                        img = img.resize(new_size, PILImage.Resampling.LANCZOS)
                    r, g, b, a = img.split()
                    gray = img.convert("L")
                    white_mask = gray.point(lambda x: 255 if x > 245 else 0, mode="1")
                    high_alpha = a.point(lambda x: max(x, 220))
                    new_alpha = PILImage.composite(high_alpha, a, white_mask)
                    black_band = PILImage.new("L", img.size, 0)
                    res_img = PILImage.merge("RGBA", (black_band, black_band, black_band, new_alpha))
                    output = io.BytesIO()
                    res_img.save(output, format="PNG")
                    output.seek(0)
                    return output
        except Exception as exc:
            logger.warning("Signature optimization failed: %s", exc)
            return None
        return value

    def format_money(value: Any) -> str:
        amount = float(value or 0)
        return f"{amount:,.2f} CZK"

    page_w = A4[0]
    content_w = page_w - 32 * mm

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=20 * mm,
    )
    styles = getSampleStyleSheet()
    elements = []
    dark = colors.HexColor("#111827")
    border_color = colors.HexColor("#d6d8e1")
    header_bg = colors.HexColor("#1f2937")
    muted_text = colors.HexColor("#6b7280")
    accent = colors.HexColor("#f97316")

    normal_style = ParagraphStyle("N", parent=styles["Normal"], fontName="Helvetica", fontSize=9.5, leading=13, textColor=dark)
    bold_style = ParagraphStyle("B", parent=normal_style, fontName="Helvetica-Bold")
    value_style = ParagraphStyle("V", parent=normal_style, alignment=TA_RIGHT)
    value_bold = ParagraphStyle("VB", parent=value_style, fontName="Helvetica-Bold")
    title_style = ParagraphStyle("T", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=dark, alignment=TA_LEFT, spaceAfter=2)
    subtitle_style = ParagraphStyle("ST", parent=normal_style, fontName="Helvetica-Bold", fontSize=10, textColor=accent, spaceAfter=6)
    section_style = ParagraphStyle("S", parent=normal_style, fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=dark, spaceBefore=14, spaceAfter=6)
    muted_style = ParagraphStyle("M", parent=normal_style, fontSize=8.5, leading=11, textColor=muted_text)
    total_label = ParagraphStyle("TL", parent=normal_style, fontName="Helvetica-Bold", fontSize=11, textColor=dark)
    total_value = ParagraphStyle("TV", parent=normal_style, fontName="Helvetica-Bold", fontSize=11, textColor=dark, alignment=TA_RIGHT)

    staff_name = " ".join(filter(None, [report["staff"]["first_name"], report["staff"]["last_name"]])).strip() or "Unknown"
    period_from = report["period"]["from"]
    period_to = report["period"]["to"]

    # ── Header ──
    elements.append(Paragraph("KarlinDent", subtitle_style))
    elements.append(Paragraph("Salary Report", title_style))
    elements.append(Spacer(1, 4))

    meta_data = [
        [Paragraph("Employee", bold_style), Paragraph(staff_name, normal_style)],
        [Paragraph("Position", bold_style), Paragraph(str(report.get("role", "")).title(), normal_style)],
        [Paragraph("Period", bold_style), Paragraph(f"{period_from}  —  {period_to}", normal_style)],
    ]
    meta_table = Table(meta_data, colWidths=[30 * mm, content_w - 30 * mm])
    meta_table.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, border_color),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(meta_table)

    summary = report.get("summary", {})

    if report["role"] == "doctor":
        # ── Patient breakdown ──
        last_payment_date = report.get("last_payment_date") or "—"
        elements.append(Paragraph("Patient Revenue", section_style))
        elements.append(Paragraph(f"Since last payment: {last_payment_date}", muted_style))
        elements.append(Spacer(1, 4))

        hdr_style = ParagraphStyle("TH", parent=normal_style, fontName="Helvetica-Bold", fontSize=9, textColor=colors.whitesmoke)
        hdr_r_style = ParagraphStyle("THR", parent=hdr_style, alignment=TA_RIGHT)
        table_data = [[Paragraph("Patient", hdr_style), Paragraph("Revenue", hdr_r_style), Paragraph("Lab", hdr_r_style), Paragraph("Net", hdr_r_style)]]
        for row in report.get("patients", []):
            table_data.append([
                Paragraph(str(row["name"]), normal_style),
                Paragraph(format_money(row.get("total_paid", 0)), value_style),
                Paragraph(format_money(row.get("lab_fee", 0)), value_style),
                Paragraph(format_money(row.get("net_paid", 0)), value_style),
            ])
        if len(table_data) == 1:
            table_data.append([Paragraph("No records", normal_style), Paragraph("—", value_style), Paragraph("—", value_style), Paragraph("—", value_style)])

        table = Table(table_data, colWidths=[content_w - 90 * mm, 30 * mm, 30 * mm, 30 * mm])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), header_bg),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, border_color),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
        ]))
        elements.append(table)
        elements.append(Spacer(1, 10))

        # ── Summary ──
        elements.append(Paragraph("Calculation", section_style))
        summary_rows = [
            [Paragraph("Base Salary", normal_style), Paragraph(format_money(summary.get("base_salary", 0)), value_style)],
            [Paragraph("Commission Base (after lab fees)", normal_style), Paragraph(format_money(summary.get("commission_base_income", 0)), value_style)],
            [Paragraph(f"Commission ({summary.get('commission_rate', 0) * 100:.0f}%)", normal_style), Paragraph(format_money(summary.get("total_commission", 0)), value_style)],
            [Paragraph("Lab Fees (deducted)", normal_style), Paragraph(format_money(summary.get("total_lab_fees", 0)), value_style)],
        ]
        adj = float(summary.get("adjustments", 0))
        if adj != 0:
            summary_rows.append([Paragraph("Adjustments", normal_style), Paragraph(format_money(adj), value_style)])
        summary_table = Table(summary_rows, colWidths=[content_w - 50 * mm, 50 * mm])
        summary_table.setStyle(TableStyle([
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, border_color),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        elements.append(summary_table)

    else:
        # ── Non-doctor: timesheet ──
        elements.append(Paragraph("Work Schedule", section_style))

        hdr_style = ParagraphStyle("TH", parent=normal_style, fontName="Helvetica-Bold", fontSize=9, textColor=colors.whitesmoke)
        hdr_r_style = ParagraphStyle("THR", parent=hdr_style, alignment=TA_RIGHT)
        schedule_data = [[Paragraph("Date", hdr_style), Paragraph("Time", hdr_style), Paragraph("Hours", hdr_r_style), Paragraph("Note", hdr_style)]]
        for row in report.get("timesheets", []):
            time_range = f"{row['start_time']} – {row['end_time']}".strip(" –")
            schedule_data.append([
                Paragraph(row["date"], normal_style),
                Paragraph(time_range or "—", normal_style),
                Paragraph(f"{float(row['hours'] or 0):.2f}", value_style),
                Paragraph(str(row["note"] or ""), normal_style),
            ])
        if len(schedule_data) == 1:
            schedule_data.append([Paragraph("No shifts", normal_style), Paragraph("", normal_style), Paragraph("0.00", value_style), Paragraph("", normal_style)])

        schedule_table = Table(schedule_data, colWidths=[28 * mm, 40 * mm, 18 * mm, content_w - 86 * mm])
        schedule_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), header_bg),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, border_color),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
        ]))
        elements.append(schedule_table)
        elements.append(Spacer(1, 10))

        # ── Summary ──
        elements.append(Paragraph("Calculation", section_style))
        summary_rows = [
            [Paragraph("Working Days", normal_style), Paragraph(str(summary.get("working_days", 0)), value_style)],
            [Paragraph("Total Hours", normal_style), Paragraph(f"{summary.get('total_hours', 0):.2f}", value_style)],
            [Paragraph("Hourly Rate", normal_style), Paragraph(format_money(summary.get("base_salary", 0)), value_style)],
        ]
        adj = float(summary.get("adjustments", 0))
        if adj != 0:
            summary_rows.append([Paragraph("Adjustments", normal_style), Paragraph(format_money(adj), value_style)])
        summary_table = Table(summary_rows, colWidths=[content_w - 50 * mm, 50 * mm])
        summary_table.setStyle(TableStyle([
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, border_color),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        elements.append(summary_table)

    # ── Total (bold, highlighted) ──
    elements.append(Spacer(1, 6))
    total_salary = summary.get("total_salary", 0)
    total_row = Table(
        [[Paragraph("Total Salary", total_label), Paragraph(format_money(total_salary), total_value)]],
        colWidths=[content_w - 50 * mm, 50 * mm],
    )
    total_row.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fff7ed")),
        ("BOX", (0, 0), (-1, -1), 0.6, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(total_row)

    # ── Signature block (inline flowable — never overlaps content) ──
    if signature_info:
        elements.append(Spacer(1, 20))
        sig_elements = []
        sig_elements.append(HRFlowable(width="100%", thickness=0.5, color=border_color, spaceBefore=0, spaceAfter=8))

        signer_name_val = str(signature_info.get("signer_name") or "")
        signed_at_raw = str(signature_info.get("signed_at") or "")
        # Format date nicely — strip UTC timezone info
        try:
            from datetime import datetime as _dt
            _parsed = _dt.fromisoformat(signed_at_raw.replace("Z", "+00:00"))
            signed_at_display = _parsed.strftime("%d %b %Y, %H:%M")
        except Exception:
            signed_at_display = signed_at_raw

        sig_meta = Table([
            [Paragraph("Signed by", bold_style), Paragraph(signer_name_val, normal_style),
             Paragraph("Date", bold_style), Paragraph(signed_at_display, normal_style)],
        ], colWidths=[22 * mm, (content_w / 2) - 22 * mm, 16 * mm, (content_w / 2) - 16 * mm])
        sig_meta.setStyle(TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        sig_elements.append(sig_meta)

        # Signature image
        signature_canvas_image = None
        if signature_info.get("signature_image"):
            image_source = normalize_signature_image(signature_info["signature_image"])
            if image_source:
                image_source = sanitize_signature_image(image_source)
            if image_source:
                try:
                    sig_img = Image(image_source, width=70 * mm, height=18 * mm)
                    sig_img.hAlign = "LEFT"
                    sig_elements.append(Spacer(1, 4))
                    sig_elements.append(sig_img)
                except Exception as exc:
                    logger.warning("Signature image skipped: %s", exc)

        sig_elements.append(Spacer(1, 6))
        sig_elements.append(Paragraph(
            "By signing, the employee confirms the salary amount and payment details as stated above.",
            muted_style,
        ))

        elements.append(KeepTogether(sig_elements))

    # ── Footer ──
    elements.append(Spacer(1, 16))
    elements.append(Paragraph(
        "This document is an official salary statement issued by KarlinDent for payroll and audit purposes.",
        muted_style,
    ))

    def draw_footer(canvas, doc_ref):
        canvas.setStrokeColor(colors.HexColor("#d1d5db"))
        canvas.setLineWidth(0.4)
        canvas.line(16 * mm, 14 * mm, A4[0] - 16 * mm, 14 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#9ca3af"))
        canvas.drawString(16 * mm, 10 * mm, "KarlinDent")
        canvas.drawRightString(A4[0] - 16 * mm, 10 * mm, f"Page {doc_ref.page}")

    doc.build(elements, onFirstPage=draw_footer, onLaterPages=draw_footer)
    pdf_data = buffer.getvalue()
    buffer.close()
    return pdf_data


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
        except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedColumn):
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
        except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedColumn):
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
        except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedColumn):
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
    from_param = request.args.get("from")
    to_param = request.args.get("to")
    conn = get_connection()
    try:
        cur = conn.cursor()
        ensure_weekend_salary_column(conn)
        cur.execute(
            """
            SELECT s.base_salary, s.commission_rate, s.total_revenue, r.name, s.last_paid_at,
                   COALESCE(s.weekend_salary, 200)
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
        last_paid_at_raw = row[4]
        last_paid_at = row[4].isoformat() if row[4] else None
        weekend_salary = float(row[5])

        try:
            period = resolve_report_period(role, last_paid_at_raw, from_param, to_param)
        except ValueError:
            return jsonify({"error": "invalid_date_format"}), 400
        if not period:
            return jsonify({"error": "invalid_date_range"}), 400
        start_date = period["start"]
        end_date = period["end"]

        includes_lab_cost = False
        try:
            cur.execute("SELECT lab_cost FROM income_records LIMIT 0")
            includes_lab_cost = True
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()

        if role == "doctor":
            if includes_lab_cost:
                cur.execute(
                    """
                    SELECT
                        p.first_name,
                        p.last_name,
                        COALESCE(SUM(ir.amount), 0) AS total_paid,
                        COALESCE(SUM(GREATEST(ir.lab_cost, 0)), 0) AS total_lab_fee
                    FROM income_records ir
                    JOIN patients p ON p.id = ir.patient_id
                    WHERE ir.doctor_id = %s
                      AND ir.salary_payment_id IS NULL
                      AND ir.service_date BETWEEN %s AND %s
                    GROUP BY p.first_name, p.last_name
                    ORDER BY total_paid DESC, p.last_name, p.first_name
                    """,
                    (staff_id, start_date, end_date),
                )
            else:
                cur.execute(
                    """
                    SELECT
                        p.first_name,
                        p.last_name,
                        COALESCE(SUM(ir.amount), 0) AS total_paid,
                        0::numeric AS total_lab_fee
                    FROM income_records ir
                    JOIN patients p ON p.id = ir.patient_id
                    WHERE ir.doctor_id = %s
                      AND ir.salary_payment_id IS NULL
                      AND ir.service_date BETWEEN %s AND %s
                    GROUP BY p.first_name, p.last_name
                    ORDER BY total_paid DESC, p.last_name, p.first_name
                    """,
                    (staff_id, start_date, end_date),
                )
            patient_rows = cur.fetchall()
            total_income = sum(float(r[2] or 0) for r in patient_rows)
            total_lab_fees = sum(max(float(r[3] or 0), 0.0) for r in patient_rows)
            commission_metrics = compute_doctor_commission_metrics(total_income, total_lab_fees, commission_rate)
            commission_part = commission_metrics["total_commission"]
            unpaid_patients = [
                {
                    "name": (" ".join(filter(None, [r[0], r[1]])).strip() or "Unknown patient"),
                    "total_paid": round(float(r[2] or 0), 2),
                    "lab_fee": round(max(float(r[3] or 0), 0.0), 2),
                    "net_paid": round(max(float(r[2] or 0) - max(float(r[3] or 0), 0.0), 0.0), 2),
                }
                for r in patient_rows
            ]
        else:
            total_income = 0.0
            total_lab_fees = 0.0
            commission_part = 0.0
            unpaid_patients = []
            commission_metrics = compute_doctor_commission_metrics(0.0, 0.0, commission_rate)
            weekday_hours = 0.0
            weekend_hours = 0.0
            try:
                cur.execute(
                    """
                    SELECT
                        COALESCE(SUM(
                            CASE WHEN EXTRACT(ISODOW FROM start_time) < 6 THEN
                                (EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0)
                                * (COALESCE(completion_percent, 100) / 100.0)
                            ELSE 0 END
                        ), 0),
                        COALESCE(SUM(
                            CASE WHEN EXTRACT(ISODOW FROM start_time) >= 6 THEN
                                (EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0)
                                * (COALESCE(completion_percent, 100) / 100.0)
                            ELSE 0 END
                        ), 0)
                    FROM shifts
                    WHERE staff_id = %s
                      AND status IN ('accepted', 'approved')
                      AND salary_payment_id IS NULL
                    """,
                    (staff_id,),
                )
            except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedColumn):
                conn.rollback()
            else:
                row_hours = cur.fetchone()
                weekday_hours = float(row_hours[0] or 0)
                weekend_hours = float(row_hours[1] or 0)
            shift_weighted_hours = weekday_hours + weekend_hours
            commission_part = round(weekday_hours * base_salary + weekend_hours * weekend_salary, 2)

        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0)
            FROM salary_adjustments
            WHERE staff_id = %s AND applied_to_salary_payment_id IS NULL
            """,
            (staff_id,)
        )
        adjustments = float(cur.fetchone()[0] or 0)

        estimated_total = commission_part + adjustments if role != "doctor" else base_salary + commission_part + adjustments

        return jsonify({
            "base_salary": round(base_salary, 2),
            "weekend_salary": round(weekend_salary, 2),
            "commission_rate": round(commission_rate, 4),
            "total_revenue": round(total_revenue, 2),
            "period": {"from": start_date.isoformat(), "to": end_date.isoformat()},
            "total_income": round(total_income, 2),
            "total_lab_fees": round(total_lab_fees, 2),
            "commission_base_income": commission_metrics["commission_base_income"],
            "negative_balance": commission_metrics["negative_balance"],
            "commission_part": round(commission_part, 2),
            "weekday_hours": round(weekday_hours, 2) if role != "doctor" else 0,
            "weekend_hours": round(weekend_hours, 2) if role != "doctor" else 0,
            "adjustments": round(adjustments, 2),
            "estimated_total": round(estimated_total, 2),
            "adjusted_total": round(estimated_total, 2),
            "unpaid_patients": unpaid_patients,
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
        
    signature_payload = data.get("signature")
    if not signature_payload:
        logger.warning("Bypass attempt: staff %s payment attempted without signature", staff_id)
        return jsonify({
            "error": "signature_required", 
            "message": "Signing and report generation are mandatory for all staff payments."
        }), 400

    requested_amount = data.get("amount", None)
    reset_counter = data.get("reset_counter", True)
    if not isinstance(reset_counter, bool):
        reset_counter = str(reset_counter).lower() not in ("false", "0", "no")

    payment_date_raw = data.get("payment_date") or date.today().isoformat()
    try:
        payment_date = parse_payment_date(payment_date_raw)
    except ValueError:
        return jsonify({"error": "invalid_payment_date"}), 400
    note = data.get("note", "").strip()
    amount_change_reason = str(data.get("amount_change_reason") or "").strip()
    auth = get_authenticated_staff()
    changed_by_staff_id = int(auth["id"]) if auth and auth.get("id") else None

    conn = get_connection()
    try:
        cur = conn.cursor()
        
        # Verify staff exists
        ensure_weekend_salary_column(conn)
        cur.execute(
            """
            SELECT s.id, s.base_salary, s.commission_rate, s.total_revenue, r.name, s.first_name, s.last_name, s.last_paid_at,
                   COALESCE(s.weekend_salary, 200)
            FROM staff s
            JOIN staff_roles r ON r.id = s.role_id
            WHERE s.id = %s
            """,
            (staff_id,),
        )
        staff_row = cur.fetchone()
        if not staff_row:
            return jsonify({"error": "staff_not_found"}), 404

        base_salary = float(staff_row[1] or 0)
        commission_rate = float(staff_row[2] or 0)
        role_name = staff_row[4]
        staff_full_name = " ".join(filter(None, [staff_row[5], staff_row[6]])).strip()
        last_paid_at = staff_row[7]
        weekend_salary = float(staff_row[8])

        from_param = data.get("from")
        to_param = data.get("to")
        try:
            period = resolve_report_period(role_name, last_paid_at, from_param, to_param)
        except ValueError:
            return jsonify({"error": "invalid_date_format"}), 400
        if not period:
            return jsonify({"error": "invalid_date_range"}), 400
        start_date = period["start"]
        end_date = period["end"]

        includes_lab_cost = False
        try:
            cur.execute("SELECT lab_cost FROM income_records LIMIT 0")
            includes_lab_cost = True
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()

        if role_name == "doctor":
            if includes_lab_cost:
                cur.execute(
                    """
                    SELECT
                        COALESCE(SUM(amount), 0),
                        COALESCE(SUM(GREATEST(lab_cost, 0)), 0)
                    FROM income_records
                    WHERE doctor_id = %s
                      AND salary_payment_id IS NULL
                      AND service_date BETWEEN %s AND %s
                    """,
                    (staff_id, start_date, end_date),
                )
            else:
                cur.execute(
                    """
                    SELECT COALESCE(SUM(amount), 0), 0::numeric
                    FROM income_records
                    WHERE doctor_id = %s
                      AND salary_payment_id IS NULL
                      AND service_date BETWEEN %s AND %s
                    """,
                    (staff_id, start_date, end_date),
                )
            gross_income_row = cur.fetchone()
            total_income = float(gross_income_row[0] or 0)
            total_lab_fees = max(float(gross_income_row[1] or 0), 0.0)
            commission_metrics = compute_doctor_commission_metrics(total_income, total_lab_fees, commission_rate)
            commission_part = commission_metrics["total_commission"]
        else:
            weekday_hours = 0.0
            weekend_hours = 0.0
            try:
                ensure_shifts_salary_payment_column(conn)
                shift_ids_for_calc = data.get("shift_ids")
                if shift_ids_for_calc and isinstance(shift_ids_for_calc, list) and len(shift_ids_for_calc) > 0:
                    shift_ids_for_calc_clean = [int(s) for s in shift_ids_for_calc]
                    cur.execute(
                        """
                        SELECT
                            COALESCE(SUM(
                                CASE WHEN EXTRACT(ISODOW FROM start_time) < 6 THEN
                                    (EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0)
                                    * (COALESCE(completion_percent, 100) / 100.0)
                                ELSE 0 END
                            ), 0),
                            COALESCE(SUM(
                                CASE WHEN EXTRACT(ISODOW FROM start_time) >= 6 THEN
                                    (EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0)
                                    * (COALESCE(completion_percent, 100) / 100.0)
                                ELSE 0 END
                            ), 0)
                        FROM shifts
                        WHERE id = ANY(%s)
                          AND staff_id = %s
                          AND status = 'accepted'
                          AND salary_payment_id IS NULL
                        """,
                        (shift_ids_for_calc_clean, staff_id),
                    )
                else:
                    cur.execute(
                        """
                        SELECT
                            COALESCE(SUM(
                                CASE WHEN EXTRACT(ISODOW FROM start_time) < 6 THEN
                                    (EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0)
                                    * (COALESCE(completion_percent, 100) / 100.0)
                                ELSE 0 END
                            ), 0),
                            COALESCE(SUM(
                                CASE WHEN EXTRACT(ISODOW FROM start_time) >= 6 THEN
                                    (EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0)
                                    * (COALESCE(completion_percent, 100) / 100.0)
                                ELSE 0 END
                            ), 0)
                        FROM shifts
                        WHERE staff_id = %s
                          AND status IN ('accepted', 'approved')
                          AND salary_payment_id IS NULL
                        """,
                        (staff_id,),
                    )
            except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedColumn):
                conn.rollback()
            else:
                row_hours = cur.fetchone()
                weekday_hours = float(row_hours[0] or 0)
                weekend_hours = float(row_hours[1] or 0)
            shift_weighted_hours = weekday_hours + weekend_hours

            total_income = 0.0
            total_lab_fees = 0.0
            commission_part = round(weekday_hours * base_salary + weekend_hours * weekend_salary, 2)
            commission_metrics = compute_doctor_commission_metrics(0.0, 0.0, commission_rate)

        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0)
            FROM salary_adjustments
            WHERE staff_id = %s AND applied_to_salary_payment_id IS NULL
            """,
            (staff_id,)
        )
        adjustments = float(cur.fetchone()[0] or 0)

        if role_name == "doctor":
            calculated_amount = round(base_salary + commission_part + adjustments, 2)
        else:
            calculated_amount = round(commission_part + adjustments, 2)
        if requested_amount is not None:
            total_amount = validate_salary(requested_amount)
        else:
            total_amount = calculated_amount

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

        record_salary_amount_audit(
            conn,
            staff_id=int(staff_id),
            salary_payment_id=int(payment_id),
            previous_amount=calculated_amount,
            new_amount=total_amount,
            change_source="manual_override" if requested_amount is not None else "auto_calculated",
            change_reason=amount_change_reason or note,
            changed_by_staff_id=changed_by_staff_id,
            metadata={
                "from": from_param,
                "to": to_param,
                "role": role_name,
                "payment_date": payment_date.isoformat(),
                "has_signature_payload": True,
            },
        )
        
        # Mandatory report generation
        report = build_salary_report_data(staff_id, from_param, to_param, conn=conn)
        if not report or "error" in report:
            logger.error("Salary report generation failed for staff %s: %s", staff_id, report)
            conn.rollback()
            return jsonify({"error": "report_generation_failed", "message": "Failed to generate mandatory salary report."}), 500
            
        report = apply_report_amount_override(report, total_amount)
        
        try:
            signature_info = build_signature_payload({**signature_payload, "signer_name": staff_full_name})
            signature_info["signature_token"] = compute_signature_token(
                staff_id,
                report["period"],
                signature_info["signature_hash"],
                signature_info["signer_name"],
                signature_info["signed_at"],
            )
            
            pdf_data, filename, error = save_salary_report(staff_id, report, signature_info, conn=conn)
            if error:
                conn.rollback()
                logger.error("Mandatory report storage failed for staff %s: %s", staff_id, error)
                return jsonify({"error": "document_storage_failed", "message": "Failed to store mandatory signed report."}), 500
            
            # Get the ID of the document we just created
            cur.execute(
                "SELECT id FROM staff_documents WHERE staff_id = %s AND signature_token = %s ORDER BY id DESC LIMIT 1",
                (staff_id, signature_info["signature_token"])
            )
            doc_row = cur.fetchone()
            document_id = doc_row[0] if doc_row else None
            
        except Exception as exc:
            conn.rollback()
            logger.exception("Mandatory signing workflow failed for staff %s: %s", staff_id, exc)
            return jsonify({"error": "signing_failed", "message": "Signature processing failed."}), 400

        if requested_amount is not None and not math.isclose(total_amount, calculated_amount, rel_tol=0.0, abs_tol=0.009):
            logger.info(
                "Salary amount overridden for staff %s: calculated=%s final=%s by=%s",
                staff_id,
                calculated_amount,
                total_amount,
                changed_by_staff_id,
            )

        # Always reset the counter (mark shifts/income as paid and link adjustments)
        if role_name == "doctor":
            cur.execute(
                """
                UPDATE income_records
                SET salary_payment_id = %s
                WHERE doctor_id = %s
                  AND salary_payment_id IS NULL
                  AND service_date BETWEEN %s AND %s
                """,
                (payment_id, staff_id, start_date, end_date)
            )
        else:
            cur.execute("SAVEPOINT shift_link_sp")
            try:
                ensure_shifts_salary_payment_column(conn)
                shift_ids = data.get("shift_ids")
                if shift_ids and isinstance(shift_ids, list) and len(shift_ids) > 0:
                    shift_ids_clean = [int(s) for s in shift_ids]
                    cur.execute(
                        """
                        UPDATE shifts
                        SET salary_payment_id = %s,
                            status = 'paid'
                        WHERE id = ANY(%s)
                          AND staff_id = %s
                          AND status = 'accepted'
                          AND salary_payment_id IS NULL
                        """,
                        (payment_id, shift_ids_clean, staff_id)
                    )
                else:
                    cur.execute(
                        """
                        UPDATE shifts
                        SET salary_payment_id = %s,
                            status = 'paid'
                        WHERE staff_id = %s
                          AND status = 'accepted'
                          AND salary_payment_id IS NULL
                        """,
                        (payment_id, staff_id)
                    )
            except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedColumn):
                cur.execute("ROLLBACK TO SAVEPOINT shift_link_sp")
            finally:
                cur.execute("RELEASE SAVEPOINT shift_link_sp")

        # Link pending adjustments
        cur.execute(
            """
            UPDATE salary_adjustments
            SET applied_to_salary_payment_id = %s
            WHERE staff_id = %s AND applied_to_salary_payment_id IS NULL
            """,
            (payment_id, staff_id)
        )

        # When not resetting counter: record the difference as a debt adjustment
        # so future unpaid_amount reflects under/overpayment.
        if not reset_counter:
            debt = round(calculated_amount - total_amount, 2)
            if debt != 0:
                cur.execute(
                    """
                    INSERT INTO salary_adjustments (staff_id, amount, reason)
                    VALUES (%s, %s, %s)
                    """,
                    (staff_id, debt, "salary_debt")
                )

        # Reset total_revenue to 0 for doctor (counter is always reset)
        if role_name == "doctor":
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
        return jsonify({
            "id": payment_id,
            "status": "ok",
            "amount": total_amount,
            "document_id": document_id
        }), 201
    except Exception:
        conn.rollback()
        logger.exception("Salary payment failed for staff %s", staff_id)
        raise
    finally:
        release_connection(conn)


@staff_bp.route("/<int:staff_id>/unpaid-shifts", methods=["GET"])
def get_unpaid_shifts(staff_id: int):
    """Return all unpaid accepted shifts for a non-doctor staff member."""
    conn = get_connection()
    try:
        ensure_shifts_salary_payment_column(conn)
        cur = conn.cursor()
        cur.execute("SELECT id FROM staff WHERE id = %s", (staff_id,))
        if not cur.fetchone():
            return jsonify({"error": "staff_not_found"}), 404
        cur.execute(
            """
            SELECT id, start_time, end_time, note,
                   COALESCE(completion_percent, 100),
                   COALESCE(pay_multiplier, 1.0),
                   status
            FROM shifts
            WHERE staff_id = %s
              AND status = 'accepted'
              AND salary_payment_id IS NULL
            ORDER BY start_time DESC
            """,
            (staff_id,),
        )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    shifts = []
    for row in rows:
        s_id, start, end, note, comp, mult, status = row
        duration_h = max((end - start).total_seconds() / 3600.0, 0.0)
        salary_hours = round(duration_h * (float(comp) / 100.0), 2)
        is_weekend = start.isoweekday() >= 6
        shifts.append({
            "id": s_id,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "note": note or "",
            "completion_percent": float(comp),
            "salary_hours": salary_hours,
            "is_weekend": is_weekend,
            "status": status,
        })
    return jsonify(shifts)


@staff_bp.route("/<int:staff_id>/paid-shifts", methods=["GET"])
def get_paid_shifts(staff_id: int):
    """Return recently paid shifts for a non-doctor staff member (last 120 days)."""
    conn = get_connection()
    try:
        ensure_shifts_salary_payment_column(conn)
        cur = conn.cursor()
        cur.execute("SELECT id FROM staff WHERE id = %s", (staff_id,))
        if not cur.fetchone():
            return jsonify({"error": "staff_not_found"}), 404
        cur.execute(
            """
            SELECT s.id, s.start_time, s.end_time, s.note,
                   COALESCE(s.completion_percent, 100),
                   COALESCE(s.pay_multiplier, 1.0),
                   s.status,
                   s.salary_payment_id,
                   sp.payment_date
            FROM shifts s
            LEFT JOIN salary_payments sp ON sp.id = s.salary_payment_id
            WHERE s.staff_id = %s
              AND s.status = 'paid'
              AND s.start_time >= NOW() - INTERVAL '120 days'
            ORDER BY s.start_time DESC
            """,
            (staff_id,),
        )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    shifts = []
    for row in rows:
        s_id, start, end, note, comp, mult, status, payment_id, payment_date = row
        duration_h = max((end - start).total_seconds() / 3600.0, 0.0)
        salary_hours = round(duration_h * (float(comp) / 100.0), 2)
        is_weekend = start.isoweekday() >= 6
        shifts.append({
            "id": s_id,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "note": note or "",
            "completion_percent": float(comp),
            "salary_hours": salary_hours,
            "is_weekend": is_weekend,
            "status": status,
            "salary_payment_id": payment_id,
            "payment_date": payment_date.isoformat() if payment_date else None,
        })
    return jsonify(shifts)


@staff_bp.route("/<int:staff_id>/shifts/revert", methods=["POST"])
def revert_shifts(staff_id: int):
    """Revert paid shifts back to accepted (unlink from salary payment)."""
    data = request.get_json(silent=True) or {}
    shift_ids = data.get("shift_ids")
    if not shift_ids or not isinstance(shift_ids, list) or len(shift_ids) == 0:
        return jsonify({"error": "shift_ids required"}), 400

    shift_ids_clean = [int(s) for s in shift_ids]

    conn = get_connection()
    try:
        ensure_shifts_salary_payment_column(conn)
        cur = conn.cursor()
        cur.execute("SELECT id FROM staff WHERE id = %s", (staff_id,))
        if not cur.fetchone():
            return jsonify({"error": "staff_not_found"}), 404

        cur.execute(
            """
            UPDATE shifts
            SET salary_payment_id = NULL,
                status = 'accepted'
            WHERE id = ANY(%s)
              AND staff_id = %s
              AND status = 'paid'
            RETURNING id
            """,
            (shift_ids_clean, staff_id),
        )
        reverted = [row[0] for row in cur.fetchall()]
        conn.commit()
    finally:
        release_connection(conn)

    return jsonify({"status": "ok", "reverted": reverted})


@staff_bp.route("/<int:staff_id>/salary-notes", methods=["POST"])
def create_salary_note(staff_id: int):
    """Create a text note in salary history without creating a financial payment."""
    data = request.get_json(silent=True) or {}
    note = str(data.get("note", "")).strip()
    if not note:
        return jsonify({"error": "note required"}), 400
    note_date_raw = data.get("date") or date.today().isoformat()
    try:
        note_date = datetime.strptime(note_date_raw, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": "invalid_date"}), 400

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM staff WHERE id = %s", (staff_id,))
        if not cur.fetchone():
            return jsonify({"error": "staff_not_found"}), 404

        # Insert with amount=0 flagged as note_only
        # Ensure note_only column exists
        cur.execute(
            """
            ALTER TABLE salary_payments
            ADD COLUMN IF NOT EXISTS note_only BOOLEAN NOT NULL DEFAULT FALSE
            """
        )
        cur.execute(
            """
            INSERT INTO salary_payments (staff_id, amount, payment_date, note, note_only)
            VALUES (%s, 0, %s, %s, TRUE)
            RETURNING id
            """,
            (staff_id, note_date, note),
        )
        new_id = cur.fetchone()[0]
        conn.commit()
    finally:
        release_connection(conn)

    return jsonify({"status": "ok", "id": new_id}), 201


@staff_bp.route("/stats", methods=["GET"])
def staff_stats():
    """Return aggregate staff statistics for a date range."""
    from_str = request.args.get("from")
    to_str = request.args.get("to")
    try:
        period_from = date.fromisoformat(from_str) if from_str else date.today().replace(day=1)
        period_to = date.fromisoformat(to_str) if to_str else date.today()
    except ValueError:
        return jsonify({"error": "invalid_date"}), 400

    conn = get_connection()
    try:
        cur = conn.cursor()
        # Total paid salaries in period
        cur.execute(
            "SELECT COALESCE(SUM(amount), 0) FROM salary_payments WHERE payment_date >= %s AND payment_date <= %s",
            (period_from, period_to),
        )
        total_paid = float(cur.fetchone()[0])

        # Total worked hours in period (all accepted/approved shifts)
        try:
            cur.execute(
                """
                SELECT COALESCE(SUM(
                    EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
                    * (COALESCE(completion_percent, 100) / 100.0)
                ), 0)
                FROM shifts
                WHERE start_time >= %s AND end_time <= %s
                  AND status IN ('accepted', 'approved')
                """,
                (datetime.combine(period_from, time(0, 0, 0)),
                 datetime.combine(period_to, time(23, 59, 59))),
            )
            total_hours = float(cur.fetchone()[0])
        except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedColumn):
            conn.rollback()
            total_hours = 0.0

        # Staff count
        cur.execute("SELECT COUNT(*) FROM staff WHERE is_active = TRUE")
        staff_count = cur.fetchone()[0]

        # Total unpaid salary across all active staff
        try:
            cur.execute(
                """
                SELECT COALESCE(SUM(
                    CASE WHEN r.name = 'doctor'
                         THEN (
                             (SELECT COALESCE(SUM(amount - COALESCE(lab_cost, 0)), 0)
                              FROM income_records
                              WHERE doctor_id = s.id AND salary_payment_id IS NULL)
                             * s.commission_rate
                             + (SELECT COALESCE(SUM(amount), 0)
                                FROM salary_adjustments
                                WHERE staff_id = s.id AND applied_to_salary_payment_id IS NULL)
                         )
                         ELSE (
                             (SELECT COALESCE(SUM(
                                 (EXTRACT(EPOCH FROM (sh.end_time - sh.start_time)) / 3600.0)
                                 * (COALESCE(sh.completion_percent, 100) / 100.0)
                                 * CASE WHEN EXTRACT(ISODOW FROM sh.start_time) >= 6
                                        THEN COALESCE(s.weekend_salary, 200)
                                        ELSE s.base_salary END
                             ), 0)
                              FROM shifts sh
                              WHERE sh.staff_id = s.id
                                AND sh.status IN ('accepted', 'approved')
                                AND sh.salary_payment_id IS NULL)
                             + (SELECT COALESCE(SUM(amount), 0)
                                FROM salary_adjustments
                                WHERE staff_id = s.id AND applied_to_salary_payment_id IS NULL)
                         )
                    END
                ), 0) AS total_unpaid
                FROM staff s
                JOIN staff_roles r ON r.id = s.role_id
                WHERE s.is_active = TRUE
                """
            )
            total_unpaid = float(cur.fetchone()[0])
        except Exception:
            conn.rollback()
            total_unpaid = 0.0

        return jsonify({
            "total_paid_salary": round(total_paid, 2),
            "total_unpaid_salary": round(total_unpaid, 2),
            "total_worked_hours": round(total_hours, 2),
            "staff_count": staff_count,
            "period_from": period_from.isoformat(),
            "period_to": period_to.isoformat(),
        })
    finally:
        release_connection(conn)


@staff_bp.route("", methods=["GET"])
def list_staff():
    role = request.args.get("role")
    q = request.args.get("q", "").strip()
    working_on = request.args.get("working_on")
    with_debt_raw = request.args.get("with_debt", "true")
    with_debt = with_debt_raw.lower() not in ("false", "0", "no")

    conn = get_connection()
    try:
        cur = conn.cursor()
        params: List[Any] = []
        conditions: List[str] = ["s.is_active = TRUE"]
        day_start = None
        day_end = None

        if working_on:
            try:
                working_date = parse_working_date(working_on)
            except ValueError:
                return jsonify({"error": "invalid_date_format"}), 400
            day_start = datetime.combine(working_date, time(0, 0, 0))
            day_end = datetime.combine(working_date, time(23, 59, 59, 999999))
            try:
                cur.execute("SELECT 1 FROM shifts LIMIT 1")
            except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedColumn):
                conn.rollback()
                return jsonify([])

        if role:
            conditions.append("r.name = %s")
            params.append(role)

        if q:
            pattern = f"%{q.lower()}%"
            conditions.append(
                "(LOWER(s.first_name) LIKE %s OR LOWER(s.last_name) LIKE %s OR LOWER(s.email) LIKE %s)"
            )
            params.extend([pattern, pattern, pattern])

        if day_start and day_end:
            conditions.append(
                "EXISTS (SELECT 1 FROM shifts sh WHERE sh.staff_id = s.id AND sh.start_time <= %s AND sh.end_time >= %s)"
            )
            params.extend([day_end, day_start])

        condition_sql = " AND ".join(conditions)
        pending_adj_sql = (
            "(SELECT COALESCE(SUM(amount), 0) FROM salary_adjustments WHERE staff_id = s.id AND applied_to_salary_payment_id IS NULL)"
            if with_debt else
            "0::numeric"
        )

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
                       COALESCE(SUM(sp.amount), 0) AS commission_income,
                       (SELECT COALESCE(SUM(amount - COALESCE(lab_cost, 0)), 0) FROM income_records WHERE doctor_id = s.id AND salary_payment_id IS NULL) AS unpaid_revenue,
                       {pending_adj_sql} AS pending_adjustments,
                       (
                           SELECT COALESCE(
                               SUM(
                                   (EXTRACT(EPOCH FROM (sh.end_time - sh.start_time)) / 3600.0)
                                   * (COALESCE(sh.completion_percent, 100) / 100.0)
                                   * CASE WHEN EXTRACT(ISODOW FROM sh.start_time) >= 6
                                          THEN COALESCE(s.weekend_salary, 200)
                                          ELSE s.base_salary END
                               ),
                               0
                           )
                           FROM shifts sh
                           WHERE sh.staff_id = s.id
                             AND sh.status IN ('accepted', 'approved')
                             AND sh.salary_payment_id IS NULL
                       ) AS pending_shift_salary
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
        except (psycopg2.errors.UndefinedColumn, psycopg2.errors.UndefinedTable):
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
                       COALESCE(SUM(sp.amount), 0) AS commission_income,
                       (SELECT COALESCE(SUM(amount - COALESCE(lab_cost, 0)), 0) FROM income_records WHERE doctor_id = s.id AND salary_payment_id IS NULL) AS unpaid_revenue,
                       {pending_adj_sql} AS pending_adjustments,
                       0::numeric AS pending_shift_salary
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
        unpaid_revenue = float(row[13])
        pending_adjustments = float(row[14])
        pending_shift_salary = float(row[15] or 0)

        if commission_rate == 0:
            if total_revenue > 0 and commission_income > 0:
                commission_rate = commission_income / total_revenue
            elif total_revenue > 0 and commission_income == 0 and role_name == "doctor":
                commission_rate = config.DOCTOR_COMMISSION_RATE
        if commission_income == 0 and role_name == "doctor" and total_revenue > 0 and commission_rate > 0:
            commission_income = round(total_revenue * commission_rate, 2)

        unpaid_amount = 0.0
        if role_name == "doctor":
            unpaid_amount = round((unpaid_revenue * commission_rate) + pending_adjustments, 2)
        else:
            unpaid_amount = round(pending_shift_salary + pending_adjustments, 2)

        items.append(
            {
                "id": row[0],
                "first_name": row[1],
                "last_name": row[2],
                "phone": row[3],
                "email": row[4],
                "bio": row[5],
                "base_salary": base_salary,
                "weekend_salary": 200,
                "commission_rate": commission_rate,
                "last_paid_at": last_paid_at,
                "total_revenue": total_revenue,
                "commission_income": commission_income,
                "unpaid_amount": unpaid_amount,
                "is_active": is_active,
                "role": role_name,
            }
        )

    # Enrich with weekend_salary from DB if available
    try:
        conn2 = get_connection()
        try:
            cur2 = conn2.cursor()
            ensure_weekend_salary_column(conn2)
            staff_ids = [item["id"] for item in items]
            if staff_ids:
                cur2.execute(
                    "SELECT id, COALESCE(weekend_salary, 200) FROM staff WHERE id = ANY(%s)",
                    (staff_ids,),
                )
                ws_map = {r[0]: float(r[1]) for r in cur2.fetchall()}
                for item in items:
                    item["weekend_salary"] = ws_map.get(item["id"], 200)
        finally:
            release_connection(conn2)
    except Exception:
        pass

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


@staff_bp.route("/<int:staff_id>/salary-notes", methods=["GET"])
def staff_salary_notes(staff_id: int):
    try:
        limit = int(request.args.get("limit", 10))
        offset = int(request.args.get("offset", 0))
    except ValueError:
        return jsonify({"error": "invalid_pagination"}), 400
    if limit <= 0:
        limit = 10
    if limit > 50:
        limit = 50
    if offset < 0:
        offset = 0

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM staff WHERE id = %s", (staff_id,))
        if not cur.fetchone():
            return jsonify({"error": "staff_not_found"}), 404

        cur.execute(
            """
            SELECT sp.id, sp.payment_date, sp.note, sp.amount, sp.created_at
            FROM salary_payments sp
            WHERE sp.staff_id = %s
            ORDER BY sp.payment_date DESC, sp.created_at DESC
            LIMIT %s OFFSET %s
            """,
            (staff_id, limit, offset),
        )
        rows = cur.fetchall()

        cur.execute(
            "SELECT COUNT(*) FROM salary_payments WHERE staff_id = %s",
            (staff_id,),
        )
        total = int(cur.fetchone()[0] or 0)
    finally:
        release_connection(conn)

    items = [
        {
            "id": int(row[0]),
            "payment_date": row[1].isoformat(),
            "note": row[2] or "",
            "amount": float(row[3] or 0),
            "created_at": row[4].isoformat() if row[4] else None,
        }
        for row in rows
    ]

    return jsonify({"items": items, "total": total, "limit": limit, "offset": offset})


@staff_bp.route("/<int:staff_id>/salary-report", methods=["GET"])
def staff_salary_report(staff_id: int):
    from_param = request.args.get("from")
    to_param = request.args.get("to")
    amount_override_raw = request.args.get("amount")
    amount_override = None
    if amount_override_raw not in (None, ""):
        try:
            amount_override = validate_salary(amount_override_raw)
        except ValueError:
            return jsonify({"error": "invalid_salary"}), 400

    report = build_salary_report_data(staff_id, from_param, to_param)
    if report is None:
        return jsonify({"error": "staff_not_found"}), 404
    if report.get("error") == "invalid_date_format":
        return jsonify({"error": "invalid_date_format"}), 400
    if report.get("error") == "invalid_date_range":
        return jsonify({"error": "invalid_date_range"}), 400
    report = apply_report_amount_override(report, amount_override)
    signature_info = None
    signer_name = request.args.get("signer_name")
    signed_at = request.args.get("signed_at")
    signature_hash = request.args.get("signature_hash")
    signature_token = request.args.get("signature_token")
    if any([signer_name, signed_at, signature_hash, signature_token]):
        if not all([signer_name, signed_at, signature_hash, signature_token]):
            return jsonify({"error": "invalid_signature"}), 400
        try:
            signature_meta = build_signature_metadata(
                {
                    "signer_name": signer_name,
                    "signed_at": signed_at,
                    "signature_hash": signature_hash,
                }
            )
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        expected_token = compute_signature_token(
            staff_id,
            report["period"],
            signature_meta["signature_hash"],
            signature_meta["signer_name"],
            signature_meta["signed_at"],
        )
        if signature_token != expected_token:
            return jsonify({"error": "invalid_signature_token"}), 400
        signature_info = {**signature_meta, "signature_token": signature_token}

    try:
        pdf_data = build_salary_report_pdf(report, signature_info)
    except Exception as exc:
        logger.exception("PDF generation failed for staff %s: %s", staff_id, exc)
        return jsonify({"error": "pdf_generation_failed"}), 500

    filename = f"salary_report_{staff_id}_{report['period']['from']}_{report['period']['to']}.pdf"
    return Response(
        pdf_data,
        mimetype="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@staff_bp.route("/<int:staff_id>/salary-report/pdf", methods=["POST"])
def staff_salary_report_pdf(staff_id: int):
    payload = request.get_json(silent=True) or {}
    from_param = payload.get("from")
    to_param = payload.get("to")
    amount_override = payload.get("amount")
    if amount_override is not None:
        try:
            amount_override = validate_salary(amount_override)
        except ValueError:
            return jsonify({"error": "invalid_salary"}), 400
    signature_payload = payload.get("signature") or {}

    auth_error = ensure_staff_authorized(staff_id)
    if auth_error:
        return auth_error

    report = build_salary_report_data(staff_id, from_param, to_param)
    if report is None:
        return jsonify({"error": "staff_not_found"}), 404
    if report.get("error") == "invalid_date_format":
        return jsonify({"error": "invalid_date_format"}), 400
    if report.get("error") == "invalid_date_range":
        return jsonify({"error": "invalid_date_range"}), 400
    report = apply_report_amount_override(report, amount_override)

    staff_full_name = " ".join(filter(None, [report["staff"]["first_name"], report["staff"]["last_name"]])).strip()
    if signature_payload.get("signer_name") and signature_payload.get("signer_name") != staff_full_name:
        return jsonify({"error": "signer_name_mismatch"}), 403

    try:
        signature_info = build_signature_payload({**signature_payload, "signer_name": staff_full_name})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    signature_info["signature_token"] = compute_signature_token(
        staff_id,
        report["period"],
        signature_info["signature_hash"],
        signature_info["signer_name"],
        signature_info["signed_at"],
    )

    def validate_period_patients() -> bool:
        if report.get("role") != "doctor":
            return True
        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT p.first_name, p.last_name, SUM(ir.amount) AS total_paid
                FROM income_records ir
                JOIN patients p ON p.id = ir.patient_id
                WHERE ir.doctor_id = %s
                  AND ir.salary_payment_id IS NULL
                  AND ir.service_date BETWEEN %s AND %s
                GROUP BY p.first_name, p.last_name
                ORDER BY total_paid DESC, p.last_name, p.first_name
                """,
                (staff_id, report["period"]["from"], report["period"]["to"]),
            )
            rows = cur.fetchall()
        finally:
            release_connection(conn)
        expected = [
            {"name": (" ".join(filter(None, [r[0], r[1]])).strip() or "Unknown patient"), "total_paid": float(r[2] or 0)}
            for r in rows
        ]
        actual = report.get("patients") or []
        if len(expected) != len(actual):
            return False
        for i in range(len(expected)):
            if expected[i]["name"] != actual[i]["name"]:
                return False
            if round(expected[i]["total_paid"], 2) != round(actual[i]["total_paid"], 2):
                return False
        return True

    if not validate_period_patients():
        return jsonify({"error": "invalid_report_patients"}), 400

    pdf_data, filename, error = save_salary_report(staff_id, report, signature_info)
    if error:
        return jsonify({"error": error}), 500

    return Response(
        pdf_data,
        mimetype="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@staff_bp.route("/<int:staff_id>/documents", methods=["GET"])
def staff_documents(staff_id: int):
    auth_error = ensure_staff_authorized(staff_id)
    if auth_error:
        return auth_error

    doc_type = request.args.get("type")
    from_param = request.args.get("from")
    to_param = request.args.get("to")

    conditions = ["staff_id = %s"]
    params: List[Any] = [staff_id]
    if doc_type:
        conditions.append("document_type = %s")
        params.append(doc_type)
    if from_param:
        try:
            from_date = parse_payment_date(from_param)
        except ValueError:
            return jsonify({"error": "invalid_date_format"}), 400
        conditions.append("(period_to IS NULL OR period_to >= %s)")
        params.append(from_date)
    if to_param:
        try:
            to_date = parse_payment_date(to_param)
        except ValueError:
            return jsonify({"error": "invalid_date_format"}), 400
        conditions.append("(period_from IS NULL OR period_from <= %s)")
        params.append(to_date)

    where_sql = " AND ".join(conditions)
    conn = get_connection()
    try:
        cur = conn.cursor()
        ensure_staff_documents_table(conn)
        cur.execute(
            f"""
            SELECT id, document_type, period_from, period_to, signed_at, signer_name, signature_hash, signature_token, file_path, created_at
            FROM staff_documents
            WHERE {where_sql}
            ORDER BY signed_at DESC, created_at DESC
            """,
            params,
        )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    items = [
        {
            "id": int(row[0]),
            "document_type": row[1],
            "period_from": row[2].isoformat() if row[2] else None,
            "period_to": row[3].isoformat() if row[3] else None,
            "signed_at": row[4].isoformat() if row[4] else None,
            "signer_name": row[5],
            "signature_hash": row[6],
            "signature_token": row[7],
            "file_name": os.path.basename(row[8] or ""),
            "created_at": row[9].isoformat() if row[9] else None,
        }
        for row in rows
    ]
    return jsonify(items)


@staff_bp.route("/<int:staff_id>/documents/<int:document_id>/download", methods=["GET"])
def staff_document_download(staff_id: int, document_id: int):
    auth_error = ensure_staff_authorized(staff_id)
    if auth_error:
        return auth_error

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT file_path
            FROM staff_documents
            WHERE id = %s AND staff_id = %s
            """,
            (document_id, staff_id),
        )
        row = cur.fetchone()
    finally:
        release_connection(conn)

    if not row:
        return jsonify({"error": "document_not_found"}), 404

    file_path = row[0]
    base_dir = os.path.realpath(get_documents_base_dir())
    resolved = os.path.realpath(file_path)
    if not resolved.startswith(base_dir):
        return jsonify({"error": "document_not_found"}), 404
    if not os.path.exists(resolved):
        return jsonify({"error": "document_not_found"}), 404

    return send_file(
        resolved,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=os.path.basename(resolved),
    )


@staff_bp.route("/<int:staff_id>/documents/<int:document_id>/view", methods=["GET"])
def staff_document_view(staff_id: int, document_id: int):
    auth_error = ensure_staff_authorized(staff_id)
    if auth_error:
        return auth_error

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT file_path
            FROM staff_documents
            WHERE id = %s AND staff_id = %s
            """,
            (document_id, staff_id),
        )
        row = cur.fetchone()
    finally:
        release_connection(conn)

    if not row:
        return jsonify({"error": "document_not_found"}), 404

    file_path = row[0]
    base_dir = os.path.realpath(get_documents_base_dir())
    resolved = os.path.realpath(file_path)
    if not resolved.startswith(base_dir):
        return jsonify({"error": "document_not_found"}), 404
    if not os.path.exists(resolved):
        return jsonify({"error": "document_not_found"}), 404

    return send_file(
        resolved,
        mimetype="application/pdf",
        as_attachment=False,
        download_name=os.path.basename(resolved),
    )


@staff_bp.route("/<int:staff_id>/salary-report/data", methods=["GET"])
def staff_salary_report_data(staff_id: int):
    from_param = request.args.get("from")
    to_param = request.args.get("to")
    report = build_salary_report_data(staff_id, from_param, to_param)
    if report is None:
        return jsonify({"error": "staff_not_found"}), 404
    if report.get("error") == "invalid_date_format":
        return jsonify({"error": "invalid_date_format"}), 400
    if report.get("error") == "invalid_date_range":
        return jsonify({"error": "invalid_date_range"}), 400
    return jsonify(report)


def build_doctors_patient_report_pdf(report_data: Dict[str, Any]) -> bytes:
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.lib.enums import TA_LEFT, TA_RIGHT
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable, KeepTogether
    except Exception as exc:
        logger.exception("PDF dependency error: %s", exc)
        raise

    def fmt(value: Any) -> str:
        amount = float(value or 0)
        return f"{amount:,.2f} CZK"

    page_w = A4[0]
    content_w = page_w - 32 * mm

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=20 * mm,
    )
    styles = getSampleStyleSheet()
    elements = []
    dark = colors.HexColor("#111827")
    border_color = colors.HexColor("#d6d8e1")
    header_bg = colors.HexColor("#1f2937")
    muted_text = colors.HexColor("#6b7280")
    accent = colors.HexColor("#f97316")
    green = colors.HexColor("#16a34a")

    normal_style = ParagraphStyle("N", parent=styles["Normal"], fontName="Helvetica", fontSize=9.5, leading=13, textColor=dark)
    bold_style = ParagraphStyle("B", parent=normal_style, fontName="Helvetica-Bold")
    value_style = ParagraphStyle("V", parent=normal_style, alignment=TA_RIGHT)
    value_bold = ParagraphStyle("VB", parent=value_style, fontName="Helvetica-Bold")
    title_style = ParagraphStyle("T", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=dark, alignment=TA_LEFT, spaceAfter=2)
    subtitle_style = ParagraphStyle("ST", parent=normal_style, fontName="Helvetica-Bold", fontSize=10, textColor=accent, spaceAfter=6)
    section_style = ParagraphStyle("S", parent=normal_style, fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=dark, spaceBefore=14, spaceAfter=6)
    muted_style = ParagraphStyle("M", parent=normal_style, fontSize=8.5, leading=11, textColor=muted_text)
    total_label = ParagraphStyle("TL", parent=normal_style, fontName="Helvetica-Bold", fontSize=11, textColor=dark)
    total_value_style = ParagraphStyle("TV", parent=normal_style, fontName="Helvetica-Bold", fontSize=11, textColor=dark, alignment=TA_RIGHT)
    doctor_name_style = ParagraphStyle("DN", parent=normal_style, fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=dark)
    total_green = ParagraphStyle("TG", parent=total_value_style, textColor=green)

    period_from = report_data["period"]["from"]
    period_to = report_data["period"]["to"]
    generated_at = report_data.get("generated_at", "")
    doctors = report_data.get("doctors", [])

    # ── Document header ──
    elements.append(Paragraph("KarlinDent", subtitle_style))
    elements.append(Paragraph("Patient Revenue Report", title_style))
    elements.append(Spacer(1, 4))

    meta_data = [
        [Paragraph("Period", bold_style), Paragraph(f"{period_from}  —  {period_to}", normal_style)],
        [Paragraph("Doctors", bold_style), Paragraph(str(len(doctors)), normal_style)],
    ]
    meta_table = Table(meta_data, colWidths=[30 * mm, content_w - 30 * mm])
    meta_table.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, border_color),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 8))

    hdr_style = ParagraphStyle("TH", parent=normal_style, fontName="Helvetica-Bold", fontSize=9, textColor=colors.whitesmoke)
    hdr_r_style = ParagraphStyle("THR", parent=hdr_style, alignment=TA_RIGHT)

    grand_total = 0.0

    for doctor in doctors:
        staff_info = doctor.get("staff", {})
        doctor_name = " ".join(filter(None, [staff_info.get("first_name"), staff_info.get("last_name")])).strip() or "Unknown"
        summary = doctor.get("summary", {})
        commission_rate = float(summary.get("commission_rate", 0))
        patients = doctor.get("patients", [])
        total_salary = float(summary.get("total_salary", 0))
        grand_total += total_salary

        doctor_block = []

        # Doctor name bar
        name_row = Table(
            [[Paragraph(doctor_name, doctor_name_style), Paragraph(f"Commission {commission_rate * 100:.0f}%", muted_style)]],
            colWidths=[content_w * 0.6, content_w * 0.4],
        )
        name_row.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f9fafb")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ("BOX", (0, 0), (-1, -1), 0.4, border_color),
        ]))
        doctor_block.append(name_row)
        doctor_block.append(Spacer(1, 4))

        # Patient table
        table_data = [[
            Paragraph("Patient", hdr_style),
            Paragraph("Paid", hdr_r_style),
            Paragraph("Lab Cost", hdr_r_style),
            Paragraph("Net", hdr_r_style),
        ]]
        for p in patients:
            lab_fee = float(p.get("lab_fee", 0))
            table_data.append([
                Paragraph(str(p["name"]), normal_style),
                Paragraph(fmt(p.get("total_paid", 0)), value_style),
                Paragraph(f"-{fmt(lab_fee)}" if lab_fee > 0 else "—", value_style),
                Paragraph(fmt(p.get("net_paid", 0)), value_style),
            ])
        if len(table_data) == 1:
            table_data.append([
                Paragraph("No patients in this period", muted_style),
                Paragraph("—", value_style),
                Paragraph("—", value_style),
                Paragraph("—", value_style),
            ])

        patient_table = Table(table_data, colWidths=[content_w - 90 * mm, 30 * mm, 30 * mm, 30 * mm])
        patient_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), header_bg),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, border_color),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
        ]))
        doctor_block.append(patient_table)
        doctor_block.append(Spacer(1, 6))

        # Salary breakdown
        breakdown_rows = [
            [Paragraph("Base Salary", normal_style), Paragraph(fmt(summary.get("base_salary", 0)), value_style)],
            [Paragraph(f"Commission ({commission_rate * 100:.0f}%)", normal_style), Paragraph(fmt(summary.get("total_commission", 0)), value_style)],
            [Paragraph("Lab Fees Deduction", normal_style), Paragraph(fmt(summary.get("total_lab_fees", 0)), value_style)],
        ]
        adj = float(summary.get("adjustments", 0))
        if adj != 0:
            breakdown_rows.append([Paragraph("Adjustments", normal_style), Paragraph(fmt(adj), value_style)])

        breakdown_table = Table(breakdown_rows, colWidths=[content_w - 50 * mm, 50 * mm])
        breakdown_table.setStyle(TableStyle([
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, border_color),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        doctor_block.append(breakdown_table)
        doctor_block.append(Spacer(1, 4))

        # Total salary row
        total_row = Table(
            [[Paragraph("Total Salary", total_label), Paragraph(fmt(total_salary), total_green)]],
            colWidths=[content_w - 50 * mm, 50 * mm],
        )
        total_row.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f0fdf4")),
            ("BOX", (0, 0), (-1, -1), 0.6, green),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        doctor_block.append(total_row)
        doctor_block.append(Spacer(1, 16))

        elements.append(KeepTogether(doctor_block))

    # ── Grand total ──
    if len(doctors) > 1:
        elements.append(HRFlowable(width="100%", thickness=0.8, color=accent, spaceBefore=4, spaceAfter=8))
        grand_row = Table(
            [[Paragraph("Grand Total — All Doctors", total_label), Paragraph(fmt(grand_total), ParagraphStyle("GT", parent=total_value_style, textColor=accent))]],
            colWidths=[content_w - 60 * mm, 60 * mm],
        )
        grand_row.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fff7ed")),
            ("BOX", (0, 0), (-1, -1), 0.8, accent),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        elements.append(grand_row)

    # ── Footer ──
    elements.append(Spacer(1, 16))
    elements.append(Paragraph(
        "This document is an official patient revenue report issued by KarlinDent.",
        muted_style,
    ))

    def draw_footer(canvas, doc_ref):
        canvas.setStrokeColor(colors.HexColor("#d1d5db"))
        canvas.setLineWidth(0.4)
        canvas.line(16 * mm, 14 * mm, A4[0] - 16 * mm, 14 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#9ca3af"))
        canvas.drawString(16 * mm, 10 * mm, "KarlinDent")
        canvas.drawRightString(A4[0] - 16 * mm, 10 * mm, f"Page {doc_ref.page}")

    doc.build(elements, onFirstPage=draw_footer, onLaterPages=draw_footer)
    pdf_data = buffer.getvalue()
    buffer.close()
    return pdf_data


@staff_bp.route("/doctors/patients-report/data", methods=["GET"])
def doctors_patients_report_data():
    from_param = request.args.get("from")
    to_param = request.args.get("to")

    # Default to current month when not specified so all doctors share the same period
    today = date.today()
    if not from_param:
        from_param = today.replace(day=1).isoformat()
    if not to_param:
        to_param = today.isoformat()

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT s.id
            FROM staff s
            JOIN staff_roles r ON r.id = s.role_id
            WHERE r.name = 'doctor'
            ORDER BY s.last_name, s.first_name
            """
        )
        doctor_ids = [row[0] for row in cur.fetchall()]
    finally:
        release_connection(conn)

    doctors = []
    for staff_id in doctor_ids:
        report = build_salary_report_data(staff_id, from_param, to_param)
        if report and not report.get("error"):
            doctors.append(report)

    return jsonify({
        "period": {"from": from_param, "to": to_param},
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "doctors": doctors,
    })


@staff_bp.route("/doctors/patients-report/pdf", methods=["GET"])
def doctors_patients_report_pdf():
    from_param = request.args.get("from")
    to_param = request.args.get("to")

    today = date.today()
    if not from_param:
        from_param = today.replace(day=1).isoformat()
    if not to_param:
        to_param = today.isoformat()

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT s.id
            FROM staff s
            JOIN staff_roles r ON r.id = s.role_id
            WHERE r.name = 'doctor'
            ORDER BY s.last_name, s.first_name
            """
        )
        doctor_ids = [row[0] for row in cur.fetchall()]
    finally:
        release_connection(conn)

    doctors = []
    for staff_id in doctor_ids:
        report = build_salary_report_data(staff_id, from_param, to_param)
        if report and not report.get("error"):
            doctors.append(report)

    report_data = {
        "period": {"from": from_param, "to": to_param},
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "doctors": doctors,
    }

    try:
        pdf_data = build_doctors_patient_report_pdf(report_data)
    except Exception as exc:
        logger.exception("Failed to generate doctors patient report PDF: %s", exc)
        return jsonify({"error": "pdf_generation_failed"}), 500

    filename = f"patient_revenue_report_{from_param}_{to_param}.pdf"
    return send_file(
        io.BytesIO(pdf_data),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )


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
    weekend_salary_value = data.get("weekend_salary", 200)
    commission_rate_value = data.get("commission_rate", 0)

    try:
        base_salary = validate_salary(base_salary_value)
        weekend_salary = validate_salary(weekend_salary_value)
        commission_rate = float(commission_rate_value or 0)
        if commission_rate < 0 or commission_rate > 1:
            raise ValueError("invalid_commission_rate")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    commission_rate = round(commission_rate, 4)

    conn = get_connection()
    try:
        cur = conn.cursor()
        ensure_weekend_salary_column(conn)
        role_id = get_role_id(conn, role_name)
        if not role_id:
            return jsonify({"error": "invalid_role"}), 400

        if role_name == "doctor":
            base_salary_db = 0
            commission_rate_db = commission_rate
            weekend_salary_db = 0
        else:
            base_salary_db = base_salary
            commission_rate_db = 0
            weekend_salary_db = weekend_salary

        try:
            cur.execute(
                """
                INSERT INTO staff
                    (role_id, first_name, last_name, phone, email, bio, base_salary, weekend_salary, commission_rate)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                    weekend_salary_db,
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
    weekend_salary_value = data.get("weekend_salary", 200)
    commission_rate_value = data.get("commission_rate", 0)

    try:
        base_salary = validate_salary(base_salary_value)
        weekend_salary = validate_salary(weekend_salary_value)
        commission_rate = float(commission_rate_value or 0)
        if commission_rate < 0 or commission_rate > 1:
            raise ValueError("invalid_commission_rate")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    commission_rate = round(commission_rate, 4)

    conn = get_connection()
    try:
        cur = conn.cursor()
        ensure_weekend_salary_column(conn)
        role_id = get_role_id(conn, role_name)
        if not role_id:
            return jsonify({"error": "invalid_role"}), 400

        if role_name == "doctor":
            base_salary_db = 0
            commission_rate_db = commission_rate
            weekend_salary_db = 0
        else:
            base_salary_db = base_salary
            commission_rate_db = 0
            weekend_salary_db = weekend_salary

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
                    weekend_salary = %s,
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
                    weekend_salary_db,
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
