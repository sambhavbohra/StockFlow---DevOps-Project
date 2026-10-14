# StockFlow

StockFlow is a small-business inventory and order management application, built as a DevOps capstone project. It manages products, stock movements, and orders.

## Status
- Frontend shell: done.
- Backend foundation (health, readiness, metrics, database schema): done.
- Product, inventory, order, dashboard, report, and settings APIs, connected to their pages and covered by tests: done. No demo data remains in the frontend.
- Docker images and the full Compose stack: next.

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

## Local Development (current)
Requirements: Docker, Python 3.12+, Node.js 22.

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
