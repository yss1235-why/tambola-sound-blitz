// src/hooks/useGesturePattern.ts
// Hook for detecting gesture patterns

import { useState, useCallback, useRef, useEffect } from 'react';
import { GestureConfig, DEFAULT_GESTURE_CONFIG } from '@/utils/gestureConfig';

interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
}

interface GestureState {
  currentStep: number;
  currentZoneTaps: number;
  startTime: number;
  lastTapTime: number;
  isActive: boolean;
  failedAttempts: number;
  isInCooldown: boolean;
  cooldownEndTime: number;
}

type GestureZone = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'invalid';

export const useGesturePattern = (
  onPatternComplete: () => void,
  config: GestureConfig = DEFAULT_GESTURE_CONFIG
) => {
  const [gestureState, setGestureState] = useState<GestureState>({
    currentStep: 0,
    currentZoneTaps: 0,
    startTime: 0,
    lastTapTime: 0,
    isActive: false,
    failedAttempts: 0,
    isInCooldown: false,
    cooldownEndTime: 0
  });

  const cooldownTimerRef = useRef<NodeJS.Timeout>();

  // Helper function to determine which zone was touched
  const getTouchZone = useCallback((x: number, y: number, width: number, height: number): GestureZone => {
    const cornerW = (width * config.zones.cornerSize) / 100;
    const cornerH = (height * config.zones.cornerSize) / 100;
    const centerW = (width * config.zones.centerSize) / 100;
    const centerH = (height * config.zones.centerSize) / 100;
    
    const centerX = width / 2;
    const centerY = height / 2;

    // Check center zone first
    if (
      x >= centerX - centerW / 2 && x <= centerX + centerW / 2 &&
      y >= centerY - centerH / 2 && y <= centerY + centerH / 2
    ) {
      return 'center';
    }

    // Check corner zones
    if (x <= cornerW && y <= cornerH) return 'top-left';
    if (x >= width - cornerW && y <= cornerH) return 'top-right';
    if (x <= cornerW && y >= height - cornerH) return 'bottom-left';
    if (x >= width - cornerW && y >= height - cornerH) return 'bottom-right';

    return 'invalid';
  }, [config.zones]);

  // Reset gesture state
  const resetGesture = useCallback(() => {
    if (config.debugMode) {
      console.log('🎯 Gesture: Reset');
    }
    setGestureState(prev => ({
      ...prev,
      currentStep: 0,
      currentZoneTaps: 0,
      startTime: 0,
      lastTapTime: 0,
      isActive: false
    }));
  }, [config.debugMode]);

  // Handle failed attempt
  const handleFailedAttempt = useCallback(() => {
    setGestureState(prev => {
      const newFailedAttempts = prev.failedAttempts + 1;
      const shouldCooldown = newFailedAttempts >= config.maxFailedAttempts;
      
      if (config.debugMode) {
        console.log(`🎯 Gesture: Failed attempt ${newFailedAttempts}/${config.maxFailedAttempts}`);
        if (shouldCooldown) {
          console.log(`🎯 Gesture: Cooldown activated for ${config.cooldownPeriod}ms`);
        }
      }

      if (shouldCooldown) {
        const cooldownEnd = Date.now() + config.cooldownPeriod;
        
        // Set cooldown timer
        if (cooldownTimerRef.current) {
          clearTimeout(cooldownTimerRef.current);
        }
        cooldownTimerRef.current = setTimeout(() => {
          setGestureState(prev => ({
            ...prev,
            isInCooldown: false,
            cooldownEndTime: 0,
            failedAttempts: 0
          }));
          if (config.debugMode) {
            console.log('🎯 Gesture: Cooldown ended');
          }
        }, config.cooldownPeriod);

        return {
          ...prev,
          currentStep: 0,
          currentZoneTaps: 0,
          startTime: 0,
          lastTapTime: 0,
          isActive: false,
          failedAttempts: newFailedAttempts,
          isInCooldown: true,
          cooldownEndTime: cooldownEnd
        };
      }

      return {
        ...prev,
        currentStep: 0,
        currentZoneTaps: 0,
        startTime: 0,
        lastTapTime: 0,
        isActive: false,
        failedAttempts: newFailedAttempts
      };
    });
  }, [config.maxFailedAttempts, config.cooldownPeriod, config.debugMode]);

  // Handle touch events
  const handleTouch = useCallback((e: TouchEvent | MouseEvent) => {
    // Prevent if in cooldown
    if (gestureState.isInCooldown) {
      if (config.debugMode) {
        const remainingTime = Math.max(0, gestureState.cooldownEndTime - Date.now());
        console.log(`🎯 Gesture: In cooldown, ${Math.ceil(remainingTime / 1000)}s remaining`);
      }
      return;
    }

    const now = Date.now();
    let touchPoint: TouchPoint;

    // Handle both touch and mouse events
    if ('touches' in e && e.touches.length > 0) {
      const touch = e.touches[0];
      touchPoint = { x: touch.clientX, y: touch.clientY, timestamp: now };
    } else if ('clientX' in e) {
      touchPoint = { x: e.clientX, y: e.clientY, timestamp: now };
    } else {
      return;
    }

    const zone = getTouchZone(
      touchPoint.x,
      touchPoint.y,
      window.innerWidth,
      window.innerHeight
    );

    if (zone === 'invalid') {
      if (gestureState.isActive) {
        if (config.debugMode) {
          console.log('🎯 Gesture: Invalid zone touched, resetting');
        }
        handleFailedAttempt();
      }
      return;
    }

    const currentPattern = config.pattern[gestureState.currentStep];
    const expectedZone = currentPattern?.zone;
    const expectedTaps = currentPattern?.taps || 0;

    // Check if we're starting a new gesture
    if (!gestureState.isActive) {
      if (zone === expectedZone) {
        if (config.debugMode) {
          console.log(`🎯 Gesture: Started, step 0, zone ${zone}`);
        }
        setGestureState(prev => ({
          ...prev,
          currentStep: 0,
          currentZoneTaps: 1,
          startTime: now,
          lastTapTime: now,
          isActive: true
        }));
      }
      return;
    }

    // Check total time limit
    if (now - gestureState.startTime > config.totalTimeLimit) {
      if (config.debugMode) {
        console.log('🎯 Gesture: Total time limit exceeded');
      }
      handleFailedAttempt();
      return;
    }

    // Check if we're in the expected zone
    if (zone !== expectedZone) {
      if (config.debugMode) {
        console.log(`🎯 Gesture: Wrong zone ${zone}, expected ${expectedZone}`);
      }
      handleFailedAttempt();
      return;
    }

    // Check tap timing within zone
    if (now - gestureState.lastTapTime > config.tapTimeLimit) {
      if (config.debugMode) {
        console.log('🎯 Gesture: Tap timing too slow');
      }
      handleFailedAttempt();
      return;
    }

    const newTapCount = gestureState.currentZoneTaps + 1;
    
    if (config.debugMode) {
      console.log(`🎯 Gesture: Step ${gestureState.currentStep}, tap ${newTapCount}/${expectedTaps} in ${zone}`);
    }

    // Check if we completed the current step
    if (newTapCount === expectedTaps) {
      const nextStep = gestureState.currentStep + 1;
      
      // Check if we completed the entire pattern
      if (nextStep >= config.pattern.length) {
        if (config.debugMode) {
          console.log('🎯 Gesture: Pattern completed! 🎉');
        }
        resetGesture();
        onPatternComplete();
        return;
      }

      // Move to next step
      if (config.debugMode) {
        console.log(`🎯 Gesture: Step ${gestureState.currentStep} completed, moving to step ${nextStep}`);
      }
      setGestureState(prev => ({
        ...prev,
        currentStep: nextStep,
        currentZoneTaps: 0,
        lastTapTime: now
      }));
    } else if (newTapCount < expectedTaps) {
      // Continue with current step
      setGestureState(prev => ({
        ...prev,
        currentZoneTaps: newTapCount,
        lastTapTime: now
      }));
    } else {
      // Too many taps in current zone
      if (config.debugMode) {
        console.log('🎯 Gesture: Too many taps in zone');
      }
      handleFailedAttempt();
    }
  }, [
    gestureState,
    config,
    getTouchZone,
    resetGesture,
    handleFailedAttempt,
    onPatternComplete
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, []);

  return {
    handleTouch,
    isActive: gestureState.isActive,
    isInCooldown: gestureState.isInCooldown,
    currentStep: gestureState.currentStep,
    failedAttempts: gestureState.failedAttempts,
    resetGesture
  };
};
