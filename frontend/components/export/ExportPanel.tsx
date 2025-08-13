"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, FileText, Image, Database } from "lucide-react";

interface ExportPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedArea?: {
    bbox: [number, number, number, number];
    name?: string;
  };
}

export function ExportPanel({ isOpen, onClose, selectedArea }: ExportPanelProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Traffic Data
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {selectedArea && (
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Export Area</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  <div className="font-medium">{selectedArea.name || 'Custom Selection'}</div>
                  <div className="text-gray-600 text-xs mt-1">
                    {selectedArea.bbox[0].toFixed(4)}, {selectedArea.bbox[1].toFixed(4)} → {' '}
                    {selectedArea.bbox[2].toFixed(4)}, {selectedArea.bbox[3].toFixed(4)}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Card className="cursor-pointer hover:bg-gray-50 transition-colors">
              <CardContent className="p-4 text-center">
                <FileText className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                <div className="font-medium">CSV Export</div>
                <div className="text-sm text-gray-600">Traffic flow data</div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-gray-50 transition-colors">
              <CardContent className="p-4 text-center">
                <Database className="h-8 w-8 mx-auto mb-2 text-green-600" />
                <div className="font-medium">JSON Export</div>
                <div className="text-sm text-gray-600">Structured data</div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-gray-50 transition-colors">
              <CardContent className="p-4 text-center">
                <Image className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                <div className="font-medium">Map Image</div>
                <div className="text-sm text-gray-600">PNG screenshot</div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-gray-50 transition-colors">
              <CardContent className="p-4 text-center">
                <Download className="h-8 w-8 mx-auto mb-2 text-red-600" />
                <div className="font-medium">Full Report</div>
                <div className="text-sm text-gray-600">PDF with analytics</div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button>
              <Download className="h-4 w-4 mr-2" />
              Export Selected
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}