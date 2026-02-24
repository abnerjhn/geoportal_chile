import React, { forwardRef, useEffect, useRef, useImperativeHandle, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

// Register the PMTiles protocol once safely
if (!protocolAdded) {
    var protocolAdded = true;
    let protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", (request) => {
        return new Promise((resolve, reject) => {
            const callback = (err, data) => {
                if (err) {
                    console.error("PMTiles Protocol Error:", err, request.url);
                    reject(err);
                } else {
                    resolve({ data });
                }
            };
            protocol.tile(request, callback);
        });
    });
}


const MapComponent = forwardRef(({ onAnalyzePolygon, isAnalyzing, activeLayers, mapStyle, results, onMapReady }, ref) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const draw = useRef(null);
    const [mapLoaded, setMapLoaded] = React.useState(false);

    useImperativeHandle(ref, () => ({
        clearDrawings() {
            if (draw.current) {
                draw.current.deleteAll();
            }
        },
        startDrawing(mode = 'draw_polygon') {
            if (draw.current) {
                // By default we wipe everything to start fresh if they push the button again
                draw.current.deleteAll();
                draw.current.changeMode(mode);
            }
        },
        addFeatures(featureCollection) {
            if (draw.current) {
                draw.current.add(featureCollection);

                // Fit map to new features bounds
                const bounds = new maplibregl.LngLatBounds();
                featureCollection.features.forEach(f => {
                    if (f.geometry.type === 'Point') {
                        bounds.extend(f.geometry.coordinates);
                    } else if (f.geometry.type === 'LineString') {
                        f.geometry.coordinates.forEach(c => bounds.extend(c));
                    } else if (f.geometry.type === 'Polygon') {
                        f.geometry.coordinates[0].forEach(c => bounds.extend(c));
                    } else if (f.geometry.type === 'MultiPolygon') {
                        f.geometry.coordinates.forEach(poly => poly[0].forEach(c => bounds.extend(c)));
                    }
                });

                if (!bounds.isEmpty()) {
                    map.current.fitBounds(bounds, { padding: 50, maxZoom: 14 });
                }
            }
        }
    }));

    useEffect(() => {
        if (map.current) return;
        // ... (rest of the map init code is handled via chunk matching below)

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: {
                version: 8,
                sources: {
                    'carto-dark': {
                        type: 'raster',
                        tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"],
                        tileSize: 256,
                        attribution: '&copy; CartoDB & OpenStreetMap'
                    },
                    'carto-light': {
                        type: 'raster',
                        tiles: ["https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png"],
                        tileSize: 256,
                        attribution: '&copy; CartoDB & OpenStreetMap'
                    },
                    'esri-satellite': {
                        type: 'raster',
                        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
                        tileSize: 256,
                        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                    },
                    'areas_protegidas': {
                        type: 'vector',
                        url: 'pmtiles://data/areas_protegidas.pmtiles'
                    },
                    'sitios_prioritarios': {
                        type: 'vector',
                        url: 'pmtiles://data/sitios_prioritarios.pmtiles'
                    },
                    'ecosistemas': {
                        type: 'vector',
                        url: 'pmtiles://data/ecosistemas.pmtiles'
                    },
                    'terrenos-source': {
                        type: 'geojson',
                        data: {
                            type: 'FeatureCollection',
                            features: []
                        }
                    }
                },
                layers: [
                    {
                        id: 'base-map',
                        type: 'raster',
                        source: 'carto-dark',
                        minzoom: 0,
                        maxzoom: 22,
                        layout: { visibility: mapStyle === 'dark' ? 'visible' : 'none' }
                    },
                    {
                        id: 'base-map-light',
                        type: 'raster',
                        source: 'carto-light',
                        minzoom: 0,
                        maxzoom: 22,
                        layout: { visibility: mapStyle === 'light' ? 'visible' : 'none' }
                    },
                    {
                        id: 'base-map-satellite',
                        type: 'raster',
                        source: 'esri-satellite',
                        minzoom: 0,
                        maxzoom: 22,
                        layout: { visibility: mapStyle === 'satellite' ? 'visible' : 'none' }
                    },
                    {
                        id: 'areas_protegidas-fill',
                        type: 'fill',
                        source: 'areas_protegidas',
                        'source-layer': 'Areas_Protegidas',
                        paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.4 },
                        layout: { visibility: 'none' }
                    },
                    {
                        id: 'areas_protegidas-line',
                        type: 'line',
                        source: 'areas_protegidas',
                        'source-layer': 'Areas_Protegidas',
                        paint: { 'line-color': '#60a5fa', 'line-width': 1 },
                        layout: { visibility: 'none' }
                    },
                    {
                        id: 'sitios_prioritarios-fill',
                        type: 'fill',
                        source: 'sitios_prioritarios',
                        'source-layer': 'sitios_prior_integrados',
                        paint: { 'fill-color': '#a855f7', 'fill-opacity': 0.4 },
                        layout: { visibility: 'none' }
                    },
                    {
                        id: 'sitios_prioritarios-line',
                        type: 'line',
                        source: 'sitios_prioritarios',
                        'source-layer': 'sitios_prior_integrados',
                        paint: { 'line-color': '#c084fc', 'line-width': 1 },
                        layout: { visibility: 'none' }
                    },
                    {
                        id: 'ecosistemas-fill',
                        type: 'fill',
                        source: 'ecosistemas',
                        'source-layer': 'Ecosistemas',
                        paint: { 'fill-color': '#fbbf24', 'fill-opacity': 0.2 },
                        layout: { visibility: 'none' }
                    },

                    {
                        id: 'terrenos-fill',
                        type: 'fill',
                        source: 'terrenos-source',
                        paint: { 'fill-color': '#10b981', 'fill-opacity': 0.4 },
                        layout: { visibility: activeLayers?.terrenos ? 'visible' : 'none' }
                    },
                    {
                        id: 'terrenos-line',
                        type: 'line',
                        source: 'terrenos-source',
                        paint: { 'line-color': '#059669', 'line-width': 2 },
                        layout: { visibility: activeLayers?.terrenos ? 'visible' : 'none' }
                    }
                ]
            },
            center: [-73.0, -42.0], // Initial center Los Lagos
            zoom: 7
        });

        map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

        // Custom draw styles to fix line-dasharray incompatibility with MapLibre
        const drawStyles = [
            // Polygon fill (active)
            { id: 'gl-draw-polygon-fill-active', type: 'fill', filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'true']], paint: { 'fill-color': '#10b981', 'fill-opacity': 0.2 } },
            // Polygon fill (inactive)
            { id: 'gl-draw-polygon-fill-inactive', type: 'fill', filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'false']], paint: { 'fill-color': '#10b981', 'fill-opacity': 0.1 } },
            // Polygon stroke (active)
            { id: 'gl-draw-polygon-stroke-active', type: 'line', filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'true']], paint: { 'line-color': '#10b981', 'line-width': 3 } },
            // Polygon stroke (inactive)
            { id: 'gl-draw-polygon-stroke-inactive', type: 'line', filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'false']], paint: { 'line-color': '#10b981', 'line-width': 2 } },
            // Line (active) - using "literal" for dasharray
            { id: 'gl-draw-line-active', type: 'line', filter: ['all', ['==', '$type', 'LineString'], ['==', 'active', 'true']], paint: { 'line-color': '#10b981', 'line-width': 3, 'line-dasharray': ["literal", [2, 2]] } },
            // Line (inactive)
            { id: 'gl-draw-line-inactive', type: 'line', filter: ['all', ['==', '$type', 'LineString'], ['==', 'active', 'false']], paint: { 'line-color': '#10b981', 'line-width': 2, 'line-dasharray': ["literal", [2, 2]] } },
            // Vertex point (active)
            { id: 'gl-draw-point-active', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex'], ['==', 'active', 'true']], paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-color': '#10b981', 'circle-stroke-width': 2 } },
            // Vertex point (inactive)
            { id: 'gl-draw-point-inactive', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex'], ['==', 'active', 'false']], paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': '#10b981', 'circle-stroke-width': 2 } },
            // Midpoint
            { id: 'gl-draw-polygon-midpoint', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']], paint: { 'circle-radius': 4, 'circle-color': '#10b981' } },
        ];

        draw.current = new MapboxDraw({
            displayControlsDefault: false,
            controls: {},
            defaultMode: 'simple_select',
            styles: drawStyles
        });

        map.current.addControl(draw.current, 'top-right');

        map.current.on('draw.create', handleDrawEvent);
        map.current.on('draw.update', handleDrawEvent);
        map.current.on('draw.delete', () => { onAnalyzePolygon(null) });

        // Mark draw tool as ready immediately — map base + draw loaded
        setMapLoaded(true);
        if (onMapReady) onMapReady();

        // Lazy-load heavy GeoJSON sources AFTER the map and draw tool are ready
        map.current.on('load', () => {
            const geojsonSources = {
                'concesiones': '/static/data/concesiones.json',
                'ecmpo': '/static/data/ecmpo.json',
                'concesiones_mineras_const': '/static/data/concesiones_mineras_const.json',
                'concesiones_mineras_tramite': '/static/data/concesiones_mineras_tramite.json',
                'regiones': '/static/data/regiones_simplified.json',
                'provincias': '/static/data/provincias_simplified.json',
                'comunas': '/static/data/comunas_simplified.json'
            };

            const borderColors = {
                'concesiones': '#0891b2',
                'ecmpo': '#e11d48',
                'concesiones_mineras_const': '#b45309',
                'concesiones_mineras_tramite': '#c2410c',
                'regiones': '#4f46e5',
                'provincias': '#0d9488',
                'comunas': '#ea580c'
            };

            // Add sources and layers dynamically
            Object.entries(geojsonSources).forEach(([id, url]) => {
                if (!map.current.getSource(id)) {
                    map.current.addSource(id, { type: 'geojson', data: url });
                }

                const colorMap = {
                    'concesiones': '#06b6d4',
                    'ecmpo': '#f43f5e',
                    'concesiones_mineras_const': '#d97706',
                    'concesiones_mineras_tramite': '#ea580c',
                    'regiones': '#6366f1',
                    'provincias': '#14b8a6',
                    'comunas': '#f97316'
                };
                const fillColor = colorMap[id] || '#cccccc'; // Default color
                const linePaintColor = borderColors[id] || fillColor;

                // Add fill layer
                if (!map.current.getLayer(`${id}-fill`)) {
                    map.current.addLayer({
                        id: `${id}-fill`,
                        type: 'fill',
                        source: id,
                        paint: { 'fill-color': fillColor, 'fill-opacity': 0.2 },
                        layout: { visibility: activeLayers?.[id] ? 'visible' : 'none' }
                    }, 'terrenos-fill'); // Add before terrenos-fill to keep terrenos on top
                }

                // Add line layer
                if (!map.current.getLayer(`${id}-line`)) {
                    map.current.addLayer({
                        id: `${id}-line`,
                        type: 'line',
                        source: id,
                        paint: { 'line-color': linePaintColor, 'line-width': 1.5 },
                        layout: { visibility: activeLayers?.[id] ? 'visible' : 'none' }
                    }, 'terrenos-fill'); // Add before terrenos-fill
                }
            });
        });

        // Add popups for map features
        const clickableLayers = [
            'areas_protegidas-fill', 'sitios_prioritarios-fill', 'ecosistemas-fill',
            'concesiones-fill', 'ecmpo-fill',
            'concesiones_mineras_const-fill', 'concesiones_mineras_tramite-fill',
            'regiones-fill', 'provincias-fill', 'comunas-fill',
            'terrenos-fill'
        ];

        map.current.on('click', clickableLayers, (e) => {
            // Do not show popup if currently drawing a polygon
            if (draw.current && draw.current.getMode() === 'draw_polygon') {
                return;
            }

            // Ignore double clicks to prevent popups when closing a polygon drawing
            if (e.originalEvent && e.originalEvent.detail > 1) {
                return;
            }

            if (e.features.length > 0) {
                // Determine the topmost feature by the layers array order
                const feature = e.features[0];
                const props = feature.properties;
                let title = "Detalle";

                if (feature.layer.id.includes('areas_protegidas')) {
                    title = "Área Protegida";
                } else if (feature.layer.id.includes('sitios_prioritarios')) {
                    title = "Sitio Prioritario";
                } else if (feature.layer.id.includes('ecosistemas')) {
                    title = "Ecosistema";
                } else if (feature.layer.id.includes('concesiones')) {
                    title = "Concesión de Acuicultura";
                } else if (feature.layer.id.includes('ecmpo')) {
                    title = "ECMPO (Pueblos Originarios)";
                } else if (feature.layer.id.includes('regiones-fill')) {
                    title = "Región";
                } else if (feature.layer.id.includes('provincias-fill')) {
                    title = "Provincia";
                } else if (feature.layer.id.includes('comunas-fill')) {
                    title = "Comuna";
                } else if (feature.layer.id.includes('terrenos-fill')) {
                    title = "Geometría Dibujada/Cargada";
                }

                let propertiesHtml = '<div style="max-height: 200px; overflow-y: auto; font-size: 11px;">';
                propertiesHtml += '<table style="width: 100%; border-collapse: collapse; color: #333;">';

                const importantKeys = ["NombreOrig", "Name", "NOMBRE", "Nombre_SP", "nombre_sp", "Codrnap", "designacio", "REP_SUBPES", "REP_SUBP_1", "REP_SUBP_5", "Región", "Region", "Provincia", "Comuna", "Formacion", "Piso", "area_ha"];

                const sortedKeys = Object.keys(props).sort((a, b) => {
                    const idxA = importantKeys.findIndex(k => k.toLowerCase() === a.toLowerCase());
                    const idxB = importantKeys.findIndex(k => k.toLowerCase() === b.toLowerCase());
                    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                    if (idxA !== -1) return -1;
                    if (idxB !== -1) return 1;
                    return a.localeCompare(b);
                });

                sortedKeys.forEach((key) => {
                    let value = props[key];
                    if (value === undefined || value === null) return;
                    if (typeof value === 'number') {
                        value = new Intl.NumberFormat('es-CL').format(value);
                    }

                    let displayValue = value;
                    if (typeof value === 'string' && value.startsWith('http')) {
                        displayValue = `<a href="${value}" target="_blank" style="color: #2563eb; text-decoration: underline;">Ver Enlace</a>`;
                    }

                    propertiesHtml += `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 2px 4px; font-weight: bold; color: #555;">${key}</td>
                        <td style="padding: 2px 4px;">${displayValue}</td>
                    </tr>
                   `;
                });
                propertiesHtml += '</table></div>';

                new maplibregl.Popup({ maxWidth: '300px' })
                    .setLngLat(e.lngLat)
                    .setHTML(`
                        <div style="font-family: sans-serif; padding: 4px;">
                            <strong style="font-size: 1.1em; color: #1e293b; display:block; margin-bottom:4px;">${title}</strong>
                            ${propertiesHtml}
                        </div>
                    `)
                    .addTo(map.current);
            }
        });

        // Hover Effect Handlers
        map.current.on('mouseenter', clickableLayers, () => {
            map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current.on('mouseleave', clickableLayers, () => {
            map.current.getCanvas().style.cursor = '';
        });

        // Whenever map style completely reloads, we need to add the source back if lost.
        // Wait, standard style updates via setLayoutProperty don't wipe sources, so this is fine.

    }, []); // Empty dependency array means init map only once

    // Sync `results` array to `terrenos-source`
    useEffect(() => {
        if (!map.current) return;

        const syncData = () => {
            const source = map.current.getSource('terrenos-source');
            if (source) {
                const geojson = {
                    type: 'FeatureCollection',
                    features: (results || []).map((r, index) => {
                        // Aggregate geometric intersections just like Sidebar.jsx
                        const sumArea = (featuresArray) => {
                            if (!featuresArray) return 0;
                            return featuresArray.reduce((sum, f) => sum + (f.area_interseccion_ha || 0), 0);
                        };

                        const spArea = sumArea(r.restricciones?.sitios_prioritarios);
                        const apArea = sumArea(r.restricciones?.areas_protegidas);
                        const acuArea = sumArea(r.restricciones?.concesiones_acuicultura);
                        const ecmpoArea = sumArea(r.restricciones?.ecmpo);
                        const miningAreaConst = sumArea(r.restricciones?.concesiones_mineras_const);
                        const miningAreaTramite = sumArea(r.restricciones?.concesiones_mineras_tramite);
                        const totalArea = r.area_total_ha || 0;

                        const restrictionsAreaSum = Math.min(totalArea, spArea + apArea + acuArea + ecmpoArea + miningAreaConst + miningAreaTramite);
                        const hasRestrictionsFlag = restrictionsAreaSum > 0;
                        const percentRestricted = totalArea > 0 ? (restrictionsAreaSum / totalArea) * 100 : 0;

                        return {
                            ...(r.originalFeature || {}), // Prevent crash if missing
                            id: r.id || `terreno-${index}`, // FORCE UNIQUE ID
                            properties: {
                                ...(r.originalFeature?.properties || {}),
                                Nombre: r.featureName,
                                'Región': r.dpa?.Region?.join(', ') || 'N/A',
                                'Provincia': r.dpa?.Provincia?.join(', ') || 'N/A',
                                'Comuna': r.dpa?.Comuna?.join(', ') || 'N/A',
                                'Área Total (ha)': Math.round(totalArea * 100) / 100,
                                'Restricciones': hasRestrictionsFlag ? 'Sí' : 'No',
                                'Área Restringida (ha)': Math.round(restrictionsAreaSum * 100) / 100,
                                'Capa': 'Terrenos Analizados',
                                'Con Restricción (%)': `${Math.round(percentRestricted * 10) / 10}%`
                            }
                        };
                    })
                };
                source.setData(geojson);
            }
        };

        if (map.current.getSource('terrenos-source')) {
            syncData();
        } else {
            // If the source isn't ready yet (e.g., initial map load phase), wait until idle
            map.current.once('idle', syncData);
        }
    }, [results]);

    const handleDrawEvent = useCallback((e) => {
        const data = draw.current.getAll();
        if (data.features.length > 0) {
            // Only analyze the most recently created or updated feature
            // We NO LONGER delete the previous features, allowing them to accumulate.
            let feature = null;
            if (e.features && e.features.length > 0) {
                feature = e.features[0];
            } else {
                feature = data.features[data.features.length - 1];
            }
            onAnalyzePolygon(feature);
        } else {
            onAnalyzePolygon(null);
        }
    }, [onAnalyzePolygon]);

    // Handle Layer Visibility Toggles
    useEffect(() => {
        if (!map.current) return;
        ['areas_protegidas', 'sitios_prioritarios', 'ecosistemas', 'concesiones', 'ecmpo', 'concesiones_mineras_const', 'concesiones_mineras_tramite', 'terrenos', 'regiones', 'provincias', 'comunas'].forEach(layer => {
            const visibility = activeLayers[layer] ? 'visible' : 'none';
            if (map.current.getLayer(`${layer}-fill`)) {
                map.current.setLayoutProperty(`${layer}-fill`, 'visibility', visibility);
                // Handle optional line layer 
                if (map.current.getLayer(`${layer}-line`)) {
                    map.current.setLayoutProperty(`${layer}-line`, 'visibility', visibility);
                }
            }
        });

        // Hide or show mapbox draw layers based on 'terrenos' state
        const style = map.current.getStyle();
        if (style && style.layers) {
            const drawVisibility = activeLayers.terrenos ? 'visible' : 'none';
            style.layers.forEach(l => {
                if (l.id.includes('gl-draw')) {
                    map.current.setLayoutProperty(l.id, 'visibility', drawVisibility);
                }
            });
        }
    }, [activeLayers]);

    // Handle Map Style (Base Map) Toggle
    useEffect(() => {
        if (!map.current || !map.current.getStyle()) return;

        if (map.current.getLayer('base-map')) {
            map.current.setLayoutProperty('base-map', 'visibility', mapStyle === 'dark' ? 'visible' : 'none');
        }
        if (map.current.getLayer('base-map-light')) {
            map.current.setLayoutProperty('base-map-light', 'visibility', mapStyle === 'light' ? 'visible' : 'none');
        }
        if (map.current.getLayer('base-map-satellite')) {
            map.current.setLayoutProperty('base-map-satellite', 'visibility', mapStyle === 'satellite' ? 'visible' : 'none');
        }
    }, [mapStyle]);

    return (
        <div className="relative w-full h-full">
            <div ref={mapContainer} className="w-full h-full" />
            {isAnalyzing && (
                <div className="absolute inset-0 bg-black/50 z-[1000] flex items-center justify-center">
                    <div className="bg-slate-900 text-white px-6 py-4 rounded-lg shadow-xl flex items-center gap-4 border border-slate-700">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                        <span className="font-medium">Analizando intersecciones espaciales...</span>
                    </div>
                </div>
            )}
        </div>
    );
});

export default MapComponent;
