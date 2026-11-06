'use client';

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';
export type ScreenOrientation = 'portrait' | 'landscape';
export type ScreenSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface DeviceInfo {
  deviceType: DeviceType;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouchDevice: boolean;
  orientation: ScreenOrientation;
  screenSize: ScreenSize;
  width: number;
  height: number;
}

const DeviceContext = createContext<DeviceInfo>({
  deviceType: 'desktop',
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  isTouchDevice: false,
  orientation: 'landscape',
  screenSize: 'lg',
  width: 1200,
  height: 800,
});

export const DeviceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [windowSize, setWindowSize] = useState<{ width: number; height: number }>(() => {
    if (typeof window !== 'undefined') {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    return { width: 1200, height: 800 };
  });

  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setWindowSize({ width: w, height: h });
      setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);

      // Auto-set HTML root attributes for device targeting in CSS
      const device: DeviceType = w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
      const orient: ScreenOrientation = w < h ? 'portrait' : 'landscape';
      
      document.documentElement.setAttribute('data-device', device);
      document.documentElement.setAttribute('data-orientation', orient);
      document.documentElement.setAttribute('data-touch', ('ontouchstart' in window || navigator.maxTouchPoints > 0) ? 'true' : 'false');
    };

    handleResize();

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', handleResize, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const deviceInfo = useMemo<DeviceInfo>(() => {
    const { width, height } = windowSize;
    const isMobile = width < 768;
    const isTablet = width >= 768 && width < 1024;
    const isDesktop = width >= 1024;
    const deviceType: DeviceType = isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop';
    const orientation: ScreenOrientation = width < height ? 'portrait' : 'landscape';

    let screenSize: ScreenSize = 'md';
    if (width < 640) screenSize = 'xs';
    else if (width < 768) screenSize = 'sm';
    else if (width < 1024) screenSize = 'md';
    else if (width < 1280) screenSize = 'lg';
    else if (width < 1536) screenSize = 'xl';
    else screenSize = '2xl';

    return {
      deviceType,
      isMobile,
      isTablet,
      isDesktop,
      isTouchDevice,
      orientation,
      screenSize,
      width,
      height,
    };
  }, [windowSize, isTouchDevice]);

  return <DeviceContext.Provider value={deviceInfo}>{children}</DeviceContext.Provider>;
};

export function useDevice(): DeviceInfo {
  return useContext(DeviceContext);
}
