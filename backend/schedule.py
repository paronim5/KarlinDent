from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import json
import io

from flask import Blueprint, jsonify, request, send_file, Response
import psycopg2

from .db import get_connection, release_connection

schedule_bp = Blueprint("schedule", __name__)

_VERIFIED_SCHEMAS = set()
_ALLOWED_STATUSES = {"pending", "accepted", "declined"}
_HOLIDAY_MULTIPLIER = 1.5
_DEFAULT_MULTIPLIER = 1.0
_HOLIDAY_MM_DD = {
    "01-01",
    "05-01",
    "05-08",
    "07-05",
    "07-06",
    "09-28",
    "10-28",
    "11-17",
    "12-24",
    "12-25",
    "12-26",
}

def parse_iso_datetime(dt_str: str) -> datetime:
    return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))

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

def ensure_admin_authorized() -> Optional[Response]:
    auth = get_authenticated_staff()
    if not auth:
        return jsonify({"error": "unauthorized"}), 401
    role = str(auth.get("role") or "").lower()
    if role not in {"admin", "administrator"}:
        return jsonify({"error": "forbidden"}), 403
    return None

def normalize_status(value: Any) -> str:
    status = str(value or "").strip().lower()
    if status == "approved":
        status = "accepted"
    return status

def validate_completion_percent(value: Any, default_value: float = 100.0) -> float:
    if value is None:
        return float(default_value)
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ValueError("invalid_completion_percent")
    if parsed < 0 or parsed > 100:
        raise ValueError("invalid_completion_percent")
    return round(parsed, 2)

def validate_pay_multiplier(value: Any) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ValueError("invalid_pay_multiplier")
    if parsed <= 0 or parsed > 10:
        raise ValueError("invalid_pay_multiplier")
    return round(parsed, 3)

def is_holiday_date(dt_value: datetime) -> bool:
    day = dt_value.date()
    if day.weekday() >= 5:
        return True
    return day.strftime("%m-%d") in _HOLIDAY_MM_DD

def compute_default_multiplier(start_time: datetime) -> float:
    return _HOLIDAY_MULTIPLIER if is_holiday_date(start_time) else _DEFAULT_MULTIPLIER

def check_conflicts(cur, staff_id: int, start_time: datetime, end_time: datetime, exclude_shift_id: Optional[int] = None) -> List[Dict[str, Any]]:
    query = """
        SELECT s.id, s.start_time, s.end_time, st.first_name, st.last_name
        FROM shifts s
        JOIN staff st ON s.staff_id = st.id
        WHERE s.staff_id = %s
          AND s.start_time < %s
          AND s.end_time > %s
          AND s.status != 'declined'
    """
    params = [staff_id, end_time, start_time]
    
    if exclude_shift_id:
        query += " AND s.id != %s"
        params.append(exclude_shift_id)
        
    cur.execute(query, params)
    rows = cur.fetchall()
    
    conflicts = []
    for row in rows:
        conflicts.append({
            "id": row[0],
            "start_time": row[1].isoformat(),
            "end_time": row[2].isoformat(),
            "staff_name": f"{row[3]} {row[4]}"
        })
    return conflicts

def log_audit(cur, action: str, shift_id: Optional[int], details: Dict[str, Any], user_id: Optional[int] = None):
    admin_id = user_id
    cur.execute(
        """
        INSERT INTO schedule_audit_logs (shift_id, action, changed_by, details)
        VALUES (%s, %s, %s, %s)
        """,
        (shift_id, action, admin_id, json.dumps(details, default=str))
    )

def send_notification(staff_id: int, message: str):
    print(f"[NOTIFICATION] To Staff ID {staff_id}: {message}")

