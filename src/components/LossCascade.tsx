import React from 'react';
import { LossSegment } from '../types';
import { ArrowDownRight, ArrowUpRight, ShieldCheck, Zap, Info } from 'lucide-react';

interface LossCascadeProps {
  cascade: LossSegment[];
  peakPower: number;
}

export default function LossCascade({ cascade, peakPower }: LossCascadeProps) {
  // Find initial value for scale
  const ghiStep = cascade.find((s) => s.name.includes('GHI'))?.value || 1;
  const globIncStep = cascade.find((s) => s.name.includes('GlobInc'))?.value || 1;
  
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 md:p-6">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
        <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
          <Zap className="w-5 h-5" id="energy-loss-icon" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-900">Diagrama de Cascadas y Pérdidas del Proyecto</h3>
          <p className="text-xs text-slate-500">Representación lógica de la transformación de energía (PVSyst-style)</p>
        </div>
      </div>

      <div className="relative pl-6 md:pl-8 space-y-4">
        {/* Central Vertical Connector Line */}
        <div className="absolute left-3.5 md:left-5 top-2 bottom-6 w-0.5 border-l-2 border-dashed border-slate-200"></div>

        {cascade.map((step, idx) => {
          const isMilestone = step.type === 'intermediate';
          const isLoss = step.type === 'loss';
          const isGain = step.type === 'gain';

          let icon = null;
          let badgeColor = '';
          let boxBorderColor = '';

          if (isMilestone) {
            icon = <ShieldCheck className="w-4 h-4 text-white" />;
            badgeColor = 'bg-blue-600';
            boxBorderColor = 'border-l-4 border-l-blue-600 bg-slate-50';
          } else if (isLoss) {
            icon = <ArrowDownRight className="w-4 h-4 text-rose-600" />;
            badgeColor = 'bg-rose-100 text-rose-800';
            boxBorderColor = 'border-l-4 border-l-rose-200 bg-rose-50/20';
          } else if (isGain) {
            icon = <ArrowUpRight className="w-4 h-4 text-emerald-600" />;
            badgeColor = 'bg-emerald-100 text-emerald-800';
            boxBorderColor = 'border-l-4 border-l-emerald-200 bg-emerald-50/20';
          }

          // Format numeric values depending on whether it's radiation (kWh/m2) or energy (kWh)
          const isIrradiance = step.name.includes('GHI') || step.name.includes('GlobInc') || step.name.includes('IAM') || step.name.includes('suciedad');
          const valueUnit = isIrradiance ? 'kWh/m²' : 'kWh/año';
          const formattedValue = step.value >= 1000000 
            ? `${(step.value / 1000000).toFixed(2)} GWh/año` 
            : step.value >= 1000 
              ? `${(step.value / 1000).toFixed(1)} MWh/año` 
              : `${step.value.toFixed(0)} ${valueUnit}`;

          return (
            <div 
              key={idx} 
              className={`relative flex flex-col md:flex-row md:items-center justify-between p-3 rounded-lg border border-slate-100 transition-all hover:shadow-sm ${boxBorderColor}`}
            >
              {/* Timeline dot / indicator node attached to dashed vertical path */}
              <div className="absolute -left-[30px] md:-left-[35px] top-4 z-10 flex items-center justify-center">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shadow ${isMilestone ? 'bg-blue-600' : isLoss ? 'bg-rose-400' : 'bg-emerald-400'}`}>
                  {icon}
                </div>
              </div>

              {/* Step info */}
              <div className="flex-1 pr-4">
                <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider block ${isMilestone ? 'text-blue-700' : ''}`}>
                  {isMilestone ? 'Hito energético' : isLoss ? 'Pérdida de rendimiento' : 'Ganancia por entorno'}
                </span>
                <span className="font-medium text-slate-800 text-sm md:text-base">{step.name}</span>
              </div>

              {/* Values & Percentage Badges */}
              <div className="flex items-center gap-3 mt-2 md:mt-0 justify-between md:justify-end border-t border-slate-100/50 md:border-t-0 pt-2 md:pt-0">
                <span className="font-mono text-xs md:text-sm font-semibold text-slate-700 text-right">
                  {formattedValue}
                </span>

                {step.lossPercent !== 0 && (
                  <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold flex items-center gap-0.5 ${badgeColor}`}>
                    {step.lossPercent > 0 ? '+' : ''}
                    {step.lossPercent.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 p-3.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800 flex items-start gap-2.5">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <span className="font-bold">Interpretación del flujo:</span> Las pérdidas reflejan el desgaste de potencia desde la radiación cruda (GHI sobre plano horizontal), la conversión angular dependiente de inclinación o trackers, los límites de eficiencia por temperatura en celdas, el desajuste de paneles, la conversión y límites del inversor, y finalmente la potencia neta inyectada al nodo (EGrid) al año 1.
        </div>
      </div>
    </div>
  );
}
