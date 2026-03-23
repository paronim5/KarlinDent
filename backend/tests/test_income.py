"""
Tests for income endpoints: GET/POST /api/income/records, GET /api/income/patients.
DB calls are monkeypatched so no real PostgreSQL is needed.
"""

import pytest
from backend.app import create_app
from tests.conftest import FakeConn, FakeCursor


# ── Helpers ───────────────────────────────────────────────────────


def _make_fake(monkeypatch, fetchone_queue=None, fetchall_queue=None):
    """
    Build a FakeConn whose cursor replays the given results, then
    monkeypatch backend.income to use it.
    """
    import backend.income as mod

    conn = FakeConn()
    cur = conn.cursor_obj

    # queue_fetchone / queue_fetchall accept a list in call order
    for row in (fetchone_queue or []):
        cur.queue_fetchone(row)
    for rows in (fetchall_queue or []):
        cur.queue_fetchall(rows)

    monkeypatch.setattr(mod, "get_connection", lambda: conn)
    monkeypatch.setattr(mod, "release_connection", lambda c: None)
    return conn, cur


# ── GET /api/income/records ───────────────────────────────────────


def test_get_income_records_empty(client, monkeypatch):
    _make_fake(monkeypatch, fetchall_queue=[[]])
    resp = client.get("/api/income/records")
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_get_income_records_returns_rows(client, monkeypatch):
    from datetime import date, datetime
    rows = [
        (
            1, 1000.0, "cash", False, None, None,
            date(2025, 1, 10), "2025-01-10T10:00:00",
            1, "House", "Gregory", None,
            2, "Smith", "John", None,
            None, None,
        )
    ]
    _make_fake(monkeypatch, fetchall_queue=[rows])
    resp = client.get("/api/income/records")
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, list)


# ── POST /api/income/records validations ─────────────────────────


def test_post_income_missing_body(client):
    resp = client.post("/api/income/records", data="not-json", content_type="text/plain")
    assert resp.status_code == 400


def test_post_income_receipt_note_required(client):
    """If receipt_issued=True but receipt_note is blank → 400."""
    payload = {
        "doctor_id": 1,
        "amount": 500,
        "payment_method": "cash",
        "receipt_issued": True,
        "receipt_note": "",
    }
    resp = client.post("/api/income/records", json=payload)
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "receipt_note_required"


def test_post_income_invalid_payment_method(client):
    payload = {
        "doctor_id": 1,
        "amount": 500,
        "payment_method": "crypto",
    }
    resp = client.post("/api/income/records", json=payload)
    assert resp.status_code == 400


def test_post_income_zero_amount(client):
    payload = {
        "doctor_id": 1,
        "amount": 0,
        "payment_method": "cash",
    }
    resp = client.post("/api/income/records", json=payload)
    assert resp.status_code == 400


def test_post_income_creates_record_with_new_patient(client, monkeypatch):
    """
    Happy path: patient not provided by ID — creates inline patient,
    then creates income record and salary entry.
    """
    import backend.income as mod

    conn = FakeConn()
    cur = conn.cursor_obj

    # column_exists check for "patients"."street_address" → None (column missing)
    # column_exists check for "income_records"."lab_cost" → None (column missing)
    # ensure_patient: INSERT INTO patients RETURNING id → (1,)
    # doctor commission SELECT → (1, 0.25)
    # INSERT INTO income_records RETURNING id → (10,)
    # INSERT INTO salary_payments → None
    cur.queue_fetchone(None)   # street_address column_exists → not found
    cur.queue_fetchone(None)   # lab_cost column_exists → not found
    cur.queue_fetchone((1,))   # patient INSERT
    cur.queue_fetchone((1, 0.25))  # doctor commission
    cur.queue_fetchone((10,))  # income record INSERT

    monkeypatch.setattr(mod, "get_connection", lambda: conn)
    monkeypatch.setattr(mod, "release_connection", lambda c: None)

    payload = {
        "doctor_id": 1,
        "amount": 1200,
        "payment_method": "cash",
        "patient": {"last_name": "Novak", "first_name": "Jan"},
    }
    resp = client.post("/api/income/records", json=payload)
    assert resp.status_code == 201
    assert conn.rolled_back == 0


def test_post_income_no_rollback_when_lab_column_missing(client, monkeypatch):
    """
    If the lab_cost column does not exist, the code should gracefully
    skip it without rolling back.
    """
    import backend.income as mod

    conn = FakeConn()
    cur = conn.cursor_obj

    cur.queue_fetchone(None)      # street_address missing
    cur.queue_fetchone(None)      # lab_cost missing
    cur.queue_fetchone((2,))      # patient created
    cur.queue_fetchone((1, 0.30)) # doctor
    cur.queue_fetchone((11,))     # income record

    monkeypatch.setattr(mod, "get_connection", lambda: conn)
    monkeypatch.setattr(mod, "release_connection", lambda c: None)

    payload = {
        "doctor_id": 1,
        "amount": 800,
        "payment_method": "card",
        "patient": {"last_name": "Doe"},
        "lab_required": True,
        "lab_cost": 150,
    }
    resp = client.post("/api/income/records", json=payload)
    assert resp.status_code == 201
    assert conn.rolled_back == 0


# ── GET /api/income/patients ──────────────────────────────────────


def test_get_income_patients_no_query(client, monkeypatch):
    import backend.income as mod

    conn = FakeConn()
    conn.cursor_obj.queue_fetchall([(1, "Jan", "Smith"), (2, "Ana", "Jones")])
    monkeypatch.setattr(mod, "get_connection", lambda: conn)
    monkeypatch.setattr(mod, "release_connection", lambda c: None)

    resp = client.get("/api/income/patients")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) == 2
    assert data[0]["id"] == 1


def test_get_income_patients_with_query(client, monkeypatch):
    import backend.income as mod

    conn = FakeConn()
    conn.cursor_obj.queue_fetchall([(3, "Alice", "Brown")])
    monkeypatch.setattr(mod, "get_connection", lambda: conn)
    monkeypatch.setattr(mod, "release_connection", lambda c: None)

    resp = client.get("/api/income/patients?q=brown")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) == 1
    assert data[0]["last_name"] == "Brown"
