import psycopg2

from backend.app import create_app


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn
        self._fetchone_queue = []

    def execute(self, sql, params=None):
        if "information_schema.columns" in sql:
            table = params[0]
            column = params[1]
            if table in ("income_records", "patients") and column in ("lab_cost", "street_address"):
                return None
            self._fetchone_queue.append((1,))
            return None
        if "SELECT s.id, s.commission_rate" in sql:
            self._fetchone_queue.append((1, 0.3))
            return None
        if "INSERT INTO patients" in sql:
            self._fetchone_queue.append((1,))
            return None
        if "INSERT INTO income_records" in sql:
            self._fetchone_queue.append((10,))
            return None
        if "INSERT INTO salary_payments" in sql:
            return None
        return None

    def fetchone(self):
        if self._fetchone_queue:
            return self._fetchone_queue.pop(0)
        return None

    def fetchall(self):
        return []


class FakeConn:
    def __init__(self):
        self.rollback_count = 0
        self._cursor = FakeCursor(self)

    def cursor(self):
        return self._cursor

    def commit(self):
        return None

    def rollback(self):
        self.rollback_count += 1


def test_create_income_record_keeps_patient_when_lab_column_missing(monkeypatch):
    from backend import income as income_module

    fake_conn = FakeConn()
    monkeypatch.setattr(income_module, "get_connection", lambda: fake_conn)
    monkeypatch.setattr(income_module, "release_connection", lambda conn: None)

    app = create_app(testing=True)
    client = app.test_client()

    payload = {
        "doctor_id": 1,
        "amount": 1200,
        "payment_method": "cash",
        "patient": {"last_name": "Smith"},
        "lab_required": True,
        "lab_cost": 200,
        "lab_note": "External lab work"
    }
    response = client.post("/api/income/records", json=payload)

    assert response.status_code == 201
    assert fake_conn.rollback_count == 0


def test_create_income_record_requires_receipt_note():
    app = create_app(testing=True)
    client = app.test_client()

    payload = {
        "doctor_id": 1,
        "amount": 500,
        "payment_method": "cash",
        "receipt_issued": True,
        "receipt_note": ""
    }
    response = client.post("/api/income/records", json=payload)

    assert response.status_code == 400
    assert response.get_json()["error"] == "receipt_note_required"
