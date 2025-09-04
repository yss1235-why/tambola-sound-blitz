// src/hooks/useGameTimer.ts
import { useState, useRef, useCallback, useEffect } from 'react';
import { gameTimerManager } from '@/services/GameTimerManager';

interface UseGameTimerProps {
  initialTime?: number;
  onTick?: (timeRemaining: number) => void;
  onNumberCall?: () => void;
  onGameComplete?: () => void;
  isPaused?: boolean;
  autoStart?: boolean;
  callInterval?: number;
}

interface GameTimerState {
  timeRemaining: number;
  isRunning: boolean;
  totalCalls: number;
}

export const useGameTimer = ({
  initialTime = 300,
  onTick,
  onNumberCall,
  onGameComplete,
  isPaused = false,
  autoStart = false,
  callInterval = 10
}: UseGameTimerProps) => {
  const [state, setState] = useState<GameTimerState>({
    timeRemaining: initialTime,
    isRunning: false,
    totalCalls: 0
  });

  const timerIdRef = useRef<string>(`game-timer-${Date.now()}`);
  const callTimerIdRef = useRef<string>(`call-timer-${Date.now()}`);
  const isPausedRef = useRef(isPaused);
  const operationInProgress = useRef(false);
  const lastCallTime = useRef<number>(0);

  // Update paused state ref
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Main timer callback for countdown
  const timerCallback = useCallback(() => {
    if (isPausedRef.current || operationInProgress.current) return;

    setState(prevState => {
      const newTime = Math.max(0, prevState.timeRemaining - 1);
      
      // Call onTick callback
      onTick?.(newTime);

      // Check for game completion
      if (newTime === 0) {
        onGameComplete?.();
        return { ...prevState, timeRemaining: 0, isRunning: false };
      }

      return { ...prevState, timeRemaining: newTime };
    });
  }, [onTick, onGameComplete]);

  // Number calling timer callback
  const callCallback = useCallback(() => {
    if (isPausedRef.current || operationInProgress.current) return;

    const now = Date.now();
    if (now - lastCallTime.current < callInterval * 1000) return;

    lastCallTime.current = now;
    
    setState(prevState => ({
      ...prevState,
      totalCalls: prevState.totalCalls + 1
    }));

    onNumberCall?.();
  }, [onNumberCall, callInterval]);

  // Start timer system
  const startTimer = useCallback(() => {
    if (operationInProgress.current) return;

    operationInProgress.current = true;
    console.log(`🎮 Starting game timer system`);

    // Register main countdown timer
    gameTimerManager.register(timerIdRef.current, timerCallback, 1000);
    
    // Register number calling timer
    if (onNumberCall) {
      gameTimerManager.register(callTimerIdRef.current, callCallback, callInterval * 1000);
    }

    setState(prevState => ({ ...prevState, isRunning: true }));
    operationInProgress.current = false;
  }, [timerCallback, callCallback, onNumberCall, callInterval]);

  // Stop timer system
  const stopTimer = useCallback(() => {
    if (operationInProgress.current) return;

    operationInProgress.current = true;
    console.log(`🛑 Stopping game timer system`);

    gameTimerManager.unregister(timerIdRef.current);
    gameTimerManager.unregister(callTimerIdRef.current);

    setState(prevState => ({ ...prevState, isRunning: false }));
    operationInProgress.current = false;
  }, []);

  // Pause timer system
  const pauseTimer = useCallback(() => {
    gameTimerManager.disableTimer(timerIdRef.current);
    gameTimerManager.disableTimer(callTimerIdRef.current);
    console.log(`⏸️ Paused game timer system`);
  }, []);

  // Resume timer system
  const resumeTimer = useCallback(() => {
    lastCallTime.current = Date.now(); // Reset call timing
    gameTimerManager.enableTimer(timerIdRef.current);
    gameTimerManager.enableTimer(callTimerIdRef.current);
    console.log(`▶️ Resumed game timer system`);
  }, []);

  // Reset timer
  const resetTimer = useCallback((newInitialTime?: number) => {
    const resetTime = newInitialTime ?? initialTime;
    setState({
      timeRemaining: resetTime,
      isRunning: false,
      totalCalls: 0
    });
    lastCallTime.current = 0;
  }, [initialTime]);

  // Auto-start if requested
  useEffect(() => {
    if (autoStart && !state.isRunning) {
      startTimer();
    }
  }, [autoStart, state.isRunning, startTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      gameTimerManager.unregister(timerIdRef.current);
      gameTimerManager.unregister(callTimerIdRef.current);
    };
  }, []);

  return {
    timeRemaining: state.timeRemaining,
    isRunning: state.isRunning,
    totalCalls: state.totalCalls,
    startTimer,
    stopTimer,
    pauseTimer,
    resumeTimer,
    resetTimer
  };
};
