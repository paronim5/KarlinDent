import base64
import hashlib
from datetime import date, datetime, timezone

import pytest
from backend.app import create_app
from backend import staff as staff_module

pytest.importorskip("reportlab")


SIGNATURE_DATA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABAABJzQnCgAAAABJRU5ErkJggg=="


def _sample_report():
    return {
        "staff": {
            "first_name": "Test",
            "last_name": "Assistant",
            "role": "assistant",
            "email": "assistant@test.com"
        },
        "role": "assistant",
        "period": {
            "from": "2026-03-01",
            "to": "2026-03-08"
        },
        "summary": {
            "working_days": 1,
            "total_hours": 8.0,
            "base_salary": 200.0,
            "total_salary": 1600.0
        },
        "timesheets": []
    }


def test_build_salary_report_pdf_accepts_bytes():
    signature_info = staff_module.build_signature_payload({
        "signer_name": "Test Assistant",
        "signature_data": SIGNATURE_DATA,
        "signed_at": datetime.now(timezone.utc).isoformat()
    })
    pdf = staff_module.build_salary_report_pdf(_sample_report(), signature_info)
    assert pdf[:4] == b"%PDF"


def test_build_salary_report_pdf_accepts_file_path(tmp_path):
    raw = SIGNATURE_DATA.split(",", 1)[1]
    image_bytes = base64.b64decode(raw)
    image_path = tmp_path / "signature.png"
    image_path.write_bytes(image_bytes)
    signed_at = datetime.now(timezone.utc).isoformat()
    signature_info = {
        "signer_name": "Test Assistant",
        "signed_at": signed_at,
        "signature_hash": hashlib.sha256(image_bytes + b"Test Assistant" + signed_at.encode("utf-8")).hexdigest(),
        "signature_image": str(image_path)
    }
    pdf = staff_module.build_salary_report_pdf(_sample_report(), signature_info)
    assert pdf[:4] == b"%PDF"


def test_salary_report_endpoint_returns_pdf(monkeypatch, tmp_path):
    def fake_build_salary_report_data(staff_id, from_param, to_param):
        return _sample_report()

    class FakeCursor:
        def execute(self, sql, params=None):
            return None

    class FakeConn:
        def cursor(self):
            return FakeCursor()
        def commit(self):
            return None
        def rollback(self):
            return None

    monkeypatch.setattr(staff_module, "build_salary_report_data", fake_build_salary_report_data)
    monkeypatch.setattr(staff_module, "get_connection", lambda: FakeConn())
    monkeypatch.setattr(staff_module, "release_connection", lambda conn: None)
    monkeypatch.setattr(staff_module, "get_documents_base_dir", lambda: str(tmp_path))

    app = create_app(testing=True)
    client = app.test_client()
    payload = {
        "from": "2026-03-01",
        "to": "2026-03-08",
        "signature": {
            "signer_name": "Test Assistant",
            "signature_data": SIGNATURE_DATA,
            "signed_at": datetime.now(timezone.utc).isoformat()
        }
    }
    response = client.post(
        "/api/staff/2/salary-report/pdf",
        json=payload,
        headers={"X-Staff-Id": "2", "X-Staff-Role": "admin"}
    )
    assert response.status_code == 200
    assert response.headers["Content-Type"] == "application/pdf"
    assert response.data[:4] == b"%PDF"


def test_apply_report_amount_override_updates_summary():
    report = _sample_report()
    updated = staff_module.apply_report_amount_override(report, 2450.75)
    assert updated["summary"]["computed_total_salary"] == 1600.0
    assert updated["summary"]["total_salary"] == 2450.75
    assert updated["summary"]["amount_delta"] == 850.75
    assert updated["summary"]["amount_override_applied"] is True


