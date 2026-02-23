# =============================================
# Geoportal Chile - Dockerfile for Railway
# Multi-stage build: Node.js (frontend) + Python (backend)
# =============================================

# --- Stage 1: Build Frontend ---
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Production Runtime ---
FROM python:3.11-bookworm

# Install SpatiaLite module
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsqlite3-mod-spatialite \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code and ETL
COPY backend/ ./backend/
COPY etl/ ./etl/

# Copy raw data for ETL pipeline
COPY data_raw/ ./data_raw/

# Create data directory
RUN mkdir -p /app/data

# Copy built frontend from Stage 1
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Copy GeoJSON data files to the frontend dist for map layers
RUN mkdir -p frontend/dist/data && \
    cp data_raw/Concesiones_Acuicultura_geo.json frontend/dist/data/concesiones.json && \
    cp data_raw/ECMPO_geo.json frontend/dist/data/ecmpo.json && \
    cp data_raw/Regional.json frontend/dist/data/regiones_simplified.json && \
    cp data_raw/Provincias.json frontend/dist/data/provincias_simplified.json && \
    cp data_raw/comunas.json frontend/dist/data/comunas_simplified.json

# Copy PMTiles from frontend public to dist (if present in git)
COPY frontend/public/data/ /tmp/public_data/
RUN cp /tmp/public_data/*.pmtiles frontend/dist/data/ 2>/dev/null; rm -rf /tmp/public_data

# Set environment variables with ABSOLUTE paths (no .. relative paths)
ENV DATA_RAW_DIR=/app/data_raw
ENV DATABASE_PATH=/app/data/chile_territorial.sqlite

# Run ETL pipeline at BUILD TIME to generate SQLite database
RUN cd /app && python etl/pipeline_chile.py

# VERIFY the database was created - FAIL the build if not
RUN echo "=== Verifying database ===" && \
    ls -la /app/data/ && \
    python -c "import sqlite3; c=sqlite3.connect('/app/data/chile_territorial.sqlite'); print('Tables:', [r[0] for r in c.execute(\"SELECT name FROM sqlite_master WHERE type='table'\").fetchall()]); c.close()" && \
    echo "=== Database OK ==="

EXPOSE 8000

# Start server directly
CMD cd /app/backend && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
