# StockFlow

StockFlow is a small-business inventory and order management application, built as a DevOps capstone project. It manages products, stock movements, and orders.

## Status
- Frontend shell with demo data: done.
- Backend foundation (health, readiness, metrics, database schema): done.
- Product, inventory, and order APIs: next.

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

Frontend (demo data for now):

```bash
cd frontend
npm install
npm run dev                     # http://localhost:3000
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
