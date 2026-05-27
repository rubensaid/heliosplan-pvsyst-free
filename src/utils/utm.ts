/**
 * Converts Universal Transverse Mercator (UTM) coordinates to WGS84 Decimal Degrees.
 * Supports standard transverse Mercator conversion formulas.
 */
export function utmToLatLon(
  easting: number,
  northing: number,
  zone: number,
  isSouthernHemisphere: boolean
): { lat: number; lon: number } {
  // Semi-major axis (a) and flattening (f) of the WGS84 reference ellipsoid
  const sa = 6378137.0;
  const f = 1.0 / 298.257223563;
  
  // Derived ellipsoid parameters
  const sb = sa * (1.0 - f);
  const e2 = (Math.pow(sa, 2) - Math.pow(sb, 2)) / Math.pow(sa, 2);
  const e2prime = e2 / (1.0 - e2);

  // Central meridian corresponding to zone
  const centralMeridianDeg = (zone * 6.0) - 183.0;
  
  const x = easting - 500000.0; // Subtract false easting
  const y = isSouthernHemisphere ? northing - 10000000.0 : northing; // Adjust for false northing in south

  const scaleFactor = 0.9996; // Scale factor along the central meridian

  // Footpoint latitude calculation
  const n = (sa - sb) / (sa + sb);
  const alpha = ((sa + sb) / 2.0) * (1.0 + Math.pow(n, 2) / 4.0 + Math.pow(n, 4) / 64.0);
  const beta = (3.0 * n) / 2.0 - (27.0 * Math.pow(n, 3)) / 32.0;
  const gamma = (21.0 * Math.pow(n, 2)) / 16.0 - (55.0 * Math.pow(n, 4)) / 32.0;
  const delta = (151.0 * Math.pow(n, 3)) / 96.0;

  const arcLengthMultiplier = y / scaleFactor;
  const phi = arcLengthMultiplier / alpha;

  const footpointLatitudeRad =
    phi +
    beta * Math.sin(2.0 * phi) +
    gamma * Math.sin(4.0 * phi) +
    delta * Math.sin(6.0 * phi);

  const cosPhi = Math.cos(footpointLatitudeRad);
  const sinPhi = Math.sin(footpointLatitudeRad);
  const tanPhi = Math.tan(footpointLatitudeRad);

  const eta2 = e2prime * Math.pow(cosPhi, 2);
  const ni = sa / Math.sqrt(1.0 - e2 * Math.pow(sinPhi, 2));
  const rho = (sa * (1.0 - e2)) / Math.pow(1.0 - e2 * Math.pow(sinPhi, 2), 1.5);

  const d = x / (ni * scaleFactor);

  const latRad =
    footpointLatitudeRad -
    ((ni * tanPhi) / rho) *
      (Math.pow(d, 2) / 2.0 -
        (5.0 + 3.0 * Math.pow(tanPhi, 2) + 10.0 * eta2 - 4.0 * Math.pow(eta2, 2) - 9.0 * e2prime) *
          (Math.pow(d, 4) / 24.0) +
        (61.0 +
          90.0 * Math.pow(tanPhi, 2) +
          298.0 * eta2 +
          45.0 * Math.pow(tanPhi, 4) -
          252.0 * e2prime -
          3.0 * Math.pow(eta2, 2)) *
          (Math.pow(d, 6) / 720.0));

  const lonRad =
    (d -
      (1.0 + 2.0 * Math.pow(tanPhi, 2) + eta2) * (Math.pow(d, 3) / 6.0) +
      (5.0 -
        2.0 * eta2 +
        28.0 * Math.pow(tanPhi, 2) -
        3.0 * Math.pow(eta2, 2) +
        8.0 * e2prime +
        24.0 * Math.pow(tanPhi, 4)) *
        (Math.pow(d, 5) / 120.0)) /
    cosPhi;

  const latDeg = latRad * (180.0 / Math.PI);
  const lonDeg = centralMeridianDeg + lonRad * (180.0 / Math.PI);

  // Return formatted lat/lon within realistic bounds
  return {
    lat: Math.min(Math.max(latDeg, -90), 90),
    lon: Math.min(Math.max(lonDeg, -180), 180),
  };
}
