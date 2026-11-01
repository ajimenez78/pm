# Run locally

Docker Desktop or Docker Engine must be running. From the repository root:

- macOS or Linux: `./scripts/start.sh` and `./scripts/stop.sh`
- Windows PowerShell: `.\scripts\start.ps1` and `.\scripts\stop.ps1`

The start script builds the frontend as a static Next.js export, packages it
with FastAPI, and serves the app at <http://localhost:8000/>. The API health
endpoint can be called directly with `curl http://localhost:8000/api/health`.

Sign in with username `user` and password `password`. This is a local MVP-only
login, not production authentication. Sessions are held in backend memory for
up to 12 hours and are invalidated when the backend restarts.

The SQLite database is stored in the persistent Docker volume `pm-mvp-data`
and initialized with the sample board on first start. For local backend runs,
the default path is `backend/data/pm.sqlite3`; `DATABASE_PATH` can override it.

The scripts pass the root `.env` into the container when it exists. It is
optional for the sign-in and board API.
