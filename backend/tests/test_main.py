import asyncio

from httpx import ASGITransport, AsyncClient, Response

from app.main import app


async def send_request(path: str) -> Response:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        return await client.get(path)


def test_root_returns_temporary_example_page() -> None:
    response = asyncio.run(send_request("/"))

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Project Management MVP" in response.text


def test_health_endpoint_returns_healthy_status() -> None:
    response = asyncio.run(send_request("/api/health"))

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
