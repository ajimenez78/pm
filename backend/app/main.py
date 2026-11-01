"""HTTP application for the project management MVP."""

import os
import secrets
from pathlib import Path
from time import time

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

MVP_USERNAME = "user"
MVP_PASSWORD = "password"
SESSION_COOKIE = "pm_session"
SESSION_MAX_AGE = 60 * 60 * 12
EXAMPLE_PAGE = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Project Management MVP</title>
  </head>
  <body>
    <main>
      <h1>Hello, world!</h1>
      <p>FastAPI is serving the project management app.</p>
      <p id="api-status" role="status">Checking API...</p>
    </main>
    <script>
      fetch("/api/health")
        .then((response) => {
          if (!response.ok) {
            throw new Error("Health check failed.");
          }
          return response.json();
        })
        .then(({ status }) => {
          document.querySelector("#api-status").textContent = `API status: ${status}`;
        })
        .catch(() => {
          document.querySelector("#api-status").textContent = "API status unavailable";
        });
    </script>
  </body>
</html>
"""


class LoginRequest(BaseModel):
    username: str
    password: str


def get_authenticated_username(request: Request) -> str:
    """Return the signed-in MVP username or reject an invalid session."""
    session_id = request.cookies.get(SESSION_COOKIE)
    sessions: dict[str, int] = request.app.state.sessions
    expires_at = sessions.get(session_id) if session_id else None

    if expires_at is None or expires_at <= int(time()):
        if session_id:
            sessions.pop(session_id, None)
        raise HTTPException(status_code=401, detail="Not authenticated")

    return MVP_USERNAME


def create_app(frontend_build_dir: Path | None = None) -> FastAPI:
    """Create the API and serve the frontend export when it is available."""
    application = FastAPI(title="Project Management MVP")
    application.state.sessions: dict[str, int] = {}

    @application.get("/api/health")
    def get_health() -> dict[str, str]:
        """Return the service health status."""
        return {"status": "ok"}

    @application.post("/api/auth/login")
    def login(
        credentials: LoginRequest,
        request: Request,
        response: Response,
    ) -> dict[str, str]:
        """Create a short-lived session for the hardcoded MVP user."""
        valid_username = secrets.compare_digest(
            credentials.username,
            MVP_USERNAME,
        )
        valid_password = secrets.compare_digest(
            credentials.password,
            MVP_PASSWORD,
        )
        if not (valid_username and valid_password):
            raise HTTPException(
                status_code=401,
                detail="Invalid username or password",
            )

        session_id = secrets.token_urlsafe(32)
        application.state.sessions[session_id] = int(time()) + SESSION_MAX_AGE
        response.set_cookie(
            key=SESSION_COOKIE,
            value=session_id,
            max_age=SESSION_MAX_AGE,
            httponly=True,
            samesite="lax",
            path="/",
        )
        return {"username": MVP_USERNAME}

    @application.get("/api/auth/session")
    def get_session(request: Request, response: Response) -> dict[str, str]:
        """Return the username attached to a valid server-side session."""
        response.headers["Cache-Control"] = "no-store"
        return {"username": get_authenticated_username(request)}

    @application.post("/api/auth/logout")
    def logout(request: Request, response: Response) -> dict[str, str]:
        """Revoke the current session and remove its browser cookie."""
        session_id = request.cookies.get(SESSION_COOKIE)
        if session_id:
            application.state.sessions.pop(session_id, None)
        response.delete_cookie(
            key=SESSION_COOKIE,
            httponly=True,
            samesite="lax",
            path="/",
        )
        return {"status": "ok"}

    if frontend_build_dir is not None:
        static_directory = frontend_build_dir
    else:
        configured_directory = os.environ.get("FRONTEND_BUILD_DIR")
        if configured_directory:
            static_directory = Path(configured_directory)
            if not static_directory.is_dir():
                raise FileNotFoundError(
                    "Frontend build directory does not exist: "
                    f"{static_directory}",
                )
        else:
            static_directory = (
                Path(__file__).resolve().parents[2] / "frontend" / "out"
            )

    if static_directory.is_dir():
        application.mount(
            "/",
            StaticFiles(directory=static_directory, html=True),
            name="frontend",
        )
    else:

        @application.get("/", response_class=HTMLResponse)
        def get_example_page() -> HTMLResponse:
            """Return a temporary page until the frontend is built."""
            return HTMLResponse(content=EXAMPLE_PAGE)

    return application


app = create_app()
