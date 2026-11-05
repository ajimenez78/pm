from collections.abc import Generator
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient
import httpx
import pytest

import app.main as main
from app.main import create_app

TEST_OPENAI_KEY = "test-openai-key"


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
    assert login(client).status_code == 200
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


def login(
    client: TestClient,
    username: str = "user",
    password: str = "password",
) -> httpx.Response:
    return client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
    )


def mock_openai(
    monkeypatch: pytest.MonkeyPatch,
    output: object,
) -> list[dict[str, object]]:
    """Replace the OpenAI client and return the list of recorded requests.

    `create` returns `output` as the answer text; `parse` validates it against
    the requested format like the SDK does. An exception `output` is raised.
    """
    calls: list[dict[str, object]] = []

    class FakeResponses:
        def create(self, **kwargs: object) -> SimpleNamespace:
            calls.append(kwargs)
            if isinstance(output, Exception):
                raise output
            return SimpleNamespace(output_text=output)

        def parse(self, **kwargs: object) -> SimpleNamespace:
            calls.append(kwargs)
            if isinstance(output, Exception):
                raise output
            text_format = kwargs["text_format"]
            return SimpleNamespace(output_parsed=text_format.model_validate(output))

    class FakeOpenAI:
        def __init__(
            self,
            *,
            api_key: str,
            timeout: float,
            max_retries: int,
        ) -> None:
            assert api_key == TEST_OPENAI_KEY
            assert timeout == main.OPENAI_TIMEOUT_SECONDS
            assert max_retries == main.OPENAI_MAX_RETRIES
            self.responses = FakeResponses()

        def __enter__(self) -> "FakeOpenAI":
            return self

        def __exit__(self, *_: object) -> None:
            return None

    monkeypatch.setenv("OPENAI_API_KEY", TEST_OPENAI_KEY)
    monkeypatch.setattr(main, "OpenAI", FakeOpenAI)
    return calls


def forbid_openai(monkeypatch: pytest.MonkeyPatch) -> None:
    """Remove the API key and fail if an OpenAI client is constructed."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(
        main,
        "OpenAI",
        lambda **_: pytest.fail("OpenAI client must not be constructed"),
    )
