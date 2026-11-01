"""SQLite persistence for users, boards, columns, and cards."""

from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
from typing import Iterator, Mapping, Sequence
from uuid import uuid4


SCHEMA_VERSION = 1
INITIAL_USERNAME = "user"
INITIAL_BOARD_TITLE = "Product launch"
FIXED_COLUMNS = (
    ("backlog", "Backlog"),
    ("up-next", "Up next"),
    ("in-progress", "In progress"),
    ("in-review", "In review"),
    ("done", "Done"),
)
SAMPLE_CARDS = (
    (
        "backlog",
        "Review brand direction",
        "Align the visual identity with the new product story.",
    ),
    (
        "backlog",
        "Plan customer interviews",
        "Prepare a short guide for five early-access customers.",
    ),
    (
        "up-next",
        "Write product page copy",
        "Keep the first fold clear, confident, and concise.",
    ),
    (
        "in-progress",
        "Design onboarding flow",
        "Map the first three minutes of the product experience.",
    ),
    (
        "in-progress",
        "Build analytics dashboard",
        "Bring the key launch metrics together in one view.",
    ),
    (
        "in-review",
        "Review welcome emails",
        "Check tone and links before the first send.",
    ),
    (
        "done",
        "Finalize launch brief",
        "Share the goals, timeline, and owners with the team.",
    ),
)
SCHEMA_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE
            CHECK (length(trim(username)) BETWEEN 1 AND 64),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL UNIQUE
            REFERENCES users(id) ON DELETE CASCADE ON UPDATE RESTRICT,
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS board_columns (
        board_id TEXT NOT NULL
            REFERENCES boards(id) ON DELETE CASCADE ON UPDATE RESTRICT,
        id TEXT NOT NULL CHECK (id IN (
            'backlog', 'up-next', 'in-progress', 'in-review', 'done'
        )),
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
        position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 4),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (board_id, id),
        UNIQUE (board_id, position),
        CHECK (
            (id = 'backlog' AND position = 0) OR
            (id = 'up-next' AND position = 1) OR
            (id = 'in-progress' AND position = 2) OR
            (id = 'in-review' AND position = 3) OR
            (id = 'done' AND position = 4)
        )
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY NOT NULL,
        board_id TEXT NOT NULL,
        column_id TEXT NOT NULL,
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 100),
        details TEXT NOT NULL DEFAULT '' CHECK (length(details) <= 500),
        position INTEGER NOT NULL CHECK (position >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (board_id, column_id)
            REFERENCES board_columns(board_id, id)
            ON DELETE CASCADE ON UPDATE RESTRICT,
        UNIQUE (board_id, column_id, position)
    )
    """,
)


class InvalidCardPosition(ValueError):
    """Raised when a card position is outside its column's current order."""


class InvalidBoardOperation(ValueError):
    """Raised when a board operation references a missing resource."""


