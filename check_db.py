import sqlite3
import os

db_path = 'd:/web_D_anctigravity/sig_chile/geoportal_chile/data/chile_territorial.sqlite'
if not os.path.exists(db_path):
    print(f"Error: DB not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cursor.fetchall()]
print("Tables in DB:")
for t in sorted(tables):
    if '_GEOMETRY_' not in t and 'idx_' not in t:
        cursor.execute(f"SELECT COUNT(*) FROM {t}")
        count = cursor.fetchone()[0]
        print(f" - {t}: {count} rows")
conn.close()
