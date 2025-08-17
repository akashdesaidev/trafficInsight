interface OSMCacheEntry {
  data: {
    estimated_vehicles: number;
    confidence: string;
    road_context?: {
      name: string;
      highway_type: string;
      lanes: number;
      estimated_capacity_per_hour: number;
      maxspeed: number;
    };
    calculation_factors?: {
      base_multiplier: number;
      capacity_factor: number;
      highway_factor: number;
      lane_factor: number;
      final_multiplier: number;
    };
    estimation_method: string;
    osm_data_available: boolean;
  };
  timestamp: number;
  baseMultiplier: number;
}

interface OSMCapacityRequest {
  lat: number;
  lon: number;
  dataPoints: number;
}

interface OSMCapacityResponse {
  success: boolean;
  estimation_method: string;
  estimated_vehicles: number;
  confidence: string;
  osm_data_available: boolean;
  road_context?: {
    name: string;
    highway_type: string;
    lanes: number;
    estimated_capacity_per_hour: number;
    maxspeed: number;
  };
  calculation_factors?: {
    base_multiplier: number;
    capacity_factor: number;
    highway_factor: number;
    lane_factor: number;
    final_multiplier: number;
  };
  error?: string;
}

class OSMCache {
  private cache = new Map<string, OSMCacheEntry>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 100;
  private requestQueue = new Map<string, Promise<OSMCapacityResponse>>();

  /**
   * Generate cache key from coordinates with ~100m precision
   * This allows cache hits for nearby points
   */
  private getCacheKey(lat: number, lon: number): string {
    const roundedLat = Math.round(lat * 1000) / 1000;
    const roundedLon = Math.round(lon * 1000) / 1000;
    return `${roundedLat},${roundedLon}`;
  }

  /**
   * Clean expired entries from cache
   */
  private cleanExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.TTL) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Ensure cache doesn't exceed maximum size
   */
  private enforceMaxSize(): void {
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      // Remove oldest entries
      const entries = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp);
      
      const toRemove = entries.slice(0, this.cache.size - this.MAX_CACHE_SIZE);
      toRemove.forEach(([key]) => this.cache.delete(key));
    }
  }

  /**
   * Fetch OSM capacity data from API
   */
  private async fetchCapacityData(lat: number, lon: number, dataPoints: number): Promise<OSMCapacityResponse> {
    try {
      const response = await fetch(
        `/api/osm/capacity-estimate?lat=${lat}&lon=${lon}&data_points=${dataPoints}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.warn('OSM API request failed:', error);
      
      // Return fallback data
      return {
        success: false,
        estimation_method: 'simple_fallback',
        estimated_vehicles: dataPoints * 15,
        confidence: 'low',
        osm_data_available: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get capacity estimate with caching and deduplication
   */
  async getCapacityEstimate(request: OSMCapacityRequest): Promise<OSMCapacityResponse> {
    const { lat, lon, dataPoints } = request;
    const cacheKey = this.getCacheKey(lat, lon);
    
    // Clean expired entries periodically
    this.cleanExpiredEntries();

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.TTL) {
      // Recalculate vehicles based on current data points and cached multiplier
      const estimatedVehicles = Math.round(cached.baseMultiplier * dataPoints);
      
      return {
        ...cached.data,
        estimated_vehicles: estimatedVehicles
      };
    }

    // Check if request is already in progress
    const existingRequest = this.requestQueue.get(cacheKey);
    if (existingRequest) {
      return existingRequest;
    }

    // Make new request
    const requestPromise = this.fetchCapacityData(lat, lon, dataPoints);
    this.requestQueue.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      
      // Cache successful results
      if (result.success && result.osm_data_available) {
        const baseMultiplier = result.estimated_vehicles / dataPoints;
        
        this.cache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
          baseMultiplier
        });
        
        this.enforceMaxSize();
      }
      
      return result;
    } finally {
      // Remove from request queue
      this.requestQueue.delete(cacheKey);
    }
  }

  /**
   * Get multiple capacity estimates in batch
   */
  async getBatchCapacityEstimates(requests: OSMCapacityRequest[]): Promise<OSMCapacityResponse[]> {
    // Process requests concurrently but limit concurrency
    const BATCH_SIZE = 5;
    const results: OSMCapacityResponse[] = [];
    
    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      const batch = requests.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(request => this.getCapacityEstimate(request));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
    this.requestQueue.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const now = Date.now();
    const validEntries = Array.from(this.cache.values())
      .filter(entry => now - entry.timestamp < this.TTL);
    
    return {
      totalEntries: this.cache.size,
      validEntries: validEntries.length,
      expiredEntries: this.cache.size - validEntries.length,
      pendingRequests: this.requestQueue.size,
      cacheHitRate: this.cache.size > 0 ? validEntries.length / this.cache.size : 0
    };
  }
}

// Global cache instance
export const osmCache = new OSMCache();

// Export types for use in other components
export type { OSMCapacityRequest, OSMCapacityResponse };