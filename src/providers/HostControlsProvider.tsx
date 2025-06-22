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
  
  // 🔧 CRITICAL: Request ID pattern for reliable cancellation
  const currentRequestIdRef = useRef<string | null>(null);

  // 🛡️ ENHANCED: Update game active ref when game state changes, but respect manual pause
  useEffect(() => {
    if (gameData) {
      const shouldBeActive = gameData.gameState.isActive && !gameData.gameState.gameOver;
      
      // Only sync from database if we're not in a manual pause state
      if (!pauseRequested) {
        gameActiveRef.current = shouldBeActive;
        console.log(`🔄 Syncing gameActiveRef from database: ${shouldBeActive}`);
      } else {
        console.log(`🛡️ Manual pause active - ignoring database sync`);
      }
      
      // If game is actually ended in database, clear pause request
      if (gameData.gameState.gameOver) {
        setPauseRequested(false);
        pauseRequestedRef.current = false;
        gameActiveRef.current = false;
        currentRequestIdRef.current = null;
        console.log(`🏁 Game ended - clearing pause state`);
      }
    }
  }, [gameData?.gameState.isActive, gameData?.gameState.gameOver, pauseRequested]);

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
    // Invalidate current request
    currentRequestIdRef.current = null;
    gameActiveRef.current = false;
  }, []);

  // 🔧 CRITICAL: Generate unique request ID for cancellation
  const generateRequestId = () => {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Automatic number calling loop with request ID validation
  const startNumberCallingLoop = useCallback(() => {
    if (!gameData) return;
    
    // Generate unique request ID for this timer loop
    const requestId = generateRequestId();
    currentRequestIdRef.current = requestId;
    console.log(`🆔 Starting timer loop with request ID: ${requestId}`);
    
    const scheduleNextCall = () => {
      // Check if this request is still valid
      if (currentRequestIdRef.current !== requestId) {
        console.log(`🚫 Request ${requestId} invalidated, stopping timer loop`);
        return;
      }
      
      // Existing checks
      if (!gameActiveRef.current || pauseRequestedRef.current) {
        console.log(`🚫 Game inactive or paused, stopping timer loop`);
        return;
      }
      
      gameTimerRef.current = setTimeout(async () => {
        // 🔧 CRITICAL: Check request ID FIRST - before any async operations
        if (currentRequestIdRef.current !== requestId) {
          console.log(`🚫 Request ${requestId} invalidated in callback, aborting`);
          return;
        }
        
        // Then existing checks
        if (!gameActiveRef.current || pauseRequestedRef.current || !gameData) {
          console.log(`🚫 Game state changed, aborting number call`);
          return;
        }
        
        try {
          console.log(`🎯 Auto-calling next number for game ${gameData.gameId} (req: ${requestId})`);
          
          // Final check before Firebase call
          if (currentRequestIdRef.current !== requestId) {
            console.log(`🚫 Request ${requestId} invalidated before Firebase call, aborting`);
            return;
          }
          
          const result = await firebaseService.callNextNumber(gameData.gameId);
          
          // Check request ID again after async operation
          if (currentRequestIdRef.current !== requestId) {
            console.log(`🚫 Request ${requestId} invalidated after Firebase call, stopping`);
            return;
          }
          
          if (result.success && !result.gameEnded && gameActiveRef.current && !pauseRequestedRef.current) {
            scheduleNextCall(); // Continue with same request ID
          } else {
            clearAllTimers();
          }
        } catch (error) {
          console.error('❌ Auto-call error:', error);
          
          // Check request ID before retrying
          if (currentRequestIdRef.current === requestId && gameActiveRef.current && !pauseRequestedRef.current) {
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
      
      // Clear any existing timers and requests
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

  // 🛡️ ENHANCED: Pause game with immediate request invalidation
  const pauseGame = useCallback(async () => {
    if (!gameData || isProcessing) return;
    
    setIsProcessing(true);
    try {
      console.log(`⏸️ Pausing game: ${gameData.gameId}`);
      
      // 🔧 CRITICAL: Invalidate current request FIRST - this stops all pending operations
      const oldRequestId = currentRequestIdRef.current;
      currentRequestIdRef.current = null;
      console.log(`🚫 Request invalidated: ${oldRequestId} -> null`);
      
      // Set pause state immediately
      setPauseRequested(true);
      pauseRequestedRef.current = true;
      gameActiveRef.current = false;
      
      // Clear existing timers
      clearAllTimers();
      
      // Small delay to ensure any in-flight callbacks see the invalidated request
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Update database
      await firebaseService.updateGameState(gameData.gameId, {
        isActive: false,
        isCountdown: false
      });
      
      console.log(`✅ Game paused successfully: ${gameData.gameId}`);
      
    } catch (error: any) {
      console.error('❌ Pause game error:', error);
      
      // 🛡️ ROLLBACK: If database update fails, rollback the pause state
      console.log(`🔄 Rolling back pause state due to error`);
      setPauseRequested(false);
      pauseRequestedRef.current = false;
      
      // Try to restart the loop if game was actually active
      if (gameData.gameState.isActive && !gameData.gameState.gameOver) {
        gameActiveRef.current = true;
        startNumberCallingLoop();
      }
      
      throw new Error(error.message || 'Failed to pause game');
    } finally {
      setIsProcessing(false);
    }
  }, [gameData, isProcessing, clearAllTimers, startNumberCallingLoop]);

  // 🛡️ ENHANCED: Resume game
  const resumeGame = useCallback(async () => {
    if (!gameData || isProcessing) return;
    
    setIsProcessing(true);
    try {
      console.log(`▶️ Resuming game: ${gameData.gameId}`);
      
      // 🛡️ STEP 1: Update database first
      await firebaseService.updateGameState(gameData.gameId, {
        isActive: true,
        isCountdown: false
      });
      
      // Invalidate any old requests
      currentRequestIdRef.current = null;
      console.log(`🔄 Cleared request ID for resume`);

      // 🛡️ STEP 2: Clear pause lock and activate locally
      setPauseRequested(false);
      pauseRequestedRef.current = false;
      gameActiveRef.current = true;
      
      // 🛡️ STEP 3: Restart the calling loop (will generate new request ID)
      startNumberCallingLoop();
      
      console.log(`✅ Game resumed successfully: ${gameData.gameId}`);
      
    } catch (error: any) {
      console.error('❌ Resume game error:', error);
      throw new Error(error.message || 'Failed to resume game');
    } finally {
      setIsProcessing(false);
    }
  }, [gameData, isProcessing, startNumberCallingLoop]);

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
