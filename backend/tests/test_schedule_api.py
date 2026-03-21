
from datetime import datetime, timezone

import pytest

from backend.app import create_app
from backend import schedule

@pytest.fixture
def client():
    app = create_app(testing=True)
    with app.test_client() as client:
        yield client

def test_list_shifts_missing_params(client):
    response = client.get("/api/schedule")
    assert response.status_code == 400
    assert "start and end dates are required" in response.json["error"]

def test_list_shifts_invalid_date(client):
    response = client.get("/api/schedule?start=invalid&end=2024-01-01")
    assert response.status_code == 400
    assert "invalid_date_format" in response.json["error"]

def test_list_shifts_query_error(monkeypatch, client):
    class MockCursor:
        def execute(self, query, params):
            raise Exception("Simulated DB Error")
        def fetchall(self):
            return []

    class MockConn:
        def cursor(self):
            return MockCursor()
        def close(self):
            pass

    def mock_get_connection():
            if not hasattr(mock_get_connection, "conn"):
                mock_get_connection.conn = MockConn()
            return mock_get_connection.conn

    def mock_release_connection(conn):
        pass

    monkeypatch.setattr(schedule, "get_connection", mock_get_connection)
    monkeypatch.setattr(schedule, "release_connection", mock_release_connection)

    response = client.get("/api/schedule?start=2024-01-01&end=2024-01-02")
    assert response.status_code == 500
    assert response.json["error"] == "internal_server_error"
    assert response.json["message"] == "An unexpected error occurred"

def test_create_shift_missing_data(client):
    response = client.post("/api/schedule", json={})
    assert response.status_code == 401
    assert response.json["error"] == "unauthorized"

def test_create_shift_missing_field(client):
    headers = {"X-Staff-Id": "3", "X-Staff-Role": "administrator"}
    response = client.post("/api/schedule", json={"start_time": "2024-01-01", "end_time": "2024-01-01"}, headers=headers)
    assert response.status_code == 400
    assert "missing_field" in response.json["error"]

def test_create_shift_forbidden_for_non_admin(client):
    headers = {"X-Staff-Id": "4", "X-Staff-Role": "assistant"}
    response = client.post(
        "/api/schedule",
        json={"staff_id": 2, "start_time": "2024-01-01T08:00:00Z", "end_time": "2024-01-01T12:00:00Z"},
        headers=headers,
    )
    assert response.status_code == 403
    assert response.json["error"] == "forbidden"

def test_normalize_status_legacy_mapping():
    assert schedule.normalize_status("approved") == "accepted"
    assert schedule.normalize_status("accepted") == "accepted"

def test_create_shift_default_status(client, monkeypatch):
    headers = {"X-Staff-Id": "3", "X-Staff-Role": "admin"}
    
    class MockCursor:
        def __init__(self, conn):
            self.connection = conn

        def execute(self, query, params=None):
            if "SELECT id FROM staff" in query:
                self.fetchone_result = (1,)
            elif "INSERT INTO shifts" in query:
                self.fetchone_result = (1,)
                self.connection.last_insert_query = query
            elif "SELECT s.id" in query:
                self.fetchall_result = []
            else:
                self.fetchone_result = None
        def fetchone(self):
            return getattr(self, 'fetchone_result', None)
        def fetchall(self):
            return getattr(self, 'fetchall_result', [])

    class MockConn:
        def cursor(self):
            return MockCursor(self)
        def commit(self):
            pass
        def rollback(self):
            pass

    def mock_get_connection():
        if not hasattr(mock_get_connection, "conn"):
            mock_get_connection.conn = MockConn()
        return mock_get_connection.conn

    def mock_release_connection(conn):
        pass

    monkeypatch.setattr(schedule, "get_connection", mock_get_connection)
    monkeypatch.setattr(schedule, "release_connection", mock_release_connection)
    monkeypatch.setattr(schedule, "log_audit", lambda *args, **kwargs: None)
    monkeypatch.setattr(schedule, "send_notification", lambda *args, **kwargs: None)
    
    response = client.post(
        "/api/schedule",
        json={"staff_id": 1, "start_time": "2024-01-01T08:00:00Z", "end_time": "2024-01-01T12:00:00Z"},
        headers=headers,
    )
    if response.status_code != 201:
        print("Response error:", response.json)
    assert response.status_code == 201
    
    # Verify the insert query contains 'pending'
    cur = mock_get_connection().cursor()
    assert "'pending'" in cur.connection.last_insert_query

def test_validate_completion_percent():
    assert schedule.validate_completion_percent(50) == 50.0
    with pytest.raises(ValueError):
        schedule.validate_completion_percent(101)

def test_compute_default_multiplier_weekend():
    saturday = datetime(2026, 3, 21, 10, 0, tzinfo=timezone.utc)
    monday = datetime(2026, 3, 23, 10, 0, tzinfo=timezone.utc)
    assert schedule.compute_default_multiplier(saturday) == 1.5
    assert schedule.compute_default_multiplier(monday) == 1.0


