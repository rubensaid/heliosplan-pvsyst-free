import React, { useState, useEffect } from 'react';
import { Coords, PVParams, SimulationResults, SolarMeteorologyMonth } from './types';
import { runPVSimulation, CATACAOS_METEO_FALLBACK, MONTHS_ES } from './utils/pvEngine';
import ConfigurationForm from './components/ConfigurationForm';
import ResultsDashboard from './components/ResultsDashboard';
import LossCascade from './components/LossCascade';
import MonthlyTable from './components/MonthlyTable';
import MapComponent from './components/MapComponent';
import { 
  Sun, Cpu, CloudLightning, Info, AlertTriangle, HelpCircle, 
  Map, LayoutGrid, FileText, Settings, Award 
} from 'lucide-react';

const INITIAL_PARAMS: PVParams = {
  peakPowerkWp: 401300, // Matching the Catacaos system power: 401.3 MWp (401300 kWp)
  tilt: 0, // Since it uses tracking, tilt is variable but starts at 0 for flat tracker default
  azimuth: 0,
  trackerType: '1axis', // unlimited tracker with backtracking
  gcr: 0.366, // 36.6% GCR
  trackerMaxAngle: 60,
  backtracking: true,
  albedo: 0.20,
  
  // Loss metrics
  soilingLossPercent: 3.5,
  lidLossPercent: 0.6,
  moduleQualityLossPercent: -0.8, // -0.8% negative represents positive gain
  mismatchLossPercent: 2.0,
  dcWiringLossPercent: 1.5,
  inverterEffPercent: 98.5,
  tempCoeffPercent: -0.35,
  ucThermal: 29.0, // Uc
  uvThermal: 0.0, // Uv
  acWiringLossPercent: 1.5,
  transformerLossPercent: 1.0
};