def ensure_schedule_schema(cur):
    if "schedule_shifts_v2" in _VERIFIED_SCHEMAS:
        return
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS shifts (
            id              SERIAL PRIMARY KEY,
            staff_id        INT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
            start_time      TIMESTAMPTZ NOT NULL,
            end_time        TIMESTAMPTZ NOT NULL,
            note            TEXT,
            status          VARCHAR(20) NOT NULL DEFAULT 'pending',
            approved_by     INT REFERENCES staff(id),
            approved_at     TIMESTAMPTZ,
            completion_percent NUMERIC(5, 2) NOT NULL DEFAULT 100,
            pay_multiplier  NUMERIC(6, 3) NOT NULL DEFAULT 1.0,
            salary_payment_id INT REFERENCES salary_payments(id),
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    cur.execute("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'")
    cur.execute("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS approved_by INT REFERENCES staff(id)")
    cur.execute("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ")
    cur.execute("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS completion_percent NUMERIC(5, 2) NOT NULL DEFAULT 100")
    cur.execute("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS pay_multiplier NUMERIC(6, 3) NOT NULL DEFAULT 1.0")
    cur.execute("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS salary_payment_id INT REFERENCES salary_payments(id)")
    # cur.execute("UPDATE shifts SET status = 'accepted' WHERE status = 'approved'")
    # cur.execute("UPDATE shifts SET status = 'pending' WHERE status IS NULL OR status NOT IN ('pending', 'accepted', 'declined', 'paid')")
    cur.execute("UPDATE shifts SET completion_percent = 100 WHERE completion_percent IS NULL")
    cur.execute("UPDATE shifts SET pay_multiplier = 1.0 WHERE pay_multiplier IS NULL OR pay_multiplier <= 0")

    # Auto-accept past shifts that got default 'pending' status from migration
    cur.execute("UPDATE shifts SET status = 'accepted' WHERE status = 'pending' AND end_time < NOW()")

    cur.execute("CREATE INDEX IF NOT EXISTS idx_shifts_time ON shifts (start_time, end_time)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_shifts_staff ON shifts (staff_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts (status)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_shifts_payment ON shifts (salary_payment_id)")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS schedule_audit_logs (
            id          SERIAL PRIMARY KEY,
            shift_id    INT REFERENCES shifts(id) ON DELETE SET NULL,
            action      VARCHAR(40) NOT NULL,
            changed_by  INT REFERENCES staff(id),
            details     JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_schedule_audit_shift ON schedule_audit_logs(shift_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_schedule_audit_action ON schedule_audit_logs(action)")

    # Widen action column from VARCHAR(20) to VARCHAR(40) for existing databases
    cur.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'schedule_audit_logs'
                AND column_name = 'action'
                AND character_maximum_length < 40
            ) THEN
                ALTER TABLE schedule_audit_logs ALTER COLUMN action TYPE VARCHAR(40);
            END IF;
        END $$;
    """)

    # Fix FK constraint from RESTRICT to ON DELETE SET NULL for existing databases
    cur.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'schedule_audit_logs_shift_id_fkey'
                AND table_name = 'schedule_audit_logs'
            ) THEN
                -- Check if current FK is not ON DELETE SET NULL
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.referential_constraints
                    WHERE constraint_name = 'schedule_audit_logs_shift_id_fkey'
                    AND delete_rule = 'SET NULL'
                ) THEN
                    ALTER TABLE schedule_audit_logs DROP CONSTRAINT schedule_audit_logs_shift_id_fkey;
                    ALTER TABLE schedule_audit_logs
                        ADD CONSTRAINT schedule_audit_logs_shift_id_fkey
                        FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL;
                END IF;
            END IF;
        END $$;
    """)

    # Fix details column from TEXT to JSONB for existing databases
    cur.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'schedule_audit_logs'
                AND column_name = 'details'
                AND data_type = 'text'
            ) THEN
                ALTER TABLE schedule_audit_logs
                    ALTER COLUMN details TYPE JSONB
                    USING CASE
                        WHEN details IS NULL OR details = '' THEN '{}'::jsonb
                        ELSE details::jsonb
                    END;
                ALTER TABLE schedule_audit_logs
                    ALTER COLUMN details SET DEFAULT '{}'::jsonb;
            END IF;
        END $$;
    """)

    cur.connection.commit()
    _VERIFIED_SCHEMAS.add("schedule_shifts_v2")

def is_missing_column_error(exc: Exception, column_name: str) -> bool:
    message = str(exc).lower()
    return "does not exist" in message and column_name.lower() in message

def auto_accept_past_shifts(cur) -> None:
    # Disabled to allow manual acceptance of unpaid shifts
    pass

@schedule_bp.route("", methods=["GET"])
def list_shifts():
    start_str = request.args.get("start")
    end_str = request.args.get("end")
    staff_id = request.args.get("staff_id")
    status = normalize_status(request.args.get("status"))
    unpaid_only = request.args.get("unpaid") == "true"
    
    if not start_str or not end_str:
        return jsonify({"error": "start and end dates are required"}), 400
        
    try:
        start_date = parse_iso_datetime(start_str)
        end_date = parse_iso_datetime(end_str)
    except ValueError:
        return jsonify({"error": "invalid_date_format"}), 400

    conn = get_connection()
    try:
        cur = conn.cursor()
        ensure_schedule_schema(cur)
        auto_accept_past_shifts(cur)
        cur.execute(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'shifts' AND column_name = 'salary_payment_id'
            )
            """
        )
        has_salary_payment_column = bool(cur.fetchone()[0])
        salary_payment_select = "s.salary_payment_id" if has_salary_payment_column else "NULL::int AS salary_payment_id"

        query = f"""
            SELECT s.id, s.staff_id, s.start_time, s.end_time, s.note, 
                   st.first_name, st.last_name, r.name as role_name, r.id as role_id,
                   s.status, s.approved_by, s.approved_at, {salary_payment_select},
                   COALESCE(s.completion_percent, 100), COALESCE(s.pay_multiplier, 1.0)
            FROM shifts s
            JOIN staff st ON s.staff_id = st.id
            JOIN staff_roles r ON st.role_id = r.id
            WHERE s.start_time < %s AND s.end_time > %s
        """
        params = [end_date, start_date]
        
        if staff_id:
            query += " AND s.staff_id = %s"
            params.append(int(staff_id))
            
        if status:
            if status == "on_duty":
                now = datetime.now(start_date.tzinfo) if start_date.tzinfo else datetime.now()
                query += " AND s.start_time <= %s AND s.end_time >= %s AND s.status IN ('pending', 'accepted')"
                params.extend([now, now])
            elif status in _ALLOWED_STATUSES:
                query += " AND s.status = %s"
                params.append(status)
            else:
                return jsonify({"error": "invalid_status"}), 400
            
        if unpaid_only and has_salary_payment_column:
            query += " AND s.salary_payment_id IS NULL"
            
        query += " ORDER BY s.start_time ASC"
        
        try:
            cur.execute(query, params)
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()
            _VERIFIED_SCHEMAS.discard("schedule_shifts_v2")
            ensure_schedule_schema(cur)
            cur.execute(query, params)
        rows = cur.fetchall()
        
        shifts = []
        for row in rows:
            try:
                if not row:
                    continue
                    
                s_id, s_staff_id, s_start, s_end, s_note, st_first, st_last, r_name, r_id, s_status, s_approved_by, s_approved_at, s_payment_id, completion_percent, pay_multiplier = row
                duration_hours = max((s_end - s_start).total_seconds() / 3600.0, 0.0)
                salary_hours = duration_hours * (float(completion_percent or 100) / 100.0)
                
                shifts.append({
                    "id": s_id,
                    "staff_id": s_staff_id,
                    "start": s_start.isoformat(),
                    "end": s_end.isoformat(),
                    "title": f"{st_first or ''} {st_last or ''}".strip(),
                    "note": s_note,
                    "staff_name": f"{st_first or ''} {st_last or ''}".strip(),
                    "role": r_name,
                    "role_id": r_id,
                    "status": s_status,
                    "approved_by": s_approved_by,
                    "approved_at": s_approved_at.isoformat() if s_approved_at else None,
                    "salary_payment_id": s_payment_id,
                    "completion_percent": float(completion_percent or 100.0),
                    "pay_multiplier": float(pay_multiplier or 1.0),
                    "salary_hours": round(salary_hours, 2),
                    "resourceId": s_staff_id
                })
            except Exception as e:
                print(f"Error processing shift row {row}: {e}")
                continue
            
        return jsonify(shifts)
    except Exception as e:
        print(f"Error in list_shifts: {e}")
        return jsonify({"error": "internal_server_error", "message": "An unexpected error occurred"}), 500
    finally:
        release_connection(conn)

