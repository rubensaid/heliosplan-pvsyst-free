export interface Coords {
  lat: number;
  lon: number;
  alt?: number;
}

export interface PolygonData {
  coords: Coords[];
  centroid: Coords;
  areaSqm: number;
  name?: string;
}

export type TrackerType = 'fixed' | '1axis' | '2axis';

export interface PVParams {
  peakPowerkWp: number;
  tilt: number;
  azimuth: number;
  trackerType: TrackerType;
  gcr: number; // e.g., 0.366 (36.6%)
  trackerMaxAngle: number; // e.g., 60 degrees
  backtracking: boolean;
  albedo: number; // e.g., 0.20
  
  // Losses (%)
  soilingLossPercent: number; // e.g., 3.5%
  lidLossPercent: number; // e.g., 0.6%
  moduleQualityLossPercent: number; // e.g., -0.8% (gain)
  mismatchLossPercent: number; // e.g., 2.0%
  dcWiringLossPercent: number; // e.g., 1.5%
  inverterEffPercent: number; // e.g., 98.2%
  tempCoeffPercent: number; // e.g., -0.35% / dec C
  ucThermal: number; // W/m2K (default 29)
  uvThermal: number; // W/m2K/m/s (default 0)
  acWiringLossPercent: number; // e.g., 1.5%
  transformerLossPercent: number; // e.g., 1.0%
}

export interface SolarMeteorologyMonth {
  monthName: string;
  monthIndex: number; // 0-11
  globHor: number; // kWh/m2/day
  diffHor: number; // kWh/m2/day
  tempAmb: number; // °C
  windSpeed: number; // m/s
  albedo?: number; // month-level ground albedo
}

export interface SimulationMonthResult {
  monthIndex: number;
  monthName: string;
  globHor: number;      // kWh/m2 (summed)
  diffHor: number;      // kWh/m2 (summed)
  globInc: number;      // kWh/m2 (incident on collector)
  globEff: number;      // kWh/m2 (after shading/IAM/soiling)
  tempAmbAverage: number;   // °C
  tempCellAverage: number;  // °C
  eArray: number;       // kWh (output of solar array)
  eGrid: number;        // kWh (output clean injected to grid)
  pr: number;           // % (monthly performance ratio)
}

export interface LossSegment {
  name: string;
  value: number; // absolute value or remaining index
  lossPercent: number; // change percentage e.g. -3.5% or +25%
  type: 'gain' | 'loss' | 'intermediate';
}

export interface SimulationResults {
  monthly: SimulationMonthResult[];
  annualGlobHor: number;    // kWh/m2/year
  annualGlobInc: number;    // kWh/m2/year
  annualGlobEff: number;    // kWh/m2/year
  annualEGridkWh: number;   // kWh/year
  annualEGridMWh: number;   // MWh/year
  specificProduction: number; // kWh/kWp/year
  averagePR: number;        // %
  lossCascade: LossSegment[];
}
