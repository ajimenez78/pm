# Run locally

Docker Desktop or Docker Engine must be running. From the repository root:

- macOS or Linux: `./scripts/start.sh` and `./scripts/stop.sh`
- Windows PowerShell: `.\scripts\start.ps1` and `.\scripts\stop.ps1`

The start script builds the image and serves the example page at
<http://localhost:8000/>. The page checks the API health endpoint; it can also
be called directly with `curl http://localhost:8000/api/health`.

The scripts pass the root `.env` into the container when it exists. It is
optional for this scaffolding. Board data will use the persistent Docker volume
`pm-mvp-data`.
