import pytest
from datetime import date
from backend.app import create_app
from backend.db import get_connection, release_connection

SIGNATURE_DATA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABAABJzQnCgAAAABJRU5ErkJggg=="

@pytest.fixture
def client():
    app = create_app(testing=True)
    with app.test_client() as client:
        with app.app_context():
            conn = get_connection()
            cur = conn.cursor()
            # Setup test data
            cur.execute("DELETE FROM outcome_records")
            cur.execute("DELETE FROM salary_payments")
            cur.execute("DELETE FROM income_records")
            cur.execute("DELETE FROM staff")
            cur.execute("DELETE FROM staff_roles")
            
            cur.execute("INSERT INTO staff_roles (id, name) VALUES (1, 'doctor') ON CONFLICT (id) DO NOTHING")
            cur.execute("INSERT INTO staff_roles (id, name) VALUES (2, 'assistant') ON CONFLICT (id) DO NOTHING")
            cur.execute(
                """
                INSERT INTO staff (id, role_id, first_name, last_name, email, base_salary, commission_rate, total_revenue, is_active)
                VALUES (1, 1, 'Test', 'Doctor', 'doc@test.com', 1000.00, 0.30, 5000.00, TRUE)
                """
            )
            cur.execute(
                """
                INSERT INTO staff (id, role_id, first_name, last_name, email, base_salary, commission_rate, total_revenue, is_active)
                VALUES (2, 2, 'Test', 'Assistant', 'assistant@test.com', 200.00, 0.0, 0.00, TRUE)
                """
            )
            conn.commit()
            release_connection(conn)
        yield client

def test_salary_estimate(client):
    """Test salary calculation logic"""
    resp = client.get("/api/staff/1/salary-estimate")
    assert resp.status_code == 200
    data = resp.json
    
    # Expected: 1000 + (5000 * 0.30) = 1000 + 1500 = 2500
    assert data["base_salary"] == 1000.0
    assert data["commission_rate"] == 0.30
    assert data["total_revenue"] == 5000.0
    assert data["commission_part"] == 1500.0
    assert data["estimated_total"] == 2500.0

def test_pay_salary_and_reset(client):
    """Test paying salary resets revenue and updates last_paid_at"""
    # Pay 2500
    payload = {
        "staff_id": 1,
        "amount": 2500.0,
        "payment_date": date.today().isoformat(),
        "note": "Regular payment",
        "signature": {
            "signer_name": "Test Doctor",
            "signature_data": SIGNATURE_DATA,
            "signed_at": date.today().isoformat()
        }
    }
    resp = client.post("/api/staff/salaries", json=payload)
    assert resp.status_code == 201
    
    # Verify staff state
    with client.application.app_context():
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT total_revenue, last_paid_at FROM staff WHERE id = 1")
        row = cur.fetchone()
        release_connection(conn)
        
        total_revenue = float(row[0])
        last_paid_at = row[1]
        
        assert total_revenue == 0.0  # Should be reset
        assert last_paid_at == date.today()

def test_multiple_payments_allowed(client):
    """Test that paying multiple times on same day IS allowed"""
    payload = {
        "staff_id": 1,
        "amount": 2500.0,
        "payment_date": date.today().isoformat(),
        "signature": {
            "signer_name": "Test Doctor",
            "signature_data": SIGNATURE_DATA,
            "signed_at": date.today().isoformat()
        }
    }
    # First payment
    resp1 = client.post("/api/staff/salaries", json=payload)
    assert resp1.status_code == 201
    
    # Second payment
    resp2 = client.post("/api/staff/salaries", json=payload)
    assert resp2.status_code == 201


