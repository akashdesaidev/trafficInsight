"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Navigation,
  MapPin,
  Clock,
  Route,
  Bus,
  Train,
  AlertCircle,
  Loader2,
  X,
  RefreshCw,
  Info,
  IndianRupee,
  Calendar,
} from "lucide-react";

interface TransitCost {
  total_cost?: number;
  cost_breakdown: Array<{
    instruction: string;
    mode: string;
    distance_km: number;
    estimated_cost: number;
    currency: string;
  }>;
  currency: string;
  estimation_note?: string;
}

interface TransitDirectionsResponse {
  success: boolean;
  total_duration?: string;
  total_distance?: string;
  departure_time?: string;
  arrival_time?: string;
  cost?: TransitCost;
  instructions: string[];
  transit_summary?: string;
  error?: string;
  suggestions: string[];
}

interface RouteDirectionsProps {
  destination: {
    lat: number;
    lon: number;
    name: string;
  };
  onClose: () => void;
  userLocation?: { lat: number; lon: number } | null;
}

export function RouteDirections({
  destination,
  onClose,
  userLocation,
}: RouteDirectionsProps) {
  const [directions, setDirections] = useState<TransitDirectionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departureTime, setDepartureTime] = useState<string>("now");

  const fetchDirections = async (origin: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        origin: origin,
        destination: `${destination.lat},${destination.lon}`,
        departure_time: departureTime,
        language: "en",
        include_cost: "true",
      });

      const response = await fetch(`/api/directions/transit?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: TransitDirectionsResponse = await response.json();
      setDirections(data);
      
      if (!data.success && data.error) {
        setError(data.error);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to get directions";
      setError(errorMessage);
      console.error("Error fetching directions:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleGetDirections = () => {
    if (userLocation) {
      fetchDirections(`${userLocation.lat},${userLocation.lon}`);
    } else {
      // Try to get user's current location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            fetchDirections(`${latitude},${longitude}`);
          },
          (error) => {
            console.error("Geolocation error:", error);
            // Fallback to Bangalore city center
            fetchDirections("12.9716,77.5946");
          }
        );
      } else {
        // Fallback to Bangalore city center
        fetchDirections("12.9716,77.5946");
      }
    }
  };

  const handleRetry = () => {
    handleGetDirections();
  };

  const handleRefresh = () => {
    if (directions) {
      // Re-fetch with current settings
      handleGetDirections();
    }
  };

  return (
    <Card className="w-full shadow-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Navigation className="h-5 w-5 text-blue-600" />
            Route to Destination
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MapPin className="h-4 w-4" />
          <span className="truncate">{destination.name}</span>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {!directions && !loading && !error && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="mb-4">
                <Bus className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                <p className="text-gray-600 text-sm">
                  Get public transport directions to this location
                </p>
              </div>
            </div>
            
            {/* Departure Time Selection */}
            <div className="space-y-2">
              <Label htmlFor="departure-time" className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Departure Time
              </Label>
              <Select value={departureTime} onValueChange={setDepartureTime}>
                <SelectTrigger>
                  <SelectValue placeholder="Select departure time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="now">Leave Now</SelectItem>
                  <SelectItem value="08:00">8:00 AM</SelectItem>
                  <SelectItem value="09:00">9:00 AM</SelectItem>
                  <SelectItem value="10:00">10:00 AM</SelectItem>
                  <SelectItem value="12:00">12:00 PM</SelectItem>
                  <SelectItem value="14:00">2:00 PM</SelectItem>
                  <SelectItem value="16:00">4:00 PM</SelectItem>
                  <SelectItem value="17:00">5:00 PM</SelectItem>
                  <SelectItem value="18:00">6:00 PM</SelectItem>
                  <SelectItem value="19:00">7:00 PM</SelectItem>
                  <SelectItem value="20:00">8:00 PM</SelectItem>
                  <SelectItem value="21:00">9:00 PM</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleGetDirections} className="w-full">
              <Route className="h-4 w-4 mr-2" />
              Get Directions
            </Button>
          </div>
        )}

        {loading && (
          <div className="text-center py-6">
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-blue-600 mb-2" />
            <p className="text-sm text-gray-600">Finding best route...</p>
          </div>
        )}

        {error && (
          <div className="text-center py-6">
            <AlertCircle className="h-8 w-8 mx-auto text-red-500 mb-2" />
            <p className="text-sm text-red-600 mb-4">{error}</p>
            <Button
              variant="outline"
              onClick={handleRetry}
              className="w-full"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        )}

        {directions && directions.success && (
          <div className="space-y-4">
            {/* Journey Summary */}
            {directions.transit_summary && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">
                    Journey Summary
                  </span>
                </div>
                <p className="text-sm text-blue-800">
                  {directions.transit_summary}
                </p>
              </div>
            )}

            {/* Journey Details */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {directions.total_duration && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {directions.total_duration}
                </Badge>
              )}
              {directions.total_distance && (
                <Badge variant="outline">
                  {directions.total_distance}
                </Badge>
              )}
              {directions.cost?.total_cost && (
                <Badge variant="default" className="flex items-center gap-1 bg-green-600 hover:bg-green-700">
                  <IndianRupee className="h-3 w-3" />
                  ₹{Math.round(directions.cost.total_cost)}
                </Badge>
              )}
            </div>

            {/* Cost Information */}
            {directions.cost && directions.cost.total_cost && (
              <div className="bg-green-50 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <IndianRupee className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-900">
                    Estimated Cost: ₹{Math.round(directions.cost.total_cost)}
                  </span>
                </div>
                {directions.cost.estimation_note && (
                  <p className="text-xs text-green-700">
                    {directions.cost.estimation_note}
                  </p>
                )}
              </div>
            )}

            {/* Time Information */}
            {(directions.departure_time || directions.arrival_time) && (
              <div className="flex justify-between text-xs text-gray-600 bg-gray-50 p-2 rounded">
                {directions.departure_time && (
                  <span>Depart: {directions.departure_time}</span>
                )}
                {directions.arrival_time && (
                  <span>Arrive: {directions.arrival_time}</span>
                )}
              </div>
            )}

            <Separator />

            {/* Step-by-step directions */}
            <div>
              <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                <Route className="h-4 w-4" />
                Directions
              </h4>
              
              <ScrollArea className="h-64">
                <div className="space-y-2">
                  {directions.instructions.map((instruction, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-2 text-sm hover:bg-gray-50 rounded"
                    >
                      <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium">
                        {index + 1}
                      </div>
                      <p className="text-gray-700 leading-relaxed">
                        {instruction}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                onClick={handleRefresh}
                className="flex-1"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                variant="outline"
                onClick={() => setDirections(null)}
                className="px-3"
                title="Change departure time"
              >
                <Calendar className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {directions && !directions.success && directions.suggestions.length > 0 && (
          <div className="bg-yellow-50 p-3 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <span className="text-sm font-medium text-yellow-900">
                Suggestions
              </span>
            </div>
            <ul className="text-sm text-yellow-800 space-y-1">
              {directions.suggestions.map((suggestion, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span>•</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}