# Backend

- The FastAPI application is in `app/main.py`; keep API routes and HTTP-specific
  behavior here until the backend grows enough to justify a separate module.
- FastAPI serves the static Next.js export at `/`; the JSON API is under
  `/api/`: `auth/*` (register, login, logout, session, password,
  delete-account), `boards` and `boards/{id}/...` (columns, cards, `ai/chat`).
- `app/database.py` owns the schema, migrations (`PRAGMA user_version`), and
  all queries; every board query is scoped by the session user's ID.
  `app/passwords.py` hashes passwords with scrypt.
- SQLite defaults to `data/pm.sqlite3` relative to the backend app root; set
  `DATABASE_PATH` to override it.
- Run the backend from this directory with
  `FRONTEND_BUILD_DIR=../frontend/out uv run uvicorn app.main:app --reload`.
- Run tests with `uv run pytest` and coverage with
  `uv run pytest --cov=app --cov-report=term-missing`.
- Runtime dependencies and test tooling are declared in `pyproject.toml` and
  locked in `uv.lock`. Use `uv sync --frozen --group dev` to reproduce the
  development environment.
- Docker builds the backend from the repository root. Keep credentials outside
  the image; the root `.env` is supplied at container startup when available.
- Sessions are held in memory, expire after 12 hours, and are lost on restart.
- Tests use `conftest.py` fixtures: `signed_in_client` (seeded user),
  `board_path` (the seeded board), and `register()` for extra users.