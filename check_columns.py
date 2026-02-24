import sqlite3
import os

db_path = 'd:/web_D_anctigravity/sig_chile/geoportal_chile/data/chile_v2.sqlite'
if not os.path.exists(db_path):
    # Try the other possible name
    db_path = 'd:/web_D_anctigravity/sig_chile/geoportal_chile/data/chile_territorial.sqlite'

def check_columns(table_name):
    if not os.path.exists(db_path):
        print(f"DB not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute(f"PRAGMA table_info('{table_name}')")
        rows = cursor.fetchall()
        print(f"\nColumns for {table_name}:")
        for row in rows:
            print(row[1]) # Name is the second field
    except Exception as e:
        print(f"Error checking {table_name}: {e}")
    conn.close()

if __name__ == "__main__":
    check_columns("concesiones_mineras_const")
    check_columns("pertenencias_mineras")
