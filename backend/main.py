from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Dict, Any, List
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor
from shapely.geometry import shape
from shapely import wkt
import geopandas as gpd
import pandas as pd
import tempfile
import os
import shutil
import fiona

# Habilitar soporte para KML en fiona (GeoPandas lo utiliza internamente)
fiona.drvsupport.supported_drivers['KML'] = 'rw'
fiona.drvsupport.supported_drivers['LIBKML'] = 'rw'

# Configurar logs
import logging
logging.basicConfig(level=logging.INFO)

# Importar configuración de BD
from database import get_db_connection
DATABASE_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data', 'chile_v2.sqlite'))

app = FastAPI(title="Geoportal Chile API", version="1.0.0")

@app.get("/api/health")
async def health():
    """Diagnostic endpoint to verify database and SpatiaLite status."""
    import sqlite3
    info = {"status": "ok", "db_exists": False, "tables": [], "spatialite": False}
    try:
        db_path = DATABASE_PATH
        info["db_path"] = db_path
        info["db_exists"] = os.path.exists(db_path)
        if info["db_exists"]:
            info["db_size_mb"] = round(os.path.getsize(db_path) / 1024 / 1024, 1)
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            info["tables"] = tables
            for t in tables:
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM \"{t}\"")
                    info[f"count_{t}"] = cursor.fetchone()[0]
                except:
                    pass
            try:
                cursor.execute("SELECT spatialite_version()")
                info["spatialite"] = cursor.fetchone()[0]
            except:
                info["spatialite"] = False
            conn.close()
        
        # Intentar leer log del ETL
        log_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist', 'etl_log.txt'))
        if os.path.exists(log_path):
            with open(log_path, 'r', encoding='utf-8') as f:
                info["etl_log_tail"] = f.read()[-2000:]
        
        info["deploy_id"] = "v21.2-metadata-spatial-fix"
        info["DEBUG_MARKER"] = "FORCE_REFRESH_V21.2_2026-02-25T08-55-00"
    except Exception as e:
        info["error"] = str(e)
    return info

# Limitamos hilos concurrentes
# En modo WAL, las lecturas en SQLite pueden ser concurrentes sin bloqueos severos
executor = ThreadPoolExecutor(max_workers=5)

class GeoJSONPayload(BaseModel):
    type: str
    geometry: Dict[str, Any]
    properties: Dict[str, Any] = None

def run_spatial_query(query: str, parameters: tuple = ()) -> List[dict]:
    """Ejecuta consulta sobre SQLite síncronamente en un hilo."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(query, parameters)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    except Exception as e:
        logging.error(f"Error executing query: {query}. Error: {e}")
        return []
    finally:
        conn.close()

def run_gpd_intersection(layer: str, geom_wkt: str) -> List[dict]:
    """Busca intersecciones contra una capa usando GeoPandas y bbox (índice espacial GDAL)."""
    try:
        geom = wkt.loads(geom_wkt)
        # Usamos bbox para que Fiona use el índice espacial R-Tree internamente de forma rápida
        gdf = gpd.read_file(DATABASE_PATH, layer=layer, bbox=geom.bounds)
        if gdf.empty:
            return []
        
        # Refinar intersección exacta en memoria
        intersecting = gdf[gdf.intersects(geom)].copy()
        if intersecting.empty:
            return []
            
        # Calcular area de la interseccion (en Ha)
        try:
            intersections_geom_proj = intersecting.intersection(geom).to_crs(epsg=32719)
            intersecting['area_interseccion_ha'] = intersections_geom_proj.area / 10000.0
        except Exception as e:
            logging.error(f"Error calculando area interseccion en {layer}: {e}")
            intersecting['area_interseccion_ha'] = 0.0
            
        intersecting = intersecting.drop(columns=['geometry', 'GEOMETRY'], errors='ignore')
        # Limpiar NaNs para que FastAPI pueda serializar a JSON correctamente
        intersecting = intersecting.where(pd.notnull(intersecting), None)
        return intersecting.to_dict('records')
    except Exception as e:
        logging.error(f"Error en capa {layer}: {e}")
        return []

def run_gpd_area(geom_wkt: str) -> float:
    """Calcula el área reproyectando a UTM 19S (EPSG:32719) en memoria con GeoPandas"""
    try:
        geom = wkt.loads(geom_wkt)
        gdf = gpd.GeoDataFrame(geometry=[geom], crs="EPSG:4326")
        gdf_proj = gdf.to_crs(epsg=32719)
        return float(gdf_proj.area.iloc[0] / 10000.0)
    except Exception as e:
        logging.error(f"Error calculating area: {e}")
        return 0.0

async def check_layer_intersection(layer: str, geom_wkt: str) -> List[dict]:
    """Busca intersecciones de manera asíncrona delegando a hilo."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, run_gpd_intersection, layer, geom_wkt)

