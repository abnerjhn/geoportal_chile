import sqlite3
import os

db_path = 'd:/web_D_anctigravity/sig_chile/geoportal_chile/data/chile_v2.sqlite'

def check_db():
    if not os.path.exists(db_path):
        print(f"DB not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    # Load spatialite
    conn.enable_load_extension(True)
    try:
        # Common locations for spatialite extension on Windows/Linux
        conn.load_extension("mod_spatialite")
    except:
        try:
            conn.load_extension("spatialite")
        except:
            print("Could not load spatialite extension")
    
    cursor = conn.cursor()
    
    print("\n--- Columns for concesiones_mineras_const ---")
    try:
        cursor.execute("PRAGMA table_info(concesiones_mineras_const)")
        for row in cursor.fetchall():
            print(row)
    except Exception as e:
        print(f"Error checking table: {e}")

    print("\n--- Checking ST_AsMVT support ---")
    try:
        cursor.execute("SELECT name FROM pragma_function_list WHERE name = 'st_asmvt'")
        res = cursor.fetchone()
        if res:
            print("ST_AsMVT is supported!")
        else:
            # Fallback check by trying to call it
            try:
                cursor.execute("SELECT ST_AsMVT(NULL)")
                print("ST_AsMVT is supported (fallback check)!")
            except Exception as e:
                print(f"ST_AsMVT is NOT supported: {e}")
    except Exception as e:
        print(f"Error checking functions: {e}")

    conn.close()

if __name__ == "__main__":
    check_db()
