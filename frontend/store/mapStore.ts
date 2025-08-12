import { create } from "zustand";

interface MapState {
  center: [number, number];
  zoom: number;
  selectedLocation?: { lon: number; lat: number; name?: string } | null;
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  setSelectedLocation: (loc: MapState["selectedLocation"]) => void;
}

export const useMapStore = create<MapState>((set) => ({
  center: [77.5946, 12.9716],
  zoom: 10,
  selectedLocation: null,
  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  setSelectedLocation: (selectedLocation) => set({ selectedLocation }),
}));
