import React, { useEffect, useRef } from 'react';
import { Coords } from '../types';

interface MapComponentProps {
  centroid: Coords;
  polygonCoords: Coords[];
  pointMarker?: Coords;
  hasSelectedLocation: boolean;
}

export default function MapComponent({ centroid, polygonCoords, pointMarker, hasSelectedLocation }: MapComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);

  useEffect(() => {
    // 1. Initialise Map if not already initialised
    const L = (window as any).L;
    if (!L) {
      console.warn('Leaflet global "L" is not loaded yet in index.html');
      return;
    }

    if (!mapInstanceRef.current && mapContainerRef.current) {
      const initialLat = hasSelectedLocation ? centroid.lat : -9.19;
      const initialLon = hasSelectedLocation ? centroid.lon : -75.01;
      const initialZoom = hasSelectedLocation ? 13 : 5;

      // Create Leaflet map
      const map = L.map(mapContainerRef.current, {
        scrollWheelZoom: true,
        zoomControl: true,
      }).setView([initialLat, initialLon], initialZoom);

      // Add Esri World Imagery Satellite layer
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    // Cleanup Leaflet map on unmount
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); // Run once on mount

  // 2. React to coordinate changes
  useEffect(() => {
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    // Clear old layers
    layersRef.current.forEach((layer) => {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });
    layersRef.current = [];

    // If no location has been selected, set standard zoom over general area and return
    if (!hasSelectedLocation) {
      map.setView([-9.19, -75.01], 5);
      return;
    }

    // Focus on centroid
    map.setView([centroid.lat, centroid.lon], map.getZoom() || 13);

    // Draw Polygon if coordinates exist
    if (polygonCoords && polygonCoords.length > 2) {
      const latLns = polygonCoords.map((c) => [c.lat, c.lon]);
      const polygon = L.polygon(latLns, {
        color: '#f59e0b', // Amber 500
        fillColor: '#fbbf24', // Amber 400
        fillOpacity: 0.35,
        weight: 3,
        dashArray: '1',
      }).addTo(map);

      layersRef.current.push(polygon);

      // Zoom map to fit the polygon perfectly
      try {
        map.fitBounds(polygon.getBounds(), {
          padding: [30, 30],
          maxZoom: 16,
        });
      } catch (e) {
        console.error('Error fitting bounds:', e);
      }
    } else {
      // If we only have a single point marker
      const markerLat = pointMarker ? pointMarker.lat : centroid.lat;
      const markerLon = pointMarker ? pointMarker.lon : centroid.lon;

      const marker = L.circleMarker([markerLat, markerLon], {
        radius: 10,
        fillColor: '#3b82f6', // Blue 500
        color: '#1d4ed8', // Blue 700
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8,
      }).addTo(map);

      // Add a simple popup
      marker.bindPopup(`<b>Ubicación del Proyecto</b><br/>Lat: ${markerLat.toFixed(5)}<br/>Lon: ${markerLon.toFixed(5)}`).openPopup();

      layersRef.current.push(marker);
      map.setView([markerLat, markerLon], 15);
    }
  }, [centroid, polygonCoords, pointMarker, hasSelectedLocation]);

  return (
    <div className="relative w-full h-full min-h-[350px] md:min-h-[450px] bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-inner">
      <div ref={mapContainerRef} className="w-full h-full absolute inset-0" id="project-map-canvas" />
    </div>
  );
}
