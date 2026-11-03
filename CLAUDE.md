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
- E2E (Playwright): `npm run test:e2e`. By default it starts `next dev` on port 3100 and mocks `/api/*` with `page.route`. Set `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8000` to run against the real Docker app (enables the Docker-only persistence test). Filter with `--grep`.

## Architecture

- Single container: a multi-stage `Dockerfile` builds the Next.js static export, then FastAPI (`backend/app/main.py`) serves it from `FRONTEND_BUILD_DIR` at `/` alongside the JSON API under `/api/`. There is no Next.js server at runtime, so the frontend must stay static-export compatible and calls same-origin `/api/*` endpoints. If the build dir is missing, `/` serves a placeholder HTML page.
- `backend/app/main.py`: `create_app()` factory holding all routes, Pydantic request models, auth, and the AI endpoints. Tests build the app via this factory with `DATABASE_PATH` pointed at a temp file (see `backend/tests/conftest.py`, `signed_in_client` fixture).
- `backend/app/database.py`: `Database` class over SQLite. Creates and seeds the DB on startup (MVP user, one board, five fixed columns, sample cards), versioned via `PRAGMA user_version`. All mutations are transactional with position normalization; raises `InvalidBoardOperation` / `InvalidCardPosition`, which the routes map to HTTP errors. Schema rationale is in `docs/data-model.md`.
- Auth: hardcoded `user` / `password`; sessions are an in-memory map keyed by the HTTP-only `pm_session` cookie (12h, lost on restart). Routes resolve the user from the session, never from client input.
- AI: `POST /api/ai/chat` sends the system instructions, client-supplied chat history, and the current board JSON to OpenAI (`gpt-6-luna`) via `client.responses.parse` with a structured output model (`AIChatResult`: reply plus create/edit/move card operations). Operations are applied atomically with `database.apply_board_operations`, and the updated board is returned. The AI may not delete cards or rename columns. Chat history is not persisted. `POST /api/ai/connectivity` is a simple key check.
- Frontend (`frontend/src`): `auth-gate.tsx` checks the session, then renders `workspace.tsx` (board plus chat sidebar). Board logic lives in `features/board/`: `board-api.ts` (fetch wrappers), `use-board.ts` (load/refresh state after mutations), `board.tsx` (columns, rename, `@dnd-kit` drag and drop), `chat-panel.tsx` (AI chat that replaces board state with the returned board). Styling is in `src/app/globals.css`.
- Next.js is a recent version (16.x) with breaking changes; consult `frontend/node_modules/next/dist/docs/` before writing Next-specific code.

## DETAILED PLAN

@docs/PLAN.md
