from pathlib import Path

from fastapi.testclient import TestClient
import pytest

from app.main import create_app
from conftest import login, register

pytestmark = pytest.mark.integration


def _cards(client: TestClient, board_path: str, column: int) -> list[dict]:
    return client.get(board_path).json()["columns"][column]["cards"]


def test_seeded_user_lists_one_sample_board(
    signed_in_client: TestClient,
) -> None:
    boards = signed_in_client.get("/api/boards").json()

    assert len(boards) == 1
    assert boards[0]["title"] == "Product launch"
    assert boards[0]["card_count"] == 7
    assert boards[0]["description"] == ""


def test_board_loads_seeded_columns_and_cards(
    signed_in_client: TestClient,
    board_path: str,
) -> None:
    response = signed_in_client.get(board_path)

    assert response.status_code == 200
    board = response.json()
    assert board["title"] == "Product launch"
    assert [column["id"] for column in board["columns"]] == [
        "backlog",
        "up-next",
        "in-progress",
        "in-review",
        "done",
    ]
    first = board["columns"][0]["cards"][0]
    assert [card["position"] for card in board["columns"][0]["cards"]] == [0, 1]
    assert first["title"] == "Review brand direction"
    assert first["priority"] == "none"
    assert first["due_date"] is None


def test_boards_can_be_created_renamed_and_deleted(
    signed_in_client: TestClient,
) -> None:
    created = signed_in_client.post(
        "/api/boards",
        json={"title": "  Website  ", "description": "Marketing site"},
    )

    assert created.status_code == 201
    board = created.json()
    assert board["title"] == "Website"
    assert board["description"] == "Marketing site"
    assert [len(column["cards"]) for column in board["columns"]] == [0] * 5
    titles = [item["title"] for item in signed_in_client.get("/api/boards").json()]
    assert titles == ["Product launch", "Website"]

    renamed = signed_in_client.patch(
        f"/api/boards/{board['id']}",
        json={"title": "Website v2", "description": ""},
    )
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Website v2"
    assert renamed.json()["description"] == ""

    deleted = signed_in_client.delete(f"/api/boards/{board['id']}")
    assert deleted.status_code == 204
    assert signed_in_client.get(f"/api/boards/{board['id']}").status_code == 404
    assert len(signed_in_client.get("/api/boards").json()) == 1


def test_cards_on_one_board_do_not_affect_another(
    signed_in_client: TestClient,
    board_path: str,
) -> None:
    other = signed_in_client.post("/api/boards", json={"title": "Other"}).json()
    card = _cards(signed_in_client, board_path, 0)[0]

    response = signed_in_client.patch(
        f"/api/boards/{other['id']}/cards/{card['id']}",
        json={"title": "Wrong board"},
    )
    move = signed_in_client.patch(
        f"/api/boards/{other['id']}/cards/{card['id']}/move",
        json={"column_id": "done", "position": 0},
    )

    assert response.status_code == 404
    assert move.status_code == 404
    assert _cards(signed_in_client, board_path, 0)[0]["title"] == card["title"]