def test_salary_payment_creates_outcome_record(client):
    payload = {
        "staff_id": 1,
        "amount": 2500.0,
        "payment_date": date.today().isoformat(),
        "note": "Outcome check",
        "signature": {
            "signer_name": "Test Doctor",
            "signature_data": SIGNATURE_DATA,
            "signed_at": date.today().isoformat()
        }
    }
    resp = client.post("/api/staff/salaries", json=payload)
    assert resp.status_code == 201

    with client.application.app_context():
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT o.amount, o.expense_date, o.description, c.name
            FROM outcome_records o
            JOIN outcome_categories c ON c.id = o.category_id
            WHERE o.amount = %s
            """,
            (2500.0,),
        )
        row = cur.fetchone()
        release_connection(conn)

        assert row is not None
        assert float(row[0]) == 2500.0
        assert row[1] == date.today()
        assert row[3] == "salary"
        assert "Test Doctor" in (row[2] or "")

def test_modified_salary_amount(client):
    """Test paying a modified amount (different from estimate)"""
    # Estimate is 2500, but we pay 3000 (bonus)
    payload = {
        "staff_id": 1,
        "amount": 3000.0,
        "payment_date": date.today().isoformat(),
        "note": "Bonus included",
        "signature": {
            "signer_name": "Test Doctor",
            "signature_data": SIGNATURE_DATA,
            "signed_at": date.today().isoformat()
        }
    }
    resp = client.post("/api/staff/salaries", json=payload)
    assert resp.status_code == 201
    
    # Verify payment record
    with client.application.app_context():
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT amount FROM salary_payments WHERE staff_id = 1")
        amount = float(cur.fetchone()[0])
        release_connection(conn)
        
        assert amount == 3000.0


def test_timesheet_payroll_for_non_doctor(client):
    payload = {
        "staff_id": 2,
        "work_date": date.today().isoformat(),
        "start_time": "09:00",
        "end_time": "17:00",
        "note": "Regular shift"
    }
    resp = client.post("/api/outcome/timesheets", json=payload)
    assert resp.status_code == 201

    payroll = {
        "staff_id": 2,
        "from": date.today().isoformat(),
        "to": date.today().isoformat(),
        "payment_date": date.today().isoformat()
    }
    resp = client.post("/api/outcome/timesheets/payroll", json=payroll)
    assert resp.status_code == 201
    data = resp.json
    assert data["hours"] == 8.0
    assert data["amount"] == 1600.0

    # Verify that it creates an outcome_record
    with client.application.app_context():
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT o.amount, o.expense_date, o.description, c.name
            FROM outcome_records o
            JOIN outcome_categories c ON c.id = o.category_id
            WHERE o.amount = %s
            """,
            (1600.0,),
        )
        row = cur.fetchone()
        release_connection(conn)

        assert row is not None
        assert float(row[0]) == 1600.0
        assert row[3] == "salary"
        assert "Test Assistant" in (row[2] or "")


def test_timesheet_payroll_rejects_doctor(client):
    payroll = {
        "staff_id": 1,
        "from": date.today().isoformat(),
        "to": date.today().isoformat()
    }
    resp = client.post("/api/outcome/timesheets/payroll", json=payroll)
    assert resp.status_code == 400
    assert resp.json["error"] == "invalid_role"


def test_timesheet_payroll_no_hours(client):
    payroll = {
        "staff_id": 2,
        "from": date.today().isoformat(),
        "to": date.today().isoformat()
    }
    resp = client.post("/api/outcome/timesheets/payroll", json=payroll)
    assert resp.status_code == 400
    assert resp.json["error"] == "no_hours"


def test_salary_payment_rolls_back_on_report_failure(client, monkeypatch):
    from datetime import datetime, timedelta
    from backend import staff as staff_module

    def fake_save_salary_report(staff_id, report, signature_info, conn=None):
        return None, None, "document_storage_failed"

    monkeypatch.setattr(staff_module, "save_salary_report", fake_save_salary_report)

    past_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    payload = {
        "staff_id": 2,
        "start_time": f"{past_date}T09:00:00Z",
        "end_time": f"{past_date}T12:00:00Z",
        "note": "Rollback test",
        "force": True
    }
    resp = client.post("/api/schedule", json=payload, headers={"X-Staff-Id": "1", "X-Staff-Role": "admin"})
    shift_id = resp.json["id"]
    client.patch(f"/api/schedule/{shift_id}/status", json={"status": "accepted"}, headers={"X-Staff-Id": "1", "X-Staff-Role": "admin"})

    pay_payload = {
        "staff_id": 2,
        "amount": 600.0,
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
    assert resp_pay.status_code == 500
    assert resp_pay.json["error"] == "document_storage_failed"

    with client.application.app_context():
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM salary_payments WHERE staff_id = 2")
        count = int(cur.fetchone()[0])
        cur.execute("SELECT status, salary_payment_id FROM shifts WHERE id = %s", (shift_id,))
        row = cur.fetchone()
        release_connection(conn)

        assert count == 0
        assert row[0] == "accepted"
        assert row[1] is None
