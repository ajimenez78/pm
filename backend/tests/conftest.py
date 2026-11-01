from collections.abc import Generator
from pathlib import Path

from fastapi.testclient import TestClient
import pytest

from app.main import create_app


@pytest.fixture
def database_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "pm.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(path))
    return path


@pytest.fixture
def client(
    database_path: Path,
    tmp_path: Path,
) -> Generator[TestClient, None, None]:
    application = create_app(frontend_build_dir=tmp_path / "missing-frontend")
    with TestClient(application) as test_client:
        yield test_client


@pytest.fixture
def signed_in_client(client: TestClient) -> TestClient:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    assert response.status_code == 200
    return client
