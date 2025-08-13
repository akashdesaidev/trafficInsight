'use client';

import React, { useState } from 'react';
import { Download, Calendar, Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';

interface BoundingBox {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
}

interface MobileExportPanelProps {
  isOpen: boolean;
  onClose: () => void;
  mapBounds?: BoundingBox;
  onExportStart?: () => void;
  onExportComplete?: (jobId: string) => void;
}

export function MobileExportPanel({
  isOpen,
  onClose,
  mapBounds,
  onExportStart,
  onExportComplete
}: MobileExportPanelProps) {
  const [step, setStep] = useState<'configure' | 'progress' | 'complete'>('configure');
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState('');
  
  // Form state
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [exportType, setExportType] = useState<'traffic_data' | 'chokepoints' | 'comprehensive'>('traffic_data');
  const [granularity, setGranularity] = useState<'hourly' | 'daily'>('hourly');
  const [useMapArea, setUseMapArea] = useState(false);

  if (!isOpen) return null;

  const handleExport = async () => {
    setStep('progress');
    setExportProgress(0);
    setExportMessage('Starting export...');
    onExportStart?.();

    try {
      const exportRequest = {
        start_date: new Date(startDate + 'T00:00:00').toISOString(),
        end_date: new Date(endDate + 'T23:59:59').toISOString(),
        export_type: exportType,
        granularity: granularity,
        ...(useMapArea && mapBounds ? { bbox: mapBounds } : {})
      };

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setExportProgress(prev => {
          const next = Math.min(prev + Math.random() * 15, 90);
          if (next < 30) setExportMessage('Collecting data...');
          else if (next < 60) setExportMessage('Processing traffic metrics...');
          else if (next < 85) setExportMessage('Generating export...');
          else setExportMessage('Finalizing...');
          return next;
        });
      }, 500);

      const response = await fetch('/api/export-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportRequest)
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const result = await response.json();
      setExportProgress(100);
      setExportMessage('Export completed successfully!');
      setStep('complete');
      
      onExportComplete?.(result.job_id);

    } catch (error) {
      setExportMessage('Export failed. Please try again.');
      setTimeout(() => setStep('configure'), 2000);
    }
  };

  const handlePresetDate = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 md:hidden">
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-lg max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export Data
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
          {step === 'configure' && (
            <div className="space-y-6">
              {/* Date Range */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Date Range
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2 mb-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePresetDate(7)}
                      className="text-xs"
                    >
                      7 Days
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePresetDate(30)}
                      className="text-xs"
                    >
                      30 Days
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePresetDate(90)}
                      className="text-xs"
                    >
                      90 Days
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">From</Label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm border rounded-md"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">To</Label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm border rounded-md"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Export Options */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Options
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-xs">Export Type</Label>
                    <Select value={exportType} onValueChange={(value) => setExportType(value as typeof exportType)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="traffic_data">Traffic Data</SelectItem>
                        <SelectItem value="chokepoints">Chokepoints</SelectItem>
                        <SelectItem value="comprehensive">All Data</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label className="text-xs">Granularity</Label>
                    <Select value={granularity} onValueChange={(value) => setGranularity(value as typeof granularity)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hourly">Hourly</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="mobile-use-map-area"
                      checked={useMapArea}
                      onChange={(e) => setUseMapArea(e.target.checked)}
                      disabled={!mapBounds}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="mobile-use-map-area" className="text-xs">
                      Current map area only
                    </Label>
                  </div>
                </CardContent>
              </Card>

              {/* Action Button */}
              <Button onClick={handleExport} className="w-full">
                Start Export
              </Button>
            </div>
          )}

          {step === 'progress' && (
            <div className="space-y-6 text-center">
              <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
                <Download className="w-8 h-8 text-blue-600 animate-pulse" />
              </div>
              
              <div>
                <h3 className="font-medium mb-2">Exporting Data</h3>
                <div className="text-sm text-gray-600 mb-4">{exportMessage}</div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Progress</span>
                    <span>{Math.round(exportProgress)}%</span>
                  </div>
                  <Progress value={exportProgress} className="w-full" />
                </div>
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="space-y-6 text-center">
              <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                <Download className="w-8 h-8 text-green-600" />
              </div>
              
              <div>
                <h3 className="font-medium text-green-800 mb-2">Export Complete!</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Your data export has been generated and is ready for download.
                </p>
              </div>

              <div className="space-y-3">
                <Button className="w-full">
                  <Download className="w-4 h-4 mr-2" />
                  Download JSON
                </Button>
                <Button variant="outline" onClick={onClose} className="w-full">
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}