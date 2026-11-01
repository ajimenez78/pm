import sqlite3
from contextlib import closing
from pathlib import Path

import pytest

from app.database import Database

pytestmark = pytest.mark.integration


def test_initialization_creates_a_seeded_database(tmp_path: Path) -> None:
    database_path = tmp_path / "nested" / "pm.sqlite3"
    database = Database(database_path)

    database.initialize()

    assert database_path.is_file()
    user_id = database.get_user_id("user")
    assert user_id is not None
    board = database.get_board(user_id)
    assert board is not None
    assert board["title"] == "Product launch"
    assert len(board["columns"]) == 5
    assert sum(len(column["cards"]) for column in board["columns"]) == 7


def test_repeated_initialization_preserves_user_changes(tmp_path: Path) -> None:
    database = Database(tmp_path / "pm.sqlite3")
    database.initialize()
    user_id = database.get_user_id("user")
    assert user_id is not None
    database.rename_column(user_id, "backlog", "Ideas")

    database.initialize()

    board = database.get_board(user_id)
    assert board is not None
    assert board["columns"][0]["title"] == "Ideas"
    assert len(board["columns"][0]["cards"]) == 2


def test_initialization_rejects_a_newer_schema_version(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "pm.sqlite3"
    with closing(sqlite3.connect(database_path)) as connection, connection:
        connection.execute("PRAGMA user_version = 2")

    with pytest.raises(RuntimeError, match="newer than supported"):
        Database(database_path).initialize()


def test_database_rejects_a_board_for_a_missing_user(
    tmp_path: Path,
) -> None:
    database = Database(tmp_path / "pm.sqlite3")
    database.initialize()

    with closing(sqlite3.connect(database.path)) as connection, connection:
        connection.execute("PRAGMA foreign_keys = ON")
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO boards (id, user_id, title, created_at, updated_at)
                VALUES ('another-board', 'unknown-user', 'Other', 'now', 'now')
                """,
            )


def test_database_rejects_a_card_for_a_missing_column(
    tmp_path: Path,
) -> None:
    database = Database(tmp_path / "pm.sqlite3")
    database.initialize()

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


def test_database_limits_each_user_to_one_board(tmp_path: Path) -> None:
    database = Database(tmp_path / "pm.sqlite3")
    database.initialize()
    user_id = database.get_user_id("user")
    assert user_id is not None

    with closing(sqlite3.connect(database.path)) as connection, connection:
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO boards (id, user_id, title, created_at, updated_at)
                VALUES ('second-board', ?, 'Other', 'now', 'now')
                """,
                (user_id,),
            )