def test_column_rename_is_saved(
    signed_in_client: TestClient,
    board_path: str,
) -> None:
    response = signed_in_client.patch(
        f"{board_path}/columns/backlog",
        json={"title": "  Ideas  "},
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Ideas"
    assert signed_in_client.get(board_path).json()["columns"][0]["title"] == "Ideas"


def test_card_creation_appends_with_metadata(
    signed_in_client: TestClient,
    board_path: str,
) -> None:
    response = signed_in_client.post(
        f"{board_path}/cards",
        json={
            "column_id": "backlog",
            "title": "Research",
            "details": "Review the market",
            "priority": "high",
            "due_date": "2026-12-01",
        },
    )

    assert response.status_code == 201
    card = response.json()
    assert card["position"] == 2
    assert card["details"] == "Review the market"
    assert card["priority"] == "high"
    assert card["due_date"] == "2026-12-01"
    assert _cards(signed_in_client, board_path, 0)[-1]["title"] == "Research"
    summary = signed_in_client.get("/api/boards").json()[0]
    assert summary["card_count"] == 8


def test_card_edit_replaces_fields_and_preserves_order(
    signed_in_client: TestClient,
    board_path: str,
) -> None:
    original = _cards(signed_in_client, board_path, 0)[0]

    response = signed_in_client.patch(
        f"{board_path}/cards/{original['id']}",
        json={
            "title": "Updated title",
            "details": "Updated details",
            "priority": "medium",
            "due_date": "2027-01-15",
        },
    )

    assert response.status_code == 200
    card = response.json()
    assert card["id"] == original["id"]
    assert card["position"] == original["position"]
    assert (card["title"], card["details"]) == ("Updated title", "Updated details")
    assert (card["priority"], card["due_date"]) == ("medium", "2027-01-15")

    cleared = signed_in_client.patch(
        f"{board_path}/cards/{original['id']}",
        json={"title": "Updated title", "details": ""},
    ).json()
    assert (cleared["priority"], cleared["due_date"]) == ("none", None)


def test_card_deletion_compacts_positions(
    signed_in_client: TestClient,
    board_path: str,
) -> None:
    original = _cards(signed_in_client, board_path, 0)

    response = signed_in_client.delete(f"{board_path}/cards/{original[0]['id']}")

    assert response.status_code == 204
    remaining = _cards(signed_in_client, board_path, 0)
    assert [card["position"] for card in remaining] == [0]
    assert remaining[0]["id"] == original[1]["id"]


def test_card_move_reorders_between_columns(
    signed_in_client: TestClient,
    board_path: str,
) -> None:
    card = _cards(signed_in_client, board_path, 0)[0]

    response = signed_in_client.patch(
        f"{board_path}/cards/{card['id']}/move",
        json={"column_id": "up-next", "position": 0},
    )

    assert response.status_code == 200
    assert response.json()["column_id"] == "up-next"
    assert response.json()["position"] == 0
    updated = signed_in_client.get(board_path).json()
    assert [item["position"] for item in updated["columns"][0]["cards"]] == [0]
    assert [item["position"] for item in updated["columns"][1]["cards"]] == [0, 1]
    assert updated["columns"][1]["cards"][0]["id"] == card["id"]


def test_card_move_reorders_within_a_column(
    signed_in_client: TestClient,
    board_path: str,
) -> None:
    first, second = _cards(signed_in_client, board_path, 0)

    response = signed_in_client.patch(
        f"{board_path}/cards/{second['id']}/move",
        json={"column_id": "backlog", "position": 0},
    )

    assert response.status_code == 200
    cards = _cards(signed_in_client, board_path, 0)
    assert [card["id"] for card in cards] == [second["id"], first["id"]]
    assert [card["position"] for card in cards] == [0, 1]


def test_card_move_rejects_a_position_after_the_destination_end(
    signed_in_client: TestClient,
    board_path: str,
) -> None:
    card = _cards(signed_in_client, board_path, 0)[0]

    response = signed_in_client.patch(
        f"{board_path}/cards/{card['id']}/move",
        json={"column_id": "up-next", "position": 2},
    )

    assert response.status_code == 422
    assert _cards(signed_in_client, board_path, 0)[0]["id"] == card["id"]


@pytest.mark.parametrize(
    ("method", "suffix", "payload", "expected_status"),
    [
        ("patch", "/columns/backlog", {"title": "   "}, 422),
        ("patch", "/columns/unknown", {"title": "Name"}, 404),
        ("post", "/cards", {"column_id": "backlog", "title": " "}, 422),
        ("post", "/cards", {"column_id": "unknown", "title": "Card"}, 404),
        ("post", "/cards", {"column_id": "backlog", "title": "x" * 101}, 422),
        (
            "post",
            "/cards",
            {"column_id": "backlog", "title": "Card", "details": "x" * 501},
            422,
        ),
        (
            "post",
            "/cards",
            {"column_id": "backlog", "title": "Card", "priority": "urgent"},
            422,
        ),
        (
            "post",
            "/cards",
            {"column_id": "backlog", "title": "Card", "due_date": "2026-02-30"},
            422,
        ),
        ("patch", "/cards/missing", {"title": "Card"}, 404),
        (
            "patch",
            "/cards/missing/move",
            {"column_id": "up-next", "position": 0},
            404,
        ),
        (
            "patch",
            "/cards/missing/move",
            {"column_id": "up-next", "position": -1},
            422,
        ),
        ("delete", "/cards/missing", None, 404),
        ("patch", "", {"title": " "}, 422),
        ("patch", "", {"title": "Ok", "description": "x" * 501}, 422),
    ],
)
def test_invalid_or_missing_board_mutations_return_clear_errors(
    signed_in_client: TestClient,
    board_path: str,
    method: str,
    suffix: str,
    payload: dict[str, object] | None,
    expected_status: int,
) -> None:
    kwargs = {} if payload is None else {"json": payload}
    response = getattr(signed_in_client, method)(f"{board_path}{suffix}", **kwargs)

    assert response.status_code == expected_status


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("get", "/api/boards", None),
        ("post", "/api/boards", {"title": "New"}),
        ("get", "/api/boards/board-id", None),
        ("patch", "/api/boards/board-id", {"title": "New"}),
        ("delete", "/api/boards/board-id", None),
        ("patch", "/api/boards/board-id/columns/backlog", {"title": "Ideas"}),
        (
            "post",
            "/api/boards/board-id/cards",
            {"column_id": "backlog", "title": "Card"},
        ),
        ("patch", "/api/boards/board-id/cards/card-id", {"title": "Card"}),
        (
            "patch",
            "/api/boards/board-id/cards/card-id/move",
            {"column_id": "done", "position": 0},
        ),
        ("delete", "/api/boards/board-id/cards/card-id", None),
    ],
)
def test_all_board_operations_require_authentication(
    client: TestClient,
    method: str,
    path: str,
    payload: dict[str, object] | None,
) -> None:
    kwargs = {} if payload is None else {"json": payload}

    assert getattr(client, method)(path, **kwargs).status_code == 401


