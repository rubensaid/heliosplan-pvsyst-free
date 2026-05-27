import { 
  PVParams, 
  SolarMeteorologyMonth, 
  SimulationMonthResult, 
  SimulationResults, 
  LossSegment 
} from '../types';

// Standard month names in Spanish for the report Output
export const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Fallback meteorological data for Catacaos, Peru from the user's PVSyst synthetic profile
export const CATACAOS_METEO_FALLBACK: SolarMeteorologyMonth[] = [
  { monthName: 'Enero', monthIndex: 0, globHor: 5.95, diffHor: 2.61, tempAmb: 26.0, windSpeed: 2.1 },
  { monthName: 'Febrero', monthIndex: 1, globHor: 5.65, diffHor: 2.57, tempAmb: 26.9, windSpeed: 2.3 },
  { monthName: 'Marzo', monthIndex: 2, globHor: 5.92, diffHor: 2.49, tempAmb: 26.8, windSpeed: 2.0 },
  { monthName: 'Abril', monthIndex: 3, globHor: 6.01, diffHor: 2.29, tempAmb: 25.8, windSpeed: 2.1 },
  { monthName: 'Mayo', monthIndex: 4, globHor: 5.43, diffHor: 2.15, tempAmb: 24.4, windSpeed: 1.9 },
  { monthName: 'Junio', monthIndex: 5, globHor: 4.89, diffHor: 2.02, tempAmb: 22.8, windSpeed: 1.8 },
  { monthName: 'Julio', monthIndex: 6, globHor: 5.06, diffHor: 2.00, tempAmb: 21.8, windSpeed: 1.9 },
  { monthName: 'Agosto', monthIndex: 7, globHor: 5.70, diffHor: 2.17, tempAmb: 21.5, windSpeed: 2.0 },
  { monthName: 'Septiembre', monthIndex: 8, globHor: 6.44, diffHor: 2.44, tempAmb: 21.9, windSpeed: 2.2 },
  { monthName: 'Octubre', monthIndex: 9, globHor: 6.52, diffHor: 2.50, tempAmb: 22.1, windSpeed: 2.1 },
  { monthName: 'Noviembre', monthIndex: 10, globHor: 6.48, diffHor: 2.56, tempAmb: 22.7, windSpeed: 2.0 },
  { monthName: 'Diciembre', monthIndex: 11, globHor: 6.25, diffHor: 2.63, tempAmb: 24.3, windSpeed: 2.2 },
];

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const REPRESENTATIVE_DAY_OF_YEAR = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];

/**
 * Executes a high-fidelity solar simulation.
 * Calculates hourly Sun position for a representative day in each month,
 * transposes GHI to GlobInc depending on tilt/azimuth/trackers,
 * and cascades losses in standard PVsyst style.
 */
