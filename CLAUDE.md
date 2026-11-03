# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read `AGENTS.md` (project requirements, coding standards, color scheme) and `docs/PLAN.md` (part-by-part delivery plan with checklists and completion evidence) before making changes. `backend/AGENTS.md` and `frontend/AGENTS.md` hold area-specific notes. Key standards: keep it simple, no over-engineering or extra features, no emojis, concise README, and identify root cause with evidence before fixing issues.

## Commands

Full app (Docker, served at http://localhost:8000, login `user` / `password`):

- `./scripts/start.sh` / `./scripts/stop.sh` (Windows: `scripts/start.ps1` / `scripts/stop.ps1`). The root `.env` (with `OPENAI_API_KEY`) is passed via `--env-file`; SQLite lives in the `pm-mvp-data` volume.

Backend (run from `backend/`, Python 3.13, `uv`):

- Setup: `uv sync --frozen --group dev`
- Run: `FRONTEND_BUILD_DIR=../frontend/out uv run uvicorn app.main:app --reload`
- Tests: `uv run pytest`; single test: `uv run pytest tests/test_board_api.py::test_name`
- Coverage: `uv run pytest --cov=app --cov-report=term-missing`
- Lock check: `uv lock --check`

Frontend (run from `frontend/`):

- `npm run dev`, `npm run build` (static export to `out/`), `npm run lint`, `npm run typecheck`
- Unit tests (Vitest + Testing Library): `npm test`; single file: `npx vitest run src/features/board/card.test.tsx`; by name: `npx vitest run -t "name"`
- E2E (Playwright): `npm run test:e2e`. By default it builds the static export and serves it with the real FastAPI backend on port 3100 using a temporary SQLite database; only the AI chat endpoint is stubbed. Set `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8000` to run against the Docker app instead. Filter with `--grep`.

## Architecture

- Single container: a multi-stage `Dockerfile` builds the Next.js static export, then FastAPI (`backend/app/main.py`) serves it from `FRONTEND_BUILD_DIR` at `/` alongside the JSON API under `/api/`. There is no Next.js server at runtime, so the frontend must stay static-export compatible and calls same-origin `/api/*` endpoints. If the build dir is missing, `/` serves a placeholder HTML page.
- `backend/app/main.py`: `create_app()` factory holding all routes, Pydantic request models, auth, and the AI endpoints. Tests build the app via this factory with `DATABASE_PATH` pointed at a temp file (see `backend/tests/conftest.py`, `signed_in_client` fixture).
- `backend/app/database.py`: `Database` class over SQLite. Creates and seeds the DB on startup (seeded user, a sample board with five fixed columns and cards), versioned via `PRAGMA user_version` with an in-place v1-to-v2 migration. Users own many boards; every board query is scoped by user ID. All mutations are transactional with position normalization; raises `InvalidBoardOperation` / `InvalidCardPosition`, which the routes map to HTTP errors. Schema rationale is in `docs/data-model.md`.
- Auth: accounts with scrypt password hashes (`app/passwords.py`): register, login, logout, change password (revokes other sessions), delete account. Seeded `user` / `password`. Sessions are an in-memory map keyed by the HTTP-only `pm_session` cookie (12h, lost on restart). Routes resolve the user from the session via the `UserId` dependency, never from client input.
- AI: `POST /api/boards/{board_id}/ai/chat` sends the system instructions, client-supplied chat history, and the current board JSON to OpenAI (`gpt-6-luna`) via `client.responses.parse` with a structured output model (`AIChatResult`: reply plus create/edit/move card operations, including priority and due date). Operations are applied atomically with `database.apply_board_operations`, and the updated board is returned. The AI may not delete cards or rename columns. Chat history is not persisted. `POST /api/ai/connectivity` is a simple key check.
- Frontend (`frontend/src`): `auth-gate.tsx` checks the session and offers sign-in or registration, then renders `workspace.tsx` (board switcher, new board form, account settings, and the selected board). `lib/api.ts` has shared fetch helpers. Board logic lives in `features/board/`: `board-api.ts`, `use-boards.ts` (board list and selection), `use-board.ts` (load/refresh one board after mutations), `board.tsx` (header, search/priority filter, columns, rename, `@dnd-kit` drag and drop), `card.tsx` and `card-meta.tsx` (priority/due date), `chat-panel.tsx`. Unit tests use the in-memory backend in `src/test/fake-api.ts`. Styling is in `src/app/globals.css`.
- Next.js is a recent version (16.x) with breaking changes; consult `frontend/node_modules/next/dist/docs/` before writing Next-specific code.

## DETAILED PLAN

@docs/PLAN.md
