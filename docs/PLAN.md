# Project Management MVP Delivery Plan

## Goal and agreed constraints

Deliver a local project-management web app with a Kanban board, a hardcoded MVP sign-in, persistent per-user board data, and an AI chat that can create, edit, and move cards. The app will run in one Docker container.

- Frontend: Next.js, statically built and served at `/` by FastAPI.
- Backend: FastAPI, managed with `uv`.
- Database: local SQLite, initialized automatically when missing.
- Sign-in: the MVP credentials are `user` / `password`; the data model supports multiple users.
- Board: one board per signed-in user, with fixed columns that can be renamed.
- AI: OpenAI API, using `gpt-6-luna`; `OPENAI_API_KEY` is provided through the root `.env` and must remain server-side.
- Operations: start and stop scripts for macOS, Windows, and Linux.
- Keep the implementation and documentation concise; do not add features outside this plan.

## How to use this plan

- Work through the parts in order. Each part has a checklist, verification steps, and a completion gate.
- Mark checklist items only after implementation and verification are complete.
- Keep working documentation under `docs/`.
- Aim for at least 80% test coverage when valuable, representative tests make it
  sensible. This is a target, not a gate: do not add tests solely to reach the
  percentage, and report the measured result if it is lower.
- Do not begin Parts 2–10 until the user has reviewed and approved this plan.
- Part 5 has an additional approval gate: the user must approve the database schema before it is implemented in Part 6.
- Report failed tests and unresolved assumptions explicitly; do not mark a part complete while its success criteria are unmet.

## Part 1: Plan and frontend orientation

### Checklist

- [x] Expand this plan with implementation checklists, verification, and completion gates for every part.
- [x] Document the existing frontend structure and conventions in `frontend/AGENTS.md`.
- [x] User reviews and approves this plan before implementation begins.

### Verification

- Confirm the plan covers all requested product behavior, technical constraints, tests, and approval gates.
- Confirm `frontend/AGENTS.md` describes the existing code rather than planned future behavior.

### Success criteria

- The user approves this plan, including the assumptions called out below, or specifies revisions.
- No application code is changed as part of this planning phase.

## Part 2: Docker and backend scaffolding

### Checklist

- [x] Review repository guidance and available tools; defer Next.js-specific guidance until Part 3.
- [x] Add a minimal FastAPI application under `backend/`, with a health endpoint for local and container checks.
- [x] Add Docker configuration that installs backend dependencies with `uv` and runs the app.
- [x] Add macOS/Linux shell scripts and Windows PowerShell start/stop scripts under `scripts/`.
- [x] Serve a small temporary/example HTML page at `/`; verify its API health call and the health endpoint over HTTP.
- [x] Document the minimum local run and stop commands.
- [x] Build and run the Docker image, verify `/` and `/api/health`, wait for the Docker health check, and stop the container using the documented script.

### Verification

- Run the backend's focused tests and lint/type checks if configured.
- Build the Docker image, start the container, request `/`, call the health endpoint, then stop the container using the documented flow.
- Shell syntax checks for `scripts/start.sh` and `scripts/stop.sh` passed. PowerShell static validation was not run because PowerShell is unavailable in this environment.

### Success criteria

- A clean local setup can build and start the container without manual backend installation.
- `/` returns the example page, the health endpoint returns a successful JSON response, and the documented stop scripts stop the service.
- No secret is copied into the image or checked into source control.

### Completion evidence

- Docker image built successfully from the repository root.
- The running container served the example page at `/` and `{"status":"ok"}` at `/api/health`; its Docker health status reached `healthy`.
- `scripts/stop.sh` stopped the container, which was verified in the `exited` state.

## Part 3: Serve the existing frontend

### Checklist

- [x] Configure Next.js for static export compatible with the FastAPI static-file serving approach.
- [x] Build and serve the frontend at `/`, replacing the temporary example page.
- [x] Preserve the current five-column board, column rename, card add/delete, and pointer/keyboard drag-and-drop behavior.
- [x] Add card title/details editing so the frontend meets the card-editing requirement.
- [x] Keep the existing visual style and responsive behavior unless a change is required for static serving.
- [x] Add or update tests for any changed behavior.

### Verification

