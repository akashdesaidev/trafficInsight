export { 
  LazyAnalyticsPanel,
  LazyExportModal,
  LazyCongestionHeatmap,
  LazyTrafficPatternCharts,
  useVirtualScrolling,
  OptimizedImage
} from './LazyLoadingWrapper';

export { 
  ServiceWorkerProvider,
  useServiceWorker
} from './ServiceWorkerProvider';

export { 
  cache,
  cachedFetch,
  debounce,
  throttle,
  localCache,
  useCachedData,
  performanceUtils
} from '../../lib/cache';