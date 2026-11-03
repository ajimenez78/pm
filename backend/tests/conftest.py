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


@pytest.fixture
def board_id(signed_in_client: TestClient) -> str:
    """ID of the seeded user's sample board."""
    return signed_in_client.get("/api/boards").json()[0]["id"]


@pytest.fixture
def board_path(board_id: str) -> str:
    return f"/api/boards/{board_id}"


def register(
    client: TestClient,
    username: str,
    password: str = "secret-pass",
) -> TestClient:
    """Return a new client, sharing the app, signed in as a new account."""
    other = TestClient(client.app)
    response = other.post(
        "/api/auth/register",
        json={"username": username, "password": password},
    )
    assert response.status_code == 201, response.text
    return other
