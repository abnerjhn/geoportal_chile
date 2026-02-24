import os
import sqlite3
import pandas as pd
import geopandas as gpd
from shapely.geometry import Polygon, Point
import random

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Data/raw está fuera de geoportal_chile
RAW_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', '..', 'data', 'raw'))

def load_layers():
    crs = "EPSG:4326"
    
    def random_polygon(lon_min, lon_max, lat_min, lat_max, size):
        lon = random.uniform(lon_min, lon_max - size)
        lat = random.uniform(lat_min, lat_max - size)
        return Polygon([
            (lon, lat),
            (lon + size, lat),
            (lon + size, lat + size),
            (lon, lat + size),
            (lon, lat)
        ])

    def random_point(lon_min, lon_max, lat_min, lat_max):
        return Point(random.uniform(lon_min, lon_max), random.uniform(lat_min, lat_max))

    # Paths: configurable via environment variables, fallback to local defaults
    DATA_RAW_DIR = os.environ.get('DATA_RAW_DIR', os.path.abspath(os.path.join(BASE_DIR, '..', 'data_raw')))
    DOWNLOADS_DIR = os.environ.get('DOWNLOADS_DIR', DATA_RAW_DIR)
    DPA_DIR = os.environ.get('DPA_DIR', DATA_RAW_DIR)
    layers = {}
    
    # 1. Sitios Prioritarios Integrados
    path_sp = os.path.join(DOWNLOADS_DIR, 'sitios_prior_integrados.json')
    if os.path.exists(path_sp):
        print(f"[{path_sp}] Cargando SP reales...")
        layers["sitios_prioritarios"] = gpd.read_file(path_sp)
    else:
        print("Mocking SP...")
        layers["sitios_prioritarios"] = gpd.GeoDataFrame({
            "id": [1], "nombre": ["Mock SP"], "geometry": [random_polygon(-74, -72, -43, -40, 0.5)]
        }, crs=crs)

    # 2. Areas Protegidas
    path_ap = os.path.join(DOWNLOADS_DIR, 'Areas_Protegidas.json')
    if os.path.exists(path_ap):
        print(f"[{path_ap}] Cargando AP reales...")
        layers["areas_protegidas"] = gpd.read_file(path_ap)
    else:
        print("Mocking AP...")
        layers["areas_protegidas"] = gpd.GeoDataFrame({
            "id": [1], "tipo": ["Parque Marino mock"], "geometry": [random_polygon(-74.5, -73.5, -43.5, -42.0, 0.6)]
        }, crs=crs)

    # 3. Ecosistemas
    print(f"DEBUG: Buscando ecosistemas en {DOWNLOADS_DIR}...")
    # Listar archivos para depuración
    if os.path.exists(DOWNLOADS_DIR):
        print(f"DEBUG: Archivos en {DOWNLOADS_DIR}: {os.listdir(DOWNLOADS_DIR)}")
    
    path_eco = os.path.join(DOWNLOADS_DIR, 'Ecosistemas_multipart.json')
    if not os.path.exists(path_eco):
        # Intento alternativo por si acaso
        import glob
        matches = glob.glob(os.path.join(DOWNLOADS_DIR, "*cosistema*.json"))
        if matches:
            path_eco = matches[0]
            print(f"DEBUG: Encontrado alternativo: {path_eco}")

    if os.path.exists(path_eco):
        print(f"[{path_eco}] Cargando Ecosistemas reales...")
        gdf_eco = gpd.read_file(path_eco)
        print(f"DEBUG: Ecosistemas cargados: {len(gdf_eco)} filas")
        # Normalizar columnas a minúsculas
        gdf_eco.columns = [c.lower() for c in gdf_eco.columns]
        # Reparar geometrías inválidas
        print(f" -> Reparando geometrías en ecosistemas...")
        gdf_eco['geometry'] = gdf_eco['geometry'].buffer(0)
        layers["ecosistemas"] = gdf_eco
    else:
        print(f"ERROR: No se encontró el archivo de ecosistemas en {DOWNLOADS_DIR}")

    # Mocks for missing ones
    layers["pertenencias_mineras"] = gpd.GeoDataFrame({
        "id": [1, 2, 3], "titular": ["Minera A", "Minera B", "Exploraciones C"], "estado": ["Constituida", "En Trámite", "Constituida"],
        "geometry": [random_polygon(-73.5, -71.5, -43.5, -40.5, 0.3) for _ in range(3)]
    }, crs=crs)

    # Note: Concesiones and ECMPO are now loaded from real files below if they exist.
    # We keep these empty GDFs just in case files are missing to avoid KeyErrors.
    if "concesiones_acuicultura" not in layers:
        layers["concesiones_acuicultura"] = gpd.GeoDataFrame(columns=['geometry'], crs=crs)
    if "ecmpo" not in layers:
        layers["ecmpo"] = gpd.GeoDataFrame(columns=['geometry'], crs=crs)

    # areas_marinas was mapped before in backend, let's keep a mock for backward compatibility
    layers["areas_marinas"] = gpd.GeoDataFrame({
        "id": [1], "tipo": ["Parque Marino mock amp"], "decreto": ["Dec-20"],
        "geometry": [random_polygon(-74.5, -73.5, -43.5, -42.0, 0.6)]
    }, crs=crs)

    layers["especies_conservacion"] = gpd.GeoDataFrame({
        "id": [1, 2], "taxonomia": ["Pudu puda", "Lycalopex fulvipes"], "estado_conservacion": ["Vulnerable", "En Peligro"],
        "geometry": [random_point(-73.5, -71.5, -43.5, -40.5) for _ in range(2)]
    }, crs=crs)

    # 8. Regiones
    path_reg = os.path.join(DPA_DIR, 'Regional.json')
    if os.path.exists(path_reg):
        print(f"[{path_reg}] Cargando Regiones reales...")
        layers["regiones"] = gpd.read_file(path_reg)

    # 9. Provincias
    path_prov = os.path.join(DPA_DIR, 'Provincias.json')
    if os.path.exists(path_prov):
        print(f"[{path_prov}] Cargando Provincias reales...")
        layers["provincias"] = gpd.read_file(path_prov)

    # 10. Comunas
    path_com = os.path.join(DPA_DIR, 'comunas.json')
    if os.path.exists(path_com):
        print(f"[{path_com}] Cargando Comunas reales...")
        layers["comunas"] = gpd.read_file(path_com)

    # 11. Concesiones Acuicultura (corrected geographic projection)
    path_acu = os.path.join(DPA_DIR, 'Concesiones_Acuicultura_geo.json')
    if os.path.exists(path_acu):
        print(f"[{path_acu}] Cargando Concesiones de Acuicultura...")
        layers["concesiones_acuicultura"] = gpd.read_file(path_acu)

    # 12. ECMPO - Espacios Costeros Marinos de Pueblos Originarios
    path_ecmpo = os.path.join(DPA_DIR, 'ECMPO_geo.json')
    if os.path.exists(path_ecmpo):
        print(f"[{path_ecmpo}] Cargando ECMPO...")
        layers["ecmpo"] = gpd.read_file(path_ecmpo)

    return layers

