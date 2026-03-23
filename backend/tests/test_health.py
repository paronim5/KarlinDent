"""
Tests for /api/health and pure validation functions used across the app.
"""

import pytest
from backend.app import create_app
from backend.income import validate_amount, validate_payment_method, validate_lab_cost
from backend.outcome import validate_amount as outcome_validate_amount


# ── Health endpoint ───────────────────────────────────────────────


def test_health_returns_ok(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.get_json() == {"status": "ok"}


def test_unknown_route_returns_404(client):
    resp = client.get("/api/does_not_exist")
    assert resp.status_code == 404


# ── Income validators ─────────────────────────────────────────────


def test_validate_amount_positive():
    assert validate_amount(100) == 100.0
    assert validate_amount("250.50") == 250.50
    assert validate_amount(0.01) == 0.01


def test_validate_amount_zero_raises():
    with pytest.raises(ValueError, match="invalid_amount"):
        validate_amount(0)


def test_validate_amount_negative_raises():
    with pytest.raises(ValueError, match="invalid_amount"):
        validate_amount(-5)


def test_validate_amount_non_numeric_raises():
    with pytest.raises(ValueError, match="invalid_amount"):
        validate_amount("abc")


def test_validate_payment_method_valid():
    assert validate_payment_method("cash") == "cash"
    assert validate_payment_method("card") == "card"


def test_validate_payment_method_invalid_raises():
    with pytest.raises(ValueError, match="invalid_payment_method"):
        validate_payment_method("bitcoin")

    with pytest.raises(ValueError, match="invalid_payment_method"):
        validate_payment_method("")


def test_validate_lab_cost_optional_zero():
    assert validate_lab_cost(None, required=False) == 0.0
    assert validate_lab_cost("", required=False) == 0.0


def test_validate_lab_cost_required_zero_raises():
    with pytest.raises(ValueError, match="lab_cost_required"):
        validate_lab_cost(0, required=True)


def test_validate_lab_cost_positive():
    assert validate_lab_cost(150, required=True) == 150.0
    assert validate_lab_cost("99.99", required=False) == 99.99


def test_validate_lab_cost_negative_raises():
    with pytest.raises(ValueError, match="invalid_lab_cost"):
        validate_lab_cost(-10, required=False)


# ── Outcome validators ────────────────────────────────────────────


def test_outcome_validate_amount_positive():
    assert outcome_validate_amount(500) == 500.0


def test_outcome_validate_amount_zero_raises():
    with pytest.raises(ValueError, match="invalid_amount"):
        outcome_validate_amount(0)
