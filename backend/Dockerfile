# Backend image: FastAPI + the in-process poller.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install deps first for better layer caching.
COPY requirements.txt .
RUN pip install -r requirements.txt

# App code (tracked.yaml seeds the watchlist on first run).
COPY . .

# Hosts inject the port via $PORT; default to 8011 for local `docker run`.
ENV PORT=8011
EXPOSE 8011

# Shell form so $PORT expands. One worker: the poller must not run in duplicate.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1
