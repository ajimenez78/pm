# Backend

- The FastAPI application is in `app/main.py`; keep API routes and HTTP-specific
  behavior here until the backend grows enough to justify a separate module.
- Run the backend from this directory with `uv run uvicorn app.main:app --reload`.
  The temporary root page is served by FastAPI and calls `/api/health`.
- Run tests with `uv run pytest` and coverage with
  `uv run pytest --cov=app --cov-report=term-missing`.
- Runtime dependencies and test tooling are declared in `pyproject.toml` and
  locked in `uv.lock`. Use `uv sync --frozen --group dev` to reproduce the
  development environment.
- Docker builds the backend from the repository root. Keep credentials outside
  the image; the root `.env` is supplied at container startup when available.