import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend
} from 'chart.js';
import { Layers, PenTool, Map as MapIcon, MapPin, Spline, Hexagon, Upload, Download } from 'lucide-react';
import LogoImage from '../assets/Logo.png';

ChartJS.register(ArcElement, Tooltip, Legend);

const Sidebar = ({ isAnalyzing, results, showResultsPanel, setShowResultsPanel, error, onReset, onStartDrawing, activeDrawMode, onFileUpload, activeLayers, onToggleLayer, mapStyle, setMapStyle, onClearHistory }) => {

    const [formationsMap, setFormationsMap] = React.useState({});
    const [expandedFormations, setExpandedFormations] = React.useState({});
    const [expandedFeatureIdx, setExpandedFeatureIdx] = React.useState(0);

    React.useEffect(() => {
        if (results && results.length > 0) {
            setExpandedFeatureIdx(results.length - 1);
        }
    }, [results?.length]);

    React.useEffect(() => {
        fetch('data/formations.json')
            .then(res => { if (!res.ok) return []; return res.json(); })
            .then(data => {
                const fMap = {};
                if (Array.isArray(data)) data.forEach(item => { fMap[item.codigo] = item; });
                setFormationsMap(fMap);
            })
            .catch(err => console.warn("formations.json not available:", err));
    }, []);

    const layerNames = {
        areas_protegidas: "Áreas Protegidas",
        sitios_prioritarios: "Sitios Prioritarios",
        ecosistemas: "Ecosistemas",
        concesiones: "Concesiones Acuicultura",
        ecmpo: "ECMPO (Pueblos Originarios)",
        terrenos: "Terrenos Analizados",
        regiones: "Límites Regionales",
        provincias: "Límites Provinciales",
        comunas: "Límites Comunales",
        concesiones_mineras_const: "Catastro Minero Constituidas",
        concesiones_mineras_tramite: "Catastro Minero en Trámite"
    };

    const layerColors = {
        areas_protegidas: "bg-blue-500",
        sitios_prioritarios: "bg-purple-500",
        ecosistemas: "bg-amber-500",
        concesiones: "bg-cyan-500",
        ecmpo: "bg-rose-500",
        terrenos: "bg-emerald-500",
        regiones: "bg-indigo-500",
        provincias: "bg-teal-500",
        comunas: "bg-orange-500",
        concesiones_mineras_const: "bg-amber-600",
        concesiones_mineras_tramite: "bg-orange-600"
    };

    const [showDownloadMenu, setShowDownloadMenu] = React.useState(false);

    const handleDownloadData = (format) => {
        if (!results || results.length === 0) return;

        const sumArea = (featuresArray) => {
            if (!featuresArray) return 0;
            return featuresArray.reduce((sum, f) => sum + (f.area_interseccion_ha || 0), 0);
        };

        const enrichedFeatures = results.map(r => {
            const spArea = sumArea(r.restricciones?.sitios_prioritarios);
            const apArea = sumArea(r.restricciones?.areas_protegidas);
            const acuArea = sumArea(r.restricciones?.concesiones_acuicultura);
            const ecmpoArea = sumArea(r.restricciones?.ecmpo);
            const totalArea = r.area_total_ha || 0;
            const restrictionsAreaSum = Math.min(totalArea, spArea + apArea + acuArea + ecmpoArea);
            const hasRestrictionsFlag = restrictionsAreaSum > 0;
            const percentRestricted = totalArea > 0 ? (restrictionsAreaSum / totalArea) * 100 : 0;

            return {
                ...(r.originalFeature || {}),
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
        });

        if (format === 'json') {
            const geojson = { type: "FeatureCollection", features: enrichedFeatures };
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(geojson));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "terrenos_analizados.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        } else if (format === 'csv') {
            if (enrichedFeatures.length === 0) return;
            const headers = Object.keys(enrichedFeatures[0].properties);
            const csvRows = [];
            csvRows.push(headers.join(','));
            for (const row of enrichedFeatures) {
                const values = headers.map(header => {
                    const val = row.properties[header];
                    const escaped = ('' + val).replace(/"/g, '""');
                    return `"${escaped}"`;
                });
                csvRows.push(values.join(','));
            }
            const dataStr = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csvRows.join('\n'));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "terrenos_analizados.csv");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        }
        setShowDownloadMenu(false);
    };

    const renderControls = () => (
        <div className="mb-8 flex flex-col gap-6">
            {/* HERRAMIENTAS - Moved to Top without Title */}
            <div>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed bg-slate-800/30 p-2.5 rounded border border-slate-800/80">
                    💡 Sube el polígono de tu terreno en un archivo espacial (.geojson, .kml, shapefiles en .zip) o dibújalo. Haz <strong>doble clic</strong> para terminar el dibujo.
                </p>

                <div className="grid grid-cols-2 gap-2 mb-4">
                    <button
                        onClick={() => onStartDrawing('draw_polygon')}
                        className={`${activeDrawMode === 'draw_polygon' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20 border-emerald-500' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-emerald-600/50 hover:text-white hover:border-emerald-500'} font-medium py-3 px-2 rounded-lg transition-colors flex flex-col items-center justify-center gap-1 border group`}
                        title="Dibujar Polígono"
                    >
                        <Hexagon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] uppercase tracking-wider font-semibold">Dibujar</span>
                    </button>

                    <div className="relative">
                        <input type="file" id="file-upload" className="hidden" accept=".geojson,.json,.kml,.zip" onChange={onFileUpload} />
                        <label htmlFor="file-upload" className="w-full h-full bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white cursor-pointer font-medium py-3 px-2 rounded-lg transition-colors flex flex-col items-center justify-center gap-1 border border-slate-700 hover:border-blue-500 group">
                            <Upload className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-center leading-tight">Subir Archivo<br />Espacial</span>
                        </label>
                    </div>
                </div>
            </div>

            {/* TERRENOS ANALIZADOS (MOVED TO TOP) */}
            <div className="bg-slate-800/40 border border-slate-700/80 rounded-lg p-3 shadow-sm">
                <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center">
                        <input
                            type="checkbox"
                            className="sr-only"
                            checked={activeLayers['terrenos']}
                            onChange={() => onToggleLayer('terrenos')}
                        />
                        <div className={`w-10 h-6 rounded-full transition-colors flex items-center ${activeLayers['terrenos'] ? 'bg-emerald-600' : 'bg-slate-700'}`}>
                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${activeLayers['terrenos'] ? 'translate-x-5' : 'translate-x-1'}`} />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-sm ${layerColors['terrenos']} shadow-sm`}></div>
                        <span className="text-emerald-400 text-sm font-semibold tracking-wide uppercase transition-colors">Terrenos Analizados</span>
                    </div>
                </label>

                {activeLayers.terrenos && results?.length > 0 && (
                    <div className="mt-3 flex flex-col gap-3">
                        <div className="flex flex-col gap-1 bg-slate-900/60 p-2 rounded border border-slate-700/50 max-h-32 overflow-y-auto">
                            {results.map((r, i) => (
                                <div key={i} className="text-xs text-slate-400 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 flex-shrink-0"></span>
                                    <span className="truncate" title={r.featureName}>{r.featureName}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2 relative">
                            <button
                                onClick={() => setShowResultsPanel(true)}
                                className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 py-1.5 px-2 text-xs font-semibold rounded transition-colors flex justify-center items-center gap-1 border border-emerald-500/30 shadow-sm"
                                title="Ver Resultados"
                            >
                                Ver Resultados
                            </button>
                            <div className="relative">
                                <button
                                    onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                                    className="bg-slate-700 hover:bg-slate-600 text-slate-200 py-1.5 px-3 h-full text-xs font-semibold rounded transition-colors flex justify-center items-center gap-1 border border-slate-600 shadow-sm"
                                    title="Descargar Datos"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                </button>
                                {showDownloadMenu && (
                                    <div className="absolute right-0 top-full mt-1 w-32 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 flex flex-col py-1 overflow-hidden">
                                        <button
                                            onClick={() => handleDownloadData('json')}
                                            className="text-left px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                                        >
                                            JSON (Espacial)
                                        </button>
                                        <button
                                            onClick={() => handleDownloadData('csv')}
                                            className="text-left px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                                        >
                                            CSV (Tabla)
                                        </button>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={onClearHistory}
                                className="bg-red-900/30 hover:bg-red-900/60 text-red-500 py-1.5 px-3 text-xs font-semibold rounded transition-colors flex justify-center items-center gap-1 border border-red-900/50 shadow-sm"
                                title="Limpiar Todo el Mapa"
                            >
                                🗑️
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* MAPA BASE */}
            <div>
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
                    <MapIcon className="w-5 h-5 text-slate-400" /> MAPA BASE
                </h3>
                <div className="flex bg-slate-800 p-1 rounded-lg">
                    <button
                        onClick={() => setMapStyle && setMapStyle('dark')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${mapStyle === 'dark' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        Oscuro
                    </button>
                    <button
                        onClick={() => setMapStyle && setMapStyle('light')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${mapStyle === 'light' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        Claro
                    </button>
                    <button
                        onClick={() => setMapStyle && setMapStyle('satellite')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${mapStyle === 'satellite' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        Satélite
                    </button>
                </div>
            </div>

            {/* CAPAS */}
            <div>
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-slate-400" /> CAPAS DE REFERENCIA
                </h3>
                <div className="space-y-3">
                    {['areas_protegidas', 'sitios_prioritarios', 'ecosistemas', 'concesiones', 'ecmpo', 'concesiones_mineras_const', 'concesiones_mineras_tramite', 'regiones', 'provincias', 'comunas'].map((layerId) => (
                        <div key={layerId} className="flex flex-col gap-1">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative flex items-center">
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={activeLayers[layerId]}
                                        onChange={() => onToggleLayer(layerId)}
                                    />
                                    <div className={`w-10 h-6 rounded-full transition-colors flex items-center ${activeLayers[layerId] ? 'bg-blue-600' : 'bg-slate-700'}`}>
                                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${activeLayers[layerId] ? 'translate-x-5' : 'translate-x-1'}`} />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className={`w-3 h-3 rounded-sm ${layerColors[layerId]} shadow-sm`}></div>
                                    <span className="text-slate-300 text-sm group-hover:text-white transition-colors">{layerNames[layerId]}</span>
                                </div>
                            </label>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    // Initial State (Or if showResultsPanel is toggled off)
    if (!isAnalyzing && !showResultsPanel && !error) {
        return (
            <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 p-6 text-slate-200 overflow-y-auto">
                <header className="mb-8 flex flex-col items-center justify-center text-center">
                    <img src={LogoImage} alt="Logo" className="h-16 w-auto mb-4 opacity-100" />
                    <h1 className="text-2xl font-bold text-white tracking-tight">Analizador de Restricciones</h1>
                    <p className="text-slate-400 text-sm mt-1">Sitios Prioritarios - Ley 21.600 y otras restricciones</p>
                </header>

                {renderControls()}
            </div>
        );
    }

    // Error State
    if (error) {
        return (
            <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 p-6 text-slate-200">
                <header className="mb-6 flex flex-col items-center justify-center text-center">
                    <img src={LogoImage} alt="Logo" className="h-12 w-auto mb-2 opacity-100" />
                    <h1 className="text-xl font-bold text-white tracking-tight">Analizador de Restricciones</h1>
                </header>
                <div className="bg-red-900/30 border border-red-800/50 rounded-lg p-5 mb-4">
                    <p className="text-red-400 font-medium">{error}</p>
                </div>
                <button
                    onClick={onReset}
                    className="mt-4 w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 px-4 rounded-lg transition-colors border border-slate-700"
                >
                    Volver Atrás
                </button>
            </div>
        );
    }

    if (isAnalyzing) {
        return (
            <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 p-6 text-slate-200 items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                <p className="text-slate-300">Consultando bases de datos espaciales...</p>
            </div>
        )
    }

    // Results State
    if (showResultsPanel && results && Array.isArray(results) && results.length > 0) {

        // Utilities
        const formatNumber = (num, decimals = 2) => {
            if (num === undefined || num === null) return "0";
            return new Intl.NumberFormat('es-CL', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            }).format(num);
        };

        const toggleFormation = (formacion) => {
            setExpandedFormations(prev => ({
                ...prev,
                [formacion]: !prev[formacion]
            }));
        };

        const sumArea = (features) => {
            if (!features) return 0;
            return features.reduce((sum, f) => sum + (f.area_interseccion_ha || 0), 0);
        };

        return (
            <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 text-slate-200 w-full">
                <div className="p-6 flex-1 overflow-y-auto">
                    <header className="mb-6 flex justify-between items-center border-b border-slate-800 pb-4">
                        <h2 className="text-xl font-bold text-white tracking-tight">Geometrías ({results.length})</h2>
                        <button onClick={onReset} className="text-slate-400 hover:text-white p-2">✕</button>
                    </header>

                    <div className="space-y-4 mb-4">
                        {results.map((resItem, idx) => {
                            const isExpanded = expandedFeatureIdx === idx;

                            const spArea = sumArea(resItem.restricciones?.sitios_prioritarios);
                            const apArea = sumArea(resItem.restricciones?.areas_protegidas);
                            const acuArea = sumArea(resItem.restricciones?.concesiones_acuicultura);
                            const ecmpoArea = sumArea(resItem.restricciones?.ecmpo);
                            const miningAreaConst = sumArea(resItem.restricciones?.concesiones_mineras_const);
                            const miningAreaTramite = sumArea(resItem.restricciones?.concesiones_mineras_tramite);
                            const totalArea = resItem.area_total_ha || 0;

                            const restrictionsAreaSum = Math.min(totalArea, spArea + apArea + acuArea + ecmpoArea + miningAreaConst + miningAreaTramite);
                            const freeArea = Math.max(0, totalArea - restrictionsAreaSum);

                            const chartLabels = [];
                            const chartData = [];
                            const bgColors = [];

                            if (spArea > 0) {
                                chartLabels.push("S. Prioritarios");
                                chartData.push(Number(spArea.toFixed(2)));
                                bgColors.push('#a855f7');
                            }
                            if (apArea > 0) {
                                chartLabels.push("A. Protegidas");
                                chartData.push(Number(apArea.toFixed(2)));
                                bgColors.push('#3b82f6');
                            }
                            if (acuArea > 0) {
                                chartLabels.push("C. Acuicultura");
                                chartData.push(Number(acuArea.toFixed(2)));
                                bgColors.push('#06b6d4'); // cyan-500
                            }
                            if (ecmpoArea > 0) {
                                chartLabels.push("ECMPO");
                                chartData.push(Number(ecmpoArea.toFixed(2)));
                                bgColors.push('#f43f5e'); // rose-500
                            }
                            if (miningAreaConst > 0) {
                                chartLabels.push("C.M. Constituidas");
                                chartData.push(Number(miningAreaConst.toFixed(2)));
                                bgColors.push('#d97706'); // amber-600
                            }
                            if (miningAreaTramite > 0) {
                                chartLabels.push("C.M. en Trámite");
                                chartData.push(Number(miningAreaTramite.toFixed(2)));
                                bgColors.push('#ea580c'); // orange-600
                            }

                            if (freeArea > 0 || chartData.length === 0) {
                                chartLabels.push("Sin Restricciones");
                                chartData.push(Number(freeArea > 0 ? freeArea.toFixed(2) : totalArea.toFixed(2) || 1));
                                bgColors.push('#10b981');
                            }

                            const data = {
                                labels: chartLabels,
                                datasets: [{ data: chartData, backgroundColor: bgColors, borderWidth: 1, borderColor: '#0f172a' }]
                            };

                            const hasRestrictionsFlag =
                                resItem.restricciones?.sitios_prioritarios?.length > 0 ||
                                resItem.restricciones?.areas_protegidas?.length > 0 ||
                                resItem.restricciones?.concesiones_acuicultura?.length > 0 ||
                                resItem.restricciones?.ecmpo?.length > 0 ||
                                resItem.restricciones?.concesiones_mineras_const?.length > 0 ||
                                resItem.restricciones?.concesiones_mineras_tramite?.length > 0;

                            return (
                                <div key={idx} className="border border-slate-700/50 rounded-lg overflow-hidden bg-slate-800/30">
                                    <button
                                        onClick={() => setExpandedFeatureIdx(isExpanded ? -1 : idx)}
                                        className="w-full text-left bg-slate-800 hover:bg-slate-700 p-4 flex justify-between items-center transition-colors"
                                    >
                                        <div className="flex flex-col">
                                            <span className="block text-sm font-semibold text-white">{resItem.featureName}</span>
                                            <span className="block text-xs text-slate-400 mt-1">{formatNumber(totalArea)} ha • {hasRestrictionsFlag ? `Con Restricciones (${formatNumber(totalArea > 0 ? (restrictionsAreaSum / totalArea) * 100 : 0, 1)}%)` : 'Sin Restricciones'}</span>
                                        </div>
                                        <span className={`text-slate-400 text-lg transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                                    </button>

                                    {isExpanded && (
                                        <div className="p-4 border-t border-slate-700/50">
                                            <div className="bg-slate-900/50 rounded-xl p-4 mb-4 border border-slate-700/50 flex flex-col items-start gap-1">
                                                <span className="text-sm text-slate-400 block mb-1">Área Calculada</span>
                                                <strong className="text-3xl text-white font-light">{formatNumber(totalArea)} <span className="text-lg text-slate-500 font-normal">ha</span></strong>
                                            </div>

                                            {/* Ubicación DPA */}
                                            {resItem.dpa && (resItem.dpa.Region?.length > 0 || resItem.dpa.Provincia?.length > 0 || resItem.dpa.Comuna?.length > 0) && (
                                                <div className="bg-slate-900/50 rounded-xl p-4 mb-5 border border-slate-700/50 flex flex-col gap-2">
                                                    <span className="text-sm text-slate-400 block mb-1 flex items-center gap-2"><MapPin className="w-4 h-4" /> Ubicación Administrativa</span>
                                                    {resItem.dpa.Region?.length > 0 && <span className="text-xs text-slate-300"><strong>Región:</strong> {resItem.dpa.Region.join(', ')}</span>}
                                                    {resItem.dpa.Provincia?.length > 0 && <span className="text-xs text-slate-300"><strong>Provincia:</strong> {resItem.dpa.Provincia.join(', ')}</span>}
                                                    {resItem.dpa.Comuna?.length > 0 && <span className="text-xs text-slate-300"><strong>Comuna:</strong> {resItem.dpa.Comuna.join(', ')}</span>}
                                                </div>
                                            )}

                                            <div className="mb-6 h-[200px] w-full flex justify-center bg-slate-950/30 rounded-lg p-2 border border-slate-800/50">
                                                <Doughnut
                                                    data={data}
                                                    options={{
                                                        maintainAspectRatio: false,
                                                        cutout: '70%',
                                                        plugins: {
                                                            legend: { position: 'right', labels: { color: '#cbd5e1', padding: 10, font: { size: 10 } } },
                                                            tooltip: {
                                                                callbacks: {
                                                                    label: function (context) {
                                                                        const label = context.label || '';
                                                                        const value = context.raw;
                                                                        const chartTotal = context.chart._metasets[context.datasetIndex].total || chartData.reduce((a, b) => a + b, 0);
                                                                        const percentage = chartTotal > 0 ? ((value / chartTotal) * 100) : 0;
                                                                        return `${label}: ${formatNumber(value)} ha (${formatNumber(percentage, 1)}%)`;
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }}
                                                />
                                            </div>

                                            <div className="space-y-4 mb-2">
                                                {!hasRestrictionsFlag && (
                                                    <div className="bg-emerald-900/20 border border-emerald-800/30 p-3 rounded-lg flex gap-3 items-center">
                                                        <span className="text-lg">✅</span>
                                                        <span className="text-emerald-400 text-xs">Sin restricciones normativas.</span>
                                                    </div>
                                                )}
                                                {resItem.restricciones?.sitios_prioritarios?.length > 0 && (
                                                    <div className="bg-purple-900/20 border border-purple-800/30 p-4 rounded-lg flex flex-col gap-2">
                                                        <div className="flex gap-3 items-center">
                                                            <span className="text-xl">⚠️</span>
                                                            <span className="text-purple-400 text-sm font-medium">Intersecta con {resItem.restricciones.sitios_prioritarios.length} Sitio(s) Prioritario(s)</span>
                                                        </div>
                                                        {resItem.restricciones.sitios_prioritarios.map((sp, i) => (
                                                            <div key={i} className="text-xs text-slate-400 bg-slate-950/50 p-2 rounded mt-1 border border-slate-800/50">
                                                                <span className="block font-semibold text-slate-300 mb-1">{sp.nombre_sp || sp.NombreOrig || "Sitio Prioritario"}</span>
                                                                <span className="block text-slate-500">ID: {sp.name || "No ID"}</span>
                                                                <span className="block text-purple-300 mt-1">Afectación: {formatNumber(sp.area_interseccion_ha)} ha ({formatNumber(totalArea > 0 ? ((sp.area_interseccion_ha || 0) / totalArea) * 100 : 0, 1)}%)</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {resItem.restricciones?.areas_protegidas?.length > 0 && (
                                                    <div className="bg-blue-900/20 border border-blue-800/30 p-4 rounded-lg flex flex-col gap-2">
                                                        <div className="flex gap-3 items-center">
                                                            <span className="text-xl">🛡️</span>
                                                            <span className="text-blue-400 text-sm font-medium">Superposición con {resItem.restricciones.areas_protegidas.length} Área(s) Protegida(s)</span>
                                                        </div>
                                                        {resItem.restricciones.areas_protegidas.map((ap, i) => (
                                                            <div key={i} className="text-xs text-slate-400 bg-slate-950/50 p-2 rounded mt-1 border border-slate-800/50">
                                                                <span className="block font-semibold text-slate-300 mb-1">{ap.nombreorig || ap.NombreOrig || "Área Protegida"}</span>
                                                                <span className="block text-slate-500">🏷️ Tipo: {ap.designacio || ap.designacion || 'No Definido'}</span>
                                                                <span className="block text-blue-300 mt-1">Afectación: {formatNumber(ap.area_interseccion_ha)} ha ({formatNumber(totalArea > 0 ? ((ap.area_interseccion_ha || 0) / totalArea) * 100 : 0, 1)}%)</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {resItem.restricciones?.concesiones_acuicultura?.length > 0 && (
                                                    <div className="bg-cyan-900/20 border border-cyan-800/30 p-4 rounded-lg flex flex-col gap-2">
                                                        <div className="flex gap-3 items-center">
                                                            <span className="text-xl">🐟</span>
                                                            <span className="text-cyan-400 text-sm font-medium">Intersección con {resItem.restricciones.concesiones_acuicultura.length} Concesión(es) de Acuicultura</span>
                                                        </div>
                                                        {resItem.restricciones.concesiones_acuicultura.map((ca, i) => (
                                                            <div key={i} className="text-xs text-slate-400 bg-slate-950/50 p-2 rounded mt-1 border border-slate-800/50">
                                                                <span className="block font-semibold text-slate-300 mb-1">{ca.REP_SUBPES || ca.rep_subpes || "Concesión de Acuicultura"}</span>
                                                                <span className="block text-slate-500">📜 Estado: {ca.REP_SUBP_5 || ca.rep_subp_5 || 'No Definido'}</span>
                                                                <span className="block text-cyan-300 mt-1">Afectación: {formatNumber(ca.area_interseccion_ha)} ha ({formatNumber(totalArea > 0 ? ((ca.area_interseccion_ha || 0) / totalArea) * 100 : 0, 1)}%)</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {resItem.restricciones?.ecmpo?.length > 0 && (
                                                    <div className="bg-rose-900/20 border border-rose-800/30 p-4 rounded-lg flex flex-col gap-2">
                                                        <div className="flex gap-3 items-center">
                                                            <span className="text-xl">🏛️</span>
                                                            <span className="text-rose-400 text-sm font-medium">Intersección con {resItem.restricciones.ecmpo.length} ECMPO</span>
                                                        </div>
                                                        {resItem.restricciones.ecmpo.map((ec, i) => (
                                                            <div key={i} className="text-xs text-slate-400 bg-slate-950/50 p-2 rounded mt-1 border border-slate-800/50">
                                                                <span className="block font-semibold text-slate-300 mb-1">{ec.REP_SUBPES || ec.rep_subpes || "ECMPO"}</span>
                                                                <span className="block text-slate-500">🏘️ Organización: {ec.REP_SUBP_1 || ec.rep_subp_1 || 'No Definida'}</span>
                                                                <span className="block text-rose-300 mt-1">Afectación: {formatNumber(ec.area_interseccion_ha)} ha ({formatNumber(totalArea > 0 ? ((ec.area_interseccion_ha || 0) / totalArea) * 100 : 0, 1)}%)</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {resItem.restricciones?.concesiones_mineras_const?.length > 0 && (
                                                    <div className="bg-amber-900/20 border border-amber-800/30 p-4 rounded-lg flex flex-col gap-2">
                                                        <div className="flex gap-3 items-center">
                                                            <span className="text-xl">⛏️</span>
                                                            <span className="text-amber-500 text-sm font-medium">Inters. con {resItem.restricciones.concesiones_mineras_const.length} Conc. Minera(s) Constituidas</span>
                                                        </div>
                                                        {resItem.restricciones.concesiones_mineras_const.map((cm, i) => (
                                                            <div key={i} className="text-xs text-slate-400 bg-slate-950/50 p-2 rounded mt-1 border border-slate-800/50">
                                                                <span className="block font-semibold text-slate-300 mb-1">{cm.NOMBRE || cm.nombre || "Concesión Minera"}</span>
                                                                <span className="block text-slate-500">📊 Situación: {cm.SITUACION || 'Constituida'} • Tipo: {cm.TIPO_CONCE || 'N/A'}</span>
                                                                <span className="block text-slate-500 italic">👤 Titular: {cm.TITULAR_NO || 'No Definido'}</span>
                                                                <span className="block text-amber-300 mt-1">Afectación: {formatNumber(cm.area_interseccion_ha)} ha ({formatNumber(totalArea > 0 ? ((cm.area_interseccion_ha || 0) / totalArea) * 100 : 0, 1)}%)</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {resItem.restricciones?.concesiones_mineras_tramite?.length > 0 && (
                                                    <div className="bg-orange-900/20 border border-orange-800/30 p-4 rounded-lg flex flex-col gap-2">
                                                        <div className="flex gap-3 items-center">
                                                            <span className="text-xl">🛠️</span>
                                                            <span className="text-orange-500 text-sm font-medium">Inters. con {resItem.restricciones.concesiones_mineras_tramite.length} Conc. Minera(s) en Trámite</span>
                                                        </div>
                                                        {resItem.restricciones.concesiones_mineras_tramite.map((cm, i) => (
                                                            <div key={i} className="text-xs text-slate-400 bg-slate-950/50 p-2 rounded mt-1 border border-slate-800/50">
                                                                <span className="block font-semibold text-slate-300 mb-1">{cm.NOMBRE || cm.nombre || "Concesión Minera"}</span>
                                                                <span className="block text-slate-500">⏳ Situación: {cm.SITUACION || 'En Trámite'} • Tipo: {cm.TIPO_CONCE || 'N/A'}</span>
                                                                <span className="block text-slate-500 italic">👤 Titular: {cm.TITULAR_NO || 'No Definido'}</span>
                                                                <span className="block text-orange-300 mt-1">Afectación: {formatNumber(cm.area_interseccion_ha)} ha ({formatNumber(totalArea > 0 ? ((cm.area_interseccion_ha || 0) / totalArea) * 100 : 0, 1)}%)</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {resItem.restricciones?.ecosistemas?.length > 0 && (() => {
                                                    const ecoGroups = {};
                                                    let totalEcosistemasUnique = 0;

                                                    resItem.restricciones.ecosistemas.forEach(eco => {
                                                        const meta = formationsMap[eco.codigo] || {};
                                                        const formName = eco.Formacion || eco.formacion || meta.formacion || "Desconocida";
                                                        const pisoName = eco.PISO || eco.Piso || eco.piso || meta.piso || "Desconocido";
                                                        const codigo = eco.codigo || "Sin Código";

                                                        if (!ecoGroups[formName]) ecoGroups[formName] = { list: [], totalHa: 0 };

                                                        const existingIdx = ecoGroups[formName].list.findIndex(item => item.pisoName === pisoName && item.codigo === codigo);

                                                        if (existingIdx !== -1) {
                                                            ecoGroups[formName].list[existingIdx].area_interseccion_ha += (eco.area_interseccion_ha || 0);
                                                        } else {
                                                            ecoGroups[formName].list.push({ ...eco, meta, pisoName, codigo, area_interseccion_ha: eco.area_interseccion_ha || 0 });
                                                            totalEcosistemasUnique++;
                                                        }

                                                        ecoGroups[formName].totalHa += (eco.area_interseccion_ha || 0);
                                                    });

                                                    return (
                                                        <div className="bg-amber-900/20 border border-amber-800/30 p-4 rounded-lg flex flex-col gap-2">
                                                            <div className="flex gap-3 items-center mb-2">
                                                                <span className="text-xl">🌲</span>
                                                                <span className="text-amber-400 text-sm font-medium">Intersecta con {totalEcosistemasUnique} Ecosistema(s)</span>
                                                            </div>
                                                            {Object.entries(ecoGroups).map(([formacion, group], eIdx) => {
                                                                // Combine array idx and formation to get a unique key for the expandedFormations map
                                                                const mapIdx = `${idx}-${formacion}`;
                                                                const isExpanded = expandedFormations[mapIdx];
                                                                return (
                                                                    <div key={eIdx} className="border border-slate-700/50 rounded overflow-hidden">
                                                                        <button
                                                                            onClick={() => toggleFormation(mapIdx)}
                                                                            className="w-full text-left bg-slate-800/80 hover:bg-slate-700/80 p-3 flex justify-between items-center transition-colors"
                                                                        >
                                                                            <div>
                                                                                <span className="block text-sm font-semibold text-slate-200">{formacion}</span>
                                                                                <span className="block text-xs text-amber-300/80 mt-1">Afectación total: {formatNumber(group.totalHa)} ha ({formatNumber(totalArea > 0 ? (group.totalHa / totalArea) * 100 : 0, 1)}%)</span>
                                                                            </div>
                                                                            <span className={`text-slate-400 text-lg transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                                                                        </button>
                                                                        {isExpanded && (
                                                                            <div className="bg-slate-900/50 p-2 border-t border-slate-700/50 flex flex-col gap-1">
                                                                                {group.list.map((eco, i) => (
                                                                                    <div key={i} className="text-xs text-slate-400 bg-slate-950/70 p-2 rounded border border-slate-800/30 pl-4 border-l-2 border-l-amber-500/50">
                                                                                        <span className="block text-slate-300 mb-1">Piso: {eco.pisoName}</span>
                                                                                        {eco.codigo !== "Sin Código" && <span className="block text-slate-500 mb-1">Código: {eco.codigo}</span>}
                                                                                        <span className="block text-amber-400/80">Área: {formatNumber(eco.area_interseccion_ha)} ha ({formatNumber(totalArea > 0 ? ((eco.area_interseccion_ha || 0) / totalArea) * 100 : 0, 1)}%)</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                </div>
                {/* Fixed bottom floating action bar */}
                <div className="px-6 py-4 bg-slate-900/95 backdrop-blur border-t border-slate-800 flex gap-2 shrink-0 z-10 w-full">
                    <button
                        onClick={onReset}
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 rounded-lg transition-colors border border-slate-700 flex items-center justify-center gap-2"
                    >
                        <span>⬅️</span>
                        <span>Cerrar</span>
                    </button>
                    <button
                        onClick={() => { onReset(); setTimeout(() => onStartDrawing('draw_polygon'), 100); }}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg transition-all shadow-lg flex items-center justify-center gap-2 border border-emerald-500"
                    >
                        <span>✏️</span>
                        <span>Dibujar Otro</span>
                    </button>
                </div>
            </div>
        );
    }
};

export default Sidebar;
