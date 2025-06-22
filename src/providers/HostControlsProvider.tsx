// src/providers/HostControlsProvider.tsx - Actions-only provider for host game controls
import React, { createContext, useContext, useCallback, useRef, useEffect } from 'react';
import { firebaseService } from '@/services/firebase';
import { useGameData } from './GameDataProvider';

interface HostControlsContextValue {
  // Game flow controls
  startGame: () => Promise<void>;
  pauseGame: () => Promise<void>;
  resumeGame: () => Promise<void>;
  endGame: () => Promise<void>;
  
  // Configuration
  updateCallInterval: (seconds: number) => void;
  
  // Status
  isProcessing: boolean;
}

const HostControlsContext = createContext<HostControlsContextValue | null>(null);

interface HostControlsProviderProps {
  children: React.ReactNode;
  userId: string;
}

/**
 * HostControlsProvider - Handles all host actions and automatic game management
 * Separated from data concerns for cleaner architecture
 */
export const HostControlsProvider: React.FC<HostControlsProviderProps> = ({
  children,
  userId
}) => {
  const { gameData } = useGameData();
  
  // Internal state for processing and timers
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [callInterval, setCallInterval] = React.useState(5);
  
  // 🛡️ NEW: Pause state lock mechanism
  const [pauseRequested, setPauseRequested] = React.useState(false);
  
  // Refs for stable timer management
  const gameActiveRef = useRef(false);
  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // 🛡️ NEW: Ref for immediate access in timer callbacks (eliminates race condition)
  const pauseRequestedRef = useRef(false);
  const gameControllerRef = useRef<AbortController | null>(null);

  // ✅ AUTOMATIC: Smart state transitions with auto-restart
  useEffect(() => {
    if (gameData) {
      const newActiveState = gameData.gameState.isActive && !gameData.gameState.gameOver;
      const wasActive = gameActiveRef.current;
      
      // Update the ref to new state
      gameActiveRef.current = newActiveState;
      console.log(`🔄 State transition: ${wasActive} → ${newActiveState}`);
      
      // 🚀 AUTOMATIC RESTART: When database changes from inactive to active
      if (!wasActive && newActiveState && !pauseRequested) {
        console.log(`🚀 Auto-restarting loop due to database state change`);
        startNumberCallingLoop();
      }
      
      // Clear pause state when game ends (essential logic)
      if (gameData.gameState.gameOver) {
        setPauseRequested(false);
        pauseRequestedRef.current = false;
        console.log(`🏁 Game ended - clearing pause state`);
      }
    }
  }, [gameData?.gameState.isActive, gameData?.gameState.gameOver, pauseRequested, startNumberCallingLoop]);

  // Clear all timers on unmount or game end
  const clearAllTimers = useCallback(() => {
    if (gameTimerRef.current) {
      clearTimeout(gameTimerRef.current);
      gameTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    // Abort any running timer loop
    if (gameControllerRef.current) {
      gameControllerRef.current.abort();
      gameControllerRef.current = null;
    }
    gameActiveRef.current = false;
  }, []);

  // Automatic number calling loop
  const startNumberCallingLoop = useCallback(() => {
    if (!gameData) return;
    
    // Create new AbortController for this timer loop
    gameControllerRef.current = new AbortController();
    const { signal } = gameControllerRef.current;
    
    const scheduleNextCall = () => {
      // Check abort signal first, then existing checks
      if (signal.aborted || !gameActiveRef.current || pauseRequestedRef.current) return;
      
      gameTimerRef.current = setTimeout(async () => {
        // 🔧 CRITICAL: Check abort signal FIRST in callback
        if (signal.aborted) {
          console.log(`🚫 Timer callback aborted, stopping`);
          return;
        }
        
        // Then existing checks
        if (!gameActiveRef.current || pauseRequestedRef.current || !gameData) return;
        
        try {
          console.log(`🎯 Auto-calling next number for game ${gameData.gameId}`);
          const result = await firebaseService.callNextNumber(gameData.gameId);
          
          // Check abort signal again after async operation
          if (signal.aborted) {
            console.log(`🚫 Timer loop aborted during async call, stopping`);
            return;
          }
          
          if (result.success && !result.gameEnded && gameActiveRef.current && !pauseRequestedRef.current) {
            scheduleNextCall(); // Continue with same controller
          } else {
            clearAllTimers();
          }
        } catch (error) {
          console.error('❌ Auto-call error:', error);
          
          // Check abort signal before retrying
          if (!signal.aborted && gameActiveRef.current && !pauseRequestedRef.current) {
            scheduleNextCall();
          }
        }
      }, callInterval * 1000);
    };

    scheduleNextCall();
  }, [gameData, callInterval, clearAllTimers]);

  // Start game with countdown
  const startGame = useCallback(async () => {
    if (!gameData || isProcessing) return;
    
    setIsProcessing(true);
    try {
      console.log(`🎮 Starting game with countdown: ${gameData.gameId}`);
      
      // 🛡️ Clear pause state when starting
      setPauseRequested(false);
      pauseRequestedRef.current = false;
      
      // Clear any existing timers
      clearAllTimers();
      
      // Start 10-second countdown
      await firebaseService.updateGameState(gameData.gameId, {
        isCountdown: true,
        countdownTime: 10,
        isActive: false
      });

      let timeLeft = 10;
      countdownTimerRef.current = setInterval(async () => {
        timeLeft--;
        
        if (timeLeft > 0) {
          await firebaseService.updateGameState(gameData.gameId, {
            countdownTime: timeLeft
          });
        } else {
          // Countdown finished - activate game
          clearInterval(countdownTimerRef.current!);
          countdownTimerRef.current = null;
          
          await firebaseService.updateGameState(gameData.gameId, {
            isActive: true,
            isCountdown: false,
            countdownTime: 0
          });
          
          gameActiveRef.current = true;
          startNumberCallingLoop();
        }
      }, 1000);
      
    } catch (error: any) {
      console.error('❌ Start game error:', error);
      throw new Error(error.message || 'Failed to start game');
    } finally {
      setIsProcessing(false);
    }
  }, [gameData, isProcessing, clearAllTimers, startNumberCallingLoop]);

  // ✅ SIMPLIFIED: Atomic pause operation
  const pauseGame = useCallback(async () => {
    if (!gameData || isProcessing) return;
    
    setIsProcessing(true);
    try {
      console.log(`⏸️ Pausing game: ${gameData.gameId}`);
      
      // 🔧 STEP 1: Immediately stop all timers (prevents new scheduling)
      if (gameControllerRef.current) {
        gameControllerRef.current.abort();
        gameControllerRef.current = null;
        console.log(`🚫 Timer loop aborted`);
      }
      clearAllTimers();
      
      // 🔧 STEP 2: Set temporary pause lock
      setPauseRequested(true);
      pauseRequestedRef.current = true;
      
      // 🔧 STEP 3: Update database (useEffect will sync gameActiveRef automatically)
      await firebaseService.updateGameState(gameData.gameId, {
        isActive: false,
        isCountdown: false
      });
      
      console.log(`✅ Game paused successfully: ${gameData.gameId}`);
      
    } catch (error: any) {
      console.error('❌ Pause game error:', error);
      
      // 🔧 ROLLBACK: Clear pause state on error
      setPauseRequested(false);
      pauseRequestedRef.current = false;
      
      throw new Error(error.message || 'Failed to pause game');
    } finally {
      setIsProcessing(false);
    }
  }, [gameData, isProcessing, clearAllTimers]);

  // ✅ AUTOMATIC: Resume with automatic loop restart via useEffect
  const resumeGame = useCallback(async () => {
    if (!gameData || isProcessing) return;
    
    setIsProcessing(true);
    try {
      console.log(`▶️ Resuming game: ${gameData.gameId}`);
      
      // 🔧 STEP 1: Clear any existing timers first
      if (gameControllerRef.current) {
        gameControllerRef.current.abort();
        gameControllerRef.current = null;
      }
      clearAllTimers();
      
      // 🔧 STEP 2: Clear pause state
      setPauseRequested(false);
      pauseRequestedRef.current = false;
      
      // 🔧 STEP 3: Update database (useEffect will auto-restart the loop)
      await firebaseService.updateGameState(gameData.gameId, {
        isActive: true,
        isCountdown: false
      });
      
      // 🚀 NO MANUAL RESTART: useEffect will detect state change and auto-restart
      console.log(`✅ Game resumed - useEffect will auto-restart loop`);
      
    } catch (error: any) {
      console.error('❌ Resume game error:', error);
      throw new Error(error.message || 'Failed to resume game');
    } finally {
      setIsProcessing(false);
    }
  }, [gameData, isProcessing, clearAllTimers]);

  // End game
  const endGame = useCallback(async () => {
    if (!gameData || isProcessing) return;
    
    setIsProcessing(true);
    try {
      console.log(`🏁 Ending game: ${gameData.gameId}`);
      
      // Clear pause state and stop timers
      setPauseRequested(false);
      pauseRequestedRef.current = false;
      clearAllTimers();
      
      await firebaseService.updateGameState(gameData.gameId, {
        isActive: false,
        isCountdown: false,
        gameOver: true
      });
      
      console.log(`✅ Game ended successfully: ${gameData.gameId}`);
      
    } catch (error: any) {
      console.error('❌ End game error:', error);
      throw new Error(error.message || 'Failed to end game');
    } finally {
      setIsProcessing(false);
    }
  }, [gameData, isProcessing, clearAllTimers]);

  // Update call interval
  const updateCallInterval = useCallback((seconds: number) => {
    setCallInterval(seconds);
    console.log(`⏰ Call interval updated to ${seconds} seconds`);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  const value: HostControlsContextValue = {
    startGame,
    pauseGame,
    resumeGame,
    endGame,
    updateCallInterval,
    isProcessing
  };

  return (
    <HostControlsContext.Provider value={value}>
      {children}
    </HostControlsContext.Provider>
  );
};

export const useHostControls = () => {
  const context = useContext(HostControlsContext);
  if (!context) {
    throw new Error('useHostControls must be used within a HostControlsProvider');
  }
  return context;
};
