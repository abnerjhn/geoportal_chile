"""Startup script for Geoportal Chile on Railway.
Replaces start.sh to avoid CRLF line ending issues.
Generates the SQLite database on first run, then starts the FastAPI server.
"""
import os
import sys
import subprocess

def main():
    print("=== Geoportal Chile Startup ===", flush=True)
    
    db_path = os.environ.get('DATABASE_PATH', '/app/data/chile_v2.sqlite')
    print(f"[STARTUP] Database path: {db_path}", flush=True)
    print(f"[STARTUP] Database exists: {os.path.exists(db_path)}", flush=True)
    
    # Generate database if it doesn't exist
    if not os.path.exists(db_path):
        print("[STARTUP] Generating SQLite database from raw data...", flush=True)
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        try:
            result = subprocess.run(
                [sys.executable, '/app/etl/pipeline_chile.py'],
                cwd='/app',
                timeout=600
            )
            if result.returncode != 0:
                print(f"[STARTUP] WARNING: ETL exited with code {result.returncode}", flush=True)
            else:
                print("[STARTUP] Database generated successfully.", flush=True)
        except Exception as e:
            print(f"[STARTUP] ERROR generating database: {e}", flush=True)
    else:
        size_mb = os.path.getsize(db_path) / 1024 / 1024
        print(f"[STARTUP] Database already exists ({size_mb:.1f} MB)", flush=True)
    
    # Start uvicorn
    port = os.environ.get('PORT', '8000')
    print(f"[STARTUP] Starting uvicorn on port {port}...", flush=True)
    
    os.chdir('/app/backend')
    os.execvp(
        sys.executable,
        [sys.executable, '-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', port]
    )

if __name__ == '__main__':
    main()
