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
- Infrastructure as code (Terraform, AWS VPC + EKS): written and `terraform plan` verified; not applied yet.
- Kubernetes (Helm chart, Traefik Ingress, HPA, in-cluster PostgreSQL) and the CI deploy job: written and tested on a local minikube cluster; not yet run on EKS.
- Monitoring (Prometheus, Grafana, StockFlow dashboard): written and tested on minikube; not yet run on EKS.

## CI/CD Pipeline
```text
push to main
  ├─ backend-tests   pytest on PostgreSQL 17 ─┐
  └─ frontend-build  npm ci && npm run build ─┴─> build-scan-push
                                                   docker build (backend, frontend)
                                                   Trivy scan (fail on fixable HIGH/CRITICAL)
                                                   docker push ghcr.io/sambhavbohra/stockflow-{backend,frontend}:<commit-sha>
                                                     │
                                                     └─> deploy (only while DEPLOY_ENABLED=true)
                                                          GitHub OIDC -> short-lived AWS role
                                                          helm upgrade --install --set image.tag=<commit-sha>
```
- A failing test stops the pipeline before any image is built, so a broken image is never published.
- Images are tagged with the full Git commit SHA (never `latest`), so every running image traces back to its exact source.
- GHCR publishing uses the workflow's built-in `GITHUB_TOKEN`; there is no personal access token.
- Every third-party action is pinned to a full commit SHA.

### Security scan (Trivy)
Trivy scans both images for known vulnerabilities (CVEs) in the operating-system packages (Debian for the backend, Alpine for the frontend) and in the installed Python libraries. The pipeline fails if it finds any HIGH or CRITICAL vulnerability that already has a fixed version, and then nothing is published.

In our first scan (2026-10-14), the only fixable HIGH findings were in copies of `urllib3`, `msgpack` and `setuptools` bundled inside `pip` in the Python base image. For example, CVE-2026-97689 is a denial-of-service in urllib3's chunk parsing. Since pip isn't needed at runtime, the backend image now uninstalls it, and both images pass with 0 fixable HIGH or CRITICAL issues. The Debian base still has HIGH issues with no fix released yet; those are reported but don't block a release, and rebuilding picks up fixes as Debian publishes them.

Trivy itself is installed from an immutable GitHub release and checked against a pinned SHA-256 checksum. This is because the official Trivy GitHub Action and some Trivy Docker images were hijacked in March 2026 (GHSA-69fq-xp46-6x23).

## Infrastructure (Terraform)
`terraform/` describes the AWS infrastructure in `ap-south-1`:

| File | Creates |
|---|---|
| `vpc.tf` | VPC, 2 public subnets in 2 availability zones, internet gateway, route table |
| `eks.tf` | EKS cluster (Kubernetes 1.37, standard support only), managed node group (2 × `t3a.medium`/`t3.medium`, Spot by default), add-ons: VPC CNI, kube-proxy, CoreDNS, Pod Identity agent, EBS CSI driver, metrics-server |
| `github.tf` | GitHub OIDC provider and a deploy role that only `main` of this repository can assume, limited to the `stockflow` namespace |

Cost choices: there is no NAT gateway (nodes sit in public subnets), the nodes use Spot capacity, and there's one load balancer at most. The cluster is billed hourly, so it's created for work sessions and destroyed afterwards.

```bash
export AWS_PROFILE=<your-aws-cli-profile>   # credentials stay in ~/.aws, never in this repo
cd terraform
terraform init
terraform plan -out tfplan
terraform apply tfplan                       # creates billable resources (~15 minutes)
$(terraform output -raw configure_kubectl)  # point kubectl at the cluster
terraform destroy                            # when finished
```

To change a default (for example `node_capacity_type = "ON_DEMAND"` for a live demo), copy `terraform.tfvars.example` to `terraform.tfvars`. That file is git-ignored.

## Kubernetes (Helm)
| Path | What it is |
|---|---|
| `k8s/namespace.yaml` | The `stockflow` namespace |
| `k8s/storageclass-gp3.yaml` | EBS gp3 storage class for the database volume (EKS has no default) |
| `k8s/traefik-values.yaml` | Values for the Traefik Ingress controller; its Service is the single AWS load balancer |
| `helm/stockflow/` | The app: backend and frontend Deployments (2+ replicas), ClusterIP Services, Ingress (`/api`, `/docs` → backend; `/` → frontend), backend HPA (2–4 pods at 70% CPU), PostgreSQL StatefulSet with a 1 GiB volume |

