import asyncio
from pathlib import Path

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response
import pytest

from app.main import app, create_app


async def send_request(path: str, application: FastAPI = app) -> Response:
    async with AsyncClient(
        transport=ASGITransport(app=application),
        base_url="http://testserver",
    ) as client:
        return await client.get(path)


def test_root_returns_html() -> None:
    response = asyncio.run(send_request("/"))

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "<html" in response.text


def test_health_endpoint_returns_healthy_status() -> None:
    response = asyncio.run(send_request("/api/health"))

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.integration
def test_static_frontend_is_served_at_root(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text(
        "<main>Static project board</main>",
        encoding="utf-8",
    )
    application = create_app(tmp_path)

    response = asyncio.run(send_request("/", application))

    assert response.status_code == 200
    assert "Static project board" in response.text


@pytest.mark.integration
def test_static_frontend_assets_are_served(tmp_path: Path) -> None:
    asset = tmp_path / "_next" / "static" / "chunks" / "app.js"
    asset.parent.mkdir(parents=True)
    asset.write_text("window.appLoaded = true;", encoding="utf-8")
    application = create_app(tmp_path)

    response = asyncio.run(
        send_request("/_next/static/chunks/app.js", application),
    )

    assert response.status_code == 200
    assert response.text == "window.appLoaded = true;"


@pytest.mark.integration
def test_example_page_is_used_before_frontend_export(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.delenv("FRONTEND_BUILD_DIR", raising=False)
    application = create_app(tmp_path / "missing")

    response = asyncio.run(send_request("/", application))

    assert response.status_code == 200
    assert "Hello, world!" in response.text


def test_configured_frontend_directory_must_exist(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    missing_directory = tmp_path / "missing"
    monkeypatch.setenv("FRONTEND_BUILD_DIR", str(missing_directory))

    with pytest.raises(FileNotFoundError, match="Frontend build directory"):
        create_app()
