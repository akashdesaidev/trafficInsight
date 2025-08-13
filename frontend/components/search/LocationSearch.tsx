"use client";

import { useState, useEffect, useRef } from "react";
import { Search, MapPin, Clock, X, Navigation } from "lucide-react";
import { useMapStore } from "@/store/mapStore";

interface SearchResult {
  id: string;
  address: string;
  lat: number;
  lon: number;
  score: number;
  country?: string;
  municipality?: string;
  poi?: string;
}

interface Props {
  onLocationSelect?: (location: { lon: number; lat: number; name: string }) => void;
  onRouteRequest?: (location: { lon: number; lat: number; name: string }) => void;
}

export default function LocationSearch({ onLocationSelect, onRouteRequest }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([]);
  
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const setCenter = useMapStore((s) => s.setCenter);
  const setSelectedLocation = useMapStore((s) => s.setSelectedLocation);

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("traffic-insight-recent-searches");
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch {}
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/search/autocomplete?q=${encodeURIComponent(query)}&limit=8`
        );
        if (response.ok) {
          const data = await response.json();
          setResults(data.results || []);
          setShowResults(true);
        }
      } catch (error) {
        console.error("Search error:", error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLocationSelect = (location: SearchResult) => {
    const selected = {
      lon: location.lon,
      lat: location.lat,
      name: location.address,
    };

    // Update map
    setCenter([location.lon, location.lat]);
    setSelectedLocation(selected);

    // Add to recent searches
    const newRecent = [location, ...recentSearches.filter(r => r.id !== location.id)].slice(0, 5);
    setRecentSearches(newRecent);
    localStorage.setItem("traffic-insight-recent-searches", JSON.stringify(newRecent));

    // Clear search
    setQuery("");
    setShowResults(false);
    
    // Callback
    onLocationSelect?.(selected);
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
    setShowResults(false);
    inputRef.current?.focus();
  };

  const displayName = (result: SearchResult) => {
    if (result.poi) return result.poi;
    if (result.municipality && result.country) {
      return `${result.municipality}, ${result.country}`;
    }
    return result.address;
  };

  return (
    <div ref={searchRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-3.5 text-gray-400 h-4 w-4" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setShowResults(query.length >= 2 || recentSearches.length > 0)}
          placeholder="Search for a location..."
          className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white text-sm"
        />
        {query && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showResults && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
          {loading && (
            <div className="p-3 text-center text-gray-500">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500 mx-auto"></div>
            </div>
          )}

          {!loading && results.length === 0 && query.length >= 2 && (
            <div className="p-3 text-gray-500 text-center">No results found</div>
          )}

          {!loading && query.length < 2 && recentSearches.length > 0 && (
            <div>
              <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                Recent Searches
              </div>
              {recentSearches.map((item) => (
                <button
                  key={`recent-${item.id}`}
                  onClick={() => handleLocationSelect(item)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3"
                >
                  <Clock className="h-4 w-4 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {displayName(item)}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{item.address}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!loading && results.length > 0 && (
            <div>
              {results.map((item) => (
                <div
                  key={item.id}
                  className="w-full hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <div className="flex items-center">
                    <button
                      onClick={() => handleLocationSelect(item)}
                      className="flex-1 px-3 py-2 text-left flex items-center gap-3"
                    >
                      <MapPin className="h-4 w-4 text-gray-400" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {displayName(item)}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{item.address}</div>
                      </div>
                      <div className="text-xs text-gray-400">
                        {Math.round(item.score * 100)}%
                      </div>
                    </button>
                    {onRouteRequest && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRouteRequest({
                            lon: item.lon,
                            lat: item.lat,
                            name: displayName(item),
                          });
                        }}
                        className="px-2 py-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-r"
                        title="Get directions"
                      >
                        <Navigation className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}