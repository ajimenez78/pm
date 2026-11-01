import asyncio
from pathlib import Path

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
import pytest

import app.main as main
from app.main import create_app


@pytest.fixture
def application(tmp_path: Path) -> FastAPI:
    return create_app(tmp_path / "missing-frontend")


def create_client(application: FastAPI) -> AsyncClient:
    return AsyncClient(
        transport=ASGITransport(app=application),
        base_url="http://testserver",
    )


def test_valid_credentials_create_a_session(application: FastAPI) -> None:
    async def scenario() -> None:
        async with create_client(application) as client:
            response = await client.post(
                "/api/auth/login",
                json={"username": "user", "password": "password"},
            )

            assert response.status_code == 200
            assert response.json() == {"username": "user"}
            assert "httponly" in response.headers["set-cookie"].lower()
            assert "samesite=lax" in response.headers["set-cookie"].lower()

            session_response = await client.get("/api/auth/session")
            assert session_response.json() == {"username": "user"}

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "credentials",
    [
        {"username": "user", "password": "wrong"},
        {"username": "other", "password": "password"},
    ],
)
def test_invalid_credentials_do_not_create_a_session(
    application: FastAPI,
    credentials: dict[str, str],
) -> None:
    async def scenario() -> None:
        async with create_client(application) as client:
            response = await client.post(
                "/api/auth/login",
                json=credentials,
            )

            assert response.status_code == 401
            assert response.json() == {
                "detail": "Invalid username or password",
            }
            session_response = await client.get("/api/auth/session")
            assert session_response.status_code == 401

    asyncio.run(scenario())


def test_expired_session_is_rejected(
    application: FastAPI,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    current_time = [1_000]
    monkeypatch.setattr(main, "time", lambda: current_time[0])

    async def scenario() -> None:
        async with create_client(application) as client:
            await client.post(
                "/api/auth/login",
                json={"username": "user", "password": "password"},
            )
            current_time[0] += 12 * 60 * 60

            response = await client.get("/api/auth/session")
            assert response.status_code == 401

    asyncio.run(scenario())


def test_session_check_rejects_an_unauthenticated_request(
    application: FastAPI,
) -> None:
    async def scenario() -> None:
        async with create_client(application) as client:
            response = await client.get("/api/auth/session")

            assert response.status_code == 401

    asyncio.run(scenario())


def test_logout_revokes_the_session_even_if_its_cookie_is_replayed(
    application: FastAPI,
) -> None:
    async def scenario() -> None:
        async with create_client(application) as client:
            await client.post(
                "/api/auth/login",
                json={"username": "user", "password": "password"},
            )
            session_id = client.cookies.get("pm_session")
            assert session_id is not None

            logout_response = await client.post("/api/auth/logout")

            assert logout_response.status_code == 200
            assert logout_response.json() == {"status": "ok"}
            assert (await client.get("/api/auth/session")).status_code == 401

            client.cookies.set("pm_session", session_id)
            assert (await client.get("/api/auth/session")).status_code == 401

    asyncio.run(scenario())