class Database:
    """Owns the SQLite schema and executes board operations transactionally."""

    def __init__(self, path: Path) -> None:
        self.path = path

    @contextmanager
    def _connection(
        self,
        immediate: bool = False,
    ) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            if immediate:
                connection.execute("BEGIN IMMEDIATE")
            with connection:
                yield connection
        finally:
            connection.close()

    def initialize(self) -> None:
        """Create the database, schema, and MVP sample board if needed."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection(immediate=True) as connection:
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            if version > SCHEMA_VERSION:
                raise RuntimeError(
                    f"Database schema version {version} is newer than "
                    f"supported version {SCHEMA_VERSION}",
                )
            for statement in SCHEMA_STATEMENTS:
                connection.execute(statement)
            if version == 0:
                self._seed_initial_board(connection)
                connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")

    def get_user_id(self, username: str) -> str | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT id FROM users WHERE username = ?",
                (username,),
            ).fetchone()
            return row["id"] if row else None

    def get_board(self, user_id: str) -> dict[str, object] | None:
        with self._connection(immediate=True) as connection:
            board = connection.execute(
                """
                SELECT id, title, created_at, updated_at
                FROM boards WHERE user_id = ?
                """,
                (user_id,),
            ).fetchone()
            if board is None:
                return None

            columns: list[dict[str, object]] = []
            column_rows = connection.execute(
                """
                SELECT id, title, position, created_at, updated_at
                FROM board_columns
                WHERE board_id = ?
                ORDER BY position
                """,
                (board["id"],),
            ).fetchall()
            for column in column_rows:
                cards = connection.execute(
                    """
                    SELECT id, column_id, title, details, position,
                           created_at, updated_at
                    FROM cards
                    WHERE board_id = ? AND column_id = ?
                    ORDER BY position
                    """,
                    (board["id"], column["id"]),
                ).fetchall()
                columns.append(
                    {
                        "id": column["id"],
                        "title": column["title"],
                        "position": column["position"],
                        "created_at": column["created_at"],
                        "updated_at": column["updated_at"],
                        "cards": [dict(card) for card in cards],
                    },
                )

            return {
                "id": board["id"],
                "title": board["title"],
                "created_at": board["created_at"],
                "updated_at": board["updated_at"],
                "columns": columns,
            }

    def rename_column(
        self,
        user_id: str,
        column_id: str,
        title: str,
    ) -> dict[str, object] | None:
        with self._connection() as connection:
            board_id = self._get_board_id(connection, user_id)
            if board_id is None:
                return None
            updated_at = _timestamp()
            cursor = connection.execute(
                """
                UPDATE board_columns
                SET title = ?, updated_at = ?
                WHERE board_id = ? AND id = ?
                """,
                (title, updated_at, board_id, column_id),
            )
            if cursor.rowcount == 0:
                return None
            column = connection.execute(
                """
                SELECT id, title, position, created_at, updated_at
                FROM board_columns WHERE board_id = ? AND id = ?
                """,
                (board_id, column_id),
            ).fetchone()
            self._touch_board(connection, board_id)
            return dict(column)

    def create_card(
        self,
        user_id: str,
        column_id: str,
        title: str,
        details: str,
    ) -> dict[str, object] | None:
        with self._connection(immediate=True) as connection:
            board_id = self._get_board_id(connection, user_id)
            if board_id is None:
                return None
            card = self._create_card(
                connection,
                board_id,
                column_id,
                title,
                details,
            )
            if card is None:
                return None
            self._touch_board(connection, board_id)
            return card

    def update_card(
        self,
        user_id: str,
        card_id: str,
        title: str,
        details: str,
    ) -> dict[str, object] | None:
        with self._connection(immediate=True) as connection:
            board_id = self._get_board_id(connection, user_id)
            if board_id is None:
                return None
            card = self._update_card(
                connection,
                board_id,
                card_id,
                title,
                details,
            )
            if card is None:
                return None
            self._touch_board(connection, board_id)
            return card

    def move_card(
        self,
        user_id: str,
        card_id: str,
        destination_column_id: str,
        position: int,
    ) -> dict[str, object] | None:
        with self._connection(immediate=True) as connection:
            board_id = self._get_board_id(connection, user_id)
            if board_id is None:
                return None
            return self._move_card(
                connection,
                board_id,
                card_id,
                destination_column_id,
                position,
            )

    def apply_board_operations(
        self,
        user_id: str,
        operations: Sequence[Mapping[str, str | int]],
    ) -> bool:
        """Apply AI card operations as one transaction for the user's board."""
        with self._connection(immediate=True) as connection:
            board_id = self._get_board_id(connection, user_id)
            if board_id is None:
                return False

            for operation in operations:
                operation_type = operation["type"]
                if operation_type == "create_card":
                    card = self._create_card(
                        connection,
                        board_id,
                        str(operation["column_id"]),
                        str(operation["title"]),
                        str(operation["details"]),
                    )
                    if card is None:
                        raise InvalidBoardOperation
                elif operation_type == "edit_card":
                    card = self._update_card(
                        connection,
                        board_id,
                        str(operation["card_id"]),
                        str(operation["title"]),
                        str(operation["details"]),
                    )
                    if card is None:
                        raise InvalidBoardOperation
                elif operation_type == "move_card":
                    card = self._move_card(
                        connection,
                        board_id,
                        str(operation["card_id"]),
                        str(operation["column_id"]),
                        int(operation["position"]),
                    )
                    if card is None:
                        raise InvalidBoardOperation
                else:
                    raise InvalidBoardOperation
                if operation_type != "move_card":
                    self._touch_board(connection, board_id)

            return bool(operations)

    def delete_card(self, user_id: str, card_id: str) -> bool:
        with self._connection(immediate=True) as connection:
            board_id = self._get_board_id(connection, user_id)
            if board_id is None:
                return False
            card = self._get_card(connection, board_id, card_id)
            if card is None:
                return False
            connection.execute(
                "DELETE FROM cards WHERE board_id = ? AND id = ?",
                (board_id, card_id),
            )
            column_id = str(card["column_id"])
            self._set_card_orders(
                connection,
                board_id,
                {
                    column_id: self._get_card_ids(
                        connection,
                        board_id,
                        column_id,
                    ),
                },
            )
            self._touch_board(connection, board_id)
            return True

    def _seed_initial_board(self, connection: sqlite3.Connection) -> None:
        timestamp = _timestamp()
        user_id = str(uuid4())
        board_id = str(uuid4())
        connection.execute(
            """
            INSERT OR IGNORE INTO users (id, username, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, INITIAL_USERNAME, timestamp, timestamp),
        )
        user = connection.execute(
            "SELECT id FROM users WHERE username = ?",
            (INITIAL_USERNAME,),
        ).fetchone()
        user_id = user["id"]
        connection.execute(
            """
            INSERT OR IGNORE INTO boards (
                id, user_id, title, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (board_id, user_id, INITIAL_BOARD_TITLE, timestamp, timestamp),
        )
        board = connection.execute(
            "SELECT id FROM boards WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        board_id = board["id"]
        connection.executemany(
            """
            INSERT OR IGNORE INTO board_columns (
                board_id, id, title, position, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (board_id, column_id, title, position, timestamp, timestamp)
                for position, (column_id, title) in enumerate(FIXED_COLUMNS)
            ],
        )
        for column_id in dict.fromkeys(card[0] for card in SAMPLE_CARDS):
            existing_cards = connection.execute(
                """
                SELECT count(*) FROM cards
                WHERE board_id = ? AND column_id = ?
                """,
                (board_id, column_id),
            ).fetchone()[0]
            if existing_cards:
                continue
            column_cards = (
                card for card in SAMPLE_CARDS if card[0] == column_id
            )
            connection.executemany(
                """
                INSERT INTO cards (
                    id, board_id, column_id, title, details, position,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        str(uuid4()),
                        board_id,
                        card_column_id,
                        title,
                        details,
                        position,
                        timestamp,
                        timestamp,
                    )
                    for position, (card_column_id, title, details) in enumerate(
                        column_cards
                    )
                ],
            )

    @staticmethod
    def _get_board_id(
        connection: sqlite3.Connection,
        user_id: str,
    ) -> str | None:
        row = connection.execute(
            "SELECT id FROM boards WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        return row["id"] if row else None

    @staticmethod
    def _get_card(
        connection: sqlite3.Connection,
        board_id: str,
        card_id: str,
    ) -> dict[str, object] | None:
        row = connection.execute(
            """
            SELECT id, column_id, title, details, position,
                   created_at, updated_at
            FROM cards WHERE board_id = ? AND id = ?
            """,
            (board_id, card_id),
        ).fetchone()
        return dict(row) if row else None

    @classmethod
    def _move_card(
        cls,
        connection: sqlite3.Connection,
        board_id: str,
        card_id: str,
        destination_column_id: str,
        position: int,
    ) -> dict[str, object] | None:
        card = cls._get_card(connection, board_id, card_id)
        if card is None:
            return None
        destination_exists = connection.execute(
            """
            SELECT 1 FROM board_columns
            WHERE board_id = ? AND id = ?
            """,
            (board_id, destination_column_id),
        ).fetchone()
        if destination_exists is None:
            return None

        source_column_id = str(card["column_id"])
        source_ids = cls._get_card_ids(
            connection,
            board_id,
            source_column_id,
        )
        source_ids.remove(card_id)
        if source_column_id == destination_column_id:
            if position > len(source_ids):
                raise InvalidCardPosition
            source_ids.insert(position, card_id)
            cls._set_card_orders(
                connection,
                board_id,
                {source_column_id: source_ids},
            )
        else:
            destination_ids = cls._get_card_ids(
                connection,
                board_id,
                destination_column_id,
            )
            if position > len(destination_ids):
                raise InvalidCardPosition
            destination_ids.insert(position, card_id)
            cls._set_card_orders(
                connection,
                board_id,
                {
                    source_column_id: source_ids,
                    destination_column_id: destination_ids,
                },
            )
        cls._touch_board(connection, board_id)
        return cls._get_card(connection, board_id, card_id)

    @staticmethod
    def _create_card(
        connection: sqlite3.Connection,
        board_id: str,
        column_id: str,
        title: str,
        details: str,
    ) -> dict[str, object] | None:
        column_exists = connection.execute(
            """
            SELECT 1 FROM board_columns
            WHERE board_id = ? AND id = ?
            """,
            (board_id, column_id),
        ).fetchone()
        if column_exists is None:
            return None
        position = connection.execute(
            """
            SELECT count(*) FROM cards
            WHERE board_id = ? AND column_id = ?
            """,
            (board_id, column_id),
        ).fetchone()[0]
        timestamp = _timestamp()
        card_id = str(uuid4())
        connection.execute(
            """
            INSERT INTO cards (
                id, board_id, column_id, title, details, position,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                card_id,
                board_id,
                column_id,
                title,
                details,
                position,
                timestamp,
                timestamp,
            ),
        )
        return Database._get_card(connection, board_id, card_id)

    @staticmethod
    def _update_card(
        connection: sqlite3.Connection,
        board_id: str,
        card_id: str,
        title: str,
        details: str,
    ) -> dict[str, object] | None:
        cursor = connection.execute(
            """
            UPDATE cards
            SET title = ?, details = ?, updated_at = ?
            WHERE board_id = ? AND id = ?
            """,
            (title, details, _timestamp(), board_id, card_id),
        )
        if cursor.rowcount == 0:
            return None
        return Database._get_card(connection, board_id, card_id)

    @staticmethod
    def _get_card_ids(
        connection: sqlite3.Connection,
        board_id: str,
        column_id: str,
    ) -> list[str]:
        rows = connection.execute(
            """
            SELECT id FROM cards
            WHERE board_id = ? AND column_id = ?
            ORDER BY position
            """,
            (board_id, column_id),
        ).fetchall()
        return [row["id"] for row in rows]

    @staticmethod
    def _touch_board(connection: sqlite3.Connection, board_id: str) -> None:
        connection.execute(
            "UPDATE boards SET updated_at = ? WHERE id = ?",
            (_timestamp(), board_id),
        )

    @staticmethod
    def _set_card_orders(
        connection: sqlite3.Connection,
        board_id: str,
        ordered_card_ids: dict[str, list[str]],
    ) -> None:
        column_ids = list(ordered_card_ids)
        placeholders = ", ".join("?" for _ in column_ids)
        maximum = connection.execute(
            f"""
            SELECT coalesce(max(position), -1)
            FROM cards
            WHERE board_id = ? AND column_id IN ({placeholders})
            """,
            (board_id, *column_ids),
        ).fetchone()[0]
        connection.execute(
            f"""
            UPDATE cards
            SET position = position + ?
            WHERE board_id = ? AND column_id IN ({placeholders})
            """,
            (maximum + 1, board_id, *column_ids),
        )
        timestamp = _timestamp()
        for column_id, card_ids in ordered_card_ids.items():
            connection.executemany(
                """
                UPDATE cards
                SET column_id = ?, position = ?, updated_at = ?
                WHERE board_id = ? AND id = ?
                """,
                [
                    (column_id, position, timestamp, board_id, card_id)
                    for position, card_id in enumerate(card_ids)
                ],
            )


def _timestamp() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )
