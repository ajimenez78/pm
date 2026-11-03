"""SQLite persistence for users, boards, columns, and cards."""

from contextlib import closing, contextmanager
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
from typing import Iterator, Mapping, Sequence
from uuid import uuid4

from app.passwords import hash_password

SCHEMA_VERSION = 2
INITIAL_USERNAME = "user"
INITIAL_PASSWORD = "password"
INITIAL_BOARD_TITLE = "Product launch"
NEW_USER_BOARD_TITLE = "My first board"
PRIORITIES = ("none", "low", "medium", "high")
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
USERS_TABLE = """
    CREATE TABLE users (
        id TEXT PRIMARY KEY NOT NULL,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE
            CHECK (length(trim(username)) BETWEEN 1 AND 64),
        password_hash TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
"""
BOARDS_TABLE = """
    CREATE TABLE boards (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL
            REFERENCES users(id) ON DELETE CASCADE ON UPDATE RESTRICT,
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
        description TEXT NOT NULL DEFAULT ''
            CHECK (length(description) <= 500),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
"""
BOARDS_INDEX = "CREATE INDEX boards_user_id ON boards(user_id)"
COLUMNS_TABLE = """
    CREATE TABLE board_columns (
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
"""
CARDS_TABLE = """
    CREATE TABLE cards (
        id TEXT PRIMARY KEY NOT NULL,
        board_id TEXT NOT NULL,
        column_id TEXT NOT NULL,
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 100),
        details TEXT NOT NULL DEFAULT '' CHECK (length(details) <= 500),
        position INTEGER NOT NULL CHECK (position >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'none'
            CHECK (priority IN ('none', 'low', 'medium', 'high')),
        due_date TEXT CHECK (due_date IS NULL OR date(due_date) IS due_date),
        FOREIGN KEY (board_id, column_id)
            REFERENCES board_columns(board_id, id)
            ON DELETE CASCADE ON UPDATE RESTRICT,
        UNIQUE (board_id, column_id, position)
    )
"""
CARD_FIELDS = (
    "id, column_id, title, details, priority, due_date, position, "
    "created_at, updated_at"
)
BOARD_FIELDS = "id, title, description, created_at, updated_at"


class InvalidCardPosition(ValueError):
    """Raised when a card position is outside its column's current order."""


class InvalidBoardOperation(ValueError):
    """Raised when a board operation references a missing resource."""


class Database:
    """Owns the SQLite schema and executes operations transactionally."""

    def __init__(self, path: Path) -> None:
        self.path = path

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            connection.execute("BEGIN IMMEDIATE")
            with connection:
                yield connection
        finally:
            connection.close()

    def initialize(self) -> None:
        """Create or migrate the schema and seed the initial user."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path)) as connection:
            connection.row_factory = sqlite3.Row
            # Table rebuilds need foreign keys off; this must be set outside
            # a transaction.
            connection.execute("PRAGMA foreign_keys = OFF")
            connection.execute("BEGIN IMMEDIATE")
            with connection:
                version = connection.execute(
                    "PRAGMA user_version",
                ).fetchone()[0]
                if version > SCHEMA_VERSION:
                    raise RuntimeError(
                        f"Database schema version {version} is newer than "
                        f"supported version {SCHEMA_VERSION}",
                    )
                if version == 0:
                    for statement in (
                        USERS_TABLE,
                        BOARDS_TABLE,
                        BOARDS_INDEX,
                        COLUMNS_TABLE,
                        CARDS_TABLE,
                    ):
                        connection.execute(statement)
                    _seed_initial_user(connection)
                elif version == 1:
                    _migrate_from_version_1(connection)
                problems = connection.execute(
                    "PRAGMA foreign_key_check",
                ).fetchall()
                if problems:
                    raise RuntimeError("Database foreign key check failed")
                connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")

    # Users

    def create_user(
        self,
        username: str,
        password_hash: str,
    ) -> dict[str, object] | None:
        """Create a user with an empty starter board, or None if taken."""
        with self._connection() as connection:
            timestamp = _timestamp()
            user_id = str(uuid4())
            try:
                connection.execute(
                    """
                    INSERT INTO users (
                        id, username, password_hash, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?)
                    """,
                    (user_id, username, password_hash, timestamp, timestamp),
                )
            except sqlite3.IntegrityError:
                return None
            _insert_board(connection, user_id, NEW_USER_BOARD_TITLE, "")
            return _get_user(connection, user_id)

    def get_user(self, user_id: str) -> dict[str, object] | None:
        with self._connection() as connection:
            return _get_user(connection, user_id)

    def get_credentials(self, username: str) -> tuple[str, str] | None:
        """Return (user_id, password_hash) for a username."""
        with self._connection() as connection:
            row = connection.execute(
                "SELECT id, password_hash FROM users WHERE username = ?",
                (username,),
            ).fetchone()
            return (row["id"], row["password_hash"]) if row else None

    def get_password_hash(self, user_id: str) -> str | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT password_hash FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
            return row["password_hash"] if row else None

    def set_password_hash(self, user_id: str, password_hash: str) -> None:
        with self._connection() as connection:
            connection.execute(
                """
                UPDATE users SET password_hash = ?, updated_at = ?
                WHERE id = ?
                """,
                (password_hash, _timestamp(), user_id),
            )

    def delete_user(self, user_id: str) -> None:
        with self._connection() as connection:
            connection.execute("DELETE FROM users WHERE id = ?", (user_id,))

    # Boards

    def list_boards(self, user_id: str) -> list[dict[str, object]]:
        with self._connection() as connection:
            rows = connection.execute(
                """
                SELECT b.id, b.title, b.description, b.created_at,
                       b.updated_at, count(c.id) AS card_count
                FROM boards b
                LEFT JOIN cards c ON c.board_id = b.id
                WHERE b.user_id = ?
                GROUP BY b.id
                ORDER BY b.created_at, b.rowid
                """,
                (user_id,),
            ).fetchall()
            return [dict(row) for row in rows]

    def create_board(
        self,
        user_id: str,
        title: str,
        description: str,
    ) -> dict[str, object]:
        with self._connection() as connection:
            board_id = _insert_board(connection, user_id, title, description)
            return _get_board(connection, user_id, board_id)

    def get_board(
        self,
        user_id: str,
        board_id: str,
    ) -> dict[str, object] | None:
        with self._connection() as connection:
            return _get_board(connection, user_id, board_id)

    def update_board(
        self,
        user_id: str,
        board_id: str,
        title: str,
        description: str,
    ) -> dict[str, object] | None:
        with self._connection() as connection:
            cursor = connection.execute(
                """
                UPDATE boards SET title = ?, description = ?, updated_at = ?
                WHERE id = ? AND user_id = ?
                """,
                (title, description, _timestamp(), board_id, user_id),
            )
            if cursor.rowcount == 0:
                return None
            return _get_board(connection, user_id, board_id)

    def delete_board(self, user_id: str, board_id: str) -> bool:
        with self._connection() as connection:
            cursor = connection.execute(
                "DELETE FROM boards WHERE id = ? AND user_id = ?",
                (board_id, user_id),
            )
            return cursor.rowcount > 0

    def rename_column(
        self,
        user_id: str,
        board_id: str,
        column_id: str,
        title: str,
    ) -> dict[str, object] | None:
        with self._connection() as connection:
            if not _owns_board(connection, user_id, board_id):
                return None
            cursor = connection.execute(
                """
                UPDATE board_columns
                SET title = ?, updated_at = ?
                WHERE board_id = ? AND id = ?
                """,
                (title, _timestamp(), board_id, column_id),
            )
            if cursor.rowcount == 0:
                return None
            _touch_board(connection, board_id)
            column = connection.execute(
                """
                SELECT id, title, position, created_at, updated_at
                FROM board_columns WHERE board_id = ? AND id = ?
                """,
                (board_id, column_id),
            ).fetchone()
            return dict(column)

    # Cards

    def create_card(
        self,
        user_id: str,
        board_id: str,
        column_id: str,
        fields: Mapping[str, object],
    ) -> dict[str, object] | None:
        with self._connection() as connection:
            if not _owns_board(connection, user_id, board_id):
                return None
            card = _create_card(connection, board_id, column_id, fields)
            if card is not None:
                _touch_board(connection, board_id)
            return card

    def update_card(
        self,
        user_id: str,
        board_id: str,
        card_id: str,
        fields: Mapping[str, object],
    ) -> dict[str, object] | None:
        with self._connection() as connection:
            if not _owns_board(connection, user_id, board_id):
                return None
            card = _update_card(connection, board_id, card_id, fields)
            if card is not None:
                _touch_board(connection, board_id)
            return card

    def move_card(
        self,
        user_id: str,
        board_id: str,
        card_id: str,
        destination_column_id: str,
        position: int,
    ) -> dict[str, object] | None:
        with self._connection() as connection:
            if not _owns_board(connection, user_id, board_id):
                return None
            return _move_card(
                connection,
                board_id,
                card_id,
                destination_column_id,
                position,
            )

    def delete_card(self, user_id: str, board_id: str, card_id: str) -> bool:
        with self._connection() as connection:
            if not _owns_board(connection, user_id, board_id):
                return False
            card = _get_card(connection, board_id, card_id)
            if card is None:
                return False
            connection.execute(
                "DELETE FROM cards WHERE board_id = ? AND id = ?",
                (board_id, card_id),
            )
            column_id = str(card["column_id"])
            _set_card_orders(
                connection,
                board_id,
                {column_id: _get_card_ids(connection, board_id, column_id)},
            )
            _touch_board(connection, board_id)
            return True

    def apply_board_operations(
        self,
        user_id: str,
        board_id: str,
        operations: Sequence[Mapping[str, object]],
    ) -> None:
        """Apply AI card operations to one board in a single transaction."""
        with self._connection() as connection:
            if not _owns_board(connection, user_id, board_id):
                raise InvalidBoardOperation
            for operation in operations:
                operation_type = operation["type"]
                if operation_type == "create_card":
                    card = _create_card(
                        connection,
                        board_id,
                        str(operation["column_id"]),
                        operation,
                    )
                elif operation_type == "edit_card":
                    card = _update_card(
                        connection,
                        board_id,
                        str(operation["card_id"]),
                        operation,
                    )
                elif operation_type == "move_card":
                    card = _move_card(
                        connection,
                        board_id,
                        str(operation["card_id"]),
                        str(operation["column_id"]),
                        int(str(operation["position"])),
                    )
                else:
                    card = None
                if card is None:
                    raise InvalidBoardOperation
            if operations:
                _touch_board(connection, board_id)


def _seed_initial_user(connection: sqlite3.Connection) -> None:
    timestamp = _timestamp()
    user_id = str(uuid4())
    connection.execute(
        """
        INSERT INTO users (
            id, username, password_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        """,
        (
            user_id,
            INITIAL_USERNAME,
            hash_password(INITIAL_PASSWORD),
            timestamp,
            timestamp,
        ),
    )
    board_id = _insert_board(connection, user_id, INITIAL_BOARD_TITLE, "")
    positions: dict[str, int] = {}
    for column_id, title, details in SAMPLE_CARDS:
        position = positions.get(column_id, 0)
        positions[column_id] = position + 1
        connection.execute(
            """
            INSERT INTO cards (
                id, board_id, column_id, title, details, position,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid4()),
                board_id,
                column_id,
                title,
                details,
                position,
                timestamp,
                timestamp,
            ),
        )


