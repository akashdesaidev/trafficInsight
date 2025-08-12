export interface TomTomLngLat {
  lng: number;
  lat: number;
}

export interface TomTomBounds {
  getSouthWest: () => TomTomLngLat;
  getNorthEast: () => TomTomLngLat;
}

export interface TomTomMap {
  addControl: (control: unknown, position?: string) => unknown;
  addSource: (id: string, source: unknown) => void;
  addLayer: (layer: unknown) => void;
  getSource?: (id: string) => unknown | undefined;
  removeSource: (id: string) => void;
  removeLayer: (id: string) => void;
  getCenter?: () => TomTomLngLat;
  getZoom?: () => number;
  getBounds?: () => TomTomBounds;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
  resize: () => void;
  remove: () => void;
}




