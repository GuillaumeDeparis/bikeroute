# Image de dev pour le service `api` de docker-compose.yml.
FROM python:3.14-slim

COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /usr/local/bin/uv

WORKDIR /app

# Couche dépendances séparée du code applicatif pour profiter du cache Docker.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-install-project

COPY . .
RUN uv sync --locked

EXPOSE 8000

# La migration Alembic s'applique à chaque démarrage : le schéma devient
# ainsi disponible via `docker compose up` sans étape manuelle (cf. Code Map).
CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
