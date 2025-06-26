// src/components/GestureDetector.tsx
// Invisible overlay component for detecting admin gesture pattern

import React, { useEffect, useRef } from 'react';
import { useGesturePattern } from '@/hooks/useGesturePattern';
import { GestureConfig, DEFAULT_GESTURE_CONFIG } from '@/utils/gestureConfig';

interface GestureDetectorProps {
  // Callback when gesture pattern is completed
  onGestureComplete: () => void;
  
  // Optional custom configuration
  config?: GestureConfig;
  
  // Enable/disable the detector
  enabled?: boolean;
  
  // Optional CSS class for the overlay (for testing)
  className?: string;
}

export const GestureDetector: React.FC<GestureDetectorProps> = ({
  onGestureComplete,
  config = DEFAULT_GESTURE_CONFIG,
  enabled = true,
  className = ''
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  
  const {
    handleTouch,
    isActive,
    isInCooldown,
    currentStep,
    failedAttempts,
    resetGesture
  } = useGesturePattern(onGestureComplete, config);

  // Event handler for touch/mouse events
  const handleInteraction = (e: React.TouchEvent | React.MouseEvent) => {
    if (!enabled) return;
    
    // Prevent default to avoid any interference with normal interactions
    // but only for our specific gesture detection
    const nativeEvent = e.nativeEvent;
    handleTouch(nativeEvent);
  };

  // Add global event listeners for better coverage
  useEffect(() => {
    if (!enabled) return;

    const handleGlobalTouch = (e: TouchEvent) => {
      handleTouch(e);
    };

    const handleGlobalClick = (e: MouseEvent) => {
      handleTouch(e);
    };

    // Add listeners with passive option for better performance
    document.addEventListener('touchstart', handleGlobalTouch, { passive: true });
    document.addEventListener('click', handleGlobalClick, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleGlobalTouch);
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [handleTouch, enabled]);

  // Debug info (only in development/debug mode)
  useEffect(() => {
    if (config.debugMode && (isActive || isInCooldown || failedAttempts > 0)) {
      console.log('🎯 GestureDetector State:', {
        isActive,
        isInCooldown,
        currentStep,
        failedAttempts,
        pattern: config.pattern
      });
    }
  }, [config.debugMode, isActive, isInCooldown, currentStep, failedAttempts, config.pattern]);

  // Reset gesture on disable
  useEffect(() => {
    if (!enabled && isActive) {
      resetGesture();
    }
  }, [enabled, isActive, resetGesture]);

  // Don't render anything if disabled
  if (!enabled) {
    return null;
  }

  return (
    <>
      {/* Invisible overlay for gesture detection */}
      <div
        ref={overlayRef}
        className={`
          fixed inset-0 z-50 
          pointer-events-none 
          touch-action-none
          ${config.debugMode ? 'bg-red-500 bg-opacity-5' : ''}
          ${className}
        `}
        onTouchStart={handleInteraction}
        onClick={handleInteraction}
        style={{
          // Ensure it's truly invisible in production
          backgroundColor: config.debugMode ? 'rgba(255, 0, 0, 0.05)' : 'transparent',
          // Ensure it doesn't interfere with normal interactions
          pointerEvents: 'none'
        }}
        aria-hidden="true"
      />
      
      {/* Debug overlay showing zones (only in debug mode) */}
      {config.debugMode && (
        <div className="fixed inset-0 z-40 pointer-events-none">
          {/* Corner zones */}
          <div 
            className="absolute border-2 border-blue-400 bg-blue-100 bg-opacity-20"
            style={{
              top: 0,
              left: 0,
              width: `${config.zones.cornerSize}%`,
              height: `${config.zones.cornerSize}%`
            }}
          >
            <div className="p-1 text-xs font-bold text-blue-600">
              TOP-LEFT
              {config.pattern[0]?.zone === 'top-left' && (
                <div>({config.pattern[0].taps} taps)</div>
              )}
            </div>
          </div>
          
          <div 
            className="absolute border-2 border-blue-400 bg-blue-100 bg-opacity-20"
            style={{
              top: 0,
              right: 0,
              width: `${config.zones.cornerSize}%`,
              height: `${config.zones.cornerSize}%`
            }}
          >
            <div className="p-1 text-xs font-bold text-blue-600 text-right">
              TOP-RIGHT
            </div>
          </div>
          
          <div 
            className="absolute border-2 border-blue-400 bg-blue-100 bg-opacity-20"
            style={{
              bottom: 0,
              left: 0,
              width: `${config.zones.cornerSize}%`,
              height: `${config.zones.cornerSize}%`
            }}
          >
            <div className="p-1 text-xs font-bold text-blue-600">
              BOTTOM-LEFT
            </div>
          </div>
          
          <div 
            className="absolute border-2 border-blue-400 bg-blue-100 bg-opacity-20"
            style={{
              bottom: 0,
              right: 0,
              width: `${config.zones.cornerSize}%`,
              height: `${config.zones.cornerSize}%`
            }}
          >
            <div className="p-1 text-xs font-bold text-blue-600 text-right">
              BOTTOM-RIGHT
              {config.pattern[1]?.zone === 'bottom-right' && (
                <div>({config.pattern[1].taps} taps)</div>
              )}
            </div>
          </div>
          
          {/* Center zone */}
          <div 
            className="absolute border-2 border-green-400 bg-green-100 bg-opacity-20"
            style={{
              top: '50%',
              left: '50%',
              width: `${config.zones.centerSize}%`,
              height: `${config.zones.centerSize}%`,
              transform: 'translate(-50%, -50%)'
            }}
          >
            <div className="p-1 text-xs font-bold text-green-600 text-center">
              CENTER
              {config.pattern[2]?.zone === 'center' && (
                <div>({config.pattern[2].taps} tap)</div>
              )}
            </div>
          </div>
          
          {/* Status indicator */}
          <div className="absolute top-4 left-4 bg-white bg-opacity-90 p-2 rounded border">
            <div className="text-xs font-bold">
              Gesture Debug Mode
            </div>
            <div className="text-xs">
              Active: {isActive ? 'YES' : 'NO'}
            </div>
            <div className="text-xs">
              Step: {currentStep + 1}/{config.pattern.length}
            </div>
            <div className="text-xs">
              Failed: {failedAttempts}/{config.maxFailedAttempts}
            </div>
            {isInCooldown && (
              <div className="text-xs text-red-600 font-bold">
                COOLDOWN ACTIVE
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
