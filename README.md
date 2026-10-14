# StockFlow

[![CI/CD](https://github.com/sambhavbohra/StockFlow---DevOps-Project/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/sambhavbohra/StockFlow---DevOps-Project/actions/workflows/ci-cd.yml)

StockFlow is a small-business inventory and order management application, built as a DevOps capstone project. It manages products, stock movements, and orders.

## Status
- Frontend shell: done.
- Backend foundation (health, readiness, metrics, database schema): done.
- Product, inventory, order, dashboard, report, and settings APIs, connected to their pages and covered by tests: done. No demo data remains in the frontend.
- Docker images and the full Compose stack: done.
- GitHub Actions CI/CD on every push to `main`:
  1. pytest against a throwaway PostgreSQL, and the frontend build.
  2. Only if both pass: build both Docker images, scan them with Trivy, then push them to GHCR tagged with the commit SHA.
- Infrastructure (Terraform, AWS VPC + EKS): next.

## CI/CD Pipeline
```text
push to main
  ├─ backend-tests   pytest on PostgreSQL 17 ─┐
  └─ frontend-build  npm ci && npm run build ─┴─> build-scan-push
                                                   docker build (backend, frontend)
                                                   Trivy scan (fail on fixable HIGH/CRITICAL)
                                                   docker push ghcr.io/sambhavbohra/stockflow-{backend,frontend}:<commit-sha>
```
- A failing test stops the pipeline before any image is built, so a broken image is never published.
- Images are tagged with the full Git commit SHA (never `latest`), so every running image traces back to its exact source.
- GHCR publishing uses the workflow's built-in `GITHUB_TOKEN`; there is no personal access token.
- Every third-party action is pinned to a full commit SHA.

### Security scan (Trivy)
Trivy scans both images for known vulnerabilities (CVEs) in the operating-system packages (Debian for the backend, Alpine for the frontend) and in the installed Python libraries. The pipeline fails if it finds any HIGH or CRITICAL vulnerability that already has a fixed version, and then nothing is published.

In our first scan (2026-10-14), the only fixable HIGH findings were in copies of `urllib3`, `msgpack` and `setuptools` bundled inside `pip` in the Python base image. For example, CVE-2026-97689 is a denial-of-service in urllib3's chunk parsing. Since pip isn't needed at runtime, the backend image now uninstalls it, and both images pass with 0 fixable HIGH or CRITICAL issues. The Debian base still has HIGH issues with no fix released yet; those are reported but don't block a release, and rebuilding picks up fixes as Debian publishes them.

Trivy itself is installed from an immutable GitHub release and checked against a pinned SHA-256 checksum. This is because the official Trivy GitHub Action and some Trivy Docker images were hijacked in March 2026 (GHSA-69fq-xp46-6x23).

### Demo data (optional)
Load a small, clearly labelled demo catalogue with orders and movements. It only runs on an empty database and never overwrites existing data:

```bash
cd backend && set -a; . ../.env; set +a && .venv/bin/python -m app.seed
```

### Stock rules
- Stock changes only through recorded movements: manual adjustments, order confirmation, and order cancellation.
- Stock is deducted when an order is **confirmed**, never when it is created. If any line is short, nothing changes.
- Cancelling a confirmed order returns its stock exactly once.
- Row locks make simultaneous requests safe.

## Run Everything with Docker
Requirements: Docker with Compose.

```bash
cp .env.example .env            # then replace every change-me value (URL-safe password)
docker compose up --build
```

| What | Where |
|---|---|
| App | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| Health / readiness | http://localhost:8000/health · http://localhost:8000/ready |
| Prometheus metrics | http://localhost:8000/metrics |

- Three services: `db` (PostgreSQL 17), `backend` (FastAPI), and `frontend` (Nginx serving the React build).
- The frontend's Nginx forwards `/api` to the backend.
- The backend applies database migrations on start-up, and a database lock makes simultaneous starts take turns.
- Both app images run as non-root users: the backend as UID 10001, the frontend as UID 101 using `nginx-unprivileged`.
- The frontend image is multi-stage: Node builds the app, and only the static files ship in the Nginx image.

Stop with `docker compose down`. `docker compose down -v` also **deletes** the database volume.

## Local Development without Docker (for coding)
Requirements: Docker (for PostgreSQL), Python 3.12+, Node.js 22.

```bash
cp .env.example .env            # then replace every change-me value
docker compose up -d db         # PostgreSQL on 127.0.0.1:5432

cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
set -a; . ../.env; set +a       # export DATABASE_URL
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- Liveness: http://localhost:8000/health
- Readiness (checks the database): http://localhost:8000/ready
- Prometheus metrics: http://localhost:8000/metrics

Frontend (needs the backend running; `/api` is proxied to port 8000):

```bash
cd frontend
npm install
npm run dev                     # http://localhost:3000
```

## Testing
Tests use a separate PostgreSQL database whose name must end in `_test`. They refuse to run against any other database.

```bash
docker compose exec db createdb -U stockflow stockflow_test   # once
cd backend
.venv/bin/pip install -r requirements-dev.txt
set -a; . ../.env; set +a       # exports TEST_DATABASE_URL
.venv/bin/pytest -v
```

`docker compose down` stops the database. `docker compose down -v` also **deletes** its data.

## Planned Stack
- React + Vite frontend
- Python + FastAPI backend
- PostgreSQL with SQLAlchemy and Alembic
- Pytest
- Docker and Docker Compose
- GitHub Actions, Trivy, and GitHub Container Registry
- Terraform for AWS VPC + EKS (`ap-south-1`)
- Kubernetes, Helm, and Ingress
- Prometheus and Grafana

Setup, architecture, testing, deployment, and teardown instructions will be added as each part is built and verified.
