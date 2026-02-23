#!/bin/bash
set -e

echo "=== Geoportal Chile - Startup ==="

# Run ETL pipeline to generate SQLite database (if not already present)
if [ ! -f /app/data/chile_territorial.sqlite ]; then
    echo "Generating SQLite database from raw data..."
    cd /app
    python etl/pipeline_chile.py
    echo "Database generated successfully."
else
    echo "SQLite database already exists, skipping ETL."
fi

# Start FastAPI server
echo "Starting FastAPI server on port ${PORT:-8000}..."
cd /app/backend
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
