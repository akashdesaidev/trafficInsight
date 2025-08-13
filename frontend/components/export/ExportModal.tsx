'use client';

import React, { useState, useCallback } from 'react';
import { Calendar, Download, MapPin, Clock, FileText, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Types
interface BoundingBox {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
}

interface ExportRequest {
  start_date: string;
  end_date: string;
  export_type: 'traffic_data' | 'chokepoints' | 'comprehensive';
  granularity: 'hourly' | 'daily';
  bbox?: BoundingBox;
}

interface ExportJob {
  job_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  message: string;
  download_url?: string;
  file_size?: number;
}

// Date utility functions
const formatDateForInput = (date: Date): string => {
  return date.toISOString().slice(0, 16);
};

const getPresetDates = (preset: string): { start: Date; end: Date } => {
  const end = new Date();
  const start = new Date();
  
  switch (preset) {
    case '7d':
      start.setDate(end.getDate() - 7);
      break;
    case '30d':
      start.setDate(end.getDate() - 30);
      break;
    case '90d':
      start.setDate(end.getDate() - 90);
      break;
    default:
      start.setDate(end.getDate() - 7);
  }
  
  return { start, end };
};

const formatFileSize = (bytes: number): string => {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
};

interface ExportModalProps {
  mapBounds?: BoundingBox;
  onExportStart?: () => void;
  onExportComplete?: (jobId: string) => void;
}

export function ExportModal({ mapBounds, onExportStart, onExportComplete }: ExportModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('configure');
  const [currentJob, setCurrentJob] = useState<ExportJob | null>(null);
  const [exportHistory, setExportHistory] = useState<ExportJob[]>([]);
  
  // Form state
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return formatDateForInput(date);
  });
  const [endDate, setEndDate] = useState<string>(() => formatDateForInput(new Date()));
  const [exportType, setExportType] = useState<'traffic_data' | 'chokepoints' | 'comprehensive'>('traffic_data');
  const [granularity, setGranularity] = useState<'hourly' | 'daily'>('hourly');
  const [useMapArea, setUseMapArea] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Polling for job status
  const pollJobStatus = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`/api/export-status/${jobId}`);
      if (!response.ok) throw new Error('Failed to fetch job status');
      
      const jobData: ExportJob = await response.json();
      setCurrentJob(jobData);
      
      if (jobData.status === 'completed') {
        onExportComplete?.(jobId);
        setActiveTab('download');
        // Add to history
        setExportHistory(prev => [jobData, ...prev.filter(job => job.job_id !== jobId)]);
      } else if (jobData.status === 'failed') {
        setActiveTab('configure');
      } else {
        // Continue polling
        setTimeout(() => pollJobStatus(jobId), 2000);
      }
    } catch (error) {
      console.error('Error polling job status:', error);
      setCurrentJob(prev => prev ? { ...prev, status: 'failed', message: 'Connection error' } : null);
    }
  }, [onExportComplete]);

  const handleSubmitExport = async () => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    onExportStart?.();
    
    try {
      const exportRequest: ExportRequest = {
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        export_type: exportType,
        granularity: granularity,
        ...(useMapArea && mapBounds ? { bbox: mapBounds } : {})
      };
      
      const response = await fetch('/api/export-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportRequest)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Export failed');
      }
      
      const result = await response.json();
      setCurrentJob({
        job_id: result.job_id,
        status: 'pending',
        progress: 0,
        message: result.message
      });
      
      setActiveTab('progress');
      pollJobStatus(result.job_id);
      
    } catch (error) {
      console.error('Export error:', error);
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePresetSelection = (preset: string) => {
    const { start, end } = getPresetDates(preset);
    setStartDate(formatDateForInput(start));
    setEndDate(formatDateForInput(end));
  };

  const handleDownload = async (jobId: string) => {
    try {
      const response = await fetch(`/api/download/${jobId}`);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `traffic_export_${jobId}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
      alert('Download failed. Please try again.');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Export Data
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Export Traffic Data
          </DialogTitle>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="configure">Configure</TabsTrigger>
            <TabsTrigger value="progress" disabled={!currentJob}>Progress</TabsTrigger>
            <TabsTrigger value="download" disabled={currentJob?.status !== 'completed'}>Download</TabsTrigger>
          </TabsList>
          
          {/* Configuration Tab */}
          <TabsContent value="configure" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Date Range
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2 mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePresetSelection('7d')}
                  >
                    Last 7 Days
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePresetSelection('30d')}
                  >
                    Last 30 Days
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePresetSelection('90d')}
                  >
                    Last 90 Days
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="start-date">Start Date</Label>
                    <input
                      id="start-date"
                      type="datetime-local"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <Label htmlFor="end-date">End Date</Label>
                    <input
                      id="end-date"
                      type="datetime-local"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Export Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Export Type</Label>
                  <Select value={exportType} onValueChange={(value) => setExportType(value as typeof exportType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="traffic_data">Traffic Data Only</SelectItem>
                      <SelectItem value="chokepoints">Chokepoints Analysis</SelectItem>
                      <SelectItem value="comprehensive">Comprehensive Export</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Data Granularity</Label>
                  <Select value={granularity} onValueChange={(value) => setGranularity(value as typeof granularity)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly Data</SelectItem>
                      <SelectItem value="daily">Daily Aggregates</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="use-map-area"
                    checked={useMapArea}
                    onChange={(e) => setUseMapArea(e.target.checked)}
                    disabled={!mapBounds}
                  />
                  <Label htmlFor="use-map-area" className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Limit to current map area
                  </Label>
                </div>
                
                {useMapArea && mapBounds && (
                  <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                    Area: {mapBounds.min_lat.toFixed(4)}, {mapBounds.min_lon.toFixed(4)} to{' '}
                    {mapBounds.max_lat.toFixed(4)}, {mapBounds.max_lon.toFixed(4)}
                  </div>
                )}
              </CardContent>
            </Card>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitExport} disabled={isSubmitting}>
                {isSubmitting ? 'Starting Export...' : 'Start Export'}
              </Button>
            </div>
          </TabsContent>
          
          {/* Progress Tab */}
          <TabsContent value="progress" className="space-y-4">
            {currentJob && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Export Progress
                    </span>
                    {currentJob.status === 'in_progress' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCurrentJob(null)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Status: {currentJob.status.replace('_', ' ').toUpperCase()}</span>
                      <span>{currentJob.progress}%</span>
                    </div>
                    <Progress value={currentJob.progress} className="w-full" />
                  </div>
                  
                  <div className="text-sm text-gray-600">
                    {currentJob.message}
                  </div>
                  
                  {currentJob.status === 'completed' && currentJob.file_size && (
                    <div className="bg-green-50 border border-green-200 rounded p-3">
                      <div className="text-green-800 text-sm">
                        Export completed successfully! File size: {formatFileSize(currentJob.file_size)}
                      </div>
                    </div>
                  )}
                  
                  {currentJob.status === 'failed' && (
                    <div className="bg-red-50 border border-red-200 rounded p-3">
                      <div className="text-red-800 text-sm">
                        Export failed. Please try again or contact support.
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
          
          {/* Download Tab */}
          <TabsContent value="download" className="space-y-4">
            {currentJob?.status === 'completed' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="w-4 h-4 text-green-600" />
                    Download Ready
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded p-4">
                    <p className="text-green-800 mb-2">Your export is ready for download!</p>
                    {currentJob.file_size && (
                      <p className="text-sm text-green-600">
                        File size: {formatFileSize(currentJob.file_size)}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>
                      Close
                    </Button>
                    <Button 
                      onClick={() => handleDownload(currentJob.job_id)}
                      className="flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download JSON
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}