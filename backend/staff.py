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


def ensure_salary_amount_audit_table(conn) -> None:
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


def build_salary_report_data(staff_id: int, from_param: Optional[str], to_param: Optional[str]) -> Optional[Dict[str, Any]]:
    conn = get_connection()
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
        conn = get_connection()
        try:
            cur = conn.cursor()
            includes_lab_cost = False
            try:
                cur.execute("SELECT lab_cost FROM income_records LIMIT 0")
                includes_lab_cost = True
            except psycopg2.errors.UndefinedColumn:
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
        finally:
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
        conn = get_connection()
        try:
            cur = conn.cursor()
            try:
                cur.execute(
                    """
                    SELECT work_date, start_time, end_time, hours, note
                    FROM staff_timesheets
                    WHERE staff_id = %s AND work_date BETWEEN %s AND %s
                    ORDER BY work_date DESC, start_time ASC
                    """,
                    (staff_id, start_date, end_date),
                )
                timesheet_rows = cur.fetchall()
            except psycopg2.errors.UndefinedTable:
                conn.rollback()
                timesheet_rows = []
        finally:
            release_connection(conn)

        total_hours = sum(float(row[3] or 0) for row in timesheet_rows)
        working_days = len({row[0] for row in timesheet_rows})
        report["summary"] = {
            "working_days": working_days,
            "total_hours": round(total_hours, 2),
            "base_salary": round(base_salary, 2),
            "total_salary": round(total_hours * base_salary, 2),
        }
        report["timesheets"] = [
            {
                "date": row[0].isoformat(),
                "start_time": row[1].strftime("%H:%M") if row[1] else "",
                "end_time": row[2].strftime("%H:%M") if row[2] else "",
                "hours": float(row[3] or 0),
                "note": row[4] or "",
            }
            for row in timesheet_rows
        ]

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


