'use client';

import React, { Suspense, lazy } from 'react';
import { Card, CardContent } from '@/components/ui/card';

// Lazy load heavy components
const AnalyticsPanel = lazy(() => 
  import('@/components/analytics/AnalyticsPanel').then(module => ({
    default: module.AnalyticsPanel
  }))
);

const ExportModal = lazy(() => 
  import('@/components/export/ExportModal').then(module => ({
    default: module.ExportModal
  }))
);

// Removed CongestionHeatmap and TrafficPatternCharts - historical data components deleted

// Loading fallback components
const LoadingCard = () => (
  <Card>
    <CardContent className="p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-4 bg-gray-300 rounded w-3/4"></div>
        <div className="h-4 bg-gray-300 rounded w-1/2"></div>
        <div className="h-32 bg-gray-300 rounded"></div>
      </div>
    </CardContent>
  </Card>
);

const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
);

// Wrapper components with lazy loading
interface LazyAnalyticsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedArea?: {
    bbox: [number, number, number, number];
    name?: string;
  };
}

export const LazyAnalyticsPanel: React.FC<LazyAnalyticsPanelProps> = (props) => (
  <Suspense fallback={<LoadingSpinner />}>
    <AnalyticsPanel {...props} />
  </Suspense>
);

interface LazyExportModalProps {
  mapBounds?: {
    min_lat: number;
    max_lat: number;
    min_lon: number;
    max_lon: number;
  };
  onExportStart?: () => void;
  onExportComplete?: (jobId: string) => void;
}

export const LazyExportModal: React.FC<LazyExportModalProps> = (props) => (
  <Suspense fallback={<LoadingSpinner />}>
    <ExportModal {...props} />
  </Suspense>
);

// Removed LazyCongestionHeatmap and LazyTrafficPatternCharts - historical data components deleted

// Virtual scrolling hook for large lists
export function useVirtualScrolling<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number
) {
  const [scrollTop, setScrollTop] = React.useState(0);
  
  const visibleStart = Math.floor(scrollTop / itemHeight);
  const visibleEnd = Math.min(
    visibleStart + Math.ceil(containerHeight / itemHeight) + 1,
    items.length
  );
  
  const visibleItems = items.slice(visibleStart, visibleEnd);
  const totalHeight = items.length * itemHeight;
  const offsetY = visibleStart * itemHeight;
  
  return {
    visibleItems,
    totalHeight,
    offsetY,
    onScroll: (e: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
    }
  };
}

// Image optimization component
interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  loading?: 'lazy' | 'eager';
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  width,
  height,
  className,
  loading = 'lazy'
}) => {
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);

  return (
    <div className={`relative ${className || ''}`}>
      {!isLoaded && !hasError && (
        <div 
          className="absolute inset-0 bg-gray-200 animate-pulse rounded"
          style={{ width, height }}
        />
      )}
      
      {!hasError && (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={loading}
          className={`transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          } ${className || ''}`}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
        />
      )}
      
      {hasError && (
        <div 
          className="bg-gray-100 flex items-center justify-center text-gray-400 text-sm rounded"
          style={{ width: width || '100%', height: height || '200px' }}
        >
          Failed to load image
        </div>
      )}
    </div>
  );
};