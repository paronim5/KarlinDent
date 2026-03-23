"""
Tests for staff-related validation and GET endpoints.
"""

import pytest
from backend.staff import validate_salary, validate_medicine_name
from tests.conftest import FakeConn


def _patch_staff(monkeypatch, fetchone_queue=None, fetchall_queue=None):
    import backend.staff as mod

    conn = FakeConn()
    cur = conn.cursor_obj
    for row in (fetchone_queue or []):
        cur.queue_fetchone(row)
    for rows in (fetchall_queue or []):
        cur.queue_fetchall(rows)

    monkeypatch.setattr(mod, "get_connection", lambda: conn)
    monkeypatch.setattr(mod, "release_connection", lambda c: None)
    return conn, cur


# ── validate_salary ───────────────────────────────────────────────


def test_validate_salary_positive():
    assert validate_salary(5000) == 5000.0
    assert validate_salary("250.75") == 250.75
    assert validate_salary(0) == 0.0  # zero is allowed for staff


def test_validate_salary_negative_raises():
    with pytest.raises(ValueError, match="invalid_salary"):
        validate_salary(-100)


def test_validate_salary_non_numeric_raises():
    with pytest.raises(ValueError, match="invalid_salary"):
        validate_salary("abc")


def test_validate_salary_infinity_raises():
    import math
    with pytest.raises(ValueError, match="invalid_salary"):
        validate_salary(math.inf)


# ── validate_medicine_name ────────────────────────────────────────


def test_validate_medicine_name_valid():
    assert validate_medicine_name("Amoxicillin") == "Amoxicillin"
    assert validate_medicine_name("  Ibuprofen  ") == "Ibuprofen"


def test_validate_medicine_name_too_short_raises():
    with pytest.raises(ValueError, match="invalid_medicine_name"):
        validate_medicine_name("X")


def test_validate_medicine_name_too_long_raises():
    with pytest.raises(ValueError, match="invalid_medicine_name"):
        validate_medicine_name("A" * 151)


def test_validate_medicine_name_empty_raises():
    with pytest.raises(ValueError, match="invalid_medicine_name"):
        validate_medicine_name("")


# ── GET /api/staff (list) ─────────────────────────────────────────


def test_get_staff_list_returns_all(client, monkeypatch):
    from datetime import date
    rows = [
        (1, "Jan", "Novak", 1, "doctor", 0.25, 50000.0, None, None, None, None, None, None, None, None, 200.0),
        (2, "Anna", "Smith", 2, "nurse",  0.0,  35000.0, None, None, None, None, None, None, None, None, 200.0),
    ]
    # ensure_weekend_salary_column check
    conn, cur = _patch_staff(monkeypatch)
    cur.queue_fetchone((1,))      # weekend_salary column exists check
    cur.queue_fetchall(rows)

    resp = client.get("/api/staff")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) == 2
    assert data[0]["first_name"] == "Jan"
    assert data[1]["first_name"] == "Anna"


def test_get_staff_list_empty(client, monkeypatch):
    conn, cur = _patch_staff(monkeypatch)
    cur.queue_fetchone((1,))   # weekend_salary check
    cur.queue_fetchall([])

    resp = client.get("/api/staff")
    assert resp.status_code == 200
    assert resp.get_json() == []


# ── GET /api/staff/roles ──────────────────────────────────────────


def test_get_staff_roles(client, monkeypatch):
    conn, cur = _patch_staff(monkeypatch)
    cur.queue_fetchall([(1, "doctor"), (2, "nurse"), (3, "receptionist")])

    resp = client.get("/api/staff/roles")
    assert resp.status_code == 200
    roles = resp.get_json()
    assert len(roles) == 3
    names = [r["name"] for r in roles]
    assert "doctor" in names
    assert "nurse" in names