def _migrate_from_version_1(connection: sqlite3.Connection) -> None:
    """Allow several boards per user and add passwords and card metadata."""
    connection.execute(
        "ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''",
    )
    connection.execute(
        "UPDATE users SET password_hash = ? WHERE username = ?",
        (hash_password(INITIAL_PASSWORD), INITIAL_USERNAME),
    )
    # SQLite cannot drop the UNIQUE constraint on boards.user_id in place.
    # Build the new table first, then rename it, so references from child
    # tables keep pointing at "boards".
    connection.execute(
        BOARDS_TABLE.replace("CREATE TABLE boards", "CREATE TABLE boards_v2"),
    )
    connection.execute(
        """
        INSERT INTO boards_v2 (id, user_id, title, created_at, updated_at)
        SELECT id, user_id, title, created_at, updated_at FROM boards
        """,
    )
    connection.execute("DROP TABLE boards")
    connection.execute("ALTER TABLE boards_v2 RENAME TO boards")
    connection.execute(BOARDS_INDEX)
    connection.execute(
        """
        ALTER TABLE cards ADD COLUMN priority TEXT NOT NULL DEFAULT 'none'
            CHECK (priority IN ('none', 'low', 'medium', 'high'))
        """,
    )
    connection.execute(
        """
        ALTER TABLE cards ADD COLUMN due_date TEXT
            CHECK (due_date IS NULL OR date(due_date) IS due_date)
        """,
    )


def _insert_board(
    connection: sqlite3.Connection,
    user_id: str,
    title: str,
    description: str,
) -> str:
    timestamp = _timestamp()
    board_id = str(uuid4())
    connection.execute(
        """
        INSERT INTO boards (
            id, user_id, title, description, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (board_id, user_id, title, description, timestamp, timestamp),
    )
    connection.executemany(
        """
        INSERT INTO board_columns (
            board_id, id, title, position, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (board_id, column_id, title, position, timestamp, timestamp)
            for position, (column_id, title) in enumerate(FIXED_COLUMNS)
        ],
    )
    return board_id