def test_users_cannot_read_or_modify_another_users_board(
    signed_in_client: TestClient,
    board_path: str,
) -> None:
    intruder = register(signed_in_client, "intruder")
    card = _cards(signed_in_client, board_path, 0)[0]

    assert [b["title"] for b in intruder.get("/api/boards").json()] == [
        "My first board",
    ]
    attempts = [
        intruder.get(board_path),
        intruder.patch(board_path, json={"title": "Taken"}),
        intruder.patch(f"{board_path}/columns/backlog", json={"title": "Taken"}),
        intruder.post(
            f"{board_path}/cards",
            json={"column_id": "backlog", "title": "Injected"},
        ),
        intruder.patch(f"{board_path}/cards/{card['id']}", json={"title": "X"}),
        intruder.patch(
            f"{board_path}/cards/{card['id']}/move",
            json={"column_id": "done", "position": 0},
        ),
        intruder.delete(f"{board_path}/cards/{card['id']}"),
        intruder.delete(board_path),
    ]

    assert [response.status_code for response in attempts] == [404] * 8
    board = signed_in_client.get(board_path).json()
    assert board["title"] == "Product launch"
    assert board["columns"][0]["title"] == "Backlog"
    assert board["columns"][0]["cards"][0] == card
    assert sum(len(column["cards"]) for column in board["columns"]) == 7


def test_board_changes_survive_app_restart(
    database_path: Path,
    tmp_path: Path,
) -> None:
    def start() -> TestClient:
        return TestClient(
            create_app(
                frontend_build_dir=tmp_path / "missing-frontend",
                database_path=database_path,
            ),
        )

    with start() as first_client:
        register(first_client, "persist")
        login(first_client, "persist", "secret-pass")
        board = first_client.post("/api/boards", json={"title": "Kept"}).json()
        first_client.post(
            f"/api/boards/{board['id']}/cards",
            json={"column_id": "done", "title": "Persisted card"},
        )

    with start() as second_client:
        login(second_client, "persist", "secret-pass")
        restored = second_client.get(f"/api/boards/{board['id']}").json()

    assert restored["title"] == "Kept"
    assert restored["columns"][4]["cards"][0]["title"] == "Persisted card"
