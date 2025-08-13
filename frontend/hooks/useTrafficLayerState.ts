import { useState, useCallback } from 'react';
import { useMapStore } from '@/store/mapStore';

export interface TrafficLayerState {
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  retryCount: number;
}

export function useTrafficLayerState() {
  const [state, setState] = useState<TrafficLayerState>({
    isLoading: false,
    error: null,
    lastUpdated: null,
    retryCount: 0,
  });

  const trafficLayer = useMapStore((s) => s.trafficLayer);
  const setTrafficVisible = useMapStore((s) => s.setTrafficVisible);

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, isLoading: loading }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ 
      ...prev, 
      error,
      retryCount: error ? prev.retryCount + 1 : 0,
      isLoading: false 
    }));
  }, []);

  const setSuccess = useCallback(() => {
    setState(prev => ({ 
      ...prev, 
      error: null, 
      isLoading: false,
      lastUpdated: new Date(),
      retryCount: 0
    }));
  }, []);

  const forceRefresh = useCallback(() => {
    if (trafficLayer.visible) {
      setTrafficVisible(false);
      setTimeout(() => setTrafficVisible(true), 100);
    }
  }, [trafficLayer.visible, setTrafficVisible]);

  return {
    state,
    setLoading,
    setError,
    setSuccess,
    forceRefresh,
    trafficLayer,
  };
}