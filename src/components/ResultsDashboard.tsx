import React, { useState } from 'react';
import { SimulationResults } from '../types';
import { 
  Sun, BatteryCharging, Percent, Calendar, Database,
  TrendingUp, Compass, ThermometerSun, FileText,
  Download, Printer, X, HelpCircle
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  Legend, ResponsiveContainer, LineChart, Line 
} from 'recharts';

interface ResultsDashboardProps {
  results: SimulationResults;
  siteName: string;
  latitude: number;
  longitude: number;
  peakPowerkWp: number;
  trackerType: string;
  onPrintReport: () => void;
  albedo: number;
  tilt: number;
  azimuth: number;
}

export default function ResultsDashboard({
  results,
  siteName,
  latitude,
  longitude,
  peakPowerkWp,
  trackerType,
  onPrintReport,
  albedo,
  tilt,
  azimuth
}: ResultsDashboardProps) {
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Prepare chart data
  const chartData = results.monthly.map((m) => ({
    name: m.monthName.substring(0, 3),
    'GHI Horiz. (kWh/m²)': Math.round(m.globHor),
    'GHI Inclined (kWh/m²)': Math.round(m.globInc),
    'Prod. Inyectada (MWh)': Math.round(m.eGrid / 1000),
    'PR (%)': Math.round(m.pr)
  }));

  const getTrackerLabel = (type: string) => {
    if (type === 'fixed') return 'Estructura Fija';
    if (type === '1axis') return 'Tracker 1-Eje N-S';
    return 'Tracker Dual-Axis';
  };

  // Modern robust CSV download with UTF-8 BOM so Excel displays accents and symbols beautifully
  const handleDownloadCSV = () => {
    let csvContent = '\uFEFF'; // Byte Order Mark (BOM) for Excel UTF-8 support
    
    // Header
    csvContent += `HELIOSPLAN - REPORTE DE SIMULACIÓN ENERGÉTICA SOLAR FOTOVOLTAICA\r\n`;
    csvContent += `Fecha de Simulación;${new Date().toLocaleDateString()} a las ${new Date().toLocaleTimeString()}\r\n`;
    csvContent += `\r\n`;
    
    // Project Info
    csvContent += `DATOS GENERALES DEL PROYECTO\r\n`;
    csvContent += `Nombre del Sitio;"${siteName.replace(/"/g, '""')}"\r\n`;
    csvContent += `Latitud decimal;${latitude.toFixed(6)}°\r\n`;
    csvContent += `Longitud decimal;${longitude.toFixed(6)}°\r\n`;
    csvContent += `\r\n`;
    
    // Technical Configuration
    csvContent += `CONFIGURACIÓN TÉCNICA REGLAMENTARIA\r\n`;
    csvContent += `Potencia Pico Instalada;${peakPowerkWp} kWp (${(peakPowerkWp / 1000).toFixed(2)} MWp)\r\n`;
    csvContent += `Tipo de Estructura de Soporte;${getTrackerLabel(trackerType)}\r\n`;
    csvContent += `Inclinación fija (Tilt);${tilt}°\r\n`;
    csvContent += `Azimut de paneles;${azimuth}°\r\n`;
    csvContent += `Albedo considerado (NASA POWER satelital);${albedo.toFixed(2)}\r\n`;
    csvContent += `\r\n`;
    
    // KPI General Results
    csvContent += `SÍNTESIS DE RESULTADOS GENERALES (AÑO 1)\r\n`;
    csvContent += `Generación de Energía Inyectada a Red;${results.annualEGridMWh.toFixed(2)} MWh/año\r\n`;
    csvContent += `Productividad Específica;${Math.round(results.specificProduction)} kWh/kWp/año\r\n`;
    csvContent += `Performance Ratio General (PR);${results.averagePR.toFixed(2)}%\r\n`;
    csvContent += `Radiación Global Horizontal (GHI);${Math.round(results.annualGlobHor)} kWh/m2/año\r\n`;
    csvContent += `Radiación Global Incidente s/Plano de Captación;${Math.round(results.annualGlobInc)} kWh/m2/año\r\n`;
    csvContent += `\r\n`;

    // Monthly Table
    csvContent += `BALANCE DEL SISTEMA FOTOVOLTAICO MES A MES\r\n`;
    csvContent += `Mes;GlobHor (kWh/m2);DiffHor (kWh/m2);GlobInc (kWh/m2);GlobEff (kWh/m2);T_Amb (C);T_Celda (C);E_Array (MWh);E_Grid (MWh);PR (Ratio)\r\n`;
    
    results.monthly.forEach((m) => {
      csvContent += `${m.monthName};${m.globHor.toFixed(1)};${m.diffHor.toFixed(1)};${m.globInc.toFixed(1)};${m.globEff.toFixed(1)};${m.tempAmbAverage.toFixed(1)};${m.tempCellAverage.toFixed(1)};${(m.eArray / 1000).toFixed(2)};${(m.eGrid / 1000).toFixed(2)};${(m.pr / 100).toFixed(3)}\r\n`;
    });
    
    // Totals row
    const totalEArray = results.monthly.reduce((sum, m) => sum + m.eArray, 0) / 1000;
    const avgTempAmb = results.monthly.reduce((sum, m) => sum + m.tempAmbAverage, 0) / 12;
    const avgTempCell = results.monthly.reduce((sum, m) => sum + m.tempCellAverage, 0) / 12;
    const totalDiffHor = results.monthly.reduce((sum, m) => sum + m.diffHor, 0);

    csvContent += `Anual (Año 1);${results.annualGlobHor.toFixed(1)};${totalDiffHor.toFixed(1)};${results.annualGlobInc.toFixed(1)};${results.annualGlobEff.toFixed(1)};${avgTempAmb.toFixed(1)};${avgTempCell.toFixed(1)};${totalEArray.toFixed(2)};${results.annualEGridMWh.toFixed(2)};${(results.averagePR / 100).toFixed(3)}\r\n`;
    
    // Create Blob and click download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    
    const cleanSiteName = siteName.normalize("NFD").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase().substring(0, 30);
    link.download = `reporte_heliosplan_${cleanSiteName || 'proyecto'}.csv`;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fade-in" id="results-dashboard">
      
      {/* Header and Quick Summary */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-900 text-white p-5 rounded-xl">
        <div>
          <span className="text-amber-400 font-mono text-[10px] uppercase tracking-widest font-bold">Resumen de Simulación Año 1</span>
          <h2 className="text-lg md:text-xl font-bold tracking-tight">{siteName}</h2>
          <div className="text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1.5 mt-2 font-mono">
            <span className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-350">Lat: {latitude.toFixed(5)}°</span>
            <span className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-350">Lon: {longitude.toFixed(5)}°</span>
            <span className="bg-slate-850 px-1.5 py-0.5 rounded text-white border border-amber-500/20">Potencia: {(peakPowerkWp / 1000).toFixed(2)} MWp</span>
            <span className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">Soporte: {getTrackerLabel(trackerType)}</span>
            <span className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-300">Albedo (NASA): {albedo.toFixed(2)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExportModalOpen(true)}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 font-bold rounded-lg text-xs md:text-sm text-slate-950 shadow flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
        >
          <FileText className="w-4 h-4" />
          Exportar Informes
        </button>
      </div>

      {/* Primary KPI Card Block */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
        
        {/* KPI 1: EGrid Production */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">PRODUCCIÓN ANUAL RED</p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-light text-slate-900 tracking-tight">
              {results.annualEGridMWh.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </span>
            <span className="text-xs font-bold text-slate-500">MWh</span>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
            <span>Inyección de red neta</span>
            <span className="text-emerald-500 font-bold font-mono">CC &rarr; CA</span>
          </div>
        </div>

        {/* KPI 2: Specific Production Ratio */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">PRODUCTIVIDAD ESPECÍFICA</p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-light text-slate-900 tracking-tight">
              {Math.round(results.specificProduction).toLocaleString()}
            </span>
            <span className="text-xs font-bold text-slate-500">kWh/kWp/año</span>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
            <span>Eficiencia específica</span>
            <span className="text-blue-500 font-bold font-mono">Despeño</span>
          </div>
        </div>

        {/* KPI 3: Performance Ratio PR */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">PERFORMANCE RATIO</p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-light text-amber-600 tracking-tight">
              {results.averagePR.toFixed(2)}
            </span>
            <span className="text-xs font-bold text-amber-600">%</span>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
            <span>Eficiencia total de planta</span>
            <span className="text-amber-500 font-bold font-mono">PR</span>
          </div>
        </div>

        {/* KPI 4: Solar Irradiation On Plane */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">RADIACIÓN INC. PLANA</p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-light text-slate-900 tracking-tight">
              {Math.round(results.annualGlobInc).toLocaleString()}
            </span>
            <span className="text-xs font-bold text-slate-500">kWh/m²</span>
          </div>
          <div className="pt-2 mt-2 border-t border-slate-100 flex flex-col gap-0.5 text-[10px] text-slate-500">
            <div className="flex justify-between">
              <span>GHI Horizontal:</span>
              <span className="font-mono">{Math.round(results.annualGlobHor)}</span>
            </div>
            <div className="flex justify-between text-indigo-600 font-medium">
              <span>Albedo considerado:</span>
              <span className="font-mono">{albedo.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* CHART 1: Monthly Production */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-amber-500" />
            Distribución Mensual de Producción Inyectada
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} unit="M" />
                <Tooltip cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="Prod. Inyectada (MWh)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 2: GHI Horizontal vs GHI Inclined */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-1.5">
            <ThermometerSun className="w-4 h-4 text-blue-500" />
            Ganancia por Transposición de Radiación Solar
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                <Line type="monotone" dataKey="GHI Horiz. (kWh/m²)" stroke="#94a3b8" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="GHI Inclined (kWh/m²)" stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Export Options Interactive Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-100 transform transition-all my-8">
            
            {/* Modal Header */}
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-amber-500" />
                <div className="text-left">
                  <h3 className="text-sm font-bold tracking-tight">Exportar Reportes de Simulación</h3>
                  <p className="text-[10px] text-slate-400">Balances energéticos e informes técnicos HeliosPlan</p>
                </div>
              </div>
              <button 
                onClick={() => setIsExportModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              
              {/* Option 1: CSV Excel */}
              <div className="p-4 rounded-xl border border-slate-200 hover:border-emerald-300 bg-slate-50/50 hover:bg-emerald-50/5 transition-all text-left group">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
                  <span className="w-1.5 h-3 bg-emerald-500 rounded-xs"></span>
                  Balances en CSV (Para Excel y PVSyst)
                </div>
                <p className="text-slate-600 text-xs mt-2 leading-relaxed">
                  Exporta una base de datos estructurada con toda la información técnica: coordenadas georeferenciadas reales, variables de diseño, factores de diseño solar y los balances de producción fotovoltaica mes a mes.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    handleDownloadCSV();
                    setIsExportModalOpen(false);
                  }}
                  className="w-full mt-4 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 font-bold rounded-xl text-xs text-white shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Descargar Hoja de Excel (CSV)
                </button>
              </div>

              {/* Option 2: PDF Print with diagnostic note */}
              <div className="p-4 rounded-xl border border-slate-200 hover:border-slate-350 bg-slate-50/50 hover:bg-slate-50 transition-all text-left">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider mb-2">
                  <span className="w-1.5 h-3 bg-slate-800 rounded-xs"></span>
                  Imprimir Ficha Técnica Oficial (PDF)
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onPrintReport();
                    setIsExportModalOpen(false);
                  }}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 font-bold rounded-xl text-xs text-white shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  Abrir Panel de Impresión
                </button>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="px-4 py-1.5 border border-slate-200 hover:bg-slate-100 font-semibold rounded-lg text-xs text-slate-700 transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
