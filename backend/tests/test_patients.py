"""
Tests for patient search endpoint and parse_patient_input helper.
"""

import pytest
from backend.patients import parse_patient_input
from tests.conftest import FakeConn


def _patch_patients(monkeypatch, fetchone_queue=None, fetchall_queue=None):
    import backend.patients as mod

    conn = FakeConn()
    cur = conn.cursor_obj
    for row in (fetchone_queue or []):
        cur.queue_fetchone(row)
    for rows in (fetchall_queue or []):
        cur.queue_fetchall(rows)

    monkeypatch.setattr(mod, "get_connection", lambda: conn)
    monkeypatch.setattr(mod, "release_connection", lambda c: None)
    return conn, cur


# ── parse_patient_input ───────────────────────────────────────────


def test_parse_patient_last_name_only():
    last, first = parse_patient_input("Smith")
    assert last == "Smith"
    assert first is None


def test_parse_patient_first_and_last():
    last, first = parse_patient_input("Smith John")
    assert last == "Smith"
    assert first == "John"


def test_parse_patient_empty_raises():
    with pytest.raises(ValueError, match="invalid_patient"):
        parse_patient_input("")


def test_parse_patient_too_long_raises():
    with pytest.raises(ValueError, match="invalid_patient"):
        parse_patient_input("A" * 102)


def test_parse_patient_single_char_raises():
    with pytest.raises(ValueError, match="invalid_patient"):
        parse_patient_input("X")


def test_parse_patient_strips_extra_spaces():
    last, first = parse_patient_input("  Novak   Jana  ")
    assert last == "Novak"
    assert first == "Jana"


# ── GET /api/patients/search ──────────────────────────────────────


def test_search_empty_query_returns_empty(client):
    resp = client.get("/api/patients/search")
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_search_returns_patients(client, monkeypatch):
    _patch_patients(
        monkeypatch,
        fetchall_queue=[[(1, "Jan", "Smith", None, None, None)]]
    )
    resp = client.get("/api/patients/search?q=smith")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) == 1
    assert data[0]["last_name"] == "Smith"


def test_search_by_id(client, monkeypatch):
    _patch_patients(
        monkeypatch,
        fetchall_queue=[[(5, "Karl", "Novak", "555-1234", None, None)]]
    )
    resp = client.get("/api/patients/search?q=5")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) == 1
    assert data[0]["id"] == 5


def test_search_no_results(client, monkeypatch):
    _patch_patients(monkeypatch, fetchall_queue=[[]])
    resp = client.get("/api/patients/search?q=xyzzy")
    assert resp.status_code == 200
    assert resp.get_json() == []
