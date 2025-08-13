'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw, Download, X } from 'lucide-react';

interface ServiceWorkerState {
  isSupported: boolean;
  isRegistered: boolean;
  isUpdateAvailable: boolean;
  isOnline: boolean;
  registration: ServiceWorkerRegistration | null;
}

export function ServiceWorkerProvider({ children }: { children: React.ReactNode }) {
  const [swState, setSwState] = useState<ServiceWorkerState>({
    isSupported: false,
    isRegistered: false,
    isUpdateAvailable: false,
    isOnline: true,
    registration: null
  });
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);

  useEffect(() => {
    // Check if service workers are supported
    if ('serviceWorker' in navigator) {
      setSwState(prev => ({ ...prev, isSupported: true }));
      registerServiceWorker();
    }

    // Set up online/offline detection
    const handleOnline = () => {
      setSwState(prev => ({ ...prev, isOnline: true }));
      setShowOfflineBanner(false);
    };
    
    const handleOffline = () => {
      setSwState(prev => ({ ...prev, isOnline: false }));
      setShowOfflineBanner(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set initial online state
    setSwState(prev => ({ ...prev, isOnline: navigator.onLine }));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      
      setSwState(prev => ({ 
        ...prev, 
        isRegistered: true,
        registration 
      }));

      console.log('Service Worker registered successfully');

      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setSwState(prev => ({ ...prev, isUpdateAvailable: true }));
              setShowUpdateBanner(true);
            }
          });
        }
      });

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        const { type, data } = event.data;
        
        switch (type) {
          case 'EXPORT_JOBS_SYNC':
            // Handle export jobs sync
            console.log('Export jobs synced:', data);
            break;
          default:
            console.log('Service Worker message:', event.data);
        }
      });

      // Check for immediate updates
      await registration.update();

    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  };

  const handleUpdate = async () => {
    if (swState.registration?.waiting) {
      // Tell service worker to skip waiting
      swState.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      
      // Reload page after service worker takes control
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }
  };

  const clearCaches = async () => {
    if (swState.registration) {
      const messageChannel = new MessageChannel();
      
      return new Promise((resolve, reject) => {
        messageChannel.port1.onmessage = (event) => {
          if (event.data.success) {
            resolve(event.data);
          } else {
            reject(event.data.error);
          }
        };

        swState.registration!.active?.postMessage(
          { type: 'CACHE_CLEAR' },
          [messageChannel.port2]
        );
      });
    }
  };

  const getCacheStatus = async () => {
    if (swState.registration) {
      const messageChannel = new MessageChannel();
      
      return new Promise((resolve) => {
        messageChannel.port1.onmessage = (event) => {
          resolve(event.data);
        };

        swState.registration!.active?.postMessage(
          { type: 'CACHE_STATUS' },
          [messageChannel.port2]
        );
      });
    }
  };

  return (
    <>
      {children}
      
      {/* Update Available Banner */}
      {showUpdateBanner && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-blue-600 text-white shadow-lg">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5" />
              <div>
                <div className="font-medium">Update Available</div>
                <div className="text-sm opacity-90">
                  A new version of Traffic Insight is ready
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleUpdate}
                className="bg-white text-blue-600 hover:bg-gray-100"
              >
                <Download className="w-4 h-4 mr-1" />
                Update
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUpdateBanner(false)}
                className="text-white hover:bg-blue-500"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Offline Banner */}
      {showOfflineBanner && (
        <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm">
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-amber-800">
                    You're offline
                  </div>
                  <div className="text-sm text-amber-600">
                    Some features may be limited
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowOfflineBanner(false)}
                  className="text-amber-600 hover:bg-amber-100"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

// Hook to use service worker functionality
export function useServiceWorker() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(setRegistration);
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const requestNotificationPermission = async () => {
    if ('Notification' in window && registration) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  };

  const showNotification = async (title: string, options?: NotificationOptions) => {
    if (registration && 'Notification' in window && Notification.permission === 'granted') {
      await registration.showNotification(title, options);
    }
  };

  const syncExportJobs = async () => {
    if (registration && 'sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        // @ts-ignore - sync is experimental
        await registration.sync.register('export-job-sync');
      } catch (error) {
        console.error('Background sync registration failed:', error);
      }
    }
  };

  return {
    registration,
    isOnline,
    requestNotificationPermission,
    showNotification,
    syncExportJobs
  };
}