- [x] Frontend `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, and `npm run build` pass.
- [x] Backend tests pass, covering the static frontend route, static assets, API health, and missing export configuration.
- [x] Build the container and verify the exported app and static assets load at `/` through FastAPI.
- [x] Exercise the board at desktop and narrow viewport sizes.

### Success criteria

- [x] The app is served at `/` by FastAPI from a successful static frontend build.
- [x] All listed board interactions work and remain covered by unit and browser tests.
- [x] No frontend interaction requires a Next.js server runtime after export.

### Completion evidence

- `npm run build` generated the Next.js static export; the Docker multi-stage build copied it into the FastAPI runtime image.
- FastAPI served the exported page and stylesheet at `/` and `/_next/static/...`; `/api/health` remained available.
- All 19 frontend unit tests passed; all 10 Playwright tests passed against both the Docker-served export and the Next.js development server.
- Frontend lint and type-check passed. All 6 backend tests passed with 100% measured coverage for `app/main.py`.
- Confirmed the Python runtime image serves the app without Node.js installed. The verification container was stopped after testing.

## Part 4: MVP sign-in and sign-out

### Checklist

- [x] Add a login screen that accepts only the MVP credentials `user` / `password`.
- [x] Add backend login and logout behavior and a server-validated session for protected app routes.
- [x] Protect the board so it is only shown to an authenticated session.
- [x] Add a visible logout action and return the user to the login screen after logout.
- [x] Keep the implementation explicitly MVP-only; do not imply production-grade identity management.

### Verification

- [x] Add backend tests for accepted/rejected credentials, session validation, expiry, and logout invalidation.
- [x] Add frontend tests for the signed-out state, successful login, rejected login, and logout.
- [x] Add browser coverage for the full login-to-board-to-logout flow, including a direct visit to the board while signed out.
- [x] Confirm the frontend build remains statically exportable and auth state is enforced by the backend, not only hidden in the UI.

### Success criteria

- [x] Correct credentials allow access; incorrect or absent credentials do not.
- [x] Logout invalidates the session and prevents access to the board.
- [x] The login flow works in the Docker setup.

### Completion evidence

- Login accepts only `user` / `password`; the backend issues a random, expiring, HttpOnly, SameSite=Lax session cookie and validates it against in-memory session state.
- Logout removes the server-side session, so replaying the old cookie is rejected. The static page renders the board only after `/api/auth/session` confirms an active session.
- Backend tests: 12 passed; `app/main.py` measured 100% statement coverage (65 statements) using `uv run --no-sync pytest --cov=app --cov-report=term-missing`.
- Frontend tests: 23 unit/component tests and 12 Playwright browser tests passed. Browser tests passed against the Next.js dev server with mocked auth and the Docker-served app with real auth endpoints.
- Frontend lint, type-check, and static build passed. Frontend coverage was not measured because no Vitest coverage provider is installed; no coverage tooling or tests were added solely to reach a percentage.
- The Docker app returned a healthy API response, and the verification container was stopped. The local MVP session store resets when the backend restarts; it is not production authentication.

## Part 5: Database model proposal

### Checklist

- [x] Propose a JSON schema artifact under `docs/` for users, a user's single board, its fixed columns, and cards.
- [x] Define stable identifiers, ownership relationships, ordering, required fields, and deletion/update relationships.
- [x] Document SQLite initialization and the proposed schema in `docs/`, including how one board per user and fixed columns are represented.
- [x] Document how conversation history is handled under the assumptions below.
- [x] Ask the user to review and approve the schema before implementation.

### Verification

- [x] Validate the JSON artifact with a JSON parser.
- [x] Check that the proposal supports multiple user records while enforcing one board per user and supports renamed columns and ordered cards.
- [x] Review every schema field against the API and AI operations required in later parts.

### Success criteria

- The schema artifact and its explanation are complete, consistent, and understandable without inspecting application code.
- The user explicitly approves the schema; no database implementation starts before that approval.

### Proposal evidence

- [schema.json](./schema.json) describes version 1 user, board, fixed-column,
  and card records. [data-model.md](./data-model.md) documents SQLite
  constraints, ownership, initialization/seeding, ordering, deletion, and
  non-persisted conversation history.
- The JSON artifact parses successfully. IDs and constraints were checked
  against the existing board data and the planned Part 6 board and Part 9 AI
  operations.
- The user approved the schema proposal before Part 6 implementation began.

## Part 6: Backend board API and SQLite persistence

### Checklist

- [x] Create the SQLite database and schema automatically when the app starts if the database file does not exist.
- [x] Implement authenticated API operations to read the current user's board, rename columns, and create, edit, move, or delete cards.
- [x] Enforce board ownership on every read and write; do not accept a user identity supplied by the client as authorization.
- [x] Validate request data and return clear HTTP errors for invalid input or missing resources.
- [x] Keep board updates consistent when changing card column/order.

### Verification

- [x] Add backend tests for database initialization, board retrieval, every supported mutation, validation failures, and ownership boundaries.
- [x] Test that a second user can have a separate board and cannot read or modify another user's board.
- [x] Test persistence by closing/reopening the app or database connection and confirming the saved board remains.
- [x] Run the backend test suite with isolated clean databases and already initialized databases.

### Success criteria

- Database creation is automatic and repeatable.
- All required board reads and changes persist in SQLite and are scoped to the authenticated user.
- Tests cover successful operations, relevant failure cases, and user isolation.

### Completion evidence

- The backend creates a versioned SQLite schema, seeds the MVP user and initial
  board once, and supports authenticated board reads and mutations. Ownership
  is derived from the server-side session; card ordering changes use
  transactions.
- `cd backend && uv run --no-sync pytest --cov=app --cov-report=term-missing`:
  43 tests passed; measured backend statement coverage is 95% (94% for
  `app/database.py`, 97% for `app/main.py`).
- `uv lock --check` and `git diff --check` passed.
- `docker build --tag pm-mvp:part6 .` succeeded. The isolated Docker smoke test
  verified the static frontend, authentication, board read, column rename,
  card create/edit/move/delete, and session revocation. The verification
  container used a temporary in-container database path and was stopped after
  the test.
- The backend restart test confirms saved board changes remain available after
  reopening the application. Windows PowerShell verification was explicitly
  waived by the user.

## Part 7: Connect the frontend to the backend

### Checklist

- [x] Replace the in-memory sample board as the source of truth with the authenticated board API.
- [x] Wire column rename and card create/edit/move/delete actions to backend mutations.
- [x] Load the board after sign-in and show clear loading and API error states.
- [x] Keep the current board layout and interactions while reflecting saved server state.
- [x] Ensure static frontend requests use same-origin API paths served by FastAPI.

### Verification

- [x] Add or update frontend unit tests for API interactions and visible loading/error states.
- [x] Add browser tests that make board changes, reload the page, and confirm the changes persist.
- [x] Test the end-to-end flows in the Docker container rather than relying only on the Next.js development server.

### Success criteria

- Board data comes from SQLite-backed API responses, not local sample state.
- Board edits survive reloads and remain isolated by signed-in user.
- The app remains usable when API requests succeed and reports failures clearly when they do not.

### Frontend integration decisions

- The static frontend calls FastAPI through same-origin `/api/...` paths. The
  browser uses the existing session cookie; no separate API origin, client-side
  user identity, or additional data-fetching library is introduced.
- The frontend fetches the board with caching disabled. After each successful
  mutation, it reloads the board from the API rather than applying optimistic
  client-side changes, keeping SQLite's saved order and contents authoritative.
- If an API request fails, the last loaded board stays visible and the UI shows
  the error; add, edit, and rename forms remain open. If a write succeeds but
  its follow-up board read fails, the visible board can be stale even though
  the write was saved. Reload the page before retrying a create to avoid a
  duplicate. An expired session is reported as an error rather than silently
  clearing the workspace. A failed initial board load offers a retry action.
- Drag-and-drop sends the destination column and insertion position to the API;
  dropping on a column's empty/trailing area appends the card. The backend
  transaction remains responsible for consistent persisted ordering.

### Completion evidence

- The frontend loads the authenticated board from `/api/board` and sends
  same-origin requests for column rename and card create, edit, move, and delete.
  Successful mutations reload the server board; failed requests retain the
  visible board and show an error.
- `cd frontend && npm test -- --reporter=dot`: 30 tests passed.
  `npm run lint` and `npm run typecheck` passed. Coverage was not measured
  because no frontend coverage provider is configured; no tests or tooling were
  added solely to reach the flexible 80% target.
- `npm run test:e2e`: 13 passed and the Docker-only persistence test was skipped
  because this run used the Next.js development server.
- `docker build --tag pm-mvp:part7 .` succeeded. The full browser suite against
  the Docker-served static app and a temporary SQLite database passed: 14 tests,
  including create/edit/move, reload persistence, and cleanup.
- `git diff --check` passed.

## Part 8: OpenAI connectivity

### Checklist

- [ ] Add a backend-only OpenAI client configured with `OPENAI_API_KEY` and model `gpt-6-luna`.
- [ ] Add a minimal connectivity operation that asks the model a simple `2+2` question.
- [ ] Keep API credentials on the server and out of frontend bundles, logs, and responses.
- [ ] Document how to configure the key locally without publishing its value.

### Verification

- Unit-test the integration with a mocked OpenAI client, including provider errors and missing configuration.
- When a valid key is available, make a manual live request and verify the answer is `4` (allowing equivalent wording).
- Confirm automated tests do not require a live API key or make live model calls.

### Success criteria

- The backend can make a successful live request with the configured model and key.
- Automated tests cover the backend integration deterministically.
- The key is never exposed to the browser or committed.

## Part 9: Structured AI board operations

### Checklist

- [ ] Add an authenticated chat API that supplies the current user's board, the user's question, and relevant conversation history to the model.
- [ ] Define a strict Structured Outputs response containing a user-facing reply and zero or more supported board operations.
- [ ] Support AI-created, edited, and moved cards; apply accepted operations through backend validation and persistence.
- [ ] Ensure the model cannot change users, create boards, rename fixed columns, or issue unsupported operations.
- [ ] Return the response and the resulting board state (or a clear indication that no board change occurred).

### Verification

- Unit-test prompt/request construction, structured response parsing, each supported operation, multiple operations, no-op replies, invalid operations, and provider failures using a mocked model.
- Verify operations are applied only to the authenticated user's board and persist across reloads.
- Run a live smoke test with a request that does not mutate data and a separate controlled test that creates, edits, and moves cards.

### Success criteria

- Responses conform to the declared structured schema.
- Valid supported operations update only the caller's board; malformed or unsupported operations do not mutate data.
- Conversation context is provided as agreed, with automated tests independent of OpenAI availability.

## Part 10: AI chat sidebar

### Checklist

- [ ] Add a responsive sidebar chat interface to the board.
- [ ] Display the conversation, allow the user to submit a question, and show pending and error states.
- [ ] Send the question and conversation history to the Part 9 endpoint.
- [ ] Apply returned board changes to the visible board without requiring a manual page reload.
- [ ] Keep the chat and board usable on narrow screens and with keyboard navigation.

### Verification

- Add frontend unit tests for chat submission, responses, errors, and applying returned board state.
- Add browser tests for a complete chat exchange and for an AI operation that changes a card and updates the board view.
- Run frontend lint, type-check, unit tests, end-to-end tests, and production build; verify the complete flow in Docker with a mocked or controlled AI response.

### Success criteria

- The sidebar supports an end-to-end AI conversation and shows clear progress and error feedback.
- AI-created, edited, or moved cards appear in the board immediately and match the persisted backend state.
- The finished app runs locally using the documented Docker and script workflows.

## Assumptions for user review

- The login is a local MVP gate, not production authentication; use a backend-validated HTTP-only session cookie so protected API routes cannot rely on client-only state.
- The five current board columns are fixed in number and identity; users can rename them but cannot add or remove columns.
- Conversation history is kept for the active chat session and sent with each request; it is not persisted across browser reloads unless the user asks for that.
- AI board mutations are limited to creating, editing, and moving cards. Card deletion remains a user action.
- The existing frontend's visual design and interaction patterns are the baseline; planned work should not redesign unrelated areas.

## Final delivery gate

- [ ] All ten parts meet their success criteria and their relevant checks pass.
- [ ] The user can build, start, use, and stop the app using the documented local workflow.
- [ ] The final documentation matches the delivered behavior and contains no secrets.
