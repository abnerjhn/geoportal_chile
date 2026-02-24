import sqlite3
import os
import sys

# Simulation of the backend environment
DATABASE_PATH = 'd:/web_D_anctigravity/sig_chile/geoportal_chile/data/chile_v2.sqlite'
if not os.path.exists(DATABASE_PATH):
    # Try the other possible name
    DATABASE_PATH = 'd:/web_D_anctigravity/sig_chile/geoportal_chile/data/chile_territorial.sqlite'

def get_db_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.enable_load_extension(True)
    try:
        conn.load_extension('mod_spatialite')
    except:
        conn.load_extension('spatialite')
    conn.row_factory = sqlite3.Row
    return conn

def test_mvt(layer, z, x, y):
    WORLD_SIZE = 40075016.68557849
    ORIGIN_X = -20037508.342789244
    ORIGIN_Y = 20037508.342789244
    
    tile_size = WORLD_SIZE / (2**z)
    xmin = ORIGIN_X + x * tile_size
    xmax = xmin + tile_size
    ymax = ORIGIN_Y - y * tile_size
    ymin = ymax - tile_size

    # The EXACT query from main.py
    query = f"""
    WITH 
    bounds AS (
        SELECT ST_MakeEnvelope(?, ?, ?, ?, 3857) AS geom
    ),
    mvt_geom AS (
        SELECT 
            ST_AsMVTGeom(
                ST_Transform(t.GEOMETRY, 3857), 
                (SELECT geom FROM bounds),
                4096, 64, true
            ) AS geom,
            t.nombre, t.situacion, t.tipo_conce, t.titular_no
        FROM "{layer}" t
        WHERE t.ROWID IN (
            SELECT rowid FROM SpatialIndex 
            WHERE f_table_name = ? 
            AND search_frame = ST_Transform((SELECT geom FROM bounds), 4326)
        )
    )
    SELECT ST_AsMVT(mvt_geom.*, ?) FROM mvt_geom;
    """

    print(f"Testing {layer} at {z}/{x}/{y}...")
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(query, (xmin, ymin, xmax, ymax, layer, layer))
        row = cursor.fetchone()
        if row and row[0]:
            print(f"SUCCESS: Tile generated, size={len(row[0])} bytes")
        else:
            print("EMPTY: No features in this tile.")
    except Exception as e:
        print(f"FAILURE: {type(e).__name__}: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    # Test a tile where data should exist (e.g. Center of Chile)
    # The user's error was at 7/37/79
    test_mvt("concesiones_mineras_const", 7, 37, 79)
