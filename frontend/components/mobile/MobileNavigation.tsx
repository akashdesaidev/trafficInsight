'use client';

import React, { useState } from 'react';
import { Menu, X, BarChart3, Download, Search, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface MobileNavigationProps {
  onAnalyticsToggle?: () => void;
  onExportToggle?: () => void;
  onSearchToggle?: () => void;
  onLocationToggle?: () => void;
  analyticsDisabled?: boolean;
}

export function MobileNavigation({
  onAnalyticsToggle,
  onExportToggle,
  onSearchToggle,
  onLocationToggle,
  analyticsDisabled = false
}: MobileNavigationProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const menuItems = [
    {
      label: 'Search Location',
      icon: Search,
      onClick: () => {
        onSearchToggle?.();
        setIsMenuOpen(false);
      },
      disabled: false
    },
    {
      label: 'My Location', 
      icon: MapPin,
      onClick: () => {
        onLocationToggle?.();
        setIsMenuOpen(false);
      },
      disabled: false
    },
    {
      label: 'Analytics',
      icon: BarChart3,
      onClick: () => {
        onAnalyticsToggle?.();
        setIsMenuOpen(false);
      },
      disabled: analyticsDisabled
    },
    {
      label: 'Export Data',
      icon: Download,
      onClick: () => {
        onExportToggle?.();
        setIsMenuOpen(false);
      },
      disabled: false
    }
  ];

  return (
    <>
      {/* Mobile Menu Button */}
      <div className="md:hidden absolute top-4 left-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="bg-white shadow-lg"
        >
          {isMenuOpen ? (
            <X className="h-4 w-4" />
          ) : (
            <Menu className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black bg-opacity-50">
          <div className="fixed top-0 left-0 w-80 max-w-[80vw] h-full bg-white shadow-xl">
            <div className="p-4">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Traffic Insight</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <nav className="space-y-2">
                {menuItems.map((item, index) => (
                  <Button
                    key={index}
                    variant="ghost"
                    className="w-full justify-start gap-3 h-12"
                    onClick={item.onClick}
                    disabled={item.disabled}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Button>
                ))}
              </nav>

              <div className="absolute bottom-4 left-4 right-4">
                <Card className="p-3">
                  <div className="text-sm text-gray-600">
                    <div className="font-medium">Traffic Insight Dashboard</div>
                    <div className="text-xs mt-1">Real-time traffic analytics</div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}