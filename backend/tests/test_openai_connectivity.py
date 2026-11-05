import pytest
from fastapi.testclient import TestClient

import app.main as main
from conftest import TEST_OPENAI_KEY, forbid_openai, mock_openai

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
    calls = mock_openai(monkeypatch, "4")

    response = signed_in_client.post("/api/ai/connectivity")

    assert response.status_code == 200
    assert response.json() == {"answer": "4"}
    assert TEST_OPENAI_KEY not in response.text
    assert calls == [{"model": "gpt-6-luna", "input": "What is 2+2?"}]


def test_connectivity_check_reports_missing_configuration(
    signed_in_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    forbid_openai(monkeypatch)

    response = signed_in_client.post("/api/ai/connectivity")

    assert response.status_code == 503
    assert response.json() == {"detail": "OpenAI is not configured"}


def test_connectivity_check_hides_provider_error_details(
    signed_in_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mock_openai(
        monkeypatch,
        main.OpenAIError(f"provider rejected {TEST_OPENAI_KEY}"),
    )

    response = signed_in_client.post("/api/ai/connectivity")

    assert response.status_code == 502
    assert response.json() == {"detail": "OpenAI connectivity check failed"}
    assert TEST_OPENAI_KEY not in response.text
