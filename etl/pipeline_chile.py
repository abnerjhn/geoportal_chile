import duckdb
import os
import sys
import sqlite3
import pandas as pd
import geopandas as gpd
from shapely import wkt

# ETL using DuckDB for speed and low memory
# This script converts GeoJSON direct to GeoPandas GDFs in chunks/sequentially

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_RAW_DIR = os.environ.get('DATA_RAW_DIR', os.path.abspath(os.path.join(BASE_DIR, '..', 'data_raw')))
db_path = os.environ.get('DATABASE_PATH', os.path.abspath(os.path.join(BASE_DIR, '..', 'data', 'chile_territorial.sqlite')))

def process_layer(con, name, path):
    print(f" -> Procesando {name} con DuckDB...")
    try:
        # Load spatial extension
        con.execute("INSTALL spatial; LOAD spatial;")
        
        # Read GeoJSON using DuckDB spatial
        query = f"SELECT * FROM ST_Read('{path}')"
        df = con.execute(query).df()
        
        # Convert to GeoPandas
        print(f"    Convertiendo a GeoPandas...")
        # Use DuckDB binary geometry conversion if possible, or WKT
        # Since we want to be safe and simple:
        df['geometry'] = df['geom'].apply(lambda g: wkt.loads(con.execute(f"SELECT ST_AsText('{g}')").fetchone()[0]) if g else None)
        gdf = gpd.GeoDataFrame(df, geometry='geometry', crs="EPSG:4326")
        
        # Final cleanup and export
        gdf.columns = [c.lower() for c in gdf.columns]
        if 'geom' in gdf.columns: gdf = gdf.drop(columns=['geom'])
        
        print(f"    Exportando a SQLite (Spatialite)...")
        gdf.to_file(db_path, driver='SQLite', spatialite=True, layer=name)
        print(f"    OK")
    except Exception as e:
        print(f"    ERROR en {name}: {e}")

def main():
    print("Iniciando DuckDB-powered ETL...")
    con = duckdb.connect()
    
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    if os.path.exists(db_path):
        os.remove(db_path)
        
    capas = [
        ("sitios_prioritarios", os.path.join(DATA_RAW_DIR, 'sitios_prior_integrados.json')),
        ("areas_protegidas", os.path.join(DATA_RAW_DIR, 'Areas_Protegidas.json')),
        ("ecosistemas", os.path.join(DATA_RAW_DIR, 'Ecosistemas_simplified.json')),
        ("regiones", os.path.join(DATA_RAW_DIR, 'Regional.json')),
        ("provincias", os.path.join(DATA_RAW_DIR, 'Provincias.json')),
        ("comunas", os.path.join(DATA_RAW_DIR, 'comunas.json')),
        ("concesiones_acuicultura", os.path.join(DATA_RAW_DIR, 'Concesiones_Acuicultura_geo.json')),
        ("ecmpo", os.path.join(DATA_RAW_DIR, 'ECMPO_geo.json')),
    ]
    
    for name, path in capas:
        if os.path.exists(path):
            process_layer(con, name, path)
        else:
            print(f"WARN: No se encontró {path}")

    # Modo WAL
    try:
        with sqlite3.connect(db_path) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
    except: pass
    
    print("ETL DuckDB Finalizado.")

if __name__ == "__main__":
    main()
