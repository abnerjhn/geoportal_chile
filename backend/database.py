import os
import sqlite3

# Database path: use env var if set, otherwise resolve relative to this file
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_default_db = os.path.abspath(os.path.join(BASE_DIR, '..', 'data', 'chile_territorial.sqlite'))
DATABASE_PATH = os.environ.get('DATABASE_PATH', _default_db)

print(f"[DB] Path configured: {DATABASE_PATH}")
print(f"[DB] File exists: {os.path.exists(DATABASE_PATH)}")
if os.path.exists(DATABASE_PATH):
    print(f"[DB] File size: {os.path.getsize(DATABASE_PATH)/1024/1024:.1f} MB")

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
