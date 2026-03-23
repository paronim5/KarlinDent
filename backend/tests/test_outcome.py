"""
Tests for outcome endpoints: records, categories, salary withdrawal logic.
"""

import pytest
from tests.conftest import FakeConn


# ── Helpers ───────────────────────────────────────────────────────


def _patch_outcome(monkeypatch, fetchone_queue=None, fetchall_queue=None):
    import backend.outcome as mod

    conn = FakeConn()
    cur = conn.cursor_obj
    for row in (fetchone_queue or []):
        cur.queue_fetchone(row)
    for rows in (fetchall_queue or []):
        cur.queue_fetchall(rows)

    monkeypatch.setattr(mod, "get_connection", lambda: conn)
    monkeypatch.setattr(mod, "release_connection", lambda c: None)
    return conn, cur


# ── GET /api/outcome/records ──────────────────────────────────────


def test_get_outcome_records_empty(client, monkeypatch):
    _patch_outcome(monkeypatch, fetchall_queue=[[], []])
    resp = client.get("/api/outcome/records")
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_get_outcome_records_with_date_range(client, monkeypatch):
    from datetime import date, datetime
    outcome_rows = [
        (1, 2, "Supplies", 300.0, date(2025, 3, 1), "Gloves", datetime(2025, 3, 1, 9))
    ]
    salary_rows = []
    _patch_outcome(monkeypatch, fetchall_queue=[outcome_rows, salary_rows])
    resp = client.get("/api/outcome/records?from=2025-03-01&to=2025-03-31")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) == 1
    assert data[0]["type"] == "outcome"
    assert data[0]["amount"] == 300.0
    assert data[0]["category_name"] == "Supplies"


def test_get_outcome_records_includes_salary_rows(client, monkeypatch):
    from datetime import date, datetime
    salary_rows = [
        (5, 10, "Anna", "Smith", 15000.0, date(2025, 3, 31), "March salary", datetime(2025, 3, 31, 12))
    ]
    _patch_outcome(monkeypatch, fetchall_queue=[[], salary_rows])
    resp = client.get("/api/outcome/records")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) == 1
    rec = data[0]
    assert rec["type"] == "salary"
    assert rec["amount"] == 15000.0
    assert rec["category_name"] == "Salary"
    assert "Anna Smith" in rec["description"]


# ── POST /api/outcome/records ─────────────────────────────────────


def test_post_outcome_record_success(client, monkeypatch):
    conn, cur = _patch_outcome(monkeypatch)
    cur.queue_fetchone((99,))  # RETURNING id
    payload = {"category_id": 1, "amount": 500, "date": "2025-03-15", "description": "Paper"}
    resp = client.post("/api/outcome/records", json=payload)
    assert resp.status_code == 201
    assert resp.get_json()["id"] == 99


def test_post_outcome_missing_body(client):
    resp = client.post("/api/outcome/records", data="bad", content_type="text/plain")
    assert resp.status_code == 400


def test_post_outcome_zero_amount(client):
    payload = {"category_id": 1, "amount": 0, "date": "2025-03-01"}
    resp = client.post("/api/outcome/records", json=payload)
    assert resp.status_code == 400


def test_post_outcome_invalid_amount(client):
    payload = {"category_id": 1, "amount": "xyz", "date": "2025-03-01"}
    resp = client.post("/api/outcome/records", json=payload)
    assert resp.status_code == 400


# ── GET /api/outcome/categories ───────────────────────────────────


def test_get_categories_returns_list(client, monkeypatch):
    conn, cur = _patch_outcome(monkeypatch)
    cur.queue_fetchall([(1, "Supplies"), (2, "Rent"), (3, "Equipment")])
    resp = client.get("/api/outcome/categories")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) == 3
    assert data[0] == {"id": 1, "name": "Supplies"}


def test_get_categories_empty(client, monkeypatch):
    conn, cur = _patch_outcome(monkeypatch)
    cur.queue_fetchall([])
    resp = client.get("/api/outcome/categories")
    assert resp.status_code == 200
    assert resp.get_json() == []


# ── Salary withdrawal evaluation logic ───────────────────────────


def test_salary_withdrawal_no_earnings():
    from backend.outcome import _evaluate_salary_withdrawal
    result = _evaluate_salary_withdrawal(0, 0, 1000)
    assert result["allowed"] is False
    assert result["error_code"] == "no_earnings"


def test_salary_withdrawal_already_withdrawn():
    from backend.outcome import _evaluate_salary_withdrawal
    result = _evaluate_salary_withdrawal(5000, 5000, 1000)
    assert result["allowed"] is False
    assert result["error_code"] == "salary_already_withdrawn"


def test_salary_withdrawal_insufficient_balance():
    from backend.outcome import _evaluate_salary_withdrawal
    result = _evaluate_salary_withdrawal(5000, 4000, 2000)
    assert result["allowed"] is False
    assert result["error_code"] == "insufficient_balance"
    assert result["available"] == 1000.0


def test_salary_withdrawal_success():
    from backend.outcome import _evaluate_salary_withdrawal
    result = _evaluate_salary_withdrawal(10000, 2000, 3000)
    assert result["allowed"] is True
    assert result["status"] == "ok"
    assert result["processed_amount"] == 3000.0
    assert result["available_after"] == 5000.0


def test_salary_withdrawal_exact_available():
    from backend.outcome import _evaluate_salary_withdrawal
    result = _evaluate_salary_withdrawal(5000, 2000, 3000)
    assert result["allowed"] is True
    assert result["available_after"] == 0.0


# ── Hours calculation ─────────────────────────────────────────────


def test_calculate_hours_basic():
    from backend.outcome import _calculate_hours
    from datetime import date, time
    hours = _calculate_hours(date(2025, 1, 1), time(8, 0), time(16, 0))
    assert hours == 8.0


def test_calculate_hours_fractional():
    from backend.outcome import _calculate_hours
    from datetime import date, time
    hours = _calculate_hours(date(2025, 1, 1), time(9, 0), time(13, 30))
    assert hours == 4.5
