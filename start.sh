#!/bin/bash
set -e

echo "=== Geoportal Chile - Startup ==="

# Run ETL pipeline to generate SQLite database and static JSONs
# We check for both the DB and a key JSON file to ensure complete data
if [ ! -f /app/data/chile_v2.sqlite ] || [ ! -f /app/frontend/public/data/concesiones_mineras_const.json ]; then
    echo "Generating or updating data files (ETL)..."
    cd /app
    python etl/pipeline_chile.py || echo "WARNING: ETL failed, server will start with partial data"
    echo "Data generation complete."
else
    echo "Data files already exist, skipping ETL."
fi

# Start FastAPI server — Railway injects PORT env variable
echo "Starting FastAPI server on port ${PORT:-8000}..."
cd /app/backend
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
