"""
Tests for schedule module pure logic functions and key endpoint behaviors.
"""

import pytest
from datetime import datetime, timezone
from backend.schedule import (
    normalize_status,
    validate_completion_percent,
    validate_pay_multiplier,
    is_holiday_date,
    compute_default_multiplier,
)
from tests.conftest import FakeConn


def _patch_schedule(monkeypatch, fetchone_queue=None, fetchall_queue=None):
    import backend.schedule as mod

    conn = FakeConn()
    cur = conn.cursor_obj
    for row in (fetchone_queue or []):
        cur.queue_fetchone(row)
    for rows in (fetchall_queue or []):
        cur.queue_fetchall(rows)

    monkeypatch.setattr(mod, "get_connection", lambda: conn)
    monkeypatch.setattr(mod, "release_connection", lambda c: None)
    return conn, cur


# ── normalize_status ──────────────────────────────────────────────


def test_normalize_status_accepted():
    assert normalize_status("accepted") == "accepted"


def test_normalize_status_approved_maps_to_accepted():
    assert normalize_status("approved") == "accepted"


def test_normalize_status_pending():
    assert normalize_status("PENDING") == "pending"


def test_normalize_status_declined():
    assert normalize_status("Declined") == "declined"


# ── validate_completion_percent ───────────────────────────────────


def test_completion_percent_valid_range():
    assert validate_completion_percent(0) == 0.0
    assert validate_completion_percent(100) == 100.0
    assert validate_completion_percent(75.5) == 75.5


def test_completion_percent_none_returns_default():
    assert validate_completion_percent(None) == 100.0
    assert validate_completion_percent(None, 50.0) == 50.0


def test_completion_percent_out_of_range_raises():
    with pytest.raises(ValueError, match="invalid_completion_percent"):
        validate_completion_percent(101)

    with pytest.raises(ValueError, match="invalid_completion_percent"):
        validate_completion_percent(-1)


def test_completion_percent_non_numeric_raises():
    with pytest.raises(ValueError, match="invalid_completion_percent"):
        validate_completion_percent("bad")


# ── validate_pay_multiplier ───────────────────────────────────────


def test_pay_multiplier_valid():
    assert validate_pay_multiplier(1.0) == 1.0
    assert validate_pay_multiplier(1.5) == 1.5
    assert validate_pay_multiplier(10) == 10.0


def test_pay_multiplier_zero_raises():
    with pytest.raises(ValueError, match="invalid_pay_multiplier"):
        validate_pay_multiplier(0)


def test_pay_multiplier_exceeds_10_raises():
    with pytest.raises(ValueError, match="invalid_pay_multiplier"):
        validate_pay_multiplier(10.1)


def test_pay_multiplier_negative_raises():
    with pytest.raises(ValueError, match="invalid_pay_multiplier"):
        validate_pay_multiplier(-1)


# ── is_holiday_date ───────────────────────────────────────────────


def test_new_year_is_holiday():
    dt = datetime(2025, 1, 1, 10, 0)
    assert is_holiday_date(dt) is True


def test_christmas_is_holiday():
    dt = datetime(2025, 12, 25, 10, 0)
    assert is_holiday_date(dt) is True


def test_saturday_is_holiday():
    dt = datetime(2025, 3, 15, 10, 0)  # Saturday
    assert is_holiday_date(dt) is True


def test_sunday_is_holiday():
    dt = datetime(2025, 3, 16, 10, 0)  # Sunday
    assert is_holiday_date(dt) is True


def test_regular_weekday_is_not_holiday():
    dt = datetime(2025, 3, 17, 10, 0)  # Monday
    assert is_holiday_date(dt) is False


def test_labour_day_is_holiday():
    dt = datetime(2025, 5, 1, 9, 0)
    assert is_holiday_date(dt) is True


# ── compute_default_multiplier ────────────────────────────────────


def test_multiplier_on_holiday():
    dt = datetime(2025, 1, 1, 10, 0)
    assert compute_default_multiplier(dt) == 1.5


def test_multiplier_on_weekday():
    dt = datetime(2025, 3, 17, 10, 0)  # Regular Monday
    assert compute_default_multiplier(dt) == 1.0


# ── GET /api/schedule/shifts (basic) ─────────────────────────────


def test_get_shifts_empty(client, monkeypatch):
    conn, cur = _patch_schedule(monkeypatch)
    # ensure_schedule_schema check
    cur.queue_fetchone((1,))   # schema exists check (SELECT 1 FROM shifts LIMIT 1)
    cur.queue_fetchall([])     # no shifts

    resp = client.get("/api/schedule/shifts")
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)
