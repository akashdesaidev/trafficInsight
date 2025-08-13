'use client';

import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface MobileLayoutProps {
  children: React.ReactNode;
  bottomPanel?: React.ReactNode;
  bottomPanelTitle?: string;
  bottomPanelExpanded?: boolean;
  onBottomPanelToggle?: (expanded: boolean) => void;
}

export function MobileLayout({
  children,
  bottomPanel,
  bottomPanelTitle = "Panel",
  bottomPanelExpanded = false,
  onBottomPanelToggle
}: MobileLayoutProps) {
  const [isExpanded, setIsExpanded] = useState(bottomPanelExpanded);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    setIsExpanded(bottomPanelExpanded);
  }, [bottomPanelExpanded]);

  const handleToggle = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    onBottomPanelToggle?.(newState);
  };

  if (!isMobile) {
    // Desktop layout - return children as-is
    return <>{children}</>;
  }

  return (
    <div className="relative h-screen overflow-hidden">
      {/* Main Content Area */}
      <div 
        className={`w-full transition-all duration-300 ${
          bottomPanel && isExpanded 
            ? 'h-1/2' 
            : bottomPanel 
            ? 'h-[calc(100%-120px)]' 
            : 'h-full'
        }`}
      >
        {children}
      </div>

      {/* Bottom Panel for Mobile */}
      {bottomPanel && (
        <div 
          className={`absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg transition-all duration-300 ${
            isExpanded ? 'h-1/2' : 'h-32'
          }`}
        >
          {/* Panel Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="font-medium text-sm">{bottomPanelTitle}</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggle}
              className="h-8 w-8 p-0"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Panel Content */}
          <div className={`p-4 overflow-y-auto ${isExpanded ? 'h-[calc(100%-60px)]' : 'h-16'}`}>
            {bottomPanel}
          </div>
        </div>
      )}
    </div>
  );
}

// Hook to detect mobile device
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

// Hook to detect touch device
export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  return isTouch;
}