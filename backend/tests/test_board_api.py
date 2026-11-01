import sqlite3
from contextlib import closing
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.main import create_app

pytestmark = pytest.mark.integration


def test_board_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/board")

    assert response.status_code == 401


def test_board_loads_seeded_columns_and_cards(
    signed_in_client: TestClient,
) -> None:
    response = signed_in_client.get("/api/board")

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
    assert [card["position"] for card in board["columns"][0]["cards"]] == [0, 1]
    assert board["columns"][0]["cards"][0]["title"] == "Review brand direction"


def test_column_rename_is_saved(
    signed_in_client: TestClient,
) -> None:
    response = signed_in_client.patch(
        "/api/board/columns/backlog",
        json={"title": "  Ideas  "},
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Ideas"
    board = signed_in_client.get("/api/board").json()
    assert board["columns"][0]["title"] == "Ideas"


def test_card_creation_appends_to_the_column(
    signed_in_client: TestClient,
) -> None:
    response = signed_in_client.post(
        "/api/board/cards",
        json={
            "column_id": "backlog",
            "title": "Research",
            "details": "Review the market",
        },
    )

    assert response.status_code == 201
    assert response.json()["position"] == 2
    assert response.json()["details"] == "Review the market"
    assert signed_in_client.get("/api/board").json()["columns"][0]["cards"][-1][
        "title"
    ] == "Research"


def test_card_edit_preserves_its_identity_and_order(
    signed_in_client: TestClient,
) -> None:
    initial_board = signed_in_client.get("/api/board").json()
    original_card = initial_board["columns"][0]["cards"][0]

    response = signed_in_client.patch(
        f"/api/board/cards/{original_card['id']}",
        json={"title": "Updated title", "details": "Updated details"},
    )

    assert response.status_code == 200
    assert response.json()["id"] == original_card["id"]
    assert response.json()["position"] == original_card["position"]
    assert response.json()["title"] == "Updated title"
    assert response.json()["details"] == "Updated details"


def test_card_deletion_compacts_positions(
    signed_in_client: TestClient,
) -> None:
    original_cards = signed_in_client.get("/api/board").json()["columns"][0][
        "cards"
    ]
    response = signed_in_client.delete(
        f"/api/board/cards/{original_cards[0]['id']}",
    )

    assert response.status_code == 204
    remaining = signed_in_client.get("/api/board").json()["columns"][0]["cards"]
    assert [card["position"] for card in remaining] == [0]
    assert remaining[0]["id"] == original_cards[1]["id"]


def test_card_move_reorders_between_columns(
    signed_in_client: TestClient,
) -> None:
    board = signed_in_client.get("/api/board").json()
    card = board["columns"][0]["cards"][0]

    response = signed_in_client.patch(
        f"/api/board/cards/{card['id']}/move",
        json={"column_id": "up-next", "position": 0},
    )

    assert response.status_code == 200
    assert response.json()["column_id"] == "up-next"
    assert response.json()["position"] == 0
    updated = signed_in_client.get("/api/board").json()
    assert [item["position"] for item in updated["columns"][0]["cards"]] == [0]
    assert updated["columns"][1]["cards"][0]["id"] == card["id"]


def test_card_move_reorders_within_a_column(
    signed_in_client: TestClient,
) -> None:
    board = signed_in_client.get("/api/board").json()
    first, second = board["columns"][0]["cards"]

    response = signed_in_client.patch(
        f"/api/board/cards/{second['id']}/move",
        json={"column_id": "backlog", "position": 0},
    )

    assert response.status_code == 200
    cards = signed_in_client.get("/api/board").json()["columns"][0]["cards"]
    assert [card["id"] for card in cards] == [second["id"], first["id"]]
    assert [card["position"] for card in cards] == [0, 1]


@pytest.mark.parametrize(
    ("method", "path", "payload", "expected_status"),
    [
        (
            "patch",
            "/api/board/columns/backlog",
            {"title": "   "},
            422,
        ),
        (
            "post",
            "/api/board/cards",
            {"column_id": "backlog", "title": " "},
            422,
        ),
        (
            "post",
            "/api/board/cards",
            {"column_id": "unknown", "title": "Card"},
            404,
        ),
        (
            "patch",
            "/api/board/cards/missing",
            {"title": "Card", "details": ""},
            404,
        ),
        (
            "patch",
            "/api/board/cards/missing/move",
            {"column_id": "up-next", "position": 0},
            404,
        ),
        (
            "patch",
            "/api/board/cards/missing/move",
            {"column_id": "unknown", "position": 0},
            404,
        ),
        (
            "post",
            "/api/board/cards",
            {"column_id": "backlog", "title": "x" * 101},
            422,
        ),
        (
            "post",
            "/api/board/cards",
            {
                "column_id": "backlog",
                "title": "Valid title",
                "details": "x" * 501,
            },
            422,
        ),
    ],
)
def test_invalid_or_missing_board_mutations_return_clear_errors(
    signed_in_client: TestClient,
    method: str,
    path: str,
    payload: dict[str, object],
    expected_status: int,
) -> None:
    response = getattr(signed_in_client, method)(path, json=payload)

    assert response.status_code == expected_status


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("get", "/api/board", None),
        ("patch", "/api/board/columns/backlog", {"title": "Ideas"}),
        (
            "post",
            "/api/board/cards",
            {"column_id": "backlog", "title": "Card"},
        ),
        (
            "patch",
            "/api/board/cards/card-id",
            {"title": "Card", "details": ""},
        ),
        (
            "patch",
            "/api/board/cards/card-id/move",
            {"column_id": "done", "position": 0},
        ),
        ("delete", "/api/board/cards/card-id", None),
    ],
)
def test_all_board_operations_require_authentication(
    client: TestClient,
    method: str,
    path: str,
    payload: dict[str, object] | None,
) -> None:
    if payload is None:
        response = getattr(client, method)(path)
    else:
        response = getattr(client, method)(path, json=payload)

    assert response.status_code == 401


