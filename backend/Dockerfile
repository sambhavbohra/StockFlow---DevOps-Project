FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first so code changes don't invalidate this layer.
# pip is removed afterwards: it isn't needed at runtime, and its bundled copies of urllib3/msgpack
# were the only HIGH CVEs Trivy found (2026-10-14). It also stops packages being installed in a running container.
COPY requirements.txt .
RUN pip install -r requirements.txt && pip uninstall -y pip

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app

# Non-root runtime user (rubric M4). Numeric UID so Kubernetes runAsNonRoot can verify it.
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin stockflow
USER 10001

EXPOSE 8000

# Apply pending migrations (serialised by an advisory lock), then serve.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]
