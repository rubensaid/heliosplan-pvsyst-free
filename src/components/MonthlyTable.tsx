import React from 'react';
import { SimulationResults } from '../types';
import { Database, FileSpreadsheet } from 'lucide-react';

interface MonthlyTableProps {
  results: SimulationResults;
}

export default function MonthlyTable({ results }: MonthlyTableProps) {
  
  // Calculate average of temperatures and averages
  const avgTempAmb = results.monthly.reduce((sum, m) => sum + m.tempAmbAverage, 0) / 12;
  const avgTempCell = results.monthly.reduce((sum, m) => sum + m.tempCellAverage, 0) / 12;

  // Exports table data to CSV format
  const exportToCSV = () => {
    const headers = [
      'Mes',
      'GlobHor (kWh/m2)',
      'DiffHor (kWh/m2)',
      'GlobInc (kWh/m2)',
      'GlobEff (kWh/m2)',
      'T_Amb (deg C)',
      'T_Cell (deg C)',
      'E_Array (MWh)',
      'E_Grid (MWh)',
      'PR'
    ];

    const rows = results.monthly.map((m) => [
      m.monthName,
      m.globHor.toFixed(1),
      m.diffHor.toFixed(1),
      m.globInc.toFixed(1),
      m.globEff.toFixed(1),
      m.tempAmbAverage.toFixed(1),
      m.tempCellAverage.toFixed(1),
      (m.eArray / 1000).toFixed(2),
      (m.eGrid / 1000).toFixed(2),
      (m.pr / 100).toFixed(3)
    ]);

    // Add Annual row
    rows.push([
      'Anual (Año 1)',
      results.annualGlobHor.toFixed(1),
      results.monthly.reduce((sum, m) => sum + m.diffHor, 0).toFixed(1),
      results.annualGlobInc.toFixed(1),
      results.annualGlobEff.toFixed(1),
      avgTempAmb.toFixed(1),
      avgTempCell.toFixed(1),
      (results.monthly.reduce((sum, m) => sum + m.eArray, 0) / 1000).toFixed(2),
      results.annualEGridMWh.toFixed(2),
      (results.averagePR / 100).toFixed(3)
    ]);

    const csvContent = 
      'data:text/csv;charset=utf-8,' + 
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'HeliosPlan_Simulacion_Mapeo.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Tabla de Balances y Resultados de Simulación</h3>
            <p className="text-xs text-slate-500">Resultados detallados periodo de año no. 1 por mes</p>
          </div>
        </div>

        <button
          onClick={exportToCSV}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-all cursor-pointer"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Descargar CSV
        </button>
      </div>

      {/* Responsive custom-scroll table wrapper */}
      <div className="overflow-x-auto rounded-lg border border-slate-100 shadow-sm">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200/60 font-mono text-[11px] text-slate-500 uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold">Mes</th>
              <th className="py-3 px-3 font-semibold text-right" title="Global Horizontal Irradiance">GlobHor <span className="text-[10px] text-slate-400">kWh/m²</span></th>
              <th className="py-3 px-3 font-semibold text-right" title="Diffuse Horizontal Irradiance">DiffHor <span className="text-[10px] text-slate-400">kWh/m²</span></th>
              <th className="py-3 px-3 font-semibold text-right" title="Global incident in collector plane">GlobInc <span className="text-[10px] text-slate-400">kWh/m²</span></th>
              <th className="py-3 px-3 font-semibold text-right" title="Effective global radiation correcting for soiling and incidence factor">GlobEff <span className="text-[10px] text-slate-400">kWh/m²</span></th>
              <th className="py-3 px-3 font-semibold text-right" title="Ambient temp average">T_Amb <span className="text-[10px] text-slate-400">°C</span></th>
              <th className="py-3 px-3 font-semibold text-right" title="Average module operating temperature">T_Celda <span className="text-[10px] text-slate-400">°C</span></th>
              <th className="py-3 px-3 font-semibold text-right" title="Energy output from PV arrays prior to inverter conversion">E_Array <span className="text-[10px] text-slate-400">MWh</span></th>
              <th className="py-3 px-3 font-semibold text-right" title="AC output power injected back to grid">E_Grid <span className="text-[10px] text-slate-400">MWh</span></th>
              <th className="py-3 px-4 font-semibold text-right" title="Performance ratio fraction">PR <span className="text-[10px] text-slate-400">ratio</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
            {results.monthly.map((m) => {
              const eArrayMWh = m.eArray / 1000;
              const eGridMWh = m.eGrid / 1000;
              
              return (
                <tr key={m.monthIndex} className="hover:bg-slate-50/50 transition-colors font-mono">
                  <td className="py-3 px-4 font-sans font-medium text-slate-900">{m.monthName}</td>
                  <td className="py-3 px-3 text-right font-semibold">{m.globHor.toFixed(1)}</td>
                  <td className="py-3 px-3 text-right text-slate-500">{m.diffHor.toFixed(1)}</td>
                  <td className="py-3 px-3 text-right font-semibold text-blue-600">{m.globInc.toFixed(1)}</td>
                  <td className="py-3 px-3 text-right text-slate-600">{m.globEff.toFixed(1)}</td>
                  <td className="py-3 px-3 text-right text-slate-500">{m.tempAmbAverage.toFixed(1)}</td>
                  <td className="py-3 px-3 text-right text-amber-700">{m.tempCellAverage.toFixed(1)}</td>
                  <td className="py-3 px-3 text-right font-semibold text-slate-850">{eArrayMWh.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right font-bold text-amber-600 bg-amber-50/10">{eGridMWh.toFixed(2)}</td>
                  <td className="py-3 px-4 text-right font-bold text-emerald-600">{(m.pr / 100).toFixed(3)}</td>
                </tr>
              );
            })}
            
            {/* Aggregate Annual / Sum row */}
            <tr className="bg-slate-50/90 font-mono font-bold border-t-2 border-slate-200 text-slate-900">
              <td className="py-3.5 px-4 font-sans text-xs uppercase tracking-wider">Anual (Año 1)</td>
              <td className="py-3.5 px-3 text-right">{results.annualGlobHor.toFixed(1)}</td>
              <td className="py-3.5 px-3 text-right text-slate-500">
                {results.monthly.reduce((sum, m) => sum + m.diffHor, 0).toFixed(1)}
              </td>
              <td className="py-3.5 px-3 text-right text-blue-700">{results.annualGlobInc.toFixed(1)}</td>
              <td className="py-3.5 px-3 text-right text-slate-600">{results.annualGlobEff.toFixed(1)}</td>
              <td className="py-3.5 px-3 text-right text-slate-500">{avgTempAmb.toFixed(1)}</td>
              <td className="py-3.5 px-3 text-right text-amber-700">{avgTempCell.toFixed(1)}</td>
              <td className="py-3.5 px-3 text-right text-slate-800">
                {(results.monthly.reduce((sum, m) => sum + m.eArray, 0) / 1000).toFixed(2)}
              </td>
              <td className="py-3.5 px-3 text-right text-amber-700 bg-amber-50/20">{results.annualEGridMWh.toFixed(2)}</td>
              <td className="py-3.5 px-4 text-right text-emerald-700">{(results.averagePR / 100).toFixed(3)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