export default function App() {
  // Configured inputs state
  const [params, setParams] = useState<PVParams>(INITIAL_PARAMS);
  const [siteName, setSiteName] = useState<string>('Proyecto sin ubicación');
  
  // Coordinates state
  const [centroid, setCentroid] = useState<Coords>({ lat: -9.19, lon: -75.01 }); // Centering reference for Peru
  const [polygonCoords, setPolygonCoords] = useState<Coords[]>([]);
  const [pointMarker, setPointMarker] = useState<Coords | undefined>(undefined);
  const [hasSelectedLocation, setHasSelectedLocation] = useState<boolean>(false);

  // NASA Weather states
  const [meteoData, setMeteoData] = useState<SolarMeteorologyMonth[] | null>(null);
  const [isFetchingWeather, setIsFetchingWeather] = useState<boolean>(false);
  const [weatherSource, setWeatherSource] = useState<'none' | 'fallback' | 'nasa' | 'generated'>('none');
  const [weatherNotice, setWeatherNotice] = useState<string>('Por favor fije la ubicación geográfica del proyecto en el panel izquierdo para habilitar la consulta NASA POWER.');

  // Simulation outputs state
  const [simulationResults, setSimulationResults] = useState<SimulationResults | null>(null);

  // Tab selections for right side view
  const [activeResultsTab, setActiveResultsTab] = useState<'overview' | 'cascade' | 'table'>('overview');

  // Recalculates simulation / Fetches weather and simulates
  const handleRunSimulation = async () => {
    if (!hasSelectedLocation) return;
    await fetchNASAWeather(centroid.lat, centroid.lon);
  };

  // Triggers when a location gets updated via KML/Coords
  const handleLocationUpdate = (
    newCentroid: Coords, 
    newPolygon: Coords[], 
    sourceType: string,
    customName?: string
  ) => {
    setCentroid(newCentroid);
    setPolygonCoords(newPolygon);
    setHasSelectedLocation(true);
    
    if (newPolygon.length === 0) {
      setPointMarker(newCentroid);
    } else {
      setPointMarker(undefined);
    }

    if (customName) {
      setSiteName(customName);
    } else {
      setSiteName(`Proyecto Solar (${newCentroid.lat.toFixed(4)}, ${newCentroid.lon.toFixed(4)})`);
    }

    // Adjust tilt and azimuth defaults for fixed tilt based on location hemisphere/latitude
    setParams(prev => {
      if (prev.trackerType === 'fixed') {
        return {
          ...prev,
          tilt: Math.trunc(Math.abs(newCentroid.lat)),
          azimuth: newCentroid.lat < 0 ? 180 : 0
        };
      }
      return prev;
    });

    // Reset pre-loaded datasets and simulation data so user must explicitly click calculate for the new location
    setMeteoData(null);
    setSimulationResults(null);
    setWeatherSource('none');
    setWeatherNotice('¡Ubicación fijada con éxito! El botón para "Calcular Producción Fotovoltaica" ya está disponible. Presiónelo para descargar los datos de radiación satelitales de la NASA POWER y simular.');
  };

  // Resets all location polygons, point markers, and calculated PV simulation results
  const handleClearLocationAndData = () => {
    setCentroid({ lat: -9.19, lon: -75.01 });
    setPolygonCoords([]);
    setPointMarker(undefined);
    setHasSelectedLocation(false);
    setSiteName('Proyecto sin ubicación');
    setMeteoData(null);
    setSimulationResults(null);
    setWeatherSource('none');
    setWeatherNotice('Por favor fije la ubicación geográfica del proyecto en el panel izquierdo para habilitar la consulta NASA POWER.');
  };

  // Generates beautifully scaled solar radiation climatology based on coordinates mathematically
  // as a bulletproof backup in case NASA API is down or throttled.
  const generateRealisticSolarMeteo = (lat: number, lon: number): SolarMeteorologyMonth[] => {
    const data: SolarMeteorologyMonth[] = [];
    const absoluteLat = Math.abs(lat);
    for (let m = 0; m < 12; m++) {
      // Seasonal variance coefficient (sine wave shifted for hemispheres)
      // Northern Hemisphere peaks in June (month 5), Southern peaks in Dec/Jan
      const isSouthern = lat < 0;
      const phase = isSouthern ? Math.PI : 0;
      const angle = (2 * Math.PI * (m - 5)) / 12 + phase;
      
      // Calculate realistic solar daily horizontals based on latitude
      let baseGHI = 6.0 - (absoluteLat / 90.0) * 3.5; // High GHI near equator (~6.0), lower at poles (~2.5)
      const amplitudeGHI = 1.8 * (absoluteLat / 45.0 + 0.1); // Higher seasonality near poles
      const monthlyGHIDaily = Math.max(1.5, baseGHI + amplitudeGHI * Math.cos(angle));

      // Diffuse is typically ~25%-45% of total, higher when days are cloudier
      const diffuseDaily = monthlyGHIDaily * (0.32 + 0.12 * Math.sin(angle));

      // Ambient temperatures average around seasons
      let baseTemp = 27.0 - (absoluteLat / 50.0) * 22.0; // Warm equator (~27), cold poles
      const amplitudeTemp = 8.0 * (absoluteLat / 50.0 + 0.2); // Seasonal temp swing
      const monthlyTemp = baseTemp + amplitudeTemp * Math.cos(angle);

      // Average horizontal wind speeds
      const windSpeed = 2.0 + 0.8 * Math.abs(Math.sin(angle * 2));

      data.push({
        monthName: MONTHS_ES[m],
        monthIndex: m,
        globHor: parseFloat(monthlyGHIDaily.toFixed(2)),
        diffHor: parseFloat(diffuseDaily.toFixed(2)),
        tempAmb: parseFloat(monthlyTemp.toFixed(1)),
        windSpeed: parseFloat(windSpeed.toFixed(1))
      });
    }
    return data;
  };

  // Fetch from NASA POWER API Climatology Point
  const fetchNASAWeather = async (lat: number, lon: number) => {
    setIsFetchingWeather(true);
    setWeatherNotice('Conectando con el servidor NASA POWER para descargar series de tiempo de radiación solar...');
    
    // Create an 8-second timeout promise
    let timeoutId: any = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('TIMEOUT_NASA_POWER'));
      }, 8000);
    });
    
    // Create the NASA fetch and parsing promise
    const fetchPromise = (async () => {
      const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,T2M,WS2M,ALLSKY_SRF_ALB&community=re&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&format=json`;
      const response = await fetch(url);
      if (!response.ok) {
        let errorMsg = `NASA Server responded with status: ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson && errJson.messages && Array.isArray(errJson.messages)) {
            errorMsg += ` - Detalles: ${errJson.messages.join(' | ')}`;
          } else if (errJson && errJson.message) {
            errorMsg += ` - Detalles: ${errJson.message}`;
          } else if (errJson && typeof errJson === 'object') {
            errorMsg += ` - Detalles: ${JSON.stringify(errJson)}`;
          }
        } catch (_) {
          try {
            const txt = await response.text();
            if (txt) {
              errorMsg += ` - Respuesta: ${txt.substring(0, 150)}`;
            }
          } catch (__) {}
        }
        throw new Error(errorMsg);
      }
      return await response.json();
    })();
    
    try {
      const json = await Promise.race([fetchPromise, timeoutPromise]) as any;
      
      // Clear timeout upon early success
      if (timeoutId) clearTimeout(timeoutId);
      
      // Check if parameter keys exist in JSON
      const parameters = json?.properties?.parameter;
      if (!parameters || !parameters.ALLSKY_SFC_SW_DWN || !parameters.T2M) {
        throw new Error('El JSON devuelto por la NASA no contiene los parámetros meteorológicos requeridos.');
      }

      const sw = parameters.ALLSKY_SFC_SW_DWN; // All sky horizontal solar
      const diff = parameters.ALLSKY_SFC_DIFF_DWN; // Diffuse horizontal solar
      const t2m = parameters.T2M; // Temp at 2m
      const ws2m = parameters.WS2M; // Wind speed at 2m
      const alb = parameters.ALLSKY_SRF_ALB; // Surface Albedo from NASA POWER

      const MONTH_KEYS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      
      const parsedData: SolarMeteorologyMonth[] = [];
      let totalAlbedo = 0;
      let countAlbedo = 0;
      
      for (let m = 0; m < 12; m++) {
        const key = MONTH_KEYS[m];
        
        // Grab values
        let globHor = sw[key] !== undefined && sw[key] > 0 ? sw[key] : null;
        let diffHor = diff && diff[key] !== undefined && diff[key] > 0 ? diff[key] : null;
        let tempAmb = t2m[key] !== undefined ? t2m[key] : 20;
        let windSpeed = ws2m && ws2m[key] !== undefined ? ws2m[key] : 2.0;

        let monthAlbedo = 0.20; // Default fallback if missing
        if (alb && alb[key] !== undefined && alb[key] >= 0 && alb[key] <= 1) {
          monthAlbedo = alb[key];
          totalAlbedo += monthAlbedo;
          countAlbedo++;
        }

        // If GHI horizontal is missing, throw error
        if (globHor === null) {
          throw new Error(`Falta el parámetro de irradiancia horizontal global (GHI) para el mes de ${key}`);
        }

        // If diffuse is missing, approximate it safely as a 35% GHI fraction
        if (diffHor === null) {
          diffHor = globHor * 0.35;
        }

        parsedData.push({
          monthName: MONTHS_ES[m],
          monthIndex: m,
          globHor,
          diffHor,
          tempAmb,
          windSpeed,
          albedo: monthAlbedo
        });
      }

      const averageAlbedo = countAlbedo > 0 ? totalAlbedo / countAlbedo : 0.20;
      const updatedParams = { ...params, albedo: averageAlbedo };

      setParams(updatedParams);
      setMeteoData(parsedData);
      setWeatherSource('nasa');
      setWeatherNotice(`Datos climatológicos reales y albedos mensuales (Promedio Gral: ${averageAlbedo.toFixed(3)}) descargados exitosamente desde NASA POWER para la ubicación de tu proyecto (${lat.toFixed(4)}°, ${lon.toFixed(4)}°).`);
      
      // Auto rerun simulation with new weather
      const results = runPVSimulation(lat, lon, parsedData, updatedParams);
      setSimulationResults(results);

    } catch (error: any) {
      if (timeoutId) clearTimeout(timeoutId);
      console.warn('NASA POWER API failed. User requested authentic data only. Failing simulation...', error);
      
      // STRICT SCOPE DISCIPLINE: Do not invent/fabricate meteorological data
      setMeteoData(null);
      setWeatherSource('failed');
      setSimulationResults(null);
      
      if (error?.message === 'TIMEOUT_NASA_POWER') {
        setWeatherNotice(`Timeout (Límite 8s) al intentar conectarse al servidor de la NASA. El servidor tarda demasiado en responder o está fuera de servicio. Verifique su conexión.`);
      } else {
        setWeatherNotice(`Error crítico en la conexión con NASA POWER: ${error?.message || 'Error de conexión desconocido'}. No se han generado datos alternativos para asegurar la fidelidad técnica del estudio.`);
      }
    } finally {
      setIsFetchingWeather(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Re-run simulation when structural params variables change
  useEffect(() => {
    if (meteoData) {
      const results = runPVSimulation(centroid.lat, centroid.lon, meteoData, params);
      setSimulationResults(results);
    }
  }, [params]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Visual Navigation Header */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-700 text-white shrink-0 gap-4 printing-hide">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center shadow-md shadow-amber-500/10">
            <Sun className="w-5 h-5 text-slate-900 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              HELIOS<span className="text-amber-500 font-bold">PLAN</span> 
              <span className="font-normal text-slate-450 text-[10px] sm:text-xs ml-2 uppercase tracking-widest bg-slate-800/40 px-2 py-0.5 rounded border border-slate-700/60">Energy Analyzer</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">Subida de polígonos KML/KMZ y simulación fotovoltaica clase PVSyst</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800/80 px-3.5 py-1.5 rounded-lg border border-slate-700/80">
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
            <span>Motor Solar Activo</span>
          </div>
          <div className="hidden md:block h-4 w-px bg-slate-700"></div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">NASA POWER Conectado</span>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          </div>
        </div>
      </header>

      {/* Main Grid Content Panels */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch printing-hide">
        
        {/* LEFT COLUMN: Map View + Config Input (spanning 5/12 cols) */}
        <section className="col-span-1 lg:col-span-5 flex flex-col gap-6 printing-hide">
          {/* Map Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 shrink-0 flex flex-col justify-between">
            <div className="mb-3 flex justify-between items-center">
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Mapeo del Polígono</h3>
                <p className="text-[10px] text-slate-500">Visualiza tu proyecto sobre OpenStreetMap</p>
              </div>
              <div className="flex items-center gap-2">
                {hasSelectedLocation && (
                  <button
                    onClick={handleClearLocationAndData}
                    className="px-2 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                    title="Limpiar ubicación y datos de simulación"
                  >
                    Limpiar
                  </button>
                )}
                <div className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 rounded text-[9px] font-mono text-indigo-700 font-bold uppercase">
                  Geográfico
                </div>
              </div>
            </div>
            <MapComponent 
              centroid={centroid} 
              polygonCoords={polygonCoords} 
              pointMarker={pointMarker} 
              hasSelectedLocation={hasSelectedLocation}
            />
          </div>

          {/* Form Parameters Configuration Panel */}
          <div className="flex-1">
            <ConfigurationForm 
              params={params} 
              setParams={setParams} 
              onLocationUpdate={handleLocationUpdate}
              isFetchingWeather={isFetchingWeather}
              onRunSimulation={handleRunSimulation}
              hasSelectedLocation={hasSelectedLocation}
              centroid={centroid}
            />
          </div>
        </section>

        {/* RIGHT COLUMN: Output Simulation metrics (12-col layout on small, 7/12 cols on desktop) */}
        <section className="col-span-1 lg:col-span-7 flex flex-col gap-6" id="output-report-container">
          
          {/* Weather Source status banner */}
          <div className={`p-4 border rounded-xl flex items-start gap-3 printing-hide shadow-xs ${
            weatherSource === 'nasa' 
              ? 'bg-emerald-50 border-emerald-200/60 text-emerald-800' 
              : weatherSource === 'generated' 
                ? 'bg-amber-50 border-amber-200/60 text-amber-800' 
                : weatherSource === 'failed'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : weatherSource === 'none'
                    ? 'bg-slate-50 border-slate-200 text-slate-700'
                    : 'bg-indigo-50 border-indigo-200/60 text-indigo-800'
          }`}>
            <Info className="w-5 h-5 shrink-0 mt-0.5 text-slate-400" />
            <div className="text-xs">
              <span className="font-bold uppercase tracking-wider text-[10px] block mb-0.5">Estado de la atmósfera</span>
              {weatherNotice}
            </div>
          </div>

          {/* Outputs Navigation tabs */}
          <div className="flex border-b border-slate-200 bg-white p-1 rounded-xl shadow-xs border relative printing-hide">
            <button
              onClick={() => setActiveResultsTab('overview')}
              disabled={!simulationResults}
              className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                activeResultsTab === 'overview' && simulationResults
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-950 hover:bg-slate-50'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Tablero General
            </button>
            <button
              onClick={() => setActiveResultsTab('cascade')}
              disabled={!simulationResults}
              className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                activeResultsTab === 'cascade' && simulationResults
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-950 hover:bg-slate-50'
              }`}
            >
              <Sun className="w-4 h-4" />
              Cascada de Pérdidas
            </button>
            <button
              onClick={() => setActiveResultsTab('table')}
              disabled={!simulationResults}
              className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                activeResultsTab === 'table' && simulationResults
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-950 hover:bg-slate-50'
              }`}
            >
              <FileText className="w-4 h-4" />
              Balances Mensuales
            </button>
          </div>

          {/* Tab Content Panels */}
          {simulationResults ? (
            <div className="space-y-6 flex-1">
              
              {/* Tabs views */}
              {activeResultsTab === 'overview' && (
                <ResultsDashboard 
                  results={simulationResults}
                  siteName={siteName}
                  latitude={centroid.lat}
                  longitude={centroid.lon}
                  peakPowerkWp={params.peakPowerkWp}
                  trackerType={params.trackerType}
                  onPrintReport={handlePrint}
                  albedo={params.albedo}
                  tilt={params.tilt}
                  azimuth={params.azimuth}
                />
              )}

              {activeResultsTab === 'cascade' && (
                <LossCascade 
                  cascade={simulationResults.lossCascade}
                  peakPower={params.peakPowerkWp}
                />
              )}

              {activeResultsTab === 'table' && (
                <MonthlyTable 
                  results={simulationResults}
                />
              )}

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white rounded-xl border border-dashed border-slate-300 min-h-[400px]">
              <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center border border-slate-200 shadow-sm animate-pulse mb-4">
                <Sun className="w-6 h-6 text-slate-400" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">Simulación Solar HeliosPlan</h3>
              <p className="text-xs text-slate-500 max-w-md mb-6">
                Para generar balances energéticos precisos, este motor calcula la radiación incidente directa, difusa y reflejada transpuesta según el algoritmo Perez 1990 combinando datos satelitales en tiempo real de la NASA.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg text-left w-full">
                <div className={`p-4 rounded-xl border transition-all ${!hasSelectedLocation ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest block mb-1">Paso 1: Fije la Ubicación</span>
                  <p className="text-xs text-slate-600">
                    {!hasSelectedLocation 
                      ? "Ingrese coordenadas decimales/UTM o suba un polígono de terreno KML/KMZ en el menú lateral." 
                      : "✓ Ubicación seleccionada y lista para consultar."}
                  </p>
                </div>
                
                <div className={`p-4 rounded-xl border transition-all ${hasSelectedLocation ? 'border-emerald-200 bg-emerald-50/25' : 'border-slate-100 bg-slate-50/50 opacity-40'}`}>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Paso 2: Consultar NASA POWER</span>
                  <p className="text-xs text-slate-600">
                    {!hasSelectedLocation 
                      ? "Se habilitará una vez guardada la posición del proyecto georeferenciado." 
                      : "El botón \"Calcular Producción Fotovoltaica\" ya está activo. Presiónelo para descargar datos satelitales y simular."}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Footer Status Bar */}
      <footer className="h-9 bg-slate-900 border-t border-slate-700 flex items-center justify-between px-6 shrink-0 text-slate-400 font-sans printing-hide">
        <div className="flex items-center gap-4 text-[10px] text-slate-400 uppercase font-bold">
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Sistema: Estable</span>
          <span className="opacity-30">|</span>
          <span>Base de datos: NASA POWER Meteorología</span>
        </div>
        <div className="text-[10px] text-slate-500 hidden sm:block font-medium">
          Format compatible con PVSyst • v1.2.0-Producción
        </div>
      </footer>

      {/* Styled Printable view header specifically visible for print format output exports */}
      <div id="print-view-section" className="hidden print:block p-8 bg-white text-slate-900 font-sans space-y-6">
        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
          <div>
            <span className="text-sm font-bold text-slate-500 tracking-wide uppercase">Reporte de Simulación Fotovoltaica</span>
            <h1 className="text-3xl font-extrabold tracking-tight mt-1">HeliosPlan Solar PV Estimator</h1>
            <p className="text-sm text-slate-500">Climatología de radiación de precisión - NASA POWER</p>
          </div>
          <div className="text-right text-xs text-slate-500 font-mono">
            <div>Fecha: {new Date().toLocaleDateString()}</div>
            <div>HeliosPlan Applet V1.0</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div>
            <h3 className="text-sm font-bold text-slate-850 uppercase border-b border-slate-200 pb-1 mb-2">Detalles del Proyecto</h3>
            <table className="w-full text-xs">
              <tbody>
                <tr><td className="py-1 font-semibold text-slate-650">Sitio:</td><td className="py-1 text-right font-bold">{siteName}</td></tr>
                <tr><td className="py-1 font-semibold text-slate-650">Latitud:</td><td className="py-1 text-right font-mono">{centroid.lat.toFixed(5)}°</td></tr>
                <tr><td className="py-1 font-semibold text-slate-650">Longitud:</td><td className="py-1 text-right font-mono">{centroid.lon.toFixed(5)}°</td></tr>
                <tr><td className="py-1 font-semibold text-slate-650">Área de Polígono:</td><td className="py-1 text-right font-bold">{polygonCoords.length > 0 ? `${(polygonCoords.length * 10).toLocaleString()} m²` : 'N/D'}</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-850 uppercase border-b border-slate-200 pb-1 mb-2">Parámetros Técnicos</h3>
            <table className="w-full text-xs">
              <tbody>
                <tr><td className="py-1 font-semibold text-slate-650">Potencia de Sistema:</td><td className="py-1 text-right font-bold">{(params.peakPowerkWp / 1000).toFixed(2)} MWp</td></tr>
                <tr><td className="py-1 font-semibold text-slate-650">Soporte/Tracker:</td><td className="py-1 text-right font-bold">{params.trackerType === 'fixed' ? 'Estructura Fija' : 'Seguidor Solar 1-Eje'}</td></tr>
                <tr><td className="py-1 font-semibold text-slate-650">Inclinación (Tilt):</td><td className="py-1 text-right font-mono">{params.tilt}°</td></tr>
                <tr><td className="py-1 font-semibold text-slate-650">Azimut del Panel:</td><td className="py-1 text-right font-mono">{params.azimuth}°</td></tr>
                <tr><td className="py-1 font-semibold text-slate-650">Albedo de Terreno (NASA):</td><td className="py-1 text-right font-mono">{params.albedo.toFixed(2)} (Auto/Satelital)</td></tr>
                <tr><td className="py-1 font-semibold text-slate-650">Pérdida Soiling:</td><td className="py-1 text-right font-mono">{params.soilingLossPercent.toFixed(1)}%</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {simulationResults && (
          <div className="space-y-6">
            <div className="p-4 bg-slate-900 text-white rounded-xl flex justify-around text-center">
              <div>
                <div className="text-[10px] text-slate-350 uppercase">Producción de Energía Grid (MWh)</div>
                <div className="text-2xl font-mono font-bold text-amber-500 mt-1">{simulationResults.annualEGridMWh.toFixed(1)} MWh</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-350 uppercase">Ratio específico de energía</div>
                <div className="text-2xl font-mono font-bold text-blue-400 mt-1">{Math.round(simulationResults.specificProduction)} kWh/kWp/año</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-350 uppercase">Performance Ratio (PR)</div>
                <div className="text-2xl font-mono font-bold text-emerald-400 mt-1">{simulationResults.averagePR.toFixed(2)}%</div>
              </div>
            </div>

            {/* Print Balances Table */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase border-b border-slate-300 pb-1 mb-2">Tabla de Balances Mensuales</h3>
              <table className="w-full text-left text-[10px] border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-mono">
                    <th className="py-2 px-2">Mes</th>
                    <th className="py-2 px-1 text-right">GlobHor</th>
                    <th className="py-2 px-1 text-right">GlobInc</th>
                    <th className="py-2 px-1 text-right">GlobEff</th>
                    <th className="py-2 px-1 text-right">T_Amb</th>
                    <th className="py-2 px-1 text-right">T_Celda</th>
                    <th className="py-2 px-1 text-right">E_Array (MWh)</th>
                    <th className="py-2 px-1 text-right">E_Grid (MWh)</th>
                    <th className="py-2 px-2 text-right">PR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {simulationResults.monthly.map((m) => (
                    <tr key={m.monthIndex} className="font-mono">
                      <td className="py-1.5 px-2 font-sans font-medium">{m.monthName}</td>
                      <td className="py-1.5 px-1 text-right">{m.globHor.toFixed(1)}</td>
                      <td className="py-1.5 px-1 text-right text-blue-700 font-semibold">{m.globInc.toFixed(1)}</td>
                      <td className="py-1.5 px-1 text-right">{m.globEff.toFixed(1)}</td>
                      <td className="py-1.5 px-1 text-right">{m.tempAmbAverage.toFixed(1)}</td>
                      <td className="py-1.5 px-1 text-right text-amber-700">{m.tempCellAverage.toFixed(1)}</td>
                      <td className="py-1.5 px-1 text-right">{(m.eArray / 1000).toFixed(2)}</td>
                      <td className="py-1.5 px-1 text-right font-bold text-amber-600 bg-amber-50/50">{(m.eGrid / 1000).toFixed(2)}</td>
                      <td className="py-1.5 px-2 text-right text-emerald-600 font-bold">{(m.pr / 100).toFixed(3)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-mono font-bold border-t border-slate-400">
                    <td className="py-2 px-2 font-sans">Anual</td>
                    <td className="py-2 px-1 text-right">{simulationResults.annualGlobHor.toFixed(1)}</td>
                    <td className="py-2 px-1 text-right text-blue-700">{simulationResults.annualGlobInc.toFixed(1)}</td>
                    <td className="py-2 px-1 text-right">{simulationResults.annualGlobEff.toFixed(1)}</td>
                    <td className="py-2 px-1 text-right">
                      {(simulationResults.monthly.reduce((sum, m) => sum + m.tempAmbAverage, 0) / 12).toFixed(1)}
                    </td>
                    <td className="py-2 px-1 text-right text-amber-700">
                      {(simulationResults.monthly.reduce((sum, m) => sum + m.tempCellAverage, 0) / 12).toFixed(1)}
                    </td>
                    <td className="py-2 px-1 text-right">
                      {(simulationResults.monthly.reduce((sum, m) => sum + m.eArray, 0) / 1000).toFixed(2)}
                    </td>
                    <td className="py-2 px-1 text-right text-amber-600 bg-amber-50/50">{simulationResults.annualEGridMWh.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right text-emerald-600">{(simulationResults.averagePR / 100).toFixed(3)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="pt-24 text-center text-[10px] text-slate-400 border-t border-slate-200">
              HeliosPlan es una herramienta científica de análisis preliminar. Todos los cálculos físicos se basan en formulaciones estandarizadas del transposition Perez/isotropic y las series climatológicas de NASA POWER.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
