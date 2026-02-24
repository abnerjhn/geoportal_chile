import geopandas as gpd
import os

input_path = 'd:/web_D_anctigravity/sig_chile/geoportal_chile/data_raw/Ecosistemas_multipart.json'
output_path = 'd:/web_D_anctigravity/sig_chile/geoportal_chile/data_raw/Ecosistemas_simplified.json'

print(f"Loading {input_path}...")
gdf = gpd.read_file(input_path)
print(f"Loaded {len(gdf)} features.")

# Mantener solo columnas necesarias

# Mantener solo columnas necesarias
gdf.columns = [c.lower() for c in gdf.columns]
cols_to_keep = ['codigo', 'piso', 'formacion', 'geometry']
gdf = gdf[cols_to_keep]

print("Repairing geometries...")
gdf.geometry = gdf.geometry.buffer(0)

print(f"Saving to {output_path}...")
gdf.to_file(output_path, driver='GeoJSON')

print("Done.")
