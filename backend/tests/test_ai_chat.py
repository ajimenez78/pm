from contextlib import closing
from pathlib import Path
import sqlite3
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import app.main as main

pytestmark = pytest.mark.integration


def _mock_openai(
    monkeypatch: pytest.MonkeyPatch,
    output: object,
    calls: list[dict[str, object]],
) -> None:
    class FakeResponses:
        def parse(self, **kwargs: object) -> object:
            calls.append(kwargs)
            if isinstance(output, Exception):
                raise output
            # Like the SDK, validate the output against the requested format.
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
            assert api_key == "test-openai-key"
            assert timeout == main.OPENAI_TIMEOUT_SECONDS
            assert max_retries == main.OPENAI_MAX_RETRIES
            self.responses = FakeResponses()

        def __enter__(self) -> "FakeOpenAI":
            return self

        def __exit__(self, *_: object) -> None:
            return None

    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setattr(main, "OpenAI", FakeOpenAI)


def test_chat_requires_authentication_before_calling_openai(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, object]] = []
    _mock_openai(monkeypatch, {}, calls)

    response = client.post(
        "/api/ai/chat",
        json={"question": "Add a task"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}
    assert calls == []


def test_chat_applies_supported_operations_and_sends_board_and_history(
    signed_in_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_board = signed_in_client.get("/api/board").json()
    existing_card = original_board["columns"][0]["cards"][0]
    operations = [
        {
            "type": "create_card",
            "column_id": "backlog",
            "title": "AI-created task",
            "details": "Created by the assistant",
        },
        {
            "type": "edit_card",
            "card_id": existing_card["id"],
            "title": "AI-edited task",
            "details": "Updated by the assistant",
        },
        {
            "type": "move_card",
            "card_id": existing_card["id"],
            "column_id": "in-review",
            "position": 1,
        },
    ]
    calls: list[dict[str, object]] = []
    _mock_openai(
        monkeypatch,
        {"reply": "I updated the board.", "operations": operations},
        calls,
    )

    response = signed_in_client.post(
        "/api/ai/chat",
        json={
            "question": "Create a task, update the first card, and move it.",
            "history": [
                {"role": "user", "content": "What is on the board?"},
                {"role": "assistant", "content": "The board has launch tasks."},
            ],
        },
    )

    assert response.status_code == 200
    result = response.json()
    assert result["reply"] == "I updated the board."
    assert result["changed"] is True
    assert result["board"] == signed_in_client.get("/api/board").json()
    assert calls[0]["model"] == "gpt-6-luna"
    assert calls[0]["store"] is False
    schema = calls[0]["text_format"].model_json_schema()
    assert schema["required"] == ["reply", "operations"]
    assert schema["additionalProperties"] is False
    assert schema["properties"]["operations"]["items"]["anyOf"]
    assert all(
        operation["additionalProperties"] is False
        for operation in schema["$defs"].values()
    )
    messages = calls[0]["input"]
    assert [message["role"] for message in messages] == [
        "system",
        "user",
        "assistant",
        "user",
    ]
    assert messages[1]["content"] == "What is on the board?"
    assert messages[2]["content"] == "The board has launch tasks."
    assert "AI-created task" not in messages[-1]["content"]
    assert original_board["title"] in messages[-1]["content"]
    assert "Create a task, update the first card, and move it." in messages[-1][
        "content"
    ]
    created_card = next(
        card
        for column in result["board"]["columns"]
        for card in column["cards"]
        if card["title"] == "AI-created task"
    )
    assert created_card["details"] == "Created by the assistant"
    moved_card = next(
        card
        for card in result["board"]["columns"][3]["cards"]
        if card["id"] == existing_card["id"]
    )
    assert moved_card["title"] == "AI-edited task"
    assert moved_card["position"] == 1


def test_chat_operations_are_limited_to_the_session_users_board(
    signed_in_client: TestClient,
    database_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    other_user_id = str(uuid4())
    other_board_id = str(uuid4())
    timestamp = "2026-01-01T00:00:00Z"
    with closing(sqlite3.connect(database_path)) as connection, connection:
        connection.execute(
            "INSERT INTO users VALUES (?, ?, ?, ?)",
            (other_user_id, "other", timestamp, timestamp),
        )
        connection.execute(
            "INSERT INTO boards VALUES (?, ?, ?, ?, ?)",
            (other_board_id, other_user_id, "Other board", timestamp, timestamp),
        )
        connection.execute(
            """
            INSERT INTO board_columns VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                other_board_id,
                "backlog",
                "Backlog",
                0,
                timestamp,
                timestamp,
            ),
        )

    own_session_id = signed_in_client.cookies.get("pm_session")
    assert own_session_id is not None
    other_session_id = "other-user-session"
    signed_in_client.app.state.sessions[other_session_id] = (
        other_user_id,
        4_102_444_800,
    )
    signed_in_client.cookies.set(
        "pm_session",
        other_session_id,
        domain="testserver.local",
        path="/",
    )
    calls: list[dict[str, object]] = []
    _mock_openai(
        monkeypatch,
        {
            "reply": "I added the task.",
            "operations": [
                {
                    "type": "create_card",
                    "column_id": "backlog",
                    "title": "Other user's task",
                    "details": "",
                },
            ],
        },
        calls,
    )

    response = signed_in_client.post(
        "/api/ai/chat",
        json={"question": "Add a task"},
    )

    assert response.status_code == 200
    assert response.json()["board"]["title"] == "Other board"
    signed_in_client.cookies.set(
        "pm_session",
        own_session_id,
        domain="testserver.local",
        path="/",
    )
    own_board = signed_in_client.get("/api/board").json()
    assert all(
        card["title"] != "Other user's task"
        for column in own_board["columns"]
        for card in column["cards"]
    )


def test_chat_returns_unchanged_board_for_a_no_operation_reply(
    signed_in_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    board = signed_in_client.get("/api/board").json()
    calls: list[dict[str, object]] = []
    _mock_openai(
        monkeypatch,
        {"reply": "The board is already up to date.", "operations": []},
        calls,
    )

    response = signed_in_client.post(
        "/api/ai/chat",
        json={"question": "Is the board up to date?"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "reply": "The board is already up to date.",
        "changed": False,
        "board": board,
    }


def test_chat_rejects_invalid_operation_without_partial_mutation(
    signed_in_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    board = signed_in_client.get("/api/board").json()
    calls: list[dict[str, object]] = []
    _mock_openai(
        monkeypatch,
        {
            "reply": "I updated the board.",
            "operations": [
                {
                    "type": "create_card",
                    "column_id": "backlog",
                    "title": "Must roll back",
                    "details": "",
                },
                {
                    "type": "edit_card",
                    "card_id": "not-a-card",
                    "title": "Invalid",
                    "details": "",
                },
            ],
        },
        calls,
    )

    response = signed_in_client.post(
        "/api/ai/chat",
        json={"question": "Make two changes"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": "AI operation references a missing card or column",
    }
    assert signed_in_client.get("/api/board").json() == board


@pytest.mark.parametrize(
    "output",
    [
        {
            "reply": "Unsupported operation",
            "operations": [{"type": "delete_card", "card_id": "card-id"}],
        },
        {"reply": "x" * 4001, "operations": []},
        {"reply": " ", "operations": []},
    ],
)
def test_chat_returns_generic_error_for_malformed_structured_output(
    signed_in_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    output: dict[str, object],
) -> None:
    board = signed_in_client.get("/api/board").json()
    calls: list[dict[str, object]] = []
    _mock_openai(monkeypatch, output, calls)

    response = signed_in_client.post(
        "/api/ai/chat",
        json={"question": "Delete a card"},
    )

    assert response.status_code == 502
    assert response.json() == {"detail": "AI returned an invalid response"}
    assert signed_in_client.get("/api/board").json() == board


def test_chat_hides_openai_provider_errors(
    signed_in_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, object]] = []
    _mock_openai(monkeypatch, main.OpenAIError("provider detail"), calls)

    response = signed_in_client.post(
        "/api/ai/chat",
        json={"question": "Summarize the board"},
    )

    assert response.status_code == 502
    assert response.json() == {"detail": "OpenAI chat request failed"}


def test_chat_reports_missing_openai_configuration(
    signed_in_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(
        main,
        "OpenAI",
        lambda **_: pytest.fail("OpenAI client must not be constructed"),
    )

    response = signed_in_client.post(
        "/api/ai/chat",
        json={"question": "Summarize the board"},
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "OpenAI is not configured"}


def test_chat_rejects_out_of_range_move_without_partial_mutation(
    signed_in_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    board = signed_in_client.get("/api/board").json()
    card_id = board["columns"][0]["cards"][0]["id"]
    calls: list[dict[str, object]] = []
    _mock_openai(
        monkeypatch,
        {
            "reply": "I updated the board.",
            "operations": [
                {
                    "type": "create_card",
                    "column_id": "backlog",
                    "title": "Must roll back",
                    "details": "",
                },
                {
                    "type": "move_card",
                    "card_id": card_id,
                    "column_id": "done",
                    "position": 100,
                },
            ],
        },
        calls,
    )

    response = signed_in_client.post(
        "/api/ai/chat",
        json={"question": "Make two changes"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": "AI operation position is outside the column",
    }
    assert signed_in_client.get("/api/board").json() == board
