// hooks/useUserLocation.ts
"use client";

import { useState, useCallback, useEffect } from "react";
import type { TomTomMap } from "@/types/tomtom";

type AddMarkerFn = (
  coordinates: [number, number],
  type: "user" | "search"
) => void;

const LOCATION_CACHE_KEY = "user_location";
const CACHE_EXPIRATION_MS = 30 * 60 * 1000; // 30 minutes

export function useUserLocation(
  map: TomTomMap | null,
  addLocationMarker: AddMarkerFn
) {
  const [isLocating, setIsLocating] = useState(true); // Start with locating true
  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null
  );

  useEffect(() => {
    // Try to get location from cache on initial load
    const cachedLocation = localStorage.getItem(LOCATION_CACHE_KEY);
    if (cachedLocation) {
      try {
        const { location, timestamp } = JSON.parse(cachedLocation);
        if (Date.now() - timestamp < CACHE_EXPIRATION_MS) {
          setUserLocation(location);
          if (map) {
            map.setCenter(location);
            map.setZoom(14);
            addLocationMarker(location, "user");
          }
          setIsLocating(false);
          return; // Don't request new location if recent cache is valid
        }
      } catch (e) {
        console.error("Error parsing cached location:", e);
        localStorage.removeItem(LOCATION_CACHE_KEY);
      }
    }
    // If no valid cache, request fresh location
    requestUserLocation();
  }, [map]); // Depend on map readiness

  const requestUserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      // Geolocation not supported, stop loading state
      setIsLocating(false);
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const newUserLocation: [number, number] = [longitude, latitude];

        setUserLocation(newUserLocation);

        // Cache the new location with a timestamp
        try {
          const cacheData = {
            location: newUserLocation,
            timestamp: Date.now(),
          };
          localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(cacheData));
        } catch (e) {
          console.error("Could not cache user location:", e);
        }


        if (map) {
          map.flyTo({ center: newUserLocation, zoom: 16 });
          addLocationMarker(newUserLocation, "user");
        }
        setIsLocating(false);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          console.warn("Location access denied by user.");
        } else {
          // For other errors, you might want to inform the user
          console.error("Error getting location:", error.message);
        }
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // Allow using a slightly older cached position
      }
    );
  }, [map, addLocationMarker]);

  return { userLocation, isLocating, requestUserLocation };
}