@schedule_bp.route("", methods=["POST"])
def create_shift():
    auth_error = ensure_admin_authorized()
    if auth_error:
        return auth_error
    data = request.get_json()
    if not data:
        return jsonify({"error": "no_data"}), 400
        
    required = ["staff_id", "start_time", "end_time"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"missing_field_{field}"}), 400
            
    try:
        start_time = parse_iso_datetime(data["start_time"])
        end_time = parse_iso_datetime(data["end_time"])
        staff_id = int(data["staff_id"])
        note = str(data.get("note") or "").strip()
        if len(note) > 500:
            return jsonify({"error": "note_too_long"}), 400
        completion_percent = validate_completion_percent(data.get("completion_percent"), 100.0)
        if "pay_multiplier" in data:
            pay_multiplier = validate_pay_multiplier(data.get("pay_multiplier"))
        else:
            pay_multiplier = compute_default_multiplier(start_time)
        
        if end_time <= start_time:
            return jsonify({"error": "end_time_must_be_after_start_time"}), 400
            
    except ValueError as exc:
        return jsonify({"error": str(exc) if str(exc) else "invalid_data_format"}), 400

    conn = get_connection()
    try:
        cur = conn.cursor()
        ensure_schedule_schema(cur)
        auto_accept_past_shifts(cur)

        cur.execute("SELECT id FROM staff WHERE id = %s", (staff_id,))
        if not cur.fetchone():
            return jsonify({"error": "staff_not_found"}), 404
        
        # One shift per day rule: check if staff already has a shift on this calendar day
        cur.execute(
            """
            SELECT id FROM shifts
            WHERE staff_id = %s
              AND start_time::date = %s::date
              AND status != 'declined'
            """,
            (staff_id, start_time)
        )
        if cur.fetchone():
            return jsonify({"error": "staff_already_has_shift_this_day"}), 409

        conflicts = check_conflicts(cur, staff_id, start_time, end_time)
        if conflicts and not data.get("force", False):
            return jsonify({"error": "conflict_detected", "conflicts": conflicts}), 409
            
        cur.execute(
            """
            INSERT INTO shifts (staff_id, start_time, end_time, note, status, completion_percent, pay_multiplier)
            VALUES (%s, %s, %s, %s, 'pending', %s, %s)
            RETURNING id
            """,
            (staff_id, start_time, end_time, note, completion_percent, pay_multiplier)
        )
        shift_id = cur.fetchone()[0]
        
        auth = get_authenticated_staff()
        log_audit(cur, "CREATE", shift_id, data, user_id=auth["id"] if auth else None)
        
        send_notification(staff_id, f"New shift assigned: {start_time} - {end_time}")

        conn.commit()
        return jsonify({"id": shift_id, "status": "created"}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        release_connection(conn)

@schedule_bp.route("/<int:shift_id>", methods=["PUT"])
def update_shift(shift_id):
    auth_error = ensure_admin_authorized()
    if auth_error:
        return auth_error
    auth = get_authenticated_staff()
    admin_id = int(auth["id"]) if auth else None
    data = request.get_json() or {}
    conn = get_connection()
    try:
        cur = conn.cursor()
        ensure_schedule_schema(cur)
        auto_accept_past_shifts(cur)
        
        cur.execute(
            "SELECT staff_id, start_time, end_time, note, status, salary_payment_id, completion_percent, pay_multiplier FROM shifts WHERE id = %s",
            (shift_id,),
        )
        existing = cur.fetchone()
        if not existing:
            return jsonify({"error": "shift_not_found"}), 404
        if existing[5] is not None:
            return jsonify({"error": "paid_shift_locked"}), 409
            
        current_staff_id = existing[0]
        
        staff_id = int(data.get("staff_id", current_staff_id))
        cur.execute("SELECT id FROM staff WHERE id = %s", (staff_id,))
        if not cur.fetchone():
            return jsonify({"error": "staff_not_found"}), 404
        start_time = parse_iso_datetime(data["start_time"]) if "start_time" in data else existing[1]
        end_time = parse_iso_datetime(data["end_time"]) if "end_time" in data else existing[2]
        note = str(data.get("note", existing[3] or "")).strip()
        if len(note) > 500:
            return jsonify({"error": "note_too_long"}), 400
        status = normalize_status(data.get("status", existing[4]))
        if status not in _ALLOWED_STATUSES:
            return jsonify({"error": "invalid_status"}), 400
        completion_percent = validate_completion_percent(data.get("completion_percent"), float(existing[6] or 100.0))
        if "pay_multiplier" in data:
            pay_multiplier = validate_pay_multiplier(data.get("pay_multiplier"))
        elif "start_time" in data or "end_time" in data:
            pay_multiplier = compute_default_multiplier(start_time)
        else:
            pay_multiplier = float(existing[7] or 1.0)
        if end_time <= start_time:
            return jsonify({"error": "end_time_must_be_after_start_time"}), 400
        
        if staff_id != current_staff_id or "start_time" in data or "end_time" in data:
            conflicts = check_conflicts(cur, staff_id, start_time, end_time, exclude_shift_id=shift_id)
            if conflicts and not data.get("force", False):
                return jsonify({"error": "conflict_detected", "conflicts": conflicts}), 409

        if status == "accepted":
            tz = start_time.tzinfo if start_time.tzinfo else datetime.now().astimezone().tzinfo
            if start_time.date() > datetime.now(tz).date():
                return jsonify({"error": "cannot_accept_future_shift"}), 400
        
        cur.execute(
            """
            UPDATE shifts 
            SET staff_id = %s,
                start_time = %s,
                end_time = %s,
                note = %s,
                status = %s,
                approved_by = CASE WHEN %s = 'accepted' THEN %s ELSE approved_by END,
                approved_at = CASE WHEN %s = 'accepted' THEN COALESCE(approved_at, NOW()) ELSE approved_at END,
                completion_percent = %s,
                pay_multiplier = %s,
                updated_at = NOW()
            WHERE id = %s
            """,
            (
                staff_id,
                start_time,
                end_time,
                note,
                status,
                status,
                admin_id,
                status,
                completion_percent,
                pay_multiplier,
                shift_id,
            ),
        )
        
        log_audit(cur, "UPDATE", shift_id, {"old": existing, "new": data}, user_id=admin_id)
        
        send_notification(staff_id, f"Shift updated: {start_time} - {end_time}")
        if staff_id != current_staff_id:
             send_notification(current_staff_id, f"Shift removed: {existing[1]} - {existing[2]}")

        conn.commit()
        return jsonify({"status": "updated"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        release_connection(conn)

@schedule_bp.route("/<int:shift_id>/status", methods=["PATCH"])
def update_shift_status(shift_id):
    auth_error = ensure_admin_authorized()
    if auth_error:
        return auth_error
    data = request.get_json()
    if not data or "status" not in data:
        return jsonify({"error": "missing_status"}), 400
        
    new_status = normalize_status(data["status"])
    if new_status not in _ALLOWED_STATUSES:
        return jsonify({"error": "invalid_status"}), 400
        
    conn = get_connection()
    try:
        cur = conn.cursor()
        ensure_schedule_schema(cur)
        auto_accept_past_shifts(cur)
        auth = get_authenticated_staff()
        admin_id = int(auth["id"]) if auth else None
        
        cur.execute("SELECT staff_id, start_time, end_time, status, salary_payment_id FROM shifts WHERE id = %s", (shift_id,))
        existing = cur.fetchone()
        if not existing:
            return jsonify({"error": "shift_not_found"}), 404
        if existing[4] is not None:
            return jsonify({"error": "paid_shift_locked"}), 409
            
        staff_id, start_time, end_time, current_status, _ = existing
        
        if new_status == "accepted":
            tz = start_time.tzinfo if start_time.tzinfo else datetime.now().astimezone().tzinfo
            if start_time.date() > datetime.now(tz).date():
                return jsonify({"error": "cannot_accept_future_shift"}), 400
            
        cur.execute(
            """
            UPDATE shifts 
            SET status = %s,
                approved_by = CASE WHEN %s = 'accepted' THEN %s ELSE approved_by END,
                approved_at = CASE WHEN %s = 'accepted' THEN COALESCE(approved_at, NOW()) ELSE approved_at END,
                updated_at = NOW()
            WHERE id = %s
            """,
            (new_status, new_status, admin_id, new_status, shift_id)
        )
        
        log_audit(cur, f"STATUS_{new_status.upper()}", shift_id, {"old_status": current_status, "new_status": new_status}, user_id=admin_id)
        
        send_notification(staff_id, f"Shift {new_status}: {start_time} - {end_time}")

        conn.commit()
        return jsonify({"status": "updated", "new_status": new_status}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        release_connection(conn)

@schedule_bp.route("/<int:shift_id>", methods=["DELETE"])
def delete_shift(shift_id):
    auth_error = ensure_admin_authorized()
    if auth_error:
        return auth_error
    conn = get_connection()
    try:
        cur = conn.cursor()
        ensure_schedule_schema(cur)
        auto_accept_past_shifts(cur)
        
        cur.execute("SELECT staff_id, start_time, end_time, salary_payment_id FROM shifts WHERE id = %s", (shift_id,))
        existing = cur.fetchone()
        if not existing:
            return jsonify({"error": "shift_not_found"}), 404
        if existing[3] is not None:
            return jsonify({"error": "paid_shift_locked"}), 409
            
        auth = get_authenticated_staff()
        cur.execute("DELETE FROM schedule_audit_logs WHERE shift_id = %s", (shift_id,))
        cur.execute("DELETE FROM shifts WHERE id = %s", (shift_id,))
        
        send_notification(existing[0], f"Shift cancelled: {existing[1]} - {existing[2]}")

        conn.commit()
        return jsonify({"status": "deleted"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        release_connection(conn)

@schedule_bp.route("/bulk-status", methods=["POST"])
def bulk_update_shift_status():
    auth_error = ensure_admin_authorized()
    if auth_error:
        return auth_error
    data = request.get_json()
    if not data or "shift_ids" not in data or "status" not in data:
        return jsonify({"error": "missing_data"}), 400
        
    shift_ids = data["shift_ids"]
    new_status = normalize_status(data["status"])
    if new_status not in _ALLOWED_STATUSES:
        return jsonify({"error": "invalid_status"}), 400
        
    if not isinstance(shift_ids, list):
        return jsonify({"error": "shift_ids_must_be_list"}), 400

    conn = get_connection()
    try:
        cur = conn.cursor()
        ensure_schedule_schema(cur)
        auto_accept_past_shifts(cur)
        auth = get_authenticated_staff()
        admin_id = int(auth["id"]) if auth else None
        
        now = datetime.now()
        
        results = {"updated": [], "failed": []}
        
        for s_id in shift_ids:
            cur.execute("SELECT staff_id, start_time, end_time, status, salary_payment_id FROM shifts WHERE id = %s", (s_id,))
            row = cur.fetchone()
            if not row:
                results["failed"].append({"id": s_id, "error": "not_found"})
                continue

            staff_id, start_time, end_time, current_status, salary_payment_id = row
            if salary_payment_id is not None:
                results["failed"].append({"id": s_id, "error": "paid_shift_locked"})
                continue

            if new_status == "accepted":
                tz = start_time.tzinfo if start_time.tzinfo else now.astimezone().tzinfo
                if start_time.date() > now.replace(tzinfo=tz).date():
                    results["failed"].append({"id": s_id, "error": "future_shift"})
                    continue
                
            cur.execute(
                """
                UPDATE shifts 
                SET status = %s,
                    approved_by = CASE WHEN %s = 'accepted' THEN %s ELSE approved_by END,
                    approved_at = CASE WHEN %s = 'accepted' THEN COALESCE(approved_at, NOW()) ELSE approved_at END,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (new_status, new_status, admin_id, new_status, s_id)
            )
            
            log_audit(cur, f"STATUS_{new_status.upper()}", s_id, {"old_status": current_status, "new_status": new_status}, user_id=admin_id)
            results["updated"].append(s_id)
            
        conn.commit()
        return jsonify(results), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        release_connection(conn)

@schedule_bp.route("/export", methods=["GET"])
def export_schedule():
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet

    start_str = request.args.get("start")
    end_str = request.args.get("end")
    
    if not start_str or not end_str:
        return jsonify({"error": "start and end dates are required"}), 400
        
    try:
        start_date = parse_iso_datetime(start_str)
        end_date = parse_iso_datetime(end_str)
    except ValueError:
        return jsonify({"error": "invalid_date_format"}), 400
        
    conn = get_connection()
    try:
        cur = conn.cursor()
        ensure_schedule_schema(cur)
        query = """
            SELECT s.start_time, s.end_time, st.first_name, st.last_name, r.name, s.note
            FROM shifts s
            JOIN staff st ON s.staff_id = st.id
            JOIN staff_roles r ON st.role_id = r.id
            WHERE s.start_time >= %s AND s.end_time <= %s
            ORDER BY s.start_time ASC, st.last_name ASC
        """
        cur.execute(query, (start_date, end_date))
        rows = cur.fetchall()
    finally:
        release_connection(conn)
        
    # Generate PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4))
    elements = []
    styles = getSampleStyleSheet()
    
    elements.append(Paragraph(f"Schedule Report: {start_str[:10]} to {end_str[:10]}", styles['Title']))
    elements.append(Spacer(1, 20))
    
    data = [["Date", "Time", "Staff Member", "Role", "Notes"]]
    for row in rows:
        date_str = row[0].strftime("%Y-%m-%d")
        time_str = f"{row[0].strftime('%H:%M')} - {row[1].strftime('%H:%M')}"
        name = f"{row[2]} {row[3]}"
        role = row[4]
        note = row[5] or ""
        data.append([date_str, time_str, name, role, note])
        
    table = Table(data, colWidths=[80, 100, 150, 100, 200])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
    ]))
    
    elements.append(table)
    doc.build(elements)
    
    buffer.seek(0)
    return send_file(
        buffer,
        as_attachment=True,
        download_name=f"schedule_{start_str[:10]}_{end_str[:10]}.pdf",
        mimetype='application/pdf'
    )
