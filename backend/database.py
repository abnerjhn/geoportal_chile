import os
import sqlite3

# Ensure we get the absolute path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_db_sqlite = os.path.abspath(os.path.join(BASE_DIR, '..', 'data', 'chile_territorial.sqlite'))
_db_gpkg = os.path.abspath(os.path.join(BASE_DIR, '..', 'data', 'chile_territorial.gpkg'))

# Try both extensions (GPKG is used as fallback when SpatiaLite driver isn't available)
if os.path.exists(_db_sqlite):
    DATABASE_PATH = _db_sqlite
elif os.path.exists(_db_gpkg):
    DATABASE_PATH = _db_gpkg
else:
    DATABASE_PATH = _db_sqlite  # Default, will show error at runtime
    print(f"WARNING: Database not found at {_db_sqlite} or {_db_gpkg}")

print(f"Database path: {DATABASE_PATH} (exists={os.path.exists(DATABASE_PATH)})")

def get_db_connection():
    """Establece una conexión a SpatiaLite asegurando WAL y extensión cargada."""
    # check_same_thread=False en sqlite3 permite usar la conexión en async context,
    # aunque con FastAPI y operaciones read-only concurrentes es seguro.
    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    
    # Habilitamos carga de extensiones
    conn.enable_load_extension(True)
    
    # Intentamos cargar mod_spatialite. 
    import glob
    import sys
    
    loaded = False
    
    # 1. Rutas estándar u OS
    try:
        conn.load_extension('mod_spatialite')
        loaded = True
    except sqlite3.OperationalError:
        pass
        
    if not loaded:
        try:
            conn.load_extension('mod_spatialite.dll')
            loaded = True
        except sqlite3.OperationalError:
            pass

    # 2. Búsqueda dinámica en site-packages (fiona/pyogrio) si falla lo anterior
    if not loaded:
        site_packages = [p for p in sys.path if 'site-packages' in p]
        dll_path = None
        for sp in site_packages:
            # Buscar en fiona o pyogrio que traen precompilado
            matches = glob.glob(os.path.join(sp, 'fiona.libs', 'spatialite*.dll')) + \
                      glob.glob(os.path.join(sp, 'pyogrio', 'libs', 'spatialite*.dll'))
            if matches:
                 dll_path = matches[0]
                 break
                 
        if dll_path:
            try:
                if hasattr(os, 'add_dll_directory'):
                    os.add_dll_directory(os.path.dirname(dll_path))
                conn.load_extension(dll_path)
                loaded = True
            except sqlite3.OperationalError as e:
                print(f"Advertencia DB: No se pudo cargar DLL encontrada dinámicamente: {e}")
                
    if not loaded:
        print(f"CRITICAL DB WARNING: No se pudo cargar mod_spatialite. Las consultas ST_* fallarán.")
            
    # Configuración WAL para permitir lecturas no bloqueantes mientras DucksDB/ETL pueda estar escribiendo
    # y optimizar concurrencia en web
    conn.execute('PRAGMA journal_mode=WAL;')
    
    # Retornemos diccionario en lugar de tupla para los registros
    conn.row_factory = sqlite3.Row
    return conn