- Pods run as non-root with resource requests and limits.
- The backend has startup, liveness (`/health`) and readiness (`/ready`) probes. It waits for PostgreSQL, then applies migrations on start.
- The database password lives only in a Kubernetes Secret created from the command line. It's generated randomly, never typed or printed, and never stored in Git.

### Deploy session (EKS)
The cluster is billed hourly, so each session goes: create → deploy → demo → destroy.

```bash
export AWS_PROFILE=<your-aws-cli-profile>
cd terraform && terraform apply && $(terraform output -raw configure_kubectl) && cd ..

kubectl apply -f k8s/namespace.yaml -f k8s/storageclass-gp3.yaml
kubectl -n stockflow create secret generic stockflow-db \
  --from-literal=POSTGRES_PASSWORD="$(openssl rand -hex 24)"

helm repo add traefik https://traefik.github.io/charts
helm upgrade --install traefik traefik/traefik --version 41.7.1 \
  -n traefik --create-namespace -f k8s/traefik-values.yaml --wait

# The images for this commit must already be in GHCR (pushed to main, pipeline green).
helm upgrade --install stockflow helm/stockflow -n stockflow \
  --set image.tag="$(git rev-parse HEAD)" --wait --timeout 10m

kubectl get svc traefik -n traefik -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'   # open http://<this>
```

After the first manual install, every push to `main` deploys automatically while the repository variable `DEPLOY_ENABLED` is `true`. The workflow also needs the variables `AWS_REGION`, `AWS_ROLE_ARN` (`terraform output github_actions_role_arn`) and `EKS_CLUSTER_NAME`.

## Monitoring (Prometheus + Grafana)
The backend exposes Prometheus metrics at `/metrics`: request counts, latency histograms and status codes per endpoint.

| File | Purpose |
|---|---|
| `monitoring/kube-prometheus-stack-values.yaml` | Prometheus + Grafana (Alertmanager off, 24h retention, no extra load balancers) |
| `monitoring/servicemonitor.yaml` | Tells Prometheus to scrape the backend's `/metrics` every 15 seconds |
| `monitoring/grafana-dashboard.yaml` | The **StockFlow** dashboard: requests per second, p50/p95 latency, error rate, backend CPU, HPA replicas |

```bash
kubectl create namespace monitoring
kubectl -n monitoring create secret generic grafana-admin \
  --from-literal=admin-user=admin --from-literal=admin-password="$(openssl rand -hex 16)"
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack --version 92.6.0 \
  -n monitoring -f monitoring/kube-prometheus-stack-values.yaml --wait --timeout 10m
kubectl apply -f monitoring/servicemonitor.yaml -f monitoring/grafana-dashboard.yaml
```

| Open | Command | URL |
|---|---|---|
| Prometheus targets | `kubectl -n monitoring port-forward svc/monitoring-kube-prometheus-prometheus 9090:9090` | http://localhost:9090/targets |
| Grafana | `kubectl -n monitoring port-forward svc/monitoring-grafana 3001:80` | http://localhost:3001 → Dashboards → StockFlow |

Grafana user `admin`; password: `kubectl -n monitoring get secret grafana-admin -o jsonpath='{.data.admin-password}' | base64 -d`

The ServiceMonitor and dashboard live in `monitoring/`, not in the app chart. CI's deploy role is limited to the `stockflow` namespace and doesn't manage monitoring resources.

### Teardown (always, at the end of a session)
```bash
helm uninstall monitoring -n monitoring --wait
helm uninstall stockflow -n stockflow --wait   # also deletes the database volume
helm uninstall traefik -n traefik --wait       # deletes the AWS load balancer
cd terraform && terraform destroy
```
Uninstall the Helm releases first. Otherwise the load balancer and EBS volume, which Kubernetes created and Terraform doesn't track, are left behind and keep billing. Set `DEPLOY_ENABLED` to `false` afterwards.

## Application Notes

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
