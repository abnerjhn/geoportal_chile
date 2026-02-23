# =============================================
# Geoportal Chile - Dockerfile for Railway
# Multi-stage build: Node.js (frontend) + Python (backend)
# =============================================

# --- Stage 1: Build Frontend ---
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --omit=dev
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Production Runtime ---
FROM python:3.11-slim

# Install SpatiaLite and GDAL native dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsqlite3-mod-spatialite \
    libspatialite7 \
    libgdal-dev \
    gdal-bin \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/
COPY etl/ ./etl/

# Copy raw data for ETL pipeline
COPY data_raw/ ./data_raw/

# Create data directory
RUN mkdir -p data

# Copy built frontend from Stage 1
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Copy GeoJSON data files needed by the frontend map
# These are served as static assets from dist/data/
RUN mkdir -p frontend/dist/data && \
    cp data_raw/concesiones.json frontend/dist/data/ 2>/dev/null || true && \
    cp data_raw/Concesiones_Acuicultura_geo.json frontend/dist/data/concesiones.json 2>/dev/null || true && \
    cp data_raw/ECMPO_geo.json frontend/dist/data/ecmpo.json 2>/dev/null || true && \
    cp data_raw/Regional.json frontend/dist/data/regiones_simplified.json 2>/dev/null || true && \
    cp data_raw/Provincias.json frontend/dist/data/provincias_simplified.json 2>/dev/null || true && \
    cp data_raw/comunas.json frontend/dist/data/comunas_simplified.json 2>/dev/null || true

# Copy PMTiles if they exist
COPY frontend/public/data/*.pmtiles frontend/dist/data/ 2>/dev/null || true

# Set environment variables
ENV DATA_RAW_DIR=/app/data_raw
ENV PORT=8000

# Run ETL pipeline to generate SQLite database, then start server
COPY start.sh ./
RUN chmod +x start.sh

EXPOSE 8000
CMD ["./start.sh"]