export function runPVSimulation(
  lat: number, 
  lon: number, 
  meteoData: SolarMeteorologyMonth[], 
  params: PVParams
): SimulationResults {
  const monthlyResults: SimulationMonthResult[] = [];
  
  let totalGlobHor = 0;
  let totalGlobInc = 0;
  let totalGlobEff = 0;
  let totalEArray = 0;
  let totalEGrid = 0;
  
  let weightedTempAmb = 0;
  let weightedTempCell = 0;
  let weightedMeteoRadiation = 0;

  // Track loss items for the cascade
  let lossGhiTotal = 0; // Cumulative horizontal radiation in kWh
  let lossGlobIncTotal = 0; // Cumulative on plane
  
  const latRad = (lat * Math.PI) / 180.0;

  for (let m = 0; m < 12; m++) {
    const monthMeteo = meteoData[m];
    const numDays = DAYS_IN_MONTH[m];
    const repDay = REPRESENTATIVE_DAY_OF_YEAR[m];
    
    // Monthly totals of meteorology
    const mGlobHorDaily = monthMeteo.globHor; // kWh/m2/day
    const mDiffHorDaily = monthMeteo.diffHor; // kWh/m2/day
    const mTempAmb = monthMeteo.tempAmb;
    const mWindSpeed = monthMeteo.windSpeed;
    
    // Declination for this representative day
    // Declination delta (degrees)
    const declinationDeg = 23.45 * Math.sin((360.0 / 365.0) * (284 + repDay) * (Math.PI / 180.0));
    const declinationRad = (declinationDeg * Math.PI) / 180.0;
    
    let sumHourGlobHorOnPlane = 0;
    let sumHourGlobIncOnPlane = 0;
    let sumHourTempCell = 0;
    let sunHoursInMonth = 0;
    
    // Run 24 hours simulation for the representative day
    for (let h = 0; h < 24; h++) {
      const hourVal = h + 0.5; // middle of the hour
      const hourAngleDeg = 15.0 * (hourVal - 12.0); // hour angle (deg)
      const hourAngleRad = (hourAngleDeg * Math.PI) / 180.0;
      
      // Solar altitude (elevation) angle alpha
      const sinAltitude = Math.sin(latRad) * Math.sin(declinationRad) + 
                          Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad);
      
      const altitudeRad = Math.asin(Math.max(-1.0, Math.min(1.0, sinAltitude)));
      const altitudeDeg = (altitudeRad * 180.0) / Math.PI;
      
      if (altitudeDeg <= 0) {
        continue; // Sun is below the horizon
      }
      
      // Solar azimuth angle (0 is South, negative East, positive West)
      // cosZenith = sinAltitude
      const cosZenith = sinAltitude;
      const zenithRad = Math.acos(Math.max(-1.0, Math.min(1.0, cosZenith)));
      
      let sinAzimuth = (Math.cos(declinationRad) * Math.sin(hourAngleRad)) / Math.sin(zenithRad);
      sinAzimuth = Math.max(-1.0, Math.min(1.0, sinAzimuth));
      // Standard solar azimuth
      let solarAzimuthRad = Math.asin(sinAzimuth);
      // Correction for quadrant
      const cosAzimuth = (sinAltitude * Math.sin(latRad) - Math.sin(declinationRad)) / (cosZenith * Math.cos(latRad));
      if (cosAzimuth < 0) {
        solarAzimuthRad = Math.sign(solarAzimuthRad) * Math.PI - solarAzimuthRad;
      }
      
      // Extraterrestrial horizontal radiation for this hour
      const solarConstant = 1.367; // kW/m2
      const eccentricity = 1.0 + 0.033 * Math.cos((360.0 * repDay / 365.0) * (Math.PI / 180.0));
      const I_o = solarConstant * eccentricity * Math.max(0.01, sinAltitude);
      
      // Calculate daily fraction of extraterrestrial radiation received this hour
      // This is used to distribute the daily horizontal radiation
      let totalExtraterrestrialDay = 0;
      for (let h_i = 0; h_i < 24; h_i++) {
        const hAngle = 15.0 * (h_i + 0.5 - 12.0) * (Math.PI / 180.0);
        const sin_alt = Math.sin(latRad) * Math.sin(declinationRad) + 
                        Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(hAngle);
        if (sin_alt > 0) {
          totalExtraterrestrialDay += solarConstant * eccentricity * sin_alt;
        }
      }
      
      const hourlyFraction = totalExtraterrestrialDay > 0 ? I_o / totalExtraterrestrialDay : 0;
      
      // Hourly incident horizontal energy (kW/m2)
      const I_global_hor = mGlobHorDaily * hourlyFraction;
      const I_diffuse_hor = mDiffHorDaily * hourlyFraction;
      const I_beam_hor = Math.max(0, I_global_hor - I_diffuse_hor);
      
      // Configure tracker geometry
      let beta = 0; // panel tilt, radians
      let gammaPanel = 0; // panel azimuth relative to South, radians
      
      if (params.trackerType === 'fixed') {
        beta = (params.tilt * Math.PI) / 180.0;
        gammaPanel = (params.azimuth * Math.PI) / 180.0;
      } else if (params.trackerType === '1axis') {
        // Horizontal N-S oriented axis tracking East-to-West.
        // Rotation axis is North-South. Let's compute the mathematical ideal tracking angle:
        // Ideal tracking angle rotIdeal around North-South axis
        const Sx = Math.cos(declinationRad) * Math.sin(hourAngleRad);
        const Sz = sinAltitude;
        let rotAngleRad = Math.atan2(Sx, Sz); // East-West tracking angle
        
        // Apply max tracker angle limit
        const maxAngleRad = (params.trackerMaxAngle * Math.PI) / 180.0;
        if (Math.abs(rotAngleRad) > maxAngleRad) {
          rotAngleRad = Math.sign(rotAngleRad) * maxAngleRad;
        }
        
        // Backtracking implementation
        if (params.backtracking && Math.abs(altitudeDeg) > 0) {
          // Standard backtracking equation:
          // We adjust the rotation to avoid shading on adjacent rows.
          // The critical incidence occurs when cos(rotAngleRad) < GCR
          const gcr = params.gcr;
          const cosRot = Math.cos(rotAngleRad);
          if (cosRot < gcr) {
            // Shadow would occur, adjust tracking angle back to lower/flatter angle
            const btAngle = Math.sign(rotAngleRad) * Math.acos(Math.min(1.0, gcr / Math.max(0.01, Math.cos(altitudeRad))));
            if (!isNaN(btAngle)) {
              rotAngleRad = btAngle;
            }
          }
        }
        
        // Compute the resulting cell slope and azimuth
        beta = Math.abs(rotAngleRad);
        gammaPanel = rotAngleRad < 0 ? -Math.PI / 2.0 : Math.PI / 2.0; // Negative rot = East, positive rot = West
      } else if (params.trackerType === '2axis') {
        // Ideal tracking 2-Axis: Panel follows the sun perfectly
        beta = zenithRad;
        gammaPanel = solarAzimuthRad;
      }
      
      // Calculate incidence angle theta on the tilted/tracked plane
      // cosTheta = cosBeta * cosZenith + sinBeta * sinZenith * cos(solarAzimuth - gammaPanel)
      const cosIncidence = Math.cos(beta) * cosZenith + 
                           Math.sin(beta) * Math.sin(zenithRad) * Math.cos(solarAzimuthRad - gammaPanel);
      
      const incidenceAngleDeg = (Math.acos(Math.max(-1.0, Math.min(1.0, cosIncidence))) * 180.0) / Math.PI;
      
      // Transposed beam radiation
      let I_beam_coll = 0;
      if (sinAltitude > 0.05 && cosIncidence > 0) {
        I_beam_coll = I_beam_hor * (cosIncidence / sinAltitude);
      }
      
      // Isotropic diffuse transposed radiation
      const I_diffuse_coll = I_diffuse_hor * ((1.0 + Math.cos(beta)) / 2.0);
      
      // Ground reflected transposed radiation using month-specific albedo from NASA or default params
      const currentAlbedo = monthMeteo.albedo !== undefined ? monthMeteo.albedo : params.albedo;
      const I_ground_coll = I_global_hor * currentAlbedo * ((1.0 - Math.cos(beta)) / 2.0);
      
      // Total incident radiation on collector plane
      const I_collector = I_beam_coll + I_diffuse_coll + I_ground_coll;
      
      sumHourGlobHorOnPlane += I_global_hor;
      sumHourGlobIncOnPlane += I_collector;
      
      // Calculate Cell Temperature based on PVsyst thermal model
      // Tc = Ta + (alpha*G) / (Uc + Uv * windSpeed)
      // Solar flux G in W/m2 (I_collector is in kW/m2, so multiply by 1000)
      const G_W = I_collector * 1000.0;
      const tCell = mTempAmb + (0.9 * G_W) / (params.ucThermal + params.uvThermal * mWindSpeed);
      sumHourTempCell += tCell;
      sunHoursInMonth += 1;
    }
    
    // Monthly summed totals for the month (Days in month * Daily sum)
    const mGlobHorTotal = mGlobHorDaily * numDays;
    // GlobInc is the sum of our computed 24h representative times numDays
    const mGlobIncTotal = sumHourGlobIncOnPlane * numDays;
    
    // Average cell temperature during sun hours
    const avgCellTemp = sunHoursInMonth > 0 ? sumHourTempCell / sunHoursInMonth : mTempAmb;
    
    // Calculate effective radiation (Eff) after physical losses (IAM, soiling)
    // IAM (Incident Angle Modifier) is approximated with the classic physical glass formula
    // For simplicity, we approximate general IAM loss around 1.5% - 2.5% for fixed/trackers
    // tracking systems have lower incidence angles on average, thus smaller IAM loss.
    const iamMultiplier = params.trackerType === 'fixed' ? 0.978 : 0.992; 
    const soilingMultiplier = 1.0 - (params.soilingLossPercent / 100.0);
    const mGlobEffTotal = mGlobIncTotal * iamMultiplier * soilingMultiplier;
    
    // Calculate array DC power production
    // Base nominal energy = P_STC * GlobEff / 1000
    const nominalEnergyDC = params.peakPowerkWp * mGlobEffTotal; // kWh
    
    // Temperature Loss coefficient factor
    const tempLossMultiplier = 1.0 + (params.tempCoeffPercent / 100.0) * (avgCellTemp - 25.0);
    const mTempLossFraction = (1.0 - tempLossMultiplier) * 100.0;
    
    // Apply LID, module quality, and mismatch losses
    const lidMultiplier = 1.0 - (params.lidLossPercent / 100.0);
    const qualityMultiplier = 1.0 - (params.moduleQualityLossPercent / 100.0); // negative in report = overall gain (meaning e.g. - -0.8% = +0.8% gain)
    const mismatchMultiplier = 1.0 - (params.mismatchLossPercent / 100.0);
    const dcWiringMultiplier = 1.0 - (params.dcWiringLossPercent / 100.0);
    
    const arrayEnergyDC = nominalEnergyDC * 
                          tempLossMultiplier * 
                          lidMultiplier * 
                          qualityMultiplier * 
                          mismatchMultiplier * 
                          dcWiringMultiplier;
                          
    // Inverter Loss (inverter efficiency & small clipping threshold)
    const inverterEfficiencyMultiplier = params.inverterEffPercent / 100.0;
    const inverterOutputAC = arrayEnergyDC * inverterEfficiencyMultiplier;
    
    // AC & Transformer losses
    const acWiringMultiplier = 1.0 - (params.acWiringLossPercent / 100.0);
    const transformerMultiplier = 1.0 - (params.transformerLossPercent / 100.0);
    
    const gridEnergyAC = inverterOutputAC * acWiringMultiplier * transformerMultiplier;
    
    // Monthly PR (Performance Ratio)
    // PR = E_Grid / (P_STC * GlobHorOnPlane_Tilted)
    // Standard formula: PR = net energy injected / (STC power * (GlobInc / 1 kW/m2))
    const expectedReferenceEnergy = params.peakPowerkWp * mGlobIncTotal;
    const monthPR = expectedReferenceEnergy > 0 ? (gridEnergyAC / expectedReferenceEnergy) * 100.0 : 0;
    
    monthlyResults.push({
      monthIndex: m,
      monthName: MONTHS_ES[m],
      globHor: mGlobHorTotal,
      diffHor: mDiffHorDaily * numDays,
      globInc: mGlobIncTotal,
      globEff: mGlobEffTotal,
      tempAmbAverage: mTempAmb,
      tempCellAverage: avgCellTemp,
      eArray: arrayEnergyDC,
      eGrid: gridEnergyAC,
      pr: Math.min(100, Math.max(0, monthPR)),
    });
    
    totalGlobHor += mGlobHorTotal;
    totalGlobInc += mGlobIncTotal;
    totalGlobEff += mGlobEffTotal;
    totalEArray += arrayEnergyDC;
    totalEGrid += gridEnergyAC;
    
    weightedTempAmb += mTempAmb * mGlobIncTotal;
    weightedTempCell += avgCellTemp * mGlobIncTotal;
    weightedMeteoRadiation += mGlobIncTotal;
  }
  
  const finalMeteoRadiant = weightedMeteoRadiation > 0 ? weightedMeteoRadiation : 1;
  const averageCellTempYear = weightedTempCell / finalMeteoRadiant;
  
  // Annual aggregates
  const annualEGridMWh = totalEGrid / 1000.0;
  const specificProduction = totalEGrid / params.peakPowerkWp; // kWh/kWp/año
  const averagePR = (totalEGrid / (params.peakPowerkWp * totalGlobInc)) * 100.0;

  // Build the system PVSyst-Style Loss Cascade
  // We represent the transformation of energy step-by-step
  const referenceLossInput = params.peakPowerkWp * totalGlobInc; // Theoretical maximum STC energy
  
  const lossCascade: LossSegment[] = [];
  
  // 1. Initial GHI horizontal radiation level
  lossCascade.push({ 
    name: 'Irradiación Global Horizontal (GHI)', 
    value: totalGlobHor, 
    lossPercent: 0, 
    type: 'intermediate' 
  });
  
  // 2. Globally incident horizontal radiation transposing gain
  const transpositionGainPercent = ((totalGlobInc - totalGlobHor) / totalGlobHor) * 100.0;
  lossCascade.push({ 
    name: 'Transposición de Radiación (GlobInc)', 
    value: totalGlobInc, 
    lossPercent: transpositionGainPercent, 
    type: transpositionGainPercent >= 0 ? 'gain' : 'loss' 
  });
  
  // 3. Shading / IAM impact (we use 1.2% or 2.2% depending on system fixed/tracker)
  const iamLossPercent = params.trackerType === 'fixed' ? -2.2 : -0.8;
  const afterIam = totalGlobInc * (1.0 + iamLossPercent/100.0);
  lossCascade.push({ 
    name: 'Pérdidas ópticas: Angulo Incidencia (IAM)', 
    value: afterIam, 
    lossPercent: iamLossPercent, 
    type: 'loss' 
  });
  
  // 4. Soiling loss
  const afterSoiling = afterIam * (1.0 - params.soilingLossPercent / 100.0);
  lossCascade.push({ 
    name: 'Pérdidas por suciedad en módulos (Soiling)', 
    value: afterSoiling, 
    lossPercent: -params.soilingLossPercent, 
    type: 'loss' 
  });
  
  // 5. Array energy under STC
  const nominalEnergySTCKWh = params.peakPowerkWp * afterSoiling;
  lossCascade.push({ 
    name: 'Energía Nominal STC del Generador', 
    value: nominalEnergySTCKWh, 
    lossPercent: 0, 
    type: 'intermediate' 
  });
  
  // 6. Loss due to operating temperature
  const tempLossPercentVal = (params.tempCoeffPercent) * (averageCellTempYear - 25.0);
  const afterTemp = nominalEnergySTCKWh * (1.0 + tempLossPercentVal / 100.0);
  lossCascade.push({ 
    name: 'Pérdidas por temperatura del módulo', 
    value: afterTemp, 
    lossPercent: tempLossPercentVal, 
    type: 'loss' 
  });
  
  // 7. Light induced degradation (LID)
  const afterLid = afterTemp * (1.0 - params.lidLossPercent / 100.0);
  lossCascade.push({ 
    name: 'Degradación por inducción lumínica (LID)', 
    value: afterLid, 
    lossPercent: -params.lidLossPercent, 
    type: 'loss' 
  });
  
  // 8. Module Quality Loss (if negative = gain)
  const qualPercent = -params.moduleQualityLossPercent; // quality loss: negative = gain, positive = loss
  const afterQuality = afterLid * (1.0 + qualPercent/100.0);
  lossCascade.push({ 
    name: 'Pérdida/Ganancia por tolerancia de calidad', 
    value: afterQuality, 
    lossPercent: qualPercent, 
    type: qualPercent >= 0 ? 'gain' : 'loss' 
  });
  
  // 9. Module Mismatch
  const afterMismatch = afterQuality * (1.0 - params.mismatchLossPercent / 100.0);
  lossCascade.push({ 
    name: 'Pérdida por mismatch (desajuste modular)', 
    value: afterMismatch, 
    lossPercent: -params.mismatchLossPercent, 
    type: 'loss' 
  });
  
  // 10. DC Wiring
  const afterDcWiring = afterMismatch * (1.0 - params.dcWiringLossPercent / 100.0);
  lossCascade.push({ 
    name: 'Pérdidas en cableado DC (Ohmic)', 
    value: afterDcWiring, 
    lossPercent: -params.dcWiringLossPercent, 
    type: 'loss' 
  });
  
  // 11. Inverter efficiency loss
  const afterInverter = afterDcWiring * (params.inverterEffPercent / 100.0);
  const inverterLossPercent = params.inverterEffPercent - 100.0;
  lossCascade.push({ 
    name: 'Eficiencia de conversión del inversor (DC-AC)', 
    value: afterInverter, 
    lossPercent: inverterLossPercent, 
    type: 'loss' 
  });
  
  // 12. AC wiring loss
  const afterAcWiring = afterInverter * (1.0 - params.acWiringLossPercent / 100.0);
  lossCascade.push({ 
    name: 'Pérdidas del sistema en cables AC', 
    value: afterAcWiring, 
    lossPercent: -params.acWiringLossPercent, 
    type: 'loss' 
  });
  
  // 13. Transformer loss
  const finalEnergy = afterAcWiring * (1.0 - params.transformerLossPercent / 100.0);
  lossCascade.push({ 
    name: 'Pérdidas en transformador de media/alta tensión', 
    value: finalEnergy, 
    lossPercent: -params.transformerLossPercent, 
    type: 'loss' 
  });
  
  // 14. Net annual injected energy
  lossCascade.push({ 
    name: 'Energía Final Inyectada a la Red (EGrid)', 
    value: finalEnergy, 
    lossPercent: 0, 
    type: 'intermediate' 
  });

  return {
    monthly: monthlyResults,
    annualGlobHor: totalGlobHor,
    annualGlobInc: totalGlobInc,
    annualGlobEff: totalGlobEff,
    annualEGridkWh: totalEGrid,
    annualEGridMWh: annualEGridMWh,
    specificProduction: specificProduction,
    averagePR: Math.min(100, Math.max(0, averagePR)),
    lossCascade,
  };
}

/**
 * Normalizes UTM Zone hemisphere names to boolean Southern or Northern.
 */
export function isSouthernZone(hemisphere: string): boolean {
  return hemisphere.trim().toUpperCase() === 'S';
}
