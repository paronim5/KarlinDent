"""
Shared fixtures for KarlinDent backend tests.

Since the app uses create_app(testing=True) which skips DB pool init,
we monkeypatch get_connection / release_connection in each module using
the FakeDB / FakeCursor helpers defined here.
"""

import pytest
from backend.app import create_app


# ── Fake DB helpers ───────────────────────────────────────────────


class FakeCursor:
    """
    Minimal cursor that replays pre-queued row results.

    Usage:
        cursor.queue_fetchone((1, "Alice"))
        cursor.queue_fetchall([(1, "A"), (2, "B")])

    Methods like execute() are no-ops unless configured otherwise.
    """

    def __init__(self):
        self._fetchone_queue: list = []
        self._fetchall_queue: list = []
        self.last_sql: str = ""
        self.last_params = None

    def queue_fetchone(self, row):
        self._fetchone_queue.append(row)

    def queue_fetchall(self, rows):
        self._fetchall_queue.append(list(rows))

    def execute(self, sql, params=None):
        self.last_sql = sql
        self.last_params = params

    def fetchone(self):
        return self._fetchone_queue.pop(0) if self._fetchone_queue else None

    def fetchall(self):
        return self._fetchall_queue.pop(0) if self._fetchall_queue else []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


class FakeConn:
    """Minimal connection that returns a shared FakeCursor."""

    def __init__(self):
        self.cursor_obj = FakeCursor()
        self.committed = 0
        self.rolled_back = 0

    def cursor(self):
        return self.cursor_obj

    def commit(self):
        self.committed += 1

    def rollback(self):
        self.rolled_back += 1


# ── Pytest fixtures ───────────────────────────────────────────────


@pytest.fixture
def app():
    return create_app(testing=True)


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def fake_db():
    """Returns a fresh (FakeConn, FakeCursor) pair."""
    conn = FakeConn()
    return conn, conn.cursor_obj


def make_fake_db():
    """Factory for tests that need multiple connections."""
    conn = FakeConn()
    return conn, conn.cursor_obj