def test_salary_report_pdf_endpoint_applies_amount_override(monkeypatch, tmp_path):
    captured_total = {"value": None}

    def fake_build_salary_report_data(staff_id, from_param, to_param):
        return _sample_report()

    def fake_build_salary_report_pdf(report, signature_info):
        captured_total["value"] = report["summary"]["total_salary"]
        return b"%PDF-1.4\n%%EOF"

    class FakeCursor:
        def execute(self, sql, params=None):
            return None

    class FakeConn:
        def cursor(self):
            return FakeCursor()
        def commit(self):
            return None
        def rollback(self):
            return None

    monkeypatch.setattr(staff_module, "build_salary_report_data", fake_build_salary_report_data)
    monkeypatch.setattr(staff_module, "build_salary_report_pdf", fake_build_salary_report_pdf)
    monkeypatch.setattr(staff_module, "get_connection", lambda: FakeConn())
    monkeypatch.setattr(staff_module, "release_connection", lambda conn: None)
    monkeypatch.setattr(staff_module, "get_documents_base_dir", lambda: str(tmp_path))

    app = create_app(testing=True)
    client = app.test_client()
    payload = {
        "from": "2026-03-01",
        "to": "2026-03-08",
        "amount": 1999.99,
        "signature": {
            "signer_name": "Test Assistant",
            "signature_data": SIGNATURE_DATA,
            "signed_at": datetime.now(timezone.utc).isoformat()
        }
    }
    response = client.post(
        "/api/staff/2/salary-report/pdf",
        json=payload,
        headers={"X-Staff-Id": "2", "X-Staff-Role": "admin"}
    )
    assert response.status_code == 200
    assert captured_total["value"] == 1999.99


def test_pay_salary_with_signature_generates_report(monkeypatch, tmp_path):
    class FakeCursor:
        def execute(self, sql, params=None):
            pass
        def fetchone(self):
            return (1, 100.0, 0.3, 0.0, "doctor", "Test", "Doctor", None)
        def fetchall(self):
            return []
    class FakeConn:
        def cursor(self):
            return FakeCursor()
        def commit(self):
            pass
        def rollback(self):
            pass
    
    monkeypatch.setattr(staff_module, "get_connection", lambda: FakeConn())
    monkeypatch.setattr(staff_module, "release_connection", lambda conn: None)
    monkeypatch.setattr(staff_module, "get_documents_base_dir", lambda: str(tmp_path))
    
    app = create_app(testing=True)
    client = app.test_client()
    
    payload = {
        "staff_id": 2,
        "amount": 1000.0,
        "payment_date": "2026-03-13",
        "signature": {
            "signer_name": "Test Doctor",
            "signature_data": SIGNATURE_DATA,
            "signed_at": datetime.now(timezone.utc).isoformat()
        }
    }
    
    # Mock build_salary_report_data to return a valid report for a doctor
    def fake_report_data(staff_id, from_param, to_param, conn=None):
        return {
            "staff": {"id": 2, "first_name": "Test", "last_name": "Doctor"},
            "role": "doctor",
            "period": {"from": "2026-03-01", "to": "2026-03-13"},
            "patients": []
        }
    monkeypatch.setattr(staff_module, "build_salary_report_data", fake_report_data)

    response = client.post(
        "/api/staff/salaries",
        json=payload,
        headers={"X-Staff-Id": "2", "X-Staff-Role": "admin"}
    )
    assert response.status_code == 201
    data = response.get_json()
    assert data["status"] == "ok"
    assert "document_id" in data


def test_invalid_report_patients_validation(monkeypatch):
    app = create_app(testing=True)
    client = app.test_client()
    
    # Setup report with patients
    report = {
        "staff": {"id": 2, "first_name": "Test", "last_name": "Doctor"},
        "role": "doctor",
        "period": {"from": "2026-03-01", "to": "2026-03-13"},
        "patients": [{"name": "Patient A", "total_paid": 100.0}]
    }
    
    # Mock build_salary_report_data
    monkeypatch.setattr(staff_module, "build_salary_report_data", lambda *a: report)
    
    # Mock DB to return DIFFERENT patients
    class FakeCursor:
        def execute(self, sql, params=None): pass
        def fetchall(self):
            return [("Patient", "B", 200.0)]
    class FakeConn:
        def cursor(self): return FakeCursor()
    monkeypatch.setattr(staff_module, "get_connection", lambda: FakeConn())
    monkeypatch.setattr(staff_module, "release_connection", lambda c: None)

    payload = {
        "signature": {
            "signer_name": "Test Doctor",
            "signature_data": SIGNATURE_DATA,
            "signed_at": datetime.now(timezone.utc).isoformat()
        }
    }
    response = client.post("/api/staff/2/salary-report/pdf", json=payload, headers={"X-Staff-Id": "2", "X-Staff-Role": "admin"})
    assert response.status_code == 400
    assert response.get_json()["error"] == "invalid_report_patients"


