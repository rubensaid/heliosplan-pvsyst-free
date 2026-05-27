import JSZip from 'jszip';
import { Coords, PolygonData } from '../types';

/**
 * Calculates the area of a set of GPS coordinates in square meters
 * using a local equal-area projection relative to the centroid.
 */
function calculatePolygonArea(coords: Coords[]): number {
  if (coords.length < 3) return 0;
  
  // Close the loop if not closed
  const points = [...coords];
  const first = points[0];
  const last = points[points.length - 1];
  if (first.lat !== last.lat || first.lon !== last.lon) {
    points.push(first);
  }

  // Calculate centroid
  let sumLat = 0;
  let sumLon = 0;
  for (const p of points) {
    sumLat += p.lat;
    sumLon += p.lon;
  }
  const centroidLat = sumLat / points.length;

  const latToMeters = 111132.9; // approx meters per degree lat
  const lonToMeters = 111132.9 * Math.cos((centroidLat * Math.PI) / 180.0);

  // Convert to local xy grid in meters
  const xy = points.map((p) => ({
    x: p.lon * lonToMeters,
    y: p.lat * latToMeters,
  }));

  // Standard Shoelace formula
  let area = 0;
  const numPoints = xy.length;
  for (let i = 0; i < numPoints - 1; i++) {
    area += xy[i].x * xy[i + 1].y - xy[i + 1].x * xy[i].y;
  }
  
  return Math.abs(area) / 2;
}

/**
 * Parses coordinates string from KML coordinates tag
 */
function parseKMLCoordinates(coordsStr: string): Coords[] {
  const result: Coords[] = [];
  const points = coordsStr.trim().split(/\s+/);

  for (const pt of points) {
    if (!pt) continue;
    const parts = pt.split(',');
    if (parts.length >= 2) {
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      const alt = parts.length >= 3 ? parseFloat(parts[2]) : undefined;
      
      if (!isNaN(lat) && !isNaN(lon)) {
        result.push({ lat, lon, alt });
      }
    }
  }

  return result;
}

/**
 * Main KML parser using browser's DOMParser
 */
export function parseKMLText(kmlText: string, filename?: string): PolygonData | null {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(kmlText, 'text/xml');
    
    // Check for parse errors
    const parserError = xmlDoc.getElementsByTagName('parsererror');
    if (parserError.length > 0) {
      throw new Error('Formato XML de KML inválido: ' + parserError[0].textContent);
    }

    // Try finding placemarks
    const placemarks = xmlDoc.getElementsByTagName('Placemark');
    let bestCoords: Coords[] = [];
    let siteName = filename?.replace(/\.[^/.]+$/, "") || 'Área Importada';

    // Walk through placemarks to find the widest or most detailed coordinates list
    for (let i = 0; i < placemarks.length; i++) {
      const pm = placemarks[i];
      const nameNode = pm.getElementsByTagName('name')[0];
      const pmName = nameNode ? nameNode.textContent?.trim() : '';

      // Check Polygon
      const polygonCoordsNodes = pm.getElementsByTagName('coordinates');
      for (let j = 0; j < polygonCoordsNodes.length; j++) {
        const node = polygonCoordsNodes[j];
        if (node.textContent) {
          const parsed = parseKMLCoordinates(node.textContent);
          if (parsed.length > bestCoords.length) {
            bestCoords = parsed;
            if (pmName) siteName = pmName;
          }
        }
      }
    }

    // If no placemarks found, try a generic search for "coordinates"
    if (bestCoords.length === 0) {
      const coordsNodes = xmlDoc.getElementsByTagName('coordinates');
      for (let i = 0; i < coordsNodes.length; i++) {
        const node = coordsNodes[i];
        if (node.textContent) {
          const parsed = parseKMLCoordinates(node.textContent);
          if (parsed.length > bestCoords.length) {
            bestCoords = parsed;
          }
        }
      }
    }

    if (bestCoords.length === 0) {
      return null;
    }

    // Calculate centroid
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;
    let totalLat = 0;
    let totalLon = 0;

    for (const c of bestCoords) {
      if (c.lat < minLat) minLat = c.lat;
      if (c.lat > maxLat) maxLat = c.lat;
      if (c.lon < minLon) minLon = c.lon;
      if (c.lon > maxLon) maxLon = c.lon;
      totalLat += c.lat;
      totalLon += c.lon;
    }

    const centroid: Coords = {
      lat: totalLat / bestCoords.length,
      lon: totalLon / bestCoords.length,
    };

    const areaSqm = calculatePolygonArea(bestCoords);

    return {
      coords: bestCoords,
      centroid,
      areaSqm,
      name: siteName,
    };
  } catch (error) {
    console.error('Error parsing KML standard text:', error);
    return null;
  }
}

/**
 * Handles KMZ or KML files by auto-detecting file signature and parsing
 */
export async function parseKMLOrKMZFile(file: File): Promise<PolygonData | null> {
  const name = file.name.toLowerCase();
  
  if (name.endsWith('.kmz')) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      
      // Find the first file inside ending in .kml
      const kmlFiles = Object.keys(zip.files).filter((fname) => fname.toLowerCase().endsWith('.kml'));
      
      if (kmlFiles.length === 0) {
        throw new Error('El archivo KMZ no contiene ningún archivo KML válido.');
      }
      
      // Read the first KML file found
      const kmlText = await zip.files[kmlFiles[0]].async('string');
      return parseKMLText(kmlText, file.name);
    } catch (e) {
      console.error('Error unzipping KMZ:', e);
      throw new Error('Error al descomprimir o leer el archivo KMZ: ' + (e as Error).message);
    }
  } else {
    // Treat as raw KML text
    try {
      const text = await file.text();
      const parsed = parseKMLText(text, file.name);
      if (!parsed) {
        throw new Error('No se encontraron coordenadas válidas dentro del KML.');
      }
      return parsed;
    } catch (e) {
      console.error('Error reading KML text:', e);
      throw new Error('Error al leer el archivo KML: ' + (e as Error).message);
    }
  }
}
