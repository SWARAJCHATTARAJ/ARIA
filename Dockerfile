# Stage 1: Build the React frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the FastAPI runner
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt pyproject.toml README.md ./
COPY aria ./aria
COPY main.py app.py app-release-signed.apk ./

# Copy built frontend assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl build-essential \
    && pip install --no-cache-dir -r requirements.txt \
    && apt-get purge -y --auto-remove build-essential \
    && rm -rf /var/lib/apt/lists/*

EXPOSE 10000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]
