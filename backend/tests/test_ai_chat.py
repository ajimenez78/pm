import pytest
from fastapi.testclient import TestClient

import app.main as main
from conftest import forbid_openai, mock_openai, register

pytestmark = pytest.mark.integration


def test_chat_requires_authentication_before_calling_openai(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = mock_openai(monkeypatch, {})

    response = client.post(
        "/api/boards/any-board/ai/chat",
        json={"question": "Add a task"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}
    assert calls == []


def test_chat_applies_supported_operations_and_sends_board_and_history(
    signed_in_client: TestClient,
    board_path: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_board = signed_in_client.get(board_path).json()
    existing_card = original_board["columns"][0]["cards"][0]
    operations = [
        {
            "type": "create_card",
            "column_id": "backlog",
            "title": "AI-created task",
            "details": "Created by the assistant",
            "priority": "high",
            "due_date": "2026-12-24",
        },
        {
            "type": "edit_card",
            "card_id": existing_card["id"],
            "title": "AI-edited task",
            "details": "Updated by the assistant",
            "priority": "low",
            "due_date": None,
        },
        {
            "type": "move_card",
            "card_id": existing_card["id"],
            "column_id": "in-review",
            "position": 1,
        },
    ]
    calls = mock_openai(
        monkeypatch,
        {"reply": "I updated the board.", "operations": operations},
    )

    response = signed_in_client.post(
        f"{board_path}/ai/chat",
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
    assert result["board"] == signed_in_client.get(board_path).json()
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
    assert (created_card["priority"], created_card["due_date"]) == (
        "high",
        "2026-12-24",
    )
    moved_card = next(
        card
        for card in result["board"]["columns"][3]["cards"]
        if card["id"] == existing_card["id"]
    )
    assert moved_card["title"] == "AI-edited task"
    assert (moved_card["priority"], moved_card["due_date"]) == ("low", None)
    assert moved_card["position"] == 1


def test_chat_cannot_target_another_users_board(
    signed_in_client: TestClient,
    board_path: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    intruder = register(signed_in_client, "intruder")
    board = signed_in_client.get(board_path).json()
    calls = mock_openai(
        monkeypatch,
        {
            "reply": "I added the task.",
            "operations": [
                {
                    "type": "create_card",
                    "column_id": "backlog",
                    "title": "Injected task",
                    "details": "",
                    "priority": "none",
                    "due_date": None,
                },
            ],
        },
    )

    response = intruder.post(
        f"{board_path}/ai/chat",
        json={"question": "Add a task"},
    )

    assert response.status_code == 404
    assert calls == []
    assert signed_in_client.get(board_path).json() == board


def test_chat_changes_only_the_selected_board(
    signed_in_client: TestClient,
    board_path: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    other = signed_in_client.post("/api/boards", json={"title": "Side"}).json()
    sample = signed_in_client.get(board_path).json()
    calls = mock_openai(
        monkeypatch,
        {
            "reply": "Added.",
            "operations": [
                {
                    "type": "create_card",
                    "column_id": "done",
                    "title": "Side task",
                    "details": "",
                    "priority": "medium",
                    "due_date": "2026-11-30",
                },
            ],
        },
    )

    response = signed_in_client.post(
        f"/api/boards/{other['id']}/ai/chat",
        json={"question": "Add a side task"},
    )

    assert response.status_code == 200
    card = response.json()["board"]["columns"][4]["cards"][0]
    assert (card["title"], card["priority"], card["due_date"]) == (
        "Side task",
        "medium",
        "2026-11-30",
    )
    assert "Side" in calls[0]["input"][-1]["content"]
    assert signed_in_client.get(board_path).json() == sample


def test_chat_returns_unchanged_board_for_a_no_operation_reply(
    signed_in_client: TestClient,
    board_path: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    board = signed_in_client.get(board_path).json()
    mock_openai(
        monkeypatch,
        {"reply": "The board is already up to date.", "operations": []},
    )

    response = signed_in_client.post(
        f"{board_path}/ai/chat",
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
    board_path: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    board = signed_in_client.get(board_path).json()
    mock_openai(
        monkeypatch,
        {
            "reply": "I updated the board.",
            "operations": [
                {
                    "type": "create_card",
                    "column_id": "backlog",
                    "title": "Must roll back",
                    "details": "",
                    "priority": "none",
                    "due_date": None,
                },
                {
                    "type": "edit_card",
                    "card_id": "not-a-card",
                    "title": "Invalid",
                    "details": "",
                    "priority": "none",
                    "due_date": None,
                },
            ],
        },
    )

    response = signed_in_client.post(
        f"{board_path}/ai/chat",
        json={"question": "Make two changes"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": "AI operation references a missing card or column",
    }
    assert signed_in_client.get(board_path).json() == board


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
    board_path: str,
    monkeypatch: pytest.MonkeyPatch,
    output: dict[str, object],
) -> None:
    board = signed_in_client.get(board_path).json()
    mock_openai(monkeypatch, output)

    response = signed_in_client.post(
        f"{board_path}/ai/chat",
        json={"question": "Delete a card"},
    )

    assert response.status_code == 502
    assert response.json() == {"detail": "AI returned an invalid response"}
    assert signed_in_client.get(board_path).json() == board


def test_chat_hides_openai_provider_errors(
    signed_in_client: TestClient,
    board_path: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mock_openai(monkeypatch, main.OpenAIError("provider detail"))

    response = signed_in_client.post(
        f"{board_path}/ai/chat",
        json={"question": "Summarize the board"},
    )

    assert response.status_code == 502
    assert response.json() == {"detail": "OpenAI chat request failed"}


def test_chat_reports_missing_openai_configuration(
    signed_in_client: TestClient,
    board_path: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    forbid_openai(monkeypatch)

    response = signed_in_client.post(
        f"{board_path}/ai/chat",
        json={"question": "Summarize the board"},
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "OpenAI is not configured"}


def test_chat_rejects_out_of_range_move_without_partial_mutation(
    signed_in_client: TestClient,
    board_path: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    board = signed_in_client.get(board_path).json()
    card_id = board["columns"][0]["cards"][0]["id"]
    mock_openai(
        monkeypatch,
        {
            "reply": "I updated the board.",
            "operations": [
                {
                    "type": "create_card",
                    "column_id": "backlog",
                    "title": "Must roll back",
                    "details": "",
                    "priority": "none",
                    "due_date": None,
                },
                {
                    "type": "move_card",
                    "card_id": card_id,
                    "column_id": "done",
                    "position": 100,
                },
            ],
        },
    )

    response = signed_in_client.post(
        f"{board_path}/ai/chat",
        json={"question": "Make two changes"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": "AI operation position is outside the column",
    }
    assert signed_in_client.get(board_path).json() == board
