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

    DOWNLOADS_DIR = r"C:\Users\abner\Downloads"
    DPA_DIR = r"d:\web_D_anctigravity\sig_chile\data_raw"
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
    path_eco = os.path.join(DOWNLOADS_DIR, 'EcosistemasxAPxSP.json')
    if os.path.exists(path_eco):
        print(f"[{path_eco}] Cargando Ecosistemas reales...")
        layers["ecosistemas"] = gpd.read_file(path_eco)

    # Mocks for missing ones
    print("Generando Mocks para capas faltantes...")
    layers["pertenencias_mineras"] = gpd.GeoDataFrame({
        "id": [1, 2, 3], "titular": ["Minera A", "Minera B", "Exploraciones C"], "estado": ["Constituida", "En Trámite", "Constituida"],
        "geometry": [random_polygon(-73.5, -71.5, -43.5, -40.5, 0.3) for _ in range(3)]
    }, crs=crs)

    layers["concesiones_acuicultura"] = gpd.GeoDataFrame({
        "id": [1], "titular": ["Salmonera Sur"], "especie": ["Salmón"], "resolucion": ["DS-100"],
        "geometry": [random_polygon(-74, -73, -43, -41, 0.2)]
    }, crs=crs)

    layers["ecmpo"] = gpd.GeoDataFrame({
        "id": [1], "comunidad": ["Comunidad Williche Destacada"], "estado_tramite": ["Aprobado"],
        "geometry": [random_polygon(-73.8, -73.2, -42.8, -41.5, 0.4)]
    }, crs=crs)

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
    print("Iniciando ETL con datos reales (GeoPandas + SpatiaLite)...")
    layers = load_layers()
        
    db_path = os.path.abspath(os.path.join(BASE_DIR, '..', 'data', 'chile_territorial.sqlite'))
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
            print(f"Base de datos anterior eliminada: {db_path}")
        except Exception as e:
            print(f"Error borrando DB anterior, cuidado con locks. {e}")
            
    print(f"\nExportando {len(layers)} capas a SpatiaLite: {db_path}...")
    
    for name, gdf in layers.items():
        print(f" -> Exportando {name} ({len(gdf)} filas)...")
        export_gdf = gdf.copy()
        
        # Ensure column types are compatible with sqlite
        for col in export_gdf.columns:
            if col != 'geometry':
                if pd.api.types.is_string_dtype(export_gdf[col]) or pd.api.types.is_object_dtype(export_gdf[col]):
                    export_gdf[col] = export_gdf[col].astype(object)
                
        export_gdf.to_file(db_path, driver='SQLite', spatialite=True, layer=name)
        
    print("\nAjustando la base de datos de salida (Modo WAL)...")
    with sqlite3.connect(db_path) as sqlite_conn:
        cursor = sqlite_conn.cursor()
        cursor.execute('PRAGMA journal_mode=WAL;')
        sqlite_conn.commit()
        
    print(f"ETL finalizado. DB generada en: {db_path}")

if __name__ == '__main__':
    process_and_export()
