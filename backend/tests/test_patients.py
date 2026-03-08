from backend.app import create_app
from backend.patients import parse_patient_input


def test_parse_patient_input_legacy_one_word():
    ln, fn = parse_patient_input("Smith")
    assert ln == "Smith"
    assert fn is None


def test_parse_patient_input_two_words_with_spaces_and_symbols():
    ln, fn = parse_patient_input("  O'Connor  John  ")
    assert ln == "O'Connor"
    assert fn == "John"


def test_parse_patient_input_hyphenated():
    ln, fn = parse_patient_input("Smith-Jones Peter")
    assert ln == "Smith-Jones"
    assert fn == "Peter"


def test_parse_patient_input_invalid_short_last_name():
    try:
        parse_patient_input("A")
        assert False
    except ValueError:
        assert True


def test_search_endpoint_orders_exact_first(monkeypatch):
    class FakeCursor:
        def __init__(self):
            self._rows = []
            self._idx = 0

        def execute(self, sql, params):
            if "FROM patients p" in sql:
                self._rows = [
                    (2, "Ivan", "Petrov", 1),
                    (3, None, "Petrova", 2),
                    (1, "John", "Smith", 0),
                ]
            elif "SUM(ir.amount)" in sql:
                self._rows = [(1234.5,)]
            elif "JOIN staff s ON s.id = ir.doctor_id" in sql:
                from datetime import date

                self._rows = [("Anna", "Klein", date(2025, 2, 1))]
            else:
                self._rows = []
            self._idx = 0

        def fetchall(self):
            return self._rows

        def fetchone(self):
            if self._idx < len(self._rows):
                v = self._rows[self._idx]
                self._idx += 1
                return v
            return None

    class FakeConn:
        def cursor(self):
            return FakeCursor()

        def close(self):
            return None

    from backend import patients as patients_module

    monkeypatch.setattr(patients_module, "get_connection", lambda: FakeConn())
    monkeypatch.setattr(patients_module, "release_connection", lambda conn: None)

    app = create_app(testing=True)
    client = app.test_client()

    resp = client.get("/api/patients/search?q=Smith John")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) == 3
    assert data[0]["last_name"] == "Smith"
    assert data[0]["exact"] is True
    assert "banner" in data[0]
    assert data[0]["banner"]["total_paid"] == 1234.5
    assert data[0]["banner"]["last_treatment_doctor"] == "Anna Klein"
