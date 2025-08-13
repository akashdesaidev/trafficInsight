"use client";

import { useMapStore } from "@/store/mapStore";

export function TrafficLayerDebug() {
  const trafficLayer = useMapStore((state) => state.trafficLayer);
  const mapSettings = useMapStore((state) => state.mapSettings);
  const setTrafficVisible = useMapStore((state) => state.setTrafficVisible);
  
  if (!mapSettings.showDebugInfo) {
    return null;
  }

  const forceRefresh = () => {
    const wasVisible = trafficLayer.visible;
    setTrafficVisible(false);
    setTimeout(() => setTrafficVisible(wasVisible), 100);
  };

  return (
    <div className="absolute bottom-4 left-4 z-50 bg-black/80 text-white p-3 rounded text-xs font-mono max-w-xs">
      <div className="text-yellow-300 font-bold mb-2">Traffic Layer Debug</div>
      <div>Visible: {trafficLayer.visible ? '✅' : '❌'}</div>
      <div>Opacity: {trafficLayer.opacity}%</div>
      <div>Style: {trafficLayer.style}</div>
      <div>Thickness: {trafficLayer.thickness}</div>
      <div>Refresh: {trafficLayer.refreshInterval}min</div>
      <div className="mt-2">
        <button
          onClick={forceRefresh}
          className="bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs"
        >
          Force Refresh
        </button>
      </div>
      <div className="text-gray-300 mt-1 text-[10px]">
        Tile URL: /api/traffic/tiles/&#123;z&#125;/&#123;x&#125;/&#123;y&#125;.png?style={trafficLayer.style}&thickness={trafficLayer.thickness}
      </div>
    </div>
  );
}