def test_build_salary_report_data_doctor_uses_requested_period(monkeypatch):
    executed = []

    class FakeCursor:
        def __init__(self):
            self.rows = []

        def execute(self, sql, params=None):
            executed.append((sql, params))
            if "FROM staff s" in sql:
                self.rows = [(2, "Viktoriia", "O", 0.0, 0.3, 10000.0, date(2026, 2, 28), "doctor")]
                return
            if "SELECT lab_cost FROM income_records" in sql:
                self.rows = []
                return
            if "SELECT payment_date" in sql:
                self.rows = [(date(2026, 3, 5),)]
                return
            if "JOIN patients p" in sql:
                self.rows = [("Alice", "Novak", 4567.0, 300.0)]
                return
            if "FROM salary_adjustments" in sql:
                self.rows = [(0.0,)]
                return
            self.rows = []

        def fetchone(self):
            if not self.rows:
                return None
            return self.rows[0]

        def fetchall(self):
            return list(self.rows)

    class FakeConn:
        def cursor(self):
            return FakeCursor()

    monkeypatch.setattr(staff_module, "get_connection", lambda: FakeConn())
    monkeypatch.setattr(staff_module, "release_connection", lambda conn: None)

    report = staff_module.build_salary_report_data(2, "2026-02-28", "2026-03-13")

    assert report is not None
    assert report["patients"] == [{"name": "Alice Novak", "total_paid": 4567.0, "lab_fee": 300.0, "net_paid": 4267.0}]
    assert report["summary"]["total_income"] == 4567.0
    assert report["summary"]["total_lab_fees"] == 300.0
    assert report["summary"]["commission_base_income"] == 4267.0
    assert report["summary"]["total_commission"] == 1280.1
    assert report["summary"]["total_salary"] == 1280.1
    assert report["period"] == {"from": "2026-02-28", "to": "2026-03-13"}
    assert any("salary_payment_id IS NULL" in sql for sql, _ in executed)


def test_salary_estimate_clamps_negative_lab_fee(monkeypatch):
    class FakeCursor:
        def __init__(self):
            self.rows = []

        def execute(self, sql, params=None):
            if "FROM staff s" in sql:
                self.rows = [(0.0, 0.3, 0.0, "doctor", date(2026, 2, 28))]
                return
            if "SELECT lab_cost FROM income_records" in sql:
                self.rows = []
                return
            if "JOIN patients p" in sql:
                self.rows = [("Alice", "Novak", 1000.0, -50.0)]
                return
            if "FROM salary_adjustments" in sql:
                self.rows = [(0.0,)]
                return
            self.rows = []

        def fetchone(self):
            return self.rows[0] if self.rows else None

        def fetchall(self):
            return list(self.rows)

    class FakeConn:
        def cursor(self):
            return FakeCursor()

        def rollback(self):
            return None

    monkeypatch.setattr(staff_module, "get_connection", lambda: FakeConn())
    monkeypatch.setattr(staff_module, "release_connection", lambda conn: None)

    app = create_app(testing=True)
    client = app.test_client()
    response = client.get("/api/staff/2/salary-estimate?from=2026-03-01&to=2026-03-31")
    assert response.status_code == 200
    assert response.json["total_lab_fees"] == 0.0
    assert response.json["commission_base_income"] == 1000.0
    assert response.json["commission_part"] == 300.0
    assert response.json["adjusted_total"] == 300.0


def test_salary_estimate_prevents_negative_commission_base(monkeypatch):
    class FakeCursor:
        def __init__(self):
            self.rows = []

        def execute(self, sql, params=None):
            if "FROM staff s" in sql:
                self.rows = [(0.0, 0.4, 0.0, "doctor", date(2026, 2, 28))]
                return
            if "SELECT lab_cost FROM income_records" in sql:
                self.rows = []
                return
            if "JOIN patients p" in sql:
                self.rows = [("Alice", "Novak", 1000.0, 2500.0)]
                return
            if "FROM salary_adjustments" in sql:
                self.rows = [(0.0,)]
                return
            self.rows = []

        def fetchone(self):
            return self.rows[0] if self.rows else None

        def fetchall(self):
            return list(self.rows)

    class FakeConn:
        def cursor(self):
            return FakeCursor()

        def rollback(self):
            return None

    monkeypatch.setattr(staff_module, "get_connection", lambda: FakeConn())
    monkeypatch.setattr(staff_module, "release_connection", lambda conn: None)

    app = create_app(testing=True)
    client = app.test_client()
    response = client.get("/api/staff/2/salary-estimate?from=2026-03-01&to=2026-03-31")
    assert response.status_code == 200
    assert response.json["total_income"] == 1000.0
    assert response.json["total_lab_fees"] == 2500.0
    assert response.json["commission_base_income"] == 0.0
    assert response.json["negative_balance"] == 1500.0
    assert response.json["commission_part"] == 0.0
