import { create } from "zustand";

interface TrafficLayerSettings {
  visible: boolean;
  opacity: number;
  style: "absolute" | "relative" | "relative-delay" | "reduced-sensitivity";
  thickness: number;
  refreshInterval: number; // minutes
}

interface IncidentLayerSettings {
  visible: boolean;
  severityFilter: ("low" | "medium" | "high" | "critical")[];
  timeFilter: "current" | "1h" | "6h" | "24h";
}

interface LiveChokepointsLayerSettings {
  visible: boolean;
  refreshInterval: number; // minutes
  showLabels: boolean;
}

interface MapSettings {
  autoRefresh: boolean;
  refreshInterval: number; // seconds
  showDebugInfo: boolean;
}

interface MapState {
  // Map view state
  center: [number, number];
  zoom: number;
  selectedLocation?: { lon: number; lat: number; name?: string } | null;
  bounds?: [number, number, number, number] | null; // [minLon, minLat, maxLon, maxLat]

  // Layer settings
  trafficLayer: TrafficLayerSettings;
  incidentLayer: IncidentLayerSettings;
  liveChokepointsLayer: LiveChokepointsLayerSettings;
  mapSettings: MapSettings;

  // UI state
  sidebarCollapsed: boolean;

  // Actions
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  setSelectedLocation: (loc: MapState["selectedLocation"]) => void;
  setBounds: (bounds: [number, number, number, number]) => void;

  // Traffic layer actions
  setTrafficVisible: (visible: boolean) => void;
  setTrafficOpacity: (opacity: number) => void;
  setTrafficStyle: (style: TrafficLayerSettings["style"]) => void;
  setTrafficThickness: (thickness: number) => void;
  setTrafficRefreshInterval: (interval: number) => void;

  // Incident layer actions
  setIncidentsVisible: (visible: boolean) => void;
  setIncidentSeverityFilter: (
    filter: IncidentLayerSettings["severityFilter"]
  ) => void;
  setIncidentTimeFilter: (filter: IncidentLayerSettings["timeFilter"]) => void;

  // Live chokepoints layer actions
  setLiveChokepointsVisible: (visible: boolean) => void;
  setLiveChokepointsRefreshInterval: (interval: number) => void;
  setLiveChokepointsShowLabels: (show: boolean) => void;

  // Settings actions
  setAutoRefresh: (enabled: boolean) => void;
  setRefreshInterval: (interval: number) => void;
  setShowDebugInfo: (show: boolean) => void;

  // UI actions
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useMapStore = create<MapState>((set) => ({
  // Default map view
  center: [77.5946, 12.9716], // Bangalore, India
  zoom: 10,
  selectedLocation: null,
  bounds: null,

  // Default traffic layer settings
  trafficLayer: {
    visible: false,
    opacity: 80,
    style: "relative",
    thickness: 4,
    refreshInterval: 2, // 2 minutes
  },

  // Default incident layer settings
  incidentLayer: {
    visible: false,
    severityFilter: ["low", "medium", "high", "critical"],
    timeFilter: "current",
  },

  // Default live chokepoints layer settings
  liveChokepointsLayer: {
    visible: false,
    refreshInterval: 5, // 5 minutes
    showLabels: true,
  },

  // Default map settings
  mapSettings: {
    autoRefresh: true,
    refreshInterval: 60, // 60 seconds
    showDebugInfo: false,
  },

  // Default UI state
  sidebarCollapsed: false,

  // Basic actions
  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  setSelectedLocation: (selectedLocation) => set({ selectedLocation }),
  setBounds: (bounds) => set({ bounds }),

  // Traffic layer actions
  setTrafficVisible: (visible) =>
    set((state) => ({
      trafficLayer: { ...state.trafficLayer, visible },
    })),
  setTrafficOpacity: (opacity) =>
    set((state) => ({
      trafficLayer: { ...state.trafficLayer, opacity },
    })),
  setTrafficStyle: (style) =>
    set((state) => ({
      trafficLayer: { ...state.trafficLayer, style },
    })),
  setTrafficThickness: (thickness) =>
    set((state) => ({
      trafficLayer: { ...state.trafficLayer, thickness },
    })),
  setTrafficRefreshInterval: (refreshInterval) =>
    set((state) => ({
      trafficLayer: { ...state.trafficLayer, refreshInterval },
    })),

  // Incident layer actions
  setIncidentsVisible: (visible) =>
    set((state) => ({
      incidentLayer: { ...state.incidentLayer, visible },
    })),
  setIncidentSeverityFilter: (severityFilter) =>
    set((state) => ({
      incidentLayer: { ...state.incidentLayer, severityFilter },
    })),
  setIncidentTimeFilter: (timeFilter) =>
    set((state) => ({
      incidentLayer: { ...state.incidentLayer, timeFilter },
    })),

  // Live chokepoints layer actions
  setLiveChokepointsVisible: (visible) =>
    set((state) => ({
      liveChokepointsLayer: { ...state.liveChokepointsLayer, visible },
    })),
  setLiveChokepointsRefreshInterval: (refreshInterval) =>
    set((state) => ({
      liveChokepointsLayer: { ...state.liveChokepointsLayer, refreshInterval },
    })),
  setLiveChokepointsShowLabels: (showLabels) =>
    set((state) => ({
      liveChokepointsLayer: { ...state.liveChokepointsLayer, showLabels },
    })),

  // Settings actions
  setAutoRefresh: (autoRefresh) =>
    set((state) => ({
      mapSettings: { ...state.mapSettings, autoRefresh },
    })),
  setRefreshInterval: (refreshInterval) =>
    set((state) => ({
      mapSettings: { ...state.mapSettings, refreshInterval },
    })),
  setShowDebugInfo: (showDebugInfo) =>
    set((state) => ({
      mapSettings: { ...state.mapSettings, showDebugInfo },
    })),

  // UI actions
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
}));
