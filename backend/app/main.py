"""HTTP application for the project management MVP."""

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI(title="Project Management MVP")

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


@app.get("/", response_class=HTMLResponse)
def get_example_page() -> HTMLResponse:
    """Return a temporary page that checks the health endpoint."""
    return HTMLResponse(content=EXAMPLE_PAGE)


@app.get("/api/health")
def get_health() -> dict[str, str]:
    """Return the service health status."""
    return {"status": "ok"}
