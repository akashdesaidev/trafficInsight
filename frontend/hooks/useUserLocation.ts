// hooks/useUserLocation.ts
"use client";

import { useState, useCallback } from "react";
import type { TomTomMap } from "@/types/tomtom";

type AddMarkerFn = (
  coordinates: [number, number],
  type: "user" | "search"
) => void;

export function useUserLocation(
  map: TomTomMap | null,
  addLocationMarker: AddMarkerFn
) {
  const [isLocating, setIsLocating] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null
  );

  const requestUserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by this browser.");
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const newUserLocation: [number, number] = [longitude, latitude];

        setUserLocation(newUserLocation);

        if (map) {
          map.flyTo({ center: newUserLocation, zoom: 16 });
          addLocationMarker(newUserLocation, "user");
        }
        setIsLocating(false);
      },
      (error) => {
        let errorMessage = "Unable to retrieve your location.";
        if (error.code === error.PERMISSION_DENIED) {
          errorMessage = "Location access denied by user.";
        }
        alert(errorMessage);
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  }, [map, addLocationMarker]);

  return { userLocation, isLocating, requestUserLocation };
}
