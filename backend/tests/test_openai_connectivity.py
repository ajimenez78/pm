from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import app.main as main

pytestmark = pytest.mark.integration


def test_connectivity_check_requires_an_authenticated_session(
    client: TestClient,
) -> None:
    response = client.post("/api/ai/connectivity")

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_connectivity_check_returns_model_answer_without_exposing_key(
    signed_in_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    api_key = "test-openai-key"
    captured: dict[str, object] = {}

    class FakeResponses:
        def create(self, **kwargs: object) -> SimpleNamespace:
            captured.update(kwargs)
            return SimpleNamespace(output_text="4")

    class FakeOpenAI:
        def __init__(
            self,
            *,
            api_key: str,
            timeout: float,
            max_retries: int,
        ) -> None:
            captured["api_key"] = api_key
            captured["timeout"] = timeout
            captured["max_retries"] = max_retries
            self.responses = FakeResponses()

        def __enter__(self) -> "FakeOpenAI":
            return self

        def __exit__(self, *_: object) -> None:
            return None

    monkeypatch.setenv("OPENAI_API_KEY", api_key)
    monkeypatch.setattr(main, "OpenAI", FakeOpenAI, raising=False)

    response = signed_in_client.post("/api/ai/connectivity")

    assert response.status_code == 200
    assert response.json() == {"answer": "4"}
    assert api_key not in response.text
    assert captured == {
        "api_key": api_key,
        "timeout": main.OPENAI_TIMEOUT_SECONDS,
        "max_retries": main.OPENAI_MAX_RETRIES,
        "model": "gpt-6-luna",
        "input": "What is 2+2?",
    }


def test_connectivity_check_reports_missing_configuration(
    signed_in_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(
        main,
        "OpenAI",
        lambda **_: pytest.fail("OpenAI client must not be constructed"),
        raising=False,
    )

    response = signed_in_client.post("/api/ai/connectivity")

    assert response.status_code == 503
    assert response.json() == {"detail": "OpenAI is not configured"}


def test_connectivity_check_hides_provider_error_details(
    signed_in_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    api_key = "test-openai-key"

    class FakeProviderError(Exception):
        pass

    class FakeResponses:
        def create(self, **_: object) -> SimpleNamespace:
            raise FakeProviderError(f"provider rejected {api_key}")

    class FakeOpenAI:
        def __init__(self, **_: object) -> None:
            self.responses = FakeResponses()

        def __enter__(self) -> "FakeOpenAI":
            return self

        def __exit__(self, *_: object) -> None:
            return None

    monkeypatch.setenv("OPENAI_API_KEY", api_key)
    monkeypatch.setattr(main, "OpenAI", FakeOpenAI, raising=False)
    monkeypatch.setattr(main, "OpenAIError", FakeProviderError, raising=False)

    response = signed_in_client.post("/api/ai/connectivity")

    assert response.status_code == 502
    assert response.json() == {"detail": "OpenAI connectivity check failed"}
    assert api_key not in response.text
