"""Health & readiness endpoints.

The readiness DB check is exercised via a monkeypatched engine so tests are fast
and independent of any live database.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class _FakeConn:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, *args, **kwargs):
        return 1


class _OkEngine:
    def connect(self):
        return _FakeConn()


class _BadEngine:
    def connect(self):
        raise RuntimeError("db down")


def test_health_liveness():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_ready_ok(monkeypatch):
    monkeypatch.setattr("app.api.health.get_engine", lambda: _OkEngine())
    r = client.get("/health/ready")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "db": "ok"}


def test_ready_db_down(monkeypatch):
    monkeypatch.setattr("app.api.health.get_engine", lambda: _BadEngine())
    r = client.get("/health/ready")
    assert r.status_code == 503
    assert r.json() == {"status": "error", "db": "error"}