def save_salary_report(staff_id: int, report: Dict[str, Any], signature_info: Dict[str, Any]) -> Tuple[Optional[bytes], Optional[str], Optional[str]]:
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

    conn = get_connection()
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
        conn.commit()
    except Exception as exc:
        conn.rollback()
        logger.exception("Failed to record salary document metadata: %s", exc)
        return None, None, "document_storage_failed"
    finally:
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
        from reportlab.lib.enums import TA_LEFT, TA_RIGHT
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
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
            if isinstance(value, (str, os.PathLike)):
                with PILImage.open(value) as img:
                    img = img.convert("RGBA")
                    px = img.load()
                    width, height = img.size
                    for y in range(height):
                        for x in range(width):
                            r, g, b, a = px[x, y]
                            if a <= 8:
                                continue
                            brightness = (0.299 * r) + (0.587 * g) + (0.114 * b)
                            if brightness > 245:
                                px[x, y] = (0, 0, 0, max(a, 220))
                            else:
                                px[x, y] = (0, 0, 0, a)
                    output = io.BytesIO()
                    img.save(output, format="PNG")
                    output.seek(0)
                    return output
            if hasattr(value, "read"):
                try:
                    value.seek(0)
                except Exception:
                    pass
                with PILImage.open(value) as img:
                    img = img.convert("RGBA")
                    px = img.load()
                    width, height = img.size
                    for y in range(height):
                        for x in range(width):
                            r, g, b, a = px[x, y]
                            if a <= 8:
                                continue
                            brightness = (0.299 * r) + (0.587 * g) + (0.114 * b)
                            if brightness > 245:
                                px[x, y] = (0, 0, 0, max(a, 220))
                            else:
                                px[x, y] = (0, 0, 0, a)
                    output = io.BytesIO()
                    img.save(output, format="PNG")
                    output.seek(0)
                    return output
        except Exception as exc:
            logger.warning("Signature image skipped: %s", exc)
            return None
        return value

    def format_money(value: Any) -> str:
        amount = float(value or 0)
        return f"{amount:,.2f} CZK"

    def wrap_token(value: Any, step: int = 32) -> str:
        raw = str(value or "").strip()
        if not raw:
            return "—"
        return "<br/>".join(raw[i:i + step] for i in range(0, len(raw), step))

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
    )
    styles = getSampleStyleSheet()
    elements = []
    brand_color = colors.HexColor("#f97316")
    border_color = colors.HexColor("#d6d8e1")
    header_bg = colors.HexColor("#1f2937")
    muted_text = colors.HexColor("#6b7280")
    normal_style = ParagraphStyle(
        "ReportNormal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#111827"),
    )
    label_style = ParagraphStyle(
        "ReportLabel",
        parent=normal_style,
        fontName="Helvetica-Bold",
    )
    value_style = ParagraphStyle(
        "ReportValue",
        parent=normal_style,
        alignment=TA_RIGHT,
    )
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=28,
        leading=32,
        textColor=colors.HexColor("#111827"),
        alignment=TA_LEFT,
        spaceAfter=2,
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=normal_style,
        fontName="Helvetica-Bold",
        fontSize=11,
        textColor=brand_color,
        spaceAfter=10,
    )
    section_title_style = ParagraphStyle(
        "SectionTitle",
        parent=normal_style,
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=14,
        textColor=colors.HexColor("#111827"),
        spaceAfter=6,
    )
    legal_style = ParagraphStyle(
        "LegalText",
        parent=normal_style,
        fontSize=9.5,
        leading=13,
        textColor=muted_text,
    )
    token_style = ParagraphStyle(
        "TokenText",
        parent=normal_style,
        fontName="Helvetica",
        fontSize=8.5,
        leading=10.5,
    )
    signature_detail_style = ParagraphStyle(
        "SignatureDetail",
        parent=normal_style,
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=14,
        textColor=colors.HexColor("#111827"),
    )

    staff_name = " ".join(filter(None, [report["staff"]["first_name"], report["staff"]["last_name"]])).strip()
    report_period = f"{report['period']['from']} to {report['period']['to']}"
    elements.append(Paragraph("KarlinDent", subtitle_style))
    elements.append(Paragraph("Salary Report", title_style))
    meta_table = Table(
        [
            [Paragraph("Staff", label_style), Paragraph(staff_name or "Unknown", value_style)],
            [Paragraph("Role", label_style), Paragraph(str(report.get("role", "")).title(), value_style)],
            [Paragraph("Report Period", label_style), Paragraph(report_period, value_style)],
        ],
        colWidths=[42 * mm, 130 * mm],
    )
    meta_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, border_color),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, border_color),
        ("BACKGROUND", (0, 0), (-1, -1), colors.whitesmoke),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 12))

    if report["role"] == "doctor":
        last_payment_date = report.get("last_payment_date") or "Never"
        elements.append(Paragraph("Patient Revenue Breakdown", section_title_style))
        elements.append(Paragraph(f"Last Salary Payment: {last_payment_date}", normal_style))
        elements.append(Spacer(1, 6))

        table_data = [["Patient", "Gross (CZK)", "Lab Fee (CZK)", "Net (CZK)"]]
        for row in report.get("patients", []):
            table_data.append([
                Paragraph(str(row["name"]), normal_style),
                Paragraph(format_money(row.get("total_paid", 0)), value_style),
                Paragraph(format_money(row.get("lab_fee", 0)), value_style),
                Paragraph(format_money(row.get("net_paid", 0)), value_style),
            ])

        if len(table_data) == 1:
            table_data.append([
                Paragraph("No income records for period", normal_style),
                Paragraph(format_money(0), value_style),
                Paragraph(format_money(0), value_style),
                Paragraph(format_money(0), value_style),
            ])

        table = Table(table_data, colWidths=[84 * mm, 29 * mm, 29 * mm, 30 * mm])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), header_bg),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, border_color),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        elements.append(table)
        elements.append(Spacer(1, 12))

        summary = report.get("summary", {})
        summary_data = [
            [Paragraph("Base Salary", normal_style), Paragraph(format_money(summary.get("base_salary", 0)), value_style)],
            [Paragraph("Commission Base (After Lab Fees)", normal_style), Paragraph(format_money(summary.get("commission_base_income", 0)), value_style)],
            [
                Paragraph(f"Commission ({summary.get('commission_rate', 0) * 100:.2f}%)", normal_style),
                Paragraph(format_money(summary.get("total_commission", 0)), value_style),
            ],
            [Paragraph("Lab Fees", normal_style), Paragraph(format_money(summary.get("total_lab_fees", 0)), value_style)],
            [Paragraph("Adjustments", normal_style), Paragraph(format_money(summary.get("adjustments", 0)), value_style)],
            [Paragraph("Total Salary", label_style), Paragraph(format_money(summary.get("total_salary", 0)), value_style)],
        ]
        summary_table = Table(summary_data, colWidths=[120 * mm, 52 * mm])
        summary_table.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, border_color),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#fff7ed")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        elements.append(summary_table)
    else:
        summary = report.get("summary", {})
        elements.append(Paragraph("Work Schedule Summary", section_title_style))
        summary_card = Table(
            [
                [Paragraph("Working Days", label_style), Paragraph(str(summary.get("working_days", 0)), value_style)],
                [Paragraph("Total Hours", label_style), Paragraph(f"{summary.get('total_hours', 0):.2f}", value_style)],
                [Paragraph("Hourly Rate", label_style), Paragraph(format_money(summary.get("base_salary", 0)), value_style)],
                [Paragraph("Total Salary", label_style), Paragraph(format_money(summary.get("total_salary", 0)), value_style)],
            ],
            colWidths=[60 * mm, 112 * mm],
        )
        summary_card.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.8, border_color),
            ("INNERGRID", (0, 0), (-1, -1), 0.4, border_color),
            ("BACKGROUND", (0, 0), (-1, -1), colors.whitesmoke),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        elements.append(summary_card)
        elements.append(Spacer(1, 10))

        schedule_data = [["Date", "Time Range", "Hours", "Note"]]
        for row in report.get("timesheets", []):
            time_range = f"{row['start_time']} - {row['end_time']}".strip(" -")
            schedule_data.append(
                [
                    Paragraph(row["date"], normal_style),
                    Paragraph(time_range or "—", normal_style),
                    Paragraph(f"{float(row['hours'] or 0):.2f}", value_style),
                    Paragraph(str(row["note"] or "—"), normal_style),
                ]
            )

        if len(schedule_data) == 1:
            schedule_data.append([
                Paragraph("No timesheets for period", normal_style),
                Paragraph("", normal_style),
                Paragraph("0.00", value_style),
                Paragraph("", normal_style),
            ])

        schedule_table = Table(schedule_data, colWidths=[30 * mm, 46 * mm, 20 * mm, 76 * mm])
        schedule_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), header_bg),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, border_color),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        elements.append(schedule_table)

    elements.append(Spacer(1, 12))
    elements.append(Paragraph(
        "This document is an official salary statement prepared by the clinic. It confirms the compensation details for the stated period and is issued for lawful payroll documentation, audit, and staff verification purposes.",
        legal_style,
    ))

    signature_canvas_image = None
    if signature_info:
        elements.append(Spacer(1, 12))
        signature_table_data = [
            [Paragraph("Signer Name", label_style), Paragraph(signature_info.get("signer_name", ""), signature_detail_style)],
            [Paragraph("Signed At (UTC)", label_style), Paragraph(signature_info.get("signed_at", ""), signature_detail_style)],
            [Paragraph("Signature Hash", label_style), Paragraph(wrap_token(signature_info.get("signature_hash", "")), token_style)],
        ]
        if signature_info.get("signature_token"):
            signature_table_data.append([
                Paragraph("Signature Token", label_style),
                Paragraph(wrap_token(signature_info.get("signature_token")), token_style),
            ])
        signature_table = Table(signature_table_data, colWidths=[44 * mm, 128 * mm])
        signature_table.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 2.0, colors.HexColor("#111827")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("BACKGROUND", (0, 0), (-1, -1), colors.white),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        elements.append(signature_table)
        if signature_info.get("signature_image"):
            image_source = normalize_signature_image(signature_info["signature_image"])
            if image_source is None:
                logger.warning("Unsupported signature image type: %s", type(signature_info["signature_image"]))
            else:
                image_source = sanitize_signature_image(image_source)
                if image_source is None:
                    logger.warning("Signature image skipped")
                else:
                    try:
                        signature_canvas_image = ImageReader(image_source)
                    except Exception as exc:
                        logger.warning("Signature image skipped: %s", exc)

    def draw_signature(canvas, doc_ref):
        canvas.setStrokeColor(colors.HexColor("#d1d5db"))
        canvas.setLineWidth(0.7)
        canvas.line(16 * mm, 16 * mm, 194 * mm, 16 * mm)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#6b7280"))
        canvas.drawString(16 * mm, 11 * mm, "Generated by KarlinDent payroll system")
        canvas.drawRightString(194 * mm, 11 * mm, f"Page {doc_ref.page}")
        canvas.setFillColor(colors.black)
        block_width = 90 * mm
        block_height = 38 * mm
        block_x = A4[0] - doc.rightMargin - block_width
        block_y = 20 * mm

        canvas.setDash(4, 2)
        canvas.setStrokeColor(colors.HexColor("#111827"))
        canvas.setFillColor(colors.white)
        canvas.setLineWidth(2)
        canvas.rect(block_x, block_y, block_width, block_height, stroke=1, fill=1)
        canvas.setDash()

        canvas.setFillColor(colors.HexColor("#111827"))
        canvas.rect(block_x, block_y + block_height - (8 * mm), block_width, 8 * mm, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawString(block_x + (3 * mm), block_y + block_height - (5.5 * mm), "DIGITAL SIGNATURE")

        signer_name = "Not Signed"
        signed_at = "Pending"
        if signature_info:
            signer_name = str(signature_info.get("signer_name") or "Not Signed")
            signed_at = str(signature_info.get("signed_at") or "Pending")

        canvas.setFillColor(colors.HexColor("#111827"))
        canvas.setFont("Helvetica-Bold", 12)
        canvas.drawString(block_x + (3 * mm), block_y + (16 * mm), f"Signer: {signer_name[:34]}")
        canvas.drawString(block_x + (3 * mm), block_y + (10 * mm), f"Time: {signed_at[:34]}")

        if signature_canvas_image:
            try:
                canvas.drawImage(
                    signature_canvas_image,
                    block_x + (3 * mm),
                    block_y + (1.8 * mm),
                    width=block_width - (6 * mm),
                    height=8.8 * mm,
                    preserveAspectRatio=True,
                    mask="auto",
                )
            except Exception:
                pass

        if hasattr(canvas, "acroForm") and hasattr(canvas.acroForm, "textfield"):
            canvas.acroForm.textfield(
                name=f"signature_display_page_{doc_ref.page}",
                x=block_x + (2 * mm),
                y=block_y + (19 * mm),
                width=block_width - (4 * mm),
                height=7 * mm,
                value=f"{signer_name} | {signed_at}",
                borderStyle="solid",
                borderWidth=0.5,
                borderColor=colors.HexColor("#111827"),
                fillColor=None,
                textColor=colors.HexColor("#111827"),
                fontName="Helvetica-Bold",
                fontSize=12,
                annotationFlags="print",
                fieldFlags="readOnly",
                forceBorder=True,
            )
        canvas.drawString(16 * mm, 6 * mm, "By signing, you confirm the salary amount and payment details.")

    doc.build(elements, onFirstPage=draw_signature, onLaterPages=draw_signature)
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
    from_param = request.args.get("from")
    to_param = request.args.get("to")
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
        last_paid_at_raw = row[4]
        last_paid_at = row[4].isoformat() if row[4] else None

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
            "base_salary": round(base_salary, 2),
            "commission_rate": round(commission_rate, 4),
            "total_revenue": round(total_revenue, 2),
            "period": {"from": start_date.isoformat(), "to": end_date.isoformat()},
            "total_income": round(total_income, 2),
            "total_lab_fees": round(total_lab_fees, 2),
            "commission_base_income": commission_metrics["commission_base_income"],
            "negative_balance": commission_metrics["negative_balance"],
            "commission_part": round(commission_part, 2),
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
        
    requested_amount = data.get("amount", None)
    
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
        cur.execute(
            """
            SELECT s.id, s.base_salary, s.commission_rate, s.total_revenue, r.name
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

        from_param = data.get("from")
        to_param = data.get("to")
        has_explicit_period = bool(from_param or to_param)
        if has_explicit_period:
            try:
                period = resolve_report_period(role_name, None, from_param, to_param)
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
            if includes_lab_cost and has_explicit_period:
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
            elif includes_lab_cost:
                cur.execute(
                    """
                    SELECT
                        COALESCE(SUM(amount), 0),
                        COALESCE(SUM(GREATEST(lab_cost, 0)), 0)
                    FROM income_records
                    WHERE doctor_id = %s
                      AND salary_payment_id IS NULL
                    """,
                    (staff_id,),
                )
            elif has_explicit_period:
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
            else:
                cur.execute(
                    """
                    SELECT COALESCE(SUM(amount), 0), 0::numeric
                    FROM income_records
                    WHERE doctor_id = %s
                      AND salary_payment_id IS NULL
                    """,
                    (staff_id,),
                )
            gross_income_row = cur.fetchone()
            total_income = float(gross_income_row[0] or 0)
            total_lab_fees = max(float(gross_income_row[1] or 0), 0.0)
            commission_metrics = compute_doctor_commission_metrics(total_income, total_lab_fees, commission_rate)
            commission_part = commission_metrics["total_commission"]
        else:
            total_income = 0.0
            total_lab_fees = 0.0
            commission_part = 0.0
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

        calculated_amount = round(base_salary + commission_part + adjustments, 2)
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
                "has_signature_payload": bool(data.get("signature")),
            },
        )
        if requested_amount is not None and not math.isclose(total_amount, calculated_amount, rel_tol=0.0, abs_tol=0.009):
            logger.info(
                "Salary amount overridden for staff %s: calculated=%s final=%s by=%s",
                staff_id,
                calculated_amount,
                total_amount,
                changed_by_staff_id,
            )

        if role_name == "doctor":
            cur.execute(
                """
                UPDATE income_records
                SET salary_payment_id = %s
                WHERE doctor_id = %s AND salary_payment_id IS NULL
                """,
                (payment_id, staff_id)
            )
        else:
            try:
                cur.execute(
                    """
                    DELETE FROM staff_timesheets
                    WHERE staff_id = %s AND work_date <= %s
                    """,
                    (staff_id, payment_date)
                )
            except psycopg2.errors.UndefinedTable:
                conn.rollback()
                cur = conn.cursor()
        
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

        # Handle Report Generation if signature is provided
        signature_payload = data.get("signature")
        document_id = None
        if signature_payload:
            report = build_salary_report_data(staff_id, from_param, to_param)
            if report and "error" not in report:
                report = apply_report_amount_override(report, total_amount)
                staff_full_name = " ".join(filter(None, [report["staff"]["first_name"], report["staff"]["last_name"]])).strip()
                try:
                    signature_info = build_signature_payload({**signature_payload, "signer_name": staff_full_name})
                    signature_info["signature_token"] = compute_signature_token(
                        staff_id,
                        report["period"],
                        signature_info["signature_hash"],
                        signature_info["signer_name"],
                        signature_info["signed_at"],
                    )
                    
                    pdf_data, filename, error = save_salary_report(staff_id, report, signature_info)
                    if error:
                        logger.error("Failed to save report during salary payment for staff %s: %s", staff_id, error)
                    else:
                        # Get the ID of the document we just created
                        cur.execute(
                            "SELECT id FROM staff_documents WHERE staff_id = %s AND signature_token = %s ORDER BY id DESC LIMIT 1",
                            (staff_id, signature_info["signature_token"])
                        )
                        doc_row = cur.fetchone()
                        if doc_row:
                            document_id = doc_row[0]
                except Exception as exc:
                    logger.exception("Failed to generate report during salary payment for staff %s: %s", staff_id, exc)
        
        conn.commit()
        return jsonify({
            "id": payment_id,
            "status": "ok",
            "amount": total_amount,
            "document_id": document_id
        }), 201
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)


@staff_bp.route("", methods=["GET"])
def list_staff():
    role = request.args.get("role")
    q = request.args.get("q", "").strip()
    working_on = request.args.get("working_on")

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
            except psycopg2.errors.UndefinedTable:
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
                       (SELECT COALESCE(SUM(amount - lab_cost), 0) FROM income_records WHERE doctor_id = s.id AND salary_payment_id IS NULL) AS unpaid_revenue,
                       (SELECT COALESCE(SUM(amount), 0) FROM salary_adjustments WHERE staff_id = s.id AND applied_to_salary_payment_id IS NULL) AS pending_adjustments
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
                       COALESCE(SUM(sp.amount), 0) AS commission_income,
                       (SELECT COALESCE(SUM(amount - lab_cost), 0) FROM income_records WHERE doctor_id = s.id AND salary_payment_id IS NULL) AS unpaid_revenue,
                       (SELECT COALESCE(SUM(amount), 0) FROM salary_adjustments WHERE staff_id = s.id AND applied_to_salary_payment_id IS NULL) AS pending_adjustments
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
            # For non-doctors, unpaid salary will be estimated on the frontend
            # based on timesheets, or just show pending adjustments here
            unpaid_amount = pending_adjustments

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
                "unpaid_amount": unpaid_amount,
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
