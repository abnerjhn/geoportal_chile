import React, { useState, useRef } from 'react';
import MapComponent from './components/MapComponent';
import Sidebar from './components/Sidebar';
import './index.css';

function App() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState([]);
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [activeDrawMode, setActiveDrawMode] = useState(null);
  const historyCounterRef = useRef(1);
  const [error, setError] = useState(null);

  // Map Drawing State Reference
  const mapRef = useRef(null); // Will hold functions exposed by MapComponent

  // Active Layers State
  const [activeLayers, setActiveLayers] = useState({
    areas_protegidas: false,
    sitios_prioritarios: false,
    ecosistemas: false,
    regiones: false,
    provincias: false,
    comunas: false,
    terrenos: false, // Hidden by default until geoms are added
  });

  // Base Map Style
  const [mapStyle, setMapStyle] = useState('dark');

  const handleToggleLayer = (layerId) => {
    setActiveLayers((prev) => ({
      ...prev,
      [layerId]: !prev[layerId],
    }));
  };

  const handleAnalyzePolygon = async (featureData) => {
    if (!featureData) {
      setShowResultsPanel(false);
      setError(null);
      setIsAnalyzing(false);
      setActiveDrawMode(null);
      return;
    }

    setIsAnalyzing(true);
    setActiveDrawMode(null);
    setError(null);

    // Normalize to an array of features
    let featuresToAnalyze = [];
    if (featureData.type === 'FeatureCollection') {
      featuresToAnalyze = featureData.features;
    } else if (featureData.type === 'Feature') {
      featuresToAnalyze = [featureData];
    }

    if (featuresToAnalyze.length === 0) {
      setIsAnalyzing(false);
      return;
    }

    try {
      const allResults = await Promise.all(featuresToAnalyze.map(async (feature, index) => {
        const response = await fetch('/api/reporte-predio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(feature)
        });

        if (!response.ok) {
          throw new Error(`Error al analizar el polígono ${index + 1}. Status: ${response.status}`);
        }

        const data = await response.json();

        // Add a display name for the accordion - keep it unique by using the counter
        const givenName = feature.properties?.name || feature.properties?.Name;
        data.featureName = givenName || `Terreno ${historyCounterRef.current + index}`;
        data.originalFeature = feature; // Save for zooming or references if needed
        data.id = new Date().getTime() + index; // Simple unique ID
        return data;
      }));

      // Increment the terrain counter so next upload/draw uses a higher number
      historyCounterRef.current = historyCounterRef.current + featuresToAnalyze.length;

      // Accumulate the new results
      setResults(prev => {
        const newArr = prev ? [...prev] : [];
        return [...newArr, ...allResults];
      });

      // Clear the temporary drawn geometries, MapComponent will rerender them from `results`
      if (mapRef.current) {
        mapRef.current.clearDrawings();
      }

      // Automatically turn on the terrenos layer if it was off
      setActiveLayers(prev => ({ ...prev, terrenos: true }));

      // Show the results panel automatically
      setShowResultsPanel(true);

    } catch (err) {
      console.error(err);
      setError('Hubo un error al procesar la solicitud espacial. Intenta nuevamente.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsAnalyzing(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload-predio', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Error subiendo el archivo espacial');
      }

      const featureCollection = await response.json();

      if (mapRef.current && featureCollection.features) {
        mapRef.current.clearDrawings();
        mapRef.current.addFeatures(featureCollection);
      }

      // Trigger analysis on all the uploaded features
      await handleAnalyzePolygon(featureCollection);

    } catch (err) {
      console.error(err);
      setError(err.message || 'Error al procesar el archivo. Verifica el formato.');
      setIsAnalyzing(false);
    } finally {
      // Clear file input so the same file can be uploaded again if needed
      event.target.value = null;
    }
  };

  const handleReset = () => {
    setShowResultsPanel(false); // Hide the panel, but KEEP results
    setError(null);
    setIsAnalyzing(false);
  };

  const handleStartDrawing = (mode = 'draw_polygon') => {
    // Automatically turn on the 'terrenos' layer so the drawing is visible
    setActiveLayers(prev => ({ ...prev, terrenos: true }));
    setActiveDrawMode(mode);

    if (mapRef.current) {
      mapRef.current.startDrawing(mode);
    }
  };

  const clearAllHistory = () => {
    setResults([]);
    setShowResultsPanel(false);
    historyCounterRef.current = 1;
    if (mapRef.current) {
      mapRef.current.clearDrawings();
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 overflow-hidden font-sans text-slate-100">
      {/* Left Sidebar */}
      <aside className="w-[400px] flex-shrink-0 z-20 shadow-xl relative bg-slate-900 border-r border-slate-800">
        <Sidebar
          isAnalyzing={isAnalyzing}
          results={results}
          showResultsPanel={showResultsPanel}
          setShowResultsPanel={setShowResultsPanel}
          error={error}
          onReset={handleReset}
          onStartDrawing={handleStartDrawing}
          activeDrawMode={activeDrawMode}
          onFileUpload={handleFileUpload}
          activeLayers={activeLayers}
          onToggleLayer={handleToggleLayer}
          mapStyle={mapStyle}
          setMapStyle={setMapStyle}
          onClearHistory={clearAllHistory}
        />
      </aside>

      {/* Main Map */}
      <main className="flex-1 relative">
        <MapComponent
          ref={mapRef}
          onAnalyzePolygon={handleAnalyzePolygon}
          isAnalyzing={isAnalyzing}
          activeLayers={activeLayers}
          mapStyle={mapStyle}
          results={results}
        />
      </main>
    </div>
  );
}

export default App;