def process_and_export():
    # Caminno para el log que podremos ver desde la web
    log_path = os.path.abspath(os.path.join(BASE_DIR, '..', 'frontend', 'dist', 'etl_log.txt'))
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    
    import sys
    class Logger:
        def __init__(self, filename):
            self.terminal = sys.stdout
            self.log = open(filename, "a", encoding="utf-8")
        def write(self, message):
            self.terminal.write(message)
            self.log.write(message)
            self.log.flush()
        def flush(self):
            self.terminal.flush()
            self.log.flush()

    sys.stdout = Logger(log_path)
    sys.stderr = sys.stdout

    print("Iniciando ETL con datos reales (GeoPandas)...")
    layers = load_layers()
        
    # Use DATABASE_PATH env var if set, otherwise default to relative path
    _default = os.path.abspath(os.path.join(BASE_DIR, '..', 'data', 'chile_territorial.sqlite'))
    db_path = os.environ.get('DATABASE_PATH', _default)
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    print(f"Database output path: {db_path}")
    
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
            print(f"Base de datos anterior eliminada: {db_path}")
        except Exception as e:
            print(f"Error borrando DB anterior, cuidado con locks. {e}")
            
    print(f"\nExportando {len(layers)} capas a: {db_path}...")
    
    # Try SpatiaLite driver first, fall back to GPKG if it fails
    driver = 'SQLite'
    spatialite = True
    
    for name, gdf in layers.items():
        print(f" -> Exportando {name} ({len(gdf)} filas)...")
        export_gdf = gdf.copy()
        
        # Ensure column types are compatible with sqlite
        for col in export_gdf.columns:
            if col != 'geometry':
                if pd.api.types.is_string_dtype(export_gdf[col]) or pd.api.types.is_object_dtype(export_gdf[col]):
                    export_gdf[col] = export_gdf[col].astype(object)
            else:
                # Reparar geometrías al vuelo por si quedaron inválidas tras simplificación/carga
                export_gdf['geometry'] = export_gdf['geometry'].buffer(0)
        
        try:
            export_gdf.to_file(db_path, driver=driver, spatialite=spatialite, layer=name)
            print(f"    OK ({driver}, spatialite={spatialite})")
        except Exception as e:
            print(f"    WARN: {driver} failed ({e}), retrying with GPKG driver...")
            driver = 'GPKG'
            spatialite = False
            try:
                export_gdf.to_file(db_path, driver=driver, layer=name)
                print(f"    OK ({driver})")
            except Exception as e2:
                print(f"    ERROR: Both drivers failed for {name}: {e2}")
        
    # Verify the database was created
    if os.path.exists(db_path):
        size_mb = os.path.getsize(db_path) / 1024 / 1024
        print(f"\nDB generada: {db_path} ({size_mb:.1f} MB)")
        
        # Set WAL mode for concurrent reads
        try:
            with sqlite3.connect(db_path) as sqlite_conn:
                cursor = sqlite_conn.cursor()
                cursor.execute('PRAGMA journal_mode=WAL;')
                sqlite_conn.commit()
                # List tables
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
                tables = [r[0] for r in cursor.fetchall()]
                print(f"Tablas en DB: {tables}")
        except Exception as e:
            print(f"WARN: Could not set WAL mode: {e}")
    else:
        print(f"\nERROR CRITICO: No se creó la base de datos en {db_path}")
        
    print("ETL finalizado.")

if __name__ == '__main__':
    process_and_export()
