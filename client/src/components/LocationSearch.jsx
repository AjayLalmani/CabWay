import React, { useState, useEffect, useCallback } from 'react';
import debounce from 'lodash.debounce';
import { MapPin, Navigation } from 'lucide-react';

const GEOAPIFY_KEY = import.meta.env.VITE_GEOAPIFY_API_KEY;

export default function LocationSearch({ placeholder, icon, onLocationSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchLocations = async (text) => {
    if (!text || text.length < 3) {
      setResults([]);
      return;
    }
    if (!GEOAPIFY_KEY) {
      console.warn("Geoapify Key is missing. Mocking results.");
      setResults([
        { properties: { formatted: "Mock Location 1", lat: 40.7128, lon: -74.0060 } }
      ]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&apiKey=${GEOAPIFY_KEY}`);
      if (response.ok) {
        const data = await response.json();
        setResults(data.features || []);
      }
    } catch (error) {
      console.error("Error fetching locations:", error);
    }
    setLoading(false);
  };

  const debouncedFetch = useCallback(debounce(fetchLocations, 500), []);

  useEffect(() => {
    debouncedFetch(query);
    return () => debouncedFetch.cancel();
  }, [query, debouncedFetch]);

  const handleSelect = (feature) => {
    const { lat, lon, formatted } = feature.properties;
    setQuery(formatted || "Selected Location");
    setIsOpen(false);
    onLocationSelect({ lat, lng: lon, address: formatted });
  };

  return (
    <div className="relative w-full">
      <div className="flex items-center bg-gray-50 border border-gray-300 rounded-lg p-3 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
        <div className="text-gray-400 mr-3">
          {icon === 'pickup' ? <MapPin size={20} className="text-blue-500" /> : <Navigation size={20} className="text-green-500" />}
        </div>
        <input
          type="text"
          className="w-full bg-transparent outline-none text-gray-800 placeholder-gray-400"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        {loading && <div className="ml-2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>}
      </div>

      {isOpen && results.length > 0 && (
        <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {results.map((feature, idx) => (
            <li
              key={idx}
              className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0 text-sm"
              onClick={() => handleSelect(feature)}
            >
              <div className="font-medium text-gray-800">{feature.properties.address_line1 || feature.properties.name}</div>
              <div className="text-gray-500 text-xs">{feature.properties.address_line2 || feature.properties.formatted}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
