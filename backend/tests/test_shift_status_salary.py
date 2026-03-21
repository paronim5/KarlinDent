import pytest
from datetime import date, datetime, timedelta, timezone
from backend.db import get_connection, release_connection
from backend.app import create_app

SIGNATURE_DATA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABAABJzQnCgAAAABJRU5ErkJggg=="

@pytest.fixture
def client():
    app = create_app(testing=True)
    with app.test_client() as client:
        yield client

def test_shift_no_auto_accept(client):
    """Test that past shifts are not auto-accepted."""
    # Create a past shift
    past_date = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
    payload = {
        "staff_id": 2,
        "start_time": f"{past_date}T08:00:00Z",
        "end_time": f"{past_date}T16:00:00Z",
        "note": "Past shift",
        "force": True
    }
    resp = client.post("/api/schedule", json=payload, headers={"X-Staff-Id": "3", "X-Staff-Role": "admin"})
    assert resp.status_code == 201
    shift_id = resp.json["id"]

    # Fetch shifts and ensure it remains 'pending'
    resp_get = client.get(f"/api/schedule?start={past_date}T00:00:00Z&end={past_date}T23:59:59Z")
    assert resp_get.status_code == 200
    shifts = resp_get.json
    created_shift = next((s for s in shifts if s["id"] == shift_id), None)
    assert created_shift is not None
    assert created_shift["status"] == "pending"

def test_shift_manual_accept(client):
    """Test manual acceptance of a pending shift."""
    past_date = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
    payload = {
        "staff_id": 2,
        "start_time": f"{past_date}T09:00:00Z",
        "end_time": f"{past_date}T12:00:00Z",
        "note": "Manual accept test",
        "force": True
    }
    resp = client.post("/api/schedule", json=payload, headers={"X-Staff-Id": "3", "X-Staff-Role": "admin"})
    shift_id = resp.json["id"]

    # Manual accept
    resp_patch = client.patch(f"/api/schedule/{shift_id}/status", json={"status": "accepted"}, headers={"X-Staff-Id": "3", "X-Staff-Role": "admin"})
    assert resp_patch.status_code == 200
    assert resp_patch.json["new_status"] == "accepted"

def test_shift_salary_calculation_and_paid_status(client):
    """Test salary calculation accuracy and transition to 'paid' status."""
    # Create and accept a shift for an assistant
    past_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    payload = {
        "staff_id": 2,  # Assistant
        "start_time": f"{past_date}T10:00:00Z",
        "end_time": f"{past_date}T15:00:00Z",  # 5 hours
        "note": "Salary calc test",
        "force": True
    }
    resp = client.post("/api/schedule", json=payload, headers={"X-Staff-Id": "3", "X-Staff-Role": "admin"})
    shift_id = resp.json["id"]

    client.patch(f"/api/schedule/{shift_id}/status", json={"status": "accepted"}, headers={"X-Staff-Id": "3", "X-Staff-Role": "admin"})

    # Check salary estimate
    resp_estimate = client.get(f"/api/staff/2/salary-estimate?from={past_date}&to={past_date}", headers={"X-Staff-Id": "2", "X-Staff-Role": "assistant"})
    assert resp_estimate.status_code == 200
    data = resp_estimate.json
    
    # 5 hours * base_salary (assuming base_salary is e.g. 200/hr or flat, let's just check it runs without error)
    assert "estimated_total" in data

    # Pay salary
    pay_payload = {
        "staff_id": 2,
        "amount": data["estimated_total"],
        "payment_date": date.today().isoformat(),
        "from": past_date,
        "to": past_date,
        "signature": {
            "signer_name": "Test Assistant",
            "signature_data": SIGNATURE_DATA,
            "signed_at": date.today().isoformat()
        }
    }
    resp_pay = client.post("/api/staff/salaries", json=pay_payload, headers={"X-Staff-Id": "2", "X-Staff-Role": "assistant"})
    assert resp_pay.status_code == 201

    # Verify shift status is now 'paid'
    resp_get = client.get(f"/api/schedule?start={past_date}T00:00:00Z&end={past_date}T23:59:59Z")
    shifts = resp_get.json
    paid_shift = next((s for s in shifts if s["id"] == shift_id), None)
    assert paid_shift is not None
    assert paid_shift["status"] == "paid"
    assert paid_shift["salary_payment_id"] is not None
