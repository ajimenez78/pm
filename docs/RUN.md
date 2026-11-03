# Run locally

Docker Desktop or Docker Engine must be running. From the repository root:

- macOS or Linux: `./scripts/start.sh` and `./scripts/stop.sh`
- Windows PowerShell: `.\scripts\start.ps1` and `.\scripts\stop.ps1`

The start script builds the frontend as a static Next.js export, packages it
with FastAPI, and serves the app at <http://localhost:8000/>. The API health
endpoint can be called directly with `curl http://localhost:8000/api/health`.

Sign in with the seeded account `user` / `password`, or create a new account
from the sign-in screen. Passwords are stored as scrypt hashes. Sessions are
held in backend memory for up to 12 hours and are invalidated when the backend
restarts.

The SQLite database is stored in the persistent Docker volume `pm-mvp-data`
and initialized with the sample board on first start. Older databases are
migrated automatically; see [data-model.md](./data-model.md). For local backend runs,
the default path is `backend/data/pm.sqlite3`; `DATABASE_PATH` can override it.

The scripts pass the root `.env` into the container when it exists. It is
optional for accounts and boards; the AI chat needs `OPENAI_API_KEY`.

To enable the OpenAI connectivity check, add `OPENAI_API_KEY=your-key` to the
ignored root `.env` file. Do not commit or publish the key. The start scripts
pass it to Docker; for direct backend runs, set `OPENAI_API_KEY` in the
environment before starting FastAPI. The authenticated endpoint,
`POST /api/ai/connectivity`, uses the server-side key and returns the model's
answer to `What is 2+2?`.