def _get_user(
    connection: sqlite3.Connection,
    user_id: str,
) -> dict[str, object] | None:
    row = connection.execute(
        "SELECT id, username, created_at FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    return dict(row) if row else None


def _owns_board(
    connection: sqlite3.Connection,
    user_id: str,
    board_id: str,
) -> bool:
    row = connection.execute(
        "SELECT 1 FROM boards WHERE id = ? AND user_id = ?",
        (board_id, user_id),
    ).fetchone()
    return row is not None


def _get_board(
    connection: sqlite3.Connection,
    user_id: str,
    board_id: str,
) -> dict[str, object] | None:
    board = connection.execute(
        f"SELECT {BOARD_FIELDS} FROM boards WHERE id = ? AND user_id = ?",
        (board_id, user_id),
    ).fetchone()
    if board is None:
        return None
    column_rows = connection.execute(
        """
        SELECT id, title, position, created_at, updated_at
        FROM board_columns WHERE board_id = ? ORDER BY position
        """,
        (board_id,),
    ).fetchall()
    card_rows = connection.execute(
        f"""
        SELECT {CARD_FIELDS} FROM cards
        WHERE board_id = ? ORDER BY position
        """,
        (board_id,),
    ).fetchall()
    columns = [{**dict(column), "cards": []} for column in column_rows]
    by_id = {column["id"]: column for column in columns}
    for card in card_rows:
        by_id[card["column_id"]]["cards"].append(dict(card))
    return {**dict(board), "columns": columns}


def _get_card(
    connection: sqlite3.Connection,
    board_id: str,
    card_id: str,
) -> dict[str, object] | None:
    row = connection.execute(
        f"SELECT {CARD_FIELDS} FROM cards WHERE board_id = ? AND id = ?",
        (board_id, card_id),
    ).fetchone()
    return dict(row) if row else None


def _column_exists(
    connection: sqlite3.Connection,
    board_id: str,
    column_id: str,
) -> bool:
    row = connection.execute(
        "SELECT 1 FROM board_columns WHERE board_id = ? AND id = ?",
        (board_id, column_id),
    ).fetchone()
    return row is not None


def _create_card(
    connection: sqlite3.Connection,
    board_id: str,
    column_id: str,
    fields: Mapping[str, object],
) -> dict[str, object] | None:
    if not _column_exists(connection, board_id, column_id):
        return None
    position = len(_get_card_ids(connection, board_id, column_id))
    timestamp = _timestamp()
    card_id = str(uuid4())
    connection.execute(
        """
        INSERT INTO cards (
            id, board_id, column_id, title, details, priority, due_date,
            position, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            card_id,
            board_id,
            column_id,
            fields["title"],
            fields.get("details", ""),
            fields.get("priority", "none"),
            fields.get("due_date"),
            position,
            timestamp,
            timestamp,
        ),
    )
    return _get_card(connection, board_id, card_id)


def _update_card(
    connection: sqlite3.Connection,
    board_id: str,
    card_id: str,
    fields: Mapping[str, object],
) -> dict[str, object] | None:
    cursor = connection.execute(
        """
        UPDATE cards
        SET title = ?, details = ?, priority = ?, due_date = ?,
            updated_at = ?
        WHERE board_id = ? AND id = ?
        """,
        (
            fields["title"],
            fields.get("details", ""),
            fields.get("priority", "none"),
            fields.get("due_date"),
            _timestamp(),
            board_id,
            card_id,
        ),
    )
    if cursor.rowcount == 0:
        return None
    return _get_card(connection, board_id, card_id)


def _move_card(
    connection: sqlite3.Connection,
    board_id: str,
    card_id: str,
    destination_column_id: str,
    position: int,
) -> dict[str, object] | None:
    card = _get_card(connection, board_id, card_id)
    if card is None or not _column_exists(
        connection,
        board_id,
        destination_column_id,
    ):
        return None

    source_column_id = str(card["column_id"])
    source_ids = _get_card_ids(connection, board_id, source_column_id)
    source_ids.remove(card_id)
    if source_column_id == destination_column_id:
        destination_ids = source_ids
    else:
        destination_ids = _get_card_ids(
            connection,
            board_id,
            destination_column_id,
        )
    if position > len(destination_ids):
        raise InvalidCardPosition
    destination_ids.insert(position, card_id)
    _set_card_orders(
        connection,
        board_id,
        {
            source_column_id: source_ids,
            destination_column_id: destination_ids,
        },
    )
    _touch_board(connection, board_id)
    return _get_card(connection, board_id, card_id)


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


def _touch_board(connection: sqlite3.Connection, board_id: str) -> None:
    connection.execute(
        "UPDATE boards SET updated_at = ? WHERE id = ?",
        (_timestamp(), board_id),
    )


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
    # Shift positions out of the way first to satisfy the unique constraint.
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
