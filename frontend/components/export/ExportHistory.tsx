'use client';

import React, { useState, useEffect } from 'react';
import { Download, Clock, CheckCircle, XCircle, FileText, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ExportJob {
  job_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  message: string;
  download_url?: string;
  file_size?: number;
  export_type?: string;
  created_at?: string;
}

// Utility functions
const formatFileSize = (bytes: number): string => {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleString();
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-600" />;
    case 'in_progress':
      return <Clock className="w-4 h-4 text-blue-600" />;
    default:
      return <Clock className="w-4 h-4 text-gray-600" />;
  }
};

const getStatusColor = (status: string): 'default' | 'secondary' | 'destructive' => {
  switch (status) {
    case 'completed':
      return 'default';
    case 'failed':
      return 'destructive';
    case 'in_progress':
    case 'pending':
      return 'secondary';
    default:
      return 'secondary';
  }
};

interface ExportHistoryProps {
  onDownload?: (jobId: string) => void;
  onDelete?: (jobId: string) => void;
}

export function ExportHistory({ onDownload, onDelete }: ExportHistoryProps) {
  const [exports, setExports] = useState<ExportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // This would normally fetch from a backend endpoint
  // For now, using localStorage as a mock
  useEffect(() => {
    loadExportHistory();
  }, []);

  const loadExportHistory = () => {
    try {
      setLoading(true);
      // In a real implementation, this would be an API call
      // For now, simulate with localStorage
      const savedExports = localStorage.getItem('export_history');
      if (savedExports) {
        setExports(JSON.parse(savedExports));
      }
    } catch (err) {
      setError('Failed to load export history');
      console.error('Error loading export history:', err);
    } finally {
      setLoading(false);
    }
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
      
      onDownload?.(jobId);
    } catch (error) {
      console.error('Download error:', error);
      alert('Download failed. The file may have expired or been removed.');
    }
  };

  const handleDelete = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this export?')) {
      return;
    }

    try {
      const response = await fetch(`/api/export/${jobId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Delete failed');
      
      // Remove from local state
      setExports(prev => prev.filter(exp => exp.job_id !== jobId));
      
      // Update localStorage
      const updatedExports = exports.filter(exp => exp.job_id !== jobId);
      localStorage.setItem('export_history', JSON.stringify(updatedExports));
      
      onDelete?.(jobId);
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete export. Please try again.');
    }
  };

  const addToHistory = (exportJob: ExportJob) => {
    setExports(prev => {
      const updated = [exportJob, ...prev.filter(job => job.job_id !== exportJob.job_id)];
      localStorage.setItem('export_history', JSON.stringify(updated));
      return updated;
    });
  };

  // Expose method to parent components
  React.useImperativeHandle(
    React.useRef({ addToHistory }),
    () => ({ addToHistory })
  );

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Export History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <div className="text-gray-500">Loading export history...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Export History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-2" />
            <div className="text-red-600">{error}</div>
            <Button
              variant="outline"
              onClick={loadExportHistory}
              className="mt-2"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Export History ({exports.length})
          </span>
          {exports.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={loadExportHistory}
            >
              Refresh
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {exports.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <div className="text-gray-500">No exports yet</div>
            <div className="text-sm text-gray-400 mt-1">
              Your export history will appear here
            </div>
          </div>
        ) : (
          <ScrollArea className="h-96">
            <div className="space-y-4">
              {exports.map((exportJob) => (
                <Card key={exportJob.job_id} className="border border-gray-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(exportJob.status)}
                        <span className="font-medium text-sm">
                          Export {exportJob.job_id.slice(0, 8)}...
                        </span>
                        <Badge variant={getStatusColor(exportJob.status)}>
                          {exportJob.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        {exportJob.status === 'completed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(exportJob.job_id)}
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(exportJob.job_id)}
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-600 space-y-1">
                      {exportJob.export_type && (
                        <div>Type: {exportJob.export_type.replace('_', ' ')}</div>
                      )}
                      {exportJob.file_size && (
                        <div>Size: {formatFileSize(exportJob.file_size)}</div>
                      )}
                      {exportJob.created_at && (
                        <div>Created: {formatDate(exportJob.created_at)}</div>
                      )}
                      <div className="truncate">Status: {exportJob.message}</div>
                    </div>
                    
                    {exportJob.status === 'in_progress' && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Progress</span>
                          <span>{exportJob.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${exportJob.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}