@app.post("/api/reporte-predio")
async def reporte_predio(payload: GeoJSONPayload):
    try:
        geom = shape(payload.geometry)
        if not geom.is_valid:
            geom = geom.buffer(0)
            
        wkt = geom.wkt
        
        # Ejecución asíncrona y simultánea (Micro/Web)
        capas_afectacion = [
            "sitios_prioritarios", "pertenencias_mineras", "concesiones_acuicultura", 
            "ecmpo", "areas_marinas", "areas_protegidas", "ecosistemas",
            "concesiones_mineras_const", "concesiones_mineras_tramite"
        ]
        tareas = [check_layer_intersection(capa, wkt) for capa in capas_afectacion]
        
        # Esperamos a que todas las queries terminen en paralelo
        resultados = await asyncio.gather(*tareas)
        
        restricciones = {}
        for capa, res in zip(capas_afectacion, resultados):
            # Limpiamos el objeto GEOMETRY WKB en la salida JSON ya que no es serializable
            res_limpio = [{k: v for k, v in dict_item.items() if k != 'GEOMETRY'} for dict_item in res]
            restricciones[capa] = res_limpio
            
        # Consulta de DPA (División Político Administrativa)
        dpa_capas = ["regiones", "provincias", "comunas"]
        dpa_tareas = [check_layer_intersection(capa, wkt) for capa in dpa_capas]
        dpa_resultados = await asyncio.gather(*dpa_tareas)
        
        dpa_info = {"Region": [], "Provincia": [], "Comuna": []}
        
        def fix_encoding(text):
            if not isinstance(text, str): return text
            try:
                # Arreglo para mojibake "RegiÃ³n" -> "Región"
                return text.encode('latin-1').decode('utf-8')
            except:
                return text

        if dpa_resultados[0]:
            dpa_info["Region"] = list(set([fix_encoding(item.get('region')) for item in dpa_resultados[0] if item.get('region')]))
        if dpa_resultados[1]:
            dpa_info["Provincia"] = list(set([fix_encoding(item.get('provincia')) for item in dpa_resultados[1] if item.get('provincia')]))
        if dpa_resultados[2]:
            dpa_info["Comuna"] = list(set([fix_encoding(item.get('comuna')) for item in dpa_resultados[2] if item.get('comuna')]))
        
        # Inyectando el cálculo de área con GeoPandas (cross-platform robusto)
        loop = asyncio.get_event_loop()
        area_ha = await loop.run_in_executor(executor, run_gpd_area, wkt)
        
        return {
            "estado": "exito",
            "area_total_ha": round(area_ha, 2) if area_ha else 0.0,
            "dpa": dpa_info,
            "restricciones": restricciones
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/upload-predio")
async def upload_predio(file: UploadFile = File(...)):
    """ Endpoint para procesar archivos espaciales subidos por el usuario (SHP zip, KML, GeoJSON) """
    try:
        suffix = os.path.splitext(file.filename)[1].lower()
        if suffix not in ['.zip', '.geojson', '.json', '.kml']:
            suffix = '.tmp'
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
        
        loop = asyncio.get_event_loop()
        
        def process_file_sync(path):
            read_path = path
            if path.endswith('.zip'):
                read_path = f"zip://{path}"
            
            gdf = gpd.read_file(read_path)
            
            # Limpiar geometrias vacias
            gdf = gdf.dropna(subset=['geometry'])
            if gdf.empty:
                raise ValueError("El archivo no contenía geometrías válidas.")
            
            # Reproyectar a WGS84 (EPSG:4326) de ser necesario
            if gdf.crs is None or gdf.crs.to_string() != 'EPSG:4326':
                if gdf.crs is None:
                    # Asumimos WGS84 si viene sin CRS (común en geojsons puros)
                    gdf.set_crs(epsg=4326, inplace=True, allow_override=True)
                else:
                    gdf = gdf.to_crs(epsg=4326)

            # Convertir el DataFrame directamente en un JSON tipo FeatureCollection
            return json.loads(gdf.to_json())
            
        feature_collection = await loop.run_in_executor(executor, process_file_sync, tmp_path)
        
        os.remove(tmp_path)
        return feature_collection

    except Exception as e:
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.remove(tmp_path)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Error leyendo el archivo espacial: {str(e)}")

@app.get("/api/stats/region/{id_region}")
async def stats_region(id_region: str):
    """Consulta Macro desde la Web"""
    query = """
        SELECT c.* 
        FROM pertenencias_mineras c
        JOIN division_politica dp ON ST_Intersects(c.GEOMETRY, dp.GEOMETRY)
        WHERE dp.region LIKE '%' || ? || '%'
    """
    loop = asyncio.get_event_loop()
    res = await loop.run_in_executor(executor, run_spatial_query, query, (id_region,))
    return {
        "region": id_region,
        "conteo_pertenencias": len(res)
    }

from fastapi import Response

@app.get("/api/tiles/{layer}/{z}/{x}/{y}.pbf")
async def get_tile(layer: str, z: int, x: int, y: int):
    """
    Genera dinámicamente un Vector Tile (MVT) desde SpatiaLite.
    Optimizado para SpatiaLite 5.0 (ST_AsMVT es agregado y solo de geometría).
    """
    valid_layers = ["concesiones_mineras_const", "concesiones_mineras_tramite", "ecmpo", "ecosistemas", "areas_protegidas"]
    if layer not in valid_layers:
        raise HTTPException(status_code=404, detail="Layer not tileable")

    WORLD_SIZE = 40075016.68557849
    ORIGIN_X = -20037508.342789244
    ORIGIN_Y = 20037508.342789244
    tile_size = WORLD_SIZE / (2**z)
    xmin = ORIGIN_X + x * tile_size
    xmax = xmin + tile_size
    ymax = ORIGIN_Y - y * tile_size
    ymin = ymax - tile_size
    
    def fetch_tile_sync():
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            # Detectar columna de geometría
            cursor.execute(f"PRAGMA table_info('{layer}')")
            all_cols = [r[1] for r in cursor.fetchall()]
            geom_col = next((c for c in all_cols if c.lower() in ['geometry', 'geom']), "geometry")

            # SQL Universal: ST_Intersects directo (usa el optimizador RTree automático si existe)
            # Agregamos filtro IS NOT NULL para evitar problemas con registros sin geometría
            query = f"""
            WITH 
            bounds AS (
                SELECT ST_MakeEnvelope(?, ?, ?, ?, 3857) AS geom
            ),
            mvt_geom AS (
                SELECT 
                    ST_AsMVTGeom(
                        ST_Transform(t."{geom_col}", 3857), 
                        (SELECT geom FROM bounds),
                        4096, 64, true
                    ) AS geom
                FROM "{layer}" t
                WHERE t."{geom_col}" IS NOT NULL 
                AND ST_Intersects(t."{geom_col}", ST_Transform((SELECT geom FROM bounds), 4326))
            )
            SELECT ST_AsMVT(mvt_geom.geom, ?) FROM mvt_geom;
            """
            
            cursor.execute(query, (xmin, ymin, xmax, ymax, layer, layer))
            row = cursor.fetchone()
            return row[0] if row else None
        except Exception as e:
            logging.error(f"TILE ERROR [{layer} {z}/{x}/{y}]: {str(e)}")
            raise e
        finally:
            conn.close()

    try:
        loop = asyncio.get_event_loop()
        mvt_data = await loop.run_in_executor(executor, fetch_tile_sync)
        if not mvt_data: return Response(status_code=204)
        return Response(content=mvt_data, media_type="application/vnd.mapbox-vector-tile",
                        headers={"Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*"})
    except Exception as e:
        return Response(content=json.dumps({"error": str(e)}), status_code=500, media_type="application/json")

@app.get("/api/feature-info/{layer}/{lat}/{lon}")
async def get_feature_info(layer: str, lat: float, lon: float):
    """Obtiene metadatos de un punto específico para capas servidas por MVT."""
    def fetch_info_sync():
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            # Detectar columna de geometría
            cursor.execute(f"PRAGMA table_info('{layer}')")
            all_cols = [r[1] for r in cursor.fetchall()]
            geom_col = next((c for c in all_cols if c.lower() in ['geometry', 'geom']), "geometry")

            # Usar GeomFromText para máxima compatibilidad con SpatiaLite 5.x
            query = f"""
            SELECT * FROM "{layer}" 
            WHERE "{geom_col}" IS NOT NULL 
            AND ST_Intersects("{geom_col}", GeomFromText('POINT(' || ? || ' ' || ? || ')', 4326))
            LIMIT 1;
            """
            cursor.execute(query, (lon, lat))
            row = cursor.fetchone()
            if row:
                d = dict(row)
                if geom_col in d: del d[geom_col]
                if 'GEOMETRY' in d: del d['GEOMETRY']
                return d
            return None
        finally:
            conn.close()

    try:
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(executor, fetch_info_sync)
        if not info: return {"error": "No feature found"}
        return info
    except Exception as e:
        logging.error(f"FEATURE INFO ERROR [{layer} {lat}/{lon}]: {str(e)}")
        return {"error": f"Internal Server Error: {str(e)}"}

# Servir Frontend
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
import os

# Permitir CORS para desarrollo con Vite
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist'))
data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'public', 'data'))

if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="frontend")

# Asegurar que la carpeta de datos estáticos también se sirva
if os.path.exists(data_dir):
    app.mount("/data", StaticFiles(directory=data_dir), name="data")

@app.get("/")
async def root():
    return RedirectResponse(url="/static/index.html")
