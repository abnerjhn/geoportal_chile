import json
import os

def inspect_json(path):
    print(f"Inspecting {path}...")
    with open(path, 'r', encoding='utf-8') as f:
        # Some are full geojson, some might be ndjson (one per line)
        try:
            data = json.load(f)
            if 'features' in data and len(data['features']) > 0:
                print("Keys:", data['features'][0]['properties'].keys())
        except:
            f.seek(0)
            line = f.readline()
            try:
                data = json.loads(line)
                if 'properties' in data:
                    print("Keys (NDJSON):", data['properties'].keys())
            except:
                print("Failed to parse.")

inspect_json('data_raw/concesion_minera_CONSTITUIDA.json')
inspect_json('data_raw/concesion_minera_EN_TRAMITE.json')