def test_card_move_rejects_a_position_after_the_destination_end(
    signed_in_client: TestClient,
) -> None:
    card = signed_in_client.get("/api/board").json()["columns"][0]["cards"][0]

    response = signed_in_client.patch(
        f"/api/board/cards/{card['id']}/move",
        json={"column_id": "up-next", "position": 2},
    )

    assert response.status_code == 422


def test_board_operations_cannot_access_another_users_cards(
    signed_in_client: TestClient,
    database_path: Path,
) -> None:
    other_user_id = str(uuid4())
    other_board_id = str(uuid4())
    other_card_id = str(uuid4())
    timestamp = "2026-01-01T00:00:00Z"
    database_file = str(database_path)

    with closing(sqlite3.connect(database_file)) as connection, connection:
        connection.execute(
            "INSERT INTO users VALUES (?, ?, ?, ?)",
            (other_user_id, "other", timestamp, timestamp),
        )
        connection.execute(
            "INSERT INTO boards VALUES (?, ?, ?, ?, ?)",
            (other_board_id, other_user_id, "Other", timestamp, timestamp),
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
        connection.execute(
            """
            INSERT INTO cards
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                other_card_id,
                other_board_id,
                "backlog",
                "Private card",
                "",
                0,
                timestamp,
                timestamp,
            ),
        )

    response = signed_in_client.patch(
        f"/api/board/cards/{other_card_id}",
        json={"title": "Tampered", "details": ""},
    )

    assert response.status_code == 404
    own_session_id = signed_in_client.cookies.get("pm_session")
    assert own_session_id is not None
    own_card_id = signed_in_client.get("/api/board").json()["columns"][0][
        "cards"
    ][0]["id"]
    second_user_session_id = "other-user-session"
    signed_in_client.app.state.sessions[second_user_session_id] = (
        other_user_id,
        4_102_444_800,
    )
    signed_in_client.cookies.set(
        "pm_session",
        second_user_session_id,
        domain="testserver.local",
        path="/",
    )
    other_user_board = signed_in_client.get("/api/board")
    assert other_user_board.status_code == 200
    assert other_user_board.json()["title"] == "Other"
    other_user_cannot_edit_first_user_card = signed_in_client.patch(
        f"/api/board/cards/{own_card_id}",
        json={"title": "Tampered", "details": ""},
    )
    assert other_user_cannot_edit_first_user_card.status_code == 404
    signed_in_client.cookies.set(
        "pm_session",
        own_session_id,
        domain="testserver.local",
        path="/",
    )

    visible_board = signed_in_client.get(
        f"/api/board?user_id={other_user_id}",
    ).json()
    assert visible_board["title"] == "Product launch"
    assert all(
        card["id"] != other_card_id
        for column in visible_board["columns"]
        for card in column["cards"]
    )


def test_board_changes_survive_app_restart(
    database_path: Path,
    tmp_path: Path,
) -> None:
    first_application = create_app(
        frontend_build_dir=tmp_path / "missing-frontend",
        database_path=database_path,
    )
    with TestClient(first_application) as first_client:
        first_client.post(
            "/api/auth/login",
            json={"username": "user", "password": "password"},
        )
        card_id = first_client.get("/api/board").json()["columns"][0]["cards"][
            0
        ]["id"]
        response = first_client.patch(
            f"/api/board/cards/{card_id}",
            json={"title": "Persisted title", "details": "Saved"},
        )
        assert response.status_code == 200

    second_application = create_app(
        frontend_build_dir=tmp_path / "missing-frontend",
        database_path=database_path,
    )
    with TestClient(second_application) as second_client:
        second_client.post(
            "/api/auth/login",
            json={"username": "user", "password": "password"},
        )
        board = second_client.get("/api/board").json()

    assert board["columns"][0]["cards"][0]["title"] == "Persisted title"
