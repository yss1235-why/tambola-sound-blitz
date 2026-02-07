// src/components/GestureDetector.tsx
// Invisible component for admin gesture detection (no visual debug overlays).

import React, { useEffect } from 'react';
import { useGesturePattern } from '@/hooks/useGesturePattern';
import { GestureConfig, DEFAULT_GESTURE_CONFIG } from '@/utils/gestureConfig';

interface GestureDetectorProps {
  onGestureComplete: () => void;
  config?: GestureConfig;
  enabled?: boolean;
}

export const GestureDetector: React.FC<GestureDetectorProps> = ({
  onGestureComplete,
  config = DEFAULT_GESTURE_CONFIG,
  enabled = true,
}) => {
  const {
    handleTouch,
    isActive,
    resetGesture,
  } = useGesturePattern(onGestureComplete, config);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleGlobalTouch = (e: TouchEvent) => {
      handleTouch(e);
    };

    const handleGlobalClick = (e: MouseEvent) => {
      handleTouch(e);
    };

    document.addEventListener('touchstart', handleGlobalTouch, { passive: true });
    document.addEventListener('click', handleGlobalClick, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleGlobalTouch);
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [handleTouch, enabled]);

  useEffect(() => {
    if (!enabled && isActive) {
      resetGesture();
    }
  }, [enabled, isActive, resetGesture]);

  return null;
};
