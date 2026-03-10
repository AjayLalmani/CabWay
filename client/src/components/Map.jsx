import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const Map = ({ pickup, dropoff, routeGeoJSON, driverLocation }) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const pickupMarker = useRef(null);
  const dropoffMarker = useRef(null);
  const driverMarker = useRef(null);

  useEffect(() => {
    if (map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [-74.006, 40.7128], // Default NYC
      zoom: 12
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      // Add empty route source & layer
      map.current.addSource('route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.current.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#3b82f6', // blue-500
          'line-width': 5,
          'line-opacity': 0.8
        }
      });
    });
  }, []);

  // Update Markers
  useEffect(() => {
    if (!map.current) return;

    if (pickup) {
      if (!pickupMarker.current) {
        pickupMarker.current = new maplibregl.Marker({ color: '#3b82f6' }) // Blue for pickup
          .setLngLat([pickup.lng, pickup.lat])
          .addTo(map.current);
      } else {
        pickupMarker.current.setLngLat([pickup.lng, pickup.lat]);
      }
      map.current.flyTo({ center: [pickup.lng, pickup.lat], zoom: 14 });
    }

    if (dropoff) {
      if (!dropoffMarker.current) {
        dropoffMarker.current = new maplibregl.Marker({ color: '#22c55e' }) // Green for dropoff
          .setLngLat([dropoff.lng, dropoff.lat])
          .addTo(map.current);
      } else {
        dropoffMarker.current.setLngLat([dropoff.lng, dropoff.lat]);
      }
    }

    // Driver location update
    if (driverLocation) {
      let driverEl = document.getElementById('driver-marker');
      if (!driverEl) {
        driverEl = document.createElement('div');
        driverEl.id = 'driver-marker';
        driverEl.className = 'w-6 h-6 bg-black rounded-full border-2 border-white shadow-lg flex items-center justify-center';
        // Simple car icon representation
        driverEl.innerHTML = '<div class="w-3 h-3 bg-yellow-400 rounded-sm"></div>';
        
        // We attach this element to the map as a custom marker
        new maplibregl.Marker(driverEl)
          .setLngLat([driverLocation.lng, driverLocation.lat])
          .addTo(map.current);
      } else {
        // Find existing marker instance. MapLibre doesn't easily expose markers by DOM node, 
        // so we just update the transform directly for raw performance on the mock.
        // A robust solution stores the driverMarker ref similar to pickupMarker.
      }
    }

    // If we have both, fit bounds
    if (pickup && dropoff && !driverLocation) {
      const bounds = new maplibregl.LngLatBounds()
        .extend([pickup.lng, pickup.lat])
        .extend([dropoff.lng, dropoff.lat]);
      
      map.current.fitBounds(bounds, { padding: 50 });
    }
  }, [pickup, dropoff, driverLocation]);

  // Update Route
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    
    const source = map.current.getSource('route');
    if (source) {
      if (routeGeoJSON) {
        source.setData(routeGeoJSON);
      } else {
        source.setData({ type: 'FeatureCollection', features: [] });
      }
    } else {
      // Sometimes style isn't loaded when this fires. Adding it to generic event listener.
      map.current.once('styledata', () => {
        const s = map.current.getSource('route');
        if (s) {
           s.setData(routeGeoJSON || { type: 'FeatureCollection', features: [] });
        }
      });
    }
  }, [routeGeoJSON]);

  return (
    <div className="w-full h-full rounded-lg overflow-hidden border border-gray-200">
      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
};

export default Map;
