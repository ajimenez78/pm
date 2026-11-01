import pytest
from fastapi.testclient import TestClient

import app.main as main

pytestmark = pytest.mark.integration


def test_valid_credentials_create_a_session(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )

    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    assert "httponly" in response.headers["set-cookie"].lower()
    assert "samesite=lax" in response.headers["set-cookie"].lower()
    assert client.get("/api/auth/session").json() == {"username": "user"}


@pytest.mark.parametrize(
    "credentials",
    [
        {"username": "user", "password": "wrong"},
        {"username": "other", "password": "password"},
    ],
)
def test_invalid_credentials_do_not_create_a_session(
    client: TestClient,
    credentials: dict[str, str],
) -> None:
    response = client.post("/api/auth/login", json=credentials)

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid username or password"}
    assert client.get("/api/auth/session").status_code == 401


def test_expired_session_is_rejected(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    current_time = [1_000]
    monkeypatch.setattr(main, "time", lambda: current_time[0])
    client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    current_time[0] += 12 * 60 * 60

    response = client.get("/api/auth/session")

    assert response.status_code == 401


def test_session_check_rejects_an_unauthenticated_request(
    client: TestClient,
) -> None:
    response = client.get("/api/auth/session")

    assert response.status_code == 401


def test_logout_revokes_the_session_even_if_its_cookie_is_replayed(
    client: TestClient,
) -> None:
    client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    session_id = client.cookies.get("pm_session")
    assert session_id is not None

    logout_response = client.post("/api/auth/logout")

    assert logout_response.status_code == 200
    assert logout_response.json() == {"status": "ok"}
    assert client.get("/api/auth/session").status_code == 401

    client.cookies.set("pm_session", session_id)
    assert client.get("/api/auth/session").status_code == 401
