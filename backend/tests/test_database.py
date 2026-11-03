import sqlite3
from contextlib import closing
from pathlib import Path

import pytest

from app.database import Database, InvalidBoardOperation
from app.passwords import hash_password, verify_password

pytestmark = pytest.mark.integration

# The schema shipped as version 1, before multiple boards and card metadata.
VERSION_1_SCHEMA = """
CREATE TABLE users (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE boards (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL UNIQUE
        REFERENCES users(id) ON DELETE CASCADE ON UPDATE RESTRICT,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE board_columns (
    board_id TEXT NOT NULL
        REFERENCES boards(id) ON DELETE CASCADE ON UPDATE RESTRICT,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (board_id, id),
    UNIQUE (board_id, position)
);
CREATE TABLE cards (
    id TEXT PRIMARY KEY NOT NULL,
    board_id TEXT NOT NULL,
    column_id TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (board_id, column_id)
        REFERENCES board_columns(board_id, id)
        ON DELETE CASCADE ON UPDATE RESTRICT,
    UNIQUE (board_id, column_id, position)
);
INSERT INTO users VALUES ('u1', 'user', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');
INSERT INTO boards VALUES ('b1', 'u1', 'Saved board', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');
INSERT INTO board_columns VALUES
    ('b1', 'backlog', 'Ideas', 0, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
    ('b1', 'up-next', 'Up next', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
    ('b1', 'in-progress', 'In progress', 2, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
    ('b1', 'in-review', 'In review', 3, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
    ('b1', 'done', 'Done', 4, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');
INSERT INTO cards VALUES ('c1', 'b1', 'backlog', 'Kept card', 'Notes', 0, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');
PRAGMA user_version = 1;
"""


@pytest.fixture
def database(tmp_path: Path) -> Database:
    database = Database(tmp_path / "pm.sqlite3")
    database.initialize()
    return database


def _seeded_user_id(database: Database) -> str:
    credentials = database.get_credentials("user")
    assert credentials is not None
    return credentials[0]


def test_initialization_creates_a_seeded_database(tmp_path: Path) -> None:
    database_path = tmp_path / "nested" / "pm.sqlite3"
    database = Database(database_path)

    database.initialize()

    assert database_path.is_file()
    credentials = database.get_credentials("user")
    assert credentials is not None
    assert verify_password("password", credentials[1])
    boards = database.list_boards(credentials[0])
    assert [(b["title"], b["card_count"]) for b in boards] == [
        ("Product launch", 7),
    ]
    board = database.get_board(credentials[0], str(boards[0]["id"]))
    assert board is not None
    assert len(board["columns"]) == 5


def test_repeated_initialization_preserves_user_changes(
    database: Database,
) -> None:
    user_id = _seeded_user_id(database)
    board_id = str(database.list_boards(user_id)[0]["id"])
    database.rename_column(user_id, board_id, "backlog", "Ideas")

    database.initialize()

    board = database.get_board(user_id, board_id)
    assert board is not None
    assert board["columns"][0]["title"] == "Ideas"
    assert len(database.list_boards(user_id)) == 1


def test_version_1_database_is_migrated_without_data_loss(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "pm.sqlite3"
    with closing(sqlite3.connect(database_path)) as connection:
        connection.executescript(VERSION_1_SCHEMA)
    database = Database(database_path)

    database.initialize()

    credentials = database.get_credentials("user")
    assert credentials == ("u1", credentials[1])
    assert verify_password("password", credentials[1])
    board = database.get_board("u1", "b1")
    assert board is not None
    assert board["title"] == "Saved board"
    assert board["description"] == ""
    assert board["columns"][0]["title"] == "Ideas"
    card = board["columns"][0]["cards"][0]
    assert (card["id"], card["title"], card["details"]) == (
        "c1",
        "Kept card",
        "Notes",
    )
    assert (card["priority"], card["due_date"]) == ("none", None)
    second = database.create_board("u1", "Second board", "")
    assert [b["id"] for b in database.list_boards("u1")] == ["b1", second["id"]]
    with closing(sqlite3.connect(database_path)) as connection:
        assert connection.execute("PRAGMA user_version").fetchone() == (2,)
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
    # Deleting the migrated board still cascades to its columns and cards.
    assert database.delete_board("u1", "b1")
    with closing(sqlite3.connect(database_path)) as connection:
        assert connection.execute("SELECT count(*) FROM cards").fetchone() == (0,)


def test_initialization_rejects_a_newer_schema_version(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "pm.sqlite3"
    with closing(sqlite3.connect(database_path)) as connection, connection:
        connection.execute("PRAGMA user_version = 3")

    with pytest.raises(RuntimeError, match="newer than supported"):
        Database(database_path).initialize()


def test_create_user_rejects_duplicates_and_adds_a_starter_board(
    database: Database,
) -> None:
    user = database.create_user("Grace", hash_password("long-password"))

    assert user is not None
    assert database.create_user("grace", hash_password("x" * 8)) is None
    boards = database.list_boards(str(user["id"]))
    assert [(b["title"], b["card_count"]) for b in boards] == [
        ("My first board", 0),
    ]


def test_deleting_a_user_cascades_to_their_boards(database: Database) -> None:
    user = database.create_user("temp", hash_password("long-password"))
    assert user is not None
    user_id = str(user["id"])
    board = database.create_board(user_id, "Doomed", "")
    database.create_card(user_id, str(board["id"]), "backlog", {"title": "x"})

    database.delete_user(user_id)

    assert database.get_user(user_id) is None
    with closing(sqlite3.connect(database.path)) as connection:
        assert connection.execute(
            "SELECT count(*) FROM cards WHERE board_id = ?",
            (board["id"],),
        ).fetchone() == (0,)


def test_database_rejects_a_card_for_a_missing_column(
    database: Database,
) -> None:
    with closing(sqlite3.connect(database.path)) as connection, connection:
        connection.execute("PRAGMA foreign_keys = ON")
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO cards (
                    id, board_id, column_id, title, details, position,
                    created_at, updated_at
                ) VALUES (
                    'invalid-card', 'unknown-board', 'backlog', 'Invalid', '',
                    0, 'now', 'now'
                )
                """,
            )


@pytest.mark.parametrize(
    ("column", "value"),
    [("priority", "urgent"), ("due_date", "2026-13-01"), ("due_date", "soon")],
)
def test_database_rejects_invalid_card_metadata(
    database: Database,
    column: str,
    value: str,
) -> None:
    with closing(sqlite3.connect(database.path)) as connection, connection:
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                f"UPDATE cards SET {column} = ?",
                (value,),
            )


def test_apply_board_operations_rejects_another_users_board(
    database: Database,
) -> None:
    user_id = _seeded_user_id(database)
    board_id = str(database.list_boards(user_id)[0]["id"])
    other = database.create_user("other", hash_password("long-password"))
    assert other is not None

    with pytest.raises(InvalidBoardOperation):
        database.apply_board_operations(
            str(other["id"]),
            board_id,
            [{"type": "create_card", "column_id": "backlog", "title": "x"}],
        )


def test_password_verification_rejects_malformed_hashes() -> None:
    assert not verify_password("password", "")
    assert not verify_password("password", "bcrypt$00$00")
    assert verify_password("password", hash_password("password"))
