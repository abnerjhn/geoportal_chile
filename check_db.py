import sqlite3
import os

db_path = 'data/chile_v2.sqlite'
print(f"Checking {db_path}...")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

layers = ["concesiones_mineras_const", "concesiones_mineras_tramite"]

for layer in layers:
    print(f"\n--- Layer: {layer} ---")
    cursor.execute(f"PRAGMA table_info(\"{layer}\")")
    columns = [row[1] for row in cursor.fetchall()]
    print(f"Columns: {columns}")
    
    if 'numero_rol' in columns:
        print("SUCCESS: 'numero_rol' column found.")
    else:
        print("FAILURE: 'numero_rol' column NOT found.")
        
    cursor.execute(f"SELECT * FROM \"{layer}\" LIMIT 2")
    rows = cursor.fetchall()
    for row in rows:
        data = dict(zip(columns, row))
        # Remove geometry for cleaner output
        if 'geometry' in data: del data['geometry']
        if 'GEOMETRY' in data: del data['GEOMETRY']
        print(f"Record: {data}")

conn.close()
