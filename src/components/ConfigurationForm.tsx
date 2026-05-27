import React, { useState } from 'react';
import { Coords, PVParams, TrackerType } from '../types';
import { utmToLatLon } from '../utils/utm';
import { parseKMLOrKMZFile } from '../utils/kmlParser';
import { 
  Upload, FileCode, CheckCircle2, ChevronRight, Settings2, HelpCircle, 
  MapPin, Sliders, Layers, Sparkles, AlertTriangle 
} from 'lucide-react';

interface ConfigurationFormProps {
  params: PVParams;
  setParams: React.Dispatch<React.SetStateAction<PVParams>>;
  onLocationUpdate: (centroid: Coords, polygonCoords: Coords[], source: string, name?: string) => void;
  isFetchingWeather: boolean;
  onRunSimulation: () => void;
  hasSelectedLocation: boolean;
  centroid?: Coords;
}

export default function ConfigurationForm({
  params,
  setParams,
  onLocationUpdate,
  isFetchingWeather,
  onRunSimulation,
  hasSelectedLocation,
  centroid
}: ConfigurationFormProps) {
  // Navigation tabs for form sections
  const [activeTab, setActiveTab] = useState<'location' | 'pv' | 'losses'>('location');
  
  // Coordinate input mode: 'gps' | 'utm' | 'file'
  const [coordMode, setCoordMode] = useState<'gps' | 'utm' | 'file'>('gps');

  // Manual GPS inputs - Start completely clean with placeholders
  const [latInput, setLatInput] = useState<string>('');
  const [lonInput, setLonInput] = useState<string>('');

  // Manual UTM inputs - Start completely clean with placeholders
  const [utmEasting, setUtmEasting] = useState<string>('');
  const [utmNorthing, setUtmNorthing] = useState<string>('');
  const [utmZone, setUtmZone] = useState<string>('');
  const [utmHemisphere, setUtmHemisphere] = useState<'N' | 'S'>('S');

  // File states
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [polygonArea, setPolygonArea] = useState<number | null>(null);
  const [suggestedPower, setSuggestedPower] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string>('');
  const [coordError, setCoordError] = useState<string>('');

  // Sincronizar inputs si la ubicación se limpia o se actualiza externamente
  React.useEffect(() => {
    if (!hasSelectedLocation) {
      setLatInput('');
      setLonInput('');
      setUtmEasting('');
      setUtmNorthing('');
      setUtmZone('');
      setUploadedFileName('');
      setPolygonArea(null);
      setSuggestedPower(null);
      setFileError('');
      setCoordError('');
    } else if (centroid && !latInput && !lonInput) {
      setLatInput(centroid.lat.toFixed(5));
      setLonInput(centroid.lon.toFixed(5));
    }
  }, [hasSelectedLocation, centroid]);

  // Handle number updates safely
  const updateParam = (key: keyof PVParams, val: number | boolean | string) => {
    setParams(prev => {
      const updated = { ...prev, [key]: val };
      if (key === 'trackerType' && val === 'fixed') {
        const referenceLat = centroid ? centroid.lat : -9.19; // Fallback to current center reference if none set
        updated.tilt = Math.trunc(Math.abs(referenceLat));
        updated.azimuth = referenceLat < 0 ? 180 : 0;
      }
      return updated;
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setFileError('');

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError('');
    if (e.target.files && e.target.files[0]) {
      await processUploadedFile(e.target.files[0]);
    }
  };

  const processUploadedFile = async (file: File) => {
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'kml' && ext !== 'kmz') {
        setFileError('Solo se admiten archivos .kml o .kmz (KML comprimido)');
        return;
      }

      setUploadedFileName(file.name);
      const parsed = await parseKMLOrKMZFile(file);
      
      if (parsed && parsed.coords.length > 0) {
        onLocationUpdate(parsed.centroid, parsed.coords, 'file', parsed.name);
        setPolygonArea(parsed.areaSqm);
        
        // Estimar potencia pico sugerida basada en área útil (aprox 120 MWp por kilómetro cuadrado, o 120 Wp por m² de panel)
        // Usamos un factor de ocupación del 50% para separaciones de trackers, por lo que estimamos ~60 Wp por m² de terreno total
        const peakPowerEstimateW = parsed.areaSqm * 60; 
        const peakPowerEstimatekWp = Math.round(peakPowerEstimateW / 1000);
        setSuggestedPower(peakPowerEstimatekWp);
        
        // Actualizar formulario
        setLatInput(parsed.centroid.lat.toFixed(5));
        setLonInput(parsed.centroid.lon.toFixed(5));
      } else {
        setFileError('No se pudo encontrar un polígono o coordenada válida dentro del archivo.');
      }
    } catch (err) {
      setFileError((err as Error).message || 'Error al procesar el archivo.');
    }
  };

  const handleApplySuggestedPower = () => {
    if (suggestedPower) {
      updateParam('peakPowerkWp', suggestedPower);
    }
  };

  const handleApplyCoordinates = () => {
    setCoordError('');
    if (coordMode === 'gps') {
      const latVal = latInput.trim();
      const lonVal = lonInput.trim();
      if (!latVal || !lonVal) {
        setCoordError('Por favor, ingrese tanto la latitud como la longitud.');
        return;
      }
      const lat = parseFloat(latVal);
      const lon = parseFloat(lonVal);
      if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        onLocationUpdate({ lat, lon }, [], 'gps', `Punto GPS (${lat.toFixed(3)}, ${lon.toFixed(3)})`);
      } else {
        setCoordError('La latitud debe estar entre -90 y 90, y la longitud entre -180 y 180.');
      }
    } else if (coordMode === 'utm') {
      const eastVal = utmEasting.trim();
      const northVal = utmNorthing.trim();
      const zoneVal = utmZone.trim();
      if (!eastVal || !northVal || !zoneVal) {
        setCoordError('Por favor, complete todos los campos UTM (Easte, Northing y Zona).');
        return;
      }
      const east = parseFloat(eastVal);
      const north = parseFloat(northVal);
      const zone = parseInt(zoneVal);
      if (!isNaN(east) && !isNaN(north) && !isNaN(zone) && zone >= 1 && zone <= 60) {
        const coords = utmToLatLon(east, north, zone, utmHemisphere === 'S');
        setLatInput(coords.lat.toFixed(5));
        setLonInput(coords.lon.toFixed(5));
        onLocationUpdate(
          coords, 
          [], 
          'utm', 
          `Punto UTM (ZT${zone}${utmHemisphere}, East: ${east.toFixed(0)}, North: ${north.toFixed(0)})`
        );
      } else {
        setCoordError('Zona UTM inválida (debe ser de 1 a 60) o números inválidos.');
      }
    }
  };

  const isTracker = params.trackerType === '1axis' || params.trackerType === '2axis';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
      {/* Tab Header */}
      <div className="flex border-b border-slate-200 bg-slate-50">
        <button
          onClick={() => setActiveTab('location')}
          className={`flex-1 py-3 px-4 text-xs md:text-sm font-medium border-b-2 flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'location'
              ? 'border-amber-500 text-amber-600 bg-white'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
          }`}
          id="location-tab"
        >
          <MapPin className="w-4 h-4" />
          Ubicación
        </button>
        <button
          onClick={() => setActiveTab('pv')}
          className={`flex-1 py-3 px-4 text-xs md:text-sm font-medium border-b-2 flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'pv'
              ? 'border-amber-500 text-amber-600 bg-white'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
          }`}
          id="pv-tab"
        >
          <Sliders className="w-4 h-4" />
          Tecnología PV
        </button>
        <button
          onClick={() => setActiveTab('losses')}
          className={`flex-1 py-3 px-4 text-xs md:text-sm font-medium border-b-2 flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'losses'
              ? 'border-amber-500 text-amber-600 bg-white'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
          }`}
          id="losses-tab"
        >
          <Layers className="w-4 h-4" />
          Detalle Pérdidas
        </button>
      </div>

      {/* Tab Body */}
      <div className="p-5 flex-1 overflow-y-auto space-y-5">
        
        {/* TAB 1: LOCATION SECTION */}
        {activeTab === 'location' && (
          <div className="space-y-4 animate-fade-in" id="location-view">
            {coordError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{coordError}</span>
              </div>
            )}
            <div className="flex gap-2 p-0.5 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setCoordMode('gps')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                  coordMode === 'gps' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Decimales (GPS)
              </button>
              <button
                type="button"
                onClick={() => setCoordMode('utm')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                  coordMode === 'utm' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Coordenadas UTM
              </button>
              <button
                type="button"
                onClick={() => setCoordMode('file')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                  coordMode === 'file' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Subir KML / KMZ
              </button>
            </div>

            {/* GPS MODE CONTAINER */}
            {coordMode === 'gps' && (
              <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Coordenadas en Grados Decimales</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 font-medium mb-1">Latitud (°)</label>
                    <input
                      type="number"
                      step="any"
                      min="-90"
                      max="90"
                      value={latInput}
                      onChange={(e) => setLatInput(e.target.value)}
                      placeholder="ej. -5.2825"
                      className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 font-medium mb-1">Longitud (°)</label>
                    <input
                      type="number"
                      step="any"
                      min="-180"
                      max="180"
                      value={lonInput}
                      onChange={(e) => setLonInput(e.target.value)}
                      placeholder="ej. -80.5910"
                      className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleApplyCoordinates}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-705 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  Fijar Punto GPS
                </button>
              </div>
            )}

            {/* UTM MODE CONTAINER */}
            {coordMode === 'utm' && (
              <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Proyección Plana UTM (WGS84)</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 font-medium mb-1">Easte (X) metros</label>
                    <input
                      type="number"
                      value={utmEasting}
                      onChange={(e) => setUtmEasting(e.target.value)}
                      placeholder="ej. 545000"
                      className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all cursor-text placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 font-medium mb-1">Norte (Y) metros</label>
                    <input
                      type="number"
                      value={utmNorthing}
                      onChange={(e) => setUtmNorthing(e.target.value)}
                      placeholder="ej. 9416000"
                      className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all cursor-text placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 font-medium mb-1">Zona UTM (1-60)</label>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={utmZone}
                      onChange={(e) => setUtmZone(e.target.value)}
                      placeholder="ej. 17"
                      className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 font-medium mb-1">Hemisferio</label>
                    <select
                      value={utmHemisphere}
                      onChange={(e) => setUtmHemisphere(e.target.value as 'N' | 'S')}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all"
                    >
                      <option value="S">Sur (América Latina)</option>
                      <option value="N">Norte</option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleApplyCoordinates}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-705 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  Convertir y Fijar Coordenadas
                </button>
              </div>
            )}

            {/* FILE MODE CONTAINER (KML/KMZ) */}
            {coordMode === 'file' && (
              <div className="space-y-3">
                <div 
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                    dragActive ? 'border-amber-500 bg-amber-50/20' : 'border-slate-200 bg-slate-50 hover:bg-slate-100/50'
                  }`}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('file-upload-input')?.click()}
                >
                  <input
                    type="file"
                    id="file-upload-input"
                    className="hidden"
                    accept=".kml,.kmz"
                    onChange={handleFileInput}
                  />
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <span className="block text-xs font-semibold text-slate-700 mb-1">Arrastra tu polígono KML o KMZ</span>
                  <span className="block text-[10px] text-slate-500">O haz clic para explorar en el explorador</span>
                </div>

                {fileError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-lg text-[11px] text-rose-700">
                    {fileError}
                  </div>
                )}

                {uploadedFileName && !fileError && (
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="text-xs font-semibold text-amber-900 truncate flex-1">{uploadedFileName}</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    </div>

                    {polygonArea !== null && (
                      <div className="text-[11px] text-slate-600 grid grid-cols-2 gap-1 bg-white/70 p-2 rounded border border-amber-100/30">
                        <div>Área de Terreno:</div>
                        <div className="font-mono font-bold text-right text-slate-800">
                          {polygonArea >= 10000 
                            ? `${(polygonArea / 10000).toFixed(2)} Ha` 
                            : `${polygonArea.toFixed(0)} m²`}
                        </div>
                        <div>Potencia sugerida:</div>
                        <div className="font-mono font-bold text-right text-amber-700">
                          {suggestedPower ? `${(suggestedPower / 1000).toFixed(2)} MWp` : '--'}
                        </div>
                      </div>
                    )}

                    {suggestedPower !== null && (
                      <button
                        type="button"
                        onClick={handleApplySuggestedPower}
                        className="w-full mt-1 py-1.5 bg-amber-500 text-white rounded-md text-[11px] font-bold hover:bg-amber-600 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Usar Potencia Sugerida ({ (suggestedPower / 1000).toFixed(1) } MWp)
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* General Peak Power Input Container */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  Potencia Pico a Considerar (MWp)
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" title="Potencia STC instalada total en Megavatios pico" />
                </label>
                <span className="text-[10px] font-mono text-slate-500">
                  ={ (params.peakPowerkWp).toLocaleString() } kWp
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  value={ (params.peakPowerkWp / 1000) }
                  onChange={(e) => updateParam('peakPowerkWp', Math.max(0.1, parseFloat(e.target.value) * 1000))}
                  className="w-full text-sm font-mono px-3 py-2.5 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all pr-12 cursor-text"
                />
                <div className="absolute right-3 top-3.5 text-xs font-semibold text-slate-400 uppercase">
                  MWp
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PV ARRAY TECHNOLOGY */}
        {activeTab === 'pv' && (
          <div className="space-y-4 animate-fade-in" id="pv-view">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Estructura y Seguimiento Solar</label>
              <select
                value={params.trackerType}
                onChange={(e) => updateParam('trackerType', e.target.value as TrackerType)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all bg-white"
              >
                <option value="fixed">Estructura Fija (Fixed Tilt)</option>
                <option value="1axis">Seguidores 1-Eje N-S horizontal con Backtracking</option>
                <option value="2axis">Seguidores Dual-Axis independientes</option>
              </select>
            </div>

            {params.trackerType === 'fixed' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 pb-2">
                  <div>
                    <label className="block text-[11px] text-slate-600 font-medium mb-1">Inclinación (Tilt) °</label>
                    <input
                      type="number"
                      min="0"
                      max="90"
                      value={params.tilt}
                      onChange={(e) => updateParam('tilt', parseFloat(e.target.value))}
                      className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all bg-white cursor-text"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 font-medium mb-1">Azimut (Facing) °</label>
                    <input
                      type="number"
                      min="-180"
                      max="180"
                      value={params.azimuth}
                      onChange={(e) => updateParam('azimuth', parseFloat(e.target.value))}
                      className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all bg-white cursor-text"
                      title="0 es hacia el ecuador (Sur en Hemisferio N, Norte en Hemisferio S)"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-indigo-600 bg-indigo-50/50 p-2 rounded border border-indigo-100/50 leading-tight">
                  <span className="font-semibold">Sugerido Fijo:</span> Inclinación = |Lat| ({Math.trunc(Math.abs(centroid?.lat ?? -9.19))}°) y Azimut = {(centroid?.lat ?? -9.19) < 0 ? 'Sur (180°)' : 'Norte (0°)'} según hemisferio.
                </p>
              </div>
            )}

            {params.trackerType === '1axis' && (
              <div className="p-3 bg-amber-50/40 rounded-lg border border-amber-100/50 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-600 font-medium mb-1">Ángulo Máx Tracker (°)</label>
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={params.trackerMaxAngle}
                      onChange={(e) => updateParam('trackerMaxAngle', parseFloat(e.target.value))}
                      className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all bg-white cursor-text"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 font-medium mb-1">Relación Terreno (GCR) %</label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      max="100"
                      value={params.gcr * 100}
                      onChange={(e) => updateParam('gcr', parseFloat(e.target.value) / 100)}
                      className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all bg-white cursor-text"
                      title="Ground Cover Ratio (Ancho del panel / Distancia entre filas). Influye en Backtracking."
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-600 font-medium">Algoritmo de Backtracking activo</span>
                  <input
                    type="checkbox"
                    checked={params.backtracking}
                    onChange={(e) => updateParam('backtracking', e.target.checked)}
                    className="w-4 h-4 text-amber-500 border-slate-300 rounded focus:ring-amber-500 transition-all cursor-pointer"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                  Albedo del Terreno (NASA)
                  <span className="group relative">
                    <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-900 text-white text-[9px] rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 normal-case leading-tight font-normal">
                      Obtenido automáticamente desde NASA POWER (parámetro ALLSKY_SRF_ALB). Si no hay ubicación, usa un valor de referencia de 0.20.
                    </span>
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    value={`${params.albedo.toFixed(2)} (Auto)`}
                    className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none bg-slate-50 text-slate-500 cursor-not-allowed font-semibold"
                  />
                </div>
                <p className="text-[9px] text-amber-600 mt-0.5 leading-tight font-medium">Extraído vía satélite de la NASA</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Coef. Temp Máx (%/°C)</label>
                <input
                  type="number"
                  step="any"
                  max="0"
                  value={params.tempCoeffPercent}
                  onChange={(e) => updateParam('tempCoeffPercent', parseFloat(e.target.value))}
                  className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Térmico Uc (W/m²K)</label>
                <input
                  type="number"
                  step="any"
                  value={params.ucThermal}
                  onChange={(e) => updateParam('ucThermal', parseFloat(e.target.value))}
                  className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all"
                  title="Factor constante de disipación de calor del módulo (PVSyst default: 29.0)"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Térmico Uv (W/m²K/m/s)</label>
                <input
                  type="number"
                  step="any"
                  value={params.uvThermal}
                  onChange={(e) => updateParam('uvThermal', parseFloat(e.target.value))}
                  className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all"
                  title="Factor del viento para disipación de calor (PVSyst default: 0.0)"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SYSTEM LOSS DETAILED VALUES */}
        {activeTab === 'losses' && (
          <div className="space-y-4 animate-fade-in" id="losses-view">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-1.5 flex justify-between">
              <span>Pérdidas de Rendimiento CC / STC</span>
              <span className="text-amber-600">Simulación PVSyst</span>
            </h4>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-600 font-medium mb-1">Suciedad (Soiling) %</label>
                <input
                  type="number"
                  step="any"
                  value={params.soilingLossPercent}
                  onChange={(e) => updateParam('soilingLossPercent', parseFloat(e.target.value))}
                  className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 font-medium mb-1">Degradación (LID) %</label>
                <input
                  type="number"
                  step="any"
                  value={params.lidLossPercent}
                  onChange={(e) => updateParam('lidLossPercent', parseFloat(e.target.value))}
                  className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-600 font-medium mb-1">Calidad Módulo %</label>
                <input
                  type="number"
                  step="any"
                  value={params.moduleQualityLossPercent}
                  onChange={(e) => updateParam('moduleQualityLossPercent', parseFloat(e.target.value))}
                  className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all"
                  title="Valores negativos representan una bonificación de calidad superior (ej. -0.8% es ganancia)"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 font-medium mb-1">Mismatches (Desajuste) %</label>
                <input
                  type="number"
                  step="any"
                  value={params.mismatchLossPercent}
                  onChange={(e) => updateParam('mismatchLossPercent', parseFloat(e.target.value))}
                  className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-600 font-medium mb-1">Cables CC (Ohmicas) %</label>
                <input
                  type="number"
                  step="any"
                  value={params.dcWiringLossPercent}
                  onChange={(e) => updateParam('dcWiringLossPercent', parseFloat(e.target.value))}
                  className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 font-medium mb-1">Cableado CA %</label>
                <input
                  type="number"
                  step="any"
                  value={params.acWiringLossPercent}
                  onChange={(e) => updateParam('acWiringLossPercent', parseFloat(e.target.value))}
                  className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all"
                />
              </div>
            </div>

            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-1.5 pt-2">
              Conversión Inversor y Alta Tensión
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-600 font-medium mb-1">Eficiencia Inversor %</label>
                <input
                  type="number"
                  step="any"
                  value={params.inverterEffPercent}
                  onChange={(e) => updateParam('inverterEffPercent', parseFloat(e.target.value))}
                  className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 font-medium mb-1">Pérdida Transfo %</label>
                <input
                  type="number"
                  step="any"
                  value={params.transformerLossPercent}
                  onChange={(e) => updateParam('transformerLossPercent', parseFloat(e.target.value))}
                  className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Button Run Container */}
      <div className="p-4 bg-slate-50 border-t border-slate-200">
        <button
          type="button"
          onClick={onRunSimulation}
          disabled={!hasSelectedLocation || isFetchingWeather}
          className={`w-full py-3 font-bold rounded-xl text-xs md:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
            (!hasSelectedLocation || isFetchingWeather)
              ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed shadow-none'
              : 'bg-slate-900 hover:bg-slate-800 text-white hover:shadow-lg'
          }`}
        >
          {isFetchingWeather ? (
            <>
              <svg className="animate-spin h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Obteniendo Datos de Radiación...</span>
            </>
          ) : (
            <>
              <span>{!hasSelectedLocation ? 'Fije Ubicación para habilitar NASA' : 'Calcular Producción Fotovoltaica'}</span>
              <ChevronRight className={`w-5 h-5 ${!hasSelectedLocation ? 'text-slate-400' : 'text-amber-500'}`} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
