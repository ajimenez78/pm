from contextlib import closing
from pathlib import Path
import sqlite3

import pytest
from fastapi.testclient import TestClient

import app.main as main
from conftest import login, register

pytestmark = pytest.mark.integration


def test_valid_credentials_create_a_session(client: TestClient) -> None:
    response = login(client)

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
        {"username": "usér", "password": "pässword"},
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
    login(client)
    current_time[0] += 12 * 60 * 60

    response = client.get("/api/auth/session")

    assert response.status_code == 401


def test_session_check_rejects_an_unauthenticated_request(
    client: TestClient,
) -> None:
    assert client.get("/api/auth/session").status_code == 401


def test_logout_revokes_the_session_even_if_its_cookie_is_replayed(
    signed_in_client: TestClient,
) -> None:
    session_id = signed_in_client.cookies.get("pm_session")
    assert session_id is not None

    logout_response = signed_in_client.post("/api/auth/logout")

    assert logout_response.status_code == 200
    assert signed_in_client.get("/api/auth/session").status_code == 401
    signed_in_client.cookies.set("pm_session", session_id)
    assert signed_in_client.get("/api/auth/session").status_code == 401


def test_registration_signs_in_with_an_empty_starter_board(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/auth/register",
        json={"username": "  ada  ", "password": "analytical"},
    )

    assert response.status_code == 201
    assert response.json() == {"username": "ada"}
    assert client.get("/api/auth/session").json() == {"username": "ada"}
    boards = client.get("/api/boards").json()
    assert [(board["title"], board["card_count"]) for board in boards] == [
        ("My first board", 0),
    ]

    client.post("/api/auth/logout")
    response = login(client, "ADA", "analytical")
    assert response.status_code == 200
    assert response.json() == {"username": "ada"}


def test_registration_rejects_a_taken_username_case_insensitively(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/auth/register",
        json={"username": "USER", "password": "another-pass"},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "That username is already taken"}
    assert client.get("/api/auth/session").status_code == 401


@pytest.mark.parametrize(
    "payload",
    [
        {"username": "ab", "password": "long-enough"},
        {"username": "x" * 33, "password": "long-enough"},
        {"username": "has space", "password": "long-enough"},
        {"username": "valid", "password": "short"},
        {"username": "valid", "password": "x" * 129},
    ],
)
def test_registration_validates_username_and_password(
    client: TestClient,
    payload: dict[str, str],
) -> None:
    assert client.post("/api/auth/register", json=payload).status_code == 422


def test_password_change_requires_the_current_password(
    signed_in_client: TestClient,
) -> None:
    response = signed_in_client.post(
        "/api/auth/password",
        json={"current_password": "wrong", "new_password": "new-password"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Current password is incorrect"}


def test_password_change_revokes_other_sessions(
    signed_in_client: TestClient,
) -> None:
    other_device = TestClient(signed_in_client.app)
    login(other_device)

    response = signed_in_client.post(
        "/api/auth/password",
        json={"current_password": "password", "new_password": "new-password"},
    )

    assert response.status_code == 200
    assert signed_in_client.get("/api/auth/session").status_code == 200
    assert other_device.get("/api/auth/session").status_code == 401
    assert login(other_device).status_code == 401
    assert login(other_device, "user", "new-password").status_code == 200


def test_account_deletion_requires_the_password(
    signed_in_client: TestClient,
) -> None:
    response = signed_in_client.post(
        "/api/auth/delete-account",
        json={"password": "wrong"},
    )

    assert response.status_code == 403
    assert signed_in_client.get("/api/auth/session").status_code == 200


def test_account_deletion_removes_data_and_all_sessions(
    client: TestClient,
    database_path: Path,
) -> None:
    owner = register(client, "leaving")
    second_device = TestClient(client.app)
    login(second_device, "leaving", "secret-pass")
    board_id = owner.get("/api/boards").json()[0]["id"]

    response = owner.post(
        "/api/auth/delete-account",
        json={"password": "secret-pass"},
    )

    assert response.status_code == 200
    assert owner.get("/api/auth/session").status_code == 401
    assert second_device.get("/api/auth/session").status_code == 401
    assert login(client, "leaving", "secret-pass").status_code == 401
    with closing(sqlite3.connect(database_path)) as connection:
        assert connection.execute(
            "SELECT count(*) FROM board_columns WHERE board_id = ?",
            (board_id,),
        ).fetchone() == (0,)
    # The username can be registered again afterwards.
    register(client, "leaving")


@pytest.mark.parametrize(
    "path",
    ["/api/auth/password", "/api/auth/delete-account"],
)
def test_account_operations_require_authentication(
    client: TestClient,
    path: str,
) -> None:
    response = client.post(
        path,
        json={
            "password": "password",
            "current_password": "password",
            "new_password": "new-password",
        },
    )

    assert response.status_code == 401
