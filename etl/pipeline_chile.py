import geopandas as gpd
import pandas as pd
import os
import sqlite3
import random
from shapely.geometry import Point, Polygon

# Standard script for Chile Territorial ETL
# Processes layers sequentially to minimize memory footprint on Railway builds

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def process_and_export():
    # Caminno para el log que podremos ver desde la web
    log_path = os.path.abspath(os.path.join(BASE_DIR, '..', 'frontend', 'dist', 'etl_log.txt'))
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    
    import sys
    class Logger:
        def __init__(self, filename):
            self.terminal = sys.stdout
            self.log = open(filename, "w", encoding="utf-8")
        def write(self, message):
            self.terminal.write(message)
            self.log.write(message)
            self.log.flush()
        def flush(self):
            self.terminal.flush()
            self.log.flush()

    sys.stdout = Logger(log_path)
    sys.stderr = sys.stdout

    print("Iniciando ETL con datos reales (GeoPandas Sequential Support)...")
    
    # Paths: configurable via environment variables
    DATA_RAW_DIR = os.environ.get('DATA_RAW_DIR', os.path.abspath(os.path.join(BASE_DIR, '..', 'data_raw')))
    DOWNLOADS_DIR = os.environ.get('DOWNLOADS_DIR', DATA_RAW_DIR)
    DPA_DIR = os.environ.get('DPA_DIR', DATA_RAW_DIR)
    db_path = os.environ.get('DATABASE_PATH', os.path.abspath(os.path.join(BASE_DIR, '..', 'data', 'chile_v2.sqlite')))
    
    # Preparar DB
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
            print(f"Base de datos anterior eliminada: {db_path}")
        except Exception as e:
            print(f"WARN: No se pudo eliminar la DB anterior ({e})")
    
    # Lista de capas reales a procesar (Name, Path)
    capas_reales = [
        ("sitios_prioritarios", os.path.join(DOWNLOADS_DIR, 'sitios_prior_integrados.json')),
        ("areas_protegidas", os.path.join(DOWNLOADS_DIR, 'Areas_Protegidas.json')),
        ("ecosistemas", os.path.join(DOWNLOADS_DIR, 'Ecosistemas_simplified.json')),
        ("regiones", os.path.join(DPA_DIR, 'Regional.json')),
        ("provincias", os.path.join(DPA_DIR, 'Provincias.json')),
        ("comunas", os.path.join(DPA_DIR, 'comunas.json')),
        ("concesiones_acuicultura", os.path.join(DPA_DIR, 'Concesiones_Acuicultura_geo.json')),
        ("ecmpo", os.path.join(DPA_DIR, 'ECMPO_geo.json')),
        ("concesiones_mineras_const", os.path.join(DATA_RAW_DIR, 'concesion_minera_CONSTITUIDA.json')),
        ("concesiones_mineras_tramite", os.path.join(DATA_RAW_DIR, 'concesion_minera_EN_TRAMITE.json')),
    ]

    driver = 'SQLite'
    spatialite = True

    for name, path in capas_reales:
        if not os.path.exists(path):
            print(f"WARN: No se encontró {path}, saltando...")
            continue
            
        print(f" -> Procesando {name} desde {path}...")
        try:
            gdf = gpd.read_file(path)
            
            # Normalizar columnas a minúsculas
            gdf.columns = [c.lower() for c in gdf.columns]
            
            # Garantizar que las geometrías sean válidas
            print(f"    Reparando geometrías...")
            gdf['geometry'] = gdf['geometry'].buffer(0)
            
            # Prevenir problemas de tipos antes de exportar
            print(f"    Exportando {len(gdf)} filas...")
            for col in gdf.columns:
                if col != 'geometry':
                    if pd.api.types.is_string_dtype(gdf[col]) or pd.api.types.is_object_dtype(gdf[col]):
                        gdf[col] = gdf[col].astype(object)

            gdf.to_file(db_path, driver=driver, spatialite=spatialite, layer=name)
            print(f"    OK")
            del gdf # IMPORTANTE: Liberar memoria
        except Exception as e:
            print(f"    ERROR en {name}: {e}")

    # Mocks para capas que no tienen archivo GeoJSON todavía
    print(" -> Generando Mocks para capas faltantes...")
    crs = "EPSG:4326"
    
    def random_polygon(x_min, x_max, y_min, y_max, size=0.1):
        x = random.uniform(x_min, x_max)
        y = random.uniform(y_min, y_max)
        return Polygon([(x, y), (x+size, y), (x+size, y+size), (x, y+size)])

    mock_layers_data = [
        ("pertenencias_mineras", {
            "id": [1, 2, 3], "titular": ["Minera A", "Minera B", "Exploraciones C"], "estado": ["Constituida", "En Trámite", "Constituida"],
            "geometry": [random_polygon(-73.5, -71.5, -43.5, -40.5, 0.3) for _ in range(3)]
        }),
        ("areas_marinas", {
            "id": [1], "tipo": ["Parque Marino mock amp"], "decreto": ["Dec-20"],
            "geometry": [random_polygon(-74.5, -73.5, -43.5, -42.0, 0.6)]
        }),
        ("especies_conservacion", {
            "id": [1, 2], "taxonomia": ["Pudu puda", "Lycalopex fulvipes"], "estado_conservacion": ["Vulnerable", "En Peligro"],
            "geometry": [Point(random.uniform(-73.5, -71.5), random.uniform(-43.5, -40.5)) for _ in range(2)]
        })
    ]
    
    for name, data in mock_layers_data:
        gdf_mock = gpd.GeoDataFrame(data, crs=crs)
        # Prevenir problemas de tipos en mocks
        for col in gdf_mock.columns:
            if col != 'geometry':
                gdf_mock[col] = gdf_mock[col].astype(object)
        gdf_mock.to_file(db_path, driver=driver, spatialite=spatialite, layer=name)
        print(f" -> Mock {name} OK")
        del gdf_mock

    # Finalizar
    if os.path.exists(db_path):
        size_mb = os.path.getsize(db_path) / 1024 / 1024
        print(f"\nDB generada exitosamente: {db_path} ({size_mb:.1f} MB)")
    else:
        print(f"\nERROR: No se generó la base de datos.")
    
    print("ETL finalizado.")

if __name__ == "__main__":
    process_and_